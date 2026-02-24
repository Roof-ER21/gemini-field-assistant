/**
 * Agent Network Routes
 * Peer-to-peer market intelligence sharing feed.
 * Reps submit intel → pending → admin approves → visible in feed.
 * Approved intel can be promoted to global_learnings for RAG usage.
 */
import { Router } from 'express';
export function createAgentNetworkRoutes(pool) {
    const router = Router();
    // Helper: resolve user ID from x-user-email header
    async function getUserId(req) {
        const email = req.headers['x-user-email'];
        if (!email)
            return null;
        const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        return result.rows[0]?.id || null;
    }
    // Helper: check admin/manager role
    async function isAdmin(req) {
        const email = req.headers['x-user-email'];
        if (!email)
            return false;
        const result = await pool.query('SELECT role FROM users WHERE email = $1', [email]);
        const role = result.rows[0]?.role;
        return role === 'admin' || role === 'manager';
    }
    // ─── GET / — List approved intel (feed) ───────────────────────────
    router.get('/', async (req, res) => {
        try {
            const { intel_type, state, limit = '50', offset = '0' } = req.query;
            let query = `
        SELECT m.*, u.name as author_name, u.email as author_email
        FROM agent_network_messages m
        JOIN users u ON u.id = m.author_user_id
        WHERE m.status = 'approved'
      `;
            const params = [];
            let paramIdx = 1;
            if (intel_type) {
                query += ` AND m.intel_type = $${paramIdx++}`;
                params.push(intel_type);
            }
            if (state) {
                query += ` AND m.state = $${paramIdx++}`;
                params.push(state);
            }
            query += ` ORDER BY m.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
            params.push(Number(limit), Number(offset));
            const result = await pool.query(query, params);
            res.json(result.rows);
        }
        catch (err) {
            console.error('[AgentNetwork] Feed error:', err);
            res.status(500).json({ error: 'Failed to load intel feed' });
        }
    });
    // ─── GET /pending — List pending intel (admin only) ────────────────
    router.get('/pending', async (req, res) => {
        try {
            if (!(await isAdmin(req))) {
                return res.status(403).json({ error: 'Admin only' });
            }
            const result = await pool.query(`
        SELECT m.*, u.name as author_name, u.email as author_email
        FROM agent_network_messages m
        JOIN users u ON u.id = m.author_user_id
        WHERE m.status = 'pending'
        ORDER BY m.created_at DESC
        LIMIT 100
      `);
            res.json(result.rows);
        }
        catch (err) {
            console.error('[AgentNetwork] Pending list error:', err);
            res.status(500).json({ error: 'Failed to load pending intel' });
        }
    });
    // ─── POST / — Submit new intel ────────────────────────────────────
    router.post('/', async (req, res) => {
        try {
            const userId = await getUserId(req);
            if (!userId)
                return res.status(401).json({ error: 'Not authenticated' });
            const { intel_type, content, state, insurer } = req.body;
            if (!intel_type || !content) {
                return res.status(400).json({ error: 'intel_type and content are required' });
            }
            const result = await pool.query(`INSERT INTO agent_network_messages (author_user_id, intel_type, content, state, insurer)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`, [userId, intel_type, content, state || null, insurer || null]);
            res.status(201).json(result.rows[0]);
        }
        catch (err) {
            console.error('[AgentNetwork] Submit error:', err);
            res.status(500).json({ error: 'Failed to submit intel' });
        }
    });
    // ─── PUT /:id/approve — Approve intel (admin only) ────────────────
    router.put('/:id/approve', async (req, res) => {
        try {
            const adminUserId = await getUserId(req);
            if (!(await isAdmin(req))) {
                return res.status(403).json({ error: 'Admin only' });
            }
            const result = await pool.query(`UPDATE agent_network_messages
         SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2
         RETURNING *`, [adminUserId, req.params.id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Intel not found' });
            }
            res.json(result.rows[0]);
        }
        catch (err) {
            console.error('[AgentNetwork] Approve error:', err);
            res.status(500).json({ error: 'Failed to approve intel' });
        }
    });
    // ─── PUT /:id/reject — Reject intel (admin only) ──────────────────
    router.put('/:id/reject', async (req, res) => {
        try {
            if (!(await isAdmin(req))) {
                return res.status(403).json({ error: 'Admin only' });
            }
            const result = await pool.query(`UPDATE agent_network_messages SET status = 'rejected' WHERE id = $1 RETURNING *`, [req.params.id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Intel not found' });
            }
            res.json(result.rows[0]);
        }
        catch (err) {
            console.error('[AgentNetwork] Reject error:', err);
            res.status(500).json({ error: 'Failed to reject intel' });
        }
    });
    // ─── POST /:id/vote — Vote on intel ──────────────────────────────
    router.post('/:id/vote', async (req, res) => {
        try {
            const userId = await getUserId(req);
            if (!userId)
                return res.status(401).json({ error: 'Not authenticated' });
            const { vote_type } = req.body;
            if (!vote_type || !['up', 'down'].includes(vote_type)) {
                return res.status(400).json({ error: 'vote_type must be "up" or "down"' });
            }
            const messageId = req.params.id;
            // Check for existing vote
            const existing = await pool.query('SELECT id, vote_type FROM agent_network_votes WHERE message_id = $1 AND user_id = $2', [messageId, userId]);
            if (existing.rows.length > 0) {
                const oldVote = existing.rows[0].vote_type;
                if (oldVote === vote_type) {
                    // Same vote — remove it (toggle off)
                    await pool.query('DELETE FROM agent_network_votes WHERE id = $1', [existing.rows[0].id]);
                    const col = vote_type === 'up' ? 'upvotes' : 'downvotes';
                    await pool.query(`UPDATE agent_network_messages SET ${col} = GREATEST(${col} - 1, 0) WHERE id = $1`, [messageId]);
                    return res.json({ action: 'removed', vote_type });
                }
                else {
                    // Different vote — switch
                    await pool.query('UPDATE agent_network_votes SET vote_type = $1 WHERE id = $2', [vote_type, existing.rows[0].id]);
                    const addCol = vote_type === 'up' ? 'upvotes' : 'downvotes';
                    const subCol = vote_type === 'up' ? 'downvotes' : 'upvotes';
                    await pool.query(`UPDATE agent_network_messages SET ${addCol} = ${addCol} + 1, ${subCol} = GREATEST(${subCol} - 1, 0) WHERE id = $1`, [messageId]);
                    return res.json({ action: 'switched', vote_type });
                }
            }
            // New vote
            await pool.query('INSERT INTO agent_network_votes (message_id, user_id, vote_type) VALUES ($1, $2, $3)', [messageId, userId, vote_type]);
            const col = vote_type === 'up' ? 'upvotes' : 'downvotes';
            await pool.query(`UPDATE agent_network_messages SET ${col} = ${col} + 1 WHERE id = $1`, [messageId]);
            res.json({ action: 'voted', vote_type });
        }
        catch (err) {
            console.error('[AgentNetwork] Vote error:', err);
            res.status(500).json({ error: 'Failed to vote' });
        }
    });
    // ─── POST /:id/promote — Promote to global learning (admin) ──────
    router.post('/:id/promote', async (req, res) => {
        try {
            const adminUserId = await getUserId(req);
            if (!(await isAdmin(req))) {
                return res.status(403).json({ error: 'Admin only' });
            }
            // Get the intel message
            const intel = await pool.query('SELECT * FROM agent_network_messages WHERE id = $1', [req.params.id]);
            if (intel.rows.length === 0) {
                return res.status(404).json({ error: 'Intel not found' });
            }
            const msg = intel.rows[0];
            const { category } = req.body;
            // Insert into global_learnings
            const learning = await pool.query(`INSERT INTO global_learnings (title, content, category, state, submitted_by, status, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, $5, 'approved', $6, NOW())
         RETURNING id`, [
                `[Agent Intel] ${msg.intel_type}`,
                msg.content,
                category || 'field_intel',
                msg.state,
                msg.author_user_id,
                adminUserId
            ]);
            // Link back
            await pool.query('UPDATE agent_network_messages SET promoted_to_global_learning_id = $1 WHERE id = $2', [learning.rows[0].id, req.params.id]);
            res.json({ promoted: true, global_learning_id: learning.rows[0].id });
        }
        catch (err) {
            console.error('[AgentNetwork] Promote error:', err);
            res.status(500).json({ error: 'Failed to promote intel' });
        }
    });
    return router;
}
