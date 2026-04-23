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
import type pg from 'pg';
import { emailService } from './emailService.js';
import { postToGroupMe } from '../routes/susanGroupMeBotRoutes.js';

const TZ = 'America/New_York';
const ADMIN_EMAIL = process.env.EMAIL_ADMIN_ADDRESS || 'ahmed.mahmoud@theroofdocs.com';
const SALES_GROUP_ID = process.env.GROUPME_SUSAN_GROUP_ID || '93177620';
const GROUPME_TOKEN = process.env.GROUPME_TOKEN || '';

type Phase = 'morning' | 'midday' | 'afternoon' | 'evening';

// ─── Context gatherers ───────────────────────────────────────────────────────

async function getStormContext(pool: pg.Pool): Promise<string> {
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
    if (r.rows.length === 0) return '';
    // Format dates as "Apr 22" (short, chat-friendly). event_date can be a JS
    // Date or an ISO string depending on pg driver settings — coerce to Date.
    const fmt = (d: any) => {
      const dt = d instanceof Date ? d : new Date(String(d));
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
    };
    return r.rows
      .map((x: any) => {
        const size = x.max_hail ? `${x.max_hail}" hail` : (x.max_wind ? `${x.max_wind}mph wind` : '');
        return `${fmt(x.event_date)} ${x.state}: ${size} (${x.events} events)`;
      })
      .join('; ');
  } catch (e) {
    console.warn('[ScheduledPosts] storm ctx err:', e);
    return '';
  }
}

// Count signup posts in Sales Team today (fetched live via GroupMe API)
async function getTodaySignupCount(): Promise<number> {
  if (!GROUPME_TOKEN) return 0;
  try {
    const r = await fetch(
      `https://api.groupme.com/v3/groups/${SALES_GROUP_ID}/messages?limit=100&token=${GROUPME_TOKEN}`,
      { method: 'GET' }
    );
    if (!r.ok) return 0;
    const d: any = await r.json();
    const msgs = d?.response?.messages || [];
    const now = new Date();
    const todayStart = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
    todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime() / 1000;
    let count = 0;
    for (const m of msgs) {
      const t = String(m.text || '').trim();
      if (m.created_at >= todayTs && /^(sign\s*up|signup)\b/i.test(t)) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

// Pull a few recent chat snippets to flavor the post (optional)
async function getRecentChatVibes(): Promise<string> {
  if (!GROUPME_TOKEN) return '';
  try {
    const r = await fetch(
      `https://api.groupme.com/v3/groups/${SALES_GROUP_ID}/messages?limit=20&token=${GROUPME_TOKEN}`,
      { method: 'GET' }
    );
    if (!r.ok) return '';
    const d: any = await r.json();
    const msgs = d?.response?.messages || [];
    return msgs
      .filter((m: any) => m.sender_type === 'user' && m.text && m.text.length > 8 && m.text.length < 200)
      .slice(0, 6)
      .map((m: any) => `[${m.name}] ${m.text.slice(0, 120)}`)
      .join('\n');
  } catch {
    return '';
  }
}

// ─── LLM generation ──────────────────────────────────────────────────────────

const PHASE_BRIEFS: Record<Phase, string> = {
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

function looksBad(text: string): boolean {
  const low = text.toLowerCase();
  if (BANNED_OPENERS.some((b) => low.startsWith(b))) return true;
  if (text.length < 20 || text.length > 500) return true;
  // reject bullet / numbered list
  if (/\n\s*[-*•1-9]\.\s/.test(text)) return true;
  return false;
}

async function tryGemini(prompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.95, maxOutputTokens: 250 },
        }),
      }
    );
    if (!resp.ok) return null;
    const d: any = await resp.json();
    const text = d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text && !looksBad(text) ? text : null;
  } catch {
    return null;
  }
}

async function tryGroq(prompt: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
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
    if (!resp.ok) return null;
    const d: any = await resp.json();
    const text = d?.choices?.[0]?.message?.content?.trim();
    return text && !looksBad(text) ? text : null;
  } catch {
    return null;
  }
}

