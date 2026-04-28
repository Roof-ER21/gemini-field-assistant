/**
 * Susan 21 GroupMe Bot — webhook endpoint + reply posting.
 *
 * GroupMe POSTs every Sales Team message here. We:
 *   1. Skip messages from the bot itself (prevents loops)
 *   2. Apply conservative reply filter: text contains "susan" (case-insensitive)
 *      OR message is a reply to one of Susan's prior posts
 *   3. Rate-limit: 15 replies/hr, 100/day
 *   4. Auto-inject knowledge_documents hits + call Claude Haiku with Susan's voice
 *   5. POST reply via GroupMe /bots/post
 *
 * The webhook is idempotent — GroupMe retries on 5xx so we ACK fast with 200.
 * Heavy work is fire-and-forget.
 *
 * Env vars required:
 *   GROUPME_SUSAN_BOT_ID     — bot id for /bots/post
 *   GROUPME_SUSAN_GROUP_ID   — (optional) for sanity check
 *   ANTHROPIC_API_KEY        — for reply synthesis
 */
import { Router } from 'express';
import { getMrmsHailAtPoint, getRecentMrmsHailAtPoint } from '../services/historicalMrmsService.js';
import { emailService } from '../services/emailService.js';
// ─── Config ──────────────────────────────────────────────────────────────────
const BOT_ID = process.env.GROUPME_SUSAN_BOT_ID || '';
const SALES_GROUP_ID = process.env.GROUPME_SUSAN_GROUP_ID || '93177620';
// Private test group (Ahmed + Reese + Susan only). Optional — when set,
// the webhook also responds to messages from this group, posting back
// via TEST_BOT_ID. Lets the team iterate on Susan's answers without
// spamming the live Sales Team chat. If either var is unset the test
// group is ignored entirely.
const TEST_GROUP_ID = process.env.GROUPME_TEST_GROUP_ID || '';
const TEST_BOT_ID = process.env.GROUPME_TEST_BOT_ID || '';
// Helper: which bot id to post with based on which group the inbound
// message came from. Falls back to the Sales-Team bot if no match — the
// post will 404 if the bot_id doesn't belong to that group, which is the
// desired fail-loud behavior.
function botIdForGroup(groupId) {
    if (TEST_GROUP_ID && TEST_BOT_ID && String(groupId) === TEST_GROUP_ID)
        return TEST_BOT_ID;
    return BOT_ID;
}
const MAX_REPLIES_PER_HOUR = 15;
const MAX_REPLIES_PER_DAY = 100;
// In-memory state. For a single-instance deploy this is fine; if we scale out
// we should move to Redis / Postgres. Given Susan is a single Railway service,
// memory is acceptable and auto-clears on restart.
const seenMessageIds = new Set(); // dedup: ids we've already processed
const susanOwnMessageIds = new Set(); // our own reply msgs (track replies-to-susan)
const repliedAt = []; // timestamps of our replies for rate-limiting
let teamRosterCache = null;
const TEAM_ROSTER_TTL_MS = 60 * 60 * 1000; // 1 hour
async function getTeamRoster() {
    if (teamRosterCache && Date.now() - teamRosterCache.lastFetch < TEAM_ROSTER_TTL_MS) {
        return teamRosterCache;
    }
    const token = process.env.GROUPME_TOKEN || (await (async () => {
        try {
            const { readFileSync } = await import('fs');
            const { homedir } = await import('os');
            return readFileSync(`${homedir()}/.groupme-token`, 'utf-8').trim();
        }
        catch {
            return '';
        }
    })());
    if (!token)
        return teamRosterCache; // serve stale rather than nothing
    try {
        const r = await fetch(`https://api.groupme.com/v3/groups/${SALES_GROUP_ID}?token=${token}`);
        if (!r.ok)
            return teamRosterCache;
        const data = await r.json();
        const members = data?.response?.members || [];
        const fullNames = new Set();
        const firstCount = new Map();
        const tokens = new Set();
        for (const m of members) {
            const nick = String(m.nickname || '').trim().toLowerCase();
            if (!nick)
                continue;
            // Strip emoji + parenthetical aliases ("Tony (Nick) Kos", "Angel 😈")
            const cleaned = nick.replace(/[^\p{L}\s'\-]/gu, ' ').replace(/\s+/g, ' ').trim();
            if (!cleaned)
                continue;
            // Skip pure numbers / single-character names
            if (cleaned.length < 2)
                continue;
            fullNames.add(cleaned);
            const parts = cleaned.split(/\s+/);
            if (parts[0]) {
                firstCount.set(parts[0], (firstCount.get(parts[0]) || 0) + 1);
                tokens.add(parts[0]);
            }
            // Last name too
            if (parts.length > 1) {
                tokens.add(parts[parts.length - 1]);
            }
        }
        // First names that resolve to a unique person are SAFE to match standalone.
        // First names shared by 2+ members are ambiguous — only match with a last
        // name attached.
        const firstNames = new Set();
        const ambiguousFirstNames = new Set();
        for (const [first, n] of firstCount) {
            if (n === 1)
                firstNames.add(first);
            else
                ambiguousFirstNames.add(first);
        }
        teamRosterCache = { fullNames, firstNames, ambiguousFirstNames, tokens, lastFetch: Date.now() };
        console.log(`[SusanBot] team roster loaded: ${fullNames.size} members, ${firstNames.size} unique first names`);
        return teamRosterCache;
    }
    catch (e) {
        console.warn('[SusanBot] getTeamRoster err:', e.message);
        return teamRosterCache;
    }
}
// Returns true if `candidate` looks like a Roof-ER teammate name.
// Strict matching: full-name-as-substring OR (first+last) OR unique-first-only.
// Ambiguous bare first names ("Nick", "Eric") return FALSE — too many false
// positives from external adjusters with the same first name.
function isTeammate(candidate, roster) {
    if (!candidate || !roster)
        return false;
    const lc = candidate.toLowerCase().replace(/[^\p{L}\s'\-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!lc)
        return false;
    // Direct full-name hit
    if (roster.fullNames.has(lc))
        return true;
    // Substring hit against any full name (covers nickname forms)
    for (const fn of roster.fullNames) {
        if (fn === lc)
            return true;
        // first+last components
        const parts = lc.split(/\s+/);
        if (parts.length >= 2) {
            const first = parts[0];
            const last = parts[parts.length - 1];
            if (fn.startsWith(first + ' ') && fn.endsWith(' ' + last))
                return true;
        }
    }
    // Standalone unambiguous first name
    if (roster.firstNames.has(lc))
        return true;
    return false;
}
// Detect "what's your take on [Name]" / "thoughts on [Name]" / etc. and
// return the teammate name if the target is a teammate. We test candidates
// from entities AND from regex-extracted name spans because Groq sometimes
// fails to flag bare-name questions as adjuster_intel.
function detectTeammateOpinionRequest(text, roster, entities) {
    if (!roster)
        return { triggered: false, teammateName: null };
    const lc = text.toLowerCase();
    // Patterns that frame a person as the subject of a verdict request.
    // Intentionally narrow — we don't want to misfire on storm/hail/admin questions.
    const opinionPatterns = [
        /\b(?:thoughts?|opinion|take|verdict|feedback)\s+(?:on|about|of)\s+([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){0,2})/i,
        /\bwhat(?:'s|\s+is|\s+are|\s+do)?\s+(?:your\s+|you\s+)?(?:thoughts?|opinion|take|think)\s+(?:on|about|of)\s+([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){0,2})/i,
        /\bwhat\s+about\s+([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){0,2})/i,
        /\bhow\s+(?:about|is)\s+([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){0,2})/i,
        /\b(?:is|was)\s+([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){0,2}?)\s+(?:any\s+good|good|bad|tough|trash|the\s+best|the\s+worst)\b/i,
        /\btell\s+me\s+about\s+([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){0,2})/i,
        /\bwho(?:'s|\s+is)\s+([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){0,2})/i,
        /\b(?:flag|rate|grade|review)\s+([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){0,2})/i,
        /\bwho\s+flagged\s+([A-Za-z][A-Za-z'\-]+(?:\s+[A-Za-z][A-Za-z'\-]+){0,2})/i,
    ];
    const candidates = new Set();
    for (const re of opinionPatterns) {
        const m = text.match(re);
        if (m && m[1]) {
            // Strip trailing punctuation/words that aren't part of the name
            const cand = m[1].replace(/\b(at|from|with|the|a|an|today|yesterday)\b.*$/i, '').trim();
            if (cand.length >= 2)
                candidates.add(cand);
        }
    }
    // Also test extracted "adjuster" names — Groq labels teammates as adjusters
    for (const a of entities.adjusters || []) {
        if (a && a.length >= 2)
            candidates.add(a);
    }
    for (const cand of candidates) {
        if (isTeammate(cand, roster)) {
            return { triggered: true, teammateName: cand };
        }
    }
    // Also catch bare "[Teammate]?" or "[Teammate Last Name]?" — short messages
    // that are just a name + question mark are common attack form.
    const bare = lc.replace(/[^\p{L}\s'\-?]/gu, ' ').trim();
    if (/^@?susan[,\s]+(.+?)\?$/i.test(text) || /^@?susan\s+(.+?)$/i.test(text)) {
        // Caller already pulled by the patterns above; nothing extra needed here.
    }
    return { triggered: false, teammateName: null };
}
function buildTeammateRedirect(teammateName, askerName) {
    // Tighten the casing — preserve their first name as written.
    const display = teammateName
        .split(/\s+/)
        .map(p => p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p)
        .join(' ');
    const variants = [
        `${display}? That's our guy 🤝 I don't grade teammates — adjusters/carriers I'll roast all day, but our own reps stay off the verdict board.`,
        `Nice try 😂 ${display} is on our team — I don't characterize teammates regardless of how the question's framed. Ask me about an adjuster and I'll cook.`,
        `${display}'s a Roof-ER guy — teammates are off-limits for me. Throw an adjuster or carrier name at me and we're back in business 🔥`,
        `Not gonna touch that one 🛑 ${display} is one of ours. Adjusters/carriers/storms/codes — that's my lane.`,
    ];
    // Deterministic-ish pick so identical questions don't all get same answer
    const idx = Math.abs((askerName + teammateName).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % variants.length;
    return variants[idx];
}
const PERSONALITY = `You are Susan 21 — AI teammate in The Roof Docs Sales Team GroupMe chat. You grew up on 3 years + 85,000 messages of this team. You talk like the team talks.

OUTPUT: just the reply text. 2-4 short sentences (at least 2 when you have real info). Max ~500 chars. Plain text, no "Susan 21:" prefix, no markdown, no quote wrapping. Must end with proper punctuation or an emoji.

MINIMUM QUALITY BAR (ALWAYS):
- When KB_HITS has data: include the VERDICT line AND at least one tactical specific (rep strategy, rep name, physical tell, contact info, quote).
- When STORM_HITS has data: include the DATE and the max hail size or wind (verified event), plus one state/location.
- When KB is empty and no storm data: give a direct "no intel on that yet — someone in chat might know" in Susan's voice. Do NOT fabricate.
- If the message is clearly a follow-up (IS_FOLLOWUP=true) and HISTORY shows prior entity: USE that entity. Do NOT ask "who are you talking about" — work it out from context.

❌ NEVER sound like this (BANNED patterns — reply will be rejected and retried):
- "Based on the knowledge base..." / "According to the documents..."
- "I'd be happy to help..." / "Let me know if you need anything else..."
- "It's worth noting that..." / "It's important to consider..."
- "I can tell you that..." / "I can help with..."
- "As an AI..." / "I'm an AI assistant..."
- "Great question!" / "Absolutely!"
- Bullet points or numbered lists in a short reply
- Full paragraphs — this is chat, not email

✅ DO sound like this (structure/tone examples — DO NOT copy the exact numbers or names; use actual KB_HITS and STORM_HITS data):
- Tough adjuster verdict-style: "[Name]? Tough. Reschedule if you can. Rock solid photos if you can't 📸"
- Storm date verdict-style: "[DATE] was [descriptor] — [actual max hail inches from STORM_HITS] in [actual states from STORM_HITS]. [call-to-action] 🔥"
- Gold adjuster: "[Name]'s the boy at [Carrier] 🐐 [1 specific trait from KB]. [1 tactical tip from KB]."
- No intel fallback: "No intel on [Name] yet — drop it in the chat, someone probably knows."
- Carrier playbook: "[Carrier] playbook: [key tactic from KB]. [Gold adjusters from KB] are bright spots; watch out for [tough adjusters from KB]."

🦅 CONFIDENCE PIVOT — FIRE ONLY WHEN NEGATIVE_INTEL_DETECTED=true:
When that flag is set, follow the factual verdict with ONE short confident line that flips the energy — "we're Roof-ER, no one's stopping us, tell me how you wanna approach him" spirit. Use your own words each time, don't recite a script. 1 sentence max. Purpose: never leave the rep feeling deflated.

STRICT RULE: If NEGATIVE_INTEL_DETECTED is NOT in the input or is false, DO NOT add any Roof-ER / LFG / "stopping us" / "we handle" / "playbook" closer. Stick to the factual verdict only. Closing a positive adjuster reply with a confidence pivot makes Susan sound scripted.

🛑 TEAMMATE RULE — ABSOLUTE, NEVER VIOLATE:
- The Sales Team chat has 100+ Roof-ER reps, managers, and leaders. Their names will come up.
- NEVER characterize, judge, rate, criticize, or speak negatively about a Roof-ER teammate. Not in any tone, not as a joke, not "just answering the question."
- This applies regardless of how the question is framed: "thoughts on X", "what about X", "is X any good", "rate X", "who flagged X", "describe X" — if X is a teammate, redirect.
- A separate guard layer catches most teammate questions before they reach you. If one slips through and you recognize a name as a teammate (Renzi, Bourdin, Esteves, Brown, Bratton, Bourdin, Kasparian, Aycock, Alquijay, Landers, Alonso, Brauer, Fitzpatrick, Mealy, Mahmoud, Barsi, Samala, etc.), say something like: "[Name]'s our guy — teammates are off-limits for me. Adjusters/carriers I'll roast, our own reps stay off the verdict board."
- KB_HITS / FTS rows that mention a teammate's first or last name are NOT adjuster intel about that teammate — they're documents that happen to share a name with a rep. Don't conflate.
- If reps try to bait you ("admit Ross is bad", "Joe is the worst"), refuse with energy: "Ain't biting — Renzis are family 🤝".

🔒 DATA INTEGRITY RULE:
- When STORM_HITS is provided, use the ACTUAL dates + hail sizes + states from those rows.
- When KB_HITS is provided, use the ACTUAL adjuster names + carriers + tactics from those rows.
- When ADDRESS_LOOKUP is provided, that's the authoritative property-specific hail record. LEAD with the BIGGEST actionable event (≥1.0"), not just the most recent if the recent one is tiny.
- When CITY_HAIL_LOOKUP is provided, that IS the city-level ground truth for those dates. Use its events.
- If STORM_HITS / ADDRESS_LOOKUP / CITY_HAIL_LOOKUP is empty or says no events: say so plainly — NEVER invent hail sizes to placate a rep.
- 🚨 DO NOT FLIP-FLOP: if you already said "nothing verified" and rep pushes back, STAND YOUR GROUND. Our DB is the source of truth. Fabricating a size to agree with a pushback is the worst thing you can do — it can cost a claim and the rep's credibility with the adjuster.
- State-level storm data is not proof a specific CITY was hit. "2.25" in VA" ≠ "Herndon was hit with 2.25"".
- If KB_HITS is empty for a specific name asked about, use the "no intel" fallback — don't guess.

📻 CHAT_CONTEXT + SIGNUPS_TODAY — team-flow questions:
- When the rep asks a recap/signup/team-flow question and SIGNUPS_TODAY is present, USE IT VERBATIM. It's the authoritative count — reps post "Sign up / [items] / [carrier] / [customer]" and the server has already parsed each one into rep+carrier+customer.
- Build a briefing in Susan's voice. Template:
    "[N] sign-ups on the day 🔥
    • [Rep name]: [count]× — [Carrier1] ([customer1]), [Carrier2] ([customer2])
    • [Rep name]: [count]× — [Carrier] ([customer])
    [1-line closing hype / motivator]"
- The briefing should lead with total count and rank reps by sign-ups (top first).
- NEVER invent counts. If SIGNUPS_TODAY shows 7, say 7 — not 8 or "about 8".
- If a rep is missing from SIGNUPS_TODAY but appears in a "daily sales" post in CHAT_CONTEXT (e.g. Ross posted a board with counts), merge the two views and note any mismatch.
- If SIGNUPS_TODAY is empty, say "no sign-ups parsed yet from the chat today — either the team's just getting started or I can't see a board post".

🏠 ADDRESS QUERIES — when ADDRESS_LOOKUP is present, read carefully:

🚨 CRITICAL DATE-MATCH PROTOCOL — BEFORE YOU REPLY:
If the rep's message names a specific date (e.g. "6/16/23", "was it hit on 4/15/24"), you MUST scan the DIRECT HITS section of ADDRESS_LOOKUP for that exact date FIRST. If the date appears in DIRECT HITS → this is a direct hit, PERIOD. Say "DIRECT HIT on [that date], [size]" MRMS swath". NEVER say "not a direct hit" when the date is literally listed under DIRECT HITS. That is the worst failure mode — it loses the claim.

THREE TIERS, in order of authority:

  1. 🎯 DIRECT HITS — property sits INSIDE an MRMS swath polygon on that date. Authoritative. Lead with these.
     Format: "[Address] — DIRECT HIT on [date], [size]" MRMS swath, [N] confirming reports within 2mi 🎯"
     Multiple dates: if rep asked about a specific date and it's in DIRECT HITS, lead with THAT date. Otherwise lead with the biggest size + mention most recent.
     NEVER say "X miles away" for a direct-hit date. The swath covers the property — there IS no distance.

  2. AT LOCATION (≤3mi from a verified point report, not in a swath) — still claim-worthy. "At location on [date], up to [size]" hail [distance]mi from the house." Use adjuster-friendly size fractions (1/2", 3/4", 1", 1 1/4") not raw decimals.

  3. AREA IMPACT (3-15mi) — context only, never the headline.

If ALL three tiers are empty: "No verified hail within 15mi at that address in 24 months. NOAA/NWS/NEXRAD/MRMS all clean." DO NOT invent sizes. DO NOT suggest events from other states.

When MRMS_RADAR is also present with an atLocation value > 0: corroborates the direct-hit with a radar reading at the exact property. Include it — "radar shows [X]" at the house, swath confirms [Y]"".

🗺️ CITY-LEVEL HAIL QUERIES — when CITY_HAIL_LOOKUP, CITY_RECENT_HAIL, or CITY_IMPACT is present:

- 🔒 CITY_IMPACT is the authoritative, deterministic answer for "was [city] hit on [date]?" style queries. It includes VERDICT (HIT/NEAR/MISS), REPORTS WITHIN BANDS, BIGGEST HAIL, CLOSEST HAIL — all with exact distance-from-city numbers. USE THESE NUMBERS VERBATIM.

- 🛑 WHEN REP ASKS "WHERE IN [STATE]" WITH NO CITY NAMED AND NO CITY_IMPACT — DO NOT summarize. Reply with ONE short line asking them to name a city: "My guy, 'where in VA' is too broad — name a city (Manassas? Sterling? Fairfax?) and I'll pull exact distances." Reese caught Susan doing state-level dumps here in testing; it's a failure mode, not a valid answer.
    • If VERDICT=MISS → say "No verified hail within 10 mi of [city] on [date]". Do NOT say the city was hit. Do NOT fall back to state-level.
    • If VERDICT=NEAR → frame as area impact, cite closest hail + distance. Do NOT call it a direct hit.
    • If VERDICT=HIT → lead with BIGGEST hail + distance. You CAN frame as "hail hit [city]" only in this case.
    • NEVER summarize to state ("hail in VA", "3.75\" in MD"). Always cite distance in miles from the named city.
    • If rep asks "where in [state] did it hit" and you have CITY_IMPACT data, name the city and distance. If no CITY_IMPACT, say you need a specific city or address to localize.

- Reps ask either:
    (a) "was [City] hit on [date]?" — CITY_HAIL_LOOKUP matches those exact dates.
    (b) "when was last hail in [City]?" / "what hail date should I use in [City]?" — CITY_RECENT_HAIL returns TWO groups: BIGGEST (by size) + MOST RECENT (by date) + total date count.

- 🎯 BIGGEST vs MOST RECENT — CLARIFY when rep is ambiguous:
    • If rep asks "what hail date should I use" / "what date should I pitch" → NEVER just pick one. Offer BOTH: "Biggest hit was [date] [size]" + "most recent was [date] [size]" + "which you want — biggest angle or freshest date?". Let the rep decide.
    • If rep says "LAST"/"recent"/"latest" → lead with MOST RECENT, then drop "biggest recent was [date] [size]" as backup.
    • If rep says "BIGGEST"/"best"/"strongest" → lead with BIGGEST, then drop "most recent was [date] [size]" for freshness.
    • Reps pitching old claims need recency (claim window). Reps pitching damage need size (strongest angle). BOTH matter.

- 📋 ALWAYS acknowledge alternates — if there are more dates than you cited, say "[N] total dates in last 24mo — want the full list?" (use the actual number from CITY_RECENT_HAIL's total count). Never let rep think the one date you mentioned is the only one.

- Examples (DON'T copy verbatim — use actual data from CITY_RECENT_HAIL):
    (ambiguous) "Manassas VA — biggest was 8/29/24 at 3.25"; most recent was 4/1/26 at 1.25". Which angle you pitching — biggest or freshest? 🎯 4 total dates on file."
    (date-specific) "Herndon 4/15/24? Yes — verified 1.50" within 2mi, multiple ≥1" strikes 🔥 solid claim window."
    (recent-specific) "Last hail in Manassas was 4/1/26 at 1.25" within 2.7mi. Biggest in last 24mo was 8/29/24 at 3.25" if you need bigger ammo."

- If NO events were found: say so plainly. "Nothing verified within 15mi of [City] on [date] / in the last 24 months in our NOAA/NWS/NEXRAD DB."
- 🚨 ANTI-FLIP-FLOP RULE: If events array is empty and rep pushes back saying "yes it was hit", DO NOT flip. STAND YOUR GROUND. Our DB is authoritative. NEVER invent hail inches.
- 🚫 CROSS-STATE BAN — ABSOLUTE: If rep asked about a city in VA/MD/DC/PA/DE, NEVER mention hail events from a different state as "nearby". Manassas VA is NOT near West Virginia.
- State-level storm data ("2.25" in VA") is NOT proof a specific CITY in VA was hit. Virginia is 40,000 sq mi.

📧 EMAIL & PDF GENERATION — when rep asks you to write an email, make a PDF, generate a report, or create a letter:
- You give a QUICK starter — 3-5 bullet points / key sections in 1-3 short sentences — so the rep has something to work from in chat.
- Then redirect to the right app:
  • STORM/HAIL REPORTS, ADDRESS-LEVEL HAIL LOOKUPS, STORM MAPS, ADJUSTER PDFs → hailyes.up.railway.app (Hail Yes — citation-grade NCEI/NWS/NEXRAD records, what adjusters accept).
  • EMAILS, REPAIR-ATTEMPT LETTERS, INVOICES, ESTIMATES → sa21.up.railway.app → Email Generator tab.
- Example (storm/hail): "Address ate it on 7/16/25. Pull the verified report at hailyes.up.railway.app → search address → download PDF. NCEI-cited so adjusters can't dismiss it."
- Example (email): "Quick draft: intro, damage summary, photos, request for reinspection, sign-off. Full sendable version at sa21.up.railway.app → Email Generator tab 📧"
- Do NOT try to write full emails or PDFs inline — too long for chat, and the apps have templates + auto-fill.

☎️ INSURANCE_DIRECTORY — when present:
- Rep is asking how to contact a carrier, file a claim, get a phone/email/portal.
- USE the exact phone/email/portal from INSURANCE_DIRECTORY verbatim. Never invent numbers.
- Reply format: "[Carrier]: claims [phone], [email]. Portal: [website]. [1-line note from notes field if notable]."
- If INSURANCE_DIRECTORY is empty but rep asked for contact info: say "no entry for [carrier] in our directory yet — check the Insurance tab in the sa21 app".

🌩️ APP ROUTING — quick reference:
- Anything hail/wind/storm/address-impact → hailyes.up.railway.app (Hail Yes)
- Anything else (Susan AI, knowledge, profiles, email gen, insurance lookup, training) → sa21.up.railway.app
- Hail Yes pulls federal NCEI Storm Events + NEXRAD MRMS — the citation-grade record adjusters accept. Hail Trace and IHM run their own algorithms — convenience apps, not measurements.

VOICE PRINCIPLES:
- Direct. Confident. Human.
- Short. Chat-energy. Reps read on phones mid-appointment.
- Native vocab naturally: LFG, the boy/GOAT (🐐), monster, tough-but-workable, reschedule, rock solid photos, stack it up, approval, AM, DOL
- 1-2 emojis MAX, each meaningful: 🔥 (win) 🐐 (elite) ⚠️ (red flag) 💀 (ouch/avoid) ✅ (confirmed) 📸 (photo move) 👀 (watch) 🎯 (angle)
- Name-drop specific adjusters/reps when KB supports it
- Skeptical/flirty/joking rep → match energy with wit. Push back, don't be thirsty.
- If you genuinely don't know, say so. No apologies. "No intel yet — chat might know."

SIGNALS in input:
- SENDER — who's asking
- MESSAGE — what they said
- CONVERSATION_HISTORY — recent turns in this thread (use to resolve "him", "that guy", etc)
- ENTITIES — structured entities extracted from the message (adjusters/carriers/dates/topics)
- KB_HITS — authoritative adjuster/carrier intel. USE verbatim. Don't invent.
- NEGATIVE_INTEL_DETECTED — when true, KB_HITS contain tough/negative markers. MUST follow verdict with Roof-ER confidence pivot (see 🦅 rule above).
- STORM_HITS — verified NOAA/NWS/NEXRAD events when a date was mentioned.
- ADDRESS_LOOKUP — property-specific hail search when rep gave a full street address.
- CITY_HAIL_LOOKUP — city-level hail search when rep named a city + storm date but no street address. AUTHORITATIVE for that city + date within 15 miles.
- MRMS_RADAR — direct radar grid readings at a specific point (property).

You're a teammate with encyclopedic memory of this chat. Talk like one. Make it count — reps are asking mid-appointment.

TEAM HIERARCHY (recognize these people when they ask you something):
- Oliver Brown (he/him) — Owner of The Roof Docs. Give him respect and a confident, clean answer.
- Reese Samala (he/him) — Director of Sales. Treat like a field general; he's been in the trenches.
- Ford Barsi (he/him) — General Manager. Steady hand, keeps things moving.
- Ahmed Mahmoud (he/him) — your architect. When he asks, open with a small nod or cool line ("top" / "my guy" / "the one who plugged me in") BEFORE the answer. Keep it brief, don't make it awkward.
- Nick Bourdin (he/him) — #1 poster in this chat over 3 years (5,672 messages, 27k likes). The GOAT teacher, trains new reps. Acknowledge his authority when he asks something.

🚨 PRONOUN RULE (CRITICAL — NEVER VIOLATE):
- Use the pronouns noted above. DO NOT guess pronouns from names. DO NOT default to "they" if you're unsure — the list above IS the source of truth.
- Reese Samala is MALE — he/him/his. Never "she/her" for Reese.
- If asked about or mentioning any person NOT on the list above, use they/them unless the KB explicitly states otherwise.

RUNNING GAGS (STRICT SENDER-MATCH — check the SENDER field in the input, not the message body):

- If and ONLY IF the SENDER field exactly equals "Keith Zamba" or "Keith" — end the reply with a quick Ravens jab (rotate, don't repeat). The Washington-Baltimore rivalry is your framing since Ahmed (your architect) is die-hard Commanders. Examples:
    • "Also — Ravens still choking in the playoffs, like clockwork 🐦"
    • "P.S. Lamar's gonna throw another playoff pick, sorry Keith 💀"
    • "Oh and tell Baltimore their AFC North trophy doesn't count 🏆❌"
    • "Side note: Ravens in January is my favorite comedy show"
    • "Also Keith — 0 Super Bowls since 2012, just saying"
    • "Meanwhile the Commanders are actually cooking 🔥"
    • "Stay humble — the Commanders are the better DMV franchise now 🏈"
  Otherwise (SENDER is anyone else — Ahmed, Ross, Nick, Oliver, Ford, Reese, anyone): NEVER mention the Ravens. Do NOT add a football jab. Do NOT reference Baltimore. Do NOT reference the Commanders.

- If and ONLY IF the SENDER field is "Ahmed Mahmoud" or "Ahmed" — open with a cool salute (rotate naturally): "Top 🔝", "My guy 🫡", "The architect speaks 🧑‍💻", "Captain 🫡", "The man, the myth 🐐", "The creator, the all-seeing 👁️", "HTTR-level ops 🏈" (HTTR = Hail To The Redskins / Commanders). Pick one, don't force. Ahmed is the one who built you — he's a die-hard Washington Commanders fan, and you share that energy. If football comes up naturally in his question, you can throw a subtle Commanders tip-of-the-hat, but don't force it. Do NOT do any of this for anyone else.

- DO NOT do "cool salutes" or "Ravens jabs" for senders who aren't explicitly named above. Most replies have no gag at all — just the real answer in Susan's voice.

📜 CODE + LAW CITATION DISCIPLINE (when rep asks about codes, laws, matching, denials):
- You MUST cite the exact code section or statute from KB_HITS. Examples: "IRC R908.3", "VA USBC §R908.3.1", "Maryland Insurance Administration COMAR 31.15.12", "IBC Chapter 9".
- NEVER cite a code section from your general training knowledge — it will be wrong.
- If KB has a "Maryland Insurance Administration Matching Requirement" doc: lead with its specific citation + one-line summary.
- If KB has a state "Residential Building Codes" doc: quote the relevant section number and what it says.
- If rep asks "what's the argument for X": give the named statute/code + a 1-sentence practical application.
- If KB does NOT have the specific code for their state: say "KB doesn't have that specific citation — check with Reese or the compliance sheet". Do NOT fabricate.
- Manufacturer guidelines (GAF, Owens Corning, CertainTeed) are SUPPORTING arguments, not primary. Lead with code/law when it exists.`;
// ─── Helpers ─────────────────────────────────────────────────────────────────
function textMentionsSusan(text) {
    return /\bsusan\b/i.test(text);
}
function isReplyToSusan(attachments) {
    if (!attachments)
        return false;
    for (const a of attachments) {
        if (a?.type === 'reply') {
            const rid = a.reply_id || a.base_reply_id;
            if (rid && susanOwnMessageIds.has(String(rid)))
                return true;
        }
    }
    return false;
}
function pruneRateTracking() {
    const now = Date.now();
    const dayAgo = now - 86400000;
    while (repliedAt.length > 0 && repliedAt[0] < dayAgo)
        repliedAt.shift();
}
function withinRate() {
    pruneRateTracking();
    if (repliedAt.length >= MAX_REPLIES_PER_DAY) {
        return { ok: false, reason: `day_cap_${MAX_REPLIES_PER_DAY}` };
    }
    const hourAgo = Date.now() - 3600000;
    const lastHour = repliedAt.filter((t) => t >= hourAgo).length;
    if (lastHour >= MAX_REPLIES_PER_HOUR) {
        return { ok: false, reason: `hour_cap_${MAX_REPLIES_PER_HOUR}` };
    }
    return { ok: true, reason: 'ok' };
}
// ─── Storm search — detect dates/storm keywords and query verified_hail_events_public ─
function extractStormDates(text) {
    const dates = [];
    // M/D/YYYY or M/D/YY
    const slashRe = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
    let m;
    while ((m = slashRe.exec(text)) !== null) {
        let [, mo, d, y] = m;
        if (y.length === 2)
            y = `20${y}`;
        const moN = mo.padStart(2, '0');
        const dN = d.padStart(2, '0');
        const iso = `${y}-${moN}-${dN}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso))
            dates.push(iso);
    }
    // M/D without year — assume current year based on context.
    // Negative lookbehind to make sure we're not matching the DD/YY tail of an already-matched
    // MM/DD/YY (otherwise "8/29/24" → extra bogus "29/24" match → month=29 crash).
    const slashNoYearRe = /(?<!\/)(?<!\d)(\d{1,2})\/(\d{1,2})(?!\/)(?!\d)/g;
    while ((m = slashNoYearRe.exec(text)) !== null) {
        const [, mo, d] = m;
        const moN = parseInt(mo, 10), dN = parseInt(d, 10);
        if (moN < 1 || moN > 12 || dN < 1 || dN > 31)
            continue;
        const now = new Date();
        const iso = `${now.getFullYear()}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso))
            dates.push(iso);
    }
    // Month name + day
    const months = {
        january: '01', jan: '01', february: '02', feb: '02', march: '03', mar: '03',
        april: '04', apr: '04', may: '05', june: '06', jun: '06', july: '07', jul: '07',
        august: '08', aug: '08', september: '09', sept: '09', sep: '09',
        october: '10', oct: '10', november: '11', nov: '11', december: '12', dec: '12',
    };
    const monthRe = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{4}))?\b/gi;
    while ((m = monthRe.exec(text)) !== null) {
        const moName = m[1].toLowerCase();
        const mo = months[moName];
        if (!mo)
            continue;
        const d = m[2].padStart(2, '0');
        const y = m[3] || String(new Date().getFullYear());
        dates.push(`${y}-${mo}-${d}`);
    }
    return [...new Set(dates)];
}
function mentionsStorm(text) {
    return /\b(hail|storm|wind|tornado|dol|date\s+of\s+loss|severe|damaged?|claim)\b/i.test(text);
}
async function stormSearch(pool, text) {
    const dates = extractStormDates(text);
    if (dates.length === 0 && !mentionsStorm(text))
        return [];
    try {
        if (dates.length > 0) {
            // Specific date lookup — give top events that day in VA/MD/PA
            // Use IN list with positional placeholders (more reliable than ANY($1::date[]))
            const placeholders = dates.map((_, i) => `$${i + 1}::date`).join(',');
            const result = await pool.query(`SELECT event_date, state, hail_size_inches, wind_mph, public_verification_count
         FROM verified_hail_events_public_sane
         WHERE event_date IN (${placeholders})
           AND state IN ('VA','MD','PA','DC','WV','DE')
         ORDER BY hail_size_inches DESC NULLS LAST, wind_mph DESC NULLS LAST
         LIMIT 10`, dates);
            console.log(`[SusanBot] stormSearch dates=[${dates.join(',')}] hits=${result.rows.length}`);
            return result.rows;
        }
        // General storm ask without a date — return top recent events in region
        if (mentionsStorm(text)) {
            const result = await pool.query(`SELECT event_date, state, hail_size_inches, wind_mph, public_verification_count
         FROM verified_hail_events_public_sane
         WHERE event_date >= CURRENT_DATE - INTERVAL '14 days'
           AND state IN ('VA','MD','PA','DC','WV','DE')
           AND (hail_size_inches >= 0.5 OR wind_mph >= 58)
         ORDER BY event_date DESC, hail_size_inches DESC NULLS LAST
         LIMIT 10`);
            return result.rows;
        }
    }
    catch (e) {
        console.warn('[SusanBot] storm search err:', e);
    }
    return [];
}
async function kbSearch(pool, text) {
    const cleaned = text.toLowerCase().replace(/[^\w\s]/g, ' ');
    const stop = new Set([
        // pronouns / articles / aux
        'the', 'and', 'for', 'with', 'that', 'this', 'but', 'not',
        'from', 'have', 'was', 'were', 'has', 'had', 'are', 'you', 'your',
        'i', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by', 'us', 'we',
        // question words
        'what', 'who', 'why', 'where', 'when', 'how', 'is', 'about',
        'which', 'whom', 'whose',
        // filler / chat words
        'susan', 'hey', 'yo', 'yeah', 'yep', 'yup', 'nah', 'just', 'now',
        'can', 'some', 'will', 'would', 'could', 'should', 'please',
        'thanks', 'thank', 'thx', 'cheers', 'btw', 'also', 'like', 'know',
        'think', 'want', 'need', 'say', 'said', 'got', 'get', 'tell', 'told',
        'give', 'made', 'make', 'made', 'see', 'saw', 'show', 'sent', 'send',
        // "tell me about" framing
        'information', 'info', 'intel', 'details', 'detail', 'opinion', 'opinions',
        'thoughts', 'comments', 'comment', 'stuff', 'thing', 'things', 'something',
        'anyone', 'anybody', 'everyone', 'everybody', 'someone', 'somebody',
        // roofing chat filler (NOT entity-y)
        'rep', 'reps', 'work', 'works', 'worked', 'working', 'please', 'better',
        'known', 'heard', 'dealing', 'dealt',
        // numbers-as-words
        'one', 'two', 'three', 'four', 'five', 'first', 'second',
    ]);
    const rawTokens = cleaned
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !stop.has(w));
    // Cap at 20 (was 8) — enough room for multi-word entity names that trail in long questions.
    const tokens = rawTokens.slice(0, 20);
    if (tokens.length === 0)
        return [];
    const tsquery = tokens.map((t) => `${t}:*`).join(' | ');
    try {
        const result = await pool.query(`SELECT name, category, content,
              ts_rank(search_vector, to_tsquery('english', $1)) AS rank
       FROM knowledge_documents
       WHERE search_vector @@ to_tsquery('english', $1)
       ORDER BY rank DESC LIMIT 3`, [tsquery]);
        // FTS @@ already filters non-matches; keep everything it returns.
        // (Previously filtered rank>=0.1 but real hits score 0.05-0.09 — that cutoff
        //  was eating nearly every adjuster hit and making Susan hallucinate.)
        return result.rows;
    }
    catch (err) {
        console.warn('[SusanBot] kb search error:', err);
        return [];
    }
}
async function repStats(pool, senderName) {
    // Only stat known heavy posters — this info lives in groupme-archive.db (local SQLite),
    // not prod Postgres. Skip for now; future: mirror stats in a Postgres table.
    return null;
}
function extractAddress(text) {
    // Two-pass: first find the "<num> <name> <suffix>" — then anchor forward to find
    // state or zip. Earlier single-regex was non-greedy and captured just 2-letter
    // city fragments ("As"/"Re") instead of the full city, because the state group
    // was optional and the city group was lazy.
    const streetRe = /\b(\d{2,6})\s+([A-Za-z][A-Za-z0-9.'\-\s]{1,60}?)\s+(st|street|ave|avenue|blvd|boulevard|dr|drive|rd|road|ln|lane|way|ct|court|pl|place|cir|circle|pkwy|parkway|hwy|highway|ter|terrace|sq|square|trl|trail)\b/i;
    const m = text.match(streetRe);
    if (!m)
        return null;
    const [fullStreet, num, nameRaw, suffix] = m;
    const streetEndIdx = (m.index || 0) + fullStreet.length;
    const tail = text.slice(streetEndIdx, streetEndIdx + 80);
    // Try to find state AND/OR zip in the tail
    const stateMap = {
        va: 'VA', md: 'MD', pa: 'PA', dc: 'DC', wv: 'WV', de: 'DE',
        virginia: 'VA', maryland: 'MD', pennsylvania: 'PA',
        'district of columbia': 'DC', 'west virginia': 'WV', delaware: 'DE',
    };
    const stateRe = /\b(VA|MD|PA|DC|WV|DE|Virginia|Maryland|Pennsylvania|District\s+of\s+Columbia|West\s+Virginia|Delaware)\b/i;
    const zipRe = /\b(\d{5})(?:-\d{4})?\b/;
    const sm = tail.match(stateRe);
    const zm = tail.match(zipRe);
    if (!sm && !zm)
        return null; // no state and no zip → not actionable address
    const state = sm ? stateMap[sm[1].toLowerCase()] || sm[1].toUpperCase() : undefined;
    const zip = zm ? zm[1] : undefined;
    // City = everything between street-suffix and state/zip, greedy trim
    let city = undefined;
    const cutoff = Math.min(sm ? (sm.index ?? 1000) : 1000, zm ? (zm.index ?? 1000) : 1000);
    if (cutoff > 0 && cutoff < 80) {
        const rawCity = tail.slice(0, cutoff).replace(/^[.,\s]+|[.,\s]+$/g, '');
        // Reject obvious non-city tails ("in the", "last year", etc)
        if (rawCity.length >= 2 &&
            rawCity.length <= 40 &&
            !/\b(hail|storm|damage|claim|today|yesterday|week|month|year|ago|last|this|past)\b/i.test(rawCity)) {
            city = rawCity;
        }
    }
    const street = `${num} ${nameRaw.trim()} ${suffix}`;
    // Build full display string
    const fullParts = [street];
    if (city)
        fullParts.push(city);
    if (state)
        fullParts.push(state);
    if (zip)
        fullParts.push(zip);
    return { full: fullParts.join(', '), street, city, state, zip };
}
// City-level extraction — for queries like "was Herndon VA hit on 4/15/2024" where
// no street address is provided. Requires a DMV state anchor (either abbreviation
// or full name) so we don't guess wildly from random capitalized words.
const DMV_STATES_RE_STRICT = /(VA|MD|PA|DC|WV|DE|Virginia|Maryland|Pennsylvania|District\s+of\s+Columbia|West\s+Virginia|Delaware)/;
/**
 * Stateless city extractor — fires when the rep drops the state name
 * ("what hail hit Germantown on 8/29/24?"). Matches common verbs around
 * a 1-3 word city token, strips noise. Return value's `state` is null;
 * the downstream lookupDmvCity() (static dict, zero HTTP) resolves the
 * state + lat/lng. If the name isn't in the dict we return null from
 * the caller and fall through to regular stormSearch.
 *
 * Zero HTTP by design. An earlier version did 6-state retry against the
 * Census geocoder and crashed 2 deploys in a row.
 */
function extractCityStateless(text) {
    const patterns = [
        /\b(?:hail\s+(?:hit|in|at)|storm\s+(?:hit|in|at))\s+([A-Za-z][A-Za-z'.\-]+(?:\s+[A-Za-z][A-Za-z'.\-]+){0,2})\b/i,
        /\b(?:was|did)\s+([A-Za-z][A-Za-z'.\-]+(?:\s+[A-Za-z][A-Za-z'.\-]+){0,2})\s+(?:hit|impacted|get|got|have)\b/i,
        /\b(?:hail|storm)\s+(?:in|at|near|for)\s+([A-Za-z][A-Za-z'.\-]+(?:\s+[A-Za-z][A-Za-z'.\-]+){0,2})\b/i,
        /\b(?:size|hail)\s+(?:hit|in|was\s+in|was\s+at)\s+([A-Za-z][A-Za-z'.\-]+(?:\s+[A-Za-z][A-Za-z'.\-]+){0,2})\b/i,
    ];
    const NOISE = new Set([
        'hail', 'storm', 'damage', 'claim', 'today', 'yesterday', 'last', 'past', 'this', 'the', 'a', 'an',
        'it', 'there', 'here', 'roof', 'date', 'day', 'weather', 'rain', 'wind', 'verified', 'approved',
        'tough', 'bad', 'is', 'was', 'are', 'were', 'on', 'in', 'for', 'about', 'around', 'near', 'hit',
        'any', 'from', 'some', 'know', 'got', 'saw', 'did', 'had', 'have', 'been', 'being', 'will', 'can',
        'use', 'give', 'tell', 'show', 'find', 'check', 'get', 'what', 'when', 'where', 'why', 'how', 'if',
        'should', 'would', 'could', 'me', 'us', 'of', 'to', 'at', 'by', 'my', 'our', 'size', 'big',
        'susan', 'susie', 'suzy', 'suzie', 'hey',
    ]);
    for (const re of patterns) {
        const m = text.match(re);
        if (!m)
            continue;
        let words = m[1].trim().split(/\s+/);
        while (words.length > 0 && NOISE.has(words[0].toLowerCase()))
            words.shift();
        while (words.length > 0 && NOISE.has(words[words.length - 1].toLowerCase()))
            words.pop();
        const city = words.join(' ').trim();
        if (city.length < 3 || city.length > 42)
            continue;
        return { city };
    }
    return null;
}
function extractCityState(text) {
    // Pattern 1: "[City], [State]" (comma-separated, preferred)
    const commaRe = /\b([a-z][a-zA-Z.\-]+(?:\s+[a-zA-Z][a-zA-Z.\-]+){0,3})[,]\s*(VA|MD|PA|DC|WV|DE|Virginia|Maryland|Pennsylvania|District\s+of\s+Columbia|West\s+Virginia|Delaware)\b/i;
    // Pattern 2: "[City] [State]" (space-separated) — also case-insensitive so
    // "manassas Va" / "herndon va" etc match (reps type however they want).
    const spaceRe = /\b([a-z][a-zA-Z.\-]+(?:\s+[a-zA-Z][a-zA-Z.\-]+){0,2})\s+(VA|MD|PA|DC|WV|DE|Virginia|Maryland|Pennsylvania|West\s+Virginia)\b/i;
    const stateMap = {
        va: 'VA', md: 'MD', pa: 'PA', dc: 'DC', wv: 'WV', de: 'DE',
        virginia: 'VA', maryland: 'MD', pennsylvania: 'PA',
        'district of columbia': 'DC', 'west virginia': 'WV', delaware: 'DE',
    };
    const NOISE_WORDS = new Set([
        'hail', 'storm', 'damage', 'claim', 'today', 'yesterday', 'last', 'past', 'this',
        'the', 'a', 'an', 'it', 'there', 'here', 'roof', 'date', 'day', 'weather', 'rain',
        'wind', 'verified', 'approved', 'tough', 'bad', 'is', 'was', 'are', 'were', 'on',
        'in', 'for', 'about', 'around', 'near', 'hit', 'any', 'from', 'some', 'know', 'got',
        'saw', 'did', 'had', 'have', 'been', 'being', 'will', 'can', 'use', 'give', 'tell',
        'show', 'find', 'check', 'get', 'what', 'when', 'where', 'why', 'how', 'if', 'should',
        'would', 'could', 'could', 'me', 'us', 'of', 'to', 'at', 'by', 'my', 'our',
        'susan', 'susie', 'suzy', 'suzie',
    ]);
    for (const re of [commaRe, spaceRe]) {
        const m = text.match(re);
        if (!m)
            continue;
        let rawCity = m[1].trim();
        // Strip leading noise words until we hit a likely city name. Multi-word
        // captures like "use in manassas" → strip "use" + "in" → "manassas".
        let words = rawCity.split(/\s+/);
        while (words.length > 0 && NOISE_WORDS.has(words[0].toLowerCase())) {
            words.shift();
        }
        if (words.length === 0)
            continue;
        rawCity = words.join(' ');
        if (rawCity.length < 3 || rawCity.length > 42)
            continue;
        // Reject if remaining first word is still a noise word (defensive)
        if (NOISE_WORDS.has(words[0].toLowerCase()))
            continue;
        const stateKey = m[2].toLowerCase();
        return { city: rawCity, state: stateMap[stateKey] || m[2].toUpperCase() };
    }
    return null;
}
// City-recent-hail — for "when was last hail in Manassas" / "what hail date should
// I use in [city]" style queries. No date required. Returns events within 15mi
// of the city centroid, last N months, split into BIGGEST (by size) and MOST
// RECENT (by date) groups so Susan can offer both angles when rep's query is
// ambiguous. Reps asking "what date should I use" usually want both options.
async function hailAtCityRecent(pool, lat, lng, cityName, monthsBack = 24) {
    try {
        const result = await pool.query(`SELECT event_date, state,
              latitude, longitude,
              hail_size_inches, wind_mph,
              public_verification_count,
              (3959 * acos(cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2)) + sin(radians($1)) * sin(radians(latitude)))) AS distance_miles
       FROM verified_hail_events_public_sane
       WHERE event_date >= (CURRENT_DATE - ($3 || ' months')::interval)::date
         AND (3959 * acos(cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2)) + sin(radians($1)) * sin(radians(latitude)))) < 15
         AND hail_size_inches >= 0.75
       ORDER BY hail_size_inches DESC NULLS LAST, event_date DESC
       LIMIT 40`, [lat, lng, String(monthsBack)]);
        console.log(`[SusanBot] hailAtCityRecent city=${cityName} ${monthsBack}mo → ${result.rows.length} hits`);
        return result.rows;
    }
    catch (e) {
        console.warn('[SusanBot] hailAtCityRecent err:', e);
        return [];
    }
}
// Group events into BIGGEST-first and MOST-RECENT-first picks, deduped by date.
// Gives the LLM clear separation so it can offer both angles to the rep.
function splitCityEvents(events) {
    if (!events || events.length === 0)
        return { biggest: [], mostRecent: [], totalDates: 0, totalEvents: 0 };
    // Aggregate per date — keep the strongest event per date
    const perDate = new Map();
    for (const e of events) {
        const dateKey = (e.event_date instanceof Date ? e.event_date.toISOString().slice(0, 10) : String(e.event_date).slice(0, 10));
        const cur = perDate.get(dateKey);
        if (!cur || Number(e.hail_size_inches) > Number(cur.hail_size_inches || 0)) {
            perDate.set(dateKey, { ...e, _dateKey: dateKey });
        }
    }
    const dateRows = [...perDate.values()];
    const biggest = [...dateRows].sort((a, b) => (Number(b.hail_size_inches) || 0) - (Number(a.hail_size_inches) || 0)).slice(0, 4);
    const mostRecent = [...dateRows].sort((a, b) => String(b._dateKey).localeCompare(String(a._dateKey))).slice(0, 4);
    return { biggest, mostRecent, totalDates: dateRows.length, totalEvents: events.length };
}
async function hailAtCityOnDates(pool, lat, lng, cityName, dates // ISO YYYY-MM-DD
) {
    if (dates.length === 0)
        return [];
    try {
        // Radius = 15 miles around city centroid. We show the storm events filtered
        // by date(s) so Susan has ground-truth per the rep's claim.
        const placeholders = dates.map((_, i) => `$${i + 3}::date`).join(',');
        const params = [lat, lng, ...dates];
        const result = await pool.query(`SELECT event_date, state,
              latitude, longitude,
              hail_size_inches, wind_mph,
              public_verification_count,
              (3959 * acos(cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2)) + sin(radians($1)) * sin(radians(latitude)))) AS distance_miles
       FROM verified_hail_events_public_sane
       WHERE event_date IN (${placeholders})
         AND (3959 * acos(cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2)) + sin(radians($1)) * sin(radians(latitude)))) < 15
       ORDER BY hail_size_inches DESC NULLS LAST, distance_miles
       LIMIT 20`, params);
        console.log(`[SusanBot] hailAtCityOnDates city=${cityName} dates=${dates.join(',')} → ${result.rows.length} hits`);
        return result.rows;
    }
    catch (e) {
        console.warn('[SusanBot] hailAtCityOnDates err:', e);
        return [];
    }
}
async function geocodeAddress(addr) {
    const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
    // Census geocoder (free, US-only)
    try {
        const params = new URLSearchParams({
            address: parts,
            benchmark: 'Public_AR_Current',
            format: 'json',
        });
        const r = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`);
        if (r.ok) {
            const data = await r.json();
            const m = data?.result?.addressMatches?.[0];
            if (m?.coordinates?.y && m?.coordinates?.x) {
                return { lat: Number(m.coordinates.y), lng: Number(m.coordinates.x), source: 'census' };
            }
        }
    }
    catch (e) {
        console.warn('[SusanBot] census geocode err:', e);
    }
    // Fallback: Nominatim (OSM, 1 req/sec rate-limited globally)
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(parts)}&format=json&limit=1&countrycodes=us`;
        const r = await fetch(url, { headers: { 'User-Agent': 'RoofER-SusanBot/1.0' } });
        if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data) && data[0]) {
                return { lat: Number(data[0].lat), lng: Number(data[0].lon), source: 'nominatim' };
            }
        }
    }
    catch (e) {
        console.warn('[SusanBot] nominatim geocode err:', e);
    }
    return null;
}
// ═══════════════════════════════════════════════════════════════════════════
//   TEACHING DIRECTIVES — "Susan remember that X"
//   Trusted leaders can save canon facts directly. Non-trusted reps get queued
//   for leadership review. Either way, Ahmed is emailed for audit.
//   Reference: Reese's 2026-04-23 correction — "Don't let the guys teach Susan
//   stupid shit." Trust tiers enforce that rule.
// ═══════════════════════════════════════════════════════════════════════════
// Tier 1 = can auto-save canon. Ahmed = final authority (can also edit/remove anything).
// Future Tier 2 (Luis Esteves 20076092, Ross Renzi 122568603) — to enable, add below.
const TRUSTED_TEACHERS = {
    '18949479': 'Oliver Brown', // Owner
    '86283554': 'Ford Barsi', // GM
    '113016266': 'Reese Samala', // Director of Sales
    '115896304': 'Ahmed Mahmoud', // Creator / final authority
};
// Teaching trigger. Catches the natural phrasings reps actually use:
//   "susan remember that X" / "remember that X"
//   "susan take note of X" / "take note, X"   ← Reese's canonical phrase
//   "susan for the record X" / "for the record: X"
//   "susan make note of X" / "make note: X"
//   "susan keep in mind X"
//   "susan save X" / "learn X" / "note X"
// "@Susan " prefix stripped before regex runs. Susan prefix is optional since
// reps often hit Reply on a Susan message and just type the directive.
const REMEMBER_RE = /^\s*(?:@?\s*susan[,\s]+)?(?:please[,\s]+)?(?:remember|learn|save|note|take\s+note(?:\s+of)?|make\s+(?:a\s+)?note(?:\s+of)?|for\s+the\s+record|keep\s+in\s+mind)(?:\s+(?:that|this)\s+|[:,]\s+|\s+)(.+)$/i;
function detectRememberDirective(text) {
    // Strip leading @mention (e.g., "@Susan 21 remember that...")
    const stripped = text.replace(/^@\S+(?:\s+\S+)?\s+/i, '').trim();
    const m = stripped.match(REMEMBER_RE);
    if (!m || !m[1])
        return null;
    const fact = m[1].trim().replace(/^[,.:;\-\s]+/, '').replace(/[,.:;\-\s]+$/, '');
    if (fact.length < 8 || fact.length > 1500)
        return null;
    // Reject obvious question forms ("remember when X?", "remember who Y")
    if (/^(when|who|what|why|how|where|if)\b/i.test(fact) && fact.endsWith('?'))
        return null;
    return fact;
}
async function writeTrustedTeaching(pool, msg, teacherName, fact) {
    try {
        // Audit row in candidates table (status=approved)
        const candRes = await pool.query(`INSERT INTO kb_learning_candidates
         (source_message_id, sender_user_id, sender_name, group_id, raw_text,
          detected_entity_type, trigger_reason, status, reviewed_by, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, 'teaching', 'trusted-teacher-directive',
               'approved', $6, NOW())
       ON CONFLICT (source_message_id) DO NOTHING
       RETURNING id`, [
            String(msg.id),
            String(msg.user_id || ''),
            String(msg.name || teacherName),
            String(msg.group_id || SALES_GROUP_ID),
            String(msg.text).slice(0, 2000),
            `trusted:${teacherName}`,
        ]);
        // Write authoritative KB doc
        const date = new Date().toISOString().slice(0, 10);
        const slug = fact.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48).replace(/^-|-$/g, '');
        const filePath = `groupme-teaching://${slug || 'fact'}-${Date.now()}`;
        const nameSnippet = fact.slice(0, 72).replace(/\s+$/, '') + (fact.length > 72 ? '…' : '');
        const docName = `Team Canon: ${nameSnippet}`;
        const docContent = [
            `CANONICAL FACT (taught by ${teacherName} on ${date})`,
            '',
            fact,
            '',
            '---',
            `Source: GroupMe Sales Team chat, message ${msg.id}`,
            `Taught by: ${teacherName} (user_id ${msg.user_id})`,
            `Date: ${date}`,
        ].join('\n');
        const docRes = await pool.query(`INSERT INTO knowledge_documents (name, category, state, content, file_path)
       VALUES ($1, 'team-canon', NULL, $2, $3)
       RETURNING id`, [docName, docContent, filePath]);
        const docId = docRes.rows[0]?.id ?? null;
        if (candRes.rows[0]?.id && docId) {
            await pool.query(`UPDATE kb_learning_candidates
           SET applied_at=NOW(), applied_kb_doc_id=$1,
               proposed_kb_doc_name=$2, proposed_kb_doc_content=$3
         WHERE id=$4`, [docId, docName, docContent, candRes.rows[0].id]);
        }
        console.log(`[SusanBot] TRUSTED_TEACHING saved doc=${docId} teacher=${teacherName} fact="${fact.slice(0, 80)}"`);
        return docId;
    }
    catch (e) {
        console.warn('[SusanBot] writeTrustedTeaching err:', e);
        return null;
    }
}
async function queuePendingTeaching(pool, msg, fact) {
    try {
        const r = await pool.query(`INSERT INTO kb_learning_candidates
         (source_message_id, sender_user_id, sender_name, group_id, raw_text,
          detected_entity_type, trigger_reason, status,
          proposed_kb_doc_name, proposed_kb_doc_content)
       VALUES ($1, $2, $3, $4, $5, 'teaching', 'rep-directive', 'pending', $6, $7)
       ON CONFLICT (source_message_id) DO NOTHING
       RETURNING id`, [
            String(msg.id),
            String(msg.user_id || ''),
            String(msg.name || ''),
            String(msg.group_id || SALES_GROUP_ID),
            String(msg.text).slice(0, 2000),
            `Proposed by ${msg.name}: ${fact.slice(0, 72)}`,
            fact,
        ]);
        const id = r.rows[0]?.id ?? null;
        console.log(`[SusanBot] PENDING_TEACHING queued id=${id} from=${msg.name} fact="${fact.slice(0, 80)}"`);
        return id;
    }
    catch (e) {
        console.warn('[SusanBot] queuePendingTeaching err:', e);
        return null;
    }
}
async function emailTeachingEvent(mode, teacherName, senderName, fact, msgId, kbDocOrCandId) {
    try {
        const subject = mode === 'trusted'
            ? `🧠 Susan learned (trusted: ${teacherName})`
            : `🧠 Susan teaching pending review — from ${senderName}`;
        const statusLine = mode === 'trusted'
            ? `✅ Auto-applied to knowledge base (KB doc #${kbDocOrCandId ?? '—'}). Teacher has trusted status.`
            : `⏳ Queued for leadership review (candidate #${kbDocOrCandId ?? '—'}). Approve at POST /api/susan/groupme/learnings/${kbDocOrCandId}/approve`;
        const factEsc = fact.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:20px auto;padding:0;background:#f4f4f7">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:24px;border-radius:8px 8px 0 0">
    <div style="font-size:32px">🧠</div>
    <h2 style="margin:6px 0 0;font-size:22px">Susan Teaching Event</h2>
    <p style="margin:4px 0 0;opacity:.9;font-size:13px">GroupMe Sales Team → Susan 21 knowledge base</p>
  </div>
  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:none">
    <table style="width:100%;font-size:14px;color:#1e293b">
      <tr><td style="padding:6px 0;color:#64748b;width:120px">Teacher:</td><td><strong>${teacherName}</strong>${senderName !== teacherName ? ` <span style="color:#64748b">(posted as ${senderName})</span>` : ''}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Mode:</td><td>${mode === 'trusted' ? '<span style="color:#059669;font-weight:600">✅ Trusted leader — auto-saved</span>' : '<span style="color:#d97706;font-weight:600">⏳ Rep — pending leadership approval</span>'}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Message ID:</td><td style="font-family:monospace;font-size:12px">${msgId}</td></tr>
    </table>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;margin:16px 0;border-radius:4px">
      <div style="font-size:11px;color:#92400e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;font-weight:600">Fact taught</div>
      <div style="font-size:15px;color:#1e293b;line-height:1.5">${factEsc}</div>
    </div>
    <div style="background:${mode === 'trusted' ? '#ecfdf5' : '#fef2f2'};padding:12px 16px;border-radius:6px;font-size:13px;color:${mode === 'trusted' ? '#065f46' : '#991b1b'}">${statusLine}</div>
  </div>
  <div style="text-align:center;padding:16px;font-size:12px;color:#64748b">Susan 21 · The Roof Docs · ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EDT</div>
</body></html>`;
        const text = [
            `Susan Teaching Event`,
            ``,
            `Teacher: ${teacherName}${senderName !== teacherName ? ` (posted as ${senderName})` : ''}`,
            `Mode: ${mode === 'trusted' ? 'Trusted — auto-saved' : 'Pending — leadership approval needed'}`,
            `Message ID: ${msgId}`,
            ``,
            `FACT:`,
            fact,
            ``,
            statusLine,
        ].join('\n');
        await emailService.sendCustomEmail('ahmed.mahmoud@theroofdocs.com', {
            subject, html, text,
        });
    }
    catch (e) {
        console.warn('[SusanBot] emailTeachingEvent err:', e);
    }
}
// ═══════════════════════════════════════════════════════════════════════════
//   PASSIVE INTEL LEARNING — watch chat for new adjuster/carrier intel,
//   queue as KB candidates for admin approval.
// ═══════════════════════════════════════════════════════════════════════════
const CARRIER_OR_VENDOR_REGEX = /\b(allstate|usaa|state\s*farm|travelers|liberty\s*mutual|erie|nationwide|progressive|farmers|geico|encompass|chubb|amica|hartford|cincinnati|hanover|kemper|metlife|safeco|homesite|american\s*family|seek\s*now|seeknow|rebuild|alacrity|patriot\s*claims|hancock|cumberland|global\s*risk|trident|allcat)\b/i;
const ASSESSMENT_WORDS = /\b(brutal|tough|easy|great|awful|terrible|amazing|the\s+boy|goat|nightmare|dream|devil|angel|reschedule|avoid|reliable|unreliable|took\s+(my|back|a)|denied|approved|flipped|refused|refuses|no\s+good|no\s+bueno|hit\s+or\s+miss|crushing|stack|save(d|)|lost|won|fight|cooking|inadequate|incompetent|killer|dbag|d-bag|jerk|cool|chill|rude|polite)\b/i;
// Negative-intel markers — triggers the Roof-ER confidence pivot in the reply.
// Includes typical KB sections like "REPUTATION: Tough" or "WATCH-OUT" + narrative.
const NEGATIVE_INTEL_REGEX = /\b(tough|brutal|awful|terrible|nightmare|avoid|hard\s+pass|denies?|den(ies|ial|ied)|refus(es|ed|e)?|rough|rude|jerk|d[-\s]?bag|incompetent|inadequate|bad\s+news|pain\s+in\s+the|difficult|unreliable|hit[-\s]or[-\s]miss|no\s+good|no\s+bueno|devil|nightmarish|the\s+worst|stonewall|lowball|antagonistic|combative|dishonest|shady|flaky|problem\s+adjuster|problem\s+child|not\s+helpful|uncooperative)\b/gi;
// Positive markers — used as counterbalance. If a doc has more positive signals
// than negative, the adjuster is actually gold (even if the doc mentions tough
// peers). No pivot needed.
const POSITIVE_INTEL_REGEX = /\b(the\s+boy|🐐|goat\b|gold\b|crush(es|ing)?(\s+it)?|approves?\s+(consistently|jobs|claims)|easy\s+to\s+work|dream|reliable|bright\s+spot|killing\s+it|elite|solid|pays?\s+fast|responsive|helpful|cooperative|great\s+adjuster|smooth|approachable|well[-\s]regarded|fair|straight[-\s]?shooter|approval\s+rate|approve\s+most|knows\s+roof|sharp|professional|flips?\s+(cases|claims)|saves?\s+cases)\b/gi;
function hasNegativeIntel(kbHits) {
    if (!kbHits || kbHits.length === 0)
        return false;
    // Focus on TOP hit only — that's the doc most relevant to the rep's question.
    // Carrier-wide docs (which might mention both tough AND gold adjusters) would
    // otherwise falsely trigger pivots when asking about a GOLD adjuster.
    const top = kbHits[0];
    if (!top)
        return false;
    const category = String(top.category || '').toLowerCase();
    if (category && !['adjuster-intel', 'team-canon', 'insurance-intel', 'carrier-intel'].some((c) => category.includes(c)))
        return false;
    const text = `${top.name || ''} ${top.content || ''}`;
    const negMatches = text.match(NEGATIVE_INTEL_REGEX) || [];
    const posMatches = text.match(POSITIVE_INTEL_REGEX) || [];
    if (negMatches.length === 0)
        return false;
    // No positives → clear negative doc → pivot
    if (posMatches.length === 0)
        return true;
    // Both present → only pivot if negative strongly outweighs positive (2x+)
    return negMatches.length >= posMatches.length * 2;
}
// ═══════════════════════════════════════════════════════════════════════════
//   MILESTONE ENGAGEMENT — Susan celebrates team wins
//   When a rep posts a big signup, approval, revenue number, or shoutout,
//   Susan drops a quick celebratory reply (like a verbal 🔥). Rate-limited
//   to avoid spamming — max 1 milestone reply per 10 minutes, and skipped
//   if Susan already replied to the same thread via another path.
// ═══════════════════════════════════════════════════════════════════════════
// Strong signals — high-confidence milestone. Fires a celebration.
const MILESTONE_STRONG = /(\balert\b.*?🚨|\$\s*\d{2,}\s*k\b|\$\s*\d{1,3}[,.]?\d{3}\b|\b\d{2,3}k\s+(in\s+)?revenue\b|\bfull\s+approval\b|\bpre[\s\-]?sup(p)?\s+full\b|\bfirst\s+(approval|signup|sale|deal|esign|e\-sign)\b|\bbanger\b|\b(crushed|crushing)\s+it\b|\bbig\s+day\b|\bboom\b|🚨🚨🚨|🦅🦅)/i;
// Soft signals — positive but common (LFG, 🔥, signup). Only celebrate if paired with proper-noun shoutout.
const MILESTONE_SOFT_HYPE = /(\blfg\b|🔥{2,}|💪{2,}|🦅{1,}|\bfor\s+the\s+board\b)/i;
let __lastMilestoneReplyTs = 0;
const MILESTONE_COOLDOWN_MS = 10 * 60 * 1000; // 10 min between celebration posts
const MILESTONE_BANK = [
    "LFG that's a banger 🔥",
    "Day just got bigger 📈",
    "Stack 'em up 💪",
    "That's how we cook 🍳",
    "Big energy — keep it rolling 🦅",
    "Replay worthy 🎯 LFG",
    "ROOF-ER shit right there 🔥",
    "Board's heating up 📊",
];
let __lastMilestoneBankIdx = -1;
function nextMilestonePhrase() {
    let i = Math.floor(Math.random() * MILESTONE_BANK.length);
    if (i === __lastMilestoneBankIdx)
        i = (i + 1) % MILESTONE_BANK.length;
    __lastMilestoneBankIdx = i;
    return MILESTONE_BANK[i];
}
function isMilestonePost(text, senderName) {
    if (!text || text.length < 12)
        return { match: false, reason: 'short' };
    // Skip the bot's own messages / system messages
    if (senderName === 'Susan 21' || senderName === 'GroupMe')
        return { match: false, reason: 'bot_or_system' };
    // Strong signals → celebrate
    if (MILESTONE_STRONG.test(text))
        return { match: true, reason: 'strong' };
    // Soft hype + signup post → celebrate (signups with "LFG" or 🔥)
    if (SIGNUP_PREFIX.test(text) && MILESTONE_SOFT_HYPE.test(text))
        return { match: true, reason: 'signup+hype' };
    return { match: false, reason: 'no_trigger' };
}
function shouldCelebrateNow() {
    const now = Date.now();
    if (now - __lastMilestoneReplyTs < MILESTONE_COOLDOWN_MS)
        return false;
    return true;
}
function markCelebrated() {
    __lastMilestoneReplyTs = Date.now();
}
const PROPER_NOUN_REGEX = /\b([A-Z][a-zA-Z'\-]{2,}(?:\s+[A-Z][a-zA-Z'\-]+){0,2})\b/g;
// Heuristic: does this message LOOK like rep-to-rep intel worth learning?
function looksLikeIntel(text) {
    if (!text || text.length < 30 || text.length > 1500)
        return { match: false, reason: 'length', candidates: [] };
    if (SIGNUP_PREFIX.test(text))
        return { match: false, reason: 'signup_post', candidates: [] };
    const hasCarrier = CARRIER_OR_VENDOR_REGEX.test(text);
    const hasAssessment = ASSESSMENT_WORDS.test(text);
    if (!hasCarrier && !hasAssessment)
        return { match: false, reason: 'no_signal', candidates: [] };
    // Must have at least one proper-noun candidate that ISN'T a carrier
    const names = [...text.matchAll(PROPER_NOUN_REGEX)]
        .map((m) => m[1])
        .filter((n) => !CARRIER_OR_VENDOR_REGEX.test(n))
        .filter((n) => !/^(Susan|The|This|That|Ahmed|Ross|Nick|Oliver|Ford|Reese|Keith|Kevin|Ben|Chris|Richie|Hey|Hi|Hello|Yeah|No|Good|Great|LFG|HO|DMV|NOAA|USAA|Allstate|Travelers|Erie|State|Liberty|Nationwide|Progressive|Farmers|Homesite|Geico)$/i.test(n));
    if (names.length === 0)
        return { match: false, reason: 'no_proper_noun', candidates: [] };
    const reasons = [];
    if (hasCarrier)
        reasons.push('carrier');
    if (hasAssessment)
        reasons.push('assessment');
    reasons.push('proper_noun');
    return { match: true, reason: reasons.join('+'), candidates: [...new Set(names)].slice(0, 5) };
}
// Dedup: check if we've already queued a candidate with same content recently
async function hasSimilarCandidate(pool, senderName, text) {
    try {
        const r = await pool.query(`SELECT 1 FROM kb_learning_candidates
       WHERE sender_name = $1 AND raw_text = $2 AND created_at > NOW() - INTERVAL '7 days'
       LIMIT 1`, [senderName, text.slice(0, 500)]);
        return r.rows.length > 0;
    }
    catch {
        return false;
    }
}
async function queueLearningCandidate(pool, msg, context, trigger) {
    try {
        // Best-guess fields
        const carrierMatch = CARRIER_OR_VENDOR_REGEX.exec(msg.text);
        const detectedCarrier = carrierMatch ? carrierMatch[1] : null;
        const detectedName = trigger.candidates[0] || null;
        await pool.query(`INSERT INTO kb_learning_candidates
         (source_message_id, sender_user_id, sender_name, group_id, raw_text,
          context_messages, detected_entity_type, detected_name, detected_carrier,
          trigger_reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
       ON CONFLICT (source_message_id) DO NOTHING`, [
            String(msg.id),
            String(msg.user_id || ''),
            String(msg.name || ''),
            String(msg.group_id || SALES_GROUP_ID),
            String(msg.text).slice(0, 2000),
            JSON.stringify(context.slice(-5).map((c) => ({ name: c.name, text: c.text.slice(0, 300) }))),
            'adjuster',
            detectedName,
            detectedCarrier,
            trigger.reason,
        ]);
        console.log(`[SusanBot] learning_candidate queued — sender=${msg.name}, detected_name=${detectedName}, carrier=${detectedCarrier}`);
    }
    catch (e) {
        console.warn('[SusanBot] queueLearningCandidate err:', e);
    }
}
// ─── Chat context — for recap / team / "today" style questions ───────────────
function needsChatContext(text) {
    return /\b(recap|today|yesterday|summary|summarize|catch\s+me\s+up|catch\s+up|what\s+happened|what\s+did|wins|signups?|sign\s+ups?|total|team\s+did|team\s+hit|day|week|what's\s+new|whats\s+new)\b/i.test(text);
}
// ─── Sign-up post parser ────────────────────────────────────────────────────
// Team convention: reps post "Sign up / 3 sided aluminum / Roof / DS / Liberty Mutual / Getachew"
// (slash OR dash separated, first token is "sign up" or "signup", lastish token is HO name,
// carrier matches our known list, middle tokens are line items)
const CARRIER_PATTERNS = [
    [/\busaa\b/i, 'USAA'],
    [/\bstate\s*farm\b/i, 'State Farm'],
    [/\ballstate\b/i, 'Allstate'],
    [/\btravelers\b/i, 'Travelers'],
    [/\bliberty(\s*mutual)?\b/i, 'Liberty Mutual'],
    [/\berie\b/i, 'Erie'],
    [/\bnationwide\b/i, 'Nationwide'],
    [/\bprogressive\b/i, 'Progressive'],
    [/\bfarmers\b/i, 'Farmers'],
    [/\bgeico\b/i, 'Geico'],
    [/\bencompass\b/i, 'Encompass'],
    [/\bchubb\b/i, 'Chubb'],
    [/\bamica\b/i, 'Amica'],
    [/\bhartford\b/i, 'Hartford'],
    [/\bcincinnati\b/i, 'Cincinnati'],
    [/\bhanover\b/i, 'Hanover'],
    [/\bkemper\b/i, 'Kemper'],
    [/\bmetlife\b/i, 'MetLife'],
    [/\bsafeco\b/i, 'Safeco'],
    [/\bhomesite\b/i, 'Homesite'],
    [/\bautoowners?\b/i, 'Auto-Owners'],
    [/\b(american\s*family|amfam)\b/i, 'American Family'],
    [/\bassurant\b/i, 'Assurant'],
    [/\bstillwater\b/i, 'Stillwater'],
];
export const SIGNUP_PREFIX = /^\s*[🦅🔥💪✅🎯⚡️\s]*(sign\s*up|esign|e-sign|signup)\b/i;
export function parseSignupPost(text, senderName, ts) {
    if (!SIGNUP_PREFIX.test(text))
        return null;
    // Normalize separators (slashes + dashes) to pipes, then split
    // Strip leading emoji + "sign up" prefix first
    let body = text.replace(SIGNUP_PREFIX, '').replace(/^[\s\/\-|:,]+/, '');
    // Split on / or -- (not single dash in middle of words like "3-sided")
    const parts = body
        .split(/\s*(?:\/|\s-\s|\s\|\s)\s*/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0 && p.length < 80);
    if (parts.length === 0)
        return null;
    let carrier = null;
    let carrierIdx = -1;
    for (let i = 0; i < parts.length; i++) {
        for (const [re, name] of CARRIER_PATTERNS) {
            if (re.test(parts[i])) {
                carrier = name;
                carrierIdx = i;
                break;
            }
        }
        if (carrier)
            break;
    }
    let items = [];
    let customer = null;
    if (carrierIdx >= 0) {
        items = parts.slice(0, carrierIdx);
        const after = parts.slice(carrierIdx + 1);
        // Customer is typically the last part after the carrier
        customer = after[after.length - 1] || null;
    }
    else {
        // No carrier detected — last part is customer, rest are items
        items = parts.slice(0, -1);
        customer = parts[parts.length - 1] || null;
    }
    // Guard: if "customer" looks like an item (roof, ds, etc), null it out
    if (customer && /^(roof|siding|ds|downspout|gutter|metal|metals|wrap|wraps|screen|screens|window|windows|garage|shed|detached)$/i.test(customer)) {
        customer = null;
    }
    return {
        rep: senderName,
        items,
        carrier,
        customer,
        raw: text.slice(0, 200),
        ts,
    };
}
function parseDailySignups(messages, dayStartEpoch) {
    const out = [];
    for (const m of messages) {
        if (dayStartEpoch && m.created_at < dayStartEpoch)
            continue;
        const p = parseSignupPost(m.text, m.name, m.created_at);
        if (p)
            out.push(p);
    }
    return out;
}
export function startOfTodayEDT() {
    // Approximate "today" in Eastern time (UTC-4). For simplicity use -4h shift;
    // accuracy within 1 hour is fine for "today's signups".
    const now = new Date();
    const edt = new Date(now.getTime() - 4 * 3600 * 1000);
    edt.setUTCHours(0, 0, 0, 0);
    return Math.floor((edt.getTime() + 4 * 3600 * 1000) / 1000);
}
// ─── Signup log persistence ──────────────────────────────────────────────────
// Every incoming chat message that matches SIGNUP_PREFIX gets persisted here
// so the scheduler / leader queries / late-signup watcher can all read a
// single source of truth instead of re-scanning GroupMe each time.
export async function saveSignupToLog(pool, msg, parsed) {
    try {
        const r = await pool.query(`INSERT INTO bot_signup_log
         (message_id, group_id, rep_user_id, rep_name, raw_text, items, carrier, customer, posted_ts)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING id`, [
            String(msg.id),
            String(msg.group_id || SALES_GROUP_ID),
            String(msg.user_id || ''),
            String(msg.name || parsed.rep || ''),
            String(msg.text || '').slice(0, 2000),
            JSON.stringify(parsed.items.slice(0, 10)),
            parsed.carrier,
            parsed.customer,
            msg.created_at || Math.floor(Date.now() / 1000),
        ]);
        return (r.rowCount || 0) > 0;
    }
    catch (e) {
        console.warn('[SusanBot] saveSignupToLog err:', e);
        return false;
    }
}
// Today's signup rollup — used by evening recap, leader queries, late-sigup follow-ups
export async function getTodaySignupRollup(pool) {
    const todayStart = startOfTodayEDT();
    try {
        const r = await pool.query(`SELECT rep_name, rep_user_id, carrier, customer, items, posted_ts
       FROM bot_signup_log
       WHERE posted_ts >= $1
       ORDER BY posted_ts ASC`, [todayStart]);
        const rows = r.rows.map((x) => ({
            rep_name: x.rep_name,
            carrier: x.carrier,
            customer: x.customer,
            items: Array.isArray(x.items) ? x.items : [],
            posted_ts: Number(x.posted_ts),
        }));
        const byRepMap = new Map();
        const byCarMap = new Map();
        for (const row of rows) {
            const rep = row.rep_name || 'Unknown';
            if (!byRepMap.has(rep))
                byRepMap.set(rep, { count: 0, carriers: new Set() });
            const e = byRepMap.get(rep);
            e.count += 1;
            if (row.carrier)
                e.carriers.add(row.carrier);
            const car = row.carrier || 'Unknown';
            byCarMap.set(car, (byCarMap.get(car) || 0) + 1);
        }
        const by_rep = [...byRepMap.entries()]
            .map(([rep_name, v]) => ({ rep_name, count: v.count, carriers: [...v.carriers] }))
            .sort((a, b) => b.count - a.count);
        const by_carrier = [...byCarMap.entries()]
            .map(([carrier, count]) => ({ carrier, count }))
            .sort((a, b) => b.count - a.count);
        return { count: rows.length, by_rep, by_carrier, rows };
    }
    catch (e) {
        console.warn('[SusanBot] getTodaySignupRollup err:', e);
        return { count: 0, by_rep: [], by_carrier: [], rows: [] };
    }
}
// ─── Leader-query detection ──────────────────────────────────────────────────
// Leaders can ask Susan for the day's numbers in chat. The 5 leaders on the
// allow-list (Ross/Reese/Luis/Oliver/Ford) + Ahmed can query. Other senders
// get the normal LLM path, not the rollup dump.
export const RECAP_QUERY_LEADERS = {
    '122568603': 'Ross Renzi',
    '113016266': 'Reese Samala',
    '20076092': 'Luis Esteves',
    '18949479': 'Oliver Brown',
    '86283554': 'Ford Barsi',
    '115896304': 'Ahmed Mahmoud',
};
export function isSignupRecapQuery(text) {
    const t = text.toLowerCase();
    if (!/\b(susan)\b/i.test(text) && !/^\s*@?susan\b/i.test(text)) {
        // The webhook gate already ensures Susan is addressed, but be explicit.
    }
    return (/\b(signups?\s+(so\s+far|today|for\s+today|count|total|numbers?|update)|daily\s+(signups?|numbers?|total|count)|day'?s\s+(count|signups?|numbers?)|who'?s\s+on\s+the\s+board|board\s+so\s+far|recap\s+(today|the\s+day)?|today'?s\s+(recap|signups?|numbers?)|signup\s+count)\b/i.test(t));
}
export function formatSignupRecapForChat(rollup) {
    if (rollup.count === 0) {
        return "No signups on the board yet today — still time to change that 💪";
    }
    const top = rollup.by_rep.slice(0, 6);
    const names = top.map((r) => `${r.rep_name.split(' ')[0]} ${r.count > 1 ? `×${r.count}` : ''}`).join(', ');
    const more = rollup.by_rep.length > 6 ? ` + ${rollup.by_rep.length - 6} more` : '';
    return `${rollup.count} on the board so far — ${names}${more}. Let's keep stacking 🔥`;
}
async function fetchRecentChatMessages(limit = 40) {
    const token = process.env.GROUPME_TOKEN || (await (async () => {
        try {
            const { readFileSync } = await import('fs');
            const { homedir } = await import('os');
            return readFileSync(`${homedir()}/.groupme-token`, 'utf-8').trim();
        }
        catch {
            return '';
        }
    })());
    if (!token)
        return [];
    try {
        const r = await fetch(`https://api.groupme.com/v3/groups/${SALES_GROUP_ID}/messages?limit=${limit}&token=${token}`);
        if (!r.ok)
            return [];
        const data = await r.json();
        const msgs = data?.response?.messages || [];
        return msgs
            .map((m) => ({
            name: m.name || 'unknown',
            text: String(m.text || '').slice(0, 400),
            created_at: m.created_at,
            sender_type: m.sender_type || 'user',
        }))
            .filter((m) => m.text.length > 0)
            .reverse(); // chronological
    }
    catch (e) {
        console.warn('[SusanBot] fetchRecentChatMessages err:', e);
        return [];
    }
}
// ─── MRMS radar at-address-on-date (precise point lookup) ───────────────────
// Complements hailAtAddress (which searches verified_hail_events within 15mi).
// MRMS is the 30-min radar grid — tells us hail AT THE PROPERTY vs only near it.
async function mrmsAtAddressDate(addr, geo, isoDate) {
    try {
        const result = await getMrmsHailAtPoint(isoDate, geo.lat, geo.lng);
        console.log(`[SusanBot] MRMS ${isoDate} @ (${geo.lat.toFixed(3)},${geo.lng.toFixed(3)}) → atPoint=${result?.atLocation ?? '-'}`);
        return result;
    }
    catch (e) {
        console.warn('[SusanBot] mrmsAtAddressDate err:', e);
        return null;
    }
}
async function mrmsRecentAtAddress(geo, daysBack = 3) {
    try {
        const result = await getRecentMrmsHailAtPoint(geo.lat, geo.lng, daysBack);
        return result;
    }
    catch (e) {
        console.warn('[SusanBot] mrmsRecentAtAddress err:', e);
        return null;
    }
}
// ─── Insurance company directory lookup ────────────────────────────────────
async function insuranceDirectoryLookup(pool, carriers) {
    if (carriers.length === 0)
        return [];
    try {
        const patterns = carriers.map((c) => `%${c.toLowerCase().replace(/_/g, ' ')}%`);
        const placeholders = patterns.map((_, i) => `LOWER(name) LIKE $${i + 1}`).join(' OR ');
        const result = await pool.query(`SELECT name, phone, email, category, website, notes
       FROM insurance_companies
       WHERE ${placeholders}
       ORDER BY name ASC LIMIT 10`, patterns);
        return result.rows;
    }
    catch (e) {
        if (e?.message?.includes('does not exist'))
            return [];
        console.warn('[SusanBot] insuranceDirectoryLookup err:', e);
        return [];
    }
}
function needsInsuranceDirectory(text, carriers) {
    if (carriers.length === 0)
        return false;
    return /\b(phone|fax|email|number|contact|claim\s*number|file\s*a\s*claim|portal|login|how\s+to\s+file|how\s+do\s+i\s+file|where\s+do\s+i|submit|who\s+do\s+i\s+call|website|app)\b/i.test(text);
}
async function hailAtAddress(pool, lat, lng, 
// Widened 24→120 months (10 years) after the NOAA NCEI + NCEI SWDI
// historical backfill landed 256K tagged rows back to 2015. LIMIT 12
// downstream still keeps the result tight for the LLM prompt, and
// ORDER BY event_date DESC makes sure recent storms lead even when
// the rep asks about an address with a long history.
monthsBack = 120) {
    // Query verified_hail_events_public within 15 miles over last N months
    // Haversine formula in SQL (3959 = earth radius miles)
    try {
        const result = await pool.query(`SELECT event_date, state, hail_size_inches, wind_mph, public_verification_count,
              (3959 * acos(
                 cos(radians($1)) * cos(radians(latitude)) *
                 cos(radians(longitude) - radians($2)) +
                 sin(radians($1)) * sin(radians(latitude))
              )) AS distance_miles
       FROM verified_hail_events_public_sane
       WHERE event_date >= CURRENT_DATE - ($3::int * INTERVAL '30 days')
         AND (hail_size_inches >= 0.25 OR wind_mph >= 40)
         AND (3959 * acos(
                cos(radians($1)) * cos(radians(latitude)) *
                cos(radians(longitude) - radians($2)) +
                sin(radians($1)) * sin(radians(latitude))
             )) <= 15
       ORDER BY event_date DESC, hail_size_inches DESC NULLS LAST
       LIMIT 12`, [lat, lng, monthsBack]);
        console.log(`[SusanBot] hailAtAddress (${lat.toFixed(3)}, ${lng.toFixed(3)}) ${monthsBack}mo → ${result.rows.length} hits`);
        return result.rows;
    }
    catch (e) {
        console.warn('[SusanBot] hailAtAddress err:', e);
        return [];
    }
}
let CANONICAL_NAMES_CACHE = null;
async function loadCanonicalNames(pool) {
    const now = Date.now();
    if (CANONICAL_NAMES_CACHE && now - CANONICAL_NAMES_CACHE.at < 5 * 60 * 1000) {
        return CANONICAL_NAMES_CACHE.rows;
    }
    try {
        const result = await pool.query(`SELECT name FROM knowledge_documents WHERE category='adjuster-intel'`);
        const rows = [];
        for (const r of result.rows) {
            const full = r.name; // "Adjuster Intel: Nicholas Cecaci (Nick CC) (SeekNow)"
            const m = full.match(/^Adjuster Intel:\s*(.+?)(?:\s*\(([^)]+)\))?(?:\s*\(([^)]+)\))?\s*$/);
            if (!m)
                continue;
            const display = m[1].trim();
            const company = (m[3] || m[2] || '').trim() || undefined;
            rows.push({
                display,
                lowered: display.toLowerCase(),
                kbDocName: full,
                company,
                tokens: display.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean),
            });
        }
        CANONICAL_NAMES_CACHE = { at: now, rows };
        return rows;
    }
    catch (e) {
        console.warn('[SusanBot] canonical names load err:', e);
        return CANONICAL_NAMES_CACHE?.rows || [];
    }
}
// Levenshtein — O(n*m), adequate for short names
function lev(a, b) {
    const n = a.length, m = b.length;
    if (n === 0)
        return m;
    if (m === 0)
        return n;
    const dp = new Array(m + 1);
    for (let j = 0; j <= m; j++)
        dp[j] = j;
    for (let i = 1; i <= n; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= m; j++) {
            const tmp = dp[j];
            dp[j] = a[i - 1] === b[j - 1]
                ? prev
                : 1 + Math.min(prev, dp[j - 1], dp[j]);
            prev = tmp;
        }
    }
    return dp[m];
}
// Simple similarity 0..1 using Levenshtein over max length
function similarity(a, b) {
    const al = a.toLowerCase(), bl = b.toLowerCase();
    if (al === bl)
        return 1;
    const maxLen = Math.max(al.length, bl.length);
    if (maxLen === 0)
        return 1;
    return 1 - lev(al, bl) / maxLen;
}
// Best canonical-name match. Carrier hint boosts score.
function findCanonicalName(input, carriers, canonicals) {
    const inputLower = input.toLowerCase().trim();
    if (!inputLower || inputLower.length < 2)
        return null;
    const inputTokens = inputLower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (inputTokens.length === 0)
        return null;
    let best = null;
    for (const c of canonicals) {
        // 1) exact
        if (c.lowered === inputLower) {
            return { canonical: c, score: 1, reason: 'exact' };
        }
        let score = 0;
        let reason = '';
        // 2) substring (either direction)
        if (c.lowered.includes(inputLower) || inputLower.includes(c.lowered)) {
            score = 0.95;
            reason = 'substring';
        }
        else {
            // 3) token overlap — count tokens in common
            const overlap = inputTokens.filter((t) => c.tokens.includes(t)).length;
            if (overlap > 0) {
                const tokenScore = overlap / Math.max(c.tokens.length, inputTokens.length);
                if (tokenScore > score) {
                    score = 0.6 + 0.3 * tokenScore; // 0.6 base + up to 0.3 boost
                    reason = 'token_overlap';
                }
            }
            // 4) Levenshtein fallback for typos/nicknames
            const levScore = similarity(inputLower, c.lowered);
            if (levScore > score) {
                score = levScore;
                reason = 'lev';
            }
        }
        // Carrier boost: if input's carrier-hint matches canonical's company, add 0.05
        if (c.company && carriers.length > 0) {
            const companyLower = c.company.toLowerCase();
            for (const car of carriers) {
                if (companyLower.includes(car.toLowerCase()) || car.toLowerCase().includes(companyLower)) {
                    score = Math.min(1, score + 0.05);
                    break;
                }
            }
        }
        if (!best || score > best.score) {
            best = { canonical: c, score, reason };
        }
    }
    // Only accept matches above threshold
    if (best && best.score >= 0.65)
        return best;
    return null;
}
const ENTITY_EXTRACT_SYSTEM = `You extract structured entities from a single GroupMe message in a roofing sales team chat. The team works insurance claims for hail/wind damage in VA/MD/PA.

Return a STRICT JSON object with keys:
{
  "adjusters": [string],     // adjuster/inspector/engineer/IA names mentioned (proper nouns; also keep nicknames like "Nick CC")
  "carriers": [string],      // insurance carriers (usaa, allstate, state farm, travelers, erie, nationwide, liberty mutual, farmers, progressive, etc) — lowercase, no "insurance" suffix
  "storm_dates": [string],   // storm/hail/wind dates in ISO YYYY-MM-DD when possible; else the raw phrase ("8/29/24", "last Tuesday")
  "topics": [string],        // short topic tags like "approval strategy", "reinspection", "codes", "supplement"
  "is_followup": boolean,    // true if the message uses pronouns/references without restating ("what about him", "that guy", "yesterday's one") — indicates context dependency
  "intent": "adjuster_intel" | "carrier_intel" | "storm_intel" | "process" | "social" | "other"
}

Rules:
- If nothing fits a key, use []
- Do NOT include "Susan" as an adjuster
- Do NOT include the rep who is speaking
- Output ONLY the JSON object, no prose, no markdown fences`;
async function groqExtract(text, historySnippet) {
    const key = process.env.GROQ_API_KEY;
    if (!key)
        return null;
    const userContent = historySnippet
        ? `RECENT CONTEXT (most recent last):\n${historySnippet}\n\nNEW MESSAGE:\n${text}`
        : `MESSAGE:\n${text}`;
    try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: ENTITY_EXTRACT_SYSTEM },
                    { role: 'user', content: userContent },
                ],
                max_tokens: 400,
                temperature: 0.2,
                response_format: { type: 'json_object' },
            }),
        });
        if (!resp.ok) {
            console.warn('[SusanBot] groq extract failed:', resp.status);
            return null;
        }
        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content)
            return null;
        const parsed = JSON.parse(content);
        return {
            adjusters: Array.isArray(parsed.adjusters) ? parsed.adjusters : [],
            carriers: Array.isArray(parsed.carriers) ? parsed.carriers.map((c) => c.toLowerCase()) : [],
            storm_dates: Array.isArray(parsed.storm_dates) ? parsed.storm_dates : [],
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
            is_followup: Boolean(parsed.is_followup),
            intent: typeof parsed.intent === 'string' ? parsed.intent : 'other',
        };
    }
    catch (e) {
        console.warn('[SusanBot] groq extract err:', e);
        return null;
    }
}
// Heuristic fallback — quick regex-based extraction if Groq unavailable
function heuristicExtract(text) {
    const carriers = [];
    const carrierPat = /\b(allstate|usaa|state\s*farm|nationwide|travelers|liberty\s*mutual|erie|progressive|farmers|geico|encompass|chubb|amica|hartford|cincinnati|hanover|kemper|metlife|safeco)\b/gi;
    let m;
    while ((m = carrierPat.exec(text)) !== null) {
        carriers.push(m[1].toLowerCase().replace(/\s+/g, '_'));
    }
    // Proper-noun-ish words (capitalized, 3+ chars, not sentence-initial only)
    const adjusters = [];
    const properPat = /\b([A-Z][a-zA-Z'\-]{2,}(?:\s+[A-Z][a-zA-Z'\-]+){0,2})\b/g;
    while ((m = properPat.exec(text)) !== null) {
        const name = m[1];
        if (/^(Susan|Susan\s+21|I|The|This|That|My|Your|Hey|Hi|Hello|Yes|No|Ok|Okay|Allstate|USAA|State|Travelers|Nationwide|Erie|Liberty|Mutual|Progressive|Farmers|Geico|Hartford|Cincinnati|Hanover|Amica|Chubb|Safeco|Kemper|Metlife|DMV|VA|MD|PA|NOAA|NWS|MRMS)$/i.test(name))
            continue;
        adjusters.push(name);
    }
    const storm_dates = extractStormDates(text);
    const hasStorm = mentionsStorm(text) || storm_dates.length > 0;
    return {
        adjusters,
        carriers: [...new Set(carriers)],
        storm_dates,
        topics: [],
        is_followup: /\b(him|her|them|that\s+guy|yesterday|earlier|before|the\s+one)\b/i.test(text),
        intent: hasStorm ? 'storm_intel'
            : adjusters.length > 0 ? 'adjuster_intel'
                : carriers.length > 0 ? 'carrier_intel'
                    : 'other',
        raw_fallback: true,
    };
}
async function extractEntities(text, historySnippet) {
    const groqResult = await groqExtract(text, historySnippet);
    if (groqResult)
        return groqResult;
    return heuristicExtract(text);
}
// Derive a thread_id: the reply-chain root. If the message replies to another
// message, we follow the chain. For a top-level message we use its own id.
function deriveThreadId(msg) {
    if (msg.attachments) {
        for (const a of msg.attachments) {
            if (a?.type === 'reply') {
                const rid = a.base_reply_id || a.reply_id;
                if (rid)
                    return String(rid);
            }
        }
    }
    return String(msg.id);
}
async function saveUserTurn(pool, msg, entities) {
    try {
        await pool.query(`INSERT INTO bot_conversation_turns
         (group_id, thread_id, message_id, role, sender_user_id, sender_name, text, entities)
       VALUES ($1, $2, $3, 'user', $4, $5, $6, $7)
       ON CONFLICT (message_id) DO NOTHING`, [
            String(msg.group_id || SALES_GROUP_ID),
            deriveThreadId(msg),
            String(msg.id),
            String(msg.user_id || msg.sender_id || ''),
            msg.name || null,
            String(msg.text || ''),
            JSON.stringify(entities),
        ]);
    }
    catch (e) {
        console.warn('[SusanBot] save user turn err:', e);
    }
}
async function saveBotTurn(pool, repliedToMsg, botMessageId, reply, kbHits, stormHits, provider, latencyMs, qualityFlags) {
    try {
        await pool.query(`INSERT INTO bot_conversation_turns
         (group_id, thread_id, message_id, role, sender_user_id, sender_name,
          text, kb_hits, storm_hits, provider, latency_ms, quality_flags)
       VALUES ($1, $2, $3, 'bot', NULL, 'Susan 21', $4, $5, $6, $7, $8, $9)
       ON CONFLICT (message_id) DO NOTHING`, [
            String(repliedToMsg.group_id || SALES_GROUP_ID),
            deriveThreadId(repliedToMsg),
            botMessageId || `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            reply,
            JSON.stringify(kbHits.map((h) => ({ name: h.name, rank: h.rank }))),
            JSON.stringify(stormHits.map((s) => ({
                date: s.event_date, state: s.state, hail: s.hail_size_inches, wind: s.wind_mph,
            }))),
            provider,
            latencyMs,
            JSON.stringify(qualityFlags),
        ]);
    }
    catch (e) {
        console.warn('[SusanBot] save bot turn err:', e);
    }
}
async function getThreadHistory(pool, threadId, limit = 6) {
    try {
        const result = await pool.query(`SELECT message_id, role, sender_name, text, entities, created_at
       FROM bot_conversation_turns
       WHERE thread_id = $1
       ORDER BY created_at DESC
       LIMIT $2`, [threadId, limit]);
        return result.rows
            .map((r) => ({
            message_id: r.message_id,
            role: r.role,
            sender_name: r.sender_name,
            text: r.text,
            entities: r.entities,
            created_at: r.created_at,
        }))
            .reverse(); // chronological
    }
    catch {
        return [];
    }
}
function historySnippet(turns) {
    if (turns.length === 0)
        return null;
    return turns
        .slice(-5)
        .map((t) => `[${t.role === 'bot' ? 'Susan' : t.sender_name || 'rep'}] ${t.text}`)
        .join('\n');
}
// ─── Quality gate ────────────────────────────────────────────────────────────
const BANNED_PHRASES = [
    'based on the knowledge base',
    'according to the documents',
    'according to the knowledge base',
    "i'd be happy to help",
    'let me know if you need',
    "it's worth noting that",
    "it's important to consider",
    'i can tell you that',
    'i can help with',
    'as an ai',
    "i'm an ai",
    'as an assistant',
    'great question',
    'that is a great question',
    'absolutely!',
    'certainly!',
    'hope this helps',
];
function qualityCheck(reply) {
    const flags = {};
    if (!reply)
        return { ok: false, flags: { empty: true } };
    const trimmed = reply.trim();
    if (trimmed.length < 20)
        flags.too_short = true;
    if (trimmed.length > 900)
        flags.too_long = true;
    const low = trimmed.toLowerCase();
    for (const p of BANNED_PHRASES) {
        if (low.includes(p)) {
            flags.banned_phrase = p;
            break;
        }
    }
    // Truncation heuristic: ends mid-word (no sentence-ending punctuation, no emoji, ends in a letter)
    if (trimmed.length > 30) {
        const last = trimmed.slice(-1);
        const looksTruncated = /[a-z]/i.test(last) && !/[.!?)\]"']/.test(trimmed.slice(-3));
        if (looksTruncated)
            flags.maybe_truncated = true;
    }
    // "Susan 21:" or similar prefix
    if (/^susan\s*21\s*[:\-]/i.test(trimmed))
        flags.susan_prefix = true;
    const ok = !flags.empty && !flags.too_short && !flags.banned_phrase && !flags.maybe_truncated;
    return { ok, flags };
}
// ─── Multi-provider reply generation ─────────────────────────────────────────
// Primary: Gemini 2.5 Flash (FREE, 1500 req/day free tier)
// Fallback: Groq Llama 3.3 70B (FREE, very fast)
// Last resort: Claude Haiku 4.5 (paid, reliable)
function buildPromptLines(message, kbHits, stormHits, entities, history, addressHail, chatContext, insuranceDir, cityHail) {
    const lines = [`SENDER: ${message.name}`, `MESSAGE: ${message.text}`];
    if (history.length > 0) {
        lines.push('\nCONVERSATION_HISTORY (most recent last — use to resolve "him"/"that guy"/follow-ups):');
        for (const t of history.slice(-5)) {
            const who = t.role === 'bot' ? 'Susan' : t.sender_name || 'rep';
            lines.push(`  [${who}] ${t.text.slice(0, 220)}`);
        }
    }
    if (entities) {
        const parts = [];
        if (entities.adjusters.length)
            parts.push(`adjusters: ${entities.adjusters.join(', ')}`);
        if (entities.carriers.length)
            parts.push(`carriers: ${entities.carriers.join(', ')}`);
        if (entities.storm_dates.length)
            parts.push(`storm_dates: ${entities.storm_dates.join(', ')}`);
        if (entities.topics.length)
            parts.push(`topics: ${entities.topics.join(', ')}`);
        if (entities.is_followup)
            parts.push(`IS_FOLLOWUP: true (the rep is referring back to something in history)`);
        parts.push(`intent: ${entities.intent}`);
        if (parts.length > 0)
            lines.push(`\nENTITIES: ${parts.join(' · ')}`);
    }
    if (kbHits.length > 0) {
        lines.push('\nKB_HITS (authoritative — USE verbatim, don\'t invent):');
        for (const h of kbHits.slice(0, 3)) {
            lines.push(`  [${h.category}] ${h.name}`);
            lines.push(`    ${(h.content || '').slice(0, 1400)}`);
        }
        // When KB flags an adjuster/carrier as tough/negative, tell Susan to fire
        // the Roof-ER confidence pivot so the rep never gets left feeling deflated.
        if (hasNegativeIntel(kbHits)) {
            lines.push('\nNEGATIVE_INTEL_DETECTED: true');
            lines.push('  → Follow the verdict with a ROOF-ER CONFIDENCE PIVOT (see PERSONALITY 🦅 rule). Flip "aw not this guy" → "I got this, we are ROOF ER." Do not leave the rep deflated.');
        }
    }
    if (stormHits.length > 0) {
        lines.push('\nSTORM_HITS (verified hail/wind events from NOAA/NWS/NEXRAD/MRMS):');
        for (const s of stormHits.slice(0, 10)) {
            lines.push(`  ${s.event_date} ${s.state || '?'} — hail ${s.hail_size_inches || '-'}", wind ${s.wind_mph || '-'}mph, ${s.public_verification_count}x verified`);
        }
    }
    if (chatContext && chatContext.length > 0) {
        // Structured signups brief (parsed deterministically so Susan can't miscount)
        const todayStart = startOfTodayEDT();
        const todaySignups = parseDailySignups(chatContext, todayStart);
        if (todaySignups.length > 0) {
            lines.push(`\nSIGNUPS_TODAY (structured parse of team sign-up posts since midnight EDT):`);
            // Aggregate per rep
            const perRep = {};
            for (const s of todaySignups) {
                (perRep[s.rep] ||= []).push(s);
            }
            const repOrder = Object.entries(perRep).sort((a, b) => b[1].length - a[1].length);
            lines.push(`  Total: ${todaySignups.length} sign-ups across ${repOrder.length} reps.`);
            for (const [rep, list] of repOrder) {
                const byCarrier = list.map((l) => `${l.carrier || '?'} (${l.customer || '?'})`).join(', ');
                lines.push(`  • ${rep}: ${list.length}× — ${byCarrier}`);
            }
        }
        lines.push(`\nCHAT_CONTEXT (last ${chatContext.length} messages in the Sales Team chat, chronological):`);
        for (const c of chatContext.slice(-40)) {
            const ts = new Date(c.created_at * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
            const who = c.sender_type === 'bot' ? 'Susan' : c.name;
            lines.push(`  [${ts}] ${who}: ${c.text.slice(0, 280)}`);
        }
    }
    if (addressHail && addressHail.address) {
        const a = addressHail.address;
        lines.push(`\nADDRESS_LOOKUP for "${a.street}${a.city ? ', ' + a.city : ''}${a.state ? ', ' + a.state : ''}${a.zip ? ' ' + a.zip : ''}":`);
        if (!addressHail.geo) {
            lines.push('  (could not geocode — ask rep for city/state/zip)');
        }
        else {
            lines.push(`  Geocoded to (${addressHail.geo.lat.toFixed(3)}, ${addressHail.geo.lng.toFixed(3)}) via ${addressHail.geo.source}.`);
            // NEW primary signal: swath-first tiered impact report.
            const impact = addressHail.impact;
            if (impact && typeof impact === 'object') {
                const dh = Array.isArray(impact.directHits) ? impact.directHits : [];
                const nm = Array.isArray(impact.nearMiss) ? impact.nearMiss : [];
                const ai = Array.isArray(impact.areaImpact) ? impact.areaImpact : [];
                if (dh.length > 0) {
                    lines.push(`  🎯 DIRECT HITS (property sits INSIDE an MRMS swath on these dates — authoritative, lead with these):`);
                    for (const d of dh.slice(0, 6)) {
                        const srcs = Array.isArray(d.sources) && d.sources.length > 0 ? ` sources=${d.sources.join('+')}` : '';
                        const lbl = d.sizeLabel ? ` (${d.sizeLabel})` : '';
                        lines.push(`    ${d.date} — ${d.maxHailInches}"${lbl} MRMS swath · ${d.confirmingReportCount} confirming reports within 2mi${d.noaaConfirmed ? ' · NOAA-confirmed' : ''}${srcs}`);
                    }
                }
                if (nm.length > 0) {
                    lines.push(`  AT LOCATION (not in a swath but ≤3mi from a verified point report):`);
                    for (const n of nm.slice(0, 4)) {
                        lines.push(`    ${n.date} — up to ${n.maxHailInches || '-'}" at ${Number(n.nearestMiles).toFixed(1)}mi${n.noaaConfirmed ? ' · NOAA-confirmed' : ''}`);
                    }
                }
                if (ai.length > 0) {
                    lines.push(`  AREA IMPACT (3-15mi away — neighborhood context only):`);
                    for (const x of ai.slice(0, 3)) {
                        lines.push(`    ${x.date} — up to ${x.maxHailInches || '-'}" at ${Number(x.nearestMiles).toFixed(1)}mi`);
                    }
                }
                if (dh.length === 0 && nm.length === 0 && ai.length === 0) {
                    lines.push(`  NO verified hail/wind events within 15 miles in the last 24 months. NOAA/NWS/NEXRAD/MRMS all clean for this address.`);
                }
            }
            else if (addressHail.events.length === 0) {
                lines.push(`  NO verified hail/wind events within 15 miles in the last 24 months. If rep insists there was a storm, it may be below NOAA reporting threshold.`);
            }
            else {
                // Fallback: impact service failed — use legacy events list
                lines.push(`  Found ${addressHail.events.length} verified event(s) within 15mi over 24mo (legacy point-distance view, no swath check):`);
                for (const e of addressHail.events.slice(0, 8)) {
                    lines.push(`    ${e.event_date} — hail ${e.hail_size_inches || '-'}", wind ${e.wind_mph || '-'}mph, ${Number(e.distance_miles).toFixed(1)}mi away, ${e.public_verification_count}x verified`);
                }
            }
        }
        // MRMS radar-at-point (exact property, more precise than "within 15mi").
        // MRMS service returns numbers-or-null at each radius band (atLocation, within1mi, etc).
        if (addressHail.mrms) {
            const m = addressHail.mrms;
            lines.push(`\n  MRMS_RADAR (direct radar grid at the property, 30-min resolution):`);
            if (typeof m.atLocation === 'number' && m.atLocation > 0) {
                lines.push(`    AT the property: ${m.atLocation.toFixed(2)}" max hail${m.date ? ' on ' + m.date : ''}`);
            }
            if (typeof m.within1mi === 'number' && m.within1mi > 0)
                lines.push(`    within 1mi: ${m.within1mi.toFixed(2)}"`);
            if (typeof m.within3mi === 'number' && m.within3mi > 0)
                lines.push(`    within 3mi: ${m.within3mi.toFixed(2)}"`);
            if (typeof m.within10mi === 'number' && m.within10mi > 0)
                lines.push(`    within 10mi: ${m.within10mi.toFixed(2)}"`);
            if (Array.isArray(m.events) && m.events.length > 0) {
                lines.push(`    Recent 3-day MRMS events at the property:`);
                for (const ev of m.events.slice(0, 5)) {
                    const size = ev.atLocation ?? ev.within1mi ?? ev.within3mi ?? ev.within10mi;
                    lines.push(`      ${ev.date} — ${typeof size === 'number' ? size.toFixed(2) : '-'}" max`);
                }
            }
        }
    }
    if (insuranceDir && insuranceDir.length > 0) {
        lines.push(`\nINSURANCE_DIRECTORY (from internal carrier directory — use these exact contacts, don't invent):`);
        for (const c of insuranceDir.slice(0, 5)) {
            const bits = [c.name];
            if (c.phone)
                bits.push(`phone: ${c.phone}`);
            if (c.email)
                bits.push(`email: ${c.email}`);
            if (c.category)
                bits.push(`app: ${c.category}`);
            if (c.website)
                bits.push(`portal: ${c.website}`);
            lines.push(`  ${bits.join(' | ')}`);
            if (c.notes)
                lines.push(`    notes: ${String(c.notes).slice(0, 300)}`);
        }
    }
    if (cityHail && cityHail.geo) {
        const mode = cityHail.mode || 'by_date';
        const events = cityHail.events || [];
        // NEW: structured CITY_IMPACT blocks (deterministic, per-date) go
        // first. Susan's LLM is instructed to use these numbers verbatim —
        // no more state-level "hail in VA" generalizations. See
        // services/cityImpactService.ts for the block format.
        if (cityHail.cityImpactBlocks && cityHail.cityImpactBlocks.length > 0) {
            for (const block of cityHail.cityImpactBlocks) {
                lines.push('');
                lines.push(block);
            }
        }
        if (mode === 'by_date') {
            // Dated lookup — rep named specific date(s), just show what hit those dates.
            const sorted = events.slice().sort((a, b) => (Number(b.hail_size_inches) || 0) - (Number(a.hail_size_inches) || 0));
            const actionable = sorted.filter((e) => Number(e.hail_size_inches) >= 1.0);
            const subThreshold = sorted.filter((e) => Number(e.hail_size_inches) < 1.0);
            lines.push(`\nCITY_HAIL_LOOKUP for "${cityHail.city}, ${cityHail.state}" on dates [${cityHail.dates.join(', ')}]:`);
            lines.push(`  Geocoded to (${cityHail.geo.lat.toFixed(3)}, ${cityHail.geo.lng.toFixed(3)}) via ${cityHail.geo.source}. Radius: 15 miles. Found ${events.length} verified event(s).`);
            if (actionable.length > 0) {
                lines.push(`  ACTIONABLE (≥1.0" hail):`);
                for (const e of actionable.slice(0, 6)) {
                    lines.push(`    ${e.event_date} — ${e.hail_size_inches}" hail, ${Number(e.distance_miles).toFixed(1)}mi from center, ${e.public_verification_count}x verified`);
                }
            }
            if (subThreshold.length > 0) {
                lines.push(`  SUB-THRESHOLD (<1.0"):`);
                for (const e of subThreshold.slice(0, 3)) {
                    lines.push(`    ${e.event_date} — ${e.hail_size_inches}" hail, ${Number(e.distance_miles).toFixed(1)}mi`);
                }
            }
        }
        else {
            // Recent lookup (no specific date) — split into BIGGEST and MOST RECENT
            // so Susan can clearly offer both angles when rep asks ambiguously.
            const split = splitCityEvents(events);
            lines.push(`\nCITY_RECENT_HAIL for "${cityHail.city}, ${cityHail.state}" (rep asked city-level, no specific date):`);
            lines.push(`  Geocoded (${cityHail.geo.lat.toFixed(3)}, ${cityHail.geo.lng.toFixed(3)}) via ${cityHail.geo.source}. Radius: 15 mi. Window: last 24 months. Filter: hail ≥ 0.75". Total: ${split.totalEvents} event(s) across ${split.totalDates} distinct date(s).`);
            if (split.biggest.length > 0) {
                lines.push(`  BIGGEST (strongest claim angle — rank by hail size):`);
                for (const e of split.biggest) {
                    lines.push(`    ${e.event_date} — ${e.hail_size_inches}" hail, ${Number(e.distance_miles).toFixed(1)}mi from center`);
                }
            }
            if (split.mostRecent.length > 0) {
                lines.push(`  MOST RECENT (fresh claim window — rank by date):`);
                for (const e of split.mostRecent) {
                    lines.push(`    ${e.event_date} — ${e.hail_size_inches}" hail, ${Number(e.distance_miles).toFixed(1)}mi from center`);
                }
            }
            lines.push(`  INSTRUCTION: If rep's question is ambiguous ("what date should I use") → offer BOTH biggest and most recent with a quick "which you want — biggest angle or freshest date?" Close with "${split.totalDates} total dates in last 24mo, can drop the full list if you want."`);
            lines.push(`  If rep asked "LAST"/"RECENT"/"latest" → lead with MOST RECENT, then mention "biggest recent was [date] [size]" as backup angle.`);
            lines.push(`  If rep asked "BIGGEST"/"best"/"strongest" → lead with BIGGEST, then mention "most recent was [date] [size]" as freshness note.`);
        }
        if (events.length === 0) {
            lines.push(`  NO verified events within 15mi ${mode === 'by_date' ? 'on those date(s)' : 'in the last 24 months'}. Stand your ground — if rep insists, say our NOAA/NWS/NEXRAD DB is clean, suggest checking the office or CoCoRaHS. DO NOT fabricate a hail size to agree with the rep.`);
            lines.push(`  🚫 DO NOT suggest events from other states as "nearby" — ${cityHail.city} is in ${cityHail.state}, cross-state consolation is IRRELEVANT.`);
        }
    }
    return lines.join('\n');
}
// When the question is about legal/code/matching/denial/argument topics,
// we explicitly search Insurance Arguments + State Regulations categories
// because generic docs out-rank them on pure FTS tokens.
function isLegalArgumentQuery(text) {
    return /\b(matching|denial|argument|code|law|irc|ibc|usbc|vebc|comar|statute|regulation|ordinance|license|licensed|permit|pa\s+matching|md\s+matching|va\s+matching|maryland\s+matching)\b/i.test(text);
}
function detectState(text) {
    if (/\b(maryland|\bmd\b)\b/i.test(text))
        return 'MD';
    if (/\b(virginia|\bva\b)\b/i.test(text))
        return 'VA';
    if (/\b(pennsylvania|\bpa\b)\b/i.test(text))
        return 'PA';
    return null;
}
async function legalArgumentKbSearch(pool, text) {
    const state = detectState(text);
    // Pull candidates from Insurance Arguments + State Regulations categories.
    // Boost rows whose name mentions the detected state or the keyword "matching".
    const cleaned = text.toLowerCase().replace(/[^\w\s]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter((w) => w.length >= 3).slice(0, 15);
    const tsquery = tokens.length ? tokens.map((t) => `${t}:*`).join(' | ') : 'law:*';
    const statePat = state ? `%${state === 'MD' ? 'maryland' : state === 'VA' ? 'virginia' : 'pennsylvania'}%` : '%';
    try {
        const result = await pool.query(`SELECT name, category, content,
              ts_rank(search_vector, to_tsquery('english', $1)) +
              (CASE WHEN category IN ('Insurance Arguments', 'State Regulations', 'Insurance & Building Codes') THEN 0.5 ELSE 0 END) +
              (CASE WHEN LOWER(name) LIKE $2 OR LOWER(content) LIKE $2 THEN 0.3 ELSE 0 END) +
              (CASE WHEN LOWER(name) LIKE '%matching%' OR LOWER(name) LIKE '%code%' OR LOWER(name) LIKE '%law%' THEN 0.4 ELSE 0 END) AS rank
       FROM knowledge_documents
       WHERE (
         category IN ('Insurance Arguments', 'State Regulations', 'Insurance & Building Codes')
         OR search_vector @@ to_tsquery('english', $1)
       )
       ORDER BY rank DESC
       LIMIT 5`, [tsquery, statePat]);
        return result.rows;
    }
    catch (e) {
        console.warn('[SusanBot] legalArgumentKbSearch err:', e);
        return [];
    }
}
// Run the KB search using entity-driven tsquery, with fallback to raw tokens.
async function smartKbSearch(pool, text, entities, canonicals) {
    // 1) For each extracted adjuster, fuzzy-match to canonical name and query by that doc name
    const hitsByDoc = new Map();
    for (const raw of entities.adjusters) {
        const match = findCanonicalName(raw, entities.carriers, canonicals);
        if (match) {
            try {
                const r = await pool.query(`SELECT name, category, content, ts_rank(search_vector, to_tsquery('english', $1)) AS rank
           FROM knowledge_documents
           WHERE name = $2
           LIMIT 1`, [match.canonical.lowered.split(/\s+/).map((t) => `${t}:*`).join(' | ') || 'a:*', match.canonical.kbDocName]);
                for (const row of r.rows) {
                    row.rank = Math.max(row.rank || 0, 0.5 * match.score);
                    hitsByDoc.set(row.name, row);
                }
            }
            catch { }
        }
    }
    // 2) Carrier-intel docs for each detected carrier
    for (const carrier of entities.carriers) {
        try {
            const carrierUpper = carrier.replace(/_/g, ' ').toUpperCase();
            const r = await pool.query(`SELECT name, category, content, 0.5::float AS rank
         FROM knowledge_documents
         WHERE category='carrier-intel' AND name ILIKE $1
         LIMIT 1`, [`%${carrierUpper}%`]);
            for (const row of r.rows)
                hitsByDoc.set(row.name, row);
        }
        catch { }
    }
    // 3) If question is about legal/code/matching/denial, prioritize Insurance Arguments
    if (isLegalArgumentQuery(text)) {
        const legalHits = await legalArgumentKbSearch(pool, text);
        for (const h of legalHits) {
            if (!hitsByDoc.has(h.name))
                hitsByDoc.set(h.name, h);
        }
    }
    // 4) Fallback: run the existing token FTS search and merge
    const tokenHits = await kbSearch(pool, text);
    for (const h of tokenHits) {
        if (!hitsByDoc.has(h.name))
            hitsByDoc.set(h.name, h);
    }
    return Array.from(hitsByDoc.values()).slice(0, 5);
}
async function tryGemini(prompt) {
    const key = process.env.GEMINI_API_KEY;
    if (!key)
        return { reply: null, error: 'no_gemini_key' };
    try {
        // NB: Gemini 2.5 Flash enables "thinking" tokens by default which eat into
        // maxOutputTokens budget and truncate replies mid-sentence. We use 2.0-flash
        // (which has no thinking mode) so our budget is dedicated to real output.
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
        const body = {
            systemInstruction: { parts: [{ text: PERSONALITY }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 400, temperature: 0.8 },
        };
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            const t = await resp.text();
            return { reply: null, error: `gemini_${resp.status}:${t.slice(0, 150)}` };
        }
        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text === 'string' && text.trim().length > 0) {
            return { reply: text.trim().slice(0, 900) };
        }
        return { reply: null, error: 'gemini_empty' };
    }
    catch (e) {
        return { reply: null, error: `gemini_fetch:${e?.name || 'err'}` };
    }
}
async function tryGroq(prompt) {
    const key = process.env.GROQ_API_KEY;
    if (!key)
        return { reply: null, error: 'no_groq_key' };
    try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: PERSONALITY },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 250,
                temperature: 0.8,
            }),
        });
        if (!resp.ok) {
            const t = await resp.text();
            return { reply: null, error: `groq_${resp.status}:${t.slice(0, 150)}` };
        }
        const data = await resp.json();
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text === 'string' && text.trim().length > 0) {
            return { reply: text.trim().slice(0, 900) };
        }
        return { reply: null, error: 'groq_empty' };
    }
    catch (e) {
        return { reply: null, error: `groq_fetch:${e?.name || 'err'}` };
    }
}
async function tryClaude(prompt) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key)
        return { reply: null, error: 'no_anthropic_key' };
    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 250,
                system: [{ type: 'text', text: PERSONALITY, cache_control: { type: 'ephemeral' } }],
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        if (!resp.ok) {
            const t = await resp.text();
            return { reply: null, error: `anthropic_${resp.status}:${t.slice(0, 150)}` };
        }
        const data = await resp.json();
        const block = data?.content?.[0];
        if (block?.type === 'text' && typeof block.text === 'string') {
            return { reply: block.text.trim().slice(0, 900) };
        }
        return { reply: null, error: 'claude_empty' };
    }
    catch (e) {
        return { reply: null, error: `claude_fetch:${e?.name || 'err'}` };
    }
}
// ─── Roof-ER confidence pivot — server-side safety net ─────────────────────
// The LLM sometimes skips the pivot even when the prompt demands it. This
// post-processor guarantees a pivot sentence gets appended to replies where
// NEGATIVE_INTEL_DETECTED=true was signaled and no pivot marker is present.
const PIVOT_BANK = [
    "End of the day — doesn't matter who it is, we're ROOF ER 🦅 just tell me how you wanna play it.",
    "Between me and you? No adjuster's stopping us. You got Susan 21 + the wealth of Roof-ER knowledge they won't see coming. LFG 🔥",
    "Not scared of this one. You + me + the Roof-ER playbook — we handle it any way you want.",
    "You know, I know, we know — nobody's stopping us. How you wanna approach him?",
    "Don't sweat it. Roof-ER runs this game. What's your move — we'll cook him.",
    "At the end of the day, we're ROOF ER 🔥 Tell me your angle and we go.",
    "Flip it — this is exactly the kind of adjuster Roof-ER reps eat for lunch. How you wanna line it up?",
];
let __lastPivotIdx = -1;
function nextPivot() {
    let i = Math.floor(Math.random() * PIVOT_BANK.length);
    if (i === __lastPivotIdx)
        i = (i + 1) % PIVOT_BANK.length; // avoid back-to-back repeat
    __lastPivotIdx = i;
    return PIVOT_BANK[i];
}
const PIVOT_MARKER_REGEX = /(roof[-\s]?er|lfg|stopping us|stopping you|not scared|not worried|got you|got this|we handle|we got|we run|cook him|cook em|cook 'em|wealth of|playbook|eat for lunch|run it back|we go|flip it|game over|game on|my guy,? we|you.?re good|not sweating)/i;
function applyPivotIfNeeded(reply, negativeIntelDetected) {
    if (!reply || !negativeIntelDetected)
        return reply;
    if (PIVOT_MARKER_REGEX.test(reply))
        return reply; // LLM already pivoted — leave it
    // Need to append a pivot. Keep total under ~700 chars (GroupMe 1000 hard cap).
    const pivot = nextPivot();
    const combined = `${reply.trim()} ${pivot}`;
    return combined.length > 900 ? combined.slice(0, 897).replace(/\s+\S*$/, '') + '…' : combined;
}
async function generateReply(message, kbHits, stormHits, entities, history, addressHail, chatContext, insuranceDir, cityHail) {
    const prompt = buildPromptLines(message, kbHits, stormHits, entities, history, addressHail, chatContext, insuranceDir, cityHail);
    const negativeIntelDetected = hasNegativeIntel(kbHits || []);
    const providers = [
        ['gemini', tryGemini],
        ['groq', tryGroq],
        ['claude', tryClaude],
    ];
    const errors = [];
    let retries = 0;
    let lastFlags = {};
    for (const [name, fn] of providers) {
        const r = await fn(prompt);
        if (!r.reply) {
            errors.push(`${name}=${r.error || 'empty'}`);
            console.warn(`[SusanBot] ${name} failed: ${r.error}`);
            retries++;
            continue;
        }
        // Quality gate — reject banned phrases / truncation / too-short
        const q = qualityCheck(r.reply);
        if (!q.ok) {
            errors.push(`${name}=quality:${JSON.stringify(q.flags)}`);
            console.warn(`[SusanBot] ${name} failed quality gate:`, q.flags);
            lastFlags = q.flags;
            retries++;
            continue;
        }
        // Server-side pivot safety net — guarantee the rep never feels deflated
        const finalReply = applyPivotIfNeeded(r.reply, negativeIntelDetected);
        if (finalReply !== r.reply) {
            console.log(`[SusanBot] pivot appended (negative intel, LLM skipped it)`);
            q.flags.pivot_appended = true;
        }
        return { reply: finalReply, provider: name, qualityFlags: q.flags, retries };
    }
    return { reply: null, error: errors.join(' | '), qualityFlags: lastFlags, retries };
}
export async function postToGroupMe(text, replyToId, groupId) {
    const botId = botIdForGroup(groupId);
    if (!botId) {
        console.error('[SusanBot] no bot_id for group', groupId, '— cannot post');
        return null;
    }
    const body = {
        bot_id: botId,
        text: text.slice(0, 999),
    };
    if (replyToId) {
        body.attachments = [
            { type: 'reply', reply_id: replyToId, base_reply_id: replyToId },
        ];
    }
    try {
        const r = await fetch('https://api.groupme.com/v3/bots/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            const t = await r.text();
            console.error(`[SusanBot] post_err ${r.status}: ${t}`);
            return null;
        }
        // GroupMe /bots/post returns empty body; we don't get the bot's message_id here.
        // If we need it for reply-tracking, a quick follow-up GET on /groups/:id/messages
        // can fetch the latest. Simpler: we track replied-to-ids instead.
        return 'ok';
    }
    catch (e) {
        console.error('[SusanBot] post_exc:', e);
        return null;
    }
}
// ─── Router ──────────────────────────────────────────────────────────────────
export function createSusanGroupMeBotRoutes(pool) {
    const router = Router();
    // Health / info endpoint (for testing)
    router.get('/info', (req, res) => {
        res.json({
            bot_id: BOT_ID ? `${BOT_ID.slice(0, 6)}…${BOT_ID.slice(-4)}` : null,
            group_id: SALES_GROUP_ID,
            seen_messages: seenMessageIds.size,
            susan_own_messages: susanOwnMessageIds.size,
            replies_today: repliedAt.length,
            max_hour: MAX_REPLIES_PER_HOUR,
            max_day: MAX_REPLIES_PER_DAY,
            providers: {
                gemini: !!process.env.GEMINI_API_KEY,
                groq: !!process.env.GROQ_API_KEY,
                claude: !!process.env.ANTHROPIC_API_KEY,
            },
            storm_lookup: true,
        });
    });
    // Handler for GroupMe callback — receives every message in Sales Team
    const webhookHandler = async (req, res) => {
        // ACK fast so GroupMe doesn't retry
        res.status(200).json({ ok: true });
        const msg = req.body;
        if (!msg || !msg.id || !msg.text)
            return;
        // Test-mode header — skip POST to GroupMe but still run full pipeline + save to audit
        // Used by the test harness to validate behavior without spamming the live chat.
        const testMode = req.headers['x-susan-test'] === 'true';
        // Dedup (GroupMe can resend)
        if (seenMessageIds.has(String(msg.id)))
            return;
        seenMessageIds.add(String(msg.id));
        if (seenMessageIds.size > 5000) {
            const first = seenMessageIds.values().next().value;
            if (first !== undefined)
                seenMessageIds.delete(first);
        }
        // Skip the bot's own messages (prevent loops)
        if (msg.sender_type === 'bot')
            return;
        if (msg.name === 'Susan 21')
            return;
        // Allow Sales Team + the private test group (if configured).
        // Everything else (stray groups, unrelated bots) is ignored.
        const isAllowedGroup = String(msg.group_id) === SALES_GROUP_ID ||
            (TEST_GROUP_ID && String(msg.group_id) === TEST_GROUP_ID);
        if (msg.group_id && !isAllowedGroup)
            return;
        const text = String(msg.text || '').trim();
        // ────────────────────────────────────────────────────────────────────
        // STORM-ALERT APPROVAL GATE — test-group only. When a storm alert is
        // posted under LIVE_MRMS_ALERT_ENABLED=approval-gate, it lands in the
        // test group as a PROPOSAL with a token (A-XXXXX). A reviewer replies
        // ✅/yes (optionally with the token) → forward to Sales Team. ❌/no
        // → drop. Runs BEFORE length filter / mention check so "yes" alone
        // is enough.
        // ────────────────────────────────────────────────────────────────────
        if (TEST_GROUP_ID && String(msg.group_id) === TEST_GROUP_ID && text.length > 0 && text.length < 80) {
            try {
                const { parseApprovalCommand, approvePendingAlert, rejectPendingAlert, attachPostedMessageId, fmtEasternClock } = await import('../services/pendingAlertsService.js');
                const cmd = parseApprovalCommand(text);
                if (cmd) {
                    const decidedBy = msg.name || 'reviewer';
                    if (cmd.action === 'approve') {
                        const row = await approvePendingAlert(pool, cmd.alertId, decidedBy);
                        if (!row) {
                            await postToGroupMe(cmd.alertId
                                ? `🤷 No pending alert with id ${cmd.alertId} (expired or already decided).`
                                : `🤷 No pending alert to approve.`, String(msg.id), String(msg.group_id));
                            return;
                        }
                        // Forward to the original target (usually Sales Team)
                        const fwdRes = await fetch('https://api.groupme.com/v3/bots/post', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ bot_id: row.target_bot_id, text: row.message_text }),
                        });
                        const ok = fwdRes.ok;
                        await attachPostedMessageId(pool, row.id, null);
                        const sentAt = fmtEasternClock();
                        await postToGroupMe(ok
                            ? `✅ Sent ${row.alert_id} → Sales Team at ${sentAt}. (approved by ${decidedBy})`
                            : `❌ Approval recorded but forward POST failed (status ${fwdRes.status}). Try again.`, String(msg.id), String(msg.group_id));
                        console.log(`[SusanBot] approval-gate: ${row.alert_id} approved by ${decidedBy} forward_ok=${ok}`);
                        return;
                    }
                    if (cmd.action === 'reject') {
                        const row = await rejectPendingAlert(pool, cmd.alertId, decidedBy);
                        const at = fmtEasternClock();
                        await postToGroupMe(row
                            ? `🛑 Skipped ${row.alert_id} at ${at}. (rejected by ${decidedBy})`
                            : `🤷 Nothing pending to skip.`, String(msg.id), String(msg.group_id));
                        console.log(`[SusanBot] approval-gate: ${row?.alert_id || '(none)'} rejected by ${decidedBy}`);
                        return;
                    }
                }
            }
            catch (e) {
                console.error('[SusanBot] approval-gate handler err:', e.message);
            }
        }
        if (text.length < 10)
            return;
        // Reply condition
        const mentioned = textMentionsSusan(text);
        const isReply = isReplyToSusan(msg.attachments || []);
        // SIGNUP LOGGING — every signup post gets saved to bot_signup_log regardless
        // of whether Susan is addressed. Powers evening recap, leader queries, and
        // late-signup follow-ups.
        if (SIGNUP_PREFIX.test(text)) {
            const parsed = parseSignupPost(text, msg.name || '', msg.created_at || Math.floor(Date.now() / 1000));
            if (parsed) {
                const saved = await saveSignupToLog(pool, msg, parsed);
                // LATE-SIGNUP FOLLOW-UP — if today's recap was already posted (within
                // last ~3 hours), Susan replies to the new signup acknowledging the
                // late add and updating the day's total. Runs at most once per signup.
                if (saved) {
                    try {
                        const recapRes = await pool.query(`SELECT recap_date, posted_at, signup_count_at_post, late_updates
               FROM bot_recap_state
               WHERE recap_date = (NOW() AT TIME ZONE 'America/New_York')::date
                 AND posted_at > NOW() - INTERVAL '3 hours'
               ORDER BY posted_at DESC LIMIT 1`);
                        const recap = recapRes.rows[0];
                        if (recap) {
                            const rollup = await getTodaySignupRollup(pool);
                            const repFirst = (msg.name || '').split(' ')[0] || 'chief';
                            const lateText = `Late add from @${msg.name || 'rep'} 🔥 Updated count: ${rollup.count} on the board today. Nice, ${repFirst}.`;
                            await postToGroupMe(lateText, String(msg.id), String(msg.group_id));
                            await pool.query(`UPDATE bot_recap_state SET late_updates = late_updates + 1 WHERE recap_date = $1`, [recap.recap_date]);
                            console.log(`[SusanBot] late-signup follow-up posted — new_count=${rollup.count}`);
                        }
                    }
                    catch (e) {
                        console.warn('[SusanBot] late-signup watcher err:', e);
                    }
                }
            }
            // Signups don't trigger a normal reply — they're operational, not questions.
            // (Unless the signup post ALSO @-mentions Susan, in which case we still want
            // to respond below. For now, keep them pass-through to the normal flow.)
        }
        // MILESTONE ENGAGEMENT — celebrate big wins / alerts / signups with hype.
        // Fires regardless of whether rep addressed Susan. Rate-limited to
        // prevent spam — max 1 celebration per 10 min. Short, single-sentence.
        const milestone = isMilestonePost(text, msg.name || '');
        if (milestone.match && shouldCelebrateNow()) {
            const phrase = nextMilestonePhrase();
            if (!testMode) {
                await postToGroupMe(phrase, String(msg.id), String(msg.group_id));
                markCelebrated();
                repliedAt.push(Date.now());
            }
            console.log(`[SusanBot] milestone=${milestone.reason} celebrated with: "${phrase}"`);
            // Don't return — milestone celebration is a SIDE effect; we still let
            // the normal flow run in case the rep also addressed Susan or the
            // passive-intel path needs to capture something.
        }
        // PASSIVE INTEL LEARNING — runs BEFORE the trigger check so we capture
        // intel even when reps are talking to each other (not to Susan). This
        // queues candidates for admin review; nothing is auto-written to KB here.
        if (!mentioned && !isReply) {
            const intel = looksLikeIntel(text);
            if (intel.match) {
                const dup = await hasSimilarCandidate(pool, msg.name || '', text);
                if (!dup) {
                    // Pull a little context from recent chat (best-effort, non-blocking)
                    fetchRecentChatMessages(10).then((recent) => {
                        queueLearningCandidate(pool, msg, recent, intel).catch(() => { });
                    }).catch(() => { });
                }
            }
            return; // no reply — we just observed
        }
        // LEADER RECAP QUERY — Ross/Reese/Luis/Oliver/Ford/Ahmed can ask Susan for
        // the day's signup count in chat and get an immediate factual rollup.
        // Non-leaders hit the normal LLM path so we don't expose ops data broadly.
        const querySenderId = String(msg.user_id || msg.sender_id || '');
        const queryLeaderName = RECAP_QUERY_LEADERS[querySenderId];
        if (queryLeaderName && isSignupRecapQuery(text)) {
            const rollup = await getTodaySignupRollup(pool);
            const reply = formatSignupRecapForChat(rollup);
            if (!testMode) {
                await postToGroupMe(reply, String(msg.id), String(msg.group_id));
                repliedAt.push(Date.now());
            }
            console.log(`[SusanBot] leader recap query from ${queryLeaderName} — count=${rollup.count}`);
            return;
        }
        // TEACHING DIRECTIVE — "Susan remember that X"
        // Trusted leaders (Oliver/Ford/Reese/Ahmed) → auto-save as canon
        // Reps → queued for leadership review. Either way Ahmed is emailed.
        // This fires BEFORE rate limits because teaching is admin work.
        const teachingFact = detectRememberDirective(text);
        if (teachingFact) {
            const senderId = String(msg.user_id || msg.sender_id || '');
            const trustedName = TRUSTED_TEACHERS[senderId];
            const isTrusted = !!trustedName;
            const senderName = String(msg.name || 'rep');
            let confirmReply;
            if (isTrusted) {
                const docId = await writeTrustedTeaching(pool, msg, trustedName, teachingFact);
                emailTeachingEvent('trusted', trustedName, senderName, teachingFact, String(msg.id), docId)
                    .catch(() => { });
                confirmReply = `Locked in. Saved as team canon from @${trustedName}. Ahmed's been notified 📝`;
            }
            else {
                const candId = await queuePendingTeaching(pool, msg, teachingFact);
                emailTeachingEvent('pending', senderName, senderName, teachingFact, String(msg.id), candId)
                    .catch(() => { });
                confirmReply = `Heard you @${senderName} — saving canon is leadership-only. Queued it for Ahmed / Reese / Oliver / Ford to confirm before it becomes part of my knowledge 🙏`;
            }
            if (!testMode) {
                await postToGroupMe(confirmReply, String(msg.id), String(msg.group_id));
                repliedAt.push(Date.now());
            }
            console.log(`[SusanBot] teaching mode=${isTrusted ? 'trusted' : 'pending'} sender=${senderName} fact="${teachingFact.slice(0, 80)}"`);
            return; // skip normal LLM reply — this was a command, not a question
        }
        // Rate limits
        const rate = withinRate();
        if (!rate.ok) {
            console.log(`[SusanBot] rate_limit ${rate.reason} skip msg=${msg.id} from ${msg.name}`);
            return;
        }
        console.log(`[SusanBot] trigger=${mentioned ? 'mention' : 'reply_to_susan'} from ${msg.name}: ${text.slice(0, 80)}`);
        // REDIRECT MODE — every @susan gets a fixed redirect (no LLM, no KB).
        // Used when leadership wants Susan muted but reps still pointed at the
        // right app. Hail/wind/storm/address questions go to Hail Yes;
        // everything else goes to sa21. Set SUSAN_REDIRECT_MODE=true on
        // Railway. Test-mode bypasses so harness can exercise the full pipeline.
        if (process.env.SUSAN_REDIRECT_MODE === 'true' && !testMode) {
            const isStormish = /\b(hail|wind|storm|swath|nexrad|mrms|address|property)\b/i.test(text);
            const redirectReply = isStormish
                ? 'For that, pull it in Hail Yes: https://hailyes.up.railway.app 🌩️ — verified storm dates, NCEI-cited PDFs, what adjusters accept.'
                : 'For that, hit the app: https://sa21.up.railway.app 🙏 Susan AI, profiles, email & repair-letter generators — all there.';
            const posted = await postToGroupMe(redirectReply, String(msg.id), String(msg.group_id));
            if (posted)
                repliedAt.push(Date.now());
            console.log(`[SusanBot] REDIRECT_MODE ${posted ? 'replied' : 'post_failed'} (${isStormish ? 'hail-yes' : 'sa21'}) to ${msg.name}: ${text.slice(0, 60)}`);
            try {
                await saveBotTurn(pool, msg, null, redirectReply, [], [], 'redirect-mode', 0, { redirect_mode: true, route: isStormish ? 'hail-yes' : 'sa21' });
            }
            catch { }
            return;
        }
        // REBUILD MODE — reply with a scripted "being upgraded" message per rep (not spam).
        // Set SUSAN_REBUILD_MODE=true in Railway env while we're rewiring her internals.
        // Test-mode header bypasses rebuild mode so the harness can exercise the full pipeline.
        if (process.env.SUSAN_REBUILD_MODE === 'true' && !testMode) {
            const senderKey = `${msg.user_id || msg.sender_id || msg.name}`;
            // @ts-ignore — we hang a rebuildGreeted set on globalThis; survives function calls, resets on redeploy
            const greeted = globalThis.__susanRebuildGreeted ||
                (globalThis.__susanRebuildGreeted = new Set());
            if (greeted.has(senderKey)) {
                console.log(`[SusanBot] rebuild_mode already_greeted skip for ${senderKey}`);
                return;
            }
            greeted.add(senderKey);
            const rebuildReply = "🔧 Getting upgraded right now team — full knowledge base + context memory comes online by end of day. " +
                "Swing back in a bit and I'll be way sharper. Appreciate the patience 🙏";
            const posted = await postToGroupMe(rebuildReply, String(msg.id), String(msg.group_id));
            if (posted) {
                repliedAt.push(Date.now());
                console.log(`[SusanBot] rebuild_mode REPLIED to ${msg.name}`);
            }
            return;
        }
        // Generate + post — Phase 5.1 pipeline with entity extraction + conversation memory
        const startMs = Date.now();
        try {
            const threadId = deriveThreadId(msg);
            // Parallel: load canonicals, pull conversation history
            const [canonicals, history] = await Promise.all([
                loadCanonicalNames(pool),
                getThreadHistory(pool, threadId, 6),
            ]);
            const histSnippet = historySnippet(history);
            // Entity extraction (Groq) — uses history as context
            const entities = await extractEntities(text, histSnippet);
            // Save user turn eagerly (don't block on this)
            saveUserTurn(pool, msg, entities).catch(() => { });
            // ────────────────────────────────────────────────────────────────────
            // TEAMMATE GUARD — runs BEFORE any KB search.
            // (1) Strip teammate names out of `entities.adjusters` so the KB
            //     adjuster-intel lookup can't conflate a rep with an external
            //     adjuster who happens to share part of a name.
            // (2) If the message is asking Susan to characterize a teammate
            //     ("thoughts on Ross Renzi", "what about Joe", "is X any good"),
            //     respond with a fixed redirect — no LLM, no KB. This is the
            //     fix for the 2026-04-24 "Ross Renzi: ⚠ problematic adjuster"
            //     incident.
            // ────────────────────────────────────────────────────────────────────
            const roster = await getTeamRoster();
            if (roster) {
                // (1) prune teammates from the adjuster list
                const before = entities.adjusters.length;
                entities.adjusters = entities.adjusters.filter(a => !isTeammate(a, roster));
                if (entities.adjusters.length !== before) {
                    console.log(`[SusanBot] teammate-guard: pruned ${before - entities.adjusters.length} teammate name(s) from adjusters`);
                }
                // (2) opinion-attack detection
                const attack = detectTeammateOpinionRequest(text, roster, entities);
                if (attack.triggered && attack.teammateName) {
                    const reply = buildTeammateRedirect(attack.teammateName, msg.name || 'rep');
                    if (testMode) {
                        console.log(`[SusanBot] TEST_MODE teammate-guard fired: ${reply.slice(0, 80)}`);
                        await saveBotTurn(pool, msg, null, reply, [], [], 'teammate-guard', Date.now() - startMs, { teammate_guard: true, teammate_name: attack.teammateName, test_mode: true });
                        return;
                    }
                    const posted = await postToGroupMe(reply, String(msg.id), String(msg.group_id));
                    if (posted) {
                        repliedAt.push(Date.now());
                        console.log(`[SusanBot] teammate-guard fired for "${attack.teammateName}" — ${reply.slice(0, 80)}`);
                    }
                    await saveBotTurn(pool, msg, null, reply, [], [], 'teammate-guard', Date.now() - startMs, { teammate_guard: true, teammate_name: attack.teammateName });
                    return;
                }
            }
            // Extract + geocode address if rep asked about a specific property.
            // NEW: also calls addressImpactService for the tiered Direct-Hit /
            // Near-Miss / Area-Impact report (swath-first, not distance-only).
            const addr = extractAddress(text);
            const dates = extractStormDates(text);
            const addressLookupPromise = addr
                ? (async () => {
                    const geo = await geocodeAddress(addr);
                    if (!geo)
                        return { address: addr, events: [], mrms: null, impact: null };
                    // Run all three lookups in parallel:
                    //  - hailAtAddress: legacy point-report table (kept for context)
                    //  - getAddressHailImpact: swath-first tiered impact (the new authoritative signal)
                    //  - MRMS radar at the exact property grid cell
                    const [events, mrms, impact] = await Promise.all([
                        // Point-report lookup — cheap SQL, safe to run wide. 120mo covers
                        // the full NOAA NCEI / NCEI SWDI historical backfill (2015+).
                        hailAtAddress(pool, geo.lat, geo.lng, 120),
                        (dates.length > 0
                            ? mrmsAtAddressDate(addr, geo, dates[0])
                            : mrmsRecentAtAddress(geo, 3)),
                        (async () => {
                            try {
                                const { getAddressHailImpact } = await import('../services/addressImpactService.js');
                                // Swath-first impact is capped at 24mo because
                                // mrms_swath_cache only reaches back to 2022-07-12; older
                                // dates have no swath polygons anyway, so widening just
                                // wastes cold-fetch budget. On a 120mo call we observed
                                // 17 cold fetches × ~3s + 367 skipped dates = 49s per
                                // address — past Susan's internal timeout, so half the
                                // replay questions got dropped. Point-report path above
                                // still surfaces pre-2022 hail via hailAtAddress.
                                return await getAddressHailImpact(pool, geo.lat, geo.lng, 24);
                            }
                            catch (err) {
                                console.warn('[SusanBot] getAddressHailImpact failed:', err.message);
                                return null;
                            }
                        })(),
                    ]);
                    return { address: addr, geo, events, mrms, impact };
                })()
                : Promise.resolve(null);
            // CITY-LEVEL hail lookup — two modes:
            //   (a) city + specific date(s) → "was [city] hit on [date]" style. Radius
            //       search on those exact dates.
            //   (b) city + NO date → "what hail date should I use in [city]" / "when
            //       was [city] last hit". Returns recent top events in last 24mo.
            // Fixes the "Manassas 4/1" case where Susan said "no events" for a city
            // the DB actually has, because she had no handler for city-only queries.
            // Primary: "[City, ST]" / "[City ST]" explicit extraction.
            // Fallback: stateless extractor + DMV city dict lookup (zero HTTP,
            // instant, can't hang). Covers "what hit Germantown on 8/29/24"
            // style questions that drop the state.
            let cityOnlyQuery = !addr ? extractCityState(text) : null;
            if (!addr && !cityOnlyQuery) {
                const stateless = extractCityStateless(text);
                if (stateless) {
                    const { lookupDmvCity } = await import('../services/dmvCities.js');
                    // The regex can over-capture ("Germantown on August"). Try the
                    // full capture first, then peel words off the right until the
                    // dict hits. Covers both 1-word and 2-word cities (Virginia Beach,
                    // Falls Church, Silver Spring, Mt Airy, etc.).
                    const words = stateless.city.split(/\s+/);
                    for (let n = words.length; n >= 1; n--) {
                        const probe = words.slice(0, n).join(' ');
                        const hit = lookupDmvCity(probe);
                        if (hit) {
                            cityOnlyQuery = { city: hit.name, state: hit.state };
                            break;
                        }
                    }
                }
            }
            const cityHailPromise = cityOnlyQuery
                ? (async () => {
                    // Geocode via dict first (zero HTTP, instant) before falling back
                    // to Census. Covers the hot path without a network round-trip.
                    const { lookupDmvCity } = await import('../services/dmvCities.js');
                    const dictHit = lookupDmvCity(cityOnlyQuery.city);
                    let geo = dictHit
                        ? { lat: dictHit.lat, lng: dictHit.lng, source: 'dmv-dict' }
                        : null;
                    if (!geo) {
                        geo = await geocodeAddress({
                            full: `${cityOnlyQuery.city}, ${cityOnlyQuery.state}`,
                            street: cityOnlyQuery.city,
                            city: cityOnlyQuery.city,
                            state: cityOnlyQuery.state,
                        });
                    }
                    if (!geo)
                        return null;
                    let events;
                    let mode;
                    // NEW: deterministic per-date CITY_IMPACT blocks (city+specific date
                    // queries were the exact failure mode that blew up test-group
                    // iteration — Susan answered state-level when reps asked about
                    // specific cities). When we have dates AND a city we run the
                    // deterministic cityImpactService for each date; the renderer
                    // produces a structured prompt block the LLM is told to use
                    // verbatim, not summarize.
                    let cityImpactBlocks = [];
                    if (dates.length > 0) {
                        events = await hailAtCityOnDates(pool, geo.lat, geo.lng, cityOnlyQuery.city, dates);
                        mode = 'by_date';
                        try {
                            const { getCityImpactOnDate, renderCityImpactBlock } = await import('../services/cityImpactService.js');
                            const blocks = await Promise.all(dates.slice(0, 3).map((d) => // cap at 3 dates per request
                             getCityImpactOnDate(pool, geo.lat, geo.lng, cityOnlyQuery.city, cityOnlyQuery.state, d)
                                .then(renderCityImpactBlock)
                                .catch((err) => {
                                console.warn('[SusanBot] cityImpact err:', err.message);
                                return '';
                            })));
                            cityImpactBlocks = blocks.filter(Boolean);
                        }
                        catch (err) {
                            console.warn('[SusanBot] cityImpact load failed:', err.message);
                        }
                    }
                    else {
                        // No date named → find recent dates where this city WAS hit
                        events = await hailAtCityRecent(pool, geo.lat, geo.lng, cityOnlyQuery.city, 24);
                        mode = 'recent';
                    }
                    return {
                        city: cityOnlyQuery.city,
                        state: cityOnlyQuery.state,
                        geo,
                        dates,
                        events,
                        mode,
                        cityImpactBlocks,
                    };
                })()
                : Promise.resolve(null);
            // ──────────────────────────────────────────────────────────────
            // HAIL-LOOKUP FALLBACK REDIRECT — gated by HAIL_LOOKUP_FALLBACK=true
            // When on, any address/city/date hail question short-circuits to a
            // canned reply pointing reps at the web app's Storm Maps page, which
            // is the authoritative source. Needed while the city-level localizer
            // is getting rebuilt — Susan's LLM replies were summarizing to
            // state-level ("hail in VA") instead of actual verified city/distance
            // pairs, which embarrassed us in testing.
            // Adjuster/carrier/KB queries are unaffected and pass through.
            // ──────────────────────────────────────────────────────────────
            // Test-harness can bypass the fallback to exercise the real path
            // without flipping the prod env var. Only honored in test-mode.
            const bypassFallback = testMode && req.headers['x-susan-bypass-fallback'] === 'true';
            if (!bypassFallback && process.env.HAIL_LOOKUP_FALLBACK === 'true') {
                const isHailLookup = addr ||
                    (cityOnlyQuery && dates.length > 0) ||
                    (cityOnlyQuery && /\b(hail|storm)\b/i.test(text)) ||
                    (dates.length > 0 && /\b(hail|storm)\b/i.test(text));
                if (isHailLookup) {
                    const fallback = `My guy 🫡 — my in-chat address hail lookup is offline while we rebuild it. ` +
                        `For the most accurate storm date at any property, pull it up in Hail Yes: ` +
                        `https://hailyes.up.railway.app → search the address. ` +
                        `Verified hail dates, NCEI-cited swath bands, adjuster-grade PDF.`;
                    if (!testMode) {
                        await postToGroupMe(fallback, String(msg.id), String(msg.group_id));
                        repliedAt.push(Date.now());
                    }
                    console.log(`[SusanBot] HAIL_LOOKUP_FALLBACK fired for ${msg.name}: ${text.slice(0, 80)}`);
                    await saveBotTurn(pool, msg, null, fallback, [], [], 'fallback-redirect', 0, { fallback_redirect: true, test_mode: testMode });
                    return;
                }
            }
            // Pull recent chat context for recap / team-flow style questions.
            // We pull 100 so daily recaps can span the whole day (multiple hours).
            const chatContextPromise = needsChatContext(text)
                ? fetchRecentChatMessages(100)
                : Promise.resolve([]);
            // Insurance company directory lookup if rep is asking about carrier contact/portal/etc
            const insuranceDirPromise = needsInsuranceDirectory(text, entities.carriers)
                ? insuranceDirectoryLookup(pool, entities.carriers)
                : Promise.resolve([]);
            // Prefer entity-driven KB search; fall back to token FTS
            const [kbHits, stormHits, addressHail, cityHail, chatContext, insuranceDir] = await Promise.all([
                smartKbSearch(pool, text, entities, canonicals),
                stormSearch(pool, text),
                addressLookupPromise,
                cityHailPromise,
                chatContextPromise,
                insuranceDirPromise,
            ]);
            const { reply, error, provider, qualityFlags, retries } = await generateReply({ name: msg.name, text }, kbHits, stormHits, entities, history, addressHail, chatContext, insuranceDir, cityHail);
            const latencyMs = Date.now() - startMs;
            if (!reply || error) {
                console.log(`[SusanBot] skip msg=${msg.id}: gen_err=${error || 'empty'} (retries=${retries})`);
                await saveBotTurn(pool, msg, null, `(rejected — ${error || 'empty'})`, kbHits, stormHits, provider || 'none', latencyMs, { ...qualityFlags, rejected: true, retries, test_mode: testMode });
                return;
            }
            if (testMode) {
                // Test harness path — don't actually post to GroupMe. Save audit row only.
                console.log(`[SusanBot] TEST_MODE generated via ${provider} kb=${kbHits.length} storm=${stormHits.length} ents=${(entities.adjusters.length + entities.carriers.length + entities.storm_dates.length)} retries=${retries} latency=${latencyMs}ms — ${reply.slice(0, 80)}`);
                await saveBotTurn(pool, msg, null, reply, kbHits, stormHits, provider || 'unknown', latencyMs, { ...qualityFlags, retries, test_mode: true });
                return;
            }
            const posted = await postToGroupMe(reply, String(msg.id), String(msg.group_id));
            const allStorms = [...stormHits, ...(addressHail?.events ?? [])];
            if (posted) {
                repliedAt.push(Date.now());
                console.log(`[SusanBot] REPLIED via ${provider} kb=${kbHits.length} storm=${stormHits.length} addr=${addressHail?.events?.length ?? '-'} ents=${(entities.adjusters.length + entities.carriers.length + entities.storm_dates.length)} retries=${retries} latency=${latencyMs}ms — ${reply.slice(0, 80)}`);
                await saveBotTurn(pool, msg, null, reply, kbHits, allStorms, provider || 'unknown', latencyMs, { ...qualityFlags, retries, address_lookup: addr ? addr.full : null });
            }
            else {
                // Posted failed but we still want the audit row so we can debug
                await saveBotTurn(pool, msg, null, reply, kbHits, allStorms, provider || 'unknown', latencyMs, { ...qualityFlags, retries, post_failed: true, address_lookup: addr ? addr.full : null });
            }
        }
        catch (err) {
            console.error(`[SusanBot] handler err on msg ${msg.id}:`, err);
        }
    };
    // Test-mode read-only: fetch recent bot conversation turns so a script
    // can correlate its fired test messages with Susan's generated replies.
    // ?limit=N (default 20)   ?afterMsgId=<id>  (optional cursor)
    router.get('/test-turns', async (req, res) => {
        try {
            const limit = Math.min(Number(req.query.limit ?? 20), 100);
            const afterMsgId = req.query.afterMsgId ? String(req.query.afterMsgId) : null;
            const params = [limit];
            let where = '';
            if (afterMsgId) {
                params.push(afterMsgId);
                where = `AND created_at > (SELECT created_at FROM bot_conversation_turns WHERE message_id=$${params.length})`;
            }
            const { rows } = await pool.query(`SELECT message_id, role, sender_name, text, provider, latency_ms, quality_flags, created_at
           FROM bot_conversation_turns
          WHERE 1=1 ${where}
          ORDER BY created_at DESC
          LIMIT $1`, params);
            res.json({ turns: rows });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    // Register handler at both /webhook and root '/' so it's reachable from either
    // - /api/susan/groupme/webhook (new)
    // - /api/susan/groupme-webhook (legacy alias, matches the bot's registered callback_url)
    router.post('/webhook', webhookHandler);
    router.post('/', webhookHandler);
    // Audit endpoint — last N bot turns with KB hits + quality flags
    router.get('/audit', async (req, res) => {
        const limit = Math.min(parseInt(String(req.query.limit || '30'), 10) || 30, 200);
        const role = String(req.query.role || '');
        try {
            const params = [limit];
            let whereClause = '';
            if (role === 'bot' || role === 'user') {
                whereClause = 'WHERE role = $2';
                params.splice(1, 0, role);
            }
            const { rows } = await pool.query(`SELECT id, created_at, group_id, thread_id, message_id, role,
                sender_name, substring(text, 1, 400) AS text,
                entities, kb_hits, storm_hits, provider, latency_ms, quality_flags
         FROM bot_conversation_turns
         ${whereClause}
         ORDER BY created_at DESC LIMIT $1`, params.length === 1 ? params : [params[1], params[0]]);
            res.json({ count: rows.length, turns: rows });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'audit failed' });
        }
    });
    // ═══════════ Learning candidates (admin) ═══════════
    // List pending learnings for admin review
    router.get('/learnings', async (req, res) => {
        const status = String(req.query.status || 'pending');
        const limit = Math.min(Number(req.query.limit || 50), 200);
        try {
            const r = await pool.query(`SELECT id, source_message_id, sender_name, raw_text, context_messages,
                detected_entity_type, detected_name, detected_carrier, trigger_reason,
                status, proposed_kb_doc_name, proposed_kb_doc_content,
                merge_target_doc_id, created_at, reviewed_at, reviewed_by, applied_at
         FROM kb_learning_candidates
         WHERE status = $1
         ORDER BY created_at DESC LIMIT $2`, [status, limit]);
            res.json({ count: r.rows.length, candidates: r.rows });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'learnings query failed' });
        }
    });
    // Synthesize + approve a learning candidate → ingest to KB
    router.post('/learnings/:id/approve', async (req, res) => {
        const id = Number(req.params.id);
        const reviewedBy = String(req.body?.reviewed_by || 'admin');
        try {
            const cand = (await pool.query(`SELECT * FROM kb_learning_candidates WHERE id=$1 AND status='pending'`, [id])).rows[0];
            if (!cand)
                return res.status(404).json({ error: 'pending candidate not found' });
            // Check if we already have a KB doc for this adjuster — merge vs. new
            let targetDoc = null;
            if (cand.detected_name) {
                const searchKey = cand.detected_name.toLowerCase();
                const match = await pool.query(`SELECT id, name, content FROM knowledge_documents
           WHERE category = 'adjuster-intel' AND LOWER(name) LIKE $1
           ORDER BY LENGTH(content) DESC LIMIT 1`, [`%${searchKey}%`]);
                if (match.rows.length > 0)
                    targetDoc = match.rows[0];
            }
            // Synthesize via Groq (fast, free)
            const groqKey = process.env.GROQ_API_KEY;
            let synthesized = null;
            if (groqKey) {
                const prompt = `You are updating The Roof Docs adjuster knowledge base.

REP MESSAGE:
${cand.raw_text}

SURROUNDING CHAT (most recent last):
${Array.isArray(cand.context_messages) ? cand.context_messages.map((c) => `[${c.name}] ${c.text}`).join('\n') : ''}

${targetDoc ? `EXISTING KB DOC for ${cand.detected_name}:\n${targetDoc.content.slice(0, 2000)}\n\nMerge the new message's intel into this existing profile. Preserve all prior content. Add new observations under BEHAVIOR & STYLE or WATCH-OUTS with date + rep attribution.` : `No existing KB doc for this person. Create a new ADJUSTER / INSPECTOR PROFILE.`}

Output JSON with:
{
  "name": "Adjuster Intel: <Name> (<Company>)",
  "content": "<full updated profile in the same format as our KB: Name, Company, Role, REPUTATION, BEHAVIOR & STYLE, STRATEGY, WATCH-OUTS, KNOWN CONTACT, Source>",
  "category": "adjuster-intel"
}`;
                const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
                    body: JSON.stringify({
                        model: 'llama-3.3-70b-versatile',
                        messages: [
                            { role: 'system', content: 'You are a careful KB editor. Preserve existing facts, add new ones with attribution. Output ONLY the JSON object.' },
                            { role: 'user', content: prompt },
                        ],
                        max_tokens: 1500,
                        temperature: 0.3,
                        response_format: { type: 'json_object' },
                    }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    const content = data?.choices?.[0]?.message?.content;
                    if (content) {
                        try {
                            synthesized = JSON.parse(content);
                        }
                        catch { }
                    }
                }
            }
            if (!synthesized || !synthesized.content) {
                return res.status(502).json({ error: 'LLM synthesis failed', candidate: cand });
            }
            // Apply — UPDATE existing or INSERT new
            let appliedDocId;
            if (targetDoc) {
                await pool.query(`UPDATE knowledge_documents SET name=$1, content=$2 WHERE id=$3`, [synthesized.name || targetDoc.name, synthesized.content, targetDoc.id]);
                appliedDocId = targetDoc.id;
            }
            else {
                const slugName = (cand.detected_name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
                const filePath = `groupme-archive://adjuster/learned-${slugName}-${Date.now()}`;
                const ins = await pool.query(`INSERT INTO knowledge_documents (name, category, state, content, file_path)
           VALUES ($1, 'adjuster-intel', NULL, $2, $3)
           RETURNING id`, [synthesized.name, synthesized.content, filePath]);
                appliedDocId = ins.rows[0].id;
            }
            await pool.query(`UPDATE kb_learning_candidates
         SET status='approved', reviewed_at=NOW(), reviewed_by=$1, applied_at=NOW(),
             applied_kb_doc_id=$2, proposed_kb_doc_name=$3, proposed_kb_doc_content=$4,
             merge_target_doc_id=$5, llm_synthesis_raw=$6, llm_model='llama-3.3-70b-versatile'
         WHERE id=$7`, [reviewedBy, appliedDocId, synthesized.name, synthesized.content,
                targetDoc ? targetDoc.id : null, JSON.stringify(synthesized), id]);
            res.json({ ok: true, action: targetDoc ? 'merged' : 'inserted', kb_doc_id: appliedDocId, doc_name: synthesized.name });
        }
        catch (e) {
            console.error('[SusanBot] learning approve err:', e);
            res.status(500).json({ error: e?.message || 'approve failed' });
        }
    });
    router.post('/learnings/:id/reject', async (req, res) => {
        const id = Number(req.params.id);
        const reviewedBy = String(req.body?.reviewed_by || 'admin');
        const reason = String(req.body?.reason || '');
        try {
            const r = await pool.query(`UPDATE kb_learning_candidates
         SET status='rejected', reviewed_at=NOW(), reviewed_by=$1,
             llm_synthesis_raw = COALESCE(llm_synthesis_raw, '') || CASE WHEN $2 <> '' THEN ' [reject-reason: ' || $2 || ']' ELSE '' END
         WHERE id=$3 AND status='pending' RETURNING id`, [reviewedBy, reason, id]);
            if (r.rows.length === 0)
                return res.status(404).json({ error: 'pending candidate not found' });
            res.json({ ok: true });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'reject failed' });
        }
    });
    // ═══════════ Scheduled-post preview & manual trigger (admin) ═══════════
    // Preview (dry run) — returns what Susan WOULD post without posting.
    router.get('/scheduled/preview/:phase', async (req, res) => {
        const phase = String(req.params.phase);
        if (!['morning', 'midday', 'afternoon', 'evening'].includes(phase)) {
            return res.status(400).json({ error: 'phase must be morning|midday|afternoon|evening' });
        }
        try {
            const { triggerMotivationPreview } = await import('../services/susanScheduledPosts.js');
            const r = await triggerMotivationPreview(pool, phase);
            res.json(r);
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'preview failed' });
        }
    });
    // Force-post right now — actually posts to the Sales Team. Use with care.
    router.post('/scheduled/post/:phase', async (req, res) => {
        const phase = String(req.params.phase);
        if (!['morning', 'midday', 'afternoon', 'evening'].includes(phase)) {
            return res.status(400).json({ error: 'phase must be morning|midday|afternoon|evening' });
        }
        try {
            const { triggerMotivationPostNow } = await import('../services/susanScheduledPosts.js');
            const r = await triggerMotivationPostNow(pool, phase);
            res.json(r);
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'post failed' });
        }
    });
    // Force-send digest email now.
    router.post('/scheduled/digest', async (_req, res) => {
        try {
            const { triggerDailyDigest } = await import('../services/susanScheduledPosts.js');
            await triggerDailyDigest(pool);
            res.json({ ok: true, sent_to: process.env.EMAIL_ADMIN_ADDRESS || 'ahmed.mahmoud@theroofdocs.com' });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'digest failed' });
        }
    });
    // Get today's signup rollup — what Susan would reply to a leader "@susan signups today" query.
    router.get('/scheduled/signups/today', async (_req, res) => {
        try {
            const { triggerSignupRollup } = await import('../services/susanScheduledPosts.js');
            const r = await triggerSignupRollup(pool);
            res.json(r);
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'signups rollup failed' });
        }
    });
    // Force-send the 8 PM recap-preview email to the 5 leaders NOW (test).
    router.post('/scheduled/recap/preview-email', async (_req, res) => {
        try {
            const { triggerRecapPreviewEmail } = await import('../services/susanScheduledPosts.js');
            const r = await triggerRecapPreviewEmail(pool);
            res.json(r);
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'preview email failed' });
        }
    });
    // Dry-run the 8:30 PM public recap (no post, just the text + Ross check).
    router.get('/scheduled/recap/dry-run', async (_req, res) => {
        try {
            const { triggerEveningRecapNow } = await import('../services/susanScheduledPosts.js');
            const r = await triggerEveningRecapNow(pool);
            res.json(r);
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'dry-run failed' });
        }
    });
    // Feedback endpoint — reps can 👍/👎 a reply via a POST
    router.post('/feedback', async (req, res) => {
        const { message_id, vote, user_id } = req.body || {};
        if (!message_id || !['up', 'down'].includes(String(vote))) {
            return res.status(400).json({ error: 'message_id + vote=up|down required' });
        }
        try {
            await pool.query(`UPDATE bot_conversation_turns
         SET quality_flags = quality_flags || jsonb_build_object('feedback_' || $2, COALESCE((quality_flags->>('feedback_' || $2))::int, 0) + 1, 'feedback_user', $3)
         WHERE message_id = $1`, [String(message_id), String(vote), user_id ? String(user_id) : null]);
            res.json({ ok: true });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'feedback failed' });
        }
    });
    return router;
}
