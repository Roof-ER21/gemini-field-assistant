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
// ─── Config ──────────────────────────────────────────────────────────────────
const BOT_ID = process.env.GROUPME_SUSAN_BOT_ID || '';
const SALES_GROUP_ID = process.env.GROUPME_SUSAN_GROUP_ID || '93177620';
const MAX_REPLIES_PER_HOUR = 15;
const MAX_REPLIES_PER_DAY = 100;
// In-memory state. For a single-instance deploy this is fine; if we scale out
// we should move to Redis / Postgres. Given Susan is a single Railway service,
// memory is acceptable and auto-clears on restart.
const seenMessageIds = new Set(); // dedup: ids we've already processed
const susanOwnMessageIds = new Set(); // our own reply msgs (track replies-to-susan)
const repliedAt = []; // timestamps of our replies for rate-limiting
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

🔒 DATA INTEGRITY RULE:
- When STORM_HITS is provided, use the ACTUAL dates + hail sizes + states from those rows.
- When KB_HITS is provided, use the ACTUAL adjuster names + carriers + tactics from those rows.
- When ADDRESS_LOOKUP is provided, that's the authoritative property-specific hail record. Lead with the most recent/largest event at that address and give the date + size + distance-in-miles.
- If STORM_HITS is empty, say "nothing verified on that date in our system" — NEVER invent hail sizes.
- If ADDRESS_LOOKUP shows "no events", tell the rep straight: "no verified hail within 15mi at that address in 24 months. NOAA/NWS/NEXRAD all clean."
- If KB_HITS is empty for a specific name asked about, use the "no intel" fallback — don't guess.

📻 CHAT_CONTEXT — team-flow questions:
- When CHAT_CONTEXT is provided, the rep is asking about the recent chat itself (recap, signups, what happened today, team wins).
- READ the messages, extract real facts (sales counts, wins, approvals, shoutouts, sign-up posts), and summarize.
- Format: "[#] signups today 🔥 Joe M 🦅🦅, Royce/Eric/Nick/Kevin each 1..." — use actual names + numbers from the messages.
- If the question is "who got signups" or "team count", count sign-up posts in CHAT_CONTEXT (look for 'sign up', 'signup', 'e-sign', 'esign', claim-type emojis like 🦅🔥💪).
- NEVER make up numbers — only count what's visible in CHAT_CONTEXT.
- If nothing relevant is in CHAT_CONTEXT, say "no sign-ups posted in the last N messages — the board might be elsewhere".

🏠 ADDRESS QUERIES — when ADDRESS_LOOKUP is present:
- Reps say "was there hail at 1234 Oak Ln" expecting you to look it up. You get that data in ADDRESS_LOOKUP.
- Reply format: "[Address] → [X] verified hail events in last 24mo. Most recent: [date], [size]" hail, [distance]mi away 🔥"
- If the largest event is big (≥1.0" hail): "🔥 [date] had [size]" hail — good angle for this claim"
- If only small stuff: "smaller events only ([size]") — may be sub-threshold for actionable claim"

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
- STORM_HITS — verified NOAA/NWS/NEXRAD events when a date was mentioned.

You're a teammate with encyclopedic memory of this chat. Talk like one. Make it count — reps are asking mid-appointment.

