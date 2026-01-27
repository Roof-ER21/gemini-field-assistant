-- ============================================================================
-- Migration 008: Team Messaging & Presence System
-- Adds real-time presence tracking, direct messaging, @mentions, and
-- ability to share Susan AI content with teammates
-- ============================================================================

-- ============================================================================
-- PRESENCE TRACKING
-- ============================================================================

-- User presence table for real-time online/offline status
CREATE TABLE IF NOT EXISTS user_presence (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'offline', -- 'online', 'away', 'offline'
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  socket_id VARCHAR(255), -- Current WebSocket connection ID
  device_type VARCHAR(50), -- 'web', 'ios', 'android'
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_user_presence_status ON user_presence(status);
CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence(last_seen DESC);

-- Presence history for analytics (optional)
CREATE TABLE IF NOT EXISTS presence_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL, -- 'online', 'offline', 'away'
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  device_type VARCHAR(50),
  session_duration_seconds INTEGER -- Calculated on offline event
);

CREATE INDEX IF NOT EXISTS idx_presence_history_user_timestamp ON presence_history(user_id, timestamp DESC);

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================

-- Conversations table (supports both 1-1 and group chats)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'group')),
  name VARCHAR(255), -- NULL for direct messages, required for groups
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations(created_by);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- Conversation participants
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_muted BOOLEAN DEFAULT FALSE,
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conv ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_last_read ON conversation_participants(last_read_at);

-- ============================================================================
-- MESSAGES
-- ============================================================================

-- Main messages table
CREATE TABLE IF NOT EXISTS team_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Message type determines content structure
  message_type VARCHAR(50) NOT NULL CHECK (
    message_type IN ('text', 'shared_chat', 'shared_email', 'system')
  ),

  -- Message content (JSON for flexibility)
  content JSONB NOT NULL,

  -- Metadata
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMP WITH TIME ZONE,
  parent_message_id UUID REFERENCES team_messages(id) ON DELETE SET NULL, -- For replies

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_messages_conversation ON team_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_messages_sender ON team_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_type ON team_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_team_messages_created_at ON team_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_messages_parent ON team_messages(parent_message_id);

-- GIN index for JSONB content search
CREATE INDEX IF NOT EXISTS idx_team_messages_content_gin ON team_messages USING GIN(content);

-- ============================================================================
-- MENTIONS & READ RECEIPTS
-- ============================================================================

-- Message mentions (@mentions)
CREATE TABLE IF NOT EXISTS message_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_mentions_user ON message_mentions(mentioned_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_mentions_message ON message_mentions(message_id);

-- Message read receipts
CREATE TABLE IF NOT EXISTS message_read_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_read_receipts_message ON message_read_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_read_receipts_user ON message_read_receipts(user_id);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

-- Notifications table
CREATE TABLE IF NOT EXISTS team_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Notification type
  type VARCHAR(50) NOT NULL CHECK (
    type IN ('mention', 'direct_message', 'shared_content', 'system')
  ),

  -- Reference to the source
  message_id UUID REFERENCES team_messages(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

  -- Notification content
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB, -- Additional payload for mobile/frontend

  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  is_pushed BOOLEAN DEFAULT FALSE, -- Track if push notification was sent
  read_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_notifications_user ON team_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_notifications_unread ON team_notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_team_notifications_type ON team_notifications(type);
CREATE INDEX IF NOT EXISTS idx_team_notifications_message ON team_notifications(message_id);

-- ============================================================================
-- SHARED AI CONTENT TRACKING
-- ============================================================================

-- Track shared Susan AI content for analytics
CREATE TABLE IF NOT EXISTS shared_ai_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL CHECK (
    content_type IN ('susan_chat', 'susan_email', 'susan_document')
  ),
  original_session_id VARCHAR(255), -- Link back to original AI session
  shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_ai_content_message ON shared_ai_content(message_id);
CREATE INDEX IF NOT EXISTS idx_shared_ai_content_type ON shared_ai_content(content_type);
CREATE INDEX IF NOT EXISTS idx_shared_ai_content_user ON shared_ai_content(shared_by);

-- ============================================================================
-- ADD USERNAME TO USERS TABLE
-- ============================================================================

-- Add username column to users if it doesn't exist (for @mentions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'username'
  ) THEN
    ALTER TABLE users ADD COLUMN username VARCHAR(100);

    -- Set default usernames from email prefix
    UPDATE users SET username = LOWER(SPLIT_PART(email, '@', 1)) WHERE username IS NULL;

    -- Make unique
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
  END IF;
END $$;

-- Add push_token column to users for mobile notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'push_token'
  ) THEN
    ALTER TABLE users ADD COLUMN push_token TEXT;
  END IF;
