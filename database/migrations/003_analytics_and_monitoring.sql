-- Migration 003: Analytics and Monitoring Enhancement
-- Description: Add tables for Live Susan sessions, transcriptions, uploads, and concerning chat detection
-- Date: 2025-01-05

-- =============================================================================
-- 1. LIVE SUSAN SESSIONS TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS live_susan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  message_count INTEGER DEFAULT 0,
  double_tap_stops INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Indexes for performance
  CONSTRAINT live_susan_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_live_susan_sessions_user_id ON live_susan_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_live_susan_sessions_started_at ON live_susan_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_live_susan_sessions_created_at ON live_susan_sessions(created_at);

-- =============================================================================
-- 2. TRANSCRIPTIONS TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audio_duration_seconds INTEGER,
  transcription_text TEXT,
  word_count INTEGER,
  provider VARCHAR(50) DEFAULT 'Gemini',
  state VARCHAR(2), -- VA, MD, PA
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT transcriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_transcriptions_user_id ON transcriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at ON transcriptions(created_at);
CREATE INDEX IF NOT EXISTS idx_transcriptions_state ON transcriptions(state);

-- =============================================================================
-- 3. DOCUMENT UPLOADS TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255),
  file_type VARCHAR(50), -- pdf, jpg, png, docx, etc.
  file_size_bytes INTEGER,
  analysis_performed BOOLEAN DEFAULT FALSE,
  analysis_type VARCHAR(50), -- roof_damage, insurance_doc, general
  analysis_result TEXT,
  state VARCHAR(2), -- VA, MD, PA
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT document_uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_document_uploads_user_id ON document_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_document_uploads_created_at ON document_uploads(created_at);
CREATE INDEX IF NOT EXISTS idx_document_uploads_file_type ON document_uploads(file_type);
CREATE INDEX IF NOT EXISTS idx_document_uploads_analysis_type ON document_uploads(analysis_type);

-- =============================================================================
-- 4. CONCERNING CHATS MONITORING
-- =============================================================================

CREATE TABLE IF NOT EXISTS concerning_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id VARCHAR(100),
  concern_type VARCHAR(50) NOT NULL, -- state_mismatch, off_topic, inappropriate, misinformation, legal, confusion
  severity VARCHAR(20) NOT NULL, -- critical, warning, info
  flagged_content TEXT NOT NULL,
  context TEXT, -- Surrounding messages for context
  detection_reason TEXT, -- Why it was flagged
  flagged_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  review_notes TEXT,

  CONSTRAINT concerning_chats_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT concerning_chats_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_concerning_chats_user_id ON concerning_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_concerning_chats_session_id ON concerning_chats(session_id);
CREATE INDEX IF NOT EXISTS idx_concerning_chats_concern_type ON concerning_chats(concern_type);
CREATE INDEX IF NOT EXISTS idx_concerning_chats_severity ON concerning_chats(severity);
CREATE INDEX IF NOT EXISTS idx_concerning_chats_flagged_at ON concerning_chats(flagged_at);
CREATE INDEX IF NOT EXISTS idx_concerning_chats_reviewed ON concerning_chats(reviewed);

-- =============================================================================
-- 5. ANALYTICS VIEWS FOR PERFORMANCE
-- =============================================================================

-- User Activity Summary (Enhanced)
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

-- Daily Activity Metrics
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

-- =============================================================================
-- 6. GRANT PERMISSIONS (if needed)
-- =============================================================================

-- Grant appropriate permissions to application user
-- GRANT ALL PRIVILEGES ON live_susan_sessions TO your_app_user;
-- GRANT ALL PRIVILEGES ON transcriptions TO your_app_user;
-- GRANT ALL PRIVILEGES ON document_uploads TO your_app_user;
-- GRANT ALL PRIVILEGES ON concerning_chats TO your_app_user;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

COMMENT ON TABLE live_susan_sessions IS 'Tracks Live Susan voice assistant sessions';
COMMENT ON TABLE transcriptions IS 'Tracks voice transcription usage';
COMMENT ON TABLE document_uploads IS 'Tracks document and image uploads for analysis';
COMMENT ON TABLE concerning_chats IS 'Flags concerning or problematic chat conversations for admin review';
