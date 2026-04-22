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
const PERSONALITY = `You are Susan 21, an AI teammate in The Roof Docs sales team GroupMe chat.

You just got a message. Reply in Susan's voice (1-3 SHORT sentences max, max 500 chars).

CRITICAL VOICE:
- Never say "As an AI" or "I'm an AI assistant"
- You ARE a teammate — direct, confident, playful when earned
- You've read 3 years of this team's 85,000 chat messages and know the vibe
- Native vocab: LFG, 🔥, 🐐, "the boy", "rock solid photos", "tough but workable", "reschedule", "monster", "stack it up"
- Use 1-2 emojis MAX, each meaningful (🔥🐐💀⚠️✅📸)
- Chat energy only. Never corporate/formal.
- If they ask about an adjuster/carrier you have intel on, LEAD with verdict, 1 tactical line
- If they're being playful/skeptical/flirty, match with wit — push back, don't be thirsty
- If you don't know, say "no intel yet — chat might know"
- Don't restate their question. Don't say "Susan 21:" prefix.

SIGNALS in input:
- SENDER — who's talking
- MESSAGE — what they said
- KB_HITS — knowledge base intel if relevant (USE these verbatim)
- REP_STATS — their chat stats if they're a known heavy poster

Output: just the reply text. Plain. No prefix.`;
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
async function kbSearch(pool, text) {
    const cleaned = text.toLowerCase().replace(/[^\w\s]/g, ' ');
    const stop = new Set([
        'susan', 'the', 'and', 'for', 'with', 'that', 'this', 'but', 'not',
        'from', 'have', 'was', 'were', 'has', 'had', 'are', 'you', 'your',
        'what', 'who', 'why', 'where', 'when', 'how', 'is', 'about', 'work',
        'think', 'know', 'hey', 'yeah', 'just', 'now', 'can', 'some', 'will',
        'i', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by',
    ]);
    const tokens = cleaned
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !stop.has(w))
        .slice(0, 8);
    if (tokens.length === 0)
        return [];
    const tsquery = tokens.map((t) => `${t}:*`).join(' | ');
    try {
        const result = await pool.query(`SELECT name, category, content,
              ts_rank(search_vector, to_tsquery('english', $1)) AS rank
       FROM knowledge_documents
       WHERE search_vector @@ to_tsquery('english', $1)
       ORDER BY rank DESC LIMIT 3`, [tsquery]);
        return result.rows.filter((r) => Number(r.rank) >= 0.1);
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
async function generateReply(message, kbHits, priorMsg) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        return { reply: null, error: 'no_api_key' };
    const lines = [`SENDER: ${message.name}`, `MESSAGE: ${message.text}`];
    if (priorMsg)
        lines.push(`PRIOR_MSG: ${priorMsg.slice(0, 300)}`);
    if (kbHits.length > 0) {
        lines.push('\nKB_HITS (use these as authoritative intel):');
        for (const h of kbHits.slice(0, 2)) {
            lines.push(`  [${h.category}] ${h.name}`);
            lines.push(`    ${(h.content || '').slice(0, 1400)}`);
        }
    }
    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 250,
                system: [{ type: 'text', text: PERSONALITY, cache_control: { type: 'ephemeral' } }],
                messages: [{ role: 'user', content: lines.join('\n') }],
            }),
        });
        if (!resp.ok) {
            const body = await resp.text();
            return { reply: null, error: `anthropic_${resp.status}:${body.slice(0, 200)}` };
        }
        const data = await resp.json();
        const block = data?.content?.[0];
        if (block?.type === 'text' && typeof block.text === 'string') {
            return { reply: block.text.trim().slice(0, 900) };
        }
        return { reply: null, error: 'empty_block' };
    }
    catch (e) {
        return { reply: null, error: `fetch:${e?.name || 'err'}` };
    }
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
        });
    });
    // GroupMe webhook — called for every message in Sales Team
    router.post('/webhook', async (req, res) => {
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
        // Generate + post
        try {
            const kbHits = await kbSearch(pool, text);
            const priorMsg = isReply ? '(this is a reply to one of your prior messages)' : null;
            const { reply, error } = await generateReply({ name: msg.name, text }, kbHits, priorMsg);
            if (!reply || error) {
                console.log(`[SusanBot] skip msg=${msg.id}: gen_err=${error || 'empty'}`);
                return;
            }
            const posted = await postToGroupMe(reply, String(msg.id));
            if (posted) {
                repliedAt.push(Date.now());
                console.log(`[SusanBot] REPLIED to ${msg.name}: ${reply.slice(0, 100)}`);
            }
        }
        catch (err) {
            console.error(`[SusanBot] handler err on msg ${msg.id}:`, err);
        }
    });
    return router;
}
