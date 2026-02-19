/**
 * Backend API Server for Susan 21
 * Provides REST API endpoints for PostgreSQL database operations
 * Includes WebSocket support for real-time presence and messaging
 */

import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { emailService, LoginNotificationData, ChatNotificationData, VerificationCodeData } from './services/emailService.js';
import { twilioService } from './services/twilioService.js';
import { createPushNotificationService } from './services/pushNotificationService.js';
import { cronService } from './services/cronService.js';
import { initializePresenceService, getPresenceService } from './services/presenceService.js';
import { createMessagingRoutes } from './routes/messagingRoutes.js';
import { createRoofRoutes } from './routes/roofRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import inspectionPresentationRoutes from './routes/inspectionPresentationRoutes.js';
import hailRoutes from './routes/hailRoutes.js';
import stormMemoryRoutes from './routes/stormMemoryRoutes.js';
import canvassingRoutes from './routes/canvassingRoutes.js';
import checkinRoutes from './routes/checkinRoutes.js';
import impactedAssetRoutes from './routes/impactedAssetRoutes.js';
import pushRoutes from './routes/pushRoutes.js';
import territoryRoutes from './routes/territoryRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import { createLeaderboardRoutes } from './routes/leaderboardRoutes.js';
import { createRepGoalsRoutes } from './routes/repGoalsRoutes.js';
import { createContestRoutes } from './routes/contestRoutes.js';
import { createProfileRoutes } from './routes/profileRoutes.js';
import { createQRAnalyticsRoutes } from './routes/qrAnalyticsRoutes.js';
import { createProfileLeadsRoutes } from './routes/profileLeadsRoutes.js';
import susanRoutes from './routes/susanRoutes.js';
import { createAgreementRoutes } from './routes/agreementRoutes.js';
import { createDocuSealRoutes } from './routes/docusealRoutes.js';
import { createDocumentRoutes } from './routes/documentRoutes.js';
import { hailMapsService } from './services/hailMapsService.js';
import { hailtraceImportService } from './services/hailtraceImportService.js';
import { initSettingsService, getSettingsService } from './services/settingsService.js';
import {
  loadTiersFromDatabase,
  calculateBonusTier as calculateBonusTierAsync,
  calculateBonusTierNumber,
  clearTierCache,
  getAllTiers,
  getDefaultTiers,
  BONUS_TIERS
} from './utils/bonusTiers.js';

const { Pool } = pg;
const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';

// Railway runs behind a proxy/load balancer
app.set('trust proxy', 1);

process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('🚨 Unhandled rejection:', error);
});

httpServer.on('error', (error) => {
  console.error('🚨 HTTP server error:', error);
});

// ES Module __dirname and __filename support
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// AI clients (server-side)
// Railway environment variables support both GOOGLE_AI_API_KEY and GEMINI_API_KEY
const getEnvKey = (key: string) => process.env[key] || process.env[`VITE_${key}`];

const geminiKey = getEnvKey('GOOGLE_AI_API_KEY') || getEnvKey('GEMINI_API_KEY');
const groqKey = getEnvKey('GROQ_API_KEY');
const togetherKey = getEnvKey('TOGETHER_API_KEY');
const hfKey = getEnvKey('HF_API_KEY') || getEnvKey('HUGGINGFACE_API_KEY');

// Initialize Gemini client if API key is available
const geminiClient = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;

// Log AI provider availability at startup (production safe)
console.log('🤖 AI Providers Status:');
console.log(`  - Gemini: ${geminiClient ? '✅ Available' : '❌ Not configured'}`);
console.log(`  - Groq: ${groqKey ? '✅ Available' : '❌ Not configured'}`);
console.log(`  - Together: ${togetherKey ? '✅ Available' : '❌ Not configured'}`);
console.log(`  - Hugging Face: ${hfKey ? '✅ Available' : '❌ Not configured'}`);

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

// Make pool available to routes via app.get('pool')
app.set('pool', pool);

// Initialize settings service
initSettingsService(pool);

// Initialize Twilio service with pool for rate limiting and logging
twilioService.setPool(pool);

// Initialize Push Notification Service
const pushNotificationService = createPushNotificationService(pool);
app.set('pushNotificationService', pushNotificationService);
pushNotificationService.initializeFirebase().then((initialized) => {
  if (initialized) {
    console.log('✅ Push notification service initialized');
  } else {
    console.log('⚠️ Push notifications unavailable (Firebase credentials not configured)');
  }
}).catch((err: any) => {
  console.log('⚠️ Push notifications unavailable:', err.message);
});

