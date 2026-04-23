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
import { Router, Request, Response } from 'express';
import type pg from 'pg';
import { getMrmsHailAtPoint, getRecentMrmsHailAtPoint } from '../services/historicalMrmsService.js';
import { emailService } from '../services/emailService.js';

// ─── Config ──────────────────────────────────────────────────────────────────
const BOT_ID = process.env.GROUPME_SUSAN_BOT_ID || '';
const SALES_GROUP_ID = process.env.GROUPME_SUSAN_GROUP_ID || '93177620';
const MAX_REPLIES_PER_HOUR = 15;
const MAX_REPLIES_PER_DAY = 100;

// In-memory state. For a single-instance deploy this is fine; if we scale out
// we should move to Redis / Postgres. Given Susan is a single Railway service,
// memory is acceptable and auto-clears on restart.
const seenMessageIds = new Set<string>(); // dedup: ids we've already processed
const susanOwnMessageIds = new Set<string>(); // our own reply msgs (track replies-to-susan)
const repliedAt: number[] = []; // timestamps of our replies for rate-limiting

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

🏠 ADDRESS QUERIES — when ADDRESS_LOOKUP is present:
- Reps say "was there hail at 1234 Oak Ln" expecting you to look it up. You get that data in ADDRESS_LOOKUP.
- Reply format: "[Address] → [X] verified hail events in last 24mo. Most recent: [date], [size]" hail, [distance]mi away 🔥"
- If the largest event is big (≥1.0" hail): "🔥 [date] had [size]" hail — good angle for this claim"
- If only small stuff: "smaller events only ([size]") — may be sub-threshold for actionable claim"
- When MRMS_RADAR is present: lead with the AT-THE-PROPERTY size if any (most precise). Say "radar shows X\" AT the house" vs "X\" within 1/3/10 miles" — reps love this specificity.

☎️ INSURANCE_DIRECTORY — when present:
- Rep is asking how to contact a carrier, file a claim, get a phone/email/portal.
- USE the exact phone/email/portal from INSURANCE_DIRECTORY verbatim. Never invent numbers.
- Reply format: "[Carrier]: claims [phone], [email]. Portal: [website]. [1-line note from notes field if notable]."
- If INSURANCE_DIRECTORY is empty but rep asked for contact info: say "no entry for [carrier] in our directory yet — check the Insurance tab in the sa21 app".

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

function textMentionsSusan(text: string): boolean {
  return /\bsusan\b/i.test(text);
}

function isReplyToSusan(attachments: any[]): boolean {
  if (!attachments) return false;
  for (const a of attachments) {
    if (a?.type === 'reply') {
      const rid = a.reply_id || a.base_reply_id;
      if (rid && susanOwnMessageIds.has(String(rid))) return true;
    }
  }
  return false;
}

function pruneRateTracking(): void {
  const now = Date.now();
  const dayAgo = now - 86400000;
  while (repliedAt.length > 0 && repliedAt[0] < dayAgo) repliedAt.shift();
}

function withinRate(): { ok: boolean; reason: string } {
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

function extractStormDates(text: string): string[] {
  const dates: string[] = [];
  // M/D/YYYY or M/D/YY
  const slashRe = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = slashRe.exec(text)) !== null) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = `20${y}`;
    const moN = mo.padStart(2, '0');
    const dN = d.padStart(2, '0');
    const iso = `${y}-${moN}-${dN}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) dates.push(iso);
  }
  // M/D without year — assume current year based on context.
  // Negative lookbehind to make sure we're not matching the DD/YY tail of an already-matched
  // MM/DD/YY (otherwise "8/29/24" → extra bogus "29/24" match → month=29 crash).
  const slashNoYearRe = /(?<!\/)(?<!\d)(\d{1,2})\/(\d{1,2})(?!\/)(?!\d)/g;
  while ((m = slashNoYearRe.exec(text)) !== null) {
    const [, mo, d] = m;
    const moN = parseInt(mo, 10), dN = parseInt(d, 10);
    if (moN < 1 || moN > 12 || dN < 1 || dN > 31) continue;
    const now = new Date();
    const iso = `${now.getFullYear()}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) dates.push(iso);
  }
  // Month name + day
  const months: Record<string, string> = {
    january: '01', jan: '01', february: '02', feb: '02', march: '03', mar: '03',
    april: '04', apr: '04', may: '05', june: '06', jun: '06', july: '07', jul: '07',
    august: '08', aug: '08', september: '09', sept: '09', sep: '09',
    october: '10', oct: '10', november: '11', nov: '11', december: '12', dec: '12',
  };
  const monthRe = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{4}))?\b/gi;
  while ((m = monthRe.exec(text)) !== null) {
    const moName = m[1].toLowerCase();
    const mo = months[moName];
    if (!mo) continue;
    const d = m[2].padStart(2, '0');
    const y = m[3] || String(new Date().getFullYear());
    dates.push(`${y}-${mo}-${d}`);
  }
  return [...new Set(dates)];
}

function mentionsStorm(text: string): boolean {
  return /\b(hail|storm|wind|tornado|dol|date\s+of\s+loss|severe|damaged?|claim)\b/i.test(text);
}

async function stormSearch(
  pool: pg.Pool,
  text: string
): Promise<Array<{
  event_date: string; state: string; hail_size_inches: number | null;
  wind_mph: number | null; public_verification_count: number;
}>> {
  const dates = extractStormDates(text);
  if (dates.length === 0 && !mentionsStorm(text)) return [];
  try {
    if (dates.length > 0) {
      // Specific date lookup — give top events that day in VA/MD/PA
      // Use IN list with positional placeholders (more reliable than ANY($1::date[]))
      const placeholders = dates.map((_, i) => `$${i + 1}::date`).join(',');
      const result = await pool.query(
        `SELECT event_date, state, hail_size_inches, wind_mph, public_verification_count
         FROM verified_hail_events_public
         WHERE event_date IN (${placeholders})
           AND state IN ('VA','MD','PA','DC','WV','DE')
         ORDER BY hail_size_inches DESC NULLS LAST, wind_mph DESC NULLS LAST
         LIMIT 10`,
        dates
      );
      console.log(`[SusanBot] stormSearch dates=[${dates.join(',')}] hits=${result.rows.length}`);
      return result.rows;
    }
    // General storm ask without a date — return top recent events in region
    if (mentionsStorm(text)) {
      const result = await pool.query(
        `SELECT event_date, state, hail_size_inches, wind_mph, public_verification_count
         FROM verified_hail_events_public
         WHERE event_date >= CURRENT_DATE - INTERVAL '14 days'
           AND state IN ('VA','MD','PA','DC','WV','DE')
           AND (hail_size_inches >= 0.5 OR wind_mph >= 58)
         ORDER BY event_date DESC, hail_size_inches DESC NULLS LAST
         LIMIT 10`
      );
      return result.rows;
    }
  } catch (e) {
    console.warn('[SusanBot] storm search err:', e);
  }
  return [];
}


async function kbSearch(
  pool: pg.Pool,
  text: string
): Promise<Array<{ name: string; category: string; content: string; rank: number }>> {
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
  if (tokens.length === 0) return [];
  const tsquery = tokens.map((t) => `${t}:*`).join(' | ');
  try {
    const result = await pool.query(
      `SELECT name, category, content,
              ts_rank(search_vector, to_tsquery('english', $1)) AS rank
       FROM knowledge_documents
       WHERE search_vector @@ to_tsquery('english', $1)
       ORDER BY rank DESC LIMIT 3`,
      [tsquery]
    );
    // FTS @@ already filters non-matches; keep everything it returns.
    // (Previously filtered rank>=0.1 but real hits score 0.05-0.09 — that cutoff
    //  was eating nearly every adjuster hit and making Susan hallucinate.)
    return result.rows;
  } catch (err) {
    console.warn('[SusanBot] kb search error:', err);
    return [];
  }
}

async function repStats(
  pool: pg.Pool,
  senderName: string
): Promise<{ messages: number; likes: number } | null> {
  // Only stat known heavy posters — this info lives in groupme-archive.db (local SQLite),
  // not prod Postgres. Skip for now; future: mirror stats in a Postgres table.
  return null;
}

// ─── Address-based hail lookup ──────────────────────────────────────────────

interface ExtractedAddress {
  full: string;
  street: string;
  city?: string;
  state?: string;
  zip?: string;
}

