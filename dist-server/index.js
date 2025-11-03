/**
 * Backend API Server for Susan 21
 * Provides REST API endpoints for PostgreSQL database operations
 */
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
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
// ============================================================================
// USER ENDPOINTS
// ============================================================================
// Get current user (simplified - in production use auth middleware)
app.get('/api/users/me', async (req, res) => {
    try {
        // For demo, get the first user or create one
        const result = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', ['demo@roofer.com']);
        if (result.rows.length === 0) {
            // Create demo user
            const newUser = await pool.query(`INSERT INTO users (email, name, role, state)
         VALUES ($1, $2, $3, $4)
         RETURNING *`, ['demo@roofer.com', 'Demo User', 'sales_rep', 'MD']);
            res.json(newUser.rows[0]);
        }
        else {
            res.json(result.rows[0]);
        }
    }
    catch (error) {
        console.error('Error fetching user:', error);
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
        // Get current user
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@roofer.com']);
        const userId = userResult.rows[0]?.id;
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
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@roofer.com']);
        const userId = userResult.rows[0]?.id;
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
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@roofer.com']);
        const userId = userResult.rows[0]?.id;
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
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@roofer.com']);
        const userId = userResult.rows[0]?.id;
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
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@roofer.com']);
        const userId = userResult.rows[0]?.id;
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
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@roofer.com']);
        const userId = userResult.rows[0]?.id;
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
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@roofer.com']);
        const userId = userResult.rows[0]?.id;
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
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@roofer.com']);
        const userId = userResult.rows[0]?.id;
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
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@roofer.com']);
        const userId = userResult.rows[0]?.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        const result = await pool.query(`SELECT * FROM user_activity_summary WHERE user_id = $1`, [userId]);
        res.json(result.rows[0] || {});
    }
    catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/analytics/popular-documents', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const result = await pool.query(`SELECT * FROM popular_documents LIMIT $1`, [limit]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching popular documents:', error);
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