// Initialize HailTrace import service with auto-watching
hailtraceImportService.initialize(pool);
try {
  hailtraceImportService.startWatching(60000);
  console.log('✅ HailTrace import service initialized (watching every 60s)');
} catch {
  console.log('✅ HailTrace import service initialized (watching disabled - export dir not found)');
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://aistudiocdn.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "https://a.tile.openstreetmap.org", "https://b.tile.openstreetmap.org", "https://c.tile.openstreetmap.org"],
      connectSrc: [
        "'self'",
        "wss:",
        "ws:",
        "https://generativelanguage.googleapis.com",
        "https://api.groq.com",
        "https://api.together.xyz",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
        "https://nominatim.openstreetmap.org",
        "https://api.interactivehailmaps.com",
        "https://maps.interactivehailmaps.com",
        "https://a.tile.openstreetmap.org",
        "https://b.tile.openstreetmap.org",
        "https://c.tile.openstreetmap.org",
        "https://*.tile.openstreetmap.org"
      ],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:", "https://sa21.up.railway.app", "https://a21.up.railway.app"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://player.vimeo.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration - restrict to known origins
const allowedOrigins = [
  'https://a21.up.railway.app',
  'https://sa21.up.railway.app',
  'http://localhost:5173',
  'http://localhost:5176',
  'http://localhost:3001',
  'http://localhost:3000',
  'capacitor://localhost',  // iOS Capacitor app
  'ionic://localhost'       // Alternative Capacitor origin
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

// Body parsers - increased limit for photo uploads (base64 encoded)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting - General API protection
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs (increased from 100)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const path = req.path || '';
    // Skip rate limiting for high-frequency read endpoints
    if (path === '/health' || path === '/api/health') return true;
    if (path.startsWith('/leaderboard') || path.startsWith('/api/leaderboard')) return true;
    if (path === '/users/me' || path === '/api/users/me') return true;
    // Original skips for GET requests
    if (req.method !== 'GET') return false;
    return (
      path === '/chat/learning' ||
      path === '/learning/global' ||
      path.startsWith('/chat/feedback/followups')
    );
  },
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

// Very strict rate limiting for verification codes (prevent abuse)
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 verification code requests per 15 minutes
  message: 'Too many verification code requests, please try again later.',
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
app.use('/api/auth/send-verification-code', verificationLimiter);

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

const GLOBAL_LEARNING_THRESHOLD = parseInt(process.env.GLOBAL_LEARNING_THRESHOLD || '2', 10);
const NULL_SCOPE_VALUES = new Set(['all', 'any', 'n/a', 'na', 'none', 'unknown', 'unsure', 'tbd', '-']);

function normalizeScopeValue(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  if (!cleaned) return null;
  if (NULL_SCOPE_VALUES.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function normalizeLearningText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildScopeKey(state?: string | null, insurer?: string | null, adjuster?: string | null): string {
  const s = (state || '').toLowerCase().trim();
  const i = (insurer || '').toLowerCase().trim();
  const a = (adjuster || '').toLowerCase().trim();
  return `${s}|${i}|${a}`;
}

function isGlobalLearningEligible(text: string): boolean {
  const lowered = text.toLowerCase();
  if (
    /call me|address me|my name is|remind me|every morning|daily reminder|text me|ping me|my schedule|my preference/.test(lowered)
  ) {
    return false;
  }
  return text.trim().length >= 10;
}

function buildLearningCandidate(comment?: string | null, responseExcerpt?: string | null): string {
  if (comment && comment.trim()) return comment.trim();
  if (responseExcerpt && responseExcerpt.trim()) {
    const firstLine = responseExcerpt.split('\n').map(line => line.trim()).find(line => line.length > 10);
    return (firstLine || responseExcerpt).slice(0, 240).trim();
  }
  return '';
}

async function getUserMemoryValue(userId: string, category: string): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT value
       FROM user_memory
       WHERE user_id = $1 AND category = $2
       ORDER BY confidence DESC, last_updated DESC
       LIMIT 1`,
      [userId, category]
    );
    return result.rows[0]?.value || null;
  } catch (error) {
    return null;
  }
}

async function callGroq(messages: Array<{ role: string; content: string }>) {
  const apiKey = groqKey;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.2,
      max_tokens: 2048
    }),
    signal: AbortSignal.timeout(60000)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callTogether(messages: Array<{ role: string; content: string }>) {
  const apiKey = togetherKey;
  if (!apiKey) throw new Error('TOGETHER_API_KEY not set');

  const response = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.TOGETHER_MODEL || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      messages,
      temperature: 0.2,
      max_tokens: 2048
    }),
    signal: AbortSignal.timeout(60000)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Together error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(prompt: string) {
  if (!geminiClient) throw new Error('GEMINI_API_KEY not set');

  const result = await geminiClient.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });

  const text = (result as any)?.text;
  if (typeof text === 'string' && text.trim()) return text;

  const parts = (result as any)?.candidates?.[0]?.content?.parts || [];
  return parts.map((p: any) => p.text || '').join('') || '';
}

async function generateDocumentAnalysis(prompt: string) {
  const messages = [{ role: 'user', content: prompt }];

  // Try providers in order: Groq (fastest), Together, Gemini
  if (groqKey) {
    return { content: await callGroq(messages), provider: 'groq' };
  }

  if (togetherKey) {
    return { content: await callTogether(messages), provider: 'together' };
  }

  if (geminiKey && geminiClient) {
    return { content: await callGemini(prompt), provider: 'gemini' };
  }

  throw new Error('No AI providers configured. Please set GOOGLE_AI_API_KEY, GROQ_API_KEY, or TOGETHER_API_KEY in Railway environment variables.');
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
      groq: Boolean(groqKey),
      together: Boolean(togetherKey),
      huggingface: Boolean(hfKey),
      gemini: Boolean(geminiKey),
      anyConfigured: Boolean(groqKey || togetherKey || hfKey || geminiKey),
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

// ============================================================================
// AI GENERATION ENDPOINT - Server-side AI generation for production
// ============================================================================

app.post('/api/ai/generate', async (req, res) => {
  try {
    const { messages, options } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Try providers in order: Groq (fastest), Together, Gemini, HuggingFace
    let content = '';
    let provider = '';
    let model = '';

    // Convert messages to the format each provider expects
    const formattedMessages = messages.map((m: any) => ({
      role: m.role || 'user',
      content: m.content || ''
    }));

    // Try Groq first (fastest)
    if (groqKey) {
      try {
        content = await callGroq(formattedMessages);
        provider = 'groq';
        model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
      } catch (groqError) {
        console.warn('[AI] Groq failed, trying next provider:', (groqError as Error).message);
      }
    }

    // Try Together next
    if (!content && togetherKey) {
      try {
        content = await callTogether(formattedMessages);
        provider = 'together';
        model = process.env.TOGETHER_MODEL || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo';
      } catch (togetherError) {
        console.warn('[AI] Together failed, trying next provider:', (togetherError as Error).message);
      }
    }

    // Try Gemini
    if (!content && geminiKey) {
      try {
        // Gemini takes a simple prompt, combine messages
        const prompt = formattedMessages.map((m: any) =>
          `${m.role === 'system' ? 'Instructions: ' : m.role === 'user' ? 'User: ' : 'Assistant: '}${m.content}`
        ).join('\n\n');
        content = await callGemini(prompt);
        provider = 'gemini';
        model = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
      } catch (geminiError) {
        console.warn('[AI] Gemini failed:', (geminiError as Error).message);
      }
    }

    // Try HuggingFace as last resort
    if (!content && hfKey) {
      try {
        const hfResponse = await fetch('https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hfKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: formattedMessages.map((m: any) => m.content).join('\n'),
            parameters: { max_new_tokens: 1024, temperature: 0.7 }
          }),
          signal: AbortSignal.timeout(60000)
        });

        if (hfResponse.ok) {
          const hfData = await hfResponse.json();
          content = hfData[0]?.generated_text || '';
          provider = 'huggingface';
          model = 'meta-llama/Llama-3.2-3B-Instruct';
        }
      } catch (hfError) {
        console.warn('[AI] HuggingFace failed:', (hfError as Error).message);
      }
    }

    if (!content) {
      return res.status(503).json({
        error: 'No AI providers available. Please check server configuration.',
        providers: {
          groq: Boolean(groqKey),
          together: Boolean(togetherKey),
          gemini: Boolean(geminiKey),
          huggingface: Boolean(hfKey)
        }
      });
    }

    res.json({
      content,
      provider,
      model,
      tokensUsed: content.length // Rough estimate
    });

  } catch (error) {
    console.error('[AI] Generation error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Register hail history routes early to avoid proxy ordering issues
app.use('/api/hail', hailRoutes);

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

// Update user phone number
app.post('/api/users/phone', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const result = await pool.query(
      `UPDATE users
       SET phone_number = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $2
       RETURNING id, email, name, phone_number, sms_alerts_enabled`,
      [phoneNumber, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating phone number:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update SMS alerts preference
app.put('/api/users/sms-alerts', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Enabled must be a boolean value' });
    }

    const result = await pool.query(
      `UPDATE users
       SET sms_alerts_enabled = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $2
       RETURNING id, email, name, phone_number, sms_alerts_enabled`,
      [enabled, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating SMS alerts preference:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Send test SMS
app.post('/api/users/test-sms', async (req, res) => {
  try {
    const email = getRequestEmail(req);

    // Get user's phone number
    const userResult = await pool.query(
      'SELECT id, phone_number FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (!user.phone_number) {
      return res.status(400).json({ error: 'No phone number configured' });
    }

    // Check if Twilio is configured
    if (!twilioService.isConfigured()) {
      return res.status(503).json({
        error: 'SMS service not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables.'
      });
    }

    // Send test SMS
    const result = await twilioService.sendTestSMS(user.phone_number);

    if (result.success) {
      res.json({
        success: true,
        message: 'Test SMS sent successfully',
        messageSid: result.messageSid
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error sending test SMS:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get Twilio service status
app.get('/api/sms/status', async (req, res) => {
  try {
    const status = twilioService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting SMS status:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete user account and all associated data (GDPR/CCPA compliance)
app.delete('/api/users/me', async (req, res) => {
  const client = await pool.connect();

  try {
    const email = getRequestEmail(req);

    if (!email || email === 'demo@roofer.com') {
      return res.status(400).json({ error: 'Cannot delete demo account' });
    }

    // Get user ID
    const userResult = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    console.log(`🗑️ Starting account deletion for user ${email} (ID: ${userId})`);

    // Begin transaction
    await client.query('BEGIN');

    // Delete all user-related data in order of dependencies
    // Complete list of all tables with user_id foreign key or user data
    const deletions = [
      // Core activity tables (CASCADE delete but explicit for logging)
      { table: 'chat_history', deleted: 0 },
      { table: 'email_generation_log', deleted: 0 },
      { table: 'transcriptions', deleted: 0 },
      { table: 'document_uploads', deleted: 0 },
      { table: 'document_views', deleted: 0 },
      { table: 'document_favorites', deleted: 0 },
      { table: 'live_susan_sessions', deleted: 0 },
      { table: 'user_activity_log', deleted: 0 },
      // Additional tables from migrations
      { table: 'concerning_chats', deleted: 0 },  // Migration 003
      { table: 'image_analysis_log', deleted: 0 }, // schema.sql
      { table: 'user_preferences', deleted: 0 },   // schema.sql
      { table: 'search_analytics', deleted: 0 },   // schema.sql (SET NULL but delete for privacy)
      { table: 'api_usage_log', deleted: 0 },      // Migration 005
      { table: 'user_budgets', deleted: 0 },       // Migration 005
      { table: 'budget_alerts', deleted: 0 },      // Migration 005
      { table: 'rag_analytics', deleted: 0 },      // Migration 004 (SET NULL but delete for privacy)
    ];

    for (const deletion of deletions) {
      try {
        const result = await client.query(
          `DELETE FROM ${deletion.table} WHERE user_id = $1`,
          [userId]
        );
        deletion.deleted = result.rowCount || 0;
        console.log(`  ✓ Deleted ${deletion.deleted} rows from ${deletion.table}`);
      } catch (err) {
        // Table might not exist - log but continue
        console.log(`  ⚠️ Could not delete from ${deletion.table}: ${(err as Error).message}`);
      }
    }

    // Finally, delete the user record
    const userDeletion = await client.query(
      'DELETE FROM users WHERE id = $1 RETURNING email',
      [userId]
    );

    // Commit transaction
    await client.query('COMMIT');

    console.log(`✅ Account deletion completed for ${email}`);

    res.json({
      success: true,
      message: 'Account and all associated data have been permanently deleted',
      deletedEmail: userDeletion.rows[0]?.email,
      deletedRecords: deletions.reduce((sum, d) => sum + d.deleted, 0)
    });
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Error deleting user account:', error);
    res.status(500).json({ error: 'Failed to delete account. Please try again.' });
  } finally {
    client.release();
  }
});

// Export user data (GDPR/CCPA compliance)
app.get('/api/users/me/export', async (req, res) => {
  try {
    const email = getRequestEmail(req);

    if (!email) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user info
    const userResult = await pool.query(
      'SELECT id, email, name, role, state, created_at FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    const user = userResult.rows[0];

    // Gather all user data from all tables
    // Helper to safely query a table (returns empty array if table doesn't exist)
    const safeQuery = async (query: string, params: any[]) => {
      try {
        return await pool.query(query, params);
      } catch (err) {
        console.log(`Export query failed (table may not exist): ${(err as Error).message}`);
        return { rows: [], rowCount: 0 };
      }
    };

    const [
      chatHistory,
      emailLogs,
      transcriptions,
      documentUploads,
      documentViews,
      favorites,
      susanSessions,
      activityLog,
      concerningChats,
      imageAnalysis,
      preferences,
      searchAnalytics,
      apiUsage,
      budgets,
      budgetAlerts,
      ragAnalytics
    ] = await Promise.all([
      // Core tables
      pool.query('SELECT id, message_id, sender, content, state, created_at FROM chat_history WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT id, email_type, recipient_email, subject, created_at FROM email_generation_log WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      safeQuery('SELECT id, audio_duration_seconds, transcription_text, word_count, provider, state, created_at FROM transcriptions WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      safeQuery('SELECT id, file_name, file_type, file_size_bytes, analysis_type, state, created_at FROM document_uploads WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT document_path, view_count, last_viewed_at FROM document_views WHERE user_id = $1', [userId]),
      pool.query('SELECT document_path, created_at FROM document_favorites WHERE user_id = $1', [userId]),
      safeQuery('SELECT id, started_at, ended_at, duration_seconds, message_count FROM live_susan_sessions WHERE user_id = $1 ORDER BY started_at DESC', [userId]),
      safeQuery('SELECT activity_type, activity_data, created_at FROM user_activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000', [userId]),
      // Additional tables from migrations
      safeQuery('SELECT id, concern_type, severity, flagged_content, detection_reason, flagged_at, reviewed FROM concerning_chats WHERE user_id = $1 ORDER BY flagged_at DESC', [userId]),
      safeQuery('SELECT id, analysis_type, provider, created_at FROM image_analysis_log WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      safeQuery('SELECT preferred_state, preferred_ai_provider, theme, notifications_enabled, created_at FROM user_preferences WHERE user_id = $1', [userId]),
      safeQuery('SELECT query, results_count, selected_document, state, created_at FROM search_analytics WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [userId]),
      safeQuery('SELECT provider_name, service_type, model_name, input_tokens, output_tokens, estimated_cost, feature_used, created_at FROM api_usage_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000', [userId]),
      safeQuery('SELECT monthly_budget, current_month_spend, last_reset_date, created_at FROM user_budgets WHERE user_id = $1', [userId]),
      safeQuery('SELECT alert_type, threshold_percentage, current_spend, budget_limit, triggered_at, acknowledged FROM budget_alerts WHERE user_id = $1 ORDER BY triggered_at DESC', [userId]),
      safeQuery('SELECT query_text, num_results, response_time_ms, state, created_at FROM rag_analytics WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [userId])
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        state: user.state,
        accountCreated: user.created_at
      },
      data: {
        chatHistory: chatHistory.rows,
        emailsGenerated: emailLogs.rows,
        transcriptions: transcriptions.rows,
        documentUploads: documentUploads.rows,
        documentViews: documentViews.rows,
        favorites: favorites.rows,
        liveSusanSessions: susanSessions.rows,
        activityLog: activityLog.rows,
        concerningChats: concerningChats.rows,
        imageAnalysis: imageAnalysis.rows,
        preferences: preferences.rows[0] || null,
        searchAnalytics: searchAnalytics.rows,
        apiUsage: apiUsage.rows,
        budgets: budgets.rows[0] || null,
        budgetAlerts: budgetAlerts.rows,
        ragAnalytics: ragAnalytics.rows
      },
      statistics: {
        totalChatMessages: chatHistory.rowCount,
        totalEmailsGenerated: emailLogs.rowCount,
        totalTranscriptions: transcriptions.rowCount,
        totalDocumentUploads: documentUploads.rowCount,
        totalDocumentViews: documentViews.rowCount,
        totalFavorites: favorites.rowCount,
        totalSusanSessions: susanSessions.rowCount,
        totalApiCalls: apiUsage.rowCount,
        totalImageAnalyses: imageAnalysis.rowCount
      }
    };

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="susan-ai-data-export-${new Date().toISOString().split('T')[0]}.json"`);

    res.json(exportData);
  } catch (error) {
    console.error('Error exporting user data:', error);
    res.status(500).json({ error: 'Failed to export data. Please try again.' });
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

// Get chat sessions (grouped conversations)
app.get('/api/chat/sessions', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const email = getRequestEmail(req);
    const userId = await getOrCreateUserIdByEmail(email);

    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    console.log('[API] 📋 Fetching chat sessions for user:', email);

    // Group messages by session_id and get session metadata
    const result = await pool.query(`
      SELECT
        session_id,
        user_id,
        MIN(created_at) as first_message_at,
        MAX(created_at) as last_message_at,
        COUNT(*) as message_count,
        MAX(CASE WHEN sender = 'user' THEN content END) as title,
        MAX(CASE WHEN sender = 'user' THEN content END) as preview,
        MAX(state) as state
      FROM chat_history
      WHERE user_id = $1 AND session_id IS NOT NULL
      GROUP BY session_id, user_id
      ORDER BY MAX(created_at) DESC
      LIMIT $2
    `, [userId, limit]);

    const sessions = result.rows.map(row => ({
      session_id: row.session_id,
      user_id: row.user_id,
      title: row.title ? row.title.slice(0, 50) : 'New Chat',
      preview: row.preview ? row.preview.slice(0, 100) : '',
      message_count: parseInt(row.message_count),
      first_message_at: row.first_message_at,
      last_message_at: row.last_message_at,
      state: row.state
    }));

    console.log('[API] ✅ Found', sessions.length, 'chat sessions');
    res.json(sessions);
  } catch (error) {
    console.error('[API] ❌ Error fetching chat sessions:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get a specific chat session with all messages
app.get('/api/chat/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const email = getRequestEmail(req);
    const userId = await getOrCreateUserIdByEmail(email);

    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    console.log('[API] 📋 Fetching session:', sessionId, 'for user:', email);

    // Get all messages for this session
    const result = await pool.query(`
      SELECT * FROM chat_history
      WHERE user_id = $1 AND session_id = $2
      ORDER BY created_at ASC
    `, [userId, sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Build session object
    const messages = result.rows.map(row => ({
      id: row.message_id,
      text: row.content,
      sender: row.sender,
      timestamp: row.created_at,
      state: row.state,
      provider: row.provider,
      sources: row.sources
    }));

    const session = {
      session_id: sessionId,
      user_id: userId,
      title: messages.find(m => m.sender === 'user')?.text.slice(0, 50) || 'New Chat',
      preview: messages.find(m => m.sender === 'user')?.text.slice(0, 100) || '',
      message_count: messages.length,
      first_message_at: result.rows[0].created_at,
      last_message_at: result.rows[result.rows.length - 1].created_at,
      state: result.rows.find(r => r.state)?.state,
      messages
    };

    console.log('[API] ✅ Retrieved session with', messages.length, 'messages');
    res.json(session);
  } catch (error) {
    console.error('[API] ❌ Error fetching session:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete a chat session
app.delete('/api/chat/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const email = getRequestEmail(req);
    const userId = await getOrCreateUserIdByEmail(email);

    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    console.log('[API] 🗑️ Deleting session:', sessionId, 'for user:', email);

    const result = await pool.query(`
      DELETE FROM chat_history
      WHERE user_id = $1 AND session_id = $2
    `, [userId, sessionId]);

    console.log('[API] ✅ Deleted', result.rowCount, 'messages');
    res.json({ success: true, deleted: result.rowCount });
  } catch (error) {
    console.error('[API] ❌ Error deleting session:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Save feedback on Susan responses
app.post('/api/chat/feedback', async (req, res) => {
  try {
    const {
      message_id,
      session_id,
      rating,
      tags,
      comment,
      response_excerpt,
      context_state,
      context_insurer,
      context_adjuster
    } = req.body;
    const email = getRequestEmail(req);
    const userId = await getOrCreateUserIdByEmail(email);

    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (![1, -1].includes(rating)) {
      return res.status(400).json({ error: 'Rating must be 1 or -1' });
    }

    const normalizedStateRaw = normalizeScopeValue(context_state);
    let normalizedState = normalizedStateRaw ? normalizedStateRaw.toUpperCase() : null;
    let normalizedInsurer = normalizeScopeValue(context_insurer);
    const normalizedAdjuster = normalizeScopeValue(context_adjuster);

    if (!normalizedState) {
      const memoryState = await getUserMemoryValue(userId, 'state');
      if (memoryState) normalizedState = memoryState.toUpperCase();
    }
    if (!normalizedInsurer) {
      const memoryInsurer = await getUserMemoryValue(userId, 'insurer');
      if (memoryInsurer) normalizedInsurer = memoryInsurer;
    }

    const result = await pool.query(
      `INSERT INTO chat_feedback
       (user_id, session_id, message_id, rating, tags, comment, response_excerpt, context_state, context_insurer, context_adjuster)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId,
        session_id || null,
        message_id || null,
        rating,
        tags && Array.isArray(tags) ? tags : null,
        comment || null,
        response_excerpt || null,
        normalizedState,
        normalizedInsurer,
        normalizedAdjuster
      ]
    );

    // Schedule follow-up reminders at 1 and 2 weeks
    try {
      const feedbackId = result.rows[0]?.id;
      const now = new Date();
      if (feedbackId) {
        const due7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const due14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        await pool.query(
          `INSERT INTO feedback_followups (feedback_id, user_id, reminder_number, due_at)
           VALUES ($1, $2, 1, $3), ($1, $2, 2, $4)`,
          [feedbackId, userId, due7, due14]
        );
      }
    } catch (reminderError) {
      console.warn('Failed to schedule feedback follow-ups:', reminderError);
    }

    // Promote global learning candidate when helpful
    try {
      if (rating === 1) {
        const candidate = buildLearningCandidate(comment, response_excerpt);
        if (candidate && isGlobalLearningEligible(candidate)) {
          const normalizedKey = normalizeLearningText(candidate);
          const scopeKey = buildScopeKey(normalizedState, normalizedInsurer, normalizedAdjuster);

          const existing = await pool.query(
            `SELECT id, helpful_count, status
             FROM global_learnings
             WHERE normalized_key = $1 AND scope_key = $2`,
            [normalizedKey, scopeKey]
          );

          if (existing.rows.length > 0) {
            const current = existing.rows[0];
            const nextHelpful = (current.helpful_count || 0) + 1;
            const nextStatus = current.status === 'approved' || current.status === 'rejected'
              ? current.status
              : nextHelpful >= GLOBAL_LEARNING_THRESHOLD
                ? 'ready'
                : 'pending';
            await pool.query(
              `UPDATE global_learnings
               SET helpful_count = helpful_count + 1,
                   total_count = total_count + 1,
                   last_feedback_at = NOW(),
                   status = $2,
                   updated_at = NOW()
               WHERE id = $1`,
              [current.id, nextStatus]
            );
            await pool.query(
              `INSERT INTO global_learning_sources (global_learning_id, feedback_id)
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [current.id, result.rows[0].id]
            );
          } else {
            const status = GLOBAL_LEARNING_THRESHOLD <= 1 ? 'ready' : 'pending';
            const insert = await pool.query(
              `INSERT INTO global_learnings
               (normalized_key, scope_key, scope_state, scope_insurer, scope_adjuster, content, status, helpful_count, total_count, last_feedback_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 1, NOW())
               RETURNING id`,
              [
                normalizedKey,
                scopeKey,
                normalizedState,
                normalizedInsurer,
                normalizedAdjuster,
                candidate,
                status
              ]
            );
            if (insert.rows[0]?.id) {
              await pool.query(
                `INSERT INTO global_learning_sources (global_learning_id, feedback_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [insert.rows[0].id, result.rows[0].id]
              );
            }
          }
        }
      }
    } catch (learningError) {
      console.warn('Global learning update failed:', learningError);
    }

    res.json({ success: true, feedback: result.rows[0] });
  } catch (error) {
    console.error('Error saving chat feedback:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get learning summary from feedback
app.get('/api/chat/learning', async (req, res) => {
  try {
    const windowDays = parseInt((req.query.window_days as string) || '45');
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [positiveTags, negativeTags, recentWins, recentIssues, totals] = await Promise.all([
      pool.query(
        `SELECT tag, COUNT(*)::int as count
         FROM (
           SELECT unnest(tags) as tag
           FROM chat_feedback
           WHERE rating = 1 AND tags IS NOT NULL AND created_at >= $1
         ) t
         GROUP BY tag
         ORDER BY count DESC
         LIMIT 6`,
        [windowStart]
      ),
      pool.query(
        `SELECT tag, COUNT(*)::int as count
         FROM (
           SELECT unnest(tags) as tag
           FROM chat_feedback
           WHERE rating = -1 AND tags IS NOT NULL AND created_at >= $1
         ) t
         GROUP BY tag
         ORDER BY count DESC
         LIMIT 6`,
        [windowStart]
      ),
      pool.query(
        `SELECT comment, response_excerpt, created_at
         FROM chat_feedback
         WHERE rating = 1 AND comment IS NOT NULL AND created_at >= $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [windowStart]
      ),
      pool.query(
        `SELECT comment, response_excerpt, created_at
         FROM chat_feedback
         WHERE rating = -1 AND comment IS NOT NULL AND created_at >= $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [windowStart]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= $1)::int as total_last7,
           COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $1)::int as total_prev7,
           COUNT(*) FILTER (WHERE rating = 1 AND created_at >= $1)::int as positive_last7,
           COUNT(*) FILTER (WHERE rating = -1 AND created_at >= $1)::int as negative_last7,
           COUNT(*) FILTER (WHERE rating = 1 AND created_at >= $2 AND created_at < $1)::int as positive_prev7,
           COUNT(*) FILTER (WHERE rating = -1 AND created_at >= $2 AND created_at < $1)::int as negative_prev7,
           COUNT(*) FILTER (WHERE created_at >= $3)::int as total_window,
           COUNT(*) FILTER (WHERE rating = 1 AND created_at >= $3)::int as positive_window,
           COUNT(*) FILTER (WHERE rating = -1 AND created_at >= $3)::int as negative_window
         FROM chat_feedback`,
        [weekStart, prevWeekStart, windowStart]
      )
    ]);

    const totalsRow = totals.rows[0] || {};

    res.json({
      success: true,
      window_days: windowDays,
      positive_tags: positiveTags.rows,
      negative_tags: negativeTags.rows,
      recent_wins: recentWins.rows,
      recent_issues: recentIssues.rows,
      totals: {
        total_window: totalsRow.total_window || 0,
        positive_window: totalsRow.positive_window || 0,
        negative_window: totalsRow.negative_window || 0
      },
      weekly: {
        total_last7: totalsRow.total_last7 || 0,
        total_prev7: totalsRow.total_prev7 || 0,
        positive_last7: totalsRow.positive_last7 || 0,
        negative_last7: totalsRow.negative_last7 || 0,
        positive_prev7: totalsRow.positive_prev7 || 0,
        negative_prev7: totalsRow.negative_prev7 || 0
      }
    });
  } catch (error) {
    console.error('Error fetching learning summary:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get pending feedback follow-ups
app.get('/api/chat/feedback/followups', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const userId = await getOrCreateUserIdByEmail(email);
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    const status = (req.query.status as string) || 'pending';
    const params: any[] = [userId];
    let where = 'f.user_id = $1';

    if (status !== 'all') {
      params.push(status);
      where += ` AND f.status = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT f.*, cf.comment, cf.response_excerpt, cf.context_state, cf.context_insurer, cf.context_adjuster
       FROM feedback_followups f
       JOIN chat_feedback cf ON cf.id = f.feedback_id
       WHERE ${where}
       ORDER BY f.due_at ASC
       LIMIT 50`,
      params
    );

    res.json({ followups: result.rows });
  } catch (error) {
    console.error('Error fetching feedback followups:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Submit outcome for a feedback item (completes follow-ups)
app.post('/api/chat/feedback/:id/outcome', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const userId = await getOrCreateUserIdByEmail(email);
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { id } = req.params;
    const { outcome_status, outcome_notes } = req.body as { outcome_status?: string; outcome_notes?: string };
    if (!outcome_status) {
      return res.status(400).json({ error: 'Outcome status is required' });
    }

    await pool.query(
      `UPDATE chat_feedback
       SET outcome_status = $1,
           outcome_notes = $2,
           outcome_recorded_at = NOW()
       WHERE id = $3 AND user_id = $4`,
      [outcome_status, outcome_notes || null, id, userId]
    );

    await pool.query(
      `UPDATE feedback_followups
       SET status = 'completed', sent_at = COALESCE(sent_at, NOW())
       WHERE feedback_id = $1 AND user_id = $2`,
      [id, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating feedback outcome:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get approved global learnings (context-aware)
app.get('/api/learning/global', async (req, res) => {
  try {
    const state = (req.query.state as string) || null;
    const insurer = (req.query.insurer as string) || null;
    const adjuster = (req.query.adjuster as string) || null;
    const limit = Math.min(parseInt((req.query.limit as string) || '6', 10), 20);

    const params: any[] = ['approved'];
    let where = `status = $1`;

    if (state) {
      params.push(state.toUpperCase());
      where += ` AND (scope_state IS NULL OR scope_state = $${params.length})`;
    } else {
      where += ` AND scope_state IS NULL`;
    }

    if (insurer) {
      params.push(insurer.toLowerCase());
      where += ` AND (scope_insurer IS NULL OR LOWER(scope_insurer) = $${params.length})`;
    } else {
      where += ` AND scope_insurer IS NULL`;
    }

    if (adjuster) {
      params.push(adjuster.toLowerCase());
      where += ` AND (scope_adjuster IS NULL OR LOWER(scope_adjuster) = $${params.length})`;
    } else {
      where += ` AND scope_adjuster IS NULL`;
    }

    params.push(limit);
    const result = await pool.query(
      `SELECT id, content, scope_state, scope_insurer, scope_adjuster, helpful_count, updated_at
       FROM global_learnings
       WHERE ${where}
       ORDER BY helpful_count DESC, updated_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({ learnings: result.rows });
  } catch (error) {
    console.error('Error fetching global learnings:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Admin: list global learning candidates
app.get('/api/admin/learning', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const status = (req.query.status as string) || 'ready';
    const params: any[] = [];
    let where = '';
    if (status !== 'all') {
      params.push(status);
      where = `WHERE status = $1`;
    }

    const result = await pool.query(
      `SELECT id, content, scope_state, scope_insurer, scope_adjuster, helpful_count, total_count, status, updated_at
       FROM global_learnings
       ${where}
       ORDER BY updated_at DESC
       LIMIT 50`,
      params
    );

    res.json({ candidates: result.rows });
  } catch (error) {
    console.error('Error fetching global learning candidates:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/admin/learning/:id/approve', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const adminId = await getOrCreateUserIdByEmail(email);
    await pool.query(
      `UPDATE global_learnings
       SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id, adminId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error approving global learning:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/admin/learning/:id/reject', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    await pool.query(
      `UPDATE global_learnings
       SET status = 'rejected', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error rejecting global learning:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/admin/learning/:id/update', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { content, scope_state, scope_insurer, scope_adjuster } = req.body || {};

    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const normalizedStateRaw = normalizeScopeValue(scope_state);
    const normalizedState = normalizedStateRaw ? normalizedStateRaw.toUpperCase() : null;
    const normalizedInsurer = normalizeScopeValue(scope_insurer);
    const normalizedAdjuster = normalizeScopeValue(scope_adjuster);

    const normalizedKey = normalizeLearningText(String(content));
    const scopeKey = buildScopeKey(normalizedState, normalizedInsurer, normalizedAdjuster);

    const conflict = await pool.query(
      `SELECT id FROM global_learnings
       WHERE normalized_key = $1 AND scope_key = $2 AND id <> $3`,
      [normalizedKey, scopeKey, id]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: 'A learning with this content and scope already exists' });
    }

    const result = await pool.query(
      `UPDATE global_learnings
       SET content = $2,
           normalized_key = $3,
           scope_state = $4,
           scope_insurer = $5,
           scope_adjuster = $6,
           scope_key = $7,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, String(content).trim(), normalizedKey, normalizedState, normalizedInsurer, normalizedAdjuster, scopeKey]
    );

    res.json({ success: true, learning: result.rows[0] });
  } catch (error) {
    console.error('Error updating global learning:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/admin/learning/:id/disable', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    await pool.query(
      `UPDATE global_learnings
       SET status = 'disabled', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error disabling global learning:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/admin/learning/:id/enable', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    await pool.query(
      `UPDATE global_learnings
       SET status = 'approved', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error enabling global learning:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/admin/learning/merge', async (req, res) => {
  const client = await pool.connect();
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    if (!adminCheck) {
      client.release();
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { source_id, target_id, content } = req.body || {};
    if (!source_id || !target_id || source_id === target_id) {
      client.release();
      return res.status(400).json({ error: 'source_id and target_id are required' });
    }

    await client.query('BEGIN');
    const source = await client.query('SELECT * FROM global_learnings WHERE id = $1', [source_id]);
    const target = await client.query('SELECT * FROM global_learnings WHERE id = $1', [target_id]);

    if (source.rows.length === 0 || target.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Learning not found' });
    }

    const mergedContent = String(content || target.rows[0].content).trim();
    const normalizedKey = normalizeLearningText(mergedContent);
    const scopeKey = buildScopeKey(target.rows[0].scope_state, target.rows[0].scope_insurer, target.rows[0].scope_adjuster);

    const conflict = await client.query(
      `SELECT id FROM global_learnings
       WHERE normalized_key = $1 AND scope_key = $2 AND id <> $3`,
      [normalizedKey, scopeKey, target_id]
    );
    if (conflict.rows.length > 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({ error: 'A learning with this content and scope already exists' });
    }

    await client.query(
      `UPDATE global_learnings
       SET content = $2,
           normalized_key = $3,
           helpful_count = COALESCE(helpful_count, 0) + $4,
           total_count = COALESCE(total_count, 0) + $5,
           updated_at = NOW()
       WHERE id = $1`,
      [
        target_id,
        mergedContent,
        normalizedKey,
        Number(source.rows[0].helpful_count || 0),
        Number(source.rows[0].total_count || 0)
      ]
    );

    await client.query(
      `UPDATE global_learning_sources
       SET global_learning_id = $1
       WHERE global_learning_id = $2`,
      [target_id, source_id]
    );

    await client.query('DELETE FROM global_learnings WHERE id = $1', [source_id]);

    await client.query('COMMIT');
    client.release();
    res.json({ success: true });
  } catch (error) {
    client.release();
    console.error('Error merging global learnings:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================================
// DOCUMENT TRACKING ENDPOINTS
// ============================================================================

// Analyze document text with server-side AI (avoids browser CORS issues)
app.post('/api/documents/analyze', async (req, res) => {
  try {
    const { prompt } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required for analysis' });
    }

    const trimmed = prompt.trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Prompt is empty' });
    }

    const result = await generateDocumentAnalysis(trimmed);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error running document analysis:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

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
// AUTHENTICATION ENDPOINTS
// ============================================================================

// In-memory verification code storage (with expiration)
const verificationCodes = new Map<string, { code: string; expiresAt: number; name?: string }>();

// Clean up expired codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (now > data.expiresAt) {
      verificationCodes.delete(email);
    }
  }
}, 5 * 60 * 1000);

// Generate a 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Email domain validation — Roof-ER internal tool
// Add additional domains via ALLOWED_EMAIL_DOMAINS env var (comma-separated)
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || 'theroofdocs.com').split(',').map(d => d.trim().toLowerCase());
const DEMO_EMAILS = ['demo@roofer.com'];
const isAllowedEmailDomain = (email: string): boolean => {
  const normalizedEmail = email.trim().toLowerCase();
  if (DEMO_EMAILS.includes(normalizedEmail)) return true;
  const domain = normalizedEmail.split('@')[1]?.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
};

// Check email endpoint - determines if user exists (login) or needs to signup
app.post('/api/auth/check-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address'
      });
    }

    // Domain validation
    if (!isAllowedEmailDomain(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please use your @theroofdocs.com email address',
        canSignup: false
      });
    }

    // Check if user exists in database
    const normalizedEmail = email.toLowerCase();
    const result = await pool.query(
      'SELECT id, name, email FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    if (result.rows.length > 0) {
      // User exists - login flow
      const user = result.rows[0];
      res.json({
        success: true,
        exists: true,
        name: user.name,
        canSignup: false
      });
    } else {
      // New user - signup flow
      res.json({
        success: true,
        exists: false,
        canSignup: true
      });
    }
  } catch (error) {
    console.error('Error checking email:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while checking email'
    });
  }
});

// Send verification code endpoint
app.post('/api/auth/send-verification-code', async (req, res) => {
  try {
    const { email, isSignup, name } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address'
      });
    }

    // Domain validation
    if (!isAllowedEmailDomain(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please use your @theroofdocs.com email address'
      });
    }

    // For signup, require name
    if (isSignup && !name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required for signup'
      });
    }

    // Generate code
    const code = generateVerificationCode();
    const expiresInMinutes = 10;
    const expiresAt = Date.now() + (expiresInMinutes * 60 * 1000);

    // Store code for later verification (include name for signup)
    verificationCodes.set(email.toLowerCase(), { code, expiresAt, name: isSignup ? name : undefined });

    // Try to send email
    let emailSent = false;
    try {
      emailSent = await emailService.sendVerificationCode({
        email,
        code,
        expiresInMinutes
      });
    } catch (emailError) {
      console.log('Email sending failed:', emailError);
    }

    // Log code for debugging (but don't return to client)
    console.log(`[AUTH] Verification code for ${email}: ${code} (email sent: ${emailSent})`);

    // Return success WITHOUT the verification code (security fix)
    res.json({
      success: true,
      message: emailSent
        ? 'Verification code sent to your email. Please check your inbox.'
        : 'Unable to send email. Please contact your administrator.',
      expiresInMinutes,
      emailSent
    });
  } catch (error) {
    console.error('Error sending verification code:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while generating the verification code'
    });
  }
});

// Direct login endpoint (no email verification)
// Users can log in with just their email - no code required
app.post('/api/auth/direct-login', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address'
      });
    }

    // Domain validation
    if (!isAllowedEmailDomain(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please use your @theroofdocs.com email address'
      });
    }

    const normalizedEmail = email.toLowerCase();

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id, name, email, role FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    let user;
    let isNew = false;

    if (existingUser.rows.length > 0) {
      // Existing user - login
      user = existingUser.rows[0];

      // Update last login
      await pool.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );

      console.log(`[AUTH] Direct login: ${user.email} (${user.name})`);
    } else if (name && name.trim().length >= 2) {
      // New user - create account
      const newUserId = uuidv4();
      const result = await pool.query(
        `INSERT INTO users (id, email, name, role, created_at, first_login_at, last_login_at)
         VALUES ($1, $2, $3, 'sales_rep', NOW(), NOW(), NOW())
         RETURNING id, name, email, role`,
        [newUserId, normalizedEmail, name.trim()]
      );
      user = result.rows[0];
      isNew = true;

      console.log(`[AUTH] New user created via direct login: ${user.email} (${user.name})`);
    } else {
      // New user but no name provided
      return res.status(400).json({
        success: false,
        error: 'Name is required for new users',
        requiresSignup: true
      });
    }

    res.json({
      success: true,
      message: isNew ? 'Account created successfully!' : 'Login successful',
      isNew,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error in direct login:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred during login'
    });
  }
});

