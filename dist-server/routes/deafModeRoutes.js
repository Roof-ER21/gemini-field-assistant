/**
 * Deaf Communication Mode API Routes
 *
 * Handles session lifecycle, transcript logging, and quick-response
 * retrieval for the Deaf Communication Mode feature in the Roof-ER21
 * field sales app.
 *
 * Tables required (run migration before use):
 *   deaf_mode_sessions
 *   deaf_mode_transcript
 *   deaf_mode_quick_responses
 */
import { Router } from 'express';
const router = Router();
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Pull the shared pg Pool injected via app.set('pool', pool) in index.ts */
const getPool = (req) => req.app.get('pool');
/**
 * Wraps a query that references tables which may not exist yet (migration
 * pending).  Returns a clear 503 instead of a cryptic Postgres error.
 */
const tableExists = async (pool, tableName) => {
    const result = await pool.query(`SELECT to_regclass($1) AS oid`, [tableName]);
    return result.rows[0]?.oid !== null;
};
/** Quick guard — returns false and sends a 503 when the table is absent. */
const requireTable = async (pool, tableName, res) => {
    const exists = await tableExists(pool, tableName);
    if (!exists) {
        res.status(503).json({
            error: 'Feature not yet available',
            detail: `Table "${tableName}" does not exist. Run the deaf_mode migration first.`,
        });
        return false;
    }
    return true;
};
// ---------------------------------------------------------------------------
// POST /api/deaf-mode/sessions
// Create a new deaf communication session
// ---------------------------------------------------------------------------
router.post('/sessions', async (req, res) => {
    try {
        const pool = getPool(req);
        if (!(await requireTable(pool, 'deaf_mode_sessions', res)))
            return;
        const { rep_user_id, lead_id = null } = req.body;
        if (!rep_user_id) {
            return res.status(400).json({ error: 'rep_user_id is required' });
        }
        const result = await pool.query(`INSERT INTO deaf_mode_sessions
         (rep_user_id, lead_id, started_at,
          total_signs_recognized, total_quick_taps,
          total_typed_messages, total_rep_utterances,
          avg_sign_confidence, gemini_fallback_count)
       VALUES ($1, $2, NOW(), 0, 0, 0, 0, NULL, 0)
       RETURNING id, rep_user_id, lead_id, started_at`, [rep_user_id, lead_id]);
        return res.status(201).json(result.rows[0]);
    }
    catch (err) {
        console.error('[DeafMode] POST /sessions error:', err);
        return res.status(500).json({ error: 'Failed to create session' });
    }
});
// ---------------------------------------------------------------------------
// PUT /api/deaf-mode/sessions/:id/end
// End a session and attach optional notes; re-compute summary stats
// ---------------------------------------------------------------------------
router.put('/sessions/:id/end', async (req, res) => {
    try {
        const pool = getPool(req);
        const sessionId = parseInt(req.params.id, 10);
        if (isNaN(sessionId)) {
            return res.status(400).json({ error: 'Invalid session id' });
        }
        if (!(await requireTable(pool, 'deaf_mode_sessions', res)))
            return;
        const { notes = null } = req.body;
        // Aggregate stats from the transcript in one pass
        const statsResult = await pool.query(`SELECT
         COUNT(*) FILTER (WHERE input_method = 'quick_tap')           AS total_quick_taps,
         COUNT(*) FILTER (WHERE input_method = 'typed')               AS total_typed_messages,
         COUNT(*) FILTER (WHERE input_method IN ('sign_language','fingerspell')) AS total_signs_recognized,
         COUNT(*) FILTER (WHERE speaker = 'rep')                      AS total_rep_utterances,
         AVG(sign_confidence) FILTER (WHERE sign_confidence IS NOT NULL) AS avg_sign_confidence,
         COUNT(*) FILTER (WHERE recognition_source = 'gemini_fallback') AS gemini_fallback_count
       FROM deaf_mode_transcript
       WHERE session_id = $1`, [sessionId]);
        const s = statsResult.rows[0];
        const updateResult = await pool.query(`UPDATE deaf_mode_sessions
       SET
         ended_at               = NOW(),
         notes                  = $2,
         total_quick_taps       = $3,
         total_typed_messages   = $4,
         total_signs_recognized = $5,
         total_rep_utterances   = $6,
         avg_sign_confidence    = $7,
         gemini_fallback_count  = $8
       WHERE id = $1
       RETURNING *`, [
            sessionId,
            notes,
            parseInt(s.total_quick_taps, 10) || 0,
            parseInt(s.total_typed_messages, 10) || 0,
            parseInt(s.total_signs_recognized, 10) || 0,
            parseInt(s.total_rep_utterances, 10) || 0,
            s.avg_sign_confidence !== null ? parseFloat(s.avg_sign_confidence) : null,
            parseInt(s.gemini_fallback_count, 10) || 0,
        ]);
        if (updateResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        return res.status(200).json(updateResult.rows[0]);
    }
    catch (err) {
        console.error('[DeafMode] PUT /sessions/:id/end error:', err);
        return res.status(500).json({ error: 'Failed to end session' });
    }
});
// ---------------------------------------------------------------------------
// POST /api/deaf-mode/transcript
// Log one conversation turn
// ---------------------------------------------------------------------------
router.post('/transcript', async (req, res) => {
    try {
        const pool = getPool(req);
        if (!(await requireTable(pool, 'deaf_mode_transcript', res)))
            return;
        const { session_id, speaker, input_method, content, sign_confidence = null, recognition_source = 'manual', } = req.body;
        // Required field validation
        if (!session_id) {
            return res.status(400).json({ error: 'session_id is required' });
        }
        if (!speaker || !['rep', 'homeowner'].includes(speaker)) {
            return res.status(400).json({
                error: 'speaker must be "rep" or "homeowner"',
            });
        }
        const validInputMethods = [
            'speech', 'quick_tap', 'typed',
            'sign_language', 'fingerspell', 'handwriting', 'head_gesture',
        ];
        if (!input_method || !validInputMethods.includes(input_method)) {
            return res.status(400).json({
                error: `input_method must be one of: ${validInputMethods.join(', ')}`,
            });
        }
        if (!content) {
            return res.status(400).json({ error: 'content is required' });
        }
        const result = await pool.query(`INSERT INTO deaf_mode_transcript
         (session_id, timestamp, speaker, input_method,
          content, sign_confidence, recognition_source)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6)
       RETURNING id`, [session_id, speaker, input_method, content, sign_confidence, recognition_source]);
        return res.status(201).json(result.rows[0]);
    }
    catch (err) {
        console.error('[DeafMode] POST /transcript error:', err);
        return res.status(500).json({ error: 'Failed to log transcript entry' });
    }
});
// ---------------------------------------------------------------------------
// GET /api/deaf-mode/sessions/:id/transcript
// Full session record + ordered transcript
// ---------------------------------------------------------------------------
router.get('/sessions/:id/transcript', async (req, res) => {
    try {
        const pool = getPool(req);
        const sessionId = parseInt(req.params.id, 10);
        if (isNaN(sessionId)) {
            return res.status(400).json({ error: 'Invalid session id' });
        }
        if (!(await requireTable(pool, 'deaf_mode_sessions', res)))
            return;
        // Session header
        const sessionResult = await pool.query(`SELECT * FROM deaf_mode_sessions WHERE id = $1`, [sessionId]);
        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        // Full transcript, chronological
        const transcriptResult = await pool.query(`SELECT
         id, speaker, content, input_method,
         sign_confidence, recognition_source, timestamp
       FROM deaf_mode_transcript
       WHERE session_id = $1
       ORDER BY timestamp ASC, id ASC`, [sessionId]);
        return res.status(200).json({
            session: sessionResult.rows[0],
            transcript: transcriptResult.rows,
        });
    }
    catch (err) {
        console.error('[DeafMode] GET /sessions/:id/transcript error:', err);
        return res.status(500).json({ error: 'Failed to retrieve transcript' });
    }
});
// ---------------------------------------------------------------------------
// GET /api/deaf-mode/quick-responses
// Return active quick-responses grouped by scope
// ---------------------------------------------------------------------------
router.get('/quick-responses', async (req, res) => {
    try {
        const pool = getPool(req);
        if (!(await requireTable(pool, 'deaf_mode_quick_responses', res)))
            return;
        // Optional: filter to a specific owner or just show global (owner_id IS NULL)
        const { owner_id } = req.query;
        let query = `
      SELECT id, category, label, display_order, scope, owner_id
      FROM deaf_mode_quick_responses
      WHERE is_active = true
    `;
        const params = [];
        if (owner_id) {
            // Return global responses OR responses owned by this user
            query += ` AND (owner_id IS NULL OR owner_id = $1)`;
            params.push(owner_id);
        }
        else {
            // Global only when no owner specified
            query += ` AND owner_id IS NULL`;
        }
        query += ` ORDER BY scope, display_order ASC, label ASC`;
        const result = await pool.query(query, params);
        // Group by scope for convenient frontend consumption
        const grouped = {};
        for (const row of result.rows) {
            const scope = row.scope || 'universal';
            if (!grouped[scope])
                grouped[scope] = [];
            grouped[scope].push(row);
        }
        return res.status(200).json(grouped);
    }
    catch (err) {
        console.error('[DeafMode] GET /quick-responses error:', err);
        return res.status(500).json({ error: 'Failed to retrieve quick responses' });
    }
});
// ---------------------------------------------------------------------------
// GET /api/deaf-mode/sessions
// Paginated session list for a rep
// ---------------------------------------------------------------------------
router.get('/sessions', async (req, res) => {
    try {
        const pool = getPool(req);
        if (!(await requireTable(pool, 'deaf_mode_sessions', res)))
            return;
        const { rep_user_id, limit = '20', offset = '0' } = req.query;
        if (!rep_user_id) {
            return res.status(400).json({ error: 'rep_user_id query parameter is required' });
        }
        const parsedLimit = Math.min(parseInt(limit, 10) || 20, 100); // cap at 100
        const parsedOffset = parseInt(offset, 10) || 0;
        // Run count + data in parallel for efficiency
        const [countResult, dataResult] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS total
         FROM deaf_mode_sessions
         WHERE rep_user_id = $1`, [rep_user_id]),
            pool.query(`SELECT
           id, rep_user_id, lead_id, started_at, ended_at,
           total_signs_recognized, total_quick_taps,
           total_typed_messages, total_rep_utterances,
           avg_sign_confidence, gemini_fallback_count, notes
         FROM deaf_mode_sessions
         WHERE rep_user_id = $1
         ORDER BY started_at DESC
         LIMIT $2 OFFSET $3`, [rep_user_id, parsedLimit, parsedOffset]),
        ]);
        return res.status(200).json({
            sessions: dataResult.rows,
            total: countResult.rows[0]?.total ?? 0,
        });
    }
    catch (err) {
        console.error('[DeafMode] GET /sessions error:', err);
        return res.status(500).json({ error: 'Failed to retrieve sessions' });
    }
});
export default router;
