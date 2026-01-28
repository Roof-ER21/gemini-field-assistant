-- ==========================================================================
-- Migration 016: Chat Feedback & Learning
-- Captures user feedback on Susan responses
-- ==========================================================================

CREATE TABLE IF NOT EXISTS chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(255),
  message_id VARCHAR(255),
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  tags TEXT[],
  comment TEXT,
  response_excerpt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_feedback_user ON chat_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_session ON chat_feedback(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_rating ON chat_feedback(rating, created_at DESC);

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 016: Chat feedback created successfully!';
END $$;
