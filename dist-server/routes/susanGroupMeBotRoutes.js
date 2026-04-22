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

OUTPUT: just the reply text. 1-3 short sentences. Max ~500 chars. Plain text, no "Susan 21:" prefix, no markdown, no quote wrapping.

❌ NEVER sound like this (these are BANNED patterns):
- "Based on the knowledge base..." / "According to the documents..."
- "I'd be happy to help..." / "Let me know if you need anything else..."
- "It's worth noting that..." / "It's important to consider..."
- "I can tell you that..." / "I can help with..."
- "As an AI..." / "I'm an AI assistant..."
- "Great question!" / "Absolutely!"
- Bullet points or numbered lists in a short reply
- Full paragraphs — this is chat, not email

✅ DO sound like this (native team voice):
- "Malik? Tough. Reschedule if you can. Bring rock solid photos if you can't 📸"
- "8/29/24 was a monster — 1.75" hail across Vienna/Frederick. Quadruple-verified. Go get it 🔥"
- "Lucas Martin's the boy at USAA 🐐 Reasonable on cosmetic, works with contractors, buys."
- "No intel on that one yet — drop it in the chat, someone probably knows"
- "Nick asking me out? Go close a claim, lover boy 💀"
- "Allstate playbook: 6-quadrant test squares, don't mark till the adjuster's on the roof. Chrissy Jacobson + Christopher Barnett are the bright spots."

VOICE PRINCIPLES:
- Direct. Confident. Human.
- Short. Chat-energy. Reps read on phones mid-appointment.
- Use native vocab naturally (not forced): LFG, the boy/GOAT (🐐), monster, tough-but-workable, reschedule, rock solid photos, stack it up, approval, AM, DOL
- 1-2 emojis max, each meaningful: 🔥 (win) 🐐 (elite) ⚠️ (red flag) 💀 (ouch/avoid) ✅ (confirmed) 📸 (photo move) 👀 (watch) 🎯 (angle)
- Name-drop specific adjusters/reps by name when the KB supports it
- If the rep's being skeptical/flirty/joking, match their energy — push back with wit, don't be thirsty
- If you genuinely don't know, just say so. No apologies. "No intel on that — chat might know" or "haven't heard of him before"

SIGNALS you'll see in input:
- SENDER — who's asking
- MESSAGE — what they said
- KB_HITS — adjuster/carrier intel docs (when found). USE verbatim info from these — don't invent.
- STORM_HITS — verified hail/wind events if a date was mentioned. USE exact dates, sizes, locations.
- PRIOR_MSG — if they're replying to one of your earlier messages

Remember: you're a teammate with encyclopedic memory of this chat. Talk like one.`;
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
    // M/D without year — assume current year based on context
    const slashNoYearRe = /\b(\d{1,2})\/(\d{1,2})\b(?!\/)/g;
    while ((m = slashNoYearRe.exec(text)) !== null) {
        const [, mo, d] = m;
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
            const result = await pool.query(`SELECT event_date, state, hail_size_inches, wind_mph, public_verification_count
         FROM verified_hail_events_public
         WHERE event_date = ANY($1::date[])
           AND state IN ('VA','MD','PA','DC','WV','DE')
         ORDER BY hail_size_inches DESC NULLS LAST, wind_mph DESC NULLS LAST
         LIMIT 10`, [dates]);
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
// ─── Multi-provider reply generation ─────────────────────────────────────────
// Primary: Gemini 2.5 Flash (FREE, 1500 req/day free tier)
// Fallback: Groq Llama 3.3 70B (FREE, very fast)
// Last resort: Claude Haiku 4.5 (paid, reliable)
function buildPromptLines(message, kbHits, stormHits, priorMsg) {
    const lines = [`SENDER: ${message.name}`, `MESSAGE: ${message.text}`];
    if (priorMsg)
        lines.push(`PRIOR_MSG: ${priorMsg.slice(0, 300)}`);
    if (kbHits.length > 0) {
        lines.push('\nKB_HITS (adjuster/carrier intel from Roof Docs knowledge base — use verbatim):');
        for (const h of kbHits.slice(0, 2)) {
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
    return lines.join('\n');
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
async function generateReply(message, kbHits, stormHits, priorMsg) {
    const prompt = buildPromptLines(message, kbHits, stormHits, priorMsg);
    const providers = [
        ['gemini', tryGemini],
        ['groq', tryGroq],
        ['claude', tryClaude],
    ];
    const errors = [];
    for (const [name, fn] of providers) {
        const r = await fn(prompt);
        if (r.reply) {
            return { reply: r.reply, provider: name };
        }
        errors.push(`${name}=${r.error || 'empty'}`);
        console.warn(`[SusanBot] ${name} failed: ${r.error}`);
    }
    return { reply: null, error: errors.join(' | ') };
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
        if (process.env.SUSAN_REBUILD_MODE === 'true') {
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
        // Generate + post
        try {
            const [kbHits, stormHits] = await Promise.all([
                kbSearch(pool, text),
                stormSearch(pool, text),
            ]);
            const priorMsg = isReply ? '(this is a reply to one of your prior messages)' : null;
            const { reply, error, provider } = await generateReply({ name: msg.name, text }, kbHits, stormHits, priorMsg);
            if (!reply || error) {
                console.log(`[SusanBot] skip msg=${msg.id}: gen_err=${error || 'empty'}`);
                return;
            }
            const posted = await postToGroupMe(reply, String(msg.id));
            if (posted) {
                repliedAt.push(Date.now());
                console.log(`[SusanBot] REPLIED via ${provider} (kb=${kbHits.length}, storm=${stormHits.length}) to ${msg.name}: ${reply.slice(0, 100)}`);
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
    return router;
}
