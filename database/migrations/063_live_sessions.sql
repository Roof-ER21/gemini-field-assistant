-- Migration 063: Live Sessions (LiveKit team video rooms)
-- Tracks active and past live sessions for the Teams page

CREATE TABLE IF NOT EXISTS live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL DEFAULT 'Live Session',
  host_user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  participant_count INTEGER NOT NULL DEFAULT 1,
  max_participants INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('host', 'viewer')),
  UNIQUE(session_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON live_sessions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_live_sessions_host ON live_sessions(host_user_id);
CREATE INDEX IF NOT EXISTS idx_live_session_participants_session ON live_session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_live_session_participants_user ON live_session_participants(user_id);
