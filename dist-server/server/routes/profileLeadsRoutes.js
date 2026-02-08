/**
 * Profile Leads Routes
 * API endpoints for managing leads captured from QR profile pages
 */
import { Router } from 'express';
export function createProfileLeadsRoutes(pool) {
    const router = Router();
    // Helper: Check if user is admin
    async function isAdminUser(email) {
        if (!email)
            return false;
        try {
            const result = await pool.query('SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
            return result.rows[0]?.role === 'admin';
        }
        catch (error) {
            console.error('❌ Profile leads admin check failed:', error);
            return false;
        }
    }
    // Helper: Get user's profile ID if they own a profile
    async function getUserProfileId(email) {
        try {
            const result = await pool.query(`
        SELECT ep.id FROM employee_profiles ep
        JOIN users u ON u.id = ep.user_id
        WHERE LOWER(u.email) = LOWER($1)
        LIMIT 1
      `, [email]);
            return result.rows[0]?.id || null;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * GET /api/profile-leads
     * List leads (filtered by role)
     */
    router.get('/', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }
            const isAdmin = await isAdminUser(userEmail);
            const userProfileId = !isAdmin ? await getUserProfileId(userEmail) : null;
            if (!isAdmin && !userProfileId) {
                return res.status(403).json({
                    success: false,
                    error: 'No profile linked to your account'
                });
            }
            const { status, profileId, search, limit = '50', offset = '0' } = req.query;
            let query = `
        SELECT
          pl.*,
          ep.name as profile_name,
          ep.slug as profile_slug
        FROM profile_leads pl
        LEFT JOIN employee_profiles ep ON ep.id = pl.profile_id
        WHERE 1=1
      `;
            const params = [];
            let paramIndex = 1;
            // Non-admins can only see their own leads
            if (!isAdmin) {
                query += ` AND pl.profile_id = $${paramIndex}`;
                params.push(userProfileId);
                paramIndex++;
            }
            else if (profileId) {
                query += ` AND pl.profile_id = $${paramIndex}`;
                params.push(profileId);
                paramIndex++;
            }
            if (status && ['new', 'contacted', 'converted', 'closed'].includes(status)) {
                query += ` AND pl.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }
            if (search) {
                query += ` AND (
          LOWER(pl.homeowner_name) LIKE $${paramIndex}
          OR LOWER(pl.homeowner_email) LIKE $${paramIndex}
          OR pl.homeowner_phone LIKE $${paramIndex}
        )`;
                params.push(`%${search.toLowerCase()}%`);
                paramIndex++;
            }
            query += ` ORDER BY pl.created_at DESC`;
            query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            params.push(Math.min(parseInt(limit), 100), parseInt(offset));
            const result = await pool.query(query, params);
            // Get total count for pagination
            let countQuery = `SELECT COUNT(*) FROM profile_leads pl WHERE 1=1`;
            const countParams = [];
            let countParamIndex = 1;
            if (!isAdmin) {
                countQuery += ` AND pl.profile_id = $${countParamIndex}`;
                countParams.push(userProfileId);
                countParamIndex++;
            }
            else if (profileId) {
                countQuery += ` AND pl.profile_id = $${countParamIndex}`;
                countParams.push(profileId);
                countParamIndex++;
            }
            if (status && ['new', 'contacted', 'converted', 'closed'].includes(status)) {
                countQuery += ` AND pl.status = $${countParamIndex}`;
                countParams.push(status);
            }
            const countResult = await pool.query(countQuery, countParams);
            res.json({
                success: true,
                count: result.rows.length,
                total: parseInt(countResult.rows[0].count),
                leads: result.rows
            });
        }
        catch (error) {
            console.error('❌ List leads error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to list leads'
            });
        }
    });
    /**
     * GET /api/profile-leads/stats
     * Get lead statistics
     */
    router.get('/stats', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }
            const isAdmin = await isAdminUser(userEmail);
            const userProfileId = !isAdmin ? await getUserProfileId(userEmail) : null;
            if (!isAdmin && !userProfileId) {
                return res.status(403).json({
                    success: false,
                    error: 'No profile linked to your account'
                });
            }
            let whereClause = '';
            const params = [];
            if (!isAdmin) {
                whereClause = 'WHERE profile_id = $1';
                params.push(userProfileId);
            }
            const result = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'new') as new_count,
          COUNT(*) FILTER (WHERE status = 'contacted') as contacted_count,
          COUNT(*) FILTER (WHERE status = 'converted') as converted_count,
          COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as this_month
        FROM profile_leads
        ${whereClause}
      `, params);
            const stats = result.rows[0];
            res.json({
                success: true,
                stats: {
                    total: parseInt(stats.total),
                    new: parseInt(stats.new_count),
                    contacted: parseInt(stats.contacted_count),
                    converted: parseInt(stats.converted_count),
                    closed: parseInt(stats.closed_count),
                    thisWeek: parseInt(stats.this_week),
                    thisMonth: parseInt(stats.this_month)
                }
            });
        }
        catch (error) {
            console.error('❌ Lead stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get lead stats'
            });
        }
    });
    /**
     * GET /api/profile-leads/:id
     * Get single lead
     */
    router.get('/:id', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            if (!userEmail) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }
            const isAdmin = await isAdminUser(userEmail);
            const userProfileId = !isAdmin ? await getUserProfileId(userEmail) : null;
            const result = await pool.query(`
        SELECT
          pl.*,
          ep.name as profile_name,
          ep.slug as profile_slug
        FROM profile_leads pl
        LEFT JOIN employee_profiles ep ON ep.id = pl.profile_id
        WHERE pl.id = $1
      `, [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
            }
            const lead = result.rows[0];
            // Non-admins can only see their own leads
            if (!isAdmin && lead.profile_id !== userProfileId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }
            res.json({
                success: true,
                lead
            });
        }
        catch (error) {
            console.error('❌ Get lead error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get lead'
            });
        }
    });
    /**
     * PUT /api/profile-leads/:id
     * Update lead (status, notes, etc.)
     */
    router.put('/:id', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            const { status, homeowner_name, homeowner_email, homeowner_phone, address, service_type, message } = req.body;
            if (!userEmail) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }
            const isAdmin = await isAdminUser(userEmail);
            const userProfileId = !isAdmin ? await getUserProfileId(userEmail) : null;
            // Check access
            const accessCheck = await pool.query('SELECT profile_id FROM profile_leads WHERE id = $1', [id]);
            if (accessCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
            }
            if (!isAdmin && accessCheck.rows[0].profile_id !== userProfileId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }
            // Validate status
            if (status && !['new', 'contacted', 'converted', 'closed'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid status'
                });
            }
            const result = await pool.query(`
        UPDATE profile_leads
        SET
          status = COALESCE($1, status),
          homeowner_name = COALESCE($2, homeowner_name),
          homeowner_email = COALESCE($3, homeowner_email),
          homeowner_phone = COALESCE($4, homeowner_phone),
          address = COALESCE($5, address),
          service_type = COALESCE($6, service_type),
          message = COALESCE($7, message),
          updated_at = NOW()
        WHERE id = $8
        RETURNING *
      `, [status, homeowner_name, homeowner_email, homeowner_phone, address, service_type, message, id]);
            res.json({
                success: true,
                lead: result.rows[0]
            });
        }
        catch (error) {
            console.error('❌ Update lead error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update lead'
            });
        }
    });
    /**
     * DELETE /api/profile-leads/:id
     * Delete lead (admin only)
     */
    router.delete('/:id', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            if (!await isAdminUser(userEmail)) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }
            const result = await pool.query('DELETE FROM profile_leads WHERE id = $1 RETURNING id', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
            }
            res.json({
                success: true,
                message: 'Lead deleted'
            });
        }
        catch (error) {
            console.error('❌ Delete lead error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete lead'
            });
        }
    });
    /**
     * POST /api/profile-leads/:id/convert
     * Mark lead as converted
     */
    router.post('/:id/convert', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            if (!userEmail) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }
            const isAdmin = await isAdminUser(userEmail);
            const userProfileId = !isAdmin ? await getUserProfileId(userEmail) : null;
            // Check access
            const accessCheck = await pool.query('SELECT profile_id FROM profile_leads WHERE id = $1', [id]);
            if (accessCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Lead not found'
                });
            }
            if (!isAdmin && accessCheck.rows[0].profile_id !== userProfileId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }
            const result = await pool.query(`
        UPDATE profile_leads
        SET status = 'converted', updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);
            res.json({
                success: true,
                message: 'Lead marked as converted',
                lead: result.rows[0]
            });
        }
        catch (error) {
            console.error('❌ Convert lead error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to convert lead'
            });
        }
    });
    return router;
}
export default createProfileLeadsRoutes;