END $$;

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_team_messaging_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_presence
DROP TRIGGER IF EXISTS trigger_update_presence_timestamp ON user_presence;
CREATE TRIGGER trigger_update_presence_timestamp
  BEFORE UPDATE ON user_presence
  FOR EACH ROW
  EXECUTE FUNCTION update_team_messaging_timestamp();

-- Trigger for conversations
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_team_messaging_timestamp();

-- Trigger for team_messages
DROP TRIGGER IF EXISTS update_team_messages_updated_at ON team_messages;
CREATE TRIGGER update_team_messages_updated_at
  BEFORE UPDATE ON team_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_team_messaging_timestamp();

-- Function to automatically update conversation updated_at when new message
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON team_messages;
CREATE TRIGGER trigger_update_conversation_on_message
  AFTER INSERT ON team_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- Function to create notifications for mentions
CREATE OR REPLACE FUNCTION create_mention_notifications()
RETURNS TRIGGER AS $$
DECLARE
  sender_name VARCHAR(255);
  conversation_name VARCHAR(255);
BEGIN
  -- Get sender info
  SELECT name INTO sender_name FROM users WHERE id = (
    SELECT sender_id FROM team_messages WHERE id = NEW.message_id
  );

  -- Get conversation name or create one for direct messages
  SELECT COALESCE(c.name, 'Direct Message') INTO conversation_name
  FROM conversations c
  INNER JOIN team_messages m ON m.conversation_id = c.id
  WHERE m.id = NEW.message_id;

  -- Create notification
  INSERT INTO team_notifications (
    user_id,
    type,
    message_id,
    conversation_id,
    title,
    body,
    data
  )
  SELECT
    NEW.mentioned_user_id,
    'mention',
    NEW.message_id,
    m.conversation_id,
    COALESCE(sender_name, 'Someone') || ' mentioned you',
    'in ' || conversation_name,
    jsonb_build_object(
      'sender_id', m.sender_id,
      'sender_name', sender_name,
      'conversation_id', m.conversation_id
    )
  FROM team_messages m
  WHERE m.id = NEW.message_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_mention_notifications ON message_mentions;
CREATE TRIGGER trigger_create_mention_notifications
  AFTER INSERT ON message_mentions
  FOR EACH ROW
  EXECUTE FUNCTION create_mention_notifications();

-- ============================================================================
-- INITIALIZE PRESENCE FOR EXISTING USERS
-- ============================================================================

-- Create presence records for all existing users
INSERT INTO user_presence (user_id, status, last_seen)
SELECT id, 'offline', COALESCE(last_login_at, created_at)
FROM users
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 008: Messaging & Presence system created successfully!';
  RAISE NOTICE '   - user_presence: Real-time online/offline tracking';
  RAISE NOTICE '   - conversations: Direct & group messaging';
  RAISE NOTICE '   - team_messages: Messages with shared AI content support';
  RAISE NOTICE '   - message_mentions: @mention tracking';
  RAISE NOTICE '   - team_notifications: Notification system';
  RAISE NOTICE '   - shared_ai_content: Track shared Susan content';
END $$;
