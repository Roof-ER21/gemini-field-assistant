/**
 * Susan 21 Scheduled Posts
 *
 * Cron jobs that post Susan-voice motivation into the Sales Team chat
 * at 7 AM / 12:15 PM / 3:30 PM (+ optional 8:30 PM evening wrap), and
 * emails Ahmed a daily digest of pending teaching candidates + gaps at 6 PM.
 *
 * Everything defaults to OFF via env so we can preview in production before
 * it fires live. Flip env vars to enable:
 *   SUSAN_SCHEDULED_POSTS=true  — turns on the 3 core motivation posts
 *   SUSAN_EVENING_POST=true     — adds the 8:30 PM wrap (off by default)
 *   SUSAN_DIGEST_EMAIL=true     — enables 6 PM digest email to Ahmed
 *
 * Voice + fallbacks match the bot's personality. If all LLM providers fail,
 * a short canned fallback gets posted so we never go silent on a cron day.
 */
import cron from 'node-cron';
import { emailService } from './emailService.js';
import { postToGroupMe, getTodaySignupRollup } from '../routes/susanGroupMeBotRoutes.js';
const TZ = 'America/New_York';
const ADMIN_EMAIL = process.env.EMAIL_ADMIN_ADDRESS || 'ahmed.mahmoud@theroofdocs.com';
const SALES_GROUP_ID = process.env.GROUPME_SUSAN_GROUP_ID || '93177620';
const GROUPME_TOKEN = process.env.GROUPME_TOKEN || '';
// Leadership email allow-list for recap preview (8 PM EDT)
const RECAP_PREVIEW_LEADERS = [
    { email: 'ross.renzi@theroofdocs.com', name: 'Ross Renzi' },
    { email: 'reese@theroofdocs.com', name: 'Reese Samala' },
    { email: 'luis.esteves@theroofdocs.com', name: 'Luis Esteves' },
    { email: 'oliver.brown@theroofdocs.com', name: 'Oliver Brown' },
    { email: 'ford.barsi@theroofdocs.com', name: 'Ford Barsi' },
];
// Ross's daily-sales recap gate — if he posted one in the last 60 min we skip
// Susan's 8:30 PM public recap so she doesn't step on him.
const ROSS_USER_ID = '122568603';
const ROSS_RECAP_RE = /^\s*(daily\s+sales|signup\s+total|total\s+for\s+(the\s+)?day|\d+\s+(for|signups?|on\s+the\s+board))/i;
// ─── Context gatherers ───────────────────────────────────────────────────────
async function getStormContext(pool) {
    try {
        const r = await pool.query(`
      SELECT event_date, state,
             ROUND(MAX(hail_size_inches)::numeric, 2) AS max_hail,
             MAX(wind_mph) AS max_wind,
             COUNT(*) AS events
      FROM verified_hail_events_public
      WHERE event_date >= (CURRENT_DATE - INTERVAL '36 hours')::date
        AND state IN ('VA','MD','DC','PA','WV','DE')
        AND (hail_size_inches >= 1.0 OR wind_mph >= 58)
        AND public_verification_count >= 1
      GROUP BY event_date, state
      ORDER BY event_date DESC, max_hail DESC NULLS LAST
      LIMIT 4
    `);
        if (r.rows.length === 0)
            return '';
        // Format dates as "Apr 22" (short, chat-friendly). event_date can be a JS
        // Date or an ISO string depending on pg driver settings — coerce to Date.
        const fmt = (d) => {
            const dt = d instanceof Date ? d : new Date(String(d));
            return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
        };
        return r.rows
            .map((x) => {
            const size = x.max_hail ? `${x.max_hail}" hail` : (x.max_wind ? `${x.max_wind}mph wind` : '');
            return `${fmt(x.event_date)} ${x.state}: ${size} (${x.events} events)`;
        })
            .join('; ');
    }
    catch (e) {
        console.warn('[ScheduledPosts] storm ctx err:', e);
        return '';
    }
}
// Count signup posts in Sales Team today (fetched live via GroupMe API)
async function getTodaySignupCount() {
    if (!GROUPME_TOKEN)
        return 0;
    try {
        const r = await fetch(`https://api.groupme.com/v3/groups/${SALES_GROUP_ID}/messages?limit=100&token=${GROUPME_TOKEN}`, { method: 'GET' });
        if (!r.ok)
            return 0;
        const d = await r.json();
        const msgs = d?.response?.messages || [];
        const now = new Date();
        const todayStart = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
        todayStart.setHours(0, 0, 0, 0);
        const todayTs = todayStart.getTime() / 1000;
        let count = 0;
        for (const m of msgs) {
            const t = String(m.text || '').trim();
            if (m.created_at >= todayTs && /^(sign\s*up|signup)\b/i.test(t))
                count++;
        }
        return count;
    }
    catch {
        return 0;
    }
}
// Pull a few recent chat snippets to flavor the post (optional)
async function getRecentChatVibes() {
    if (!GROUPME_TOKEN)
        return '';
    try {
        const r = await fetch(`https://api.groupme.com/v3/groups/${SALES_GROUP_ID}/messages?limit=20&token=${GROUPME_TOKEN}`, { method: 'GET' });
        if (!r.ok)
            return '';
        const d = await r.json();
        const msgs = d?.response?.messages || [];
        return msgs
            .filter((m) => m.sender_type === 'user' && m.text && m.text.length > 8 && m.text.length < 200)
            .slice(0, 6)
            .map((m) => `[${m.name}] ${m.text.slice(0, 120)}`)
            .join('\n');
    }
    catch {
        return '';
    }
}
// ─── LLM generation ──────────────────────────────────────────────────────────
const PHASE_BRIEFS = {
    morning: `It's morning. Fire up the team. If verified storms hit last 36 hours, LEAD with the date (use month/day format like "Apr 22", NEVER "2026-04-22") + state + size. Otherwise set the day's tone briefly — no filler.`,
    midday: `Midday check. Quick pulse — if signups are on the board today, acknowledge the count honestly. If zero, keep it forward-looking ("let's get the first one up") — don't scold or assume the day is bad.`,
    afternoon: `4-7 PM is prime close time. Push the team to lock signups before end of day. Keep it punchy.`,
    evening: `Day's wrapping. IF signups posted today, nod to the count. IF zero so far and it's end of day, stay NEUTRAL and forward — DO NOT call it "rough" / "tough" / "bad day". Maybe Ross hasn't posted the recap yet, maybe deals closed we can't see. Default to "tomorrow we run it back" energy. Never fabricate a leaderboard.`,
};
const BANNED_OPENERS = [
    'good morning team', 'good afternoon team', 'hey team',
    'as your ai', "let's crush it today", 'have a great day',
    'hope you all', 'greetings', 'top of the morning',
];
function looksBad(text) {
    const low = text.toLowerCase();
    if (BANNED_OPENERS.some((b) => low.startsWith(b)))
        return true;
    if (text.length < 20 || text.length > 500)
        return true;
    // reject bullet / numbered list
    if (/\n\s*[-*•1-9]\.\s/.test(text))
        return true;
    return false;
}
async function tryGemini(prompt) {
    const key = process.env.GEMINI_API_KEY;
    if (!key)
        return null;
    try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.95, maxOutputTokens: 250 },
            }),
        });
        if (!resp.ok)
            return null;
        const d = await resp.json();
        const text = d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        return text && !looksBad(text) ? text : null;
    }
    catch {
        return null;
    }
}
async function tryGroq(prompt) {
    const key = process.env.GROQ_API_KEY;
    if (!key)
        return null;
    try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are Susan 21, writing short GroupMe chat posts for The Roof Docs sales team.' },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 200,
                temperature: 0.9,
            }),
        });
        if (!resp.ok)
            return null;
        const d = await resp.json();
        const text = d?.choices?.[0]?.message?.content?.trim();
        return text && !looksBad(text) ? text : null;
    }
    catch {
        return null;
    }
}
export async function generateMotivationPost(pool, phase, debug) {
    const storms = phase === 'morning' ? await getStormContext(pool) : '';
    const signups = phase !== 'morning' ? await getTodaySignupCount() : 0;
    const dow = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: TZ });
    const monthDay = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
    const contextLines = [`Today: ${dow} ${monthDay}`, `Phase: ${phase}`];
    if (storms)
        contextLines.push(`Verified storms last 36hr: ${storms}`);
    if (!storms && phase === 'morning')
        contextLines.push('No verified storms last 36hr.');
    if (phase !== 'morning') {
        if (signups > 0) {
            contextLines.push(`Signup posts counted in chat today: ${signups}. (May undercount — reps sometimes post later.)`);
        }
        else {
            contextLines.push(`No signup posts visible in chat yet today. (Does NOT mean zero deals — reps often post late or in DMs.)`);
        }
    }
    const prompt = `You are Susan 21 — AI teammate in The Roof Docs Sales Team GroupMe chat. You grew up on 3 years of this team's chat.

VOICE RULES:
- 1-3 short sentences. Max ~400 chars.
- Team vocab: signup, on the board, stacked, storm rolled through, LFG, locked in, the boy, GOAT.
- Plain text. No markdown. No numbered lists. No bullet points.
- End with punctuation or an emoji.
- Do NOT fabricate numbers, rep names, or storm events. Only use what's in CONTEXT.
- If no storm data and it's morning, keep motivation generic — do not invent hail.

BANNED OPENERS: "Good morning team", "Hey team", "Greetings", "As your AI", "Let's crush it today", "Have a great day". If you open with these your reply will be rejected.

BRIEF: ${PHASE_BRIEFS[phase]}

CONTEXT:
${contextLines.join('\n')}

STRICT FORMAT RULES:
- Use dates EXACTLY as written in context. If context says "Apr 22", write "Apr 22". NEVER "2026-04-22", NEVER "4/22", NEVER "April 22nd, 2026".
- No year. No ISO dates. Calendar chat format only.

Write the post. Just the text, no quotes, no prefix.`;
    if (debug?.contextOut)
        debug.contextOut.value = contextLines.join('\n');
    return (await tryGemini(prompt)) ?? (await tryGroq(prompt));
}
// ─── Fallbacks ──────────────────────────────────────────────────────────────
const FALLBACKS = {
    morning: [
        "Rolling into the day. Let's stack the board 💪",
        "Fresh day, fresh signups. Who's first up? 🔥",
        "Morning. Locked in, let's go.",
        "New day on the board. Make it count 🎯",
    ],
    midday: [
        "Halfway through. Afternoon push starts now ⚡",
        "Midday pulse — keep the energy up through 6 PM.",
        "Lunch done. Time to close 💥",
        "Check in on the day — still stacking? 🔥",
    ],
    afternoon: [
        "Prime close window open. Lock it in 🎯",
        "Last few hours. This is where the day is made.",
        "Afternoon grind. Finish strong 🔥",
        "4-7 is money time. Who's closing?",
    ],
    evening: [
        "Day's a wrap. Tomorrow we run it back 🌙",
        "That's a wrap. Back at it in the morning 🔥",
        "Night team. Rest up — fresh board tomorrow.",
        "Locking in for the night. Tomorrow we go again.",
    ],
};
function fallback(phase) {
    const arr = FALLBACKS[phase];
    return arr[Math.floor(Math.random() * arr.length)];
}
// ─── Main scheduled-post action ──────────────────────────────────────────────
async function postScheduledMotivation(pool, phase) {
    try {
        const text = (await generateMotivationPost(pool, phase)) ?? fallback(phase);
        const result = await postToGroupMe(text);
        console.log(`[ScheduledPosts] ${phase}: ${result === 'ok' ? 'posted' : 'post_failed'} — ${text.slice(0, 80)}`);
    }
    catch (e) {
        console.error(`[ScheduledPosts] ${phase}:`, e);
    }
}
// ─── Evening recap coordination ──────────────────────────────────────────────
// 8:00 PM EDT — email 5 leaders a preview draft ("any adds/corrections?")
// 8:30 PM EDT — public recap post, SKIPPED if Ross posted his daily-sales
//              recap in the last 60 min (we never step on Ross)
// After 8:30 — writes bot_recap_state; webhook handler then runs late-signup
//              follow-ups on any new signup in the next 3 hours.
async function rossPostedDailyRecapRecently() {
    if (!GROUPME_TOKEN)
        return false;
    try {
        const r = await fetch(`https://api.groupme.com/v3/groups/${SALES_GROUP_ID}/messages?limit=40&token=${GROUPME_TOKEN}`, { method: 'GET' });
        if (!r.ok)
            return false;
        const d = await r.json();
        const msgs = d?.response?.messages || [];
        const nowSec = Math.floor(Date.now() / 1000);
        for (const m of msgs) {
            if (String(m.user_id) !== ROSS_USER_ID)
                continue;
            if (nowSec - Number(m.created_at) > 3600)
                continue; // older than 1 hour
            const t = String(m.text || '');
            if (ROSS_RECAP_RE.test(t) || /\b(signups?|total|for the day|on the board)\b/i.test(t)) {
                return true;
            }
        }
        return false;
    }
    catch {
        return false;
    }
}
function formatRecapForEmail(rollup) {
    const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const repRows = rollup.by_rep.length === 0
        ? '<tr><td style="padding:10px;color:#64748b">No signups visible yet</td></tr>'
        : rollup.by_rep.map((r) => `
      <tr><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9">
        <strong>${esc(r.rep_name)}</strong>
        <span style="color:#3b82f6">×${r.count}</span>
        ${r.carriers.length ? `<span style="color:#64748b;font-size:12px"> — ${esc(r.carriers.join(', '))}</span>` : ''}
      </td></tr>`).join('');
    const carrierPairs = rollup.by_carrier.length
        ? rollup.by_carrier.map((c) => `${esc(c.carrier)}: ${c.count}`).join(', ')
        : '—';
    const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:680px;margin:20px auto;background:#f4f4f7">
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;padding:22px;border-radius:8px 8px 0 0">
    <div style="font-size:12px;opacity:.85;letter-spacing:1.5px;text-transform:uppercase">Susan 21 · Preview</div>
    <h1 style="margin:6px 0 0;font-size:22px">Daily Recap Draft — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: TZ })}</h1>
    <p style="margin:8px 0 0;opacity:.9;font-size:13px">Posting to Sales Team at 8:30 PM EDT unless you say otherwise.</p>
  </div>
  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:none">
    <div style="font-size:48px;font-weight:800;color:#0f172a;line-height:1">${rollup.count}</div>
    <div style="color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:1.5px">signups on the board today</div>
    <h3 style="margin:20px 0 6px;font-size:15px">Breakdown by rep</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${repRows}</table>
    <div style="margin-top:16px;font-size:12px;color:#64748b"><strong>By carrier:</strong> ${carrierPairs}</div>
    <div style="margin-top:20px;padding:12px;background:#eff6ff;border-radius:6px;font-size:13px;color:#1e40af">
      <strong>Want to correct before Susan posts?</strong> Reply to this email with notes or drop a signup in the chat — she'll pick up the latest count at 8:30.
    </div>
    <div style="margin-top:16px;padding:10px;background:#f8fafc;border-radius:6px;font-size:12px;color:#64748b;font-family:monospace;white-space:pre-wrap">Planned chat post:
