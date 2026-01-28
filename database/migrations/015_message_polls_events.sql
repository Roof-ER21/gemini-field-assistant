-- ==========================================================================
-- Migration 015: Polls & Events Message Types
-- Adds poll/event message types and vote/RSVP tracking
-- ==========================================================================

-- Extend message_type check constraint to include poll and event
ALTER TABLE team_messages
  DROP CONSTRAINT IF EXISTS team_messages_message_type_check;

ALTER TABLE team_messages
  ADD CONSTRAINT team_messages_message_type_check
  CHECK (message_type IN ('text', 'shared_chat', 'shared_email', 'system', 'poll', 'event'));

-- Poll votes
CREATE TABLE IF NOT EXISTS message_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_poll_votes_message ON message_poll_votes(message_id);
CREATE INDEX IF NOT EXISTS idx_message_poll_votes_user ON message_poll_votes(user_id);

-- Event RSVPs
CREATE TABLE IF NOT EXISTS message_event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('going', 'maybe', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_event_rsvps_message ON message_event_rsvps(message_id);
CREATE INDEX IF NOT EXISTS idx_message_event_rsvps_user ON message_event_rsvps(user_id);

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 015: Polls & Events support created successfully!';
END $$;
