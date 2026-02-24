/**
 * Manager Directives Routes
 * CRUD for admin-created directives that Susan follows for all reps.
 */
import express from 'express';
function getRequestEmail(req) {
    return (req.header('x-user-email') || '').trim().toLowerCase();
}
export function createDirectiveRoutes(pool) {
    const router = express.Router();
    /** Resolve userId and verify admin/manager role */
    async function requireAdmin(req, res) {
        const email = getRequestEmail(req);
        if (!email) {
            res.status(401).json({ error: 'Missing x-user-email header' });
            return null;
        }
        const result = await pool.query('SELECT id, role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
        const user = result.rows[0];
        if (!user) {
            res.status(401).json({ error: 'User not found' });
            return null;
        }
        if (user.role !== 'admin' && user.role !== 'manager') {
            res.status(403).json({ error: 'Admin or manager role required' });
            return null;
        }
        return user.id;
    }
    // GET / — list all directives (any authenticated user, for Susan context)
    router.get('/', async (req, res) => {
        try {
            const activeOnly = req.query.active !== 'false';
            let query = `
        SELECT d.*, u.name as created_by_name, u.email as created_by_email
        FROM manager_directives d
        JOIN users u ON d.created_by = u.id
      `;
            if (activeOnly) {
                query += ` WHERE d.is_active = true
                    AND (d.effective_until IS NULL OR d.effective_until > NOW())`;
            }
            query += ` ORDER BY
        CASE d.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
        d.created_at DESC`;
            const result = await pool.query(query);
            return res.json(result.rows);
        }
        catch (err) {
            console.error('[Directives] Error listing:', err);
            return res.status(500).json({ error: 'Failed to list directives' });
        }
    });
    // POST / — create directive (admin only)
    router.post('/', async (req, res) => {
        const userId = await requireAdmin(req, res);
        if (!userId)
            return;
        try {
            const body = req.body;
            if (!body.title || !body.content) {
                return res.status(400).json({ error: 'title and content are required' });
            }
            const result = await pool.query(`INSERT INTO manager_directives (created_by, title, content, priority, target_audience, effective_from, effective_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`, [
                userId,
                body.title.trim(),
                body.content.trim(),
                body.priority || 'normal',
                body.target_audience || 'all',
                body.effective_from || new Date().toISOString(),
                body.effective_until || null,
            ]);
            return res.status(201).json(result.rows[0]);
        }
        catch (err) {
            console.error('[Directives] Error creating:', err);
            return res.status(500).json({ error: 'Failed to create directive' });
        }
    });
    // PUT /:id — update directive (admin only)
    router.put('/:id', async (req, res) => {
        const userId = await requireAdmin(req, res);
        if (!userId)
            return;
        try {
            const { id } = req.params;
            const body = req.body;
            const result = await pool.query(`UPDATE manager_directives SET
           title = COALESCE($2, title),
           content = COALESCE($3, content),
           priority = COALESCE($4, priority),
           target_audience = COALESCE($5, target_audience),
           is_active = COALESCE($6, is_active),
           effective_until = COALESCE($7, effective_until),
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`, [
                id,
                body.title?.trim() || null,
                body.content?.trim() || null,
                body.priority || null,
                body.target_audience || null,
                body.is_active ?? null,
                body.effective_until || null,
            ]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Directive not found' });
            }
            return res.json(result.rows[0]);
        }
        catch (err) {
            console.error('[Directives] Error updating:', err);
            return res.status(500).json({ error: 'Failed to update directive' });
        }
    });
    // DELETE /:id — delete directive (admin only)
    router.delete('/:id', async (req, res) => {
        const userId = await requireAdmin(req, res);
        if (!userId)
            return;
        try {
            const result = await pool.query('DELETE FROM manager_directives WHERE id = $1 RETURNING id', [req.params.id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Directive not found' });
            }
            return res.json({ success: true });
        }
        catch (err) {
            console.error('[Directives] Error deleting:', err);
            return res.status(500).json({ error: 'Failed to delete directive' });
        }
    });
    return router;
}
export default createDirectiveRoutes;
