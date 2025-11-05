// Inline Analytics Migration for Railway
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.log('No DATABASE_URL found');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
});

const migrationSQL = `
-- Migration 003: Analytics and Monitoring Enhancement

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

CREATE INDEX IF NOT EXISTS idx_live_susan_sessions_user_id ON live_susan_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_live_susan_sessions_started_at ON live_susan_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_live_susan_sessions_created_at ON live_susan_sessions(created_at);

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

CREATE INDEX IF NOT EXISTS idx_transcriptions_user_id ON transcriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at ON transcriptions(created_at);
CREATE INDEX IF NOT EXISTS idx_transcriptions_state ON transcriptions(state);

CREATE TABLE IF NOT EXISTS document_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255),
  file_type VARCHAR(50),
  file_size_bytes INTEGER,
  analysis_performed BOOLEAN DEFAULT FALSE,
  analysis_type VARCHAR(50),
  analysis_result TEXT,
  state VARCHAR(2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_uploads_user_id ON document_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_document_uploads_created_at ON document_uploads(created_at);
CREATE INDEX IF NOT EXISTS idx_document_uploads_file_type ON document_uploads(file_type);
CREATE INDEX IF NOT EXISTS idx_document_uploads_analysis_type ON document_uploads(analysis_type);

CREATE TABLE IF NOT EXISTS concerning_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id VARCHAR(100),
  concern_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  flagged_content TEXT NOT NULL,
  context TEXT,
  detection_reason TEXT,
  flagged_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  review_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_concerning_chats_user_id ON concerning_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_concerning_chats_session_id ON concerning_chats(session_id);
CREATE INDEX IF NOT EXISTS idx_concerning_chats_concern_type ON concerning_chats(concern_type);
CREATE INDEX IF NOT EXISTS idx_concerning_chats_severity ON concerning_chats(severity);
CREATE INDEX IF NOT EXISTS idx_concerning_chats_flagged_at ON concerning_chats(flagged_at);
CREATE INDEX IF NOT EXISTS idx_concerning_chats_reviewed ON concerning_chats(reviewed);

CREATE OR REPLACE VIEW user_activity_enhanced AS
SELECT
  u.id AS user_id,
  u.email,
  u.name,
  u.role,
  u.state,
  COUNT(DISTINCT ch.id) AS total_messages,
  COUNT(DISTINCT eg.id) AS emails_generated,
  COUNT(DISTINCT t.id) AS transcriptions_created,
  COUNT(DISTINCT du.id) AS documents_uploaded,
  COUNT(DISTINCT lss.id) AS susan_sessions,
  COUNT(DISTINCT dv.document_path) AS unique_documents_viewed,
  COUNT(DISTINCT df.id) AS favorite_documents,
  COUNT(DISTINCT ia.id) AS images_analyzed,
  MAX(ch.created_at) AS last_active,
  u.created_at AS user_since
FROM users u
LEFT JOIN chat_history ch ON u.id = ch.user_id
LEFT JOIN email_generation_log eg ON u.id = eg.user_id
LEFT JOIN transcriptions t ON u.id = t.user_id
LEFT JOIN document_uploads du ON u.id = du.user_id
LEFT JOIN live_susan_sessions lss ON u.id = lss.user_id
LEFT JOIN document_views dv ON u.id = dv.user_id
LEFT JOIN document_favorites df ON u.id = df.user_id
LEFT JOIN image_analysis_log ia ON u.id = ia.user_id
GROUP BY u.id, u.email, u.name, u.role, u.state, u.created_at;

CREATE OR REPLACE VIEW daily_activity_metrics AS
SELECT
  DATE(created_at) AS activity_date,
  'chat' AS activity_type,
  COUNT(*) AS count
FROM chat_history
GROUP BY DATE(created_at)
UNION ALL
SELECT
  DATE(created_at) AS activity_date,
  'email' AS activity_type,
  COUNT(*) AS count
FROM email_generation_log
GROUP BY DATE(created_at)
UNION ALL
SELECT
  DATE(created_at) AS activity_date,
  'transcription' AS activity_type,
  COUNT(*) AS count
FROM transcriptions
GROUP BY DATE(created_at)
UNION ALL
SELECT
  DATE(created_at) AS activity_date,
  'upload' AS activity_type,
  COUNT(*) AS count
FROM document_uploads
GROUP BY DATE(created_at)
UNION ALL
SELECT
  DATE(started_at) AS activity_date,
  'susan_session' AS activity_type,
  COUNT(*) AS count
FROM live_susan_sessions
GROUP BY DATE(started_at)
UNION ALL
SELECT
  DATE(last_viewed_at) AS activity_date,
  'knowledge_base' AS activity_type,
  COUNT(DISTINCT user_id) AS count
FROM document_views
GROUP BY DATE(last_viewed_at);
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Connected to database');
    await client.query(migrationSQL);
    console.log('Migration completed successfully');

    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('live_susan_sessions', 'transcriptions', 'document_uploads', 'concerning_chats')
      ORDER BY table_name;
    `);

    console.log('Tables created:');
    result.rows.forEach(row => console.log(' -', row.table_name));

  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