function extractAddress(text: string): ExtractedAddress | null {
  // Two-pass: first find the "<num> <name> <suffix>" — then anchor forward to find
  // state or zip. Earlier single-regex was non-greedy and captured just 2-letter
  // city fragments ("As"/"Re") instead of the full city, because the state group
  // was optional and the city group was lazy.
  const streetRe = /\b(\d{2,6})\s+([A-Za-z][A-Za-z0-9.'\-\s]{1,60}?)\s+(st|street|ave|avenue|blvd|boulevard|dr|drive|rd|road|ln|lane|way|ct|court|pl|place|cir|circle|pkwy|parkway|hwy|highway|ter|terrace|sq|square|trl|trail)\b/i;
  const m = text.match(streetRe);
  if (!m) return null;
  const [fullStreet, num, nameRaw, suffix] = m;
  const streetEndIdx = (m.index || 0) + fullStreet.length;
  const tail = text.slice(streetEndIdx, streetEndIdx + 80);
  // Try to find state AND/OR zip in the tail
  const stateMap: Record<string, string> = {
    va: 'VA', md: 'MD', pa: 'PA', dc: 'DC', wv: 'WV', de: 'DE',
    virginia: 'VA', maryland: 'MD', pennsylvania: 'PA',
    'district of columbia': 'DC', 'west virginia': 'WV', delaware: 'DE',
  };
  const stateRe = /\b(VA|MD|PA|DC|WV|DE|Virginia|Maryland|Pennsylvania|District\s+of\s+Columbia|West\s+Virginia|Delaware)\b/i;
  const zipRe = /\b(\d{5})(?:-\d{4})?\b/;
  const sm = tail.match(stateRe);
  const zm = tail.match(zipRe);
  if (!sm && !zm) return null; // no state and no zip → not actionable address
  const state = sm ? stateMap[sm[1].toLowerCase()] || sm[1].toUpperCase() : undefined;
  const zip = zm ? zm[1] : undefined;
  // City = everything between street-suffix and state/zip, greedy trim
  let city: string | undefined = undefined;
  const cutoff = Math.min(
    sm ? (sm.index ?? 1000) : 1000,
    zm ? (zm.index ?? 1000) : 1000,
  );
  if (cutoff > 0 && cutoff < 80) {
    const rawCity = tail.slice(0, cutoff).replace(/^[.,\s]+|[.,\s]+$/g, '');
    // Reject obvious non-city tails ("in the", "last year", etc)
    if (
      rawCity.length >= 2 &&
      rawCity.length <= 40 &&
      !/\b(hail|storm|damage|claim|today|yesterday|week|month|year|ago|last|this|past)\b/i.test(rawCity)
    ) {
      city = rawCity;
    }
  }
  const street = `${num} ${nameRaw.trim()} ${suffix}`;
  // Build full display string
  const fullParts = [street];
  if (city) fullParts.push(city);
  if (state) fullParts.push(state);
  if (zip) fullParts.push(zip);
  return { full: fullParts.join(', '), street, city, state, zip };
}

async function geocodeAddress(addr: ExtractedAddress): Promise<{ lat: number; lng: number; source: string } | null> {
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
      const data: any = await r.json();
      const m = data?.result?.addressMatches?.[0];
      if (m?.coordinates?.y && m?.coordinates?.x) {
        return { lat: Number(m.coordinates.y), lng: Number(m.coordinates.x), source: 'census' };
      }
    }
  } catch (e) {
    console.warn('[SusanBot] census geocode err:', e);
  }
  // Fallback: Nominatim (OSM, 1 req/sec rate-limited globally)
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(parts)}&format=json&limit=1&countrycodes=us`;
    const r = await fetch(url, { headers: { 'User-Agent': 'RoofER-SusanBot/1.0' } });
    if (r.ok) {
      const data: any = await r.json();
      if (Array.isArray(data) && data[0]) {
        return { lat: Number(data[0].lat), lng: Number(data[0].lon), source: 'nominatim' };
      }
    }
  } catch (e) {
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
const TRUSTED_TEACHERS: Record<string, string> = {
  '18949479':  'Oliver Brown',   // Owner
  '86283554':  'Ford Barsi',     // GM
  '113016266': 'Reese Samala',   // Director of Sales
  '115896304': 'Ahmed Mahmoud',  // Creator / final authority
};

// Teaching trigger. Requires "remember/learn/save/note" + fact-inducing syntax.
// Accepts both "susan remember that X" and (when replying to Susan) just "remember that X".
const REMEMBER_RE = /^\s*(?:@?\s*susan[,\s]+)?(?:please[,\s]+)?(?:remember|learn|save|note)(?:\s+(?:that|this)\s+|[:,]\s+|\s+)(.+)$/i;

function detectRememberDirective(text: string): string | null {
  // Strip leading @mention (e.g., "@Susan 21 remember that...")
  const stripped = text.replace(/^@\S+(?:\s+\S+)?\s+/i, '').trim();
  const m = stripped.match(REMEMBER_RE);
  if (!m || !m[1]) return null;
  const fact = m[1].trim().replace(/^[,.:;\-\s]+/, '').replace(/[,.:;\-\s]+$/, '');
  if (fact.length < 8 || fact.length > 1500) return null;
  // Reject obvious question forms ("remember when X?", "remember who Y")
  if (/^(when|who|what|why|how|where|if)\b/i.test(fact) && fact.endsWith('?')) return null;
  return fact;
}

async function writeTrustedTeaching(
  pool: pg.Pool,
  msg: any,
  teacherName: string,
  fact: string
): Promise<number | null> {
  try {
    // Audit row in candidates table (status=approved)
    const candRes = await pool.query(
      `INSERT INTO kb_learning_candidates
         (source_message_id, sender_user_id, sender_name, group_id, raw_text,
          detected_entity_type, trigger_reason, status, reviewed_by, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, 'teaching', 'trusted-teacher-directive',
               'approved', $6, NOW())
       ON CONFLICT (source_message_id) DO NOTHING
       RETURNING id`,
      [
        String(msg.id),
        String(msg.user_id || ''),
        String(msg.name || teacherName),
        String(msg.group_id || SALES_GROUP_ID),
        String(msg.text).slice(0, 2000),
        `trusted:${teacherName}`,
      ]
    );

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

    const docRes = await pool.query(
      `INSERT INTO knowledge_documents (name, category, state, content, file_path)
       VALUES ($1, 'team-canon', NULL, $2, $3)
       RETURNING id`,
      [docName, docContent, filePath]
    );
    const docId = docRes.rows[0]?.id ?? null;

    if (candRes.rows[0]?.id && docId) {
      await pool.query(
        `UPDATE kb_learning_candidates
           SET applied_at=NOW(), applied_kb_doc_id=$1,
               proposed_kb_doc_name=$2, proposed_kb_doc_content=$3
         WHERE id=$4`,
        [docId, docName, docContent, candRes.rows[0].id]
      );
    }
    console.log(`[SusanBot] TRUSTED_TEACHING saved doc=${docId} teacher=${teacherName} fact="${fact.slice(0, 80)}"`);
    return docId;
  } catch (e) {
    console.warn('[SusanBot] writeTrustedTeaching err:', e);
    return null;
  }
}

async function queuePendingTeaching(
  pool: pg.Pool,
  msg: any,
  fact: string
): Promise<number | null> {
  try {
    const r = await pool.query(
      `INSERT INTO kb_learning_candidates
         (source_message_id, sender_user_id, sender_name, group_id, raw_text,
          detected_entity_type, trigger_reason, status,
          proposed_kb_doc_name, proposed_kb_doc_content)
       VALUES ($1, $2, $3, $4, $5, 'teaching', 'rep-directive', 'pending', $6, $7)
       ON CONFLICT (source_message_id) DO NOTHING
       RETURNING id`,
      [
        String(msg.id),
        String(msg.user_id || ''),
        String(msg.name || ''),
        String(msg.group_id || SALES_GROUP_ID),
        String(msg.text).slice(0, 2000),
        `Proposed by ${msg.name}: ${fact.slice(0, 72)}`,
        fact,
      ]
    );
    const id = r.rows[0]?.id ?? null;
    console.log(`[SusanBot] PENDING_TEACHING queued id=${id} from=${msg.name} fact="${fact.slice(0, 80)}"`);
    return id;
  } catch (e) {
    console.warn('[SusanBot] queuePendingTeaching err:', e);
    return null;
  }
}

async function emailTeachingEvent(
  mode: 'trusted' | 'pending',
  teacherName: string,
  senderName: string,
  fact: string,
  msgId: string,
  kbDocOrCandId: number | null
): Promise<void> {
  try {
    const subject = mode === 'trusted'
      ? `🧠 Susan learned (trusted: ${teacherName})`
      : `🧠 Susan teaching pending review — from ${senderName}`;
    const statusLine = mode === 'trusted'
      ? `✅ Auto-applied to knowledge base (KB doc #${kbDocOrCandId ?? '—'}). Teacher has trusted status.`
      : `⏳ Queued for leadership review (candidate #${kbDocOrCandId ?? '—'}). Approve at POST /api/susan/groupme/learnings/${kbDocOrCandId}/approve`;
    const factEsc = fact.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
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
  } catch (e) {
    console.warn('[SusanBot] emailTeachingEvent err:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//   PASSIVE INTEL LEARNING — watch chat for new adjuster/carrier intel,
//   queue as KB candidates for admin approval.
// ═══════════════════════════════════════════════════════════════════════════

const CARRIER_OR_VENDOR_REGEX = /\b(allstate|usaa|state\s*farm|travelers|liberty\s*mutual|erie|nationwide|progressive|farmers|geico|encompass|chubb|amica|hartford|cincinnati|hanover|kemper|metlife|safeco|homesite|american\s*family|seek\s*now|seeknow|rebuild|alacrity|patriot\s*claims|hancock|cumberland|global\s*risk|trident|allcat)\b/i;

const ASSESSMENT_WORDS = /\b(brutal|tough|easy|great|awful|terrible|amazing|the\s+boy|goat|nightmare|dream|devil|angel|reschedule|avoid|reliable|unreliable|took\s+(my|back|a)|denied|approved|flipped|refused|refuses|no\s+good|no\s+bueno|hit\s+or\s+miss|crushing|stack|save(d|)|lost|won|fight|cooking|inadequate|incompetent|killer|dbag|d-bag|jerk|cool|chill|rude|polite)\b/i;

const PROPER_NOUN_REGEX = /\b([A-Z][a-zA-Z'\-]{2,}(?:\s+[A-Z][a-zA-Z'\-]+){0,2})\b/g;

// Heuristic: does this message LOOK like rep-to-rep intel worth learning?
function looksLikeIntel(text: string): { match: boolean; reason: string; candidates: string[] } {
  if (!text || text.length < 30 || text.length > 1500) return { match: false, reason: 'length', candidates: [] };
  if (SIGNUP_PREFIX.test(text)) return { match: false, reason: 'signup_post', candidates: [] };
  const hasCarrier = CARRIER_OR_VENDOR_REGEX.test(text);
  const hasAssessment = ASSESSMENT_WORDS.test(text);
  if (!hasCarrier && !hasAssessment) return { match: false, reason: 'no_signal', candidates: [] };
  // Must have at least one proper-noun candidate that ISN'T a carrier
  const names = [...text.matchAll(PROPER_NOUN_REGEX)]
    .map((m) => m[1])
    .filter((n) => !CARRIER_OR_VENDOR_REGEX.test(n))
    .filter((n) => !/^(Susan|The|This|That|Ahmed|Ross|Nick|Oliver|Ford|Reese|Keith|Kevin|Ben|Chris|Richie|Hey|Hi|Hello|Yeah|No|Good|Great|LFG|HO|DMV|NOAA|USAA|Allstate|Travelers|Erie|State|Liberty|Nationwide|Progressive|Farmers|Homesite|Geico)$/i.test(n));
  if (names.length === 0) return { match: false, reason: 'no_proper_noun', candidates: [] };
  const reasons: string[] = [];
  if (hasCarrier) reasons.push('carrier');
  if (hasAssessment) reasons.push('assessment');
  reasons.push('proper_noun');
  return { match: true, reason: reasons.join('+'), candidates: [...new Set(names)].slice(0, 5) };
}

// Dedup: check if we've already queued a candidate with same content recently
async function hasSimilarCandidate(pool: pg.Pool, senderName: string, text: string): Promise<boolean> {
  try {
    const r = await pool.query(
      `SELECT 1 FROM kb_learning_candidates
       WHERE sender_name = $1 AND raw_text = $2 AND created_at > NOW() - INTERVAL '7 days'
       LIMIT 1`,
      [senderName, text.slice(0, 500)]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function queueLearningCandidate(
  pool: pg.Pool,
  msg: any,
  context: Array<{ name: string; text: string }>,
  trigger: { reason: string; candidates: string[] }
): Promise<void> {
  try {
    // Best-guess fields
    const carrierMatch = CARRIER_OR_VENDOR_REGEX.exec(msg.text);
    const detectedCarrier = carrierMatch ? carrierMatch[1] : null;
    const detectedName = trigger.candidates[0] || null;
    await pool.query(
      `INSERT INTO kb_learning_candidates
         (source_message_id, sender_user_id, sender_name, group_id, raw_text,
          context_messages, detected_entity_type, detected_name, detected_carrier,
          trigger_reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
       ON CONFLICT (source_message_id) DO NOTHING`,
      [
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
      ]
    );
    console.log(`[SusanBot] learning_candidate queued — sender=${msg.name}, detected_name=${detectedName}, carrier=${detectedCarrier}`);
  } catch (e) {
    console.warn('[SusanBot] queueLearningCandidate err:', e);
  }
}

// ─── Chat context — for recap / team / "today" style questions ───────────────

function needsChatContext(text: string): boolean {
  return /\b(recap|today|yesterday|summary|summarize|catch\s+me\s+up|catch\s+up|what\s+happened|what\s+did|wins|signups?|sign\s+ups?|total|team\s+did|team\s+hit|day|week|what's\s+new|whats\s+new)\b/i.test(text);
}

// ─── Sign-up post parser ────────────────────────────────────────────────────
// Team convention: reps post "Sign up / 3 sided aluminum / Roof / DS / Liberty Mutual / Getachew"
// (slash OR dash separated, first token is "sign up" or "signup", lastish token is HO name,
// carrier matches our known list, middle tokens are line items)

const CARRIER_PATTERNS: Array<[RegExp, string]> = [
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

const SIGNUP_PREFIX = /^\s*[🦅🔥💪✅🎯⚡️\s]*(sign\s*up|esign|e-sign|signup)\b/i;

interface ParsedSignup {
  rep: string;
  items: string[];
  carrier: string | null;
  customer: string | null;
  raw: string;
  ts: number;
}

function parseSignupPost(text: string, senderName: string, ts: number): ParsedSignup | null {
  if (!SIGNUP_PREFIX.test(text)) return null;
  // Normalize separators (slashes + dashes) to pipes, then split
  // Strip leading emoji + "sign up" prefix first
  let body = text.replace(SIGNUP_PREFIX, '').replace(/^[\s\/\-|:,]+/, '');
  // Split on / or -- (not single dash in middle of words like "3-sided")
  const parts = body
    .split(/\s*(?:\/|\s-\s|\s\|\s)\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p.length < 80);
  if (parts.length === 0) return null;

  let carrier: string | null = null;
  let carrierIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    for (const [re, name] of CARRIER_PATTERNS) {
      if (re.test(parts[i])) {
        carrier = name;
        carrierIdx = i;
        break;
      }
    }
    if (carrier) break;
  }

  let items: string[] = [];
  let customer: string | null = null;
  if (carrierIdx >= 0) {
    items = parts.slice(0, carrierIdx);
    const after = parts.slice(carrierIdx + 1);
    // Customer is typically the last part after the carrier
    customer = after[after.length - 1] || null;
  } else {
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

function parseDailySignups(
  messages: Array<{ name: string; text: string; created_at: number }>,
  dayStartEpoch?: number
): ParsedSignup[] {
  const out: ParsedSignup[] = [];
  for (const m of messages) {
    if (dayStartEpoch && m.created_at < dayStartEpoch) continue;
    const p = parseSignupPost(m.text, m.name, m.created_at);
    if (p) out.push(p);
  }
  return out;
}

function startOfTodayEDT(): number {
  // Approximate "today" in Eastern time (UTC-4). For simplicity use -4h shift;
  // accuracy within 1 hour is fine for "today's signups".
  const now = new Date();
  const edt = new Date(now.getTime() - 4 * 3600 * 1000);
  edt.setUTCHours(0, 0, 0, 0);
  return Math.floor((edt.getTime() + 4 * 3600 * 1000) / 1000);
}

async function fetchRecentChatMessages(limit: number = 40): Promise<Array<{name: string; text: string; created_at: number; sender_type: string}>> {
  const token = process.env.GROUPME_TOKEN || (await (async () => {
    try {
      const { readFileSync } = await import('fs');
      const { homedir } = await import('os');
      return readFileSync(`${homedir()}/.groupme-token`, 'utf-8').trim();
    } catch { return ''; }
  })());
  if (!token) return [];
  try {
    const r = await fetch(
      `https://api.groupme.com/v3/groups/${SALES_GROUP_ID}/messages?limit=${limit}&token=${token}`
    );
    if (!r.ok) return [];
    const data: any = await r.json();
    const msgs = data?.response?.messages || [];
    return msgs
      .map((m: any) => ({
        name: m.name || 'unknown',
        text: String(m.text || '').slice(0, 400),
        created_at: m.created_at,
        sender_type: m.sender_type || 'user',
      }))
      .filter((m: any) => m.text.length > 0)
      .reverse(); // chronological
  } catch (e) {
    console.warn('[SusanBot] fetchRecentChatMessages err:', e);
    return [];
  }
}

// ─── MRMS radar at-address-on-date (precise point lookup) ───────────────────
// Complements hailAtAddress (which searches verified_hail_events within 15mi).
// MRMS is the 30-min radar grid — tells us hail AT THE PROPERTY vs only near it.

async function mrmsAtAddressDate(
  addr: ExtractedAddress,
  geo: { lat: number; lng: number; source: string },
  isoDate: string
): Promise<any | null> {
  try {
    const result = await getMrmsHailAtPoint(isoDate, geo.lat, geo.lng);
    console.log(`[SusanBot] MRMS ${isoDate} @ (${geo.lat.toFixed(3)},${geo.lng.toFixed(3)}) → atPoint=${(result as any)?.atLocation ?? '-'}`);
    return result;
  } catch (e) {
    console.warn('[SusanBot] mrmsAtAddressDate err:', e);
    return null;
  }
}

async function mrmsRecentAtAddress(
  geo: { lat: number; lng: number },
  daysBack: number = 3
): Promise<any | null> {
  try {
    const result = await getRecentMrmsHailAtPoint(geo.lat, geo.lng, daysBack);
    return result;
  } catch (e) {
    console.warn('[SusanBot] mrmsRecentAtAddress err:', e);
    return null;
  }
}

// ─── Insurance company directory lookup ────────────────────────────────────

async function insuranceDirectoryLookup(
  pool: pg.Pool,
  carriers: string[]
): Promise<Array<{ name: string; phone: string | null; email: string | null; category: string | null; website: string | null; notes: string | null }>> {
  if (carriers.length === 0) return [];
  try {
    const patterns = carriers.map((c) => `%${c.toLowerCase().replace(/_/g, ' ')}%`);
    const placeholders = patterns.map((_, i) => `LOWER(name) LIKE $${i + 1}`).join(' OR ');
    const result = await pool.query(
      `SELECT name, phone, email, category, website, notes
       FROM insurance_companies
       WHERE ${placeholders}
       ORDER BY name ASC LIMIT 10`,
      patterns
    );
    return result.rows;
  } catch (e: any) {
    if (e?.message?.includes('does not exist')) return [];
    console.warn('[SusanBot] insuranceDirectoryLookup err:', e);
    return [];
  }
}

function needsInsuranceDirectory(text: string, carriers: string[]): boolean {
  if (carriers.length === 0) return false;
  return /\b(phone|fax|email|number|contact|claim\s*number|file\s*a\s*claim|portal|login|how\s+to\s+file|how\s+do\s+i\s+file|where\s+do\s+i|submit|who\s+do\s+i\s+call|website|app)\b/i.test(text);
}

async function hailAtAddress(
  pool: pg.Pool,
  lat: number,
  lng: number,
  monthsBack: number = 24
): Promise<any[]> {
  // Query verified_hail_events_public within 15 miles over last N months
  // Haversine formula in SQL (3959 = earth radius miles)
  try {
    const result = await pool.query(
      `SELECT event_date, state, hail_size_inches, wind_mph, public_verification_count,
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
       LIMIT 12`,
      [lat, lng, monthsBack]
    );
    console.log(`[SusanBot] hailAtAddress (${lat.toFixed(3)}, ${lng.toFixed(3)}) ${monthsBack}mo → ${result.rows.length} hits`);
    return result.rows;
  } catch (e) {
    console.warn('[SusanBot] hailAtAddress err:', e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//   Phase 5.1 — Rebuild: entity extraction, conversation memory, quality gate
// ═══════════════════════════════════════════════════════════════════════════

// ─── Canonical-name index (loaded once from knowledge_documents) ────────────
interface CanonicalName {
  display: string;      // e.g. "Nicholas Cecaci"
  lowered: string;      // "nicholas cecaci"
  kbDocName: string;    // "Adjuster Intel: Nicholas Cecaci (Nick CC) (SeekNow)"
  company?: string;     // "SeekNow"
  tokens: string[];     // ["nicholas", "cecaci"]
}
let CANONICAL_NAMES_CACHE: { at: number; rows: CanonicalName[] } | null = null;

async function loadCanonicalNames(pool: pg.Pool): Promise<CanonicalName[]> {
  const now = Date.now();
  if (CANONICAL_NAMES_CACHE && now - CANONICAL_NAMES_CACHE.at < 5 * 60 * 1000) {
    return CANONICAL_NAMES_CACHE.rows;
  }
  try {
    const result = await pool.query(
      `SELECT name FROM knowledge_documents WHERE category='adjuster-intel'`
    );
    const rows: CanonicalName[] = [];
    for (const r of result.rows) {
      const full: string = r.name; // "Adjuster Intel: Nicholas Cecaci (Nick CC) (SeekNow)"
      const m = full.match(/^Adjuster Intel:\s*(.+?)(?:\s*\(([^)]+)\))?(?:\s*\(([^)]+)\))?\s*$/);
      if (!m) continue;
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
  } catch (e) {
    console.warn('[SusanBot] canonical names load err:', e);
    return CANONICAL_NAMES_CACHE?.rows || [];
  }
}

// Levenshtein — O(n*m), adequate for short names
function lev(a: string, b: string): number {
  const n = a.length, m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const dp: number[] = new Array(m + 1);
  for (let j = 0; j <= m; j++) dp[j] = j;
  for (let i = 1; i <= n; i++) {
    let prev = dp[0]; dp[0] = i;
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
function similarity(a: string, b: string): number {
  const al = a.toLowerCase(), bl = b.toLowerCase();
  if (al === bl) return 1;
  const maxLen = Math.max(al.length, bl.length);
  if (maxLen === 0) return 1;
  return 1 - lev(al, bl) / maxLen;
}

interface FuzzyMatch {
  canonical: CanonicalName;
  score: number;      // 0..1
  reason: string;     // 'exact' | 'substring' | 'token_overlap' | 'lev'
}

// Best canonical-name match. Carrier hint boosts score.
function findCanonicalName(
  input: string,
  carriers: string[],
  canonicals: CanonicalName[]
): FuzzyMatch | null {
  const inputLower = input.toLowerCase().trim();
  if (!inputLower || inputLower.length < 2) return null;
  const inputTokens = inputLower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (inputTokens.length === 0) return null;
  let best: FuzzyMatch | null = null;
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
    } else {
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
  if (best && best.score >= 0.65) return best;
  return null;
}

// ─── Entity extraction via Groq ────────────────────────────────────────────

interface ExtractedEntities {
  adjusters: string[];
  carriers: string[];
  storm_dates: string[];       // already ISO when possible, else raw
  topics: string[];
  is_followup: boolean;
  intent: 'adjuster_intel' | 'carrier_intel' | 'storm_intel' | 'process' | 'social' | 'other';
  raw_fallback?: boolean;
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

async function groqExtract(text: string, historySnippet: string | null): Promise<ExtractedEntities | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
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
    const data: any = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return {
      adjusters: Array.isArray(parsed.adjusters) ? parsed.adjusters : [],
      carriers: Array.isArray(parsed.carriers) ? parsed.carriers.map((c: string) => c.toLowerCase()) : [],
      storm_dates: Array.isArray(parsed.storm_dates) ? parsed.storm_dates : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      is_followup: Boolean(parsed.is_followup),
      intent: typeof parsed.intent === 'string' ? parsed.intent as any : 'other',
    };
  } catch (e) {
    console.warn('[SusanBot] groq extract err:', e);
    return null;
  }
}

// Heuristic fallback — quick regex-based extraction if Groq unavailable
function heuristicExtract(text: string): ExtractedEntities {
  const carriers: string[] = [];
  const carrierPat = /\b(allstate|usaa|state\s*farm|nationwide|travelers|liberty\s*mutual|erie|progressive|farmers|geico|encompass|chubb|amica|hartford|cincinnati|hanover|kemper|metlife|safeco)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = carrierPat.exec(text)) !== null) {
    carriers.push(m[1].toLowerCase().replace(/\s+/g, '_'));
  }
  // Proper-noun-ish words (capitalized, 3+ chars, not sentence-initial only)
  const adjusters: string[] = [];
  const properPat = /\b([A-Z][a-zA-Z'\-]{2,}(?:\s+[A-Z][a-zA-Z'\-]+){0,2})\b/g;
  while ((m = properPat.exec(text)) !== null) {
    const name = m[1];
    if (/^(Susan|Susan\s+21|I|The|This|That|My|Your|Hey|Hi|Hello|Yes|No|Ok|Okay|Allstate|USAA|State|Travelers|Nationwide|Erie|Liberty|Mutual|Progressive|Farmers|Geico|Hartford|Cincinnati|Hanover|Amica|Chubb|Safeco|Kemper|Metlife|DMV|VA|MD|PA|NOAA|NWS|MRMS)$/i.test(name)) continue;
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

async function extractEntities(
  text: string,
  historySnippet: string | null
): Promise<ExtractedEntities> {
  const groqResult = await groqExtract(text, historySnippet);
  if (groqResult) return groqResult;
  return heuristicExtract(text);
}

// ─── Conversation memory ────────────────────────────────────────────────────

interface Turn {
  message_id: string;
  role: 'user' | 'bot';
  sender_name: string | null;
  text: string;
  entities?: ExtractedEntities;
  created_at: Date;
}

// Derive a thread_id: the reply-chain root. If the message replies to another
// message, we follow the chain. For a top-level message we use its own id.
function deriveThreadId(msg: any): string {
  if (msg.attachments) {
    for (const a of msg.attachments) {
      if (a?.type === 'reply') {
        const rid = a.base_reply_id || a.reply_id;
        if (rid) return String(rid);
      }
    }
  }
  return String(msg.id);
}

async function saveUserTurn(pool: pg.Pool, msg: any, entities: ExtractedEntities): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO bot_conversation_turns
         (group_id, thread_id, message_id, role, sender_user_id, sender_name, text, entities)
       VALUES ($1, $2, $3, 'user', $4, $5, $6, $7)
       ON CONFLICT (message_id) DO NOTHING`,
      [
        String(msg.group_id || SALES_GROUP_ID),
        deriveThreadId(msg),
        String(msg.id),
        String(msg.user_id || msg.sender_id || ''),
        msg.name || null,
        String(msg.text || ''),
        JSON.stringify(entities),
      ]
    );
  } catch (e) {
    console.warn('[SusanBot] save user turn err:', e);
  }
}

async function saveBotTurn(
  pool: pg.Pool,
  repliedToMsg: any,
  botMessageId: string | null,
  reply: string,
  kbHits: any[],
  stormHits: any[],
  provider: string,
  latencyMs: number,
  qualityFlags: Record<string, any>
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO bot_conversation_turns
         (group_id, thread_id, message_id, role, sender_user_id, sender_name,
          text, kb_hits, storm_hits, provider, latency_ms, quality_flags)
       VALUES ($1, $2, $3, 'bot', NULL, 'Susan 21', $4, $5, $6, $7, $8, $9)
       ON CONFLICT (message_id) DO NOTHING`,
      [
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
      ]
    );
  } catch (e) {
    console.warn('[SusanBot] save bot turn err:', e);
  }
}

async function getThreadHistory(pool: pg.Pool, threadId: string, limit: number = 6): Promise<Turn[]> {
  try {
    const result = await pool.query(
      `SELECT message_id, role, sender_name, text, entities, created_at
       FROM bot_conversation_turns
       WHERE thread_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [threadId, limit]
    );
    return result.rows
      .map((r: any) => ({
        message_id: r.message_id,
        role: r.role,
        sender_name: r.sender_name,
        text: r.text,
        entities: r.entities,
        created_at: r.created_at,
      }))
      .reverse(); // chronological
  } catch {
    return [];
  }
}

function historySnippet(turns: Turn[]): string | null {
  if (turns.length === 0) return null;
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

interface QualityResult {
  ok: boolean;
  flags: Record<string, any>;
}

function qualityCheck(reply: string | null | undefined): QualityResult {
  const flags: Record<string, any> = {};
  if (!reply) return { ok: false, flags: { empty: true } };
  const trimmed = reply.trim();
  if (trimmed.length < 20) flags.too_short = true;
  if (trimmed.length > 900) flags.too_long = true;
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
    if (looksTruncated) flags.maybe_truncated = true;
  }
  // "Susan 21:" or similar prefix
  if (/^susan\s*21\s*[:\-]/i.test(trimmed)) flags.susan_prefix = true;

  const ok = !flags.empty && !flags.too_short && !flags.banned_phrase && !flags.maybe_truncated;
  return { ok, flags };
}

// ─── Multi-provider reply generation ─────────────────────────────────────────
// Primary: Gemini 2.5 Flash (FREE, 1500 req/day free tier)
// Fallback: Groq Llama 3.3 70B (FREE, very fast)
// Last resort: Claude Haiku 4.5 (paid, reliable)

function buildPromptLines(
  message: { name: string; text: string },
  kbHits: any[],
  stormHits: any[],
  entities: ExtractedEntities | null,
  history: Turn[],
  addressHail?: { address: ExtractedAddress; geo?: { lat: number; lng: number; source: string }; events: any[]; mrms?: any } | null,
  chatContext?: Array<{ name: string; text: string; created_at: number; sender_type: string }>,
  insuranceDir?: Array<{ name: string; phone: string | null; email: string | null; category: string | null; website: string | null; notes: string | null }>
): string {
  const lines = [`SENDER: ${message.name}`, `MESSAGE: ${message.text}`];
  if (history.length > 0) {
    lines.push('\nCONVERSATION_HISTORY (most recent last — use to resolve "him"/"that guy"/follow-ups):');
    for (const t of history.slice(-5)) {
      const who = t.role === 'bot' ? 'Susan' : t.sender_name || 'rep';
      lines.push(`  [${who}] ${t.text.slice(0, 220)}`);
    }
  }
  if (entities) {
    const parts: string[] = [];
    if (entities.adjusters.length) parts.push(`adjusters: ${entities.adjusters.join(', ')}`);
    if (entities.carriers.length) parts.push(`carriers: ${entities.carriers.join(', ')}`);
    if (entities.storm_dates.length) parts.push(`storm_dates: ${entities.storm_dates.join(', ')}`);
    if (entities.topics.length) parts.push(`topics: ${entities.topics.join(', ')}`);
    if (entities.is_followup) parts.push(`IS_FOLLOWUP: true (the rep is referring back to something in history)`);
    parts.push(`intent: ${entities.intent}`);
    if (parts.length > 0) lines.push(`\nENTITIES: ${parts.join(' · ')}`);
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
    // Structured signups brief (parsed deterministically so Susan can't miscount)
    const todayStart = startOfTodayEDT();
    const todaySignups = parseDailySignups(chatContext, todayStart);
    if (todaySignups.length > 0) {
      lines.push(`\nSIGNUPS_TODAY (structured parse of team sign-up posts since midnight EDT):`);
      // Aggregate per rep
      const perRep: Record<string, ParsedSignup[]> = {};
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
    } else if (addressHail.events.length === 0) {
      lines.push(`  Geocoded ok (${addressHail.geo.lat.toFixed(3)}, ${addressHail.geo.lng.toFixed(3)}) — NO verified hail/wind events within 15 miles in the last 24 months. If rep insists there was a storm, it may be below NOAA reporting threshold.`);
    } else {
      lines.push(`  Geocoded to (${addressHail.geo.lat.toFixed(3)}, ${addressHail.geo.lng.toFixed(3)}) via ${addressHail.geo.source}`);
      lines.push(`  Found ${addressHail.events.length} verified event(s) within 15mi over 24mo (use these exact dates + sizes):`);
      for (const e of addressHail.events.slice(0, 8)) {
        lines.push(`    ${e.event_date} — hail ${e.hail_size_inches || '-'}", wind ${e.wind_mph || '-'}mph, ${Number(e.distance_miles).toFixed(1)}mi away, ${e.public_verification_count}x verified`);
      }
    }
    // MRMS radar-at-point (exact property, more precise than "within 15mi").
    // MRMS service returns numbers-or-null at each radius band (atLocation, within1mi, etc).
    if (addressHail.mrms) {
      const m: any = addressHail.mrms;
      lines.push(`\n  MRMS_RADAR (direct radar grid at the property, 30-min resolution):`);
      if (typeof m.atLocation === 'number' && m.atLocation > 0) {
        lines.push(`    AT the property: ${m.atLocation.toFixed(2)}" max hail${m.date ? ' on ' + m.date : ''}`);
      }
      if (typeof m.within1mi === 'number' && m.within1mi > 0) lines.push(`    within 1mi: ${m.within1mi.toFixed(2)}"`);
      if (typeof m.within3mi === 'number' && m.within3mi > 0) lines.push(`    within 3mi: ${m.within3mi.toFixed(2)}"`);
      if (typeof m.within10mi === 'number' && m.within10mi > 0) lines.push(`    within 10mi: ${m.within10mi.toFixed(2)}"`);
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
      if (c.phone) bits.push(`phone: ${c.phone}`);
      if (c.email) bits.push(`email: ${c.email}`);
      if (c.category) bits.push(`app: ${c.category}`);
      if (c.website) bits.push(`portal: ${c.website}`);
      lines.push(`  ${bits.join(' | ')}`);
      if (c.notes) lines.push(`    notes: ${String(c.notes).slice(0, 300)}`);
    }
  }
  return lines.join('\n');
}

// When the question is about legal/code/matching/denial/argument topics,
// we explicitly search Insurance Arguments + State Regulations categories
// because generic docs out-rank them on pure FTS tokens.
function isLegalArgumentQuery(text: string): boolean {
  return /\b(matching|denial|argument|code|law|irc|ibc|usbc|vebc|comar|statute|regulation|ordinance|license|licensed|permit|pa\s+matching|md\s+matching|va\s+matching|maryland\s+matching)\b/i.test(text);
}

function detectState(text: string): string | null {
  if (/\b(maryland|\bmd\b)\b/i.test(text)) return 'MD';
  if (/\b(virginia|\bva\b)\b/i.test(text)) return 'VA';
  if (/\b(pennsylvania|\bpa\b)\b/i.test(text)) return 'PA';
  return null;
}

async function legalArgumentKbSearch(pool: pg.Pool, text: string): Promise<any[]> {
  const state = detectState(text);
  // Pull candidates from Insurance Arguments + State Regulations categories.
  // Boost rows whose name mentions the detected state or the keyword "matching".
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, ' ');
  const tokens = cleaned.split(/\s+/).filter((w) => w.length >= 3).slice(0, 15);
  const tsquery = tokens.length ? tokens.map((t) => `${t}:*`).join(' | ') : 'law:*';
  const statePat = state ? `%${state === 'MD' ? 'maryland' : state === 'VA' ? 'virginia' : 'pennsylvania'}%` : '%';
  try {
    const result = await pool.query(
      `SELECT name, category, content,
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
       LIMIT 5`,
      [tsquery, statePat]
    );
    return result.rows;
  } catch (e) {
    console.warn('[SusanBot] legalArgumentKbSearch err:', e);
    return [];
  }
}

// Run the KB search using entity-driven tsquery, with fallback to raw tokens.
async function smartKbSearch(
  pool: pg.Pool,
  text: string,
  entities: ExtractedEntities,
  canonicals: CanonicalName[]
): Promise<any[]> {
  // 1) For each extracted adjuster, fuzzy-match to canonical name and query by that doc name
  const hitsByDoc: Map<string, any> = new Map();
  for (const raw of entities.adjusters) {
    const match = findCanonicalName(raw, entities.carriers, canonicals);
    if (match) {
      try {
        const r = await pool.query(
          `SELECT name, category, content, ts_rank(search_vector, to_tsquery('english', $1)) AS rank
           FROM knowledge_documents
           WHERE name = $2
           LIMIT 1`,
          [match.canonical.lowered.split(/\s+/).map((t) => `${t}:*`).join(' | ') || 'a:*', match.canonical.kbDocName]
        );
        for (const row of r.rows) {
          row.rank = Math.max(row.rank || 0, 0.5 * match.score);
          hitsByDoc.set(row.name, row);
        }
      } catch {}
    }
  }
  // 2) Carrier-intel docs for each detected carrier
  for (const carrier of entities.carriers) {
    try {
      const carrierUpper = carrier.replace(/_/g, ' ').toUpperCase();
      const r = await pool.query(
        `SELECT name, category, content, 0.5::float AS rank
         FROM knowledge_documents
         WHERE category='carrier-intel' AND name ILIKE $1
         LIMIT 1`,
        [`%${carrierUpper}%`]
      );
      for (const row of r.rows) hitsByDoc.set(row.name, row);
    } catch {}
  }
  // 3) If question is about legal/code/matching/denial, prioritize Insurance Arguments
  if (isLegalArgumentQuery(text)) {
    const legalHits = await legalArgumentKbSearch(pool, text);
    for (const h of legalHits) {
      if (!hitsByDoc.has(h.name)) hitsByDoc.set(h.name, h);
    }
  }
  // 4) Fallback: run the existing token FTS search and merge
  const tokenHits = await kbSearch(pool, text);
  for (const h of tokenHits) {
    if (!hitsByDoc.has(h.name)) hitsByDoc.set(h.name, h);
  }
  return Array.from(hitsByDoc.values()).slice(0, 5);
}

async function tryGemini(prompt: string): Promise<{ reply: string | null; error?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { reply: null, error: 'no_gemini_key' };
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
    const data: any = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text === 'string' && text.trim().length > 0) {
      return { reply: text.trim().slice(0, 900) };
    }
    return { reply: null, error: 'gemini_empty' };
  } catch (e: any) {
    return { reply: null, error: `gemini_fetch:${e?.name || 'err'}` };
  }
}

async function tryGroq(prompt: string): Promise<{ reply: string | null; error?: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { reply: null, error: 'no_groq_key' };
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
    const data: any = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text === 'string' && text.trim().length > 0) {
      return { reply: text.trim().slice(0, 900) };
    }
    return { reply: null, error: 'groq_empty' };
  } catch (e: any) {
    return { reply: null, error: `groq_fetch:${e?.name || 'err'}` };
  }
}