export async function generateMotivationPost(pool: pg.Pool, phase: Phase): Promise<string | null> {
  const storms = phase === 'morning' ? await getStormContext(pool) : '';
  const signups = phase !== 'morning' ? await getTodaySignupCount() : 0;
  const dow = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: TZ });
  const monthDay = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });

  const contextLines: string[] = [`Today: ${dow} ${monthDay}`, `Phase: ${phase}`];
  if (storms) contextLines.push(`Verified storms last 36hr: ${storms}`);
  if (!storms && phase === 'morning') contextLines.push('No verified storms last 36hr.');
  if (phase !== 'morning') {
    if (signups > 0) {
      contextLines.push(`Signup posts counted in chat today: ${signups}. (May undercount — reps sometimes post later.)`);
    } else {
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

Write the post. Just the text, no quotes, no prefix.`;

  return (await tryGemini(prompt)) ?? (await tryGroq(prompt));
}

// ─── Fallbacks ──────────────────────────────────────────────────────────────

const FALLBACKS: Record<Phase, string[]> = {
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

function fallback(phase: Phase): string {
  const arr = FALLBACKS[phase];
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Main scheduled-post action ──────────────────────────────────────────────

async function postScheduledMotivation(pool: pg.Pool, phase: Phase): Promise<void> {
  try {
    const text = (await generateMotivationPost(pool, phase)) ?? fallback(phase);
    const result = await postToGroupMe(text);
    console.log(`[ScheduledPosts] ${phase}: ${result === 'ok' ? 'posted' : 'post_failed'} — ${text.slice(0, 80)}`);
  } catch (e) {
    console.error(`[ScheduledPosts] ${phase}:`, e);
  }
}

// ─── Daily digest email (6 PM EDT) ───────────────────────────────────────────

async function sendDailyDigest(pool: pg.Pool): Promise<void> {
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

    const esc = (s: string) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);

    const pendingRows = pending.rows.map((p: any) => `
      <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px">
        <strong>${esc(p.sender_name)}</strong> — ${esc(p.trigger_reason)}<br>
        <span style="color:#475569">${esc(p.msg)}</span><br>
        <code style="font-size:11px;color:#64748b">POST /api/susan/groupme/learnings/${p.id}/approve</code>
      </td></tr>`).join('') || '<tr><td style="padding:8px;color:#64748b;font-size:13px">No pending items 🎉</td></tr>';

    const gapsRows = gaps.rows.map((g: any) => `
      <tr><td style="padding:6px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155">
        → ${esc(g.reply)}
      </td></tr>`).join('') || '<tr><td style="padding:6px;color:#64748b;font-size:12px">No gaps logged 💪</td></tr>';

    const teachingRows = teachingToday.rows.map((t: any) => `
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
      ...pending.rows.map((p: any) => `[${p.sender_name}] ${p.msg}`),
      ``,
      `=== TODAY'S TEACHING ACTIVITY ===`,
      ...teachingToday.rows.map((t: any) => `[${t.sender_name}] [${t.status}] ${t.msg}`),
      ``,
      `=== KNOWLEDGE GAPS ===`,
      ...gaps.rows.map((g: any) => `→ ${g.reply}`),
    ].join('\n');

    await emailService.sendCustomEmail(ADMIN_EMAIL, { subject, html, text });
    console.log(`[ScheduledPosts] digest emailed — pending=${pending.rowCount} gaps=${gaps.rowCount} teachings=${teachingToday.rowCount}`);
  } catch (e) {
    console.error('[ScheduledPosts] digest err:', e);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function startSusanScheduler(pool: pg.Pool): void {
  const postsOn = process.env.SUSAN_SCHEDULED_POSTS === 'true';
  const eveningOn = process.env.SUSAN_EVENING_POST === 'true';
  const digestOn = process.env.SUSAN_DIGEST_EMAIL === 'true';

  if (!postsOn && !digestOn) {
    console.log('[SusanScheduler] all features disabled (set SUSAN_SCHEDULED_POSTS / SUSAN_DIGEST_EMAIL = true to enable)');
    return;
  }

  if (postsOn) {
    cron.schedule('0 7 * * *', () => postScheduledMotivation(pool, 'morning'), { timezone: TZ });
    cron.schedule('15 12 * * *', () => postScheduledMotivation(pool, 'midday'), { timezone: TZ });
    cron.schedule('30 15 * * *', () => postScheduledMotivation(pool, 'afternoon'), { timezone: TZ });
    if (eveningOn) {
      cron.schedule('30 20 * * *', () => postScheduledMotivation(pool, 'evening'), { timezone: TZ });
    }
  }
  if (digestOn) {
    cron.schedule('0 18 * * *', () => sendDailyDigest(pool), { timezone: TZ });
  }
  console.log(`[SusanScheduler] started — posts=${postsOn} evening=${eveningOn} digest=${digestOn} tz=${TZ}`);
}

// Manual triggers for testing (exposed via router in susanGroupMeBotRoutes)
export async function triggerMotivationPreview(pool: pg.Pool, phase: Phase): Promise<{ generated: string | null; fallback: string; would_post: string }> {
  const generated = await generateMotivationPost(pool, phase);
  const fb = fallback(phase);
  const would = generated ?? fb;
  return { generated, fallback: fb, would_post: would };
}

export async function triggerMotivationPostNow(pool: pg.Pool, phase: Phase): Promise<{ ok: boolean; text: string }> {
  const text = (await generateMotivationPost(pool, phase)) ?? fallback(phase);
  const r = await postToGroupMe(text);
  return { ok: r === 'ok', text };
}

export async function triggerDailyDigest(pool: pg.Pool): Promise<void> {
  return sendDailyDigest(pool);
}
