/**
 * Backend API Server for Susan 21
 * Provides REST API endpoints for PostgreSQL database operations
 */

import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { emailService, LoginNotificationData, ChatNotificationData } from './services/emailService.js';
import { cronService } from './services/cronService.js';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3001;

// ES Module __dirname and __filename support
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  } else {
    console.log('✅ Database connected successfully at', res.rows[0].now);
  }
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://aistudiocdn.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://generativelanguage.googleapis.com", "https://api.groq.com", "https://api.together.xyz"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration - restrict to known origins
const allowedOrigins = [
  'https://a21.up.railway.app',
  'https://sa21.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3001',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In production, log unauthorized origin attempts
    if (process.env.NODE_ENV === 'production') {
      console.warn(`CORS blocked request from: ${origin}`);
    }
    return callback(null, false);
  },
  credentials: true
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting - General API protection
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for write operations
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 POST/PUT/DELETE requests per windowMs
  message: 'Too many write requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET', // Only limit write operations
});

// Extra strict rate limiting for email notifications
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 email requests per hour
  message: 'Too many email requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// Apply write limiter to specific endpoints
app.use('/api/chat/messages', writeLimiter);
app.use('/api/documents/', writeLimiter);
app.use('/api/emails/', emailLimiter);
app.use('/api/notifications/email', emailLimiter);

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// ============================================================================
// HELPERS
// ============================================================================

// Normalize emails for comparison
function normalizeEmail(email: string | undefined | null): string | null {
  if (!email || typeof email !== 'string') return null;
  return email.trim().toLowerCase();
}

// Resolve user email from request header and fallback
function getRequestEmail(req: express.Request): string {
  const headerEmail = normalizeEmail(req.header('x-user-email'));
  return headerEmail || 'demo@roofer.com';
}