TEAM HIERARCHY (recognize these people when they ask you something):
- Oliver Brown — Owner of The Roof Docs. Give him respect and a confident, clean answer.
- Reese Samala — Director of Sales. Treat like a field general; he's been in the trenches.
- Ford Barsi — General Manager. Steady hand, keeps things moving.
- Ahmed Mahmoud — your architect. When he asks, open with a small nod or cool line ("top" / "my guy" / "the one who plugged me in") BEFORE the answer. Keep it brief, don't make it awkward.
- Nick Bourdin — #1 poster in this chat over 3 years (5,672 messages, 27k likes). The GOAT teacher, trains new reps. Acknowledge his authority when he asks something.

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
         FROM verified_hail_events_public
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
         FROM verified_hail_events_public
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
// ─── Chat context — for recap / team / "today" style questions ───────────────
function needsChatContext(text) {
    return /\b(recap|today|yesterday|summary|summarize|catch\s+me\s+up|catch\s+up|what\s+happened|what\s+did|wins|signups?|sign\s+ups?|total|team\s+did|team\s+hit|day|week|what's\s+new|whats\s+new)\b/i.test(text);
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
async function hailAtAddress(pool, lat, lng, monthsBack = 24) {
    // Query verified_hail_events_public within 15 miles over last N months
    // Haversine formula in SQL (3959 = earth radius miles)
    try {
        const result = await pool.query(`SELECT event_date, state, hail_size_inches, wind_mph, public_verification_count,
              (3959 * acos(
                 cos(radians($1)) * cos(radians(latitude)) *
                 cos(radians(longitude) - radians($2)) +
                 sin(radians($1)) * sin(radians(latitude))
              )) AS distance_miles
       FROM verified_hail_events_public
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
function buildPromptLines(message, kbHits, stormHits, entities, history, addressHail, chatContext) {
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
    }
    if (stormHits.length > 0) {
        lines.push('\nSTORM_HITS (verified hail/wind events from NOAA/NWS/NEXRAD/MRMS):');
        for (const s of stormHits.slice(0, 10)) {
            lines.push(`  ${s.event_date} ${s.state || '?'} — hail ${s.hail_size_inches || '-'}", wind ${s.wind_mph || '-'}mph, ${s.public_verification_count}x verified`);
        }
    }
    if (chatContext && chatContext.length > 0) {
        lines.push(`\nCHAT_CONTEXT (last ${chatContext.length} messages in the Sales Team chat, chronological — use to answer "recap the day" / "team signups" / "what happened" style questions):`);
        for (const c of chatContext.slice(-30)) {
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
        else if (addressHail.events.length === 0) {
            lines.push(`  Geocoded ok (${addressHail.geo.lat.toFixed(3)}, ${addressHail.geo.lng.toFixed(3)}) — NO verified hail/wind events within 15 miles in the last 24 months. If rep insists there was a storm, it may be below NOAA reporting threshold.`);
        }
        else {
            lines.push(`  Geocoded to (${addressHail.geo.lat.toFixed(3)}, ${addressHail.geo.lng.toFixed(3)}) via ${addressHail.geo.source}`);
            lines.push(`  Found ${addressHail.events.length} verified event(s) within 15mi over 24mo (use these exact dates + sizes):`);
            for (const e of addressHail.events.slice(0, 8)) {
                lines.push(`    ${e.event_date} — hail ${e.hail_size_inches || '-'}", wind ${e.wind_mph || '-'}mph, ${Number(e.distance_miles).toFixed(1)}mi away, ${e.public_verification_count}x verified`);
            }
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
async function generateReply(message, kbHits, stormHits, entities, history, addressHail, chatContext) {
    const prompt = buildPromptLines(message, kbHits, stormHits, entities, history, addressHail, chatContext);
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
        return { reply: r.reply, provider: name, qualityFlags: q.flags, retries };
    }
    return { reply: null, error: errors.join(' | '), qualityFlags: lastFlags, retries };
}
async function postToGroupMe(text, replyToId) {
    if (!BOT_ID) {
        console.error('[SusanBot] GROUPME_SUSAN_BOT_ID not set — cannot post');
        return null;
    }
    const body = {
        bot_id: BOT_ID,
        text: text.slice(0, 999),
        attachments: [
            { type: 'reply', reply_id: replyToId, base_reply_id: replyToId },
        ],
    };
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
        // Only for our sales group
        if (msg.group_id && String(msg.group_id) !== SALES_GROUP_ID)
            return;
        const text = String(msg.text || '').trim();
        if (text.length < 10)
            return;
        // Reply condition
        const mentioned = textMentionsSusan(text);
        const isReply = isReplyToSusan(msg.attachments || []);
        if (!mentioned && !isReply)
            return;
        // Rate limits
        const rate = withinRate();
        if (!rate.ok) {
            console.log(`[SusanBot] rate_limit ${rate.reason} skip msg=${msg.id} from ${msg.name}`);
            return;
        }
        console.log(`[SusanBot] trigger=${mentioned ? 'mention' : 'reply_to_susan'} from ${msg.name}: ${text.slice(0, 80)}`);
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
            const posted = await postToGroupMe(rebuildReply, String(msg.id));
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
            // Extract + geocode address if rep asked about a specific property
            const addr = extractAddress(text);
            const addressLookupPromise = addr
                ? (async () => {
                    const geo = await geocodeAddress(addr);
                    if (!geo)
                        return { address: addr, events: [] };
                    const events = await hailAtAddress(pool, geo.lat, geo.lng, 24);
                    return { address: addr, geo, events };
                })()
                : Promise.resolve(null);
            // Pull recent chat context for recap / team-flow style questions
            const chatContextPromise = needsChatContext(text)
                ? fetchRecentChatMessages(40)
                : Promise.resolve([]);
            // Prefer entity-driven KB search; fall back to token FTS
            const [kbHits, stormHits, addressHail, chatContext] = await Promise.all([
                smartKbSearch(pool, text, entities, canonicals),
                stormSearch(pool, text),
                addressLookupPromise,
                chatContextPromise,
            ]);
            const { reply, error, provider, qualityFlags, retries } = await generateReply({ name: msg.name, text }, kbHits, stormHits, entities, history, addressHail, chatContext);
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
            const posted = await postToGroupMe(reply, String(msg.id));
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
