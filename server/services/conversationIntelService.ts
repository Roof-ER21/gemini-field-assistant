/**
 * Conversation Intelligence Service
 *
 * Handles:
 * 1. Auto-generating conversation summaries after chat sessions
 * 2. Loading past conversation context for session continuity
 * 3. Converting negative feedback into global learning candidates
 */

import pg from 'pg';

const { Pool } = pg;

interface ChatMessage {
  sender: 'user' | 'bot';
  content: string;
}

interface ConversationSummary {
  summary: string;
  key_facts: string[];
  decisions_reached: string[];
  action_items: string[];
  topics: string[];
  insurers_mentioned: string[];
  states_mentioned: string[];
  user_sentiment: string;
}

/**
 * Use Gemini to summarize a chat session, then save to DB.
 */
export async function summarizeAndSaveSession(
  pool: pg.Pool,
  userId: string,
  sessionId: string,
  messages: ChatMessage[]
): Promise<ConversationSummary | null> {
  // Need at least 2 exchanges to be worth summarizing
  const userMsgs = messages.filter(m => m.sender === 'user');
  if (userMsgs.length < 2) return null;

  // Build conversation text for the LLM
  const transcript = messages
    .map(m => `${m.sender === 'user' ? 'REP' : 'SUSAN'}: ${m.content}`)
    .join('\n\n');

  // Use Gemini to summarize
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!geminiKey) {
    console.warn('[ConversationIntel] No Gemini API key — skipping summary');
    return null;
  }

  const prompt = `You are analyzing a chat session between a roofing sales rep and Susan, an AI assistant for Roof ER The Roof Docs.

Summarize this conversation. Extract ONLY what was actually discussed — do not invent.

CONVERSATION:
${transcript.slice(0, 6000)}

Respond with ONLY valid JSON (no markdown, no text before/after):
{
  "summary": "2-3 sentence overview of what was discussed and any outcomes",
  "key_facts": ["specific facts learned about homeowner, property, claim, adjuster, etc."],
  "decisions_reached": ["any decisions made during the conversation"],
  "action_items": ["follow-ups the rep needs to do"],
  "topics": ["main topics: e.g. 'hail damage', 'claim filing', 'email drafting', 'supplement'"],
  "insurers_mentioned": ["any insurance companies mentioned"],
  "states_mentioned": ["any states mentioned: VA, MD, PA"],
  "user_sentiment": "positive | neutral | frustrated | confused"
}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
        }),
      }
    );

    if (!res.ok) {
      console.error('[ConversationIntel] Gemini error:', res.status);
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[ConversationIntel] No JSON in Gemini response');
      return null;
    }

    const parsed: ConversationSummary = JSON.parse(jsonMatch[0]);

    // Save to DB
    await pool.query(
      `INSERT INTO conversation_summaries
        (user_id, session_id, summary, key_facts, decisions_reached, action_items,
         topics, insurers_mentioned, states_mentioned, message_count, user_sentiment,
         conversation_start, conversation_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() - INTERVAL '1 hour', NOW())
       ON CONFLICT (user_id, session_id) DO UPDATE SET
         summary = EXCLUDED.summary,
         key_facts = EXCLUDED.key_facts,
         decisions_reached = EXCLUDED.decisions_reached,
         action_items = EXCLUDED.action_items,
         topics = EXCLUDED.topics,
         insurers_mentioned = EXCLUDED.insurers_mentioned,
         states_mentioned = EXCLUDED.states_mentioned,
         message_count = EXCLUDED.message_count,
         user_sentiment = EXCLUDED.user_sentiment,
         conversation_end = NOW()`,
      [
        userId, sessionId, parsed.summary,
        JSON.stringify(parsed.key_facts || []),
        JSON.stringify(parsed.decisions_reached || []),
        JSON.stringify(parsed.action_items || []),
        JSON.stringify(parsed.topics || []),
        JSON.stringify(parsed.insurers_mentioned || []),
        JSON.stringify(parsed.states_mentioned || []),
        messages.length,
        parsed.user_sentiment || 'neutral',
      ]
    );

    console.log(`[ConversationIntel] Saved summary for session ${sessionId} (${messages.length} msgs)`);
    return parsed;
  } catch (err) {
    console.error('[ConversationIntel] Summary generation failed:', (err as Error).message);
    return null;
  }
}

/**
 * Load recent conversation summaries for context injection.
 * Returns formatted text block for the system prompt.
 */
export async function loadRecentSummaries(
  pool: pg.Pool,
  userId: string,
  limit: number = 3
): Promise<string> {
  try {
    const { rows } = await pool.query(
      `SELECT summary, key_facts, action_items, topics, conversation_end
       FROM conversation_summaries
       WHERE user_id = $1
       ORDER BY conversation_end DESC NULLS LAST
       LIMIT $2`,
      [userId, limit]
    );

    if (!rows.length) return '';

    const lines = rows.map((r, i) => {
      const ago = r.conversation_end
        ? timeAgo(new Date(r.conversation_end))
        : 'recently';
      const facts = (r.key_facts || []).slice(0, 3).join('; ');
      const actions = (r.action_items || []).slice(0, 2).join('; ');
      let block = `${i + 1}. (${ago}) ${r.summary}`;
      if (facts) block += `\n   Facts: ${facts}`;
      if (actions) block += `\n   Action items: ${actions}`;
      return block;
    });

    return `\n\n[RECENT CONVERSATION HISTORY]\nYou previously discussed these topics with this rep:\n${lines.join('\n')}`;
  } catch (err) {
    console.error('[ConversationIntel] Failed to load summaries:', (err as Error).message);
    return '';
  }
}

/**
 * Convert negative feedback into a global learning candidate.
 */
export async function createLearningFromFeedback(
  pool: pg.Pool,
  feedbackId: string,
  userQuery: string,
  susanResponse: string,
  feedbackComment: string | undefined,
  tags: string[],
  state?: string,
  insurer?: string
): Promise<void> {
  try {
    // Build a normalized key from the user's question
    const normalizedKey = userQuery
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .slice(0, 100);

    const scopeKey = [state || 'any', insurer || 'any'].join('|');

    // Build the learning content
    const content = feedbackComment
      ? `Rep reported issue: "${feedbackComment}". Original question: "${userQuery.slice(0, 200)}". Susan's response was marked as unhelpful.`
      : `Rep marked this response as unhelpful. Question: "${userQuery.slice(0, 200)}". Tags: ${tags.join(', ')}`;

    await pool.query(
      `INSERT INTO global_learnings
        (normalized_key, scope_key, scope_state, scope_insurer, content, status, total_count, last_feedback_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', 1, NOW())
       ON CONFLICT (normalized_key, scope_key) DO UPDATE SET
         total_count = global_learnings.total_count + 1,
         last_feedback_at = NOW(),
         content = CASE
           WHEN LENGTH(EXCLUDED.content) > LENGTH(global_learnings.content) THEN EXCLUDED.content
           ELSE global_learnings.content
         END`,
      [normalizedKey, scopeKey, state || null, insurer || null, content]
    );

    // Link feedback to learning
    const learningRow = await pool.query(
      `SELECT id FROM global_learnings WHERE normalized_key = $1 AND scope_key = $2`,
      [normalizedKey, scopeKey]
    );
    if (learningRow.rows.length > 0) {
      await pool.query(
        `INSERT INTO global_learning_sources (global_learning_id, feedback_id)
         VALUES ($1, $2::uuid) ON CONFLICT DO NOTHING`,
        [learningRow.rows[0].id, feedbackId]
      ).catch(() => {}); // Ignore if feedback_id doesn't match UUID format
    }

    console.log(`[ConversationIntel] Created learning candidate from negative feedback: "${normalizedKey.slice(0, 50)}..."`);
  } catch (err) {
    console.error('[ConversationIntel] Failed to create learning from feedback:', (err as Error).message);
  }
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}