// Verify code endpoint (kept for backward compatibility)
app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: 'Email and code are required'
      });
    }

    const normalizedEmail = email.toLowerCase();
    const storedData = verificationCodes.get(normalizedEmail);

    if (!storedData) {
      return res.status(400).json({
        success: false,
        error: 'No verification code found. Please request a new code.'
      });
    }

    if (Date.now() > storedData.expiresAt) {
      verificationCodes.delete(normalizedEmail);
      return res.status(400).json({
        success: false,
        error: 'Verification code has expired. Please request a new code.'
      });
    }

    if (storedData.code !== code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code. Please try again.'
      });
    }

    // Code is valid - check if this is a signup (name was stored with code)
    const signupName = storedData.name;

    // Delete code so it can't be reused
    verificationCodes.delete(normalizedEmail);

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id, name, email, role FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    let user;
    let isNew = false;

    if (existingUser.rows.length > 0) {
      // Existing user - login
      user = existingUser.rows[0];

      // Update last login
      await pool.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );
    } else if (signupName) {
      // New user - create account (signup flow)
      const newUserId = uuidv4();
      const result = await pool.query(
        `INSERT INTO users (id, email, name, role, created_at, first_login_at, last_login_at)
         VALUES ($1, $2, $3, 'sales_rep', NOW(), NOW(), NOW())
         RETURNING id, name, email, role`,
        [newUserId, normalizedEmail, signupName]
      );
      user = result.rows[0];
      isNew = true;

      console.log(`[AUTH] New user created: ${user.email} (${user.name})`);
    } else {
      // No user and no signup name - shouldn't happen with proper flow
      return res.status(400).json({
        success: false,
        error: 'User not found. Please sign up first.'
      });
    }

    res.json({
      success: true,
      message: isNew ? 'Account created successfully!' : 'Login successful',
      isNew,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while verifying the code'
    });
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

