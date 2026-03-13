-- Migration 065: LiveKit Enhancements
-- In-room chat, 1:1 calling, recording, session history

-- ============================================================
-- 1. In-Room Chat Messages
-- ============================================================

CREATE TABLE IF NOT EXISTS live_session_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID        NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES users(id),
  message          TEXT        NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_session_messages_session
  ON live_session_messages (session_id, created_at);

-- ============================================================
-- 2. 1:1 Call Invites
-- ============================================================

CREATE TABLE IF NOT EXISTS live_call_invites (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id        UUID        NOT NULL REFERENCES users(id),
  callee_id        UUID        NOT NULL REFERENCES users(id),
  session_id       UUID        REFERENCES live_sessions(id) ON DELETE SET NULL,
  status           TEXT        DEFAULT 'ringing'
                               CHECK (status IN ('ringing','accepted','declined','missed','cancelled')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  answered_at      TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_call_invites_callee
  ON live_call_invites (callee_id, status)
  WHERE status = 'ringing';

CREATE INDEX IF NOT EXISTS idx_live_call_invites_caller
  ON live_call_invites (caller_id, created_at DESC);

-- ============================================================
-- 3. Session Recordings
-- ============================================================

CREATE TABLE IF NOT EXISTS live_session_recordings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID        NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  egress_id        TEXT,       -- LiveKit Egress ID
  status           TEXT        DEFAULT 'recording'
                               CHECK (status IN ('recording','processing','ready','failed')),
  file_url         TEXT,       -- URL to download/stream the recording
  file_size_bytes  BIGINT,
  duration_seconds INTEGER,
  started_by       UUID        REFERENCES users(id),
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_live_session_recordings_session
  ON live_session_recordings (session_id);

-- ============================================================
-- 4. Enhance live_sessions table
-- ============================================================

-- Session type: broadcast (go live) vs call (1:1)
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'broadcast'
  CHECK (session_type IN ('broadcast', 'call'));

-- Link session to a job for context
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS job_id UUID;

-- Add recording_url shortcut
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- Index for session history queries
CREATE INDEX IF NOT EXISTS idx_live_sessions_ended
  ON live_sessions (ended_at DESC)
  WHERE status = 'ended';

CREATE INDEX IF NOT EXISTS idx_live_sessions_job
  ON live_sessions (job_id)
  WHERE job_id IS NOT NULL;