async function tryClaude(prompt: string): Promise<{ reply: string | null; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { reply: null, error: 'no_anthropic_key' };
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
    const data: any = await resp.json();
    const block = data?.content?.[0];
    if (block?.type === 'text' && typeof block.text === 'string') {
      return { reply: block.text.trim().slice(0, 900) };
    }
    return { reply: null, error: 'claude_empty' };
  } catch (e: any) {
    return { reply: null, error: `claude_fetch:${e?.name || 'err'}` };
  }
}

async function generateReply(
  message: { name: string; text: string },
  kbHits: any[],
  stormHits: any[],
  entities: ExtractedEntities | null,
  history: Turn[],
  addressHail?: { address: ExtractedAddress; geo?: { lat: number; lng: number; source: string }; events: any[]; mrms?: any } | null,
  chatContext?: Array<{ name: string; text: string; created_at: number; sender_type: string }>,
  insuranceDir?: Array<{ name: string; phone: string | null; email: string | null; category: string | null; website: string | null; notes: string | null }>
): Promise<{ reply: string | null; error?: string; provider?: string; qualityFlags: Record<string, any>; retries: number }> {
  const prompt = buildPromptLines(message, kbHits, stormHits, entities, history, addressHail, chatContext, insuranceDir);
  const providers: [string, (p: string) => Promise<{ reply: string | null; error?: string }>][] = [
    ['gemini', tryGemini],
    ['groq', tryGroq],
    ['claude', tryClaude],
  ];
  const errors: string[] = [];
  let retries = 0;
  let lastFlags: Record<string, any> = {};
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

export async function postToGroupMe(text: string, replyToId?: string): Promise<string | null> {
  if (!BOT_ID) {
    console.error('[SusanBot] GROUPME_SUSAN_BOT_ID not set — cannot post');
    return null;
  }
  const body: any = {
    bot_id: BOT_ID,
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
  } catch (e) {
    console.error('[SusanBot] post_exc:', e);
    return null;
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function createSusanGroupMeBotRoutes(pool: pg.Pool): Router {
  const router = Router();

  // Health / info endpoint (for testing)
  router.get('/info', (req: Request, res: Response) => {
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
  const webhookHandler = async (req: Request, res: Response) => {
    // ACK fast so GroupMe doesn't retry
    res.status(200).json({ ok: true });

    const msg = req.body as any;
    if (!msg || !msg.id || !msg.text) return;

    // Test-mode header — skip POST to GroupMe but still run full pipeline + save to audit
    // Used by the test harness to validate behavior without spamming the live chat.
    const testMode = req.headers['x-susan-test'] === 'true';

    // Dedup (GroupMe can resend)
    if (seenMessageIds.has(String(msg.id))) return;
    seenMessageIds.add(String(msg.id));
    if (seenMessageIds.size > 5000) {
      const first = seenMessageIds.values().next().value;
      if (first !== undefined) seenMessageIds.delete(first);
    }

    // Skip the bot's own messages (prevent loops)
    if (msg.sender_type === 'bot') return;
    if (msg.name === 'Susan 21') return;

    // Only for our sales group
    if (msg.group_id && String(msg.group_id) !== SALES_GROUP_ID) return;

    const text: string = String(msg.text || '').trim();
    if (text.length < 10) return;

    // Reply condition
    const mentioned = textMentionsSusan(text);
    const isReply = isReplyToSusan(msg.attachments || []);

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
            queueLearningCandidate(pool, msg, recent, intel).catch(() => {});
          }).catch(() => {});
        }
      }
      return; // no reply — we just observed
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

      let confirmReply: string;
      if (isTrusted) {
        const docId = await writeTrustedTeaching(pool, msg, trustedName, teachingFact);
        emailTeachingEvent('trusted', trustedName, senderName, teachingFact, String(msg.id), docId)
          .catch(() => {});
        confirmReply = `Locked in. Saved as team canon from @${trustedName}. Ahmed's been notified 📝`;
      } else {
        const candId = await queuePendingTeaching(pool, msg, teachingFact);
        emailTeachingEvent('pending', senderName, senderName, teachingFact, String(msg.id), candId)
          .catch(() => {});
        confirmReply = `Heard you @${senderName} — saving canon is leadership-only. Queued it for Ahmed / Reese / Oliver / Ford to confirm before it becomes part of my knowledge 🙏`;
      }

      if (!testMode) {
        await postToGroupMe(confirmReply, String(msg.id));
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

    console.log(
      `[SusanBot] trigger=${mentioned ? 'mention' : 'reply_to_susan'} from ${msg.name}: ${text.slice(0, 80)}`
    );

    // REBUILD MODE — reply with a scripted "being upgraded" message per rep (not spam).
    // Set SUSAN_REBUILD_MODE=true in Railway env while we're rewiring her internals.
    // Test-mode header bypasses rebuild mode so the harness can exercise the full pipeline.
    if (process.env.SUSAN_REBUILD_MODE === 'true' && !testMode) {
      const senderKey = `${msg.user_id || msg.sender_id || msg.name}`;
      // @ts-ignore — we hang a rebuildGreeted set on globalThis; survives function calls, resets on redeploy
      const greeted: Set<string> = (globalThis as any).__susanRebuildGreeted ||
        ((globalThis as any).__susanRebuildGreeted = new Set<string>());
      if (greeted.has(senderKey)) {
        console.log(`[SusanBot] rebuild_mode already_greeted skip for ${senderKey}`);
        return;
      }
      greeted.add(senderKey);
      const rebuildReply =
        "🔧 Getting upgraded right now team — full knowledge base + context memory comes online by end of day. " +
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
      saveUserTurn(pool, msg, entities).catch(() => {});

      // Extract + geocode address if rep asked about a specific property.
      // Also runs MRMS point-radar check if a specific date is mentioned.
      const addr = extractAddress(text);
      const dates = extractStormDates(text);
      const addressLookupPromise = addr
        ? (async () => {
            const geo = await geocodeAddress(addr);
            if (!geo) return { address: addr, events: [] as any[], mrms: null as any };
            const eventsP = hailAtAddress(pool, geo.lat, geo.lng, 24);
            // If rep named a specific date, run MRMS point-radar; otherwise recent 3-day scan
            const mrmsP = dates.length > 0
              ? mrmsAtAddressDate(addr, geo, dates[0])
              : mrmsRecentAtAddress(geo, 3);
            const [events, mrms] = await Promise.all([eventsP, mrmsP]);
            return { address: addr, geo, events, mrms };
          })()
        : Promise.resolve(null as any);

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
      const [kbHits, stormHits, addressHail, chatContext, insuranceDir] = await Promise.all([
        smartKbSearch(pool, text, entities, canonicals),
        stormSearch(pool, text),
        addressLookupPromise,
        chatContextPromise,
        insuranceDirPromise,
      ]);

      const { reply, error, provider, qualityFlags, retries } = await generateReply(
        { name: msg.name, text },
        kbHits,
        stormHits,
        entities,
        history,
        addressHail,
        chatContext,
        insuranceDir
      );
      const latencyMs = Date.now() - startMs;

      if (!reply || error) {
        console.log(`[SusanBot] skip msg=${msg.id}: gen_err=${error || 'empty'} (retries=${retries})`);
        await saveBotTurn(pool, msg, null, `(rejected — ${error || 'empty'})`, kbHits, stormHits,
          provider || 'none', latencyMs, { ...qualityFlags, rejected: true, retries, test_mode: testMode });
        return;
      }
      if (testMode) {
        // Test harness path — don't actually post to GroupMe. Save audit row only.
        console.log(
          `[SusanBot] TEST_MODE generated via ${provider} kb=${kbHits.length} storm=${stormHits.length} ents=${(entities.adjusters.length + entities.carriers.length + entities.storm_dates.length)} retries=${retries} latency=${latencyMs}ms — ${reply.slice(0, 80)}`
        );
        await saveBotTurn(pool, msg, null, reply, kbHits, stormHits,
          provider || 'unknown', latencyMs, { ...qualityFlags, retries, test_mode: true });
        return;
      }
      const posted = await postToGroupMe(reply, String(msg.id));
      const allStorms = [...stormHits, ...(addressHail?.events ?? [])];
      if (posted) {
        repliedAt.push(Date.now());
        console.log(
          `[SusanBot] REPLIED via ${provider} kb=${kbHits.length} storm=${stormHits.length} addr=${addressHail?.events?.length ?? '-'} ents=${(entities.adjusters.length + entities.carriers.length + entities.storm_dates.length)} retries=${retries} latency=${latencyMs}ms — ${reply.slice(0, 80)}`
        );
        await saveBotTurn(pool, msg, null, reply, kbHits, allStorms,
          provider || 'unknown', latencyMs, { ...qualityFlags, retries, address_lookup: addr ? addr.full : null });
      } else {
        // Posted failed but we still want the audit row so we can debug
        await saveBotTurn(pool, msg, null, reply, kbHits, allStorms,
          provider || 'unknown', latencyMs, { ...qualityFlags, retries, post_failed: true, address_lookup: addr ? addr.full : null });
      }
    } catch (err) {
      console.error(`[SusanBot] handler err on msg ${msg.id}:`, err);
    }
  };

  // Register handler at both /webhook and root '/' so it's reachable from either
  // - /api/susan/groupme/webhook (new)
  // - /api/susan/groupme-webhook (legacy alias, matches the bot's registered callback_url)
  router.post('/webhook', webhookHandler);
  router.post('/', webhookHandler);

  // Audit endpoint — last N bot turns with KB hits + quality flags
  router.get('/audit', async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit || '30'), 10) || 30, 200);
    const role = String(req.query.role || '');
    try {
      const params: any[] = [limit];
      let whereClause = '';
      if (role === 'bot' || role === 'user') {
        whereClause = 'WHERE role = $2';
        params.splice(1, 0, role);
      }
      const { rows } = await pool.query(
        `SELECT id, created_at, group_id, thread_id, message_id, role,
                sender_name, substring(text, 1, 400) AS text,
                entities, kb_hits, storm_hits, provider, latency_ms, quality_flags
         FROM bot_conversation_turns
         ${whereClause}
         ORDER BY created_at DESC LIMIT $1`,
        params.length === 1 ? params : [params[1], params[0]]
      );
      res.json({ count: rows.length, turns: rows });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'audit failed' });
    }
  });

  // ═══════════ Learning candidates (admin) ═══════════
  // List pending learnings for admin review
  router.get('/learnings', async (req: Request, res: Response) => {
    const status = String(req.query.status || 'pending');
    const limit = Math.min(Number(req.query.limit || 50), 200);
    try {
      const r = await pool.query(
        `SELECT id, source_message_id, sender_name, raw_text, context_messages,
                detected_entity_type, detected_name, detected_carrier, trigger_reason,
                status, proposed_kb_doc_name, proposed_kb_doc_content,
                merge_target_doc_id, created_at, reviewed_at, reviewed_by, applied_at
         FROM kb_learning_candidates
         WHERE status = $1
         ORDER BY created_at DESC LIMIT $2`,
        [status, limit]
      );
      res.json({ count: r.rows.length, candidates: r.rows });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'learnings query failed' });
    }
  });

  // Synthesize + approve a learning candidate → ingest to KB
  router.post('/learnings/:id/approve', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const reviewedBy = String(req.body?.reviewed_by || 'admin');
    try {
      const cand = (await pool.query(
        `SELECT * FROM kb_learning_candidates WHERE id=$1 AND status='pending'`,
        [id]
      )).rows[0];
      if (!cand) return res.status(404).json({ error: 'pending candidate not found' });

      // Check if we already have a KB doc for this adjuster — merge vs. new
      let targetDoc: any = null;
      if (cand.detected_name) {
        const searchKey = cand.detected_name.toLowerCase();
        const match = await pool.query(
          `SELECT id, name, content FROM knowledge_documents
           WHERE category = 'adjuster-intel' AND LOWER(name) LIKE $1
           ORDER BY LENGTH(content) DESC LIMIT 1`,
          [`%${searchKey}%`]
        );
        if (match.rows.length > 0) targetDoc = match.rows[0];
      }

      // Synthesize via Groq (fast, free)
      const groqKey = process.env.GROQ_API_KEY;
      let synthesized: any = null;
      if (groqKey) {
        const prompt = `You are updating The Roof Docs adjuster knowledge base.

REP MESSAGE:
${cand.raw_text}

SURROUNDING CHAT (most recent last):
${Array.isArray(cand.context_messages) ? cand.context_messages.map((c: any) => `[${c.name}] ${c.text}`).join('\n') : ''}

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
          const data: any = await resp.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) {
            try { synthesized = JSON.parse(content); } catch {}
          }
        }
      }
      if (!synthesized || !synthesized.content) {
        return res.status(502).json({ error: 'LLM synthesis failed', candidate: cand });
      }

      // Apply — UPDATE existing or INSERT new
      let appliedDocId: number;
      if (targetDoc) {
        await pool.query(
          `UPDATE knowledge_documents SET name=$1, content=$2 WHERE id=$3`,
          [synthesized.name || targetDoc.name, synthesized.content, targetDoc.id]
        );
        appliedDocId = targetDoc.id;
      } else {
        const slugName = (cand.detected_name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const filePath = `groupme-archive://adjuster/learned-${slugName}-${Date.now()}`;
        const ins = await pool.query(
          `INSERT INTO knowledge_documents (name, category, state, content, file_path)
           VALUES ($1, 'adjuster-intel', NULL, $2, $3)
           RETURNING id`,
          [synthesized.name, synthesized.content, filePath]
        );
        appliedDocId = ins.rows[0].id;
      }

      await pool.query(
        `UPDATE kb_learning_candidates
         SET status='approved', reviewed_at=NOW(), reviewed_by=$1, applied_at=NOW(),
             applied_kb_doc_id=$2, proposed_kb_doc_name=$3, proposed_kb_doc_content=$4,
             merge_target_doc_id=$5, llm_synthesis_raw=$6, llm_model='llama-3.3-70b-versatile'
         WHERE id=$7`,
        [reviewedBy, appliedDocId, synthesized.name, synthesized.content,
          targetDoc ? targetDoc.id : null, JSON.stringify(synthesized), id]
      );
      res.json({ ok: true, action: targetDoc ? 'merged' : 'inserted', kb_doc_id: appliedDocId, doc_name: synthesized.name });
    } catch (e: any) {
      console.error('[SusanBot] learning approve err:', e);
      res.status(500).json({ error: e?.message || 'approve failed' });
    }
  });

  router.post('/learnings/:id/reject', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const reviewedBy = String(req.body?.reviewed_by || 'admin');
    const reason = String(req.body?.reason || '');
    try {
      const r = await pool.query(
        `UPDATE kb_learning_candidates
         SET status='rejected', reviewed_at=NOW(), reviewed_by=$1,
             llm_synthesis_raw = COALESCE(llm_synthesis_raw, '') || CASE WHEN $2 <> '' THEN ' [reject-reason: ' || $2 || ']' ELSE '' END
         WHERE id=$3 AND status='pending' RETURNING id`,
        [reviewedBy, reason, id]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'pending candidate not found' });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'reject failed' });
    }
  });

  // ═══════════ Scheduled-post preview & manual trigger (admin) ═══════════
  // Preview (dry run) — returns what Susan WOULD post without posting.
  router.get('/scheduled/preview/:phase', async (req: Request, res: Response) => {
    const phase = String(req.params.phase);
    if (!['morning', 'midday', 'afternoon', 'evening'].includes(phase)) {
      return res.status(400).json({ error: 'phase must be morning|midday|afternoon|evening' });
    }
    try {
      const { triggerMotivationPreview } = await import('../services/susanScheduledPosts.js');
      const r = await triggerMotivationPreview(pool, phase as any);
      res.json(r);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'preview failed' });
    }
  });
  // Force-post right now — actually posts to the Sales Team. Use with care.
  router.post('/scheduled/post/:phase', async (req: Request, res: Response) => {
    const phase = String(req.params.phase);
    if (!['morning', 'midday', 'afternoon', 'evening'].includes(phase)) {
      return res.status(400).json({ error: 'phase must be morning|midday|afternoon|evening' });
    }
    try {
      const { triggerMotivationPostNow } = await import('../services/susanScheduledPosts.js');
      const r = await triggerMotivationPostNow(pool, phase as any);
      res.json(r);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'post failed' });
    }
  });
  // Force-send digest email now.
  router.post('/scheduled/digest', async (_req: Request, res: Response) => {
    try {
      const { triggerDailyDigest } = await import('../services/susanScheduledPosts.js');
      await triggerDailyDigest(pool);
      res.json({ ok: true, sent_to: process.env.EMAIL_ADMIN_ADDRESS || 'ahmed.mahmoud@theroofdocs.com' });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'digest failed' });
    }
  });

  // Feedback endpoint — reps can 👍/👎 a reply via a POST
  router.post('/feedback', async (req: Request, res: Response) => {
    const { message_id, vote, user_id } = req.body || {};
    if (!message_id || !['up', 'down'].includes(String(vote))) {
      return res.status(400).json({ error: 'message_id + vote=up|down required' });
    }
    try {
      await pool.query(
        `UPDATE bot_conversation_turns
         SET quality_flags = quality_flags || jsonb_build_object('feedback_' || $2, COALESCE((quality_flags->>('feedback_' || $2))::int, 0) + 1, 'feedback_user', $3)
         WHERE message_id = $1`,
        [String(message_id), String(vote), user_id ? String(user_id) : null]
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'feedback failed' });
    }
  });

  return router;
}
