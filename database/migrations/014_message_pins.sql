-- ==========================================================================
-- Migration 014: Message Pins
-- Adds pinning support for team messages
-- ==========================================================================

CREATE TABLE IF NOT EXISTS message_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(conversation_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_pins_conversation ON message_pins(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_pins_message ON message_pins(message_id);
CREATE INDEX IF NOT EXISTS idx_message_pins_pinned_by ON message_pins(pinned_by);

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 014: Message pins created successfully!';
END $$;
