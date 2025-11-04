/**
 * Backend API Server for Susan 21
 * Provides REST API endpoints for PostgreSQL database operations
 */
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { emailService } from './services/emailService.js';
const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3001;
// ============================================================================
// DATABASE CONNECTION
// ============================================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection error:', err);
    }
    else {
        console.log('✅ Database connected successfully at', res.rows[0].now);
    }
});
// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// Request logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});
// ============================================================================
// HELPERS
// ============================================================================
// Normalize emails for comparison
function normalizeEmail(email) {
    if (!email || typeof email !== 'string')
        return null;
    return email.trim().toLowerCase();
}
// Resolve user email from request header and fallback
function getRequestEmail(req) {
    const headerEmail = normalizeEmail(req.header('x-user-email'));
    return headerEmail || 'demo@roofer.com';
}
// Get or create a user by email, marking admin based on env
async function getOrCreateUserIdByEmail(email) {
    const norm = normalizeEmail(email);
    if (!norm)
        return null;
    try {
        // Try existing
        const existing = await pool.query('SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [norm]);
        if (existing.rows.length > 0) {
            return existing.rows[0].id;
        }
        // Determine role (admin if matches configured admin email)
        const adminEnv = normalizeEmail(process.env.EMAIL_ADMIN_ADDRESS || process.env.ADMIN_EMAIL);
        const role = adminEnv && adminEnv === norm ? 'admin' : 'sales_rep';
        const created = await pool.query(`INSERT INTO users (email, name, role)
       VALUES ($1, $2, $3)
       RETURNING id`, [norm, norm.split('@')[0], role]);
        return created.rows[0]?.id || null;
    }
    catch (e) {
        console.error('Error in getOrCreateUserIdByEmail:', e);
        return null;
    }
}
// ============================================================================
// HEALTH CHECK
// ============================================================================
app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({
            status: 'healthy',
            database: 'connected',
            timestamp: result.rows[0].now
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});
// Simple version/build info to verify live deploy
app.get('/api/version', (req, res) => {
    res.json({
        service: 's21-field-assistant-api',
        commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'unknown',
        builtAt: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
    });
});
// ============================================================================
// USER ENDPOINTS
// ============================================================================
// Get current user (simplified - in production use auth middleware)
app.get('/api/users/me', async (req, res) => {
    try {
        const email = getRequestEmail(req);
        const existing = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
        if (existing.rows.length > 0)
            return res.json(existing.rows[0]);
        // Create if not found, set role if admin
        const adminEnv = normalizeEmail(process.env.EMAIL_ADMIN_ADDRESS || process.env.ADMIN_EMAIL);
        const role = adminEnv && adminEnv === normalizeEmail(email) ? 'admin' : 'sales_rep';
        const created = await pool.query(`INSERT INTO users (email, name, role)
       VALUES ($1, $2, $3)
       RETURNING *`, [email, email.split('@')[0], role]);
        res.json(created.rows[0]);
    }
    catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: error.message });
    }
});
// Get user by email
app.get('/api/users/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error fetching user by email:', error);
        res.status(500).json({ error: error.message });
    }
});
// Update user
app.patch('/api/users/me', async (req, res) => {
    try {
        const { name, state } = req.body;
        const result = await pool.query(`UPDATE users
       SET name = COALESCE($1, name),
           state = COALESCE($2, state),
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $3
       RETURNING *`, [name, state, 'demo@roofer.com']);
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================================================
// CHAT HISTORY ENDPOINTS
// ============================================================================
// Save chat message
app.post('/api/chat/messages', async (req, res) => {
    try {
        const { message_id, sender, content, state, provider, sources, session_id } = req.body;
        const email = getRequestEmail(req);
        const userId = await getOrCreateUserIdByEmail(email);
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        const result = await pool.query(`INSERT INTO chat_history
       (user_id, message_id, sender, content, state, provider, sources, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`, [userId, message_id, sender, content, state, provider, JSON.stringify(sources), session_id]);
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error saving chat message:', error);
        res.status(500).json({ error: error.message });
    }
});
// Get chat history
app.get('/api/chat/messages', async (req, res) => {
    try {
        const { session_id, limit = 50 } = req.query;
        const email = getRequestEmail(req);
        const userId = await getOrCreateUserIdByEmail(email);
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        let query = 'SELECT * FROM chat_history WHERE user_id = $1';
        const params = [userId];
        if (session_id) {
            query += ' AND session_id = $2';
            params.push(session_id);
        }
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);
        const result = await pool.query(query, params);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================================================
// DOCUMENT TRACKING ENDPOINTS
// ============================================================================
// Track document view
app.post('/api/documents/track-view', async (req, res) => {
    try {
        const { documentPath, documentName, category, timeSpent = 0 } = req.body;
        const email = getRequestEmail(req);
        const userId = await getOrCreateUserIdByEmail(email);
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        // Upsert: increment view count if exists, insert if not
        const result = await pool.query(`INSERT INTO document_views
       (user_id, document_path, document_name, document_category, view_count, total_time_spent)
       VALUES ($1, $2, $3, $4, 1, $5)
       ON CONFLICT (user_id, document_path)
       DO UPDATE SET
         view_count = document_views.view_count + 1,
         last_viewed_at = CURRENT_TIMESTAMP,
         total_time_spent = document_views.total_time_spent + $5
       RETURNING *`, [userId, documentPath, documentName, category, timeSpent]);
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error tracking document view:', error);
        res.status(500).json({ error: error.message });
    }
});
// Get recent documents
app.get('/api/documents/recent', async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const email = getRequestEmail(req);
        const userId = await getOrCreateUserIdByEmail(email);
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        const result = await pool.query(`SELECT * FROM document_views
       WHERE user_id = $1
       ORDER BY last_viewed_at DESC
       LIMIT $2`, [userId, limit]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching recent documents:', error);
        res.status(500).json({ error: error.message });
    }
});
// Add to favorites
app.post('/api/documents/favorites', async (req, res) => {
    try {
        const { documentPath, documentName, category, note } = req.body;
        const email = getRequestEmail(req);
        const userId = await getOrCreateUserIdByEmail(email);
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        const result = await pool.query(`INSERT INTO document_favorites
       (user_id, document_path, document_name, document_category, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, document_path) DO NOTHING
       RETURNING *`, [userId, documentPath, documentName, category, note]);
        res.json(result.rows[0] || { message: 'Already in favorites' });
    }
    catch (error) {
        console.error('Error adding to favorites:', error);
        res.status(500).json({ error: error.message });
    }
});
// Remove from favorites
app.delete('/api/documents/favorites/:documentPath', async (req, res) => {
    try {
        const { documentPath } = req.params;
        const email = getRequestEmail(req);
        const userId = await getOrCreateUserIdByEmail(email);
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        await pool.query('DELETE FROM document_favorites WHERE user_id = $1 AND document_path = $2', [userId, decodeURIComponent(documentPath)]);
        res.json({ message: 'Removed from favorites' });
    }
    catch (error) {
        console.error('Error removing from favorites:', error);
        res.status(500).json({ error: error.message });
    }
});
// Get favorites
app.get('/api/documents/favorites', async (req, res) => {
    try {
        const email = getRequestEmail(req);
        const userId = await getOrCreateUserIdByEmail(email);
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        const result = await pool.query(`SELECT * FROM document_favorites
       WHERE user_id = $1
       ORDER BY created_at DESC`, [userId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching favorites:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================================================
// EMAIL LOGGING ENDPOINTS
// ============================================================================
app.post('/api/emails/log', async (req, res) => {
    try {
        const { emailType, recipient, subject, body, context, state } = req.body;
        const email = getRequestEmail(req);
        const userId = await getOrCreateUserIdByEmail(email);
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        const result = await pool.query(`INSERT INTO email_generation_log
       (user_id, email_type, recipient_email, subject, body, context, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`, [userId, emailType, recipient, subject, body, context, state]);
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error logging email:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================
app.get('/api/analytics/summary', async (req, res) => {
    try {
        const email = getRequestEmail(req);
        const userId = await getOrCreateUserIdByEmail(email);
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        try {
            const result = await pool.query(`SELECT * FROM user_activity_summary WHERE user_id = $1`, [userId]);
            return res.json(result.rows[0] || {});
        }
        catch (e) {
            // Fallback if view doesn't exist: compute quick summary from base tables
            const summary = {
                total_messages: 0,
                unique_documents_viewed: 0,
                favorite_documents: 0,
                emails_generated: 0,
                last_active: null
            };
            try {
                const m = await pool.query('SELECT COUNT(*)::int as c, MAX(created_at) as last FROM chat_history WHERE user_id = $1', [userId]);
                summary.total_messages = m.rows[0]?.c || 0;
                summary.last_active = m.rows[0]?.last || null;
            }
            catch { }
            try {
                const dv = await pool.query('SELECT COUNT(DISTINCT document_path)::int as c FROM document_views WHERE user_id = $1', [userId]);
                summary.unique_documents_viewed = dv.rows[0]?.c || 0;
            }
            catch { }
            try {
                const fav = await pool.query('SELECT COUNT(*)::int as c FROM document_favorites WHERE user_id = $1', [userId]);
                summary.favorite_documents = fav.rows[0]?.c || 0;
            }
            catch { }
            try {
                const em = await pool.query('SELECT COUNT(*)::int as c FROM email_generation_log WHERE user_id = $1', [userId]);
                summary.emails_generated = em.rows[0]?.c || 0;
            }
            catch { }
            return res.json(summary);
        }
    }
    catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/analytics/popular-documents', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        try {
            const result = await pool.query(`SELECT * FROM popular_documents LIMIT $1`, [limit]);
            return res.json(result.rows);
        }
        catch (e) {
            // Fallback if view doesn't exist: compute from document_views
            const result = await pool.query(`SELECT document_path, document_name, document_category,
                COUNT(DISTINCT user_id) as unique_viewers,
                SUM(view_count) as total_views,
                AVG(total_time_spent)::int as avg_time_spent,
                MAX(last_viewed_at) as last_viewed
         FROM document_views
         GROUP BY document_path, document_name, document_category
         ORDER BY total_views DESC
         LIMIT $1`, [limit]);
            return res.json(result.rows);
        }
    }
    catch (error) {
        console.error('Error fetching popular documents:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================================================
// EMAIL NOTIFICATION ENDPOINTS
// ============================================================================
// Send email notification endpoint
app.post('/api/notifications/email', async (req, res) => {
    try {
        const { type, data } = req.body;
        if (!type || !data) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Both "type" and "data" are required'
            });
        }
        let success = false;
        if (type === 'login') {
            const loginData = {
                userName: data.userName,
                userEmail: data.userEmail,
                timestamp: new Date(data.timestamp || Date.now()),
                ipAddress: data.ipAddress || req.ip,
                userAgent: data.userAgent || req.get('user-agent')
            };
            success = await emailService.sendLoginNotification(loginData);
        }
        else if (type === 'chat') {
            const chatData = {
                userName: data.userName,
                userEmail: data.userEmail,
                message: data.message,
                timestamp: new Date(data.timestamp || Date.now()),
                sessionId: data.sessionId,
                state: data.state
            };
            success = await emailService.sendChatNotification(chatData);
        }
        else {
            return res.status(400).json({
                error: 'Invalid notification type',
                message: 'Type must be either "login" or "chat"'
            });
        }
        if (success) {
            res.json({
                success: true,
                message: 'Email notification sent successfully',
                provider: emailService.getConfig().provider
            });
        }
        else {
            res.status(500).json({
                success: false,
                error: 'Failed to send email notification'
            });
        }
    }
    catch (error) {
        console.error('Error sending email notification:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});
// Get email service configuration (for debugging)
app.get('/api/notifications/config', async (req, res) => {
    try {
        const config = emailService.getConfig();
        res.json({
            provider: config.provider,
            from: config.from,
            adminEmail: config.adminEmail,
            configured: config.provider !== 'console'
        });
    }
    catch (error) {
        console.error('Error fetching email config:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================================================
// ACTIVITY LOGGING ENDPOINTS
// ============================================================================
// Log user activity
app.post('/api/activity/log', async (req, res) => {
    try {
        const userEmail = getRequestEmail(req);
        const { activity_type, activity_data, timestamp } = req.body;
        if (!activity_type) {
            return res.status(400).json({ error: 'activity_type is required' });
        }
        // Get or create user
        const userId = await getOrCreateUserIdByEmail(userEmail);
        if (!userId) {
            return res.status(400).json({ error: 'Invalid user email' });
        }
        // Insert activity log
        const result = await pool.query(`INSERT INTO user_activity_log (user_id, activity_type, activity_data, created_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`, [userId, activity_type, activity_data || null, timestamp || new Date().toISOString()]);
        console.log(`✅ Activity logged: ${activity_type} for user ${userEmail}`);
        res.json({
            success: true,
            activity_id: result.rows[0].id,
            created_at: result.rows[0].created_at
        });
    }
    catch (error) {
        console.error('Error logging activity:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to log activity',
            message: error.message
        });
    }
});
// Get activity summary for a user (today by default)
app.get('/api/activity/summary/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { date } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];
        const result = await pool.query(`SELECT
         activity_type,
         COUNT(*) as count,
         MIN(created_at) as first_activity,
         MAX(created_at) as last_activity
       FROM user_activity_log
       WHERE user_id = $1 AND DATE(created_at) = $2
       GROUP BY activity_type`, [userId, targetDate]);
        res.json({
            user_id: userId,
            date: targetDate,
            activities: result.rows
        });
    }
    catch (error) {
        console.error('Error getting activity summary:', error);
        res.status(500).json({ error: error.message });
    }
});
// Trigger daily summary email manually (admin only)
app.post('/api/admin/trigger-daily-summary', async (req, res) => {
    try {
        const { userId, date } = req.body;
        // Import dailySummaryService dynamically
        const { dailySummaryService } = await import('./services/dailySummaryService.js');
        if (userId) {
            // Send for specific user
            const success = await dailySummaryService.sendDailySummaryEmail(userId, date);
            res.json({
                success,
                message: success ? 'Daily summary sent' : 'No activity to summarize or already sent'
            });
        }
        else {
            // Send for all users
            const result = await dailySummaryService.sendAllDailySummaries(date);
            res.json({
                success: true,
                ...result
            });
        }
    }
    catch (error) {
        console.error('Error triggering daily summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to trigger daily summary',
            message: error.message
        });
    }
});
// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================
// Get all users with conversation statistics
app.get('/api/admin/users', async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.state,
        u.created_at,
        COUNT(DISTINCT ch.id) as total_messages,
        MAX(ch.created_at) as last_active
      FROM users u
      LEFT JOIN chat_history ch ON u.id = ch.user_id
      GROUP BY u.id, u.email, u.name, u.role, u.state, u.created_at
      ORDER BY last_active DESC NULLS LAST
    `);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching admin users:', error);
        // Fallback for legacy schemas without expected columns/views
        try {
            const fallback = await pool.query(`
        SELECT id, email, name, role, state, created_at
        FROM users
        ORDER BY created_at DESC
      `);
            // shape to expected interface with zeros
            const shaped = fallback.rows.map((u) => ({
                ...u,
                total_messages: 0,
                last_active: u.created_at
            }));
            return res.json(shaped);
        }
        catch (e2) {
            return res.status(500).json({ error: e2.message });
        }
    }
});
// Basic users list (explicit fallback endpoint for older DBs)
app.get('/api/admin/users-basic', async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT id, email, name, role, state, created_at
      FROM users
      ORDER BY created_at DESC
    `);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching admin users basic:', error);
        res.status(500).json({ error: error.message });
    }
});
// Get all conversations for a specific user
app.get('/api/admin/conversations', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        const result = await pool.query(`
      SELECT
        session_id,
        COUNT(*) as message_count,
        MIN(created_at) as first_message_at,
        MAX(created_at) as last_message_at,
        (
          SELECT content
          FROM chat_history
          WHERE user_id = $1 AND session_id = ch.session_id
          ORDER BY created_at ASC
          LIMIT 1
        ) as preview
      FROM chat_history ch
      WHERE user_id = $1 AND session_id IS NOT NULL
      GROUP BY session_id
      ORDER BY last_message_at DESC
    `, [userId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: error.message });
    }
});
// Get all messages for a specific conversation
app.get('/api/admin/conversations/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { userId } = req.query;
        if (!userId || !sessionId) {
            return res.status(400).json({ error: 'userId and sessionId are required' });
        }
        const result = await pool.query(`
      SELECT
        id,
        message_id,
        sender,
        content,
        state,
        provider,
        sources,
        created_at
      FROM chat_history
      WHERE user_id = $1 AND session_id = $2
      ORDER BY created_at ASC
    `, [userId, sessionId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching conversation messages:', error);
        res.status(500).json({ error: error.message });
    }
});
// Update user role (admin only - in production add auth middleware)
// Accepts either user ID or email as userId parameter
app.patch('/api/admin/users/:userId/role', async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;
        if (!['sales_rep', 'manager', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        // Check if userId is email or ID
        const isEmail = userId.includes('@');
        const query = isEmail
            ? 'UPDATE users SET role = $1 WHERE email = $2 RETURNING *'
            : 'UPDATE users SET role = $1 WHERE id = $2 RETURNING *';
        const result = await pool.query(query, [role, isEmail ? userId.toLowerCase() : userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================================================
// INSURANCE COMPANIES ENDPOINTS
// ============================================================================
// List insurance companies with optional filters
app.get('/api/insurance/companies', async (req, res) => {
    try {
        const { q, state, limit = 100 } = req.query;
        const clauses = [];
        const params = [];
        if (state && typeof state === 'string') {
            clauses.push(`state = $${params.length + 1}`);
            params.push(state.toUpperCase());
        }
        if (q && typeof q === 'string') {
            clauses.push(`LOWER(name) LIKE $${params.length + 1}`);
            params.push(`%${q.toLowerCase()}%`);
        }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const sql = `SELECT id, name, state, phone, email, address, website, notes, category, created_at
                 FROM insurance_companies ${where}
                 ORDER BY name ASC
                 LIMIT $${params.length + 1}`;
        params.push(Number(limit) || 100);
        const result = await pool.query(sql, params);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching insurance companies:', error);
        res.status(500).json({ error: 'insurance_companies: failed to fetch', message: error.message });
    }
});
// ============================================================================
// ERROR HANDLER
// ============================================================================
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});
// ============================================================================
// START SERVER
// ============================================================================
app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
export default app;
// ============================================================================
// STATIC FILE SERVING (Production)
// ============================================================================
// When running in Railway production, also serve the built frontend from /dist
try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const distDir = path.resolve(__dirname, '../dist');
    // Serve static assets (hashed files can be cached aggressively)
    app.use(express.static(distDir, {
        maxAge: '1y',
        immutable: true,
    }));
    // Serve index.html with no-cache for root
    app.get(['/', '/index.html'], (req, res) => {
        res.set('Cache-Control', 'no-store, max-age=0');
        res.sendFile(path.join(distDir, 'index.html'));
    });
    // SPA fallback only for non-asset, non-API GET requests that accept HTML
    app.get('*', (req, res, next) => {
        if (req.method !== 'GET')
            return next();
        if (req.path.startsWith('/api'))
            return res.status(404).json({ error: 'API route not found' });
        // Do not hijack real asset requests (contain a dot extension or /assets)
        if (req.path.includes('.') || req.path.startsWith('/assets'))
            return next();
        if (!req.accepts('html'))
            return next();
        res.set('Cache-Control', 'no-store, max-age=0');
        res.sendFile(path.join(distDir, 'index.html'));
    });
}
catch (e) {
    // Ignore if file resolution fails during dev
}
