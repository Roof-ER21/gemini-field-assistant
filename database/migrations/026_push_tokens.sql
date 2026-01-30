-- Push Notification Tokens
-- Stores FCM tokens for sending push notifications to users
-- Matches the existing pushNotificationService.ts expectations

-- Push tokens table
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Token info (service uses device_token, not fcm_token)
    device_token TEXT NOT NULL,
    device_type VARCHAR(20) NOT NULL CHECK (device_type IN ('ios', 'android', 'web')),
    device_name VARCHAR(255),
    device_model VARCHAR(255),

    -- Token status
    is_active BOOLEAN DEFAULT TRUE,
    notifications_enabled BOOLEAN DEFAULT TRUE,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique per user + device
    UNIQUE(user_id, device_token)
);

-- Notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,

    -- Master toggle
    all_notifications_enabled BOOLEAN DEFAULT TRUE,

    -- Notification types
    storm_alerts_enabled BOOLEAN DEFAULT TRUE,
    impact_alerts_enabled BOOLEAN DEFAULT TRUE,
    team_mention_alerts BOOLEAN DEFAULT TRUE,
    team_message_alerts BOOLEAN DEFAULT TRUE,
    lead_updates_enabled BOOLEAN DEFAULT TRUE,
    territory_alerts_enabled BOOLEAN DEFAULT TRUE,
    appointment_reminders_enabled BOOLEAN DEFAULT TRUE,

    -- Quiet hours
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    timezone VARCHAR(50) DEFAULT 'America/New_York',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification log (for debugging and analytics)
CREATE TABLE IF NOT EXISTS push_notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    push_token_id UUID REFERENCES push_tokens(id) ON DELETE SET NULL,

    -- Device info
    device_token TEXT,

    -- Notification details
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    data JSONB,

    -- Delivery status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'clicked')),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,

    -- FCM response
    fcm_message_id VARCHAR(255),
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_push_tokens_device ON push_tokens(device_token);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_push_log_user ON push_notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_push_log_type ON push_notification_log(notification_type);
CREATE INDEX IF NOT EXISTS idx_push_log_created ON push_notification_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_log_status ON push_notification_log(status);

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_push_token_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS trigger_push_tokens_updated ON push_tokens;
CREATE TRIGGER trigger_push_tokens_updated
BEFORE UPDATE ON push_tokens
FOR EACH ROW
EXECUTE FUNCTION update_push_token_timestamp();

DROP TRIGGER IF EXISTS trigger_notification_prefs_updated ON notification_preferences;
CREATE TRIGGER trigger_notification_prefs_updated
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_push_token_timestamp();

-- Comments
COMMENT ON TABLE push_tokens IS 'Stores FCM/APNs device tokens for push notifications';
COMMENT ON TABLE notification_preferences IS 'User preferences for notification types and quiet hours';
COMMENT ON TABLE push_notification_log IS 'Log of all sent notifications for debugging and analytics';