// Trigger admin summary email only (for testing)
app.post('/api/admin/trigger-admin-summary', async (req, res) => {
  try {
    const { date } = req.body;
    const { dailySummaryService } = await import('./services/dailySummaryService.js');

    const result = await dailySummaryService.sendAdminDailySummary(date);

    res.json({
      success: result.success,
      message: result.success ? 'Admin summary email sent' : 'Admin summary not sent',
      summary: result.summary ? {
        date: result.summary.date,
        totalUsers: result.summary.totalUsers,
        totalActivities: result.summary.totalActivities,
        totals: result.summary.totals,
        errorsCount: result.summary.errors.length
      } : null,
      error: result.error
    });
  } catch (error) {
    console.error('Error sending admin summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send admin summary',
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

// ==========================================================================
// User CRUD API (Admin Only)
// Create, update, delete, and manage users
// ==========================================================================

// Create a new user (admin only)
app.post('/api/admin/users', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { email, name, role = 'sales_rep', state } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' });
    }

    if (!['sales_rep', 'manager', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be: sales_rep, manager, or admin' });
    }

    // Check if user already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, name, role, state, verification_code, verification_expires_at, is_verified)
       VALUES (LOWER($1), $2, $3, $4, $5, $6, false)
       RETURNING id, email, name, role, state, created_at, is_verified`,
      [email, name, role, state || null, verificationCode, expiresAt]
    );

    // Send verification email
    try {
      await emailService.sendVerificationCode({
        email: email,
        code: verificationCode
      });
      console.log(`[Admin] Sent verification code to ${email}`);
    } catch (emailError) {
      console.error('[Admin] Failed to send verification email:', emailError);
      // Don't fail the request, user was still created
    }

    console.log(`[Admin] ${requestingEmail} created user: ${email} (${role})`);
    res.status(201).json({ user: result.rows[0], verificationSent: true });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update a user (admin only)
app.put('/api/admin/users/:userId', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;
    const { name, role, state, is_active } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (role !== undefined) {
      if (!['sales_rep', 'manager', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.push(`role = $${paramCount++}`);
      values.push(role);
    }
    if (state !== undefined) {
      updates.push(`state = $${paramCount++}`);
      values.push(state || null);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount}
       RETURNING id, email, name, role, state, created_at, is_verified`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[Admin] ${requestingEmail} updated user ${userId}`);
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete a user (admin only)
app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;

    // Get user info for logging
    const userCheck = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userEmail = userCheck.rows[0].email;

    // Prevent deleting yourself
    if (userEmail.toLowerCase() === requestingEmail.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete user (cascading will handle related records)
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    console.log(`[Admin] ${requestingEmail} deleted user: ${userEmail}`);
    res.json({ success: true, message: `User ${userEmail} deleted` });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Resend verification code (admin only)
app.post('/api/admin/users/:userId/resend-verification', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;

    // Get user
    const userResult = await pool.query(
      'SELECT id, email, name, is_verified FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    if (user.is_verified) {
      return res.status(400).json({ error: 'User is already verified' });
    }

    // Generate new verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user with new code
    await pool.query(
      `UPDATE users SET verification_code = $1, verification_expires_at = $2 WHERE id = $3`,
      [verificationCode, expiresAt, userId]
    );

    // Send verification email
    await emailService.sendVerificationCode({
      email: user.email,
      code: verificationCode
    });

    console.log(`[Admin] ${requestingEmail} resent verification to ${user.email}`);
    res.json({ success: true, message: `Verification code sent to ${user.email}` });
  } catch (error) {
    console.error('Error resending verification:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Toggle user active status (admin only)
app.patch('/api/admin/users/:userId/status', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean' });
    }

    const result = await pool.query(
      `UPDATE users SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, name, role, state, is_active`,
      [is_active, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[Admin] ${requestingEmail} set user ${userId} active=${is_active}`);
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ==========================================================================
// Rep Goals System API
// Monthly sales goals with bonus tracking and deadline enforcement
// ==========================================================================

// Default goals - used if no specific goal is set
const DEFAULT_MONTHLY_SIGNUP_GOAL = 15;
const DEFAULT_YEARLY_REVENUE_GOAL = 1500000; // $1.5 million

// Bonus tier structure - now loaded from database
// Wrapper function for async tier calculation
async function calculateBonusTier(signups: number): Promise<{ tier: number; name: string; color: string; bonusDisplay: string; nextTier: { name: string; signupsNeeded: number; bonusDisplay: string } | null }> {
  return calculateBonusTierAsync(signups, pool);
}

// Helper function to get current month's goal for a rep
async function getCurrentMonthGoal(salesRepId: number) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const result = await pool.query(
    `SELECT lg.*, sr.monthly_signups, sr.monthly_signup_goal as default_signup_goal
     FROM leaderboard_goals lg
     RIGHT JOIN sales_reps sr ON lg.sales_rep_id = sr.id AND lg.month = $2
     WHERE sr.id = $1`,
    [salesRepId, currentMonth]
  );

  if (result.rows.length === 0) {
    // Return defaults if no rep found
    return {
      monthly_signup_goal: DEFAULT_MONTHLY_SIGNUP_GOAL,
      yearly_revenue_goal: DEFAULT_YEARLY_REVENUE_GOAL,
      monthly_signups: 0
    };
  }

  const row = result.rows[0];
  return {
    monthly_signup_goal: row.monthly_signup_goal || row.default_signup_goal || DEFAULT_MONTHLY_SIGNUP_GOAL,
    yearly_revenue_goal: row.yearly_revenue_goal || DEFAULT_YEARLY_REVENUE_GOAL,
    monthly_signups: row.monthly_signups || 0
  };
}

// GET /api/admin/goals/tiers - Get bonus tier structure (database-driven)
app.get('/api/admin/goals/tiers', async (_req, res) => {
  try {
    const tiers = await getAllTiers(pool);
    res.json({
      tiers: tiers.map(t => ({
        tier: t.tier,
        name: t.name,
        minSignups: t.minSignups,
        maxSignups: t.maxSignups,
        color: t.color,
        bonusDisplay: t.bonusDisplay
      })),
      description: 'Bonus tiers are calculated based on monthly signups. Reps earn bonuses when they reach each tier threshold.'
    });
  } catch (error) {
    console.error('[ADMIN] Error fetching tiers:', error);
    res.status(500).json({ error: 'Failed to fetch bonus tiers' });
  }
});

// PUT /api/admin/tiers - Update all bonus tiers (batch update)
app.put('/api/admin/tiers', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { tiers } = req.body;
    if (!Array.isArray(tiers) || tiers.length === 0) {
      return res.status(400).json({ error: 'Invalid tiers data' });
    }

    // Validate tier data
    for (const tier of tiers) {
      if (typeof tier.tier !== 'number' || tier.tier < 0 || tier.tier > 10) {
        return res.status(400).json({ error: `Invalid tier number: ${tier.tier}` });
      }
      if (!tier.name || typeof tier.name !== 'string') {
        return res.status(400).json({ error: 'Tier name is required' });
      }
      if (typeof tier.minSignups !== 'number' || tier.minSignups < 0) {
        return res.status(400).json({ error: 'Invalid min signups' });
      }
      if (typeof tier.maxSignups !== 'number' || tier.maxSignups < tier.minSignups) {
        return res.status(400).json({ error: 'Invalid max signups' });
      }
      if (!tier.color || typeof tier.color !== 'string') {
        return res.status(400).json({ error: 'Tier color is required' });
      }
    }

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete all existing tiers
      await client.query('DELETE FROM bonus_tiers');

      // Insert new tiers
      for (const tier of tiers) {
        await client.query(
          `INSERT INTO bonus_tiers (tier_number, name, min_signups, max_signups, color, bonus_display, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [tier.tier, tier.name, tier.minSignups, tier.maxSignups, tier.color, tier.bonusDisplay || '']
        );
      }

      await client.query('COMMIT');

      // Clear cache
      clearTierCache();

      // Recalculate all rep bonus tiers
      await recalculateAllRepTiers();

      res.json({
        success: true,
        message: 'Bonus tiers updated successfully',
        tiersUpdated: tiers.length
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[ADMIN] Error updating tiers:', error);
    res.status(500).json({ error: 'Failed to update bonus tiers' });
  }
});

// POST /api/admin/tiers/reset - Reset tiers to defaults
app.post('/api/admin/tiers/reset', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const defaultTiers = getDefaultTiers();

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete all existing tiers
      await client.query('DELETE FROM bonus_tiers');

      // Insert default tiers
      for (const tier of defaultTiers) {
        await client.query(
          `INSERT INTO bonus_tiers (tier_number, name, min_signups, max_signups, color, bonus_display, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [tier.tier, tier.name, tier.minSignups, tier.maxSignups, tier.color, tier.bonusDisplay]
        );
      }

      await client.query('COMMIT');

      // Clear cache
      clearTierCache();

      // Recalculate all rep bonus tiers
      await recalculateAllRepTiers();

      res.json({
        success: true,
        message: 'Bonus tiers reset to defaults',
        tiers: defaultTiers
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[ADMIN] Error resetting tiers:', error);
    res.status(500).json({ error: 'Failed to reset bonus tiers' });
  }
});

// Helper function to recalculate all rep bonus tiers after tier changes
async function recalculateAllRepTiers(): Promise<void> {
  try {
    const repsResult = await pool.query(
      'SELECT id, monthly_signups FROM sales_reps WHERE is_active = true'
    );

    for (const rep of repsResult.rows) {
      const tierNumber = await calculateBonusTierNumber(rep.monthly_signups || 0, pool);
      await pool.query(
        'UPDATE sales_reps SET current_bonus_tier = $1, updated_at = NOW() WHERE id = $2',
        [tierNumber, rep.id]
      );
    }

    console.log(`[ADMIN] Recalculated bonus tiers for ${repsResult.rows.length} reps`);
  } catch (error) {
    console.error('[ADMIN] Error recalculating rep tiers:', error);
  }
}

// GET /api/admin/goals/reps - Get list of sales reps for dropdown
app.get('/api/admin/goals/reps', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT id, name, email, team
      FROM sales_reps
      WHERE is_active = true
      ORDER BY name ASC
    `);

    res.json({
      reps: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching sales reps:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/admin/goals/progress - Get goal progress for all reps (leaderboard)
// IMPORTANT: Must come BEFORE /api/admin/goals/:repId to avoid route matching collision
app.get('/api/admin/goals/progress', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const result = await pool.query(`
      SELECT
        sr.id as sales_rep_id,
        sr.name as rep_name,
        sr.email as rep_email,
        sr.team,
        sr.monthly_signups as current_signups,
        sr.monthly_signup_goal as default_goal,
        lg.id as goal_id,
        lg.monthly_signup_goal,
        lg.yearly_revenue_goal,
        CASE
          WHEN lg.monthly_signup_goal IS NOT NULL THEN
            ROUND((sr.monthly_signups::numeric / lg.monthly_signup_goal::numeric) * 100, 1)
          WHEN sr.monthly_signup_goal > 0 THEN
            ROUND((sr.monthly_signups::numeric / sr.monthly_signup_goal::numeric) * 100, 1)
          ELSE 0
        END as progress_percentage,
        CASE
          WHEN lg.monthly_signup_goal IS NOT NULL AND sr.monthly_signups >= lg.monthly_signup_goal THEN 'achieved'
          WHEN sr.monthly_signup_goal > 0 AND sr.monthly_signups >= sr.monthly_signup_goal THEN 'achieved'
          WHEN lg.monthly_signup_goal IS NOT NULL AND sr.monthly_signups >= lg.monthly_signup_goal * 0.75 THEN 'on_track'
          WHEN sr.monthly_signup_goal > 0 AND sr.monthly_signups >= sr.monthly_signup_goal * 0.75 THEN 'on_track'
          WHEN lg.monthly_signup_goal IS NOT NULL AND sr.monthly_signups >= lg.monthly_signup_goal * 0.5 THEN 'behind'
          WHEN sr.monthly_signup_goal > 0 AND sr.monthly_signups >= sr.monthly_signup_goal * 0.5 THEN 'behind'
          ELSE 'critical'
        END as status
      FROM sales_reps sr
      LEFT JOIN leaderboard_goals lg ON sr.id = lg.sales_rep_id AND lg.month = $1
      WHERE sr.is_active = true
      ORDER BY progress_percentage DESC NULLS LAST, sr.name
    `, [currentMonth]);

    // Transform to camelCase format expected by frontend
    const transformedProgress = await Promise.all(result.rows.map(async row => {
      const signups = parseInt(row.current_signups) || 0;
      const tierInfo = await calculateBonusTier(signups);

      return {
        repId: row.sales_rep_id,
        repName: row.rep_name,
        repEmail: row.rep_email,
        team: row.team,
        actual: signups,
        goal: parseInt(row.monthly_signup_goal) || parseInt(row.default_goal) || DEFAULT_MONTHLY_SIGNUP_GOAL,
        yearlyRevenueGoal: parseFloat(row.yearly_revenue_goal) || DEFAULT_YEARLY_REVENUE_GOAL,
        progressPercentage: parseFloat(row.progress_percentage) || 0,
        status: row.status,
        hasGoal: !!row.goal_id,
        tier: tierInfo
      };
    }));

    res.json({
      month: currentMonth,
      progress: transformedProgress,
      total: transformedProgress.length,
      summary: {
        achieved: transformedProgress.filter(r => r.status === 'achieved').length,
        onTrack: transformedProgress.filter(r => r.status === 'on_track').length,
        behind: transformedProgress.filter(r => r.status === 'behind').length,
        critical: transformedProgress.filter(r => r.status === 'critical').length,
        noGoal: transformedProgress.filter(r => !r.hasGoal).length
      }
    });
  } catch (error) {
    console.error('Error fetching goal progress:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/admin/goals/bonus/trigger - Manually trigger bonus for a rep
// IMPORTANT: Must come BEFORE /api/admin/goals/:repId to avoid route matching collision
// Note: Full bonus tracking will be implemented in a future release
app.post('/api/admin/goals/bonus/trigger', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { salesRepId, month } = req.body;

    if (!salesRepId) {
      return res.status(400).json({ error: 'salesRepId is required' });
    }

    // Get rep details
    const repResult = await pool.query(
      'SELECT id, name, monthly_signups, monthly_signup_goal FROM sales_reps WHERE id = $1',
      [salesRepId]
    );
    if (repResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales rep not found' });
    }

    const rep = repResult.rows[0];
    const goal = rep.monthly_signup_goal || DEFAULT_MONTHLY_SIGNUP_GOAL;
    const progress = rep.monthly_signups || 0;
    const percentage = goal > 0 ? Math.round((progress / goal) * 100) : 0;

    // Check if goal is achieved
    if (percentage < 100) {
      return res.status(400).json({
        error: 'Goal not yet achieved',
        currentProgress: percentage,
        required: 100
      });
    }

    console.log(`[Admin] ${requestingEmail} acknowledged bonus for rep ${salesRepId} (${rep.name})`);

    res.json({
      success: true,
      message: 'Bonus acknowledged successfully',
      rep: {
        id: salesRepId,
        name: rep.name,
        signups: progress,
        goal: goal,
        percentage: percentage
      }
    });
  } catch (error) {
    console.error('Error triggering bonus:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/admin/goals - List all rep goals with optional filters
app.get('/api/admin/goals', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { month } = req.query;
    const currentMonth = month || new Date().toISOString().slice(0, 7); // YYYY-MM format

    const result = await pool.query(`
      SELECT
        lg.*,
        sr.name as rep_name,
        sr.email as rep_email,
        sr.team as rep_team,
        sr.monthly_signups
      FROM leaderboard_goals lg
      JOIN sales_reps sr ON lg.sales_rep_id = sr.id
      WHERE lg.month = $1
      ORDER BY sr.name ASC
    `, [currentMonth]);

    // Transform to camelCase format expected by frontend
    const transformedGoals = result.rows.map(row => ({
      id: row.id,
      repId: row.sales_rep_id,
      repName: row.rep_name,
      repEmail: row.rep_email,
      repTeam: row.rep_team,
      monthlySignupGoal: parseInt(row.monthly_signup_goal) || null,
      yearlyRevenueGoal: parseFloat(row.yearly_revenue_goal) || 0,
      currentSignups: parseInt(row.monthly_signups) || 0,
      month: row.month,
      createdAt: row.created_at
    }));

    res.json({
      goals: transformedGoals,
      total: transformedGoals.length
    });
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/admin/goals - Create or update a rep's monthly goal
app.post('/api/admin/goals', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { salesRepId, monthlySignupGoal, yearlyRevenueGoal } = req.body;

    // Get current month in YYYY-MM format
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Validation
    if (!salesRepId) {
      return res.status(400).json({ error: 'Missing required field: salesRepId' });
    }

    if (!monthlySignupGoal || monthlySignupGoal <= 0) {
      return res.status(400).json({ error: 'Monthly signup goal must be greater than 0' });
    }

    if (!yearlyRevenueGoal || yearlyRevenueGoal <= 0) {
      return res.status(400).json({ error: 'Yearly revenue goal must be greater than 0' });
    }

    // Check if sales rep exists
    const repCheck = await pool.query(
      'SELECT id, name FROM sales_reps WHERE id = $1',
      [salesRepId]
    );
    if (repCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Sales rep not found' });
    }

    // Get user UUID for created_by
    const userResult = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [requestingEmail]
    );
    const createdByUserId = userResult.rows[0]?.id || null;

    // Insert or update goal in leaderboard_goals table
    const result = await pool.query(`
      INSERT INTO leaderboard_goals (
        sales_rep_id, monthly_signup_goal, yearly_revenue_goal, month, created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (sales_rep_id, month)
      DO UPDATE SET
        monthly_signup_goal = EXCLUDED.monthly_signup_goal,
        yearly_revenue_goal = EXCLUDED.yearly_revenue_goal,
        updated_at = NOW()
      RETURNING *
    `, [salesRepId, monthlySignupGoal, yearlyRevenueGoal, month, createdByUserId]);

    console.log(`[Admin] ${requestingEmail} set goal for rep ${salesRepId}: ${monthlySignupGoal} signups, $${yearlyRevenueGoal} revenue for ${month}`);

    res.json({
      goal: result.rows[0],
      message: 'Goal saved successfully'
    });
  } catch (error) {
    console.error('Error creating/updating goal:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/admin/goals/:repId - Get specific rep's goals and progress
// IMPORTANT: Must come AFTER specific routes like /progress and /bonus/trigger
app.get('/api/admin/goals/:repId', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { repId } = req.params;

    // Get rep info
    const repResult = await pool.query(
      'SELECT * FROM sales_reps WHERE id = $1',
      [repId]
    );
    if (repResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales rep not found' });
    }

    // Get all goals for this rep from leaderboard_goals
    const goalsResult = await pool.query(
      `SELECT * FROM leaderboard_goals
       WHERE sales_rep_id = $1
       ORDER BY month DESC`,
      [repId]
    );

    // Get current month goal with defaults
    const currentGoal = await getCurrentMonthGoal(parseInt(repId));

    res.json({
      rep: repResult.rows[0],
      goals: goalsResult.rows,
      currentGoal,
      total: goalsResult.rows.length
    });
  } catch (error) {
    console.error('Error fetching rep goals:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// PUT /api/admin/goals/:goalId - Update a goal
app.put('/api/admin/goals/:goalId', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { goalId } = req.params;
    const { monthlySignupGoal, yearlyRevenueGoal } = req.body;

    // Check if goal exists
    const goalCheck = await pool.query(
      'SELECT * FROM leaderboard_goals WHERE id = $1',
      [goalId]
    );
    if (goalCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    // Update goal
    const result = await pool.query(`
      UPDATE leaderboard_goals
      SET monthly_signup_goal = COALESCE($1, monthly_signup_goal),
          yearly_revenue_goal = COALESCE($2, yearly_revenue_goal),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [monthlySignupGoal, yearlyRevenueGoal, goalId]);

    console.log(`[Admin] ${requestingEmail} updated goal ${goalId}`);
    res.json({ goal: result.rows[0] });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// DELETE /api/admin/goals/:goalId - Delete a goal
app.delete('/api/admin/goals/:goalId', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { goalId } = req.params;

    // Check if goal exists
    const goalCheck = await pool.query(
      'SELECT * FROM leaderboard_goals WHERE id = $1',
      [goalId]
    );
    if (goalCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const goal = goalCheck.rows[0];

    // Delete goal
    await pool.query('DELETE FROM leaderboard_goals WHERE id = $1', [goalId]);

    console.log(`[Admin] ${requestingEmail} deleted goal ${goalId} (rep: ${goal.sales_rep_id}, ${goal.month})`);
    res.json({
      success: true,
      message: 'Goal deleted successfully',
      deletedGoal: goal
    });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/rep/goals - Get current user's goals (for rep dashboard)
app.get('/api/rep/goals', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);

    // Find sales rep by email
    const repResult = await pool.query(
      'SELECT id FROM sales_reps WHERE LOWER(email) = LOWER($1)',
      [requestingEmail]
    );

    if (repResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Sales rep profile not found',
        message: 'Your email is not linked to a sales rep account. Please contact an administrator.'
      });
    }

    const salesRepId = repResult.rows[0].id;

    // Get all goals for this rep from leaderboard_goals
    const goalsResult = await pool.query(
      `SELECT * FROM leaderboard_goals
       WHERE sales_rep_id = $1
       ORDER BY month DESC`,
      [salesRepId]
    );

    // Get current month goal with defaults
    const currentGoal = await getCurrentMonthGoal(salesRepId);

    res.json({
      goals: goalsResult.rows,
      currentGoal,
      total: goalsResult.rows.length,
      defaults: {
        monthlySignupGoal: DEFAULT_MONTHLY_SIGNUP_GOAL,
        yearlyRevenueGoal: DEFAULT_YEARLY_REVENUE_GOAL
      }
    });
  } catch (error) {
    console.error('Error fetching rep goals:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/rep/goals/progress - Get current user's progress with trend data
app.get('/api/rep/goals/progress', async (req, res) => {
  try {
    const requestingEmail = getRequestEmail(req);

    // Find sales rep by email and get full info
    const repResult = await pool.query(
      'SELECT * FROM sales_reps WHERE LOWER(email) = LOWER($1)',
      [requestingEmail]
    );

    if (repResult.rows.length === 0) {
      // Return default progress for users without sales rep profiles
      // Default goal is 8 signups per month (standard for new reps)
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysRemaining = daysInMonth - now.getDate();
      const defaultMonthlyGoal = 8;
      const defaultYearlyGoal = defaultMonthlyGoal * 12;

      return res.json({
        success: true,
        noSalesRepProfile: true,
        rep: {
          id: null,
          name: 'New Rep',
          email: requestingEmail,
          team: null,
          monthlySignups: 0,
          monthlyRevenue: 0,
          yearlySignups: 0,
          yearlyRevenue: 0
        },
        goal: {
          monthly: defaultMonthlyGoal,
          yearly: 0
        },
        progress: {
          monthly: {
            signups: { current: 0, goal: defaultMonthlyGoal, percentage: 0, remaining: defaultMonthlyGoal, status: 'pending' },
            revenue: { current: 0, goal: 0, percentage: 0, remaining: 0 }
          },
          yearly: {
            signups: { current: 0, goal: defaultYearlyGoal, percentage: 0, remaining: defaultYearlyGoal, monthlyAverageNeeded: defaultMonthlyGoal },
            revenue: { current: 0, goal: 0, percentage: 0, remaining: 0, monthlyAverageNeeded: 0 }
          },
          calendar: {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            daysInMonth,
            currentDay: now.getDate(),
            daysRemaining
          },
          leaderboard: { rank: 0, percentile: 0 }
        }
      });
    }

    const rep = repResult.rows[0];
    const salesRepId = rep.id;

    // Get current month goal with defaults
    const currentGoal = await getCurrentMonthGoal(salesRepId);

    // Get monthly signups history for trend analysis
    const now = new Date();
    const trendResult = await pool.query(`
      SELECT
        year,
        month,
        signups,
        revenue
      FROM sales_rep_monthly_metrics
      WHERE sales_rep_id = $1
      ORDER BY year DESC, month DESC
      LIMIT 12
    `, [salesRepId]);

    // Calculate progress
    const goal = currentGoal.monthly_signup_goal;
    const current = parseFloat(rep.monthly_signups) || 0;
    const progressPercentage = goal > 0 ? Math.round((current / goal) * 100) : 0;

    // Days remaining in month
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - now.getDate();

    // Determine status
    const expectedProgress = ((daysInMonth - daysRemaining) / daysInMonth) * 100;
    let status = 'behind';
    if (progressPercentage >= 100) status = 'achieved';
    else if (progressPercentage >= expectedProgress) status = 'on-track';
    else if (progressPercentage >= expectedProgress - 20) status = 'behind';
    else status = 'critical';

    // Get leaderboard rank
    const rankResult = await pool.query(`
      SELECT COUNT(*) + 1 as rank
      FROM sales_reps
      WHERE monthly_signups > $1 AND is_active = true
    `, [current]);

    // Calculate tier info for this rep
    const tierInfo = await calculateBonusTier(current);

    res.json({
      success: true,
      rep: {
        id: rep.id,
        name: rep.name,
        email: rep.email,
        team: rep.team,
        monthlySignups: current,
        monthlyRevenue: rep.monthly_revenue || 0,
        yearlySignups: rep.yearly_signups || 0,
        yearlyRevenue: rep.yearly_revenue || 0
      },
      goal: {
        monthly: goal,
        yearly: currentGoal.yearly_revenue_goal
      },
      tier: tierInfo,
      tiers: BONUS_TIERS,
      progress: {
        monthly: {
          signups: {
            current: current,
            goal: goal,
            percentage: progressPercentage,
            remaining: Math.max(0, goal - current),
            status: status === 'achieved' ? 'completed' : status === 'on-track' ? 'on-track' : 'behind'
          },
          revenue: {
            current: rep.monthly_revenue || 0,
            goal: 0,
            percentage: 0,
            remaining: 0
          }
        },
        yearly: {
          signups: {
            current: rep.yearly_signups || 0,
            goal: Math.round(goal * 12),
            percentage: goal > 0 ? Math.round(((rep.yearly_signups || 0) / (goal * 12)) * 100) : 0,
            remaining: Math.max(0, (goal * 12) - (rep.yearly_signups || 0)),
            monthlyAverageNeeded: Math.ceil(((goal * 12) - (rep.yearly_signups || 0)) / Math.max(1, 12 - now.getMonth()))
          },
          revenue: {
            current: rep.yearly_revenue || 0,
            goal: currentGoal.yearly_revenue_goal,
            percentage: currentGoal.yearly_revenue_goal > 0 ? Math.round(((rep.yearly_revenue || 0) / currentGoal.yearly_revenue_goal) * 100) : 0,
            remaining: Math.max(0, currentGoal.yearly_revenue_goal - (rep.yearly_revenue || 0)),
            monthlyAverageNeeded: Math.ceil((currentGoal.yearly_revenue_goal - (rep.yearly_revenue || 0)) / Math.max(1, 12 - now.getMonth()))
          }
        },
        calendar: {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          daysInMonth: daysInMonth,
          currentDay: now.getDate(),
          daysRemaining: daysRemaining
        },
        leaderboard: {
          rank: parseInt(rankResult.rows[0]?.rank) || 0,
          percentile: 0
        }
      },
      history: trendResult.rows.reverse().map(row => ({
        year: row.year,
        month: row.month,
        signups: parseFloat(row.signups) || 0,
        revenue: parseFloat(row.revenue) || 0
      })),
      defaults: {
        monthlySignupGoal: DEFAULT_MONTHLY_SIGNUP_GOAL,
        yearlyRevenueGoal: DEFAULT_YEARLY_REVENUE_GOAL
      }
    });
  } catch (error) {
    console.error('Error fetching rep progress:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ==========================================================================
// User to Sales Rep Mapping API
// Allows admins to manually link users to sales reps
// ==========================================================================

// Ensure mapping table exists
async function ensureUserSalesRepMappingTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sales_rep_mapping (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
        created_by UUID REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id),
        UNIQUE(sales_rep_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_sales_rep_mapping_user ON user_sales_rep_mapping(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_sales_rep_mapping_sales_rep ON user_sales_rep_mapping(sales_rep_id)`);
  } catch (e) {
    // Table likely exists
  }
}
ensureUserSalesRepMappingTable();

// Get all user-to-sales-rep mappings
app.get('/api/admin/user-mappings', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);
    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT
        m.id,
        m.user_id,
        m.sales_rep_id,
        m.notes,
        m.created_at,
        u.email as user_email,
        u.name as user_name,
        s.name as sales_rep_name,
        s.email as sales_rep_email,
        creator.email as created_by_email
      FROM user_sales_rep_mapping m
      JOIN users u ON m.user_id = u.id
      JOIN sales_reps s ON m.sales_rep_id = s.id
      LEFT JOIN users creator ON m.created_by = creator.id
      ORDER BY m.created_at DESC
    `);

    res.json({ success: true, mappings: result.rows });
  } catch (error) {
    console.error('[ADMIN] Error fetching user mappings:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get unmapped users (users without a sales rep link)
app.get('/api/admin/unmapped-users', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);
    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT u.id, u.email, u.name, u.role, u.created_at
      FROM users u
      WHERE u.id NOT IN (SELECT user_id FROM user_sales_rep_mapping)
        AND NOT EXISTS (
          SELECT 1 FROM sales_reps s
          WHERE LOWER(s.email) = LOWER(u.email)
        )
      ORDER BY u.name
    `);

    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('[ADMIN] Error fetching unmapped users:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get unmapped sales reps (reps without a user link)
app.get('/api/admin/unmapped-sales-reps', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);
    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT s.id, s.name, s.email, s.team, s.is_active
      FROM sales_reps s
      WHERE s.id NOT IN (SELECT sales_rep_id FROM user_sales_rep_mapping)
        AND NOT EXISTS (
          SELECT 1 FROM users u
          WHERE LOWER(u.email) = LOWER(s.email)
        )
        AND s.is_active = true
      ORDER BY s.name
    `);

    res.json({ success: true, salesReps: result.rows });
  } catch (error) {
    console.error('[ADMIN] Error fetching unmapped sales reps:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Create a user-to-sales-rep mapping
app.post('/api/admin/user-mappings', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);
    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId, salesRepId, notes } = req.body;

    if (!userId || !salesRepId) {
      return res.status(400).json({ error: 'userId and salesRepId are required' });
    }

    // Get admin user id for created_by
    const adminResult = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    const createdBy = adminResult.rows[0]?.id || null;

    const result = await pool.query(`
      INSERT INTO user_sales_rep_mapping (user_id, sales_rep_id, created_by, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET
        sales_rep_id = EXCLUDED.sales_rep_id,
        created_by = EXCLUDED.created_by,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `, [userId, salesRepId, createdBy, notes || null]);

    console.log(`[ADMIN] Created user mapping: user ${userId} -> sales rep ${salesRepId}`);
    res.json({ success: true, mapping: result.rows[0] });
  } catch (error) {
    console.error('[ADMIN] Error creating user mapping:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete a user-to-sales-rep mapping
app.delete('/api/admin/user-mappings/:id', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);
    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM user_sales_rep_mapping WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Mapping not found' });
    }

    console.log(`[ADMIN] Deleted user mapping id: ${id}`);
    res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('[ADMIN] Error deleting user mapping:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ==========================================================================
// End User to Sales Rep Mapping API
// ==========================================================================

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

// Update user role (admin only)
// Accepts either user ID or email as userId parameter
app.patch('/api/admin/users/:userId/role', async (req, res) => {
  try {
    // CRITICAL: Verify requesting user is admin
    const requestingEmail = getRequestEmail(req);
    const adminCheck = await isAdmin(requestingEmail);

    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

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

// ==========================================================================
// System Settings API (Admin Only)
// ==========================================================================

// Get all system settings
app.get('/api/admin/settings', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const settingsService = getSettingsService();
    if (!settingsService) {
      return res.status(500).json({ error: 'Settings service not initialized' });
    }

    const settings = await settingsService.getAllSettings();
    res.json({ settings });
  } catch (error) {
    console.error('[Admin Settings] Error fetching settings:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get settings by category
app.get('/api/admin/settings/:category', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const settingsService = getSettingsService();
    if (!settingsService) {
      return res.status(500).json({ error: 'Settings service not initialized' });
    }

    const { category } = req.params;
    const settings = await settingsService.getSettingsByCategory(category);
    res.json({ settings });
  } catch (error) {
    console.error('[Admin Settings] Error fetching category settings:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update a setting
app.put('/api/admin/settings/:key', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const settingsService = getSettingsService();
    if (!settingsService) {
      return res.status(500).json({ error: 'Settings service not initialized' });
    }

    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    // Get user ID for audit trail
    const userId = await getOrCreateUserIdByEmail(email);
    const updated = await settingsService.updateSetting(key, value, userId);

    if (!updated) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    console.log(`[Admin Settings] ${email} updated ${key}:`, value);
    res.json({ success: true, setting: updated });
  } catch (error) {
    console.error('[Admin Settings] Error updating setting:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get feature flags (public endpoint, no admin required)
app.get('/api/settings/features', async (req, res) => {
  try {
    const settingsService = getSettingsService();
    if (!settingsService) {
      // Return default all-enabled if service unavailable
      return res.json({
        feature_leaderboard: true,
        feature_territories: true,
        feature_canvassing: true,
        feature_impacted_assets: true,
        feature_storm_map: true,
        feature_agnes: true,
        feature_live: true,
        feature_susan_chat: true
      });
    }

    const features = await settingsService.getFeatureFlags();
    res.json(features);
  } catch (error) {
    console.error('[Settings] Error fetching features:', error);
    // Return all enabled on error to avoid breaking the app
    res.json({
      feature_leaderboard: true,
      feature_territories: true,
      feature_canvassing: true,
      feature_impacted_assets: true,
      feature_storm_map: true,
      feature_agnes: true,
      feature_live: true,
      feature_susan_chat: true
    });
  }
});

// Get setting change history (admin only)
app.get('/api/admin/settings-history', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const adminCheck = await isAdmin(email);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const settingsService = getSettingsService();
    if (!settingsService) {
      return res.status(500).json({ error: 'Settings service not initialized' });
    }

    const { key, limit = 50 } = req.query;
    const history = await settingsService.getSettingHistory(
      key as string | undefined,
      Number(limit)
    );

    res.json({ history });
  } catch (error) {
    console.error('[Admin Settings] Error fetching history:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ==========================================================================

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
    LOWER(SPLIT_PART(u.email, '@', 1)) AS username,
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
GROUP BY u.id, u.email, ub.monthly_budget, ub.current_month_spend;

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

// Migration 031-033: Hail Reports & Territory Fixes
app.post('/api/admin/run-migration-031-033', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔧 Running Migrations 031-033: Hail Reports & Territory Fixes...');
    const results: string[] = [];

    // Migration 031: Hail Reports Table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS hail_reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          search_criteria JSONB NOT NULL,
          results_count INTEGER DEFAULT 0,
          ihm_events_count INTEGER DEFAULT 0,
          noaa_events_count INTEGER DEFAULT 0,
          max_hail_size DECIMAL(4, 2),
          avg_hail_size DECIMAL(4, 2),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          last_accessed_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_hail_reports_user ON hail_reports(user_id);
        CREATE INDEX IF NOT EXISTS idx_hail_reports_created ON hail_reports(created_at DESC);
      `);
      results.push('✅ Migration 031: hail_reports table created');
    } catch (e: any) {
      results.push(`⚠️ Migration 031: ${e.message}`);
    }

    // Migration 032: Fix Duplicate Territories
    try {
      // Delete duplicates, keeping oldest
      await pool.query(`
        WITH duplicates AS (
          SELECT id, name, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) as rn
          FROM territories WHERE archived_at IS NULL
        )
        DELETE FROM territories WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)
      `);

      // Add unique constraint if not exists
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'territories_name_unique') THEN
            ALTER TABLE territories ADD CONSTRAINT territories_name_unique UNIQUE (name);
          END IF;
        END $$;
      `);

      const countResult = await pool.query(`SELECT COUNT(*) FROM territories WHERE archived_at IS NULL`);
      results.push(`✅ Migration 032: Territory duplicates fixed (${countResult.rows[0].count} unique territories)`);
    } catch (e: any) {
      results.push(`⚠️ Migration 032: ${e.message}`);
    }

    // Migration 033: Hail Knowledge for Susan
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS hail_knowledge (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          report_id UUID REFERENCES hail_reports(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          embedding_text TEXT,
          location_name VARCHAR(255),
          date_range VARCHAR(100),
          event_count INTEGER,
          max_severity VARCHAR(20),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_hail_knowledge_report ON hail_knowledge(report_id);
      `);
      results.push('✅ Migration 033: hail_knowledge table created');
    } catch (e: any) {
      results.push(`⚠️ Migration 033: ${e.message}`);
    }

    console.log('✅ Migrations 031-033 completed');
    res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Migrations 031-033 failed:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Migration 036: Fix neighborhood intel function
app.post('/api/admin/run-migration-036', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔧 Running Migration 036: Intel functions...');
    const results: string[] = [];

    // Create calculate_distance_miles function (Haversine formula)
    try {
      await pool.query(`
        CREATE OR REPLACE FUNCTION calculate_distance_miles(
          lat1 DECIMAL,
          lon1 DECIMAL,
          lat2 DECIMAL,
          lon2 DECIMAL
        ) RETURNS DECIMAL AS $$
        DECLARE
          earth_radius_miles CONSTANT DECIMAL := 3959;
          dlat DECIMAL;
          dlon DECIMAL;
          a DECIMAL;
          c DECIMAL;
        BEGIN
          IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
            RETURN NULL;
          END IF;

          dlat := radians(lat2 - lat1);
          dlon := radians(lon2 - lon1);

          a := sin(dlat/2) * sin(dlat/2) +
               cos(radians(lat1)) * cos(radians(lat2)) *
               sin(dlon/2) * sin(dlon/2);
          c := 2 * atan2(sqrt(a), sqrt(1-a));

          RETURN earth_radius_miles * c;
        END;
        $$ LANGUAGE plpgsql IMMUTABLE
      `);
      results.push('✅ calculate_distance_miles function created');
    } catch (e: any) {
      results.push(`⚠️ Distance function: ${e.message}`);
    }

    // Check actual table columns first
    try {
      const cols = await pool.query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'canvassing_status'
        ORDER BY ordinal_position
      `);
      results.push('📋 canvassing_status columns: ' + cols.rows.map((r: any) => r.column_name).join(', '));
    } catch (e: any) {
      results.push(`⚠️ Could not check columns: ${e.message}`);
    }

    // Drop ALL versions of the function first
    try {
      // Get and drop all overloads
      const funcs = await pool.query(`
        SELECT oid::regprocedure as sig FROM pg_proc
        WHERE proname = 'get_neighborhood_intel'
      `);
      for (const f of funcs.rows) {
        try {
          await pool.query(`DROP FUNCTION IF EXISTS ${f.sig}`);
          results.push(`Dropped: ${f.sig}`);
        } catch (e) { /* ignore */ }
      }
    } catch (e: any) {
      results.push(`⚠️ Drop old functions: ${e.message}`);
    }

    try {

      // Use the actual column names from the table
      await pool.query(`
        CREATE FUNCTION get_neighborhood_intel(
          p_lat DECIMAL,
          p_lng DECIMAL,
          p_radius DECIMAL DEFAULT 0.5
        )
        RETURNS TABLE (
          address TEXT,
          status VARCHAR,
          homeowner_name VARCHAR,
          homeowner_phone VARCHAR,
          homeowner_email VARCHAR,
          property_notes TEXT,
          best_contact_time VARCHAR,
          property_type VARCHAR,
          roof_type VARCHAR,
          roof_age_years INTEGER,
          contacted_by UUID,
          contact_date TIMESTAMPTZ,
          distance_miles DECIMAL
        ) AS $$
          SELECT
            cs.address::TEXT,
            cs.status::VARCHAR,
            cs.homeowner_name::VARCHAR,
            COALESCE(cs.homeowner_phone, cs.phone_number)::VARCHAR,
            COALESCE(cs.homeowner_email, cs.email)::VARCHAR,
            COALESCE(cs.property_notes, cs.notes)::TEXT,
            cs.best_contact_time::VARCHAR,
            cs.property_type::VARCHAR,
            cs.roof_type::VARCHAR,
            cs.roof_age_years::INTEGER,
            cs.contacted_by::UUID,
            cs.contact_date::TIMESTAMPTZ,
            calculate_distance_miles(p_lat, p_lng, cs.latitude, cs.longitude)::DECIMAL
          FROM canvassing_status cs
          WHERE cs.latitude IS NOT NULL
            AND cs.longitude IS NOT NULL
            AND calculate_distance_miles(p_lat, p_lng, cs.latitude, cs.longitude) <= p_radius
          ORDER BY calculate_distance_miles(p_lat, p_lng, cs.latitude, cs.longitude);
        $$ LANGUAGE SQL STABLE
      `);
      results.push('✅ get_neighborhood_intel function FIXED (SQL version with correct columns)');
    } catch (e: any) {
      results.push(`⚠️ Intel function: ${e.message}`);
    }

    console.log('✅ Migration 036 completed');
    res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Migration 036 failed:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Migration 037: Leaderboard Integration with RoofTrack
app.post('/api/admin/run-migration-037', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔧 Running Migration 037: Leaderboard Integration...');
    const results: string[] = [];

    // Create user mapping table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooftrack_user_mapping (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gemini_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rooftrack_sales_rep_id UUID,
        rooftrack_email VARCHAR(255),
        last_sync_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(gemini_user_id)
      )
    `);
    results.push('✅ rooftrack_user_mapping table created');

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rooftrack_mapping_email ON rooftrack_user_mapping(rooftrack_email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rooftrack_mapping_gemini_user ON rooftrack_user_mapping(gemini_user_id)`);
    results.push('✅ Indexes created');

    console.log('✅ Migration 037 completed successfully!');
    res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Migration 037 failed:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Migration 035: Canvassing Tables Fix
app.post('/api/admin/run-migration-035', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔧 Running Migration 035: Canvassing Tables Fix...');
    const results: string[] = [];

    // Create canvassing_status table with all columns
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS canvassing_status (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          address TEXT NOT NULL,
          street_address VARCHAR(500),
          city VARCHAR(100),
          state VARCHAR(2),
          zip_code VARCHAR(10),
          latitude DECIMAL(10, 8),
          longitude DECIMAL(11, 8),
          status VARCHAR(50) NOT NULL DEFAULT 'not_contacted',
          contacted_by UUID REFERENCES users(id) ON DELETE SET NULL,
          contact_date TIMESTAMPTZ,
          contact_method VARCHAR(50),
          homeowner_name VARCHAR(255),
          phone_number VARCHAR(20),
          email VARCHAR(255),
          notes TEXT,
          follow_up_date DATE,
          follow_up_notes TEXT,
          related_storm_event_id UUID,
          related_job_id UUID,
          team_id UUID,
          territory VARCHAR(100),
          attempt_count INTEGER DEFAULT 1,
          last_attempt_date TIMESTAMPTZ,
          homeowner_phone VARCHAR(20),
          homeowner_email VARCHAR(255),
          property_notes TEXT,
          best_contact_time VARCHAR(100),
          property_type VARCHAR(50),
          roof_type VARCHAR(100),
          roof_age_years INTEGER,
          auto_monitor BOOLEAN DEFAULT true,
          linked_property_id UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      results.push('✅ canvassing_status table ready');
    } catch (e: any) {
      results.push(`⚠️ canvassing_status: ${e.message}`);
    }

    // Create canvassing_sessions table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS canvassing_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          session_date DATE NOT NULL DEFAULT CURRENT_DATE,
          start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          end_time TIMESTAMPTZ,
          target_city VARCHAR(100),
          target_state VARCHAR(2),
          target_zip_code VARCHAR(10),
          target_territory VARCHAR(100),
          storm_event_id UUID,
          doors_knocked INTEGER DEFAULT 0,
          contacts_made INTEGER DEFAULT 0,
          leads_generated INTEGER DEFAULT 0,
          appointments_set INTEGER DEFAULT 0,
          notes TEXT,
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      results.push('✅ canvassing_sessions table ready');
    } catch (e: any) {
      results.push(`⚠️ canvassing_sessions: ${e.message}`);
    }

    // Create canvassing_activity_log table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS canvassing_activity_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          canvassing_status_id UUID REFERENCES canvassing_status(id) ON DELETE CASCADE,
          session_id UUID REFERENCES canvassing_sessions(id) ON DELETE SET NULL,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          action_type VARCHAR(50) NOT NULL,
          previous_status VARCHAR(50),
          new_status VARCHAR(50),
          latitude DECIMAL(10, 8),
          longitude DECIMAL(11, 8),
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      results.push('✅ canvassing_activity_log table ready');
    } catch (e: any) {
      results.push(`⚠️ canvassing_activity_log: ${e.message}`);
    }

    // Create indexes
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_canvassing_status_user ON canvassing_status(contacted_by, contact_date DESC);
        CREATE INDEX IF NOT EXISTS idx_canvassing_status_status ON canvassing_status(status);
        CREATE INDEX IF NOT EXISTS idx_canvassing_sessions_user ON canvassing_sessions(user_id, session_date DESC);
        CREATE INDEX IF NOT EXISTS idx_canvassing_activity_user ON canvassing_activity_log(user_id, created_at DESC);
      `);
      results.push('✅ Indexes created');
    } catch (e: any) {
      results.push(`⚠️ Indexes: ${e.message}`);
    }

    // Create the FIXED stats function that counts from canvassing_status
    try {
      await pool.query(`
        CREATE OR REPLACE FUNCTION get_user_canvassing_stats(
          p_user_id UUID,
          p_days_back INTEGER DEFAULT 30
        )
        RETURNS TABLE (
          total_doors INTEGER,
          total_contacts INTEGER,
          total_leads INTEGER,
          total_appointments INTEGER,
          conversion_rate DECIMAL,
          avg_doors_per_session DECIMAL
        ) AS $$
        DECLARE
          v_cutoff_date DATE;
        BEGIN
          v_cutoff_date := CURRENT_DATE - p_days_back;

          RETURN QUERY
          WITH activity_stats AS (
            SELECT
              COUNT(*) as doors,
              COUNT(*) FILTER (WHERE status IN ('contacted', 'interested', 'lead', 'appointment_set', 'sold', 'customer')) as contacts,
              COUNT(*) FILTER (WHERE status IN ('lead', 'appointment_set', 'sold', 'customer')) as leads,
              COUNT(*) FILTER (WHERE status IN ('appointment_set', 'sold', 'customer')) as appointments
            FROM canvassing_status
            WHERE contacted_by = p_user_id
            AND contact_date >= v_cutoff_date
          ),
          session_stats AS (
            SELECT
              COUNT(*) as session_count,
              COALESCE(SUM(doors_knocked), 0) as session_doors
            FROM canvassing_sessions
            WHERE user_id = p_user_id
            AND session_date >= v_cutoff_date
          )
          SELECT
            COALESCE(a.doors, 0)::INTEGER as total_doors,
            COALESCE(a.contacts, 0)::INTEGER as total_contacts,
            COALESCE(a.leads, 0)::INTEGER as total_leads,
            COALESCE(a.appointments, 0)::INTEGER as total_appointments,
            CASE WHEN a.doors > 0
              THEN ROUND(100.0 * a.leads / a.doors, 2)
              ELSE 0
            END as conversion_rate,
            CASE
              WHEN s.session_count > 0 THEN ROUND(s.session_doors::DECIMAL / s.session_count, 2)
              WHEN a.doors > 0 THEN a.doors::DECIMAL
              ELSE 0
            END as avg_doors_per_session
          FROM activity_stats a
          CROSS JOIN session_stats s;
        END;
        $$ LANGUAGE plpgsql
      `);
      results.push('✅ get_user_canvassing_stats function FIXED to count from canvassing_status');
    } catch (e: any) {
      results.push(`⚠️ Stats function: ${e.message}`);
    }

    console.log('✅ Migration 035 completed');
    res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Migration 035 failed:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Migration 019: Bonus Tiers Table
app.post('/api/admin/run-migration-019', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔧 Running Migration 019: Bonus Tiers Table...');
    const results: string[] = [];

    // Create bonus_tiers table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bonus_tiers (
          id SERIAL PRIMARY KEY,
          tier_number INTEGER NOT NULL UNIQUE CHECK (tier_number >= 0 AND tier_number <= 10),
          name VARCHAR(50) NOT NULL,
          min_signups INTEGER NOT NULL CHECK (min_signups >= 0),
          max_signups INTEGER NOT NULL CHECK (max_signups >= min_signups),
          color VARCHAR(20) NOT NULL,
          bonus_display VARCHAR(20) NOT NULL DEFAULT '',
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      results.push('✅ bonus_tiers table created');
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        results.push('✅ bonus_tiers table already exists');
      } else {
        results.push(`⚠️ bonus_tiers table: ${e.message}`);
      }
    }

    // Create indexes
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_bonus_tiers_active ON bonus_tiers (is_active, tier_number)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_bonus_tiers_signups ON bonus_tiers (min_signups, max_signups) WHERE is_active = true`);
      results.push('✅ bonus_tiers indexes created');
    } catch (e: any) {
      results.push(`⚠️ indexes: ${e.message}`);
    }

    // Seed default tiers
    try {
      await pool.query(`
        INSERT INTO bonus_tiers (tier_number, name, min_signups, max_signups, color, bonus_display) VALUES
          (0, 'Rookie', 0, 5, '#71717a', ''),
          (1, 'Bronze', 6, 10, '#cd7f32', ''),
          (2, 'Silver', 11, 14, '#c0c0c0', ''),
          (3, 'Gold', 15, 19, '#ffd700', '$'),
          (4, 'Platinum', 20, 24, '#e5e4e2', '$$'),
          (5, 'Diamond', 25, 29, '#b9f2ff', '$$$'),
          (6, 'Elite', 30, 999, '#9333ea', '$$$$$')
        ON CONFLICT (tier_number) DO NOTHING
      `);
      results.push('✅ default tiers seeded');
    } catch (e: any) {
      results.push(`⚠️ seed tiers: ${e.message}`);
    }

    console.log('✅ Migration 019 completed');
    res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Migration 019 failed:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Migration 044: Contests System
app.post('/api/admin/run-migration-044', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const isAdminUser = await isAdmin(email);

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔧 Running Migration 044: Contests System...');
    const results: string[] = [];

    // Create contests table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS contests (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          contest_type VARCHAR(50) NOT NULL CHECK (contest_type IN ('company_wide', 'team_based', 'individual')),
          metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('signups', 'revenue', 'both')),
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          is_monthly BOOLEAN DEFAULT false,
          prize_description TEXT,
          rules TEXT,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      results.push('✅ contests table created');
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        results.push('✅ contests table already exists');
      } else {
        results.push(`⚠️ contests table: ${e.message}`);
      }
    }

    // Create contest_participants table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS contest_participants (
          id SERIAL PRIMARY KEY,
          contest_id INTEGER REFERENCES contests(id) ON DELETE CASCADE,
          sales_rep_id INTEGER REFERENCES sales_reps(id) ON DELETE CASCADE,
          team_name VARCHAR(255),
          is_team_leader BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(contest_id, sales_rep_id)
        )
      `);
      results.push('✅ contest_participants table created');
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        results.push('✅ contest_participants table already exists');
      } else {
        results.push(`⚠️ contest_participants table: ${e.message}`);
      }
    }

    // Create contest_standings table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS contest_standings (
          id SERIAL PRIMARY KEY,
          contest_id INTEGER REFERENCES contests(id) ON DELETE CASCADE,
          sales_rep_id INTEGER REFERENCES sales_reps(id) ON DELETE CASCADE,
          team_name VARCHAR(255),
          signups_count INTEGER DEFAULT 0,
          revenue_amount DECIMAL(15,2) DEFAULT 0,
          rank INTEGER,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(contest_id, sales_rep_id)
        )
      `);
      results.push('✅ contest_standings table created');
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        results.push('✅ contest_standings table already exists');
      } else {
        results.push(`⚠️ contest_standings table: ${e.message}`);
      }
    }

    // Create indexes
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_contests_active ON contests (is_active, start_date, end_date)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_contest_participants_contest ON contest_participants (contest_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_contest_standings_contest ON contest_standings (contest_id, rank)`);
      results.push('✅ contest indexes created');
    } catch (e: any) {
      results.push(`⚠️ indexes: ${e.message}`);
    }

    console.log('✅ Migration 044 completed');
    res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Migration 044 failed:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
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
// USER MEMORY ENDPOINTS
// ============================================================================

// Save user memories
app.post('/api/memory', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const userId = await getOrCreateUserIdByEmail(email);
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { memories } = req.body as {
      memories: Array<{
        memory_type: string;
        category: string;
        key: string;
        value: string;
        confidence: number;
        source_type?: string;
        source_session_id?: string;
        source_message_id?: string;
      }>;
    };

    if (!Array.isArray(memories) || memories.length === 0) {
      return res.status(400).json({ error: 'No memories provided' });
    }

    const savedMemories = [];

    for (const memory of memories) {
      // Use upsert to update existing or insert new
      const result = await pool.query(
        `INSERT INTO user_memory (user_id, memory_type, category, key, value, confidence, source_type, source_session_id, source_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, memory_type, category, key)
         DO UPDATE SET
           value = CASE WHEN EXCLUDED.confidence >= user_memory.confidence THEN EXCLUDED.value ELSE user_memory.value END,
           confidence = GREATEST(EXCLUDED.confidence, user_memory.confidence),
           source_type = EXCLUDED.source_type,
           source_session_id = EXCLUDED.source_session_id,
           last_updated = NOW()
         RETURNING id, memory_type, category, key, value, confidence`,
        [
          userId,
          memory.memory_type,
          memory.category,
          memory.key,
          memory.value,
          memory.confidence,
          memory.source_type || 'conversation',
          memory.source_session_id,
          memory.source_message_id
        ]
      );

      if (result.rows.length > 0) {
        savedMemories.push(result.rows[0]);
      }
    }

    console.log(`✅ Saved ${savedMemories.length} memories for user ${email}`);
    return res.json({ success: true, memories: savedMemories });
  } catch (error) {
    console.error('Error saving memories:', error);
    return res.status(500).json({ error: 'Failed to save memories' });
  }
});

// Get all user memories
app.get('/api/memory', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { limit = 20 } = req.query as { limit?: any };

    const result = await pool.query(
      `SELECT m.* FROM user_memory m
       JOIN users u ON m.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1)
         AND (m.expires_at IS NULL OR m.expires_at > NOW())
         AND m.confidence >= 0.5
       ORDER BY m.confidence DESC, m.times_referenced DESC, m.last_accessed DESC
       LIMIT $2`,
      [email, Number(limit) || 20]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Error fetching memories:', error);
    return res.status(500).json({ error: 'Failed to fetch memories' });
  }
});

// Get relevant memories for a query
app.get('/api/memory/relevant', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { query, limit = 10 } = req.query as { query?: string; limit?: any };

    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    // Use the database function for relevance search
    const result = await pool.query(
      `SELECT * FROM get_relevant_memories(
         (SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1),
         $2,
         $3
       )`,
      [email, query, Number(limit) || 10]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Error fetching relevant memories:', error);
    return res.status(500).json({ error: 'Failed to fetch relevant memories' });
  }
});

// Update memory feedback
app.post('/api/memory/:memoryId/feedback', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { memoryId } = req.params;
    const { feedback } = req.body as { feedback: 'helpful' | 'incorrect' | 'outdated' | 'irrelevant' };

    if (!feedback) {
      return res.status(400).json({ error: 'Feedback type required' });
    }

    // Update memory based on feedback
    let updateQuery = '';
    if (feedback === 'helpful') {
      updateQuery = `
        UPDATE user_memory SET
          times_helpful = times_helpful + 1,
          confidence = LEAST(1.0, confidence + 0.1),
          last_updated = NOW()
        WHERE id = $1
        RETURNING *`;
    } else if (feedback === 'incorrect') {
      updateQuery = `
        UPDATE user_memory SET
          times_incorrect = times_incorrect + 1,
          confidence = GREATEST(0, confidence - 0.3),
          last_updated = NOW()
        WHERE id = $1
        RETURNING *`;
    } else if (feedback === 'outdated' || feedback === 'irrelevant') {
      updateQuery = `
        UPDATE user_memory SET
          confidence = GREATEST(0, confidence - 0.2),
          last_updated = NOW()
        WHERE id = $1
        RETURNING *`;
    }

    const result = await pool.query(updateQuery, [memoryId]);

    // Log feedback
    await pool.query(
      `INSERT INTO memory_feedback (memory_id, user_id, feedback_type)
       SELECT $1, u.id, $2
       FROM users u WHERE LOWER(u.email) = LOWER($3)`,
      [memoryId, feedback, email]
    );

    return res.json({ success: true, memory: result.rows[0] });
  } catch (error) {
    console.error('Error updating memory feedback:', error);
    return res.status(500).json({ error: 'Failed to update memory' });
  }
});

// Delete a memory
app.delete('/api/memory/:memoryId', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { memoryId } = req.params;

    const result = await pool.query(
      `DELETE FROM user_memory
       WHERE id = $1 AND user_id = (SELECT id FROM users WHERE LOWER(email) = LOWER($2))
       RETURNING id`,
      [memoryId, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    return res.json({ success: true, deleted: memoryId });
  } catch (error) {
    console.error('Error deleting memory:', error);
    return res.status(500).json({ error: 'Failed to delete memory' });
  }
});

// Save conversation summary
app.post('/api/memory/summaries', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const userId = await getOrCreateUserIdByEmail(email);
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    const {
      session_id,
      summary,
      key_facts,
      decisions_reached,
      open_questions,
      action_items,
      topics,
      insurers_mentioned,
      states_mentioned,
      job_numbers_mentioned,
      message_count,
      user_sentiment,
      conversation_start,
      conversation_end
    } = req.body;

    if (!session_id || !summary) {
      return res.status(400).json({ error: 'session_id and summary required' });
    }

    const result = await pool.query(
      `INSERT INTO conversation_summaries (
         user_id, session_id, summary, key_facts, decisions_reached,
         open_questions, action_items, topics, insurers_mentioned,
         states_mentioned, job_numbers_mentioned, message_count,
         user_sentiment, conversation_start, conversation_end
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (user_id, session_id)
       DO UPDATE SET
         summary = EXCLUDED.summary,
         key_facts = EXCLUDED.key_facts,
         decisions_reached = EXCLUDED.decisions_reached,
         open_questions = EXCLUDED.open_questions,
         action_items = EXCLUDED.action_items,
         topics = EXCLUDED.topics,
         insurers_mentioned = EXCLUDED.insurers_mentioned,
         states_mentioned = EXCLUDED.states_mentioned,
         job_numbers_mentioned = EXCLUDED.job_numbers_mentioned,
         message_count = EXCLUDED.message_count,
         user_sentiment = EXCLUDED.user_sentiment
       RETURNING *`,
      [
        userId,
        session_id,
        summary,
        JSON.stringify(key_facts || []),
        JSON.stringify(decisions_reached || []),
        JSON.stringify(open_questions || []),
        JSON.stringify(action_items || []),
        JSON.stringify(topics || []),
        JSON.stringify(insurers_mentioned || []),
        JSON.stringify(states_mentioned || []),
        JSON.stringify(job_numbers_mentioned || []),
        message_count || 0,
        user_sentiment,
        conversation_start,
        conversation_end
      ]
    );

    console.log(`✅ Saved conversation summary for session ${session_id}`);
    return res.json({ success: true, summary: result.rows[0] });
  } catch (error) {
    console.error('Error saving conversation summary:', error);
    return res.status(500).json({ error: 'Failed to save summary' });
  }
});

// Get conversation summaries
app.get('/api/memory/summaries', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { limit = 10 } = req.query as { limit?: any };

    const result = await pool.query(
      `SELECT cs.* FROM conversation_summaries cs
       JOIN users u ON cs.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1)
       ORDER BY cs.created_at DESC
       LIMIT $2`,
      [email, Number(limit) || 10]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Error fetching conversation summaries:', error);
    return res.status(500).json({ error: 'Failed to fetch summaries' });
  }
});

// ============================================================================
// EMAIL PATTERN ENDPOINTS
// ============================================================================

// Track email generation
app.post('/api/email-patterns', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const userId = await getOrCreateUserIdByEmail(email);
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    const {
      email_type,
      insurer,
      state,
      subject_template,
      arguments_used,
      primary_argument,
      code_citations,
      tone,
      source_job_id,
      source_email_id
    } = req.body;

    if (!email_type) {
      return res.status(400).json({ error: 'email_type required' });
    }

    const result = await pool.query(
      `INSERT INTO email_patterns (
         user_id, email_type, insurer, state, subject_template,
         arguments_used, primary_argument, code_citations, tone,
         source_job_id, source_email_id, sent_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING *`,
      [
        userId,
        email_type,
        insurer,
        state,
        subject_template,
        JSON.stringify(arguments_used || []),
        primary_argument,
        JSON.stringify(code_citations || []),
        tone || 'professional',
        source_job_id,
        source_email_id
      ]
    );

    console.log(`✅ Tracked email pattern: ${email_type} for ${insurer || 'unknown insurer'}`);
    return res.json({ success: true, id: result.rows[0].id, pattern: result.rows[0] });
  } catch (error) {
    console.error('Error tracking email pattern:', error);
    return res.status(500).json({ error: 'Failed to track email pattern' });
  }
});

// Update email outcome
app.patch('/api/email-patterns/:patternId/outcome', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { patternId } = req.params;
    const {
      outcome,
      outcome_notes,
      response_time_days,
      amount_approved,
      is_successful,
      success_factors,
      outcome_recorded_at
    } = req.body;

    if (!outcome) {
      return res.status(400).json({ error: 'outcome required' });
    }

    const result = await pool.query(
      `UPDATE email_patterns SET
         outcome = $2,
         outcome_notes = $3,
         response_time_days = $4,
         amount_approved = $5,
         is_successful = $6,
         success_factors = $7,
         outcome_recorded_at = $8,
         updated_at = NOW()
       WHERE id = $1 AND user_id = (SELECT id FROM users WHERE LOWER(email) = LOWER($9))
       RETURNING *`,
      [
        patternId,
        outcome,
        outcome_notes,
        response_time_days,
        amount_approved,
        is_successful !== undefined ? is_successful : (outcome === 'approved' || outcome === 'partial'),
        JSON.stringify(success_factors || []),
        outcome_recorded_at || new Date().toISOString(),
        email
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pattern not found' });
    }

    console.log(`✅ Updated email pattern ${patternId} outcome: ${outcome}`);
    return res.json({ success: true, pattern: result.rows[0] });
  } catch (error) {
    console.error('Error updating email pattern outcome:', error);
    return res.status(500).json({ error: 'Failed to update outcome' });
  }
});

// Get email patterns (with filters)
app.get('/api/email-patterns', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const {
      insurer,
      state,
      email_type,
      outcome,
      successful_only,
      limit = 20
    } = req.query as {
      insurer?: string;
      state?: string;
      email_type?: string;
      outcome?: string;
      successful_only?: string;
      limit?: any;
    };

    let query = `
      SELECT ep.* FROM email_patterns ep
      JOIN users u ON ep.user_id = u.id
      WHERE LOWER(u.email) = LOWER($1)
    `;
    const params: any[] = [email];
    let paramIndex = 2;

    if (insurer) {
      query += ` AND LOWER(ep.insurer) = LOWER($${paramIndex++})`;
      params.push(insurer);
    }

    if (state) {
      query += ` AND ep.state = $${paramIndex++}`;
      params.push(state);
    }

    if (email_type) {
      query += ` AND ep.email_type = $${paramIndex++}`;
      params.push(email_type);
    }

    if (outcome) {
      query += ` AND ep.outcome = $${paramIndex++}`;
      params.push(outcome);
    }

    if (successful_only === 'true') {
      query += ` AND ep.is_successful = true`;
    }

    query += ` ORDER BY ep.created_at DESC LIMIT $${paramIndex}`;
    params.push(Number(limit) || 20);

    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (error) {
    console.error('Error fetching email patterns:', error);
    return res.status(500).json({ error: 'Failed to fetch email patterns' });
  }
});

// Get email pattern success rates
app.get('/api/email-patterns/success-rates', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { insurer, state } = req.query as { insurer?: string; state?: string };

    let query = `
      SELECT * FROM email_pattern_success_rates
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (insurer) {
      query += ` AND LOWER(insurer) = LOWER($${paramIndex++})`;
      params.push(insurer);
    }

    if (state) {
      query += ` AND state = $${paramIndex++}`;
      params.push(state);
    }

    query += ` ORDER BY success_rate_pct DESC NULLS LAST`;

    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (error) {
    console.error('Error fetching success rates:', error);
    return res.status(500).json({ error: 'Failed to fetch success rates' });
  }
});

// ============================================================================
// JOB CONVERSATION ENDPOINTS
// ============================================================================

// Get conversations linked to a job
app.get('/api/jobs/:jobId/conversations', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const { jobId } = req.params;

    const result = await pool.query(
      `SELECT cs.session_id, cs.summary, jcl.job_specific_decisions as key_decisions,
              cs.topics, cs.created_at as timestamp
       FROM job_conversation_links jcl
       JOIN conversation_summaries cs ON jcl.summary_id = cs.id
       JOIN users u ON jcl.user_id = u.id
       WHERE jcl.job_id = $1 AND LOWER(u.email) = LOWER($2)
       ORDER BY cs.created_at DESC
       LIMIT 20`,
      [jobId, email]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Error fetching job conversations:', error);
    return res.status(500).json({ error: 'Failed to fetch job conversations' });
  }
});

// Link a conversation to a job
app.post('/api/jobs/:jobId/conversations', async (req, res) => {
  try {
    const email = getRequestEmail(req);
    const userId = await getOrCreateUserIdByEmail(email);
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { jobId } = req.params;
    const { session_id, summary, key_decisions, topics } = req.body;

    if (!session_id || !summary) {
      return res.status(400).json({ error: 'session_id and summary required' });
    }

    // First, ensure the conversation summary exists
    const summaryResult = await pool.query(
      `INSERT INTO conversation_summaries (user_id, session_id, summary, topics, message_count)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (user_id, session_id) DO UPDATE SET summary = EXCLUDED.summary
       RETURNING id`,
      [userId, session_id, summary, JSON.stringify(topics || [])]
    );

    const summaryId = summaryResult.rows[0].id;

    // Create the link
    await pool.query(
      `INSERT INTO job_conversation_links (job_id, summary_id, user_id, job_specific_decisions)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (job_id, summary_id) DO UPDATE SET
         job_specific_decisions = EXCLUDED.job_specific_decisions`,
      [jobId, summaryId, userId, JSON.stringify(key_decisions || [])]
    );

    console.log(`✅ Linked conversation ${session_id} to job ${jobId}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error linking conversation to job:', error);
    return res.status(500).json({ error: 'Failed to link conversation' });
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
// UPLOADS (Static)
// ============================================================================

try {
  // Use Railway Volume on production, local path on dev
  const isRailwayEnv = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID;
  const uploadsDir = isRailwayEnv ? '/app/data/uploads' : path.resolve(process.cwd(), 'public/uploads');
  fs.mkdirSync(path.join(uploadsDir, 'headshots'), { recursive: true });
  fs.mkdirSync(path.join(uploadsDir, 'videos'), { recursive: true });
  app.use('/uploads', express.static(uploadsDir, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res, filePath) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (filePath.endsWith('.mp4') || filePath.endsWith('.m4v') || filePath.endsWith('.mov')) {
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
      }
    }
  }));
  console.log(`✅ Uploads serving from: ${uploadsDir} (railway=${isRailwayEnv})`);
} catch (e) {
  console.error('❌ Error configuring uploads serving:', e);
}

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
// MESSAGING ROUTES SETUP (must be before SPA fallback)
// ============================================================================

// Middleware to extract user ID for messaging and team routes
const authMiddleware = async (req: express.Request & { userId?: string; userEmail?: string }, res: express.Response, next: express.NextFunction) => {
  const email = getRequestEmail(req);
  if (email) {
    try {
      const result = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email]
      );
      if (result.rows.length > 0) {
        req.userId = result.rows[0].id;
        req.userEmail = email;
      }
    } catch (e) {
      console.error('Error getting user ID for messaging:', e);
    }
  }
  next();
};

// Apply auth middleware to messaging routes
app.use('/api/messages', authMiddleware);
app.use('/api/team', authMiddleware);

// Register messaging routes
app.use('/api/messages', createMessagingRoutes(pool));
app.use('/api', createMessagingRoutes(pool)); // Also mount /api/team

// Register job routes
app.use('/api/jobs', authMiddleware);
app.use('/api/jobs', jobRoutes);

// Register inspection and presentation routes
app.use('/api/inspections', authMiddleware);
app.use('/api/inspections', inspectionPresentationRoutes);
app.use('/api/presentations', authMiddleware);
app.use('/api/presentations', inspectionPresentationRoutes);
// Public presentation viewer (no auth required)
app.use('/api/present', inspectionPresentationRoutes);

// Register Susan AI chat routes
app.use('/api/susan', susanRoutes);

// Register roof (team feed) routes
app.use('/api/roof', authMiddleware);
app.use('/api/roof', createRoofRoutes(pool));

// Register storm memory routes
app.use('/api/storm-memory', authMiddleware);
app.use('/api/storm-memory', stormMemoryRoutes);

// Register canvassing routes
app.use('/api/canvassing', canvassingRoutes);

// Register check-in routes
app.use('/api/checkin', checkinRoutes);

// Register impacted assets routes (support legacy + new paths)
app.use('/api/assets', impactedAssetRoutes);
app.use('/api/impacted-assets', impactedAssetRoutes);

// Register push notification routes
app.use('/api/push', pushRoutes);

// Register territory management routes
app.use('/api/territories', territoryRoutes);

// Register SMS alert routes (Twilio storm notifications)
app.use('/api/alerts', alertRoutes);

// Register leaderboard routes (connects to RoofTrack database)
app.use('/api/leaderboard', createLeaderboardRoutes(pool));

// Register rep goals routes (individual rep goal tracking)
app.use('/api/rep', createRepGoalsRoutes(pool));

// Register contest routes (sales competitions and leaderboards)
app.use('/api', createContestRoutes(pool));

// Register QR profile routes (employee landing pages)
app.use('/api/profiles', createProfileRoutes(pool));
app.use('/api/qr-analytics', createQRAnalyticsRoutes(pool));
app.use('/api/profile-leads', createProfileLeadsRoutes(pool));

// Register agreement routes (e-signatures for Claim Auth and Contingency)
app.use('/api/agreements', createAgreementRoutes(pool));

// Register DocuSeal e-signature routes
app.use('/api/docuseal', createDocuSealRoutes(pool));

// Register document generation routes (Carbone templates)
app.use('/api/documents', createDocumentRoutes());

// ============================================================================
// PUBLIC PROFILE PAGE ROUTE (before SPA fallback)
// ============================================================================

// Serve public profile pages - SERVER-RENDERED HTML with inline styles
app.get('/profile/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    // Check if feature is enabled
    const featureResult = await pool.query(
      "SELECT enabled FROM feature_flags WHERE key = 'qr_profiles_enabled' LIMIT 1"
    );
    const featureEnabled = featureResult.rows[0]?.enabled === true;
    const isDev = process.env.NODE_ENV !== 'production';

    if (!featureEnabled && !isDev) {
      return next();
    }

    // Fetch profile from database
    const profileResult = await pool.query(
      'SELECT * FROM employee_profiles WHERE slug = $1 AND is_active = true LIMIT 1',
      [slug]
    );

    const profile = profileResult.rows[0];

    if (!profile) {
      return res.status(404).send(renderProfileNotFound());
    }

    // Track scan
    const userAgent = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || '';
    const ipHash = crypto.createHash('sha256').update(req.ip || '').digest('hex').substring(0, 16);
    const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);

    pool.query(
      `INSERT INTO qr_scans (profile_id, profile_slug, user_agent, referrer, ip_hash, device_type, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [profile.id, slug, userAgent, referrer, ipHash, isMobile ? 'mobile' : 'desktop', 'direct']
    ).catch(err => console.error('Error tracking scan:', err));

    // Render complete HTML page with inline styles
    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'no-store, max-age=0');
    res.send(renderProfilePage(profile));
  } catch (error) {
    console.error('Profile page error:', error);
    next();
  }
});

// Profile page HTML renderer - Complete version matching mypage21
function renderProfilePage(profile: any): string {
  const name = profile.name || 'Team Member';
  const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2);
  const role = profile.title || getRoleLabel(profile.role_type);
  const imageUrl = profile.image_url || '';
  const email = profile.email || '';
  const phone = profile.phone_number || '';
  const bio = profile.bio || '';
  const startYear = profile.start_year;
  const yearsExp = startYear ? new Date().getFullYear() - startYear : null;

  // Project images
  const projectImages = [
    '/lovable-uploads/359b0e2f-8075-497a-a848-a9e77471e392.png',
    '/lovable-uploads/f121ff88-cee5-488f-bd60-50b764306df1.png',
    '/lovable-uploads/a05b9082-6460-4174-91a0-ff5a6143613f.png',
    '/lovable-uploads/fd93bf35-9a8e-4112-a8dc-e96bac655cbc.png',
    '/lovable-uploads/c97b7966-6107-48c6-9e39-38051fff0bb3.png',
    '/lovable-uploads/c1fafb65-ebd7-4c4f-b197-0ba017cc097e.png'
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} - The Roof Docs</title>
  <link rel="icon" type="image/png" href="/roofdocs-logo.png">
  <meta name="description" content="Connect with ${name} at The Roof Docs. Schedule your free roof inspection today.">
  <meta property="og:title" content="${name} - The Roof Docs">
  <meta property="og:description" content="Schedule your free roof inspection with ${name}.">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: white; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 16px; }
    .section-title { font-size: 28px; font-weight: 700; text-align: center; margin-bottom: 12px; }
    .section-subtitle { font-size: 16px; color: #6b7280; text-align: center; margin-bottom: 32px; }

    /* Hero Section */
    .hero { background: linear-gradient(to bottom right, #0a0a0a, #171717, #000); padding: 48px 0; position: relative; }
    .hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.6), rgba(220,38,38,0.05)); }
    .hero-content { position: relative; z-index: 10; display: grid; grid-template-columns: 1fr; gap: 32px; align-items: center; }
    @media (min-width: 768px) { .hero-content { grid-template-columns: 1fr 1fr; } }
    .hero-left { text-align: center; }
    @media (min-width: 768px) { .hero-left { text-align: left; } }
    .profile-photo { width: 160px; height: 160px; border-radius: 50%; margin: 0 auto 24px; background: #262626; border: 4px solid rgba(220,38,38,0.3); display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    @media (min-width: 768px) { .profile-photo { width: 192px; height: 192px; margin: 0 0 24px; } }
    .profile-photo img { width: 100%; height: 100%; object-fit: cover; }
    .profile-initials { font-size: 48px; font-weight: bold; color: #dc2626; }
    .profile-name { font-size: 32px; font-weight: 800; margin-bottom: 8px; }
    @media (min-width: 768px) { .profile-name { font-size: 48px; } }
    .profile-role { font-size: 18px; font-weight: 600; color: #dc2626; margin-bottom: 12px; }
    .exp-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(220,38,38,0.2); color: #dc2626; padding: 8px 16px; border-radius: 50px; margin-bottom: 16px; font-size: 14px; font-weight: 500; }
    .profile-bio { color: #d1d5db; font-size: 14px; line-height: 1.6; margin-bottom: 24px; max-width: 400px; }
    .contact-buttons { display: flex; flex-direction: column; gap: 12px; }
    @media (min-width: 640px) { .contact-buttons { flex-direction: row; justify-content: center; } }
    @media (min-width: 768px) { .contact-buttons { justify-content: flex-start; } }
    .contact-btn { display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 12px 24px; border-radius: 8px; font-weight: 500; text-decoration: none; transition: background 0.2s; }
    .contact-btn:hover { background: rgba(255,255,255,0.2); }
    .video-section { background: linear-gradient(to bottom right, #262626, #0a0a0a); border-radius: 12px; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    .video-placeholder { text-align: center; padding: 24px; }
    .video-icon { width: 80px; height: 80px; border-radius: 50%; background: rgba(220,38,38,0.2); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
    .video-icon svg { width: 40px; height: 40px; fill: #dc2626; }
    .video-text { color: #9ca3af; font-size: 14px; }

    /* CTA Section */
    .cta-section { background: #dc2626; padding: 32px 0; text-align: center; }
    .cta-title { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    @media (min-width: 768px) { .cta-title { font-size: 32px; } }
    .cta-subtitle { font-size: 14px; margin-bottom: 16px; opacity: 0.9; }
    .cta-btn { display: inline-block; background: white; color: #dc2626; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none; transition: background 0.2s; }
    .cta-btn:hover { background: #f5f5f5; }

    /* Services Section */
    .services-section { background: white; color: #1a1a1a; padding: 48px 0; }
    .services-card { max-width: 900px; margin: 0 auto; background: #dc2626; color: white; border-radius: 16px; padding: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
    .services-grid { display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 24px; }
    @media (min-width: 768px) { .services-grid { grid-template-columns: 1fr 1fr; gap: 24px; } }
    .service-item { display: flex; align-items: flex-start; gap: 12px; }
    .service-dot { width: 8px; height: 8px; border-radius: 50%; background: white; margin-top: 8px; flex-shrink: 0; }
    .service-name { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
    .service-desc { font-size: 14px; color: #fecaca; }
    .services-cta { text-align: center; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.2); }
    .services-btn { display: inline-block; background: white; color: #dc2626; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none; border: none; cursor: pointer; font-size: 16px; }

    /* Why Choose Us - Enhanced */
    .why-section { background: #f5f5f5; color: #1a1a1a; padding: 48px 0; }
    .why-card { max-width: 700px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .why-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
    .why-header-icon { width: 48px; height: 48px; border-radius: 50%; background: rgba(220,38,38,0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .why-header-icon svg { width: 24px; height: 24px; stroke: #dc2626; fill: none; }
    .why-header-text h3 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .why-header-text p { color: #6b7280; font-size: 14px; }
    .stats-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .stat-box { background: #fef2f2; border-radius: 12px; padding: 20px; text-align: center; }
    .stat-number { font-size: 32px; font-weight: 700; color: #dc2626; margin-bottom: 4px; }
    .stat-label { font-size: 14px; color: #6b7280; }
    .cert-list { margin-bottom: 24px; }
    .cert-item { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
    .cert-icon { width: 24px; height: 24px; color: #dc2626; flex-shrink: 0; }
    .cert-text { font-size: 15px; font-weight: 500; }
    .why-btn { display: block; width: 100%; background: #dc2626; color: white; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; text-align: center; border: none; cursor: pointer; font-size: 16px; }

    /* Complete Project Solution */
    .process-section { background: white; color: #1a1a1a; padding: 48px 0; }
    .process-icon-top { width: 64px; height: 64px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; }
    .process-icon-top svg { width: 48px; height: 48px; stroke: #6b7280; fill: none; }
    .steps-grid { max-width: 900px; margin: 0 auto 32px; display: grid; grid-template-columns: 1fr; gap: 24px; }
    @media (min-width: 768px) { .steps-grid { grid-template-columns: 1fr 1fr; } }
    .step-item { display: flex; align-items: flex-start; gap: 16px; }
    .step-icon { width: 48px; height: 48px; border-radius: 12px; background: #fef2f2; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .step-icon svg { width: 24px; height: 24px; stroke: #dc2626; fill: none; }
    .step-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .step-desc { font-size: 14px; color: #6b7280; }
    .process-buttons { display: flex; flex-direction: column; gap: 12px; justify-content: center; align-items: center; }
    @media (min-width: 640px) { .process-buttons { flex-direction: row; } }
    .process-btn { padding: 14px 32px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 16px; }
    .process-btn-outline { background: white; color: #dc2626; border: 2px solid #dc2626; }
    .process-btn-fill { background: #dc2626; color: white; border: 2px solid #dc2626; }

    /* Reviews Section */
    .reviews-section { background: #f5f5f5; color: #1a1a1a; padding: 48px 0; }
    .reviews-grid { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr; gap: 24px; }
    @media (min-width: 768px) { .reviews-grid { grid-template-columns: 1fr 1fr 1fr; } }
    .review-card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .review-stars { display: flex; gap: 4px; margin-bottom: 12px; }
    .review-star { width: 20px; height: 20px; fill: #dc2626; }
    .review-text { font-size: 15px; color: #374151; line-height: 1.6; margin-bottom: 16px; }
    .review-author { font-weight: 600; color: #1a1a1a; }

    /* Gallery Section */
    .gallery-section { background: white; color: #1a1a1a; padding: 48px 0; }
    .gallery-grid { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (min-width: 768px) { .gallery-grid { grid-template-columns: 1fr 1fr 1fr; } }
    .gallery-img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 12px; }

    /* Contact Form */
    .form-section { background: white; color: #1a1a1a; padding: 48px 0; }
    .form-container { max-width: 700px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .form-title { font-size: 24px; font-weight: 700; text-align: center; margin-bottom: 24px; color: #1a1a1a; }
    .form-row { display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 16px; }
    @media (min-width: 768px) { .form-row { grid-template-columns: 1fr 1fr; } }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px; }
    .form-input, .form-select, .form-textarea { width: 100%; padding: 12px 16px; background: white; border: 1px solid #d1d5db; border-radius: 8px; color: #1a1a1a; font-size: 16px; }
    .form-input::placeholder, .form-textarea::placeholder { color: #9ca3af; }
    .form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.1); }
    .form-textarea { resize: none; min-height: 100px; }
    .form-submit { width: 100%; background: #dc2626; color: white; font-weight: 600; padding: 14px 32px; border-radius: 8px; border: none; cursor: pointer; font-size: 16px; }
    .form-submit:hover { background: #b91c1c; }
    .form-success { text-align: center; padding: 32px; }
    .success-icon { width: 64px; height: 64px; border-radius: 50%; background: rgba(34,197,94,0.2); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
    .success-icon svg { width: 32px; height: 32px; stroke: #22c55e; fill: none; }
    .success-title { font-size: 20px; font-weight: 700; color: #22c55e; margin-bottom: 8px; }
    .success-text { color: #6b7280; }
    .form-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 12px 16px; border-radius: 8px; font-size: 14px; margin-bottom: 16px; }

    /* Footer */
    .footer { background: #1a1a1a; padding: 24px 0; text-align: center; }
    .footer-logo { font-size: 18px; font-weight: 700; margin-bottom: 8px; color: white; }
    .footer-text { color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <!-- Hero Section -->
  <section class="hero">
    <div class="container">
      <div class="hero-content">
        <div class="hero-left">
          <div class="profile-photo">
            ${imageUrl ? `<img src="${imageUrl}" alt="${name}">` : `<span class="profile-initials">${initials}</span>`}
          </div>
          <h1 class="profile-name">${name}</h1>
          <p class="profile-role">${role}</p>
          ${yearsExp ? `<div class="exp-badge"><svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${yearsExp} Years of Experience</div>` : ''}
          ${bio ? `<p class="profile-bio">${bio}</p>` : ''}
          <div class="contact-buttons">
            ${phone ? `<a href="tel:${phone}" class="contact-btn"><svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>${phone}</a>` : ''}
            ${email ? `<a href="mailto:${email}" class="contact-btn"><svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>Email</a>` : ''}
          </div>
        </div>
        <div class="video-section">
          <div class="video-placeholder">
            <div class="video-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
            <p class="video-text">Video coming soon</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA Section -->
  <section class="cta-section">
    <div class="container">
      <h2 class="cta-title">Get Your FREE Home Inspection Today!</h2>
      <p class="cta-subtitle">Professional assessment of your roof, siding, gutters, windows, and doors</p>
      <a href="#contact-form" class="cta-btn">Schedule Free Inspection</a>
    </div>
  </section>

  <!-- Services Section -->
  <section class="services-section">
    <div class="container">
      <h2 class="section-title" style="color:#1a1a1a">Our Services</h2>
      <div class="services-card">
        <div class="services-grid">
          <div class="service-item"><div class="service-dot"></div><div><div class="service-name">Roofing</div><div class="service-desc">Complete roof replacement and repairs</div></div></div>
          <div class="service-item"><div class="service-dot"></div><div><div class="service-name">Siding</div><div class="service-desc">Vinyl, wood, and fiber cement siding</div></div></div>
          <div class="service-item"><div class="service-dot"></div><div><div class="service-name">Gutters</div><div class="service-desc">Seamless gutter installation and repair</div></div></div>
          <div class="service-item"><div class="service-dot"></div><div><div class="service-name">Windows & Doors</div><div class="service-desc">Energy-efficient windows and door installation</div></div></div>
          <div class="service-item"><div class="service-dot"></div><div><div class="service-name">Solar</div><div class="service-desc">Solar panel installation and energy solutions</div></div></div>
        </div>
        <div class="services-cta"><a href="#contact-form" class="services-btn">Schedule Free Inspection</a></div>
      </div>
    </div>
  </section>

  <!-- Why Choose Us - Enhanced -->
  <section class="why-section">
    <div class="container">
      <h2 class="section-title" style="color:#1a1a1a">Why Choose Us</h2>
      <p class="section-subtitle">Local expertise, proven results, and complete project solutions</p>
      <div class="why-card">
        <div class="why-header">
          <div class="why-header-icon"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg></div>
          <div class="why-header-text">
            <h3>Local & Trusted</h3>
            <p>Your Neighborhood Experts</p>
          </div>
        </div>
        <div class="stats-row">
          <div class="stat-box"><div class="stat-number">9</div><div class="stat-label">Years in Business</div></div>
          <div class="stat-box"><div class="stat-number">5,000+</div><div class="stat-label">Projects Completed</div></div>
        </div>
        <div class="cert-list">
          <div class="cert-item"><svg class="cert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg><span class="cert-text">GAF Master Elite</span></div>
          <div class="cert-item"><svg class="cert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg><span class="cert-text">Licensed & Insured</span></div>
          <div class="cert-item"><svg class="cert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg><span class="cert-text">BBB A+ Rating</span></div>
          <div class="cert-item"><svg class="cert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span class="cert-text">Lifetime Warranty</span></div>
          <div class="cert-item"><svg class="cert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg><span class="cert-text">Family-Owned Business</span></div>
        </div>
        <a href="#gallery" class="why-btn">See Local Projects</a>
      </div>
    </div>
  </section>

  <!-- Complete Project Solution -->
  <section class="process-section">
    <div class="container">
      <div class="process-icon-top"><svg viewBox="0 0 24 24" stroke-width="1.5"><path d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"/></svg></div>
      <h2 class="section-title" style="color:#1a1a1a">Complete Project Solution</h2>
      <p class="section-subtitle">From tear-off to solar - we handle everything</p>
      <div class="steps-grid">
        <div class="step-item"><div class="step-icon"><svg viewBox="0 0 24 24" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div><div><div class="step-title">Step 1: Free Inspection</div><div class="step-desc">Comprehensive roof and property assessment</div></div></div>
        <div class="step-item"><div class="step-icon"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div><div><div class="step-title">Step 2: Insurance Coordination</div><div class="step-desc">We handle all insurance paperwork and claims</div></div></div>
        <div class="step-item"><div class="step-icon"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></div><div><div class="step-title">Step 3: Professional Tear-Off</div><div class="step-desc">Safe removal of old materials with cleanup</div></div></div>
        <div class="step-item"><div class="step-icon"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg></div><div><div class="step-title">Step 4: Premium Installation</div><div class="step-desc">Top-quality materials with expert craftsmanship</div></div></div>
        <div class="step-item"><div class="step-icon"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg></div><div><div class="step-title">Step 5: Solar Integration</div><div class="step-desc">Optional solar panel installation for energy savings</div></div></div>
        <div class="step-item"><div class="step-icon"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div><div class="step-title">Step 6: Final Walkthrough</div><div class="step-desc">Quality check and lifetime warranty activation</div></div></div>
      </div>
      <div class="process-buttons">
        <a href="https://www.theroofdocs.com" target="_blank" class="process-btn process-btn-outline">See Our Complete Process</a>
        <a href="#contact-form" class="process-btn process-btn-fill">Get Your Free Inspection</a>
      </div>
    </div>
  </section>

  <!-- Reviews Section -->
  <section class="reviews-section">
    <div class="container">
      <h2 class="section-title" style="color:#1a1a1a">What Our Customers Say</h2>
      <div class="reviews-grid">
        <div class="review-card">
          <div class="review-stars"><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg></div>
          <p class="review-text">"The Roof Docs did an amazing job on our roof replacement. Professional team and quality work!"</p>
          <p class="review-author">- Mike Thompson</p>
        </div>
        <div class="review-card">
          <div class="review-stars"><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg></div>
          <p class="review-text">"Excellent service from start to finish. Our new siding looks fantastic!"</p>
          <p class="review-author">- Jennifer Martinez</p>
        </div>
        <div class="review-card">
          <div class="review-stars"><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg><svg class="review-star" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg></div>
          <p class="review-text">"Outstanding window installation. Energy efficient and beautiful. Highly recommend The Roof Docs!"</p>
          <p class="review-author">- Robert Chen</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Gallery Section -->
  <section id="gallery" class="gallery-section">
    <div class="container">
      <h2 class="section-title" style="color:#1a1a1a">Our Recent Projects</h2>
      <div class="gallery-grid">
        ${projectImages.map(img => `<img src="${img}" alt="Project" class="gallery-img" onerror="this.style.display='none'">`).join('')}
      </div>
    </div>
  </section>

  <!-- Contact Form -->
  <section id="contact-form" class="form-section">
    <div class="container">
      <div class="form-container">
        <h2 class="form-title">Request Your Free Estimate with ${name}</h2>
        <div id="form-error" class="form-error" style="display:none;"></div>
        <form id="contact-form-el">
          <div class="form-row">
            <div><label class="form-label">Name *</label><input type="text" name="name" required class="form-input" placeholder="John Doe"></div>
            <div><label class="form-label">Email *</label><input type="email" name="email" required class="form-input" placeholder="john@example.com"></div>
          </div>
          <div class="form-row">
            <div><label class="form-label">Phone Number</label><input type="tel" name="phone" class="form-input" placeholder="(555) 123-4567"></div>
            <div><label class="form-label">Service Needed</label>
              <select name="service" class="form-select">
                <option value="">Select a service...</option>
                <option value="roof_inspection">Roof Inspection</option>
                <option value="roof_repair">Roof Repair</option>
                <option value="roof_replacement">Roof Replacement</option>
                <option value="storm_damage">Storm Damage</option>
                <option value="siding">Siding</option>
                <option value="gutters">Gutters</option>
                <option value="windows_doors">Windows & Doors</option>
                <option value="solar">Solar</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div class="form-group"><label class="form-label">Address</label><input type="text" name="address" class="form-input" placeholder="123 Main Street, City, State"></div>
          <div class="form-group"><label class="form-label">Message</label><textarea name="message" class="form-textarea" placeholder="Tell us about your project..."></textarea></div>
          <button type="submit" class="form-submit">Request Free Estimate</button>
        </form>
        <div id="form-success" class="form-success" style="display:none;">
          <div class="success-icon"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg></div>
          <h3 class="success-title">Thank You!</h3>
          <p class="success-text">${name} will contact you soon!</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="container">
      <div class="footer-logo">The Roof Docs</div>
      <p class="footer-text">© ${new Date().getFullYear()} The Roof Docs. All rights reserved.</p>
    </div>
  </footer>

  <script>
    const form = document.getElementById('contact-form-el');
    const formError = document.getElementById('form-error');
    const formSuccess = document.getElementById('form-success');
    const profileId = '${profile.id}';
    const profileSlug = '${profile.slug}';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      formError.style.display = 'none';
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      const formData = new FormData(form);
      const data = {
        profile_id: profileId,
        profile_slug: profileSlug,
        homeowner_name: formData.get('name'),
        homeowner_email: formData.get('email'),
        homeowner_phone: formData.get('phone') || null,
        homeowner_address: formData.get('address') || null,
        service_interest: formData.get('service') || null,
        message: formData.get('message') || null,
        source: 'qr_landing'
      };

      try {
        const res = await fetch('/api/profiles/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
          form.style.display = 'none';
          formSuccess.style.display = 'block';
        } else {
          throw new Error(result.error || 'Failed to submit');
        }
      } catch (err) {
        formError.textContent = err.message || 'Something went wrong. Please try again.';
        formError.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Request Free Estimate';
      }
    });
  </script>
</body>
</html>`;
}

function renderProfileNotFound(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Profile Not Found - The Roof Docs</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { text-align: center; padding: 24px; }
    h1 { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
    p { color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Profile Not Found</h1>
    <p>The page you're looking for doesn't exist.</p>
  </div>
</body>
</html>`;
}

function getRoleLabel(roleType: string): string {
  const labels: Record<string, string> = {
    'admin': 'Administrator',
    'sales_rep': 'Sales Representative',
    'sales_manager': 'Sales Manager',
    'team_lead': 'Team Lead',
    'field_trainer': 'Field Trainer',
    'manager': 'Manager',
  };
  return labels[roleType] || 'Team Member';
}

// ============================================================================
// PUBLIC PRESENTATION VIEWER ROUTE (before SPA fallback)
// ============================================================================

// Serve public presentation viewer at /present/:token
app.get('/present/:token', (req, res, next) => {
  try {
    const distDir = path.join(process.cwd(), 'dist');
    const presentPath = path.join(distDir, 'present.html');

    if (fs.existsSync(presentPath)) {
      res.set('Cache-Control', 'no-store, max-age=0');
      res.sendFile(presentPath);
    } else {
      // In development, fallback to dev server
      console.log('⚠️  present.html not found, check if build is complete');
      next();
    }
  } catch (error) {
    console.error('Presentation viewer error:', error);
    next();
  }
});

// ============================================================================
// SPA FALLBACK (must be after all API routes)
// ============================================================================

// SPA fallback only for non-asset, non-API GET requests that accept HTML
app.get('*', (req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
  // Do not hijack real asset requests (contain a dot extension or /assets)
  if (req.path.includes('.') || req.path.startsWith('/assets')) return next();
  if (!req.accepts('html')) return next();
  // Send index.html for SPA routing
  const distDir = path.join(process.cwd(), 'dist');
  res.set('Cache-Control', 'no-store, max-age=0');
  res.sendFile(path.join(distDir, 'index.html'));
});

// ============================================================================
// START SERVER
// ============================================================================

async function processFeedbackFollowups(): Promise<void> {
  try {
    const due = await pool.query(
      `SELECT f.id, f.feedback_id, f.user_id, f.reminder_number, f.due_at,
              u.email
       FROM feedback_followups f
       JOIN users u ON u.id = f.user_id
       WHERE f.status = 'pending' AND f.due_at <= NOW()
       ORDER BY f.due_at ASC
       LIMIT 100`
    );

    if (due.rows.length === 0) return;

    const presence = getPresenceService();

    for (const row of due.rows) {
      const title = row.reminder_number === 1 ? 'Susan follow-up (1 week)' : 'Susan follow-up (2 weeks)';
      const body = 'How did the outcome go? Tap to update the result so Susan can learn.';

      const notificationResult = await pool.query(
        `INSERT INTO team_notifications (user_id, type, title, body, data)
         VALUES ($1, 'system', $2, $3, $4)
         RETURNING *`,
        [
          row.user_id,
          title,
          body,
          {
            feedback_id: row.feedback_id,
            reminder_number: row.reminder_number,
            due_at: row.due_at
          }
        ]
      );

      await pool.query(
        `UPDATE feedback_followups
         SET status = 'sent', sent_at = NOW()
         WHERE id = $1`,
        [row.id]
      );

      if (presence) {
        presence.emitNotification(row.user_id, notificationResult.rows[0]);
      }
    }
  } catch (error) {
    console.error('Failed to process feedback followups:', error);
  }
}

// Auto-run migrations on server startup
async function runStartupMigrations() {
  try {
    // Create leaderboard_goals table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leaderboard_goals (
        id SERIAL PRIMARY KEY,
        sales_rep_id INTEGER NOT NULL,
        monthly_signup_goal INTEGER NOT NULL CHECK (monthly_signup_goal > 0),
        yearly_revenue_goal DECIMAL(12, 2) NOT NULL CHECK (yearly_revenue_goal > 0),
        month VARCHAR(7) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT unique_rep_month UNIQUE(sales_rep_id, month)
      );
      CREATE INDEX IF NOT EXISTS idx_leaderboard_goals_month ON leaderboard_goals(month);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_goals_rep ON leaderboard_goals(sales_rep_id);
    `);
    console.log('✅ Startup migrations completed');
  } catch (error: any) {
    // Ignore "already exists" errors
    if (!error.message?.includes('already exists')) {
      console.error('⚠️  Migration warning:', error.message);
    }
  }
}

// Run migrations then start server
runStartupMigrations().then(() => {
httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 API Server running on ${HOST}:${PORT}`);
  console.log(`🌐 NODE_ENV=${process.env.NODE_ENV || 'unknown'} PORT=${process.env.PORT || 'unset'}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);

  // Initialize WebSocket presence service
  try {
    initializePresenceService(httpServer, pool, allowedOrigins);
    console.log('✅ WebSocket presence service initialized');
  } catch (error) {
    console.error('⚠️  Failed to initialize WebSocket:', error);
    console.log('💡 REST API will continue without real-time updates');
  }

  // Start automated email cron jobs
  try {
    cronService.startAll(pool);
    console.log('✅ Automated email scheduling initialized');
  } catch (error) {
    console.error('⚠️  Failed to start cron jobs:', error);
    console.log('💡 Email notifications will still work via manual triggers');
  }

  // Process feedback follow-up reminders hourly
  processFeedbackFollowups();
  setInterval(processFeedbackFollowups, 60 * 60 * 1000);
});
});

export default app;