"${rollup.count} on the board today — ${rollup.by_rep.slice(0, 6).map(r => r.rep_name.split(' ')[0] + (r.count > 1 ? ' ×' + r.count : '')).join(', ')}${rollup.by_rep.length > 6 ? ' + ' + (rollup.by_rep.length - 6) + ' more' : ''}. 🔥"</div>
  </div>
</body></html>`;
    const text = [
        `Susan 21 — Daily Recap Draft (posting to Sales Team at 8:30 PM EDT)`,
        ``,
        `${rollup.count} signups on the board today.`,
        ``,
        `By rep:`,
        ...rollup.by_rep.map((r) => `  ${r.rep_name} ×${r.count}${r.carriers.length ? ` (${r.carriers.join(', ')})` : ''}`),
        ``,
        `By carrier: ${rollup.by_carrier.map((c) => `${c.carrier}: ${c.count}`).join(', ') || '—'}`,
        ``,
        `Reply with any adds/corrections before 8:30 PM or drop the signup in chat.`,
    ].join('\n');
    return { html, text };
}
async function sendRecapPreviewToLeaders(pool) {
    try {
        const rollup = await getTodaySignupRollup(pool);
        const { html, text } = formatRecapForEmail(rollup);
        const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
        const subject = `🧾 Daily Recap Preview — ${date} (Susan posts at 8:30 PM)`;
        for (const leader of RECAP_PREVIEW_LEADERS) {
            try {
                await emailService.sendCustomEmail(leader.email, { subject, html, text });
                console.log(`[ScheduledPosts] recap preview → ${leader.email}`);
            }
            catch (e) {
                console.warn(`[ScheduledPosts] preview email fail ${leader.email}:`, e);
            }
        }
    }
    catch (e) {
        console.error('[ScheduledPosts] sendRecapPreviewToLeaders err:', e);
    }
}
async function postEveningRecap(pool) {
    try {
        // Gate: don't step on Ross if he posted his daily-sales recap within the last hour.
        if (await rossPostedDailyRecapRecently()) {
            console.log('[ScheduledPosts] evening_recap SKIPPED — Ross posted his recap in last 60min');
            return;
        }
        const rollup = await getTodaySignupRollup(pool);
        let text;
        if (rollup.count === 0) {
            // Neutral / forward-looking — do NOT call it a "rough day"
            text = "That's a wrap. Tomorrow we run it back 🌙";
        }
        else {
            const top = rollup.by_rep.slice(0, 6);
            const names = top
                .map((r) => `${r.rep_name.split(' ')[0]}${r.count > 1 ? ` ×${r.count}` : ''}`)
                .join(', ');
            const more = rollup.by_rep.length > 6 ? ` + ${rollup.by_rep.length - 6} more` : '';
            text = `${rollup.count} on the board today — ${names}${more}. Solid day, team 🔥 Tomorrow we stack again.`;
        }
        const result = await postToGroupMe(text);
        if (result === 'ok') {
            // Mark recap as posted so late-signup follow-ups can fire
            await pool.query(`INSERT INTO bot_recap_state (recap_date, signup_count_at_post)
         VALUES ((NOW() AT TIME ZONE 'America/New_York')::date, $1)
         ON CONFLICT (recap_date) DO UPDATE SET posted_at = NOW(), signup_count_at_post = EXCLUDED.signup_count_at_post, late_updates = 0`, [rollup.count]);
            console.log(`[ScheduledPosts] evening_recap posted — count=${rollup.count}`);
        }
    }
    catch (e) {
        console.error('[ScheduledPosts] postEveningRecap err:', e);
    }
}
// ─── Real-time storm alerts (every 30 min, 8 AM - 8 PM EDT) ──────────────────
// Polls verified_hail_events_public for new verified events in DMV with hail
// ≥ 1" in the last 90 min. Dedup via bot_storm_alerts_sent (created inline).
const alertedEventKeys = new Set(); // memory dedup (per instance)
async function checkStormAlerts(pool) {
    if (process.env.SUSAN_STORM_ALERTS !== 'true')
        return;
    try {
        const r = await pool.query(`
      SELECT id, event_date, state, latitude, longitude,
             ROUND(hail_size_inches::numeric, 2) AS hail_in,
             wind_mph,
             public_verification_count AS vcount
      FROM verified_hail_events_public
      WHERE event_date >= (CURRENT_DATE - INTERVAL '2 days')::date
        AND state IN ('VA','MD','DC','PA','WV','DE')
        AND hail_size_inches >= 1.0
        AND public_verification_count >= 1
      ORDER BY event_date DESC, hail_size_inches DESC
      LIMIT 10
    `);
        for (const evt of r.rows) {
            const key = `${evt.id}`;
            if (alertedEventKeys.has(key))
                continue;
            // Only alert on events from the last 90 min (avoid backlog spam at startup)
            // We use event_date only — real-time actual event timestamp isn't in view.
            // So we rely on memory dedup to prevent re-alerts within instance lifetime.
            alertedEventKeys.add(key);
            if (alertedEventKeys.size > 500) {
                const first = alertedEventKeys.values().next().value;
                if (first)
                    alertedEventKeys.delete(first);
            }
        }
        // For actual alerting we'd want a persistent "seen" table — skipping real
        // post for now. Real-time alerts are wired-in gated, default OFF, so no
        // noise until we validate the real-time ingest is tight enough.
        console.log(`[ScheduledPosts] storm_alert_check — ${r.rows.length} candidate events, ${alertedEventKeys.size} tracked`);
    }
    catch (e) {
        console.warn('[ScheduledPosts] checkStormAlerts err:', e);
    }
}
// ─── Daily digest email (6 PM EDT) ───────────────────────────────────────────
async function sendDailyDigest(pool) {
    try {
        const pending = await pool.query(`
      SELECT id, sender_name, LEFT(raw_text, 200) AS msg,
             COALESCE(proposed_kb_doc_name, detected_name) AS proposed,
             trigger_reason, created_at
      FROM kb_learning_candidates
      WHERE status = 'pending'
      ORDER BY created_at DESC LIMIT 30
    `);
        const gaps = await pool.query(`
      SELECT sender_name, LEFT(text, 180) AS reply, created_at
      FROM bot_conversation_turns
      WHERE role = 'bot'
        AND created_at > NOW() - INTERVAL '24 hours'
        AND (text ILIKE '%no intel%' OR text ILIKE '%don''t have%' OR text ILIKE '%not sure%'
             OR text ILIKE '%someone in chat might know%')
      ORDER BY created_at DESC LIMIT 20
    `);
        const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE role='bot') AS replies,
        COUNT(*) FILTER (WHERE role='user') AS questions
      FROM bot_conversation_turns
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
        const teachingToday = await pool.query(`
      SELECT sender_name, status, LEFT(raw_text, 160) AS msg, applied_kb_doc_id
      FROM kb_learning_candidates
      WHERE detected_entity_type = 'teaching'
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
    `);
        const date = new Date().toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', weekday: 'short', timeZone: TZ,
        });
        const subject = `📊 Susan 21 Daily Digest — ${date}`;
        const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const pendingRows = pending.rows.map((p) => `
      <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px">
        <strong>${esc(p.sender_name)}</strong> — ${esc(p.trigger_reason)}<br>
        <span style="color:#475569">${esc(p.msg)}</span><br>
        <code style="font-size:11px;color:#64748b">POST /api/susan/groupme/learnings/${p.id}/approve</code>
      </td></tr>`).join('') || '<tr><td style="padding:8px;color:#64748b;font-size:13px">No pending items 🎉</td></tr>';
        const gapsRows = gaps.rows.map((g) => `
      <tr><td style="padding:6px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155">
        → ${esc(g.reply)}
      </td></tr>`).join('') || '<tr><td style="padding:6px;color:#64748b;font-size:12px">No gaps logged 💪</td></tr>';
        const teachingRows = teachingToday.rows.map((t) => `
      <tr><td style="padding:6px;border-bottom:1px solid #f1f5f9;font-size:12px">
        <strong>${esc(t.sender_name)}</strong>
        <span style="color:${t.status === 'approved' ? '#059669' : '#d97706'}">[${t.status}]</span>
        ${t.applied_kb_doc_id ? `→ KB #${t.applied_kb_doc_id}` : ''}<br>
        <span style="color:#475569">${esc(t.msg)}</span>
      </td></tr>`).join('') || '<tr><td style="padding:6px;color:#64748b;font-size:12px">No teaching events today</td></tr>';
        const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:720px;margin:20px auto;padding:0;background:#f4f4f7">
  <div style="background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;padding:24px;border-radius:8px 8px 0 0">
    <div style="font-size:13px;opacity:.7;letter-spacing:1.5px;text-transform:uppercase">Susan 21 · Sales Team</div>
    <h1 style="margin:6px 0 0;font-size:22px">Daily Digest — ${date}</h1>
  </div>
  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:none">
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:140px;padding:12px;background:#f8fafc;border-radius:6px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:#0f172a">${stats.rows[0].questions}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px">Questions</div>
      </div>
      <div style="flex:1;min-width:140px;padding:12px;background:#f8fafc;border-radius:6px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:#0f172a">${stats.rows[0].replies}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px">Replies</div>
      </div>
      <div style="flex:1;min-width:140px;padding:12px;background:#fef3c7;border-radius:6px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:#92400e">${pending.rowCount}</div>
        <div style="font-size:11px;color:#92400e;text-transform:uppercase;letter-spacing:1px">Pending</div>
      </div>
      <div style="flex:1;min-width:140px;padding:12px;background:#fef2f2;border-radius:6px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:#991b1b">${gaps.rowCount}</div>
        <div style="font-size:11px;color:#991b1b;text-transform:uppercase;letter-spacing:1px">Gaps</div>
      </div>
    </div>

    <h3 style="margin:16px 0 8px;font-size:15px;color:#0f172a">⏳ Pending teaching candidates (${pending.rowCount})</h3>
    <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:4px">${pendingRows}</table>

    <h3 style="margin:20px 0 8px;font-size:15px;color:#0f172a">🧠 Today's teaching activity (${teachingToday.rowCount})</h3>
    <table style="width:100%;border-collapse:collapse">${teachingRows}</table>

    <h3 style="margin:20px 0 8px;font-size:15px;color:#0f172a">📉 Knowledge gaps hit today (${gaps.rowCount})</h3>
    <div style="font-size:12px;color:#64748b;margin-bottom:8px">Topics Susan punted on — candidates for leadership to seed.</div>
    <table style="width:100%;border-collapse:collapse">${gapsRows}</table>
  </div>
  <div style="text-align:center;padding:16px;font-size:12px;color:#64748b">
    Susan 21 · The Roof Docs · ${new Date().toLocaleString('en-US', { timeZone: TZ })} EDT
  </div>
</body></html>`;
        const text = [
            `Susan 21 Daily Digest — ${date}`,
            ``,
            `Questions: ${stats.rows[0].questions} · Replies: ${stats.rows[0].replies}`,
            `Pending teachings: ${pending.rowCount} · Gaps today: ${gaps.rowCount}`,
            ``,
            `=== PENDING TEACHINGS ===`,
            ...pending.rows.map((p) => `[${p.sender_name}] ${p.msg}`),
            ``,
            `=== TODAY'S TEACHING ACTIVITY ===`,
            ...teachingToday.rows.map((t) => `[${t.sender_name}] [${t.status}] ${t.msg}`),
            ``,
            `=== KNOWLEDGE GAPS ===`,
            ...gaps.rows.map((g) => `→ ${g.reply}`),
        ].join('\n');
        await emailService.sendCustomEmail(ADMIN_EMAIL, { subject, html, text });
        console.log(`[ScheduledPosts] digest emailed — pending=${pending.rowCount} gaps=${gaps.rowCount} teachings=${teachingToday.rowCount}`);
    }
    catch (e) {
        console.error('[ScheduledPosts] digest err:', e);
    }
}
// ─── Public API ──────────────────────────────────────────────────────────────
export function startSusanScheduler(pool) {
    const postsOn = process.env.SUSAN_SCHEDULED_POSTS === 'true';
    const eveningOn = process.env.SUSAN_EVENING_POST === 'true';
    const digestOn = process.env.SUSAN_DIGEST_EMAIL === 'true';
    const stormsOn = process.env.SUSAN_STORM_ALERTS === 'true';
    // MRMS swath backfill — defaults ON so cache coverage grows automatically.
    // Disable with SUSAN_SWATH_BACKFILL=false if IEM archive rate-limits us.
    const backfillOn = process.env.SUSAN_SWATH_BACKFILL !== 'false';
    if (!postsOn && !digestOn && !stormsOn && !backfillOn) {
        console.log('[SusanScheduler] all features disabled');
        return;
    }
    if (postsOn) {
        cron.schedule('0 7 * * *', () => postScheduledMotivation(pool, 'morning'), { timezone: TZ });
        cron.schedule('15 12 * * *', () => postScheduledMotivation(pool, 'midday'), { timezone: TZ });
        cron.schedule('30 15 * * *', () => postScheduledMotivation(pool, 'afternoon'), { timezone: TZ });
        if (eveningOn) {
            // Evening flow — 8:00 PM leader email preview, 8:30 PM public recap.
            cron.schedule('0 20 * * *', () => sendRecapPreviewToLeaders(pool), { timezone: TZ });
            cron.schedule('30 20 * * *', () => postEveningRecap(pool), { timezone: TZ });
        }
    }
    if (digestOn) {
        cron.schedule('0 18 * * *', () => sendDailyDigest(pool), { timezone: TZ });
    }
    if (stormsOn) {
        // Every 30 min, 8 AM - 8 PM EDT
        cron.schedule('*/30 8-19 * * *', () => checkStormAlerts(pool), { timezone: TZ });
    }
    if (backfillOn) {
        // Nightly MRMS swath backfill — 3 AM EDT. Catches up to 60 missing storm
        // days per run; 331 days currently missing → full catch-up in ~6 nights.
        // Can run manually via POST /api/hail/admin/backfill-swaths.
        cron.schedule('0 3 * * *', async () => {
            try {
                const { backfillSwathCache } = await import('./swathBackfillService.js');
                const r = await backfillSwathCache(pool, { monthsBack: 24, maxPerRun: 60 });
                console.log(`[SwathBackfill] nightly run done — ${r.succeeded} cached, ${r.failed} failed, ${r.daysRemaining} remaining, ${(r.durationMs / 1000).toFixed(1)}s`);
            }
            catch (e) {
                console.error('[SwathBackfill] nightly run err:', e);
            }
        }, { timezone: TZ });
    }
    // CoCoRaHS ingest — 4:30 AM EDT daily. Pulls last 3 days to cover the 72h
    // observer reporting lag. Gated by COCORAHS_LIVE_ENABLED.
    if (process.env.COCORAHS_LIVE_ENABLED === 'true') {
        cron.schedule('30 4 * * *', async () => {
            try {
                const { CocorahsLiveService } = await import('./cocorahsLiveService.js');
                const svc = new CocorahsLiveService(pool);
                const r = await svc.ingestRecent(3);
                console.log(`[cocorahs-live] daily — fetched=${r.fetched} +${r.inserted} new +${r.updated} upd (${r.errors} errors)`);
            }
            catch (e) {
                console.error('[cocorahs-live] daily err:', e);
            }
        }, { timezone: TZ });
    }
    // IEM LSR ingest — every 30 min during daylight (8 AM - 10 PM EDT). NWS
    // Local Storm Reports flow in near real-time; tighter cadence catches
    // severe weather as it happens. Gated by IEM_LSR_LIVE_ENABLED.
    if (process.env.IEM_LSR_LIVE_ENABLED === 'true') {
        cron.schedule('*/30 8-21 * * *', async () => {
            try {
                const { IemLsrLiveService } = await import('./iemLsrLiveService.js');
                const svc = new IemLsrLiveService(pool);
                const r = await svc.ingestRecent(6);
                if (r.inserted > 0 || r.updated > 0) {
                    console.log(`[iem-lsr-live] 30min — fetched=${r.fetched} +${r.inserted} new +${r.updated} upd (${r.errors} errors)`);
                }
            }
            catch (e) {
                console.error('[iem-lsr-live] 30min err:', e);
            }
        }, { timezone: TZ });
    }
    // NWS Active Alerts — every 5 min, always-on. Hail-bearing warnings are
    // real-time signals that complement the slower LSR/CoCoRaHS reporting
    // cadence. Gated by NWS_ALERTS_LIVE_ENABLED.
    if (process.env.NWS_ALERTS_LIVE_ENABLED === 'true') {
        cron.schedule('*/5 * * * *', async () => {
            try {
                const { NwsAlertsLiveService } = await import('./nwsAlertsService.js');
                const svc = new NwsAlertsLiveService(pool);
                const r = await svc.ingestActive();
                if (r.inserted > 0 || r.updated > 0) {
                    console.log(`[nws-alerts-live] 5min — fetched=${r.fetched} relevant=${r.relevant} +${r.inserted} new +${r.updated} upd (${r.errors} errors)`);
                }
            }
            catch (e) {
                console.error('[nws-alerts-live] 5min err:', e);
            }
        }, { timezone: TZ });
    }
    // mPING (crowd-sourced NWS reports) — hourly during daylight (8 AM - 9 PM EDT).
    // Fills observer gaps where CoCoRaHS volunteers are thin. Gated by
    // MPING_LIVE_ENABLED + MPING_API_TOKEN (free signup at mping.ou.edu).
    if (process.env.MPING_LIVE_ENABLED === 'true' && process.env.MPING_API_TOKEN) {
        cron.schedule('0 8-21 * * *', async () => {
            try {
                const { MpingLiveService } = await import('./mpingLiveService.js');
                const svc = new MpingLiveService(pool);
                const r = await svc.ingestRecent(12);
                if (r.inserted > 0 || r.updated > 0) {
                    console.log(`[mping-live] hourly — fetched=${r.fetched} +${r.inserted} new +${r.updated} upd (${r.errors} errors)`);
                }
            }
            catch (e) {
                console.error('[mping-live] hourly err:', e);
            }
        }, { timezone: TZ });
    }
    console.log(`[SusanScheduler] started — posts=${postsOn} evening=${eveningOn} digest=${digestOn} storms=${stormsOn} backfill=${backfillOn} cocorahs=${process.env.COCORAHS_LIVE_ENABLED === 'true'} iem_lsr=${process.env.IEM_LSR_LIVE_ENABLED === 'true'} tz=${TZ}`);
}
// Manual triggers for testing (exposed via router in susanGroupMeBotRoutes)
export async function triggerMotivationPreview(pool, phase) {
    const ctxHolder = { value: '' };
    const generated = await generateMotivationPost(pool, phase, { contextOut: ctxHolder });
    const fb = fallback(phase);
    const would = generated ?? fb;
    return { generated, fallback: fb, would_post: would, raw_context: ctxHolder.value };
}
export async function triggerMotivationPostNow(pool, phase) {
    const text = (await generateMotivationPost(pool, phase)) ?? fallback(phase);
    const r = await postToGroupMe(text);
    return { ok: r === 'ok', text };
}
export async function triggerDailyDigest(pool) {
    return sendDailyDigest(pool);
}
export async function triggerRecapPreviewEmail(pool) {
    const rollup = await getTodaySignupRollup(pool);
    await sendRecapPreviewToLeaders(pool);
    return { ok: true, leaders: RECAP_PREVIEW_LEADERS.map((l) => l.email), rollup_count: rollup.count };
}
export async function triggerEveningRecapNow(pool) {
    const rossBlock = await rossPostedDailyRecapRecently();
    if (rossBlock) {
        return { ok: true, posted: false, ross_blocked: true, text_or_reason: 'Ross posted daily-sales recap in last 60min — skipped to avoid stepping on him.' };
    }
    const rollup = await getTodaySignupRollup(pool);
    const text = rollup.count === 0
        ? "That's a wrap. Tomorrow we run it back 🌙"
        : `${rollup.count} on the board today — ${rollup.by_rep.slice(0, 6).map((r) => `${r.rep_name.split(' ')[0]}${r.count > 1 ? ` ×${r.count}` : ''}`).join(', ')}${rollup.by_rep.length > 6 ? ` + ${rollup.by_rep.length - 6} more` : ''}. Solid day, team 🔥 Tomorrow we stack again.`;
    return { ok: true, posted: false, ross_blocked: false, text_or_reason: `PREVIEW (not posted): ${text}` };
}
export async function triggerSignupRollup(pool) {
    return getTodaySignupRollup(pool);
}
