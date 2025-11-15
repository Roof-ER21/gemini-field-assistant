-- ============================================================================
-- ACTIVITY TRACKING MIGRATION FOR S21 FIELD ASSISTANT
-- Purpose: Add comprehensive activity tracking for daily summary emails
-- Created: 2025-11-04
-- ============================================================================

-- ============================================================================
-- 1. USER ACTIVITY LOG TABLE
-- ============================================================================
-- Tracks all user activities: logins, chats, documents, emails, transcriptions
CREATE TABLE IF NOT EXISTS user_activity_log (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL, -- 'login', 'chat', 'document_analysis', 'email_generated', 'transcription'
  activity_data JSONB, -- Store relevant data (message count, document name, etc.)
  ip_address VARCHAR(45), -- Support both IPv4 and IPv6
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_user_date ON user_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON user_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_created ON user_activity_log(created_at DESC);

-- Comment the table
COMMENT ON TABLE user_activity_log IS 'Comprehensive activity tracking for users - used for daily summary emails and analytics';
COMMENT ON COLUMN user_activity_log.activity_type IS 'Type of activity: login, chat, document_analysis, email_generated, transcription';
COMMENT ON COLUMN user_activity_log.activity_data IS 'JSON data specific to activity type - flexible storage for additional context';

-- ============================================================================
-- 2. EMAIL NOTIFICATIONS TABLE
-- ============================================================================
-- Tracks all email notifications sent to users/admins
CREATE TABLE IF NOT EXISTS email_notifications (
  id SERIAL PRIMARY KEY,
  notification_type VARCHAR(50) NOT NULL, -- 'first_login', 'daily_summary', 'welcome'
  recipient_email VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sent_at TIMESTAMP DEFAULT NOW(),
  email_data JSONB, -- Store email content, subject, etc.
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_notifications_user ON email_notifications(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_notifications_type ON email_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_email_notifications_sent ON email_notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_notifications_recipient ON email_notifications(recipient_email);

-- Comment the table
COMMENT ON TABLE email_notifications IS 'Tracks all email notifications sent - prevents duplicate sends and provides audit trail';
COMMENT ON COLUMN email_notifications.notification_type IS 'Type of notification: first_login, daily_summary, welcome';
COMMENT ON COLUMN email_notifications.email_data IS 'JSON data containing email subject, body preview, and metadata';

-- ============================================================================
-- 3. ALTER USERS TABLE - ADD LOGIN TRACKING COLUMNS
-- ============================================================================
-- Add columns to track login activity
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- Comment new columns
COMMENT ON COLUMN users.last_login_at IS 'Timestamp of most recent login - updated on each authentication';
COMMENT ON COLUMN users.first_login_at IS 'Timestamp of very first login - never updated after initial set';
COMMENT ON COLUMN users.login_count IS 'Total number of logins - incremented on each authentication';

-- ============================================================================
-- 4. CREATE HELPER VIEWS FOR ANALYTICS
-- ============================================================================

-- Daily activity summary view (for quick queries)
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

COMMENT ON VIEW daily_activity_summary IS 'Aggregated daily activity by user and type - used for daily summary emails';

-- User activity statistics view
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

COMMENT ON VIEW user_activity_stats IS 'Comprehensive user activity statistics - all-time totals and last activity';

-- ============================================================================
-- 5. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to check if user had first login today
CREATE OR REPLACE FUNCTION is_first_login_today(p_user_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
    AND DATE(first_login_at) = CURRENT_DATE
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_first_login_today IS 'Check if user logged in for the first time today';

-- Function to get users who need daily summary
CREATE OR REPLACE FUNCTION get_users_for_daily_summary()
RETURNS TABLE (
  user_id INTEGER,
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

COMMENT ON FUNCTION get_users_for_daily_summary IS 'Get list of users who had activity today and need a daily summary email';

-- Function to check if daily summary already sent
CREATE OR REPLACE FUNCTION daily_summary_sent_today(p_user_id INTEGER)
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

COMMENT ON FUNCTION daily_summary_sent_today IS 'Check if daily summary email was already sent today for a user';

-- ============================================================================
-- 6. CREATE TRIGGER TO UPDATE LAST_LOGIN_AT
-- ============================================================================

-- Trigger function to update last_login_at when login activity is logged
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

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_login_timestamp ON user_activity_log;
CREATE TRIGGER trigger_update_login_timestamp
  AFTER INSERT ON user_activity_log
  FOR EACH ROW
  WHEN (NEW.activity_type = 'login')
  EXECUTE FUNCTION update_user_login_timestamp();

COMMENT ON FUNCTION update_user_login_timestamp IS 'Automatically update user login timestamps when login activity is logged';

-- ============================================================================
-- 7. SEED EXISTING DATA (OPTIONAL)
-- ============================================================================

-- Backfill first_login_at from created_at for existing users
UPDATE users
SET first_login_at = created_at
WHERE first_login_at IS NULL;

-- Initialize login_count if NULL
UPDATE users
SET login_count = 0
WHERE login_count IS NULL;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Display migration summary
DO $$
DECLARE
  activity_count INTEGER;
  notification_count INTEGER;
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO activity_count FROM user_activity_log;
  SELECT COUNT(*) INTO notification_count FROM email_notifications;
  SELECT COUNT(*) INTO user_count FROM users WHERE first_login_at IS NOT NULL;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'ACTIVITY TRACKING MIGRATION COMPLETED';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - user_activity_log (% existing records)', activity_count;
  RAISE NOTICE '  - email_notifications (% existing records)', notification_count;
  RAISE NOTICE 'Users updated: % users with login tracking', user_count;
  RAISE NOTICE 'Views created: 2 (daily_activity_summary, user_activity_stats)';
  RAISE NOTICE 'Functions created: 4 helper functions';
  RAISE NOTICE 'Triggers created: 1 (login timestamp update)';
  RAISE NOTICE '================================================';
END $$;