// Get or create a user by email, marking admin based on env
async function getOrCreateUserIdByEmail(email: string): Promise<string | null> {
  const norm = normalizeEmail(email);
  if (!norm) return null;

  try {
    // Try existing
    const existing = await pool.query('SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [norm]);
    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    // Determine role (admin if matches configured admin email)
    const adminEnv = normalizeEmail(process.env.EMAIL_ADMIN_ADDRESS || process.env.ADMIN_EMAIL);
    const role = adminEnv && adminEnv === norm ? 'admin' : 'sales_rep';

    const created = await pool.query(
      `INSERT INTO users (email, name, role)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [norm, norm.split('@')[0], role]
    );
    return created.rows[0]?.id || null;
  } catch (e) {
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
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: (error as Error).message
    });
  }
});

// Provider configuration status (non-sensitive)
// Returns booleans only — never exposes secrets
app.get('/api/providers/status', (req, res) => {
  try {
    const status = {
      groq: Boolean(process.env.GROQ_API_KEY),
      together: Boolean(process.env.TOGETHER_API_KEY),
      huggingface: Boolean(process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      anyConfigured: Boolean(
        process.env.GROQ_API_KEY ||
        process.env.TOGETHER_API_KEY ||
        process.env.HF_API_KEY ||
        process.env.HUGGINGFACE_API_KEY ||
        process.env.GEMINI_API_KEY
      ),
      environment: process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || 'unknown'
    };
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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

// One-time migration runner for analytics tables (admin only)
app.post('/api/admin/run-analytics-migration', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔄 Running analytics migration...');

    // Create analytics tables
    await pool.query(`
      -- 1. Live Susan Sessions
      CREATE TABLE IF NOT EXISTS live_susan_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMP,
        duration_seconds INTEGER,
        message_count INTEGER DEFAULT 0,
        double_tap_stops INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- 2. Transcriptions
      CREATE TABLE IF NOT EXISTS transcriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        audio_duration_seconds INTEGER,
        transcription_text TEXT,
        word_count INTEGER,
        provider VARCHAR(50) DEFAULT 'Gemini',
        state VARCHAR(2),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- 3. Document Uploads
      CREATE TABLE IF NOT EXISTS document_uploads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_name VARCHAR(255),
        file_type VARCHAR(50),
        file_size_bytes BIGINT,
        analysis_type VARCHAR(50),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- 4. Concerning Chats
      CREATE TABLE IF NOT EXISTS concerning_chats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        message_id VARCHAR(255),
        concern_type VARCHAR(100),
        severity VARCHAR(20) CHECK (severity IN ('critical', 'warning', 'info')),
        flagged_content TEXT,
        context TEXT,
        detection_reason TEXT,
        flagged_at TIMESTAMP DEFAULT NOW(),
        reviewed BOOLEAN DEFAULT FALSE,
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMP,
        review_notes TEXT
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_live_susan_sessions_user_id ON live_susan_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_live_susan_sessions_started_at ON live_susan_sessions(started_at);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_user_id ON transcriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at ON transcriptions(created_at);
      CREATE INDEX IF NOT EXISTS idx_document_uploads_user_id ON document_uploads(user_id);
      CREATE INDEX IF NOT EXISTS idx_document_uploads_created_at ON document_uploads(created_at);
      CREATE INDEX IF NOT EXISTS idx_concerning_chats_user_id ON concerning_chats(user_id);
      CREATE INDEX IF NOT EXISTS idx_concerning_chats_severity ON concerning_chats(severity);
      CREATE INDEX IF NOT EXISTS idx_concerning_chats_flagged_at ON concerning_chats(flagged_at);
    `);

    console.log('✅ Analytics migration completed');

    res.json({
      success: true,
      message: 'Analytics tables created successfully',
      tables: ['live_susan_sessions', 'transcriptions', 'document_uploads', 'concerning_chats']
    });
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================================
// USER ENDPOINTS
// ============================================================================

// Get current user (simplified - in production use auth middleware)
app.get('/api/users/me', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const existing = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    if (existing.rows.length > 0) return res.json(existing.rows[0]);

    // Create if not found, set role if admin
    const adminEnv = normalizeEmail(process.env.EMAIL_ADMIN_ADDRESS || process.env.ADMIN_EMAIL);
    const role = adminEnv && adminEnv === normalizeEmail(email) ? 'admin' : 'sales_rep';
    const created = await pool.query(
      `INSERT INTO users (email, name, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, email.split('@')[0], role]
    );
    res.json(created.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get user by email
app.get('/api/users/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user by email:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Create new user
app.post('/api/users', async (req, res) => {
  try {
    const { email, name, role, state, id } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      // User already exists
      const user = existing.rows[0];
      const isFirstLogin = !user.first_login_at;

      // Update first_login_at if this is their first login
      if (isFirstLogin) {
        await pool.query(
          'UPDATE users SET first_login_at = NOW() WHERE id = $1',
          [user.id]
        );
        console.log(`🎉 First login detected for existing user: ${user.email}`);
      }

      return res.json({
        ...user,
        isNew: isFirstLogin  // TRUE if first login, FALSE if not
      });
    }

    // Determine role (admin if matches configured admin email)
    const adminEnv = normalizeEmail(process.env.EMAIL_ADMIN_ADDRESS || process.env.ADMIN_EMAIL);
    const userRole = adminEnv && adminEnv === normalizedEmail ? 'admin' : (role || 'sales_rep');

    // Create new user (let PostgreSQL generate UUID via gen_random_uuid())
    const result = await pool.query(
      `INSERT INTO users (id, email, name, role, state, first_login_at)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, NOW())
       RETURNING *`,
      [id || null, normalizedEmail, name || normalizedEmail.split('@')[0], userRole, state || null]
    );

    console.log(`✅ Created new user: ${normalizedEmail} with role: ${userRole}`);

    res.status(201).json({
      ...result.rows[0],
      isNew: true
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update user
app.patch('/api/users/me', async (req, res) => {
  try {
    const { name, state } = req.body;
    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           state = COALESCE($2, state),
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $3
       RETURNING *`,
      [name, state, 'demo@roofer.com']
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: (error as Error).message });
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

    console.log('[API] 💾 Saving chat message:', {
      message_id,
      sender,
      content_length: content?.length,
      session_id,
      state,
      provider,
      user_email: email,
      has_sources: !!sources
    });

    const userId = await getOrCreateUserIdByEmail(email);

    if (!userId) {
      console.error('[API] ❌ User not found for email:', email);
      return res.status(401).json({ error: 'User not found' });
    }

    console.log('[API] ✓ User ID resolved:', userId);

    const result = await pool.query(
      `INSERT INTO chat_history
       (user_id, message_id, sender, content, state, provider, sources, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, message_id, sender, content, state, provider, sources ? JSON.stringify(sources) : null, session_id]
    );

    console.log('[API] ✅ Message saved to database:', {
      id: result.rows[0].id,
      message_id: result.rows[0].message_id,
      sender: result.rows[0].sender,
      session_id: result.rows[0].session_id
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[API] ❌ Error saving chat message:', error);
    console.error('[API] Error details:', {
      name: (error as any).name,
      message: (error as Error).message,
      code: (error as any).code,
      detail: (error as any).detail
    });
    res.status(500).json({ error: (error as Error).message });
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
    const params: any[] = [userId];

    if (session_id) {
      query += ' AND session_id = $2';
      params.push(session_id);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: (error as Error).message });
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
    const result = await pool.query(
      `INSERT INTO document_views
       (user_id, document_path, document_name, document_category, view_count, total_time_spent)
       VALUES ($1, $2, $3, $4, 1, $5)
       ON CONFLICT (user_id, document_path)
       DO UPDATE SET
         view_count = document_views.view_count + 1,
         last_viewed_at = CURRENT_TIMESTAMP,
         total_time_spent = document_views.total_time_spent + $5
       RETURNING *`,
      [userId, documentPath, documentName, category, timeSpent]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error tracking document view:', error);
    res.status(500).json({ error: (error as Error).message });
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

    const result = await pool.query(
      `SELECT * FROM document_views
       WHERE user_id = $1
       ORDER BY last_viewed_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching recent documents:', error);
    res.status(500).json({ error: (error as Error).message });
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

    const result = await pool.query(
      `INSERT INTO document_favorites
       (user_id, document_path, document_name, document_category, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, document_path) DO NOTHING
       RETURNING *`,
      [userId, documentPath, documentName, category, note]
    );

    res.json(result.rows[0] || { message: 'Already in favorites' });
  } catch (error) {
    console.error('Error adding to favorites:', error);
    res.status(500).json({ error: (error as Error).message });
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

    await pool.query(
      'DELETE FROM document_favorites WHERE user_id = $1 AND document_path = $2',
      [userId, decodeURIComponent(documentPath)]
    );

    res.json({ message: 'Removed from favorites' });
  } catch (error) {
    console.error('Error removing from favorites:', error);
    res.status(500).json({ error: (error as Error).message });
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

    const result = await pool.query(
      `SELECT * FROM document_favorites
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ error: (error as Error).message });
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

    const result = await pool.query(
      `INSERT INTO email_generation_log
       (user_id, email_type, recipient_email, subject, body, context, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, emailType, recipient, subject, body, context, state]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error logging email:', error);
    res.status(500).json({ error: (error as Error).message });
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
      const result = await pool.query(
        `SELECT * FROM user_activity_summary WHERE user_id = $1`,
        [userId]
      );
      return res.json(result.rows[0] || {});
    } catch (e) {
      // Fallback if view doesn't exist: compute quick summary from base tables
      const summary = {
        total_messages: 0,
        unique_documents_viewed: 0,
        favorite_documents: 0,
        emails_generated: 0,
        last_active: null as any
      };
      try {
        const m = await pool.query('SELECT COUNT(*)::int as c, MAX(created_at) as last FROM chat_history WHERE user_id = $1', [userId]);
        summary.total_messages = m.rows[0]?.c || 0;
        summary.last_active = m.rows[0]?.last || null;
      } catch {}
      try {
        const dv = await pool.query('SELECT COUNT(DISTINCT document_path)::int as c FROM document_views WHERE user_id = $1', [userId]);
        summary.unique_documents_viewed = dv.rows[0]?.c || 0;
      } catch {}
      try {
        const fav = await pool.query('SELECT COUNT(*)::int as c FROM document_favorites WHERE user_id = $1', [userId]);
        summary.favorite_documents = fav.rows[0]?.c || 0;
      } catch {}
      try {
        const em = await pool.query('SELECT COUNT(*)::int as c FROM email_generation_log WHERE user_id = $1', [userId]);
        summary.emails_generated = em.rows[0]?.c || 0;
      } catch {}
      return res.json(summary);
    }
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/analytics/popular-documents', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    try {
      const result = await pool.query(
        `SELECT * FROM popular_documents LIMIT $1`,
        [limit]
      );
      return res.json(result.rows);
    } catch (e) {
      // Fallback if view doesn't exist: compute from document_views
      const result = await pool.query(
        `SELECT document_path, document_name, document_category,
                COUNT(DISTINCT user_id) as unique_viewers,
                SUM(view_count) as total_views,
                AVG(total_time_spent)::int as avg_time_spent,
                MAX(last_viewed_at) as last_viewed
         FROM document_views
         GROUP BY document_path, document_name, document_category
         ORDER BY total_views DESC
         LIMIT $1`,
        [limit]
      );
      return res.json(result.rows);
    }
  } catch (error) {
    console.error('Error fetching popular documents:', error);
    res.status(500).json({ error: (error as Error).message });
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
      const loginData: LoginNotificationData = {
        userName: data.userName,
        userEmail: data.userEmail,
        timestamp: new Date(data.timestamp || Date.now()),
        ipAddress: data.ipAddress || req.ip,
        userAgent: data.userAgent || req.get('user-agent')
      };
      success = await emailService.sendLoginNotification(loginData);
    } else if (type === 'chat') {
      const chatData: ChatNotificationData = {
        userName: data.userName,
        userEmail: data.userEmail,
        message: data.message,
        timestamp: new Date(data.timestamp || Date.now()),
        sessionId: data.sessionId,
        state: data.state
      };
      success = await emailService.sendChatNotification(chatData);
    } else {
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
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send email notification'
      });
    }
  } catch (error) {
    console.error('Error sending email notification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: (error as Error).message
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
  } catch (error) {
    console.error('Error fetching email config:', error);
    res.status(500).json({ error: (error as Error).message });
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
    const result = await pool.query(
      `INSERT INTO user_activity_log (user_id, activity_type, activity_data, created_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [userId, activity_type, activity_data || null, timestamp || new Date().toISOString()]
    );

    console.log(`✅ Activity logged: ${activity_type} for user ${userEmail}`);

    res.json({
      success: true,
      activity_id: result.rows[0].id,
      created_at: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log activity',
      message: (error as Error).message
    });
  }
});

// Get activity summary for a user (today by default)
app.get('/api/activity/summary/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT
         activity_type,
         COUNT(*) as count,
         MIN(created_at) as first_activity,
         MAX(created_at) as last_activity
       FROM user_activity_log
       WHERE user_id = $1 AND DATE(created_at) = $2
       GROUP BY activity_type`,
      [userId, targetDate]
    );

    res.json({
      user_id: userId,
      date: targetDate,
      activities: result.rows
    });
  } catch (error) {
    console.error('Error getting activity summary:', error);
    res.status(500).json({ error: (error as Error).message });
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
    } else {
      // Send for all users
      const result = await dailySummaryService.sendAllDailySummaries(date);
      res.json({
        success: true,
        ...result
      });
    }
  } catch (error) {
    console.error('Error triggering daily summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger daily summary',
      message: (error as Error).message
    });
  }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

// Get cron job status (admin only)
app.get('/api/admin/cron-status', (req, res) => {
  try {
    const status = cronService.getStatus();
    res.json({
      success: true,
      ...status,
      schedules: [
        { time: '5:00 AM', description: 'Morning Summary' },
        { time: '12:00 PM', description: 'Midday Summary' },
        { time: '7:00 PM', description: 'Evening Summary' },
        { time: '11:00 PM', description: 'Night Summary' }
      ],
      timezone: 'America/New_York'
    });
  } catch (error) {
    console.error('Error getting cron status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cron status',
      message: (error as Error).message
    });
  }
});

// Manually trigger cron job (for testing)
app.post('/api/admin/trigger-cron-manual', async (req, res) => {
  try {
    const result = await cronService.runManually();
    res.json({
      success: true,
      message: 'Manual cron job executed',
      ...result
    });
  } catch (error) {
    console.error('Error running manual cron:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run manual cron',
      message: (error as Error).message
    });
  }
});

// Run database migration (admin only)
app.post('/api/admin/run-migration', async (req, res) => {
  try {
    console.log('🔧 Starting database migration...');

    const migrationSQL = `
-- ============================================================================
-- ACTIVITY TRACKING MIGRATION FOR S21 FIELD ASSISTANT
-- ============================================================================

-- 1. USER ACTIVITY LOG TABLE
CREATE TABLE IF NOT EXISTS user_activity_log (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  activity_data JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add foreign key constraint (will succeed once users table has data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_activity_log_user_id_fkey'
  ) THEN
    ALTER TABLE user_activity_log
    ADD CONSTRAINT user_activity_log_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add foreign key constraint - will be added later when users exist';
END $$;

CREATE INDEX IF NOT EXISTS idx_activity_user_date ON user_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON user_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_created ON user_activity_log(created_at DESC);

COMMENT ON TABLE user_activity_log IS 'Comprehensive activity tracking for users - used for daily summary emails and analytics';

-- 2. EMAIL NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS email_notifications (
  id SERIAL PRIMARY KEY,
  notification_type VARCHAR(50) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  user_id UUID,
  sent_at TIMESTAMP DEFAULT NOW(),
  email_data JSONB,
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Add foreign key constraint (will succeed once users table has data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'email_notifications_user_id_fkey'
  ) THEN
    ALTER TABLE email_notifications
    ADD CONSTRAINT email_notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add foreign key constraint - will be added later when users exist';
END $$;

CREATE INDEX IF NOT EXISTS idx_email_notifications_user ON email_notifications(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_notifications_type ON email_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_email_notifications_sent ON email_notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_notifications_recipient ON email_notifications(recipient_email);

-- 3. ALTER USERS TABLE
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- 4. CREATE VIEWS
CREATE OR REPLACE VIEW daily_activity_summary AS
SELECT
  user_id,
  DATE(created_at) as activity_date,
  activity_type,
  COUNT(*) as activity_count,
  MIN(created_at) as first_activity,
  MAX(created_at) as last_activity
FROM user_activity_log
GROUP BY user_id, DATE(created_at), activity_type
ORDER BY activity_date DESC, user_id;

CREATE OR REPLACE VIEW user_activity_stats AS
SELECT
  u.id as user_id,
  u.email,
  u.name,
  u.role,
  u.state,
  u.login_count,
  u.first_login_at,
  u.last_login_at,
  COUNT(DISTINCT CASE WHEN ual.activity_type = 'chat' THEN ual.id END) as total_chats,
  COUNT(DISTINCT CASE WHEN ual.activity_type = 'document_analysis' THEN ual.id END) as total_documents,
  COUNT(DISTINCT CASE WHEN ual.activity_type = 'email_generated' THEN ual.id END) as total_emails,
  COUNT(DISTINCT CASE WHEN ual.activity_type = 'transcription' THEN ual.id END) as total_transcriptions,
  MAX(ual.created_at) as last_activity_at
FROM users u
LEFT JOIN user_activity_log ual ON u.id = ual.user_id
GROUP BY u.id, u.email, u.name, u.role, u.state, u.login_count, u.first_login_at, u.last_login_at;

-- 5. CREATE FUNCTIONS
CREATE OR REPLACE FUNCTION is_first_login_today(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
    AND DATE(first_login_at) = CURRENT_DATE
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_users_for_daily_summary()
RETURNS TABLE (
  user_id UUID,
  user_email VARCHAR(255),
  user_name VARCHAR(255),
  activity_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.name,
    COUNT(ual.id) as activity_count
  FROM users u
  INNER JOIN user_activity_log ual ON u.id = ual.user_id
  WHERE DATE(ual.created_at) = CURRENT_DATE
  GROUP BY u.id, u.email, u.name
  HAVING COUNT(ual.id) > 0
  ORDER BY activity_count DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION daily_summary_sent_today(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM email_notifications
    WHERE user_id = p_user_id
    AND notification_type = 'daily_summary'
    AND DATE(sent_at) = CURRENT_DATE
  );
END;
$$ LANGUAGE plpgsql;

-- 6. CREATE TRIGGER
CREATE OR REPLACE FUNCTION update_user_login_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.activity_type = 'login' THEN
    UPDATE users
    SET
      last_login_at = NEW.created_at,
      first_login_at = COALESCE(first_login_at, NEW.created_at),
      login_count = login_count + 1
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_login_timestamp ON user_activity_log;
CREATE TRIGGER trigger_update_login_timestamp
  AFTER INSERT ON user_activity_log
  FOR EACH ROW
  WHEN (NEW.activity_type = 'login')
  EXECUTE FUNCTION update_user_login_timestamp();

-- 7. SEED DATA
UPDATE users SET first_login_at = created_at WHERE first_login_at IS NULL;
UPDATE users SET login_count = 0 WHERE login_count IS NULL;
`;

    // Execute the migration
    await pool.query(migrationSQL);

    // Get counts for verification
    const activityCount = await pool.query('SELECT COUNT(*) as count FROM user_activity_log');
    const notificationCount = await pool.query('SELECT COUNT(*) as count FROM email_notifications');
    const userCount = await pool.query('SELECT COUNT(*) as count FROM users WHERE first_login_at IS NOT NULL');

    console.log('✅ Migration completed successfully!');
    console.log(`  - user_activity_log: ${activityCount.rows[0].count} records`);
    console.log(`  - email_notifications: ${notificationCount.rows[0].count} records`);
    console.log(`  - users with login tracking: ${userCount.rows[0].count}`);

    res.json({
      success: true,
      message: 'Database migration completed successfully',
      stats: {
        activity_log_records: activityCount.rows[0].count,
        email_notification_records: notificationCount.rows[0].count,
        users_with_login_tracking: userCount.rows[0].count
      }
    });
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      message: (error as Error).message
    });
  }
});

// Run Migration 004: Fix RAG Analytics and Insurance Companies (admin only)
app.post('/api/admin/run-migration-004', async (req, res) => {
  try {
    console.log('🔧 Running Migration 004: RAG Analytics and Insurance Companies...');

    const fs = await import('fs/promises');
    const migrationPath = path.resolve(__dirname, '../../database/migrations/004_fix_rag_and_insurance.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');

    // Execute the migration
    await pool.query(migrationSQL);

    console.log('✅ Migration 004 completed successfully');

    // Verify tables were created
    const verify = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('rag_analytics', 'insurance_companies')
      ORDER BY table_name
    `);

    const insuranceCount = await pool.query('SELECT COUNT(*) FROM insurance_companies');

    res.json({
      success: true,
      message: 'Migration 004 completed successfully',
      tables_created: verify.rows.map(r => r.table_name),
      insurance_companies_seeded: parseInt(insuranceCount.rows[0].count)
    });
  } catch (error) {
    console.error('❌ Migration 004 failed:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      message: (error as Error).message
    });
  }
});

// Fix session_id column type (admin only)
app.post('/api/admin/fix-session-id', async (req, res) => {
  try {
    console.log('🔧 Fixing session_id column type...');

    // Change session_id from UUID to TEXT
    await pool.query(`
      ALTER TABLE chat_history
      ALTER COLUMN session_id TYPE TEXT USING session_id::TEXT
    `);

    console.log('✅ session_id column changed to TEXT');

    // Verify the change
    const verify = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'chat_history' AND column_name = 'session_id'
    `);

    res.json({
      success: true,
      message: 'session_id column type fixed successfully',
      new_type: verify.rows[0]?.data_type
    });
  } catch (error) {
    console.error('❌ Fix failed:', error);
    res.status(500).json({
      success: false,
      error: 'Fix failed',
      message: (error as Error).message
    });
  }
});

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
  } catch (error) {
    console.error('Error fetching admin users:', error);
    // Fallback for legacy schemas without expected columns/views
    try {
      const fallback = await pool.query(`
        SELECT id, email, name, role, state, created_at
        FROM users
        ORDER BY created_at DESC
      `);
      // shape to expected interface with zeros
      const shaped = fallback.rows.map((u: any) => ({
        ...u,
        total_messages: 0,
        last_active: u.created_at
      }));
      return res.json(shaped);
    } catch (e2) {
      return res.status(500).json({ error: (e2 as Error).message });
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
  } catch (error) {
    console.error('Error fetching admin users basic:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get all conversations for a specific user
app.get('/api/admin/conversations', async (req, res) => {
  try {
    const { userId } = req.query;

    console.log('[ADMIN] 📊 Fetching conversations for user:', userId);

    if (!userId) {
      console.error('[ADMIN] ❌ userId is required');
      return res.status(400).json({ error: 'userId is required' });
    }

    // First, check if user exists and has messages
    const userCheck = await pool.query(
      'SELECT COUNT(*) as count FROM chat_history WHERE user_id = $1',
      [userId]
    );

    console.log('[ADMIN] 📈 Total messages for user:', userCheck.rows[0].count);

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

    console.log('[ADMIN] ✅ Found', result.rows.length, 'conversations for user');

    res.json(result.rows);
  } catch (error) {
    console.error('[ADMIN] ❌ Error fetching conversations:', error);
    res.status(500).json({ error: (error as Error).message });
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
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({ error: (error as Error).message });
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
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get all emails generated by the system (admin only)
app.get('/api/admin/emails', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 50, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    console.log('[ADMIN] 📧 Fetching emails:', { page, limit, search });

    // Build search filter for email subject/recipient
    let searchFilter = '';
    const params: any[] = [];

    if (search && typeof search === 'string' && search.trim() !== '') {
      searchFilter = `WHERE (LOWER(eg.subject) LIKE $1 OR LOWER(eg.recipient_email) LIKE $1)`;
      params.push(`%${search.toLowerCase()}%`);
    }

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*)::int as total
      FROM email_generation_log eg
      ${searchFilter}
    `;
    const countResult = await pool.query(countQuery, params);
    const totalCount = countResult.rows[0]?.total || 0;

    // Get paginated results with user info
    const dataQuery = `
      SELECT
        eg.id,
        eg.recipient_email,
        eg.subject,
        eg.body,
        eg.email_type,
        eg.state,
        eg.created_at as sent_at,
        true as success,
        u.id as user_id,
        u.email as user_email,
        u.name as user_name,
        u.role as user_role
      FROM email_generation_log eg
      LEFT JOIN users u ON eg.user_id = u.id
      ${searchFilter}
      ORDER BY eg.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(Number(limit), offset);

    const result = await pool.query(dataQuery, params);

    console.log('[ADMIN] ✅ Found', result.rows.length, 'emails');

    res.json({
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (error) {
    console.error('[ADMIN] ❌ Error fetching emails:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get all messages from all users/conversations (admin only)
app.get('/api/admin/all-messages', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 100, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    console.log('[ADMIN] 💬 Fetching all messages:', { page, limit, search });

    // Build search filter for message content
    let searchFilter = '';
    const params: any[] = [];

    if (search && typeof search === 'string' && search.trim() !== '') {
      searchFilter = `WHERE LOWER(ch.content) LIKE $1`;
      params.push(`%${search.toLowerCase()}%`);
    }

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*)::int as total
      FROM chat_history ch
      ${searchFilter}
    `;
    const countResult = await pool.query(countQuery, params);
    const totalCount = countResult.rows[0]?.total || 0;

    // Get paginated results with user info
    const dataQuery = `
      SELECT
        ch.id,
        ch.message_id,
        ch.session_id,
        ch.sender as role,
        ch.content,
        ch.state,
        ch.provider,
        ch.sources,
        ch.created_at,
        u.id as user_id,
        u.email as user_email,
        u.name as user_name,
        u.role as user_role
      FROM chat_history ch
      LEFT JOIN users u ON ch.user_id = u.id
      ${searchFilter}
      ORDER BY ch.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(Number(limit), offset);

    const result = await pool.query(dataQuery, params);

    console.log('[ADMIN] ✅ Found', result.rows.length, 'messages');

    res.json({
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (error) {
    console.error('[ADMIN] ❌ Error fetching all messages:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================================
// ANALYTICS & MONITORING ENDPOINTS
// ============================================================================

/**
 * Helper function to get time range SQL filter
 */
function getTimeRangeFilter(timeRange: string, columnName: string = 'created_at'): string {
  switch (timeRange) {
    case 'today':
      return `${columnName} >= CURRENT_DATE`;
    case 'week':
      return `${columnName} >= CURRENT_DATE - INTERVAL '7 days'`;
    case 'month':
      return `${columnName} >= CURRENT_DATE - INTERVAL '30 days'`;
    case 'all':
    default:
      return '1=1'; // all time
  }
}

/**
 * Helper function to check if user is admin
 */
async function isAdmin(email: string): Promise<boolean> {
  try {
    const result = await pool.query(
      'SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    return result.rows.length > 0 && result.rows[0].role === 'admin';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Track Live Susan session start/end
app.post('/api/activity/live-susan', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { action, session_id, message_count, double_tap_stops } = req.body;

    if (!action || !['start', 'end'].includes(action)) {
      return res.status(400).json({ error: 'action must be "start" or "end"' });
    }

    const userId = await getOrCreateUserIdByEmail(email);
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (action === 'start') {
      // Create new session
      const result = await pool.query(
        `INSERT INTO live_susan_sessions (user_id, started_at, message_count, double_tap_stops)
         VALUES ($1, NOW(), 0, 0)
         RETURNING id`,
        [userId]
      );

      console.log(`✅ Live Susan session started for user ${email}:`, result.rows[0].id);

      return res.json({
        session_id: result.rows[0].id
      });
    } else {
      // End session
      if (!session_id) {
        return res.status(400).json({ error: 'session_id is required for end action' });
      }

      const result = await pool.query(
        `UPDATE live_susan_sessions
         SET ended_at = NOW(),
             duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
             message_count = COALESCE($1, message_count),
             double_tap_stops = COALESCE($2, double_tap_stops)
         WHERE id = $3 AND user_id = $4
         RETURNING id, duration_seconds`,
        [message_count, double_tap_stops, session_id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }

      console.log(`✅ Live Susan session ended for user ${email}:`, result.rows[0]);

      return res.json({
        success: true,
        duration_seconds: result.rows[0].duration_seconds
      });
    }
  } catch (error) {
    console.error('Error tracking Live Susan session:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Log transcription activity
app.post('/api/activity/transcription', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { audio_duration_seconds, transcription_text, word_count, provider = 'Gemini' } = req.body;

    const userId = await getOrCreateUserIdByEmail(email);
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Get user's state
    const userResult = await pool.query('SELECT state FROM users WHERE id = $1', [userId]);
    const state = userResult.rows[0]?.state || null;

    const result = await pool.query(
      `INSERT INTO transcriptions (user_id, audio_duration_seconds, transcription_text, word_count, provider, state)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [userId, audio_duration_seconds, transcription_text, word_count, provider, state]
    );

    console.log(`✅ Transcription logged for user ${email}:`, result.rows[0].id);

    res.json({
      success: true,
      transcription_id: result.rows[0].id,
      created_at: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Error logging transcription:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Log document upload activity
app.post('/api/activity/document-upload', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const {
      file_name,
      file_type,
      file_size_bytes,
      analysis_type,
      analysis_result,
      analysis_performed = false
    } = req.body;

    const userId = await getOrCreateUserIdByEmail(email);
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Get user's state
    const userResult = await pool.query('SELECT state FROM users WHERE id = $1', [userId]);
    const state = userResult.rows[0]?.state || null;

    const result = await pool.query(
      `INSERT INTO document_uploads
       (user_id, file_name, file_type, file_size_bytes, analysis_performed, analysis_type, analysis_result, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [userId, file_name, file_type, file_size_bytes, analysis_performed, analysis_type, analysis_result, state]
    );

    console.log(`✅ Document upload logged for user ${email}:`, result.rows[0].id);

    res.json({
      success: true,
      upload_id: result.rows[0].id,
      created_at: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Error logging document upload:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get analytics overview (admin only)
app.get('/api/admin/analytics/overview', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Note: Frontend sends ?range= but we currently return all-time stats
    // TODO: Add time range filtering if needed in the future

    // Get overview stats
    const [
      totalUsers,
      activeUsers7d,
      totalConversations,
      totalMessages,
      emailsGenerated,
      transcriptionsCreated,
      documentsUploaded,
      susanSessions
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int as count FROM users'),
      pool.query(`
        SELECT COUNT(DISTINCT user_id)::int as count
        FROM chat_history
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      `),
      pool.query('SELECT COUNT(DISTINCT session_id)::int as count FROM chat_history WHERE session_id IS NOT NULL'),
      pool.query('SELECT COUNT(*)::int as count FROM chat_history'),
      pool.query('SELECT COUNT(*)::int as count FROM email_generation_log'),
      pool.query('SELECT COUNT(*)::int as count FROM transcriptions'),
      pool.query('SELECT COUNT(*)::int as count FROM document_uploads'),
      pool.query('SELECT COUNT(*)::int as count FROM live_susan_sessions')
    ]);

    res.json({
      totalUsers: parseInt(totalUsers.rows[0].count),
      activeUsers7d: parseInt(activeUsers7d.rows[0].count),
      totalConversations: parseInt(totalConversations.rows[0].count),
      totalMessages: parseInt(totalMessages.rows[0].count),
      emailsGenerated: parseInt(emailsGenerated.rows[0].count),
      transcriptions: parseInt(transcriptionsCreated.rows[0].count),
      documentsUploaded: parseInt(documentsUploaded.rows[0].count),
      susanSessions: parseInt(susanSessions.rows[0].count)
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get user activity breakdown (admin only)
app.get('/api/admin/analytics/user-activity', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { timeRange = 'all' } = req.query;
    const timeFilter = getTimeRangeFilter(timeRange as string);

    // Query user_activity_enhanced view with time filtering
    const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.state,
        COUNT(DISTINCT ch.id) AS chats,
        COUNT(DISTINCT eg.id) AS emails,
        COUNT(DISTINCT t.id) AS transcriptions,
        COUNT(DISTINCT du.id) AS uploads,
        COUNT(DISTINCT lss.id) AS susan,
        COUNT(DISTINCT dv.document_path) AS "kbViews",
        MAX(ch.created_at) AS "lastActive"
      FROM users u
      LEFT JOIN chat_history ch ON u.id = ch.user_id
      LEFT JOIN email_generation_log eg ON u.id = eg.user_id
      LEFT JOIN transcriptions t ON u.id = t.user_id
      LEFT JOIN document_uploads du ON u.id = du.user_id
      LEFT JOIN live_susan_sessions lss ON u.id = lss.user_id
      LEFT JOIN document_views dv ON u.id = dv.user_id
      WHERE ${timeFilter.replace('created_at', 'ch.created_at')}
      GROUP BY u.id, u.email, u.name, u.role, u.state
      ORDER BY "lastActive" DESC NULLS LAST
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get feature usage over time (admin only)
app.get('/api/admin/analytics/feature-usage', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Accept both 'range' and 'timeRange' query params for compatibility
    const { range, timeRange } = req.query;
    const selectedRange = (range || timeRange || 'week') as string;
    const timeFilter = getTimeRangeFilter(selectedRange, 'created_at');

    // Query daily activity metrics with joins
    const rawData = await pool.query(`
      WITH chat_counts AS (
        SELECT DATE(created_at) AS activity_date, 'chat' AS activity_type, COUNT(*) AS count
        FROM chat_history
        WHERE ${timeFilter}
        GROUP BY DATE(created_at)
      ),
      email_counts AS (
        SELECT DATE(created_at) AS activity_date, 'email' AS activity_type, COUNT(*) AS count
        FROM email_generation_log
        WHERE ${timeFilter}
        GROUP BY DATE(created_at)
      ),
      upload_counts AS (
        SELECT DATE(created_at) AS activity_date, 'upload' AS activity_type, COUNT(*) AS count
        FROM document_uploads
        WHERE ${timeFilter}
        GROUP BY DATE(created_at)
      ),
      transcription_counts AS (
        SELECT DATE(created_at) AS activity_date, 'transcription' AS activity_type, COUNT(*) AS count
        FROM transcriptions
        WHERE ${timeFilter}
        GROUP BY DATE(created_at)
      ),
      susan_counts AS (
        SELECT DATE(started_at) AS activity_date, 'susan_session' AS activity_type, COUNT(*) AS count
        FROM live_susan_sessions
        WHERE ${timeFilter.replace('created_at', 'started_at')}
        GROUP BY DATE(started_at)
      ),
      kb_counts AS (
        SELECT DATE(last_viewed_at) AS activity_date, 'knowledge_base' AS activity_type, COUNT(*) AS count
        FROM document_views
        WHERE ${timeFilter.replace('created_at', 'last_viewed_at')}
        GROUP BY DATE(last_viewed_at)
      )
      SELECT * FROM chat_counts
      UNION ALL SELECT * FROM email_counts
      UNION ALL SELECT * FROM upload_counts
      UNION ALL SELECT * FROM transcription_counts
      UNION ALL SELECT * FROM susan_counts
      UNION ALL SELECT * FROM kb_counts
      ORDER BY activity_date ASC, activity_type
    `);

    // Transform into flat array format for frontend
    const dates = [...new Set(rawData.rows.map(r => r.activity_date.toISOString().split('T')[0]))].sort();
    const transformedData = dates.map(date => {
      const dayData = rawData.rows.filter(r => r.activity_date.toISOString().split('T')[0] === date);
      return {
        date,
        chat: parseInt(dayData.find(d => d.activity_type === 'chat')?.count || 0),
        email: parseInt(dayData.find(d => d.activity_type === 'email')?.count || 0),
        upload: parseInt(dayData.find(d => d.activity_type === 'upload')?.count || 0),
        transcribe: parseInt(dayData.find(d => d.activity_type === 'transcription')?.count || 0),
        susan: parseInt(dayData.find(d => d.activity_type === 'susan_session')?.count || 0),
        knowledgeBase: parseInt(dayData.find(d => d.activity_type === 'knowledge_base')?.count || 0)
      };
    });

    res.json(transformedData);
  } catch (error) {
    console.error('Error fetching feature usage:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get knowledge base analytics (admin only)
app.get('/api/admin/analytics/knowledge-base', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Most viewed documents
    const mostViewed = await pool.query(`
      SELECT
        document_path,
        document_name,
        document_category,
        COUNT(DISTINCT user_id) as unique_viewers,
        SUM(view_count) as total_views,
        AVG(total_time_spent)::int as avg_time_spent
      FROM document_views
      GROUP BY document_path, document_name, document_category
      ORDER BY total_views DESC
      LIMIT 10
    `);

    // Most favorited documents
    const mostFavorited = await pool.query(`
      SELECT
        document_path,
        document_name,
        document_category,
        COUNT(*) as favorite_count
      FROM document_favorites
      GROUP BY document_path, document_name, document_category
      ORDER BY favorite_count DESC
      LIMIT 10
    `);

    // Search queries (if search_analytics table exists)
    let searchQueries = [];
    try {
      const searchResult = await pool.query(`
        SELECT
          search_query,
          COUNT(*) as search_count,
          MAX(created_at) as last_searched
        FROM search_analytics
        GROUP BY search_query
        ORDER BY search_count DESC
        LIMIT 20
      `);
      searchQueries = searchResult.rows;
    } catch (e) {
      // Table doesn't exist, skip
    }

    // Category breakdown
    const categoryBreakdown = await pool.query(`
      SELECT
        document_category,
        COUNT(DISTINCT document_path) as document_count,
        SUM(view_count) as total_views
      FROM document_views
      WHERE document_category IS NOT NULL
      GROUP BY document_category
      ORDER BY total_views DESC
    `);

    res.json({
      mostViewed: mostViewed.rows.map(row => ({
        name: row.document_name,
        views: parseInt(row.total_views),
        category: row.document_category
      })),
      mostFavorited: mostFavorited.rows.map(row => ({
        name: row.document_name,
        favorites: parseInt(row.favorite_count),
        category: row.document_category
      })),
      topCategories: categoryBreakdown.rows.map(row => ({
        category: row.document_category,
        count: parseInt(row.document_count)
      }))
    });
  } catch (error) {
    console.error('Error fetching knowledge base analytics:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get detailed per-user analytics table (admin only)
app.get('/api/admin/analytics/per-user', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Query user_activity_enhanced view
    const result = await pool.query(`
      SELECT
        user_id,
        email,
        name,
        role,
        state,
        total_messages,
        emails_generated,
        transcriptions_created,
        documents_uploaded,
        susan_sessions,
        unique_documents_viewed,
        favorite_documents,
        images_analyzed,
        last_active,
        user_since
      FROM user_activity_enhanced
      ORDER BY total_messages DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching per-user analytics:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get concerning/flagged chats (admin only)
app.get('/api/admin/concerning-chats', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { severity = 'all' } = req.query;

    let severityFilter = '1=1';
    if (severity && severity !== 'all') {
      severityFilter = `cc.severity = '${severity}'`;
    }

    const result = await pool.query(`
      SELECT
        cc.id,
        cc.session_id AS "sessionId",
        cc.user_id AS "userId",
        cc.message_id AS "messageId",
        cc.concern_type AS "concernType",
        cc.severity,
        cc.flagged_content AS content,
        cc.context AS "fullContext",
        cc.detection_reason AS "detectionReason",
        cc.flagged_at AS timestamp,
        cc.reviewed,
        cc.reviewed_by AS "reviewedBy",
        cc.reviewed_at AS "reviewedAt",
        cc.review_notes AS "reviewNotes",
        u.email AS "userEmail",
        u.name AS "userName",
        u.state AS "userState",
        reviewer.email AS "reviewerEmail"
      FROM concerning_chats cc
      JOIN users u ON cc.user_id = u.id
      LEFT JOIN users reviewer ON cc.reviewed_by = reviewer.id
      WHERE ${severityFilter}
      ORDER BY cc.flagged_at DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching concerning chats:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Trigger manual scan for concerning chats (admin only)
app.post('/api/admin/concerning-chats/scan', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Import chatMonitorService
    const { chatMonitorService } = await import('./services/chatMonitorService.js');

    // Get recent messages (last 24 hours)
    const messagesResult = await pool.query(`
      SELECT
        ch.id,
        ch.user_id,
        ch.message_id,
        ch.session_id,
        ch.sender,
        ch.content,
        ch.state,
        ch.created_at,
        u.state as user_state
      FROM chat_history ch
      JOIN users u ON ch.user_id = u.id
      WHERE ch.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY ch.created_at DESC
    `);

    let scannedCount = 0;
    let flaggedCount = 0;

    // Scan each message
    for (const message of messagesResult.rows) {
      scannedCount++;

      const detection = chatMonitorService.analyze({
        sender: message.sender,
        content: message.content,
        state: message.user_state,
        sessionId: message.session_id,
        userId: message.user_id
      });

      if (detection) {
        // Check if already flagged
        const existingFlag = await pool.query(
          'SELECT id FROM concerning_chats WHERE message_id = $1 AND concern_type = $2',
          [message.message_id, detection.concernType]
        );

        if (existingFlag.rows.length === 0) {
          // Insert new flag
          await pool.query(
            `INSERT INTO concerning_chats
             (user_id, message_id, session_id, concern_type, severity, flagged_content, context, detection_reason, flagged_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [
              message.user_id,
              message.message_id,
              message.session_id,
              detection.concernType,
              detection.severity,
              detection.flaggedContent,
              detection.context || null,
              detection.detectionReason
            ]
          );
          flaggedCount++;
        }
      }
    }

    console.log(`✅ Scan completed: ${scannedCount} messages scanned, ${flaggedCount} flagged`);

    res.json({
      success: true,
      scanned: scannedCount,
      flagged: flaggedCount
    });
  } catch (error) {
    console.error('Error scanning concerning chats:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Mark concerning chat as reviewed (admin only)
app.patch('/api/admin/concerning-chats/:id/review', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { review_notes } = req.body;

    // Get admin user ID
    const adminUser = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (adminUser.rows.length === 0) {
      return res.status(401).json({ error: 'Admin user not found' });
    }

    const result = await pool.query(
      `UPDATE concerning_chats
       SET reviewed = true,
           reviewed_by = $1,
           reviewed_at = NOW(),
           review_notes = $2
       WHERE id = $3
       RETURNING *`,
      [adminUser.rows[0].id, review_notes || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Concerning chat not found' });
    }

    console.log(`✅ Concerning chat ${id} marked as reviewed by ${email}`);

    res.json({
      success: true,
      ...result.rows[0]
    });
  } catch (error) {
    console.error('Error reviewing concerning chat:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================================
// BUDGET MANAGEMENT ENDPOINTS
// ============================================================================

// Embedded SQL for Migration 005: API Usage Tracking and Budget Management
const MIGRATION_005_SQL = `-- ============================================================================
-- Migration 005: API Usage Tracking and Budget Management
-- ============================================================================
-- Description: Complete API usage tracking system with budget monitoring,
--              cost calculation, and analytics for multi-provider AI services
-- Created: 2025-11-05
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. API PROVIDERS TABLE
-- ============================================================================
-- Stores pricing information for each AI provider and service type
CREATE TABLE IF NOT EXISTS api_providers (
    id SERIAL PRIMARY KEY,
    provider_name VARCHAR(100) NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    model_name VARCHAR(200) NOT NULL,
    pricing_type VARCHAR(50) NOT NULL CHECK (pricing_type IN ('per_token', 'per_minute', 'per_request', 'free')),
    input_token_price DECIMAL(12, 8) DEFAULT 0.00000000,
    output_token_price DECIMAL(12, 8) DEFAULT 0.00000000,
    per_minute_price DECIMAL(12, 8) DEFAULT 0.00000000,
    per_request_price DECIMAL(12, 8) DEFAULT 0.00000000,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_name, service_type, model_name)
);

-- Index for fast provider lookups
CREATE INDEX idx_api_providers_active ON api_providers(provider_name, service_type, is_active);
CREATE INDEX idx_api_providers_model ON api_providers(model_name) WHERE is_active = true;

COMMENT ON TABLE api_providers IS 'Pricing information for AI providers and their services';
COMMENT ON COLUMN api_providers.pricing_type IS 'Pricing model: per_token, per_minute, per_request, or free';
COMMENT ON COLUMN api_providers.input_token_price IS 'Cost per 1M input tokens';
COMMENT ON COLUMN api_providers.output_token_price IS 'Cost per 1M output tokens';

-- ============================================================================
-- 2. API USAGE LOG TABLE
-- ============================================================================
-- Tracks every API call with usage metrics and cost estimation
CREATE TABLE IF NOT EXISTS api_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id INTEGER REFERENCES api_providers(id) ON DELETE SET NULL,
    provider_name VARCHAR(100) NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    model_name VARCHAR(200),
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
    duration_ms INTEGER DEFAULT 0,
    estimated_cost DECIMAL(12, 8) DEFAULT 0.00000000,
    feature_used VARCHAR(100),
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for analytics and queries
CREATE INDEX idx_api_usage_user_id ON api_usage_log(user_id);
CREATE INDEX idx_api_usage_provider ON api_usage_log(provider_name);
CREATE INDEX idx_api_usage_service_type ON api_usage_log(service_type);
CREATE INDEX idx_api_usage_created_at ON api_usage_log(created_at DESC);
CREATE INDEX idx_api_usage_feature ON api_usage_log(feature_used);
CREATE INDEX idx_api_usage_success ON api_usage_log(success, created_at) WHERE success = false;
CREATE INDEX idx_api_usage_cost ON api_usage_log(estimated_cost) WHERE estimated_cost > 0;

-- Composite index for user spending queries
CREATE INDEX idx_api_usage_user_date_cost ON api_usage_log(user_id, created_at, estimated_cost);

COMMENT ON TABLE api_usage_log IS 'Detailed log of every API call with usage metrics';
COMMENT ON COLUMN api_usage_log.provider_name IS 'Denormalized for fast queries without joins';
COMMENT ON COLUMN api_usage_log.feature_used IS 'Application feature: chat, live_susan, transcription, document_analysis';
COMMENT ON COLUMN api_usage_log.metadata IS 'Additional context (prompt, response preview, user context)';

-- ============================================================================
-- 3. USER BUDGETS TABLE
-- ============================================================================
-- Budget limits and spending tracking per user
CREATE TABLE IF NOT EXISTS user_budgets (
    id SERIAL PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    monthly_budget DECIMAL(12, 2) NOT NULL DEFAULT 100.00,
    current_month_spend DECIMAL(12, 8) DEFAULT 0.00000000,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    alert_threshold_80 BOOLEAN DEFAULT true,
    alert_threshold_90 BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_budget CHECK (monthly_budget >= 0),
    CONSTRAINT positive_spend CHECK (current_month_spend >= 0)
);

CREATE INDEX idx_user_budgets_active ON user_budgets(user_id) WHERE is_active = true;
CREATE INDEX idx_user_budgets_reset_date ON user_budgets(last_reset_date);

COMMENT ON TABLE user_budgets IS 'Monthly budget limits and spending tracking per user';
COMMENT ON COLUMN user_budgets.current_month_spend IS 'Running total that resets monthly';
COMMENT ON COLUMN user_budgets.alert_threshold_80 IS 'Send alert when 80% of budget is used';

-- ============================================================================
-- 4. COMPANY BUDGET TABLE
-- ============================================================================
-- Global budget limits for the entire organization
CREATE TABLE IF NOT EXISTS company_budget (
    id SERIAL PRIMARY KEY,
    monthly_budget DECIMAL(12, 2) NOT NULL DEFAULT 10000.00,
    current_month_spend DECIMAL(12, 8) DEFAULT 0.00000000,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    fiscal_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_company_budget CHECK (monthly_budget >= 0),
    CONSTRAINT positive_company_spend CHECK (current_month_spend >= 0)
);

-- Insert initial company budget record
INSERT INTO company_budget (monthly_budget, current_month_spend, notes)
VALUES (10000.00, 0.00, 'Initial company-wide API budget')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE company_budget IS 'Global budget limits for entire organization';

-- ============================================================================
-- 5. BUDGET ALERTS TABLE
-- ============================================================================
-- Track budget warnings and notifications
CREATE TABLE IF NOT EXISTS budget_alerts (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
        'user_80', 'user_90', 'user_100',
        'company_80', 'company_90', 'company_100'
    )),
    threshold_percentage INTEGER NOT NULL,
    current_spend DECIMAL(12, 8) NOT NULL,
    budget_limit DECIMAL(12, 2) NOT NULL,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT valid_threshold CHECK (threshold_percentage IN (80, 90, 100))
);

CREATE INDEX idx_budget_alerts_user ON budget_alerts(user_id, triggered_at DESC);
CREATE INDEX idx_budget_alerts_unacknowledged ON budget_alerts(acknowledged, triggered_at) WHERE acknowledged = false;
CREATE INDEX idx_budget_alerts_type ON budget_alerts(alert_type, triggered_at DESC);

COMMENT ON TABLE budget_alerts IS 'Budget warning notifications and acknowledgment tracking';
COMMENT ON COLUMN budget_alerts.user_id IS 'NULL for company-wide alerts';

-- ============================================================================
-- 6. ANALYTICS VIEWS
-- ============================================================================

-- View: User API Usage Summary
CREATE OR REPLACE VIEW user_api_usage_summary AS
SELECT
    u.id AS user_id,
    u.username,
    u.email,
    COUNT(*) AS total_requests,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successful_requests,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) AS failed_requests,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    SUM(total_tokens) AS total_tokens,
    SUM(estimated_cost) AS total_cost,
    AVG(duration_ms) AS avg_duration_ms,
    MAX(created_at) AS last_api_call,
    ub.monthly_budget,
    ub.current_month_spend,
    ROUND((ub.current_month_spend / NULLIF(ub.monthly_budget, 0) * 100), 2) AS budget_usage_percentage
FROM users u
LEFT JOIN api_usage_log aul ON u.id = aul.user_id
LEFT JOIN user_budgets ub ON u.id = ub.user_id
GROUP BY u.id, u.username, u.email, ub.monthly_budget, ub.current_month_spend;

COMMENT ON VIEW user_api_usage_summary IS 'Per-user API usage statistics and budget status';

-- View: Provider Cost Breakdown
CREATE OR REPLACE VIEW provider_cost_breakdown AS
SELECT
    provider_name,
    service_type,
    model_name,
    COUNT(*) AS request_count,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successful_requests,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    SUM(estimated_cost) AS total_cost,
    AVG(estimated_cost) AS avg_cost_per_request,
    AVG(duration_ms) AS avg_duration_ms,
    MIN(created_at) AS first_used,
    MAX(created_at) AS last_used
FROM api_usage_log
GROUP BY provider_name, service_type, model_name
ORDER BY total_cost DESC;

COMMENT ON VIEW provider_cost_breakdown IS 'Cost analysis by provider and service type';

-- View: Daily API Usage Trends
CREATE OR REPLACE VIEW daily_api_usage_trends AS
SELECT
    DATE(created_at) AS usage_date,
    provider_name,
    service_type,
    COUNT(*) AS request_count,
    SUM(input_tokens) AS input_tokens,
    SUM(output_tokens) AS output_tokens,
    SUM(estimated_cost) AS daily_cost,
    AVG(duration_ms) AS avg_duration_ms,
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100 AS success_rate
FROM api_usage_log
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at), provider_name, service_type
ORDER BY usage_date DESC, daily_cost DESC;

COMMENT ON VIEW daily_api_usage_trends IS 'Time series data for daily API usage and costs';

-- View: Feature Usage Breakdown
CREATE OR REPLACE VIEW feature_usage_breakdown AS
SELECT
    feature_used,
    provider_name,
    COUNT(*) AS usage_count,
    SUM(estimated_cost) AS total_cost,
    AVG(estimated_cost) AS avg_cost,
    SUM(total_tokens) AS total_tokens,
    AVG(duration_ms) AS avg_duration_ms,
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100 AS success_rate
FROM api_usage_log
WHERE feature_used IS NOT NULL
GROUP BY feature_used, provider_name
ORDER BY usage_count DESC;

COMMENT ON VIEW feature_usage_breakdown IS 'Usage statistics by application feature';

-- View: Monthly Spending Report
CREATE OR REPLACE VIEW monthly_spending_report AS
SELECT
    TO_CHAR(created_at, 'YYYY-MM') AS month,
    COUNT(DISTINCT user_id) AS active_users,
    COUNT(*) AS total_requests,
    SUM(estimated_cost) AS total_spend,
    AVG(estimated_cost) AS avg_cost_per_request,
    SUM(total_tokens) AS total_tokens,
    (SELECT monthly_budget FROM company_budget ORDER BY id DESC LIMIT 1) AS company_budget,
    ROUND((SUM(estimated_cost) / (SELECT monthly_budget FROM company_budget ORDER BY id DESC LIMIT 1) * 100), 2) AS budget_usage_percentage
FROM api_usage_log
GROUP BY TO_CHAR(created_at, 'YYYY-MM')
ORDER BY month DESC;

COMMENT ON VIEW monthly_spending_report IS 'Monthly aggregated spending and usage metrics';

-- ============================================================================
-- 7. FUNCTIONS
-- ============================================================================

-- Function: Calculate API Cost
CREATE OR REPLACE FUNCTION calculate_api_cost(
    p_provider_id INTEGER,
    p_input_tokens INTEGER,
    p_output_tokens INTEGER,
    p_duration_ms INTEGER DEFAULT 0
) RETURNS DECIMAL(12, 8) AS $$
DECLARE
    v_cost DECIMAL(12, 8) := 0.00000000;
    v_pricing_type VARCHAR(50);
    v_input_price DECIMAL(12, 8);
    v_output_price DECIMAL(12, 8);
    v_per_minute_price DECIMAL(12, 8);
    v_per_request_price DECIMAL(12, 8);
BEGIN
    -- Get pricing information
    SELECT
        pricing_type,
        input_token_price,
        output_token_price,
        per_minute_price,
        per_request_price
    INTO
        v_pricing_type,
        v_input_price,
        v_output_price,
        v_per_minute_price,
        v_per_request_price
    FROM api_providers
    WHERE id = p_provider_id AND is_active = true;

    -- If provider not found, return 0
    IF NOT FOUND THEN
        RETURN 0.00000000;
    END IF;

    -- Calculate cost based on pricing type
    CASE v_pricing_type
        WHEN 'per_token' THEN
            -- Cost = (input_tokens * input_price + output_tokens * output_price) / 1,000,000
            v_cost := (p_input_tokens * v_input_price + p_output_tokens * v_output_price) / 1000000.0;
        WHEN 'per_minute' THEN
            -- Cost = (duration_ms / 60000) * per_minute_price
            v_cost := (p_duration_ms / 60000.0) * v_per_minute_price;
        WHEN 'per_request' THEN
            -- Flat rate per request
            v_cost := v_per_request_price;
        WHEN 'free' THEN
            -- Free tier
            v_cost := 0.00000000;
        ELSE
            v_cost := 0.00000000;
    END CASE;

    RETURN v_cost;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_api_cost IS 'Calculate API call cost based on provider pricing';

-- Function: Update User Budget on API Call (Trigger Function)
CREATE OR REPLACE FUNCTION update_user_budget_on_api_call()
RETURNS TRIGGER AS $$
DECLARE
    v_user_budget_id INTEGER;
    v_current_month_spend DECIMAL(12, 8);
    v_monthly_budget DECIMAL(12, 2);
BEGIN
    -- Ensure user has a budget record
    INSERT INTO user_budgets (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Update user's current month spend
    UPDATE user_budgets
    SET
        current_month_spend = current_month_spend + NEW.estimated_cost,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id
    RETURNING id, current_month_spend, monthly_budget
    INTO v_user_budget_id, v_current_month_spend, v_monthly_budget;

    -- Update company budget
    UPDATE company_budget
    SET
        current_month_spend = current_month_spend + NEW.estimated_cost,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = (SELECT id FROM company_budget ORDER BY id DESC LIMIT 1);

    -- Check for budget alerts (80%, 90%, 100%)
    PERFORM check_budget_alerts();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_user_budget_on_api_call IS 'Trigger function to update budgets after API calls';

-- Function: Check Budget Alerts
CREATE OR REPLACE FUNCTION check_budget_alerts()
RETURNS VOID AS $$
DECLARE
    v_user RECORD;
    v_company RECORD;
    v_percentage DECIMAL(5, 2);
BEGIN
    -- Check user budgets
    FOR v_user IN
        SELECT
            user_id,
            monthly_budget,
            current_month_spend,
            alert_threshold_80,
            alert_threshold_90,
            ROUND((current_month_spend / NULLIF(monthly_budget, 0) * 100), 2) AS usage_percentage
        FROM user_budgets
        WHERE is_active = true AND monthly_budget > 0
    LOOP
        v_percentage := v_user.usage_percentage;

        -- 100% threshold
        IF v_percentage >= 100 THEN
            INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
            VALUES (v_user.user_id, 'user_100', 100, v_user.current_month_spend, v_user.monthly_budget)
            ON CONFLICT DO NOTHING;
        -- 90% threshold
        ELSIF v_percentage >= 90 AND v_user.alert_threshold_90 THEN
            INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
            SELECT v_user.user_id, 'user_90', 90, v_user.current_month_spend, v_user.monthly_budget
            WHERE NOT EXISTS (
                SELECT 1 FROM budget_alerts
                WHERE user_id = v_user.user_id
                AND alert_type = 'user_90'
                AND triggered_at >= CURRENT_DATE
            );
        -- 80% threshold
        ELSIF v_percentage >= 80 AND v_user.alert_threshold_80 THEN
            INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
            SELECT v_user.user_id, 'user_80', 80, v_user.current_month_spend, v_user.monthly_budget
            WHERE NOT EXISTS (
                SELECT 1 FROM budget_alerts
                WHERE user_id = v_user.user_id
                AND alert_type = 'user_80'
                AND triggered_at >= CURRENT_DATE
            );
        END IF;
    END LOOP;

    -- Check company budget
    SELECT
        monthly_budget,
        current_month_spend,
        ROUND((current_month_spend / NULLIF(monthly_budget, 0) * 100), 2) AS usage_percentage
    INTO v_company
    FROM company_budget
    ORDER BY id DESC LIMIT 1;

    IF v_company.usage_percentage >= 100 THEN
        INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
        VALUES (NULL, 'company_100', 100, v_company.current_month_spend, v_company.monthly_budget)
        ON CONFLICT DO NOTHING;
    ELSIF v_company.usage_percentage >= 90 THEN
        INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
        SELECT NULL, 'company_90', 90, v_company.current_month_spend, v_company.monthly_budget
        WHERE NOT EXISTS (
            SELECT 1 FROM budget_alerts
            WHERE user_id IS NULL
            AND alert_type = 'company_90'
            AND triggered_at >= CURRENT_DATE
        );
    ELSIF v_company.usage_percentage >= 80 THEN
        INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
        SELECT NULL, 'company_80', 80, v_company.current_month_spend, v_company.monthly_budget
        WHERE NOT EXISTS (
            SELECT 1 FROM budget_alerts
            WHERE user_id IS NULL
            AND alert_type = 'company_80'
            AND triggered_at >= CURRENT_DATE
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_budget_alerts IS 'Check and create budget alerts at 80%, 90%, and 100% thresholds';

-- Function: Reset Monthly Budgets
CREATE OR REPLACE FUNCTION reset_monthly_budgets()
RETURNS VOID AS $$
BEGIN
    -- Reset user budgets if month has changed
    UPDATE user_budgets
    SET
        current_month_spend = 0.00000000,
        last_reset_date = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP
    WHERE last_reset_date < DATE_TRUNC('month', CURRENT_DATE);

    -- Reset company budget if month has changed
    UPDATE company_budget
    SET
        current_month_spend = 0.00000000,
        last_reset_date = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP
    WHERE last_reset_date < DATE_TRUNC('month', CURRENT_DATE);

    -- Archive old alerts (optional - keep last 6 months)
    DELETE FROM budget_alerts
    WHERE triggered_at < CURRENT_DATE - INTERVAL '6 months';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_monthly_budgets IS 'Reset monthly budget counters (run via cron job)';

-- ============================================================================
-- 8. TRIGGERS
-- ============================================================================

-- Trigger: Update user budget after API call
CREATE TRIGGER trg_update_user_budget_after_api_call
AFTER INSERT ON api_usage_log
FOR EACH ROW
EXECUTE FUNCTION update_user_budget_on_api_call();

-- Trigger: Update api_providers updated_at
CREATE TRIGGER trg_api_providers_updated_at
BEFORE UPDATE ON api_providers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update user_budgets updated_at
CREATE TRIGGER trg_user_budgets_updated_at
BEFORE UPDATE ON user_budgets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update company_budget updated_at
CREATE TRIGGER trg_company_budget_updated_at
BEFORE UPDATE ON company_budget
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9. SEED DATA - API PROVIDER PRICING (2025 Current Rates)
-- ============================================================================
-- Note: Prices are per 1M tokens unless specified otherwise
-- Last updated: January 2025

-- Google Gemini Pricing (Free during experimental preview, then very low cost)
-- Source: Google AI Studio pricing (ai.google.dev/pricing)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('gemini', 'chat', 'gemini-2.0-flash', 'free', 0.0, 0.0),  -- Currently FREE in preview
('gemini', 'chat', 'gemini-2.0-flash-thinking-exp', 'free', 0.0, 0.0),  -- Currently FREE in preview
('gemini', 'chat', 'gemini-1.5-pro', 'per_token', 1.25, 5.00),  -- Actual paid tier pricing
('gemini', 'chat', 'gemini-1.5-flash', 'per_token', 0.075, 0.30),  -- When paid ($0.075/$0.30 per 1M)
('gemini', 'image_analysis', 'gemini-2.0-flash', 'free', 0.0, 0.0),  -- Same model, currently FREE
('gemini', 'embedding', 'text-embedding-004', 'per_token', 0.00001, 0.0);  -- Embeddings are very cheap

-- Groq Pricing (Free tier available, paid tier is ultra-fast and cheap)
-- Source: groq.com/pricing (Free tier: 14,400 requests/day, Paid: $0.05-$0.10 per 1M)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('groq', 'chat', 'llama-3.3-70b-versatile', 'per_token', 0.059, 0.079),  -- $0.059/$0.079 per 1M tokens
('groq', 'chat', 'llama-3.1-70b-versatile', 'per_token', 0.059, 0.079),  -- Same pricing
('groq', 'chat', 'mixtral-8x7b-32768', 'per_token', 0.024, 0.024),  -- Cheaper model
('groq', 'chat', 'gemma2-9b-it', 'per_token', 0.02, 0.02);  -- Smallest/cheapest

-- Together AI Pricing (Competitive rates for open models)
-- Source: together.ai/pricing (Turbo models: $0.18/$0.18, smaller: $0.06/$0.06)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('together', 'chat', 'meta-llama/Llama-3.1-70B-Instruct-Turbo', 'per_token', 0.18, 0.18),  -- $0.18 per 1M
('together', 'chat', 'meta-llama/Llama-3.1-8B-Instruct-Turbo', 'per_token', 0.06, 0.06),  -- Smaller model
('together', 'chat', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'per_token', 0.12, 0.12),  -- Mid-tier
('together', 'chat', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'per_token', 0.18, 0.18);  -- Same as Llama 70B

-- DeepSeek Pricing (Known for being very cheap - actual 2025 rates)
-- Source: platform.deepseek.com/api-docs/pricing
-- DeepSeek-Chat: $0.14 input / $0.28 output per 1M tokens
-- DeepSeek-Reasoner: $0.55 input / $2.19 output per 1M tokens (uses reasoning tokens)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('deepseek', 'chat', 'deepseek-chat', 'per_token', 0.14, 0.28),  -- Very affordable
('deepseek', 'chat', 'deepseek-reasoner', 'per_token', 0.55, 2.19);  -- Reasoning model (more expensive)

-- HuggingFace Inference API (Free tier available)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('huggingface', 'chat', 'meta-llama/Llama-3.2-3B-Instruct', 'free', 0.0, 0.0),  -- Free inference
('huggingface', 'image_analysis', 'Salesforce/blip-image-captioning-large', 'free', 0.0, 0.0);  -- Free

-- Ollama (Self-hosted - Completely Free)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('ollama', 'chat', 'llama3.2', 'free', 0.0, 0.0),  -- Self-hosted
('ollama', 'chat', 'qwen2.5-coder', 'free', 0.0, 0.0),  -- Self-hosted
('ollama', 'chat', 'deepseek-r1', 'free', 0.0, 0.0),  -- Self-hosted
('ollama', 'embedding', 'nomic-embed-text', 'free', 0.0, 0.0);  -- Self-hosted

-- Audio Transcription Services (2025 rates)
-- Google Speech-to-Text: Chirp 2 is free during preview, then ~$0.002-$0.005/min
-- Deepgram: Nova-2 is $0.0043/min
-- AssemblyAI: Best model is $0.00037/min (very cheap)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, per_minute_price) VALUES
('google-speech', 'transcription', 'chirp-2', 'per_minute', 0.002),  -- Chirp 2 (free in preview)
('google-speech', 'transcription', 'latest_long', 'per_minute', 0.005),  -- Standard long audio
('deepgram', 'transcription', 'nova-2', 'per_minute', 0.0043),  -- Nova-2 model
('assemblyai', 'transcription', 'best', 'per_minute', 0.00037);  -- Very affordable

-- Web Search APIs (2025 rates)
-- Brave Search: ~$0.0005 per request (very cheap)
-- Serper: ~$0.001 per request
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, per_request_price) VALUES
('brave-search', 'web_search', 'web-search-api', 'per_request', 0.0005),  -- Cost-effective
('serper', 'web_search', 'google-search-api', 'per_request', 0.001);  -- Standard rate

-- ============================================================================
-- 10. HELPER FUNCTIONS FOR APPLICATION USE
-- ============================================================================

-- Function: Get User Budget Status
CREATE OR REPLACE FUNCTION get_user_budget_status(p_user_id UUID)
RETURNS TABLE(
    monthly_budget DECIMAL(12, 2),
    current_spend DECIMAL(12, 8),
    remaining_budget DECIMAL(12, 8),
    usage_percentage DECIMAL(5, 2),
    is_over_budget BOOLEAN,
    days_until_reset INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ub.monthly_budget,
        ub.current_month_spend,
        ub.monthly_budget - ub.current_month_spend AS remaining_budget,
        ROUND((ub.current_month_spend / NULLIF(ub.monthly_budget, 0) * 100), 2) AS usage_percentage,
        ub.current_month_spend >= ub.monthly_budget AS is_over_budget,
        (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - CURRENT_DATE)::INTEGER AS days_until_reset
    FROM user_budgets ub
    WHERE ub.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Get Company Budget Status
CREATE OR REPLACE FUNCTION get_company_budget_status()
RETURNS TABLE(
    monthly_budget DECIMAL(12, 2),
    current_spend DECIMAL(12, 8),
    remaining_budget DECIMAL(12, 8),
    usage_percentage DECIMAL(5, 2),
    is_over_budget BOOLEAN,
    active_users_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cb.monthly_budget,
        cb.current_month_spend,
        cb.monthly_budget - cb.current_month_spend AS remaining_budget,
        ROUND((cb.current_month_spend / NULLIF(cb.monthly_budget, 0) * 100), 2) AS usage_percentage,
        cb.current_month_spend >= cb.monthly_budget AS is_over_budget,
        (SELECT COUNT(DISTINCT user_id) FROM api_usage_log
         WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE))::INTEGER AS active_users_count
    FROM company_budget cb
    ORDER BY cb.id DESC LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Log API Usage (convenience function for application)
CREATE OR REPLACE FUNCTION log_api_usage(
    p_user_id UUID,
    p_provider_name VARCHAR,
    p_service_type VARCHAR,
    p_model_name VARCHAR,
    p_input_tokens INTEGER DEFAULT 0,
    p_output_tokens INTEGER DEFAULT 0,
    p_duration_ms INTEGER DEFAULT 0,
    p_feature_used VARCHAR DEFAULT NULL,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_usage_id UUID;
    v_provider_id INTEGER;
    v_estimated_cost DECIMAL(12, 8);
BEGIN
    -- Get provider ID
    SELECT id INTO v_provider_id
    FROM api_providers
    WHERE provider_name = p_provider_name
      AND service_type = p_service_type
      AND model_name = p_model_name
      AND is_active = true
    LIMIT 1;

    -- Calculate cost
    IF v_provider_id IS NOT NULL THEN
        v_estimated_cost := calculate_api_cost(v_provider_id, p_input_tokens, p_output_tokens, p_duration_ms);
    ELSE
        v_estimated_cost := 0.00000000;
    END IF;

    -- Insert usage log
    INSERT INTO api_usage_log (
        user_id, provider_id, provider_name, service_type, model_name,
        input_tokens, output_tokens, duration_ms, estimated_cost,
        feature_used, success, error_message, metadata
    ) VALUES (
        p_user_id, v_provider_id, p_provider_name, p_service_type, p_model_name,
        p_input_tokens, p_output_tokens, p_duration_ms, v_estimated_cost,
        p_feature_used, p_success, p_error_message, p_metadata
    )
    RETURNING id INTO v_usage_id;

    RETURN v_usage_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_api_usage IS 'Convenience function to log API usage from application code';

-- ============================================================================
-- 11. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Additional performance indexes
CREATE INDEX IF NOT EXISTS idx_api_usage_log_user_month ON api_usage_log(user_id, DATE_TRUNC('month', created_at));
CREATE INDEX IF NOT EXISTS idx_api_usage_log_provider_month ON api_usage_log(provider_name, DATE_TRUNC('month', created_at));
CREATE INDEX IF NOT EXISTS idx_budget_alerts_user_unack ON budget_alerts(user_id, acknowledged) WHERE acknowledged = false;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMIT;

-- Display success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 005 completed successfully!';
    RAISE NOTICE '📊 Created tables: api_providers, api_usage_log, user_budgets, company_budget, budget_alerts';
    RAISE NOTICE '📈 Created views: user_api_usage_summary, provider_cost_breakdown, daily_api_usage_trends, feature_usage_breakdown, monthly_spending_report';
    RAISE NOTICE '⚙️  Created functions: calculate_api_cost, update_user_budget_on_api_call, check_budget_alerts, reset_monthly_budgets';
    RAISE NOTICE '💰 Seeded pricing data for: Gemini, Groq, Together AI, DeepSeek, HuggingFace, Ollama, Speech APIs';
    RAISE NOTICE '🎯 Next steps: Run reset_monthly_budgets() via cron job (e.g., monthly on 1st)';
END $$;
`;

// Embedded SQL for Migration 006: Fix Production Issues
const MIGRATION_006_SQL = `-- ============================================================================
-- Migration 006: Fix Production Issues
-- ============================================================================
-- Created: 2025-11-05
-- Purpose: Fix rag_documents type constraint and ensure rag_analytics has all columns
-- ============================================================================

-- ============================================================================
-- 1. FIX RAG_DOCUMENTS TYPE CONSTRAINT
-- ============================================================================
-- Add 'processed' to the allowed types for rag_documents

DO $$
BEGIN
    -- Check if rag_documents table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'rag_documents') THEN

        RAISE NOTICE 'Fixing rag_documents type constraint...';

        -- Drop the existing constraint
        ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_type_check;

        -- Add the corrected constraint with 'processed' type
        ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_type_check
            CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text', 'processed'));

        RAISE NOTICE '✓ rag_documents constraint updated to include processed type';
    ELSE
        RAISE NOTICE '⚠ rag_documents table does not exist, skipping constraint fix';
    END IF;
END $$;

-- ============================================================================
-- 2. ENSURE RAG_ANALYTICS TABLE EXISTS WITH CORRECT SCHEMA
-- ============================================================================
-- The rag_analytics table should have been created by migration 004,
-- but we'll ensure it exists with all required columns

DO $$
BEGIN
    -- Check if rag_analytics table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'rag_analytics') THEN

        RAISE NOTICE 'Creating rag_analytics table...';

        CREATE TABLE rag_analytics (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            query_text TEXT NOT NULL,
            query_embedding VECTOR(1536), -- OpenAI/Gemini embedding dimension
            num_results INTEGER DEFAULT 0,
            avg_relevance_score FLOAT,
            response_time_ms INTEGER,
            sources_used JSONB,
            state VARCHAR(2), -- VA, MD, PA
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Create indexes
        CREATE INDEX idx_rag_analytics_user_id ON rag_analytics(user_id);
        CREATE INDEX idx_rag_analytics_created_at ON rag_analytics(created_at DESC);
        CREATE INDEX idx_rag_analytics_state ON rag_analytics(state);

        RAISE NOTICE '✓ rag_analytics table created successfully';
    ELSE
        RAISE NOTICE 'rag_analytics table exists, checking for missing columns...';

        -- Ensure query_text column exists (this was the error in production)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'query_text') THEN

            RAISE NOTICE 'Adding missing query_text column...';
            ALTER TABLE rag_analytics ADD COLUMN query_text TEXT NOT NULL DEFAULT '';
            RAISE NOTICE '✓ query_text column added';
        END IF;

        -- Ensure other important columns exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'user_id') THEN
            ALTER TABLE rag_analytics ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
            RAISE NOTICE '✓ user_id column added';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'num_results') THEN
            ALTER TABLE rag_analytics ADD COLUMN num_results INTEGER DEFAULT 0;
            RAISE NOTICE '✓ num_results column added';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'response_time_ms') THEN
            ALTER TABLE rag_analytics ADD COLUMN response_time_ms INTEGER;
            RAISE NOTICE '✓ response_time_ms column added';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'sources_used') THEN
            ALTER TABLE rag_analytics ADD COLUMN sources_used JSONB;
            RAISE NOTICE '✓ sources_used column added';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'state') THEN
            ALTER TABLE rag_analytics ADD COLUMN state VARCHAR(2);
            RAISE NOTICE '✓ state column added';
        END IF;

        -- Ensure indexes exist
        CREATE INDEX IF NOT EXISTS idx_rag_analytics_user_id ON rag_analytics(user_id);
        CREATE INDEX IF NOT EXISTS idx_rag_analytics_created_at ON rag_analytics(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_rag_analytics_state ON rag_analytics(state);

        RAISE NOTICE '✓ rag_analytics table schema verified';
    END IF;
END $$;

-- ============================================================================
-- 3. VERIFICATION
-- ============================================================================

-- Verify rag_documents constraint
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'rag_documents'
AND conname = 'rag_documents_type_check';

-- Verify rag_analytics columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'rag_analytics'
ORDER BY ordinal_position;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 006 completed successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ rag_documents type constraint fixed';
    RAISE NOTICE '✓ rag_analytics table schema verified';
    RAISE NOTICE '========================================';
END $$;
`;

// 1. Run Migration 005: API Usage Tracking and Budget Management
app.post('/api/admin/run-migration-005', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔧 Running Migration 005: API Usage Tracking and Budget Management...');

    // Execute the embedded migration SQL
    await pool.query(MIGRATION_005_SQL);

    console.log('✅ Migration 005 completed successfully');

    // Verify tables were created
    const verify = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('api_providers', 'api_usage_log', 'user_budgets', 'company_budget', 'budget_alerts')
      ORDER BY table_name
    `);

    const providersCount = await pool.query('SELECT COUNT(*) FROM api_providers');
    const companyBudget = await pool.query('SELECT monthly_budget FROM company_budget LIMIT 1');

    res.json({
      success: true,
      message: 'Migration 005 completed successfully',
      tables_created: verify.rows.map(r => r.table_name),
      api_providers_seeded: parseInt(providersCount.rows[0].count),
      company_budget_initialized: companyBudget.rows[0]?.monthly_budget
    });
  } catch (error) {
    console.error('❌ Migration 005 failed:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      message: (error as Error).message
    });
  }
});

// Migration 006: Fix Production Issues
app.post('/api/admin/run-migration-006', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔧 Running Migration 006: Fix Production Issues...');

    // Execute the embedded migration SQL
    await pool.query(MIGRATION_006_SQL);

    console.log('✅ Migration 006 completed successfully');

    // Verify rag_documents constraint was fixed
    const constraintCheck = await pool.query(`
      SELECT conname AS constraint_name, pg_get_constraintdef(c.oid) AS constraint_definition
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'rag_documents'
      AND conname = 'rag_documents_type_check'
    `);

    // Verify rag_analytics columns exist
    const columnsCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'rag_analytics'
      ORDER BY ordinal_position
    `);

    res.json({
      success: true,
      message: 'Migration 006 completed successfully - Fixed rag_documents constraint and rag_analytics schema',
      rag_documents_constraint_fixed: constraintCheck.rows.length > 0,
      rag_analytics_columns: columnsCheck.rows.map(r => r.column_name)
    });
  } catch (error) {
    console.error('❌ Migration 006 failed:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      message: (error as Error).message
    });
  }
});

// 2. Get budget overview stats (admin only)
app.get('/api/admin/budget/overview', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get company budget status
    const companyBudget = await pool.query(`
      SELECT * FROM get_company_budget_status()
    `);

    // Get users over budget count
    const usersOverBudget = await pool.query(`
      SELECT COUNT(*) as count
      FROM user_budgets
      WHERE current_month_spend >= monthly_budget AND is_active = true
    `);

    // Get total API calls this month
    const apiCallsThisMonth = await pool.query(`
      SELECT COUNT(*) as count
      FROM api_usage_log
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `);

    // Get average cost per call
    const avgCostPerCall = await pool.query(`
      SELECT AVG(estimated_cost) as avg_cost
      FROM api_usage_log
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
      AND estimated_cost > 0
    `);

    // Get most expensive provider
    const mostExpensiveProvider = await pool.query(`
      SELECT
        provider_name,
        SUM(estimated_cost) as total_cost
      FROM api_usage_log
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY provider_name
      ORDER BY total_cost DESC
      LIMIT 1
    `);

    const overview = {
      company: companyBudget.rows[0] || {
        monthly_budget: 0,
        current_spend: 0,
        remaining_budget: 0,
        usage_percentage: 0,
        is_over_budget: false,
        active_users_count: 0
      },
      users_over_budget: parseInt(usersOverBudget.rows[0].count || 0),
      api_calls_this_month: parseInt(apiCallsThisMonth.rows[0].count || 0),
      avg_cost_per_call: parseFloat(avgCostPerCall.rows[0]?.avg_cost || 0),
      most_expensive_provider: mostExpensiveProvider.rows[0] || null
    };

    return res.json({ data: overview });
  } catch (error) {
    console.error('Error fetching budget overview:', error);
    return res.status(500).json({ error: 'Failed to fetch budget overview' });
  }
});

// 3. Get per-user budget details (admin only)
app.get('/api/admin/budget/users', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM user_budgets ub
      JOIN users u ON ub.user_id = u.id
      WHERE ub.is_active = true
    `);
    const totalCount = parseInt(countResult.rows[0]?.total || 0);

    // Get user budget details
    const result = await pool.query(`
      SELECT
        u.id as user_id,
        u.email,
        u.name,
        ub.monthly_budget,
        ub.current_month_spend as current_spend,
        ROUND((ub.current_month_spend / NULLIF(ub.monthly_budget, 0) * 100), 2) as percentage_used,
        ub.current_month_spend >= ub.monthly_budget as is_over_budget,
        (SELECT COUNT(*) FROM api_usage_log WHERE user_id = u.id AND created_at >= DATE_TRUNC('month', CURRENT_DATE)) as api_calls_this_month
      FROM user_budgets ub
      JOIN users u ON ub.user_id = u.id
      WHERE ub.is_active = true
      ORDER BY ub.current_month_spend DESC
      LIMIT $1 OFFSET $2
    `, [Number(limit), offset]);

    return res.json({
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching user budgets:', error);
    return res.status(500).json({ error: 'Failed to fetch user budgets' });
  }
});

// 4. Get budget alerts (admin only)
app.get('/api/admin/budget/alerts', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { acknowledged = 'all' } = req.query;

    let acknowledgedFilter = '';
    if (acknowledged === 'true') {
      acknowledgedFilter = 'WHERE ba.acknowledged = true';
    } else if (acknowledged === 'false') {
      acknowledgedFilter = 'WHERE ba.acknowledged = false';
    }

    const result = await pool.query(`
      SELECT
        ba.id,
        ba.alert_type,
        ba.threshold_percentage,
        ba.current_spend,
        ba.budget_limit,
        ba.triggered_at,
        ba.acknowledged,
        ba.acknowledged_at,
        ba.user_id,
        u.email as user_email,
        u.name as user_name,
        ack_user.email as acknowledged_by_email
      FROM budget_alerts ba
      LEFT JOIN users u ON ba.user_id = u.id
      LEFT JOIN users ack_user ON ba.acknowledged_by = ack_user.id
      ${acknowledgedFilter}
      ORDER BY ba.triggered_at DESC
      LIMIT 100
    `);

    return res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching budget alerts:', error);
    return res.status(500).json({ error: 'Failed to fetch budget alerts' });
  }
});

// 5. Acknowledge a budget alert (admin only)
app.post('/api/admin/budget/alerts/:id/acknowledge', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    // Get admin user ID
    const adminUser = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (adminUser.rows.length === 0) {
      return res.status(401).json({ error: 'Admin user not found' });
    }

    const result = await pool.query(
      `UPDATE budget_alerts
       SET acknowledged = true,
           acknowledged_at = CURRENT_TIMESTAMP,
           acknowledged_by = $1
       WHERE id = $2
       RETURNING *`,
      [adminUser.rows[0].id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    console.log(`✅ Budget alert ${id} acknowledged by ${email}`);

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error acknowledging budget alert:', error);
    return res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// 6. Get detailed API usage log (admin only)
app.get('/api/admin/budget/usage-log', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      page = 1,
      limit = 100,
      userId,
      provider,
      serviceType,
      startDate,
      endDate,
      export: exportCsv
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    // Build filters
    const filters: string[] = [];
    const params: any[] = [];

    if (userId) {
      filters.push(`aul.user_id = $${params.length + 1}`);
      params.push(userId);
    }

    if (provider) {
      filters.push(`aul.provider_name = $${params.length + 1}`);
      params.push(provider);
    }

    if (serviceType) {
      filters.push(`aul.service_type = $${params.length + 1}`);
      params.push(serviceType);
    }

    if (startDate) {
      filters.push(`aul.created_at >= $${params.length + 1}`);
      params.push(startDate);
    }

    if (endDate) {
      filters.push(`aul.created_at <= $${params.length + 1}`);
      params.push(endDate);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM api_usage_log aul
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0]?.total || 0);

    // Get usage log data
    const dataQuery = `
      SELECT
        aul.id,
        aul.created_at,
        u.email as user_email,
        u.name as user_name,
        aul.provider_name,
        aul.service_type,
        aul.model_name,
        aul.input_tokens,
        aul.output_tokens,
        aul.total_tokens,
        aul.duration_ms,
        aul.estimated_cost,
        aul.feature_used,
        aul.success
      FROM api_usage_log aul
      LEFT JOIN users u ON aul.user_id = u.id
      ${whereClause}
      ORDER BY aul.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(Number(limit), offset);

    const result = await pool.query(dataQuery, params);

    // If export is requested, return CSV format
    if (exportCsv === 'true') {
      const csvHeader = 'Date,User Email,Provider,Service Type,Model,Input Tokens,Output Tokens,Total Tokens,Duration (ms),Cost,Feature,Success\n';
      const csvRows = result.rows.map(row =>
        `${row.created_at},${row.user_email},${row.provider_name},${row.service_type},${row.model_name},${row.input_tokens},${row.output_tokens},${row.total_tokens},${row.duration_ms},${row.estimated_cost},${row.feature_used},${row.success}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="api_usage_log.csv"');
      return res.send(csvHeader + csvRows);
    }

    return res.json({
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching API usage log:', error);
    return res.status(500).json({ error: 'Failed to fetch usage log' });
  }
});

// 7. Update user budget limit (admin only)
app.put('/api/admin/budget/user/:userId', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;
    const { monthly_budget } = req.body;

    if (!monthly_budget || monthly_budget < 0) {
      return res.status(400).json({ error: 'Invalid monthly_budget value' });
    }

    // Upsert user budget
    const result = await pool.query(
      `INSERT INTO user_budgets (user_id, monthly_budget, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET
         monthly_budget = $2,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, monthly_budget]
    );

    console.log(`✅ Updated budget for user ${userId} to $${monthly_budget}`);

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user budget:', error);
    return res.status(500).json({ error: 'Failed to update user budget' });
  }
});

// 8. Update company budget limit (admin only)
app.put('/api/admin/budget/company', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { monthly_budget } = req.body;

    if (!monthly_budget || monthly_budget < 0) {
      return res.status(400).json({ error: 'Invalid monthly_budget value' });
    }

    // Update company budget
    const result = await pool.query(
      `UPDATE company_budget
       SET monthly_budget = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT id FROM company_budget ORDER BY id DESC LIMIT 1)
       RETURNING *`,
      [monthly_budget]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company budget not found' });
    }

    console.log(`✅ Updated company budget to $${monthly_budget}`);

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating company budget:', error);
    return res.status(500).json({ error: 'Failed to update company budget' });
  }
});

// ============================================================================
// INSURANCE COMPANIES ENDPOINTS
// ============================================================================

// List insurance companies with optional filters
app.get('/api/insurance/companies', async (req, res) => {
  try {
    const { q, state, limit = 100 } = req.query as { q?: string; state?: string; limit?: any };

    const clauses: string[] = [];
    const params: any[] = [];

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
  } catch (error) {
    console.error('Error fetching insurance companies:', error);
    res.status(500).json({ error: 'insurance_companies: failed to fetch', message: (error as Error).message });
  }
});

// ============================================================================
// ERROR HANDLER
// ============================================================================

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ============================================================================
// STATIC FILE SERVING (Production)
// ============================================================================

// When running in Railway production, also serve the built frontend from /dist
// This MUST be configured BEFORE app.listen() so routes are registered

try {
  // When compiled: __dirname = /app/dist-server, so we need ../dist to reach /app/dist
  const distDir = path.resolve(__dirname, '../dist');
  console.log('📁 Static file configuration:');
  console.log('   __dirname:', __dirname);
  console.log('   distDir:', distDir);
  console.log('   Checking if dist exists...');

  if (fs.existsSync(distDir)) {
    console.log('   ✅ dist directory found');
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      console.log('   ✅ index.html found');
    } else {
      console.log('   ❌ index.html NOT found at:', indexPath);
    }

    // Serve static assets (hashed files can be cached aggressively)
    app.use(
      express.static(distDir, {
        maxAge: '1y',
        immutable: true,
      })
    );

    // Serve index.html with no-cache for root
    app.get(['/', '/index.html'], (req, res) => {
      res.set('Cache-Control', 'no-store, max-age=0');
      res.sendFile(path.join(distDir, 'index.html'));
    });

    // SPA fallback only for non-asset, non-API GET requests that accept HTML
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
      // Do not hijack real asset requests (contain a dot extension or /assets)
      if (req.path.includes('.') || req.path.startsWith('/assets')) return next();
      if (!req.accepts('html')) return next();
      res.set('Cache-Control', 'no-store, max-age=0');
      res.sendFile(path.join(distDir, 'index.html'));
    });

    console.log('✅ Static file serving configured for production');
  } else {
    console.log('   ⚠️  dist directory NOT found at:', distDir);
    console.log('   💡 Running in development mode - static files not served');
  }
} catch (e) {
  console.error('❌ Error configuring static file serving:', e);
  console.log('💡 App will continue but static files will not be served');
}

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);

  // Start automated email cron jobs
  try {
    cronService.startAll();
    console.log('✅ Automated email scheduling initialized');
  } catch (error) {
    console.error('⚠️  Failed to start cron jobs:', error);
    console.log('💡 Email notifications will still work via manual triggers');
  }
});

export default app;
