-- ==========================================================================
-- Migration 022: Push Notification Tokens
-- Stores FCM tokens for push notifications to mobile devices
-- ==========================================================================

-- ============================================================================
-- PUSH NOTIFICATION TOKENS TABLE
-- Store FCM/APNs tokens for each user's devices
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Device Token
    device_token TEXT NOT NULL,

    -- Device Information
    device_type VARCHAR(20) NOT NULL, -- 'ios', 'android', 'web'
    device_name VARCHAR(255),
    device_model VARCHAR(100),
    os_version VARCHAR(50),
    app_version VARCHAR(50),

    -- Token Status
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,

    -- Notification Preferences (per device)
    notifications_enabled BOOLEAN DEFAULT TRUE,
    storm_alerts_enabled BOOLEAN DEFAULT TRUE,
    team_mentions_enabled BOOLEAN DEFAULT TRUE,
    message_notifications_enabled BOOLEAN DEFAULT TRUE,

    -- Quiet Hours
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME, -- e.g., '22:00'
    quiet_hours_end TIME,   -- e.g., '07:00'
    timezone VARCHAR(50) DEFAULT 'America/New_York',

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One token per device per user
    UNIQUE(user_id, device_token)
);

-- ============================================================================
-- PUSH NOTIFICATION LOG TABLE
-- Track all sent notifications for debugging and analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Target
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    push_token_id UUID REFERENCES push_tokens(id) ON DELETE SET NULL,
    device_token TEXT, -- Stored separately in case push_tokens record is deleted

    -- Notification Content
    notification_type VARCHAR(50) NOT NULL,
    -- Types: 'storm_alert', 'impact_alert', 'team_mention', 'message', 'reminder', 'system'

    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB, -- Additional payload data

    -- Related Entities
    related_storm_id UUID REFERENCES storm_events(id) ON DELETE SET NULL,
    related_alert_id UUID REFERENCES impact_alerts(id) ON DELETE SET NULL,
    related_message_id UUID, -- From team_messages
    related_post_id UUID,    -- From team_posts

    -- Delivery Status
    status VARCHAR(30) DEFAULT 'pending',
    -- Options: 'pending', 'sent', 'delivered', 'failed', 'skipped'

    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    error_message TEXT,
    fcm_message_id TEXT, -- Firebase response ID

    -- User Interaction
    opened_at TIMESTAMPTZ,
    action_taken VARCHAR(50), -- 'dismissed', 'opened', 'action_clicked'

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- NOTIFICATION PREFERENCES TABLE
-- User-level notification settings (not device-specific)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,

    -- Global Settings
    all_notifications_enabled BOOLEAN DEFAULT TRUE,

    -- Storm Alerts
    storm_alerts_enabled BOOLEAN DEFAULT TRUE,
    storm_alert_min_hail_size DECIMAL(4, 2) DEFAULT 1.0,
    storm_alert_states TEXT[], -- Array of states to monitor

    -- Impact Alerts (customer properties)
    impact_alerts_enabled BOOLEAN DEFAULT TRUE,
    impact_alert_immediate BOOLEAN DEFAULT TRUE, -- Send immediately vs batch

    -- Team Notifications
    team_mention_alerts BOOLEAN DEFAULT TRUE,
    team_message_alerts BOOLEAN DEFAULT TRUE,
    team_post_alerts BOOLEAN DEFAULT FALSE, -- Can be noisy

    -- Summary Digests
    daily_summary_enabled BOOLEAN DEFAULT TRUE,
    daily_summary_time TIME DEFAULT '08:00',
    weekly_summary_enabled BOOLEAN DEFAULT FALSE,
    weekly_summary_day INTEGER DEFAULT 1, -- 1=Monday

    -- Contact Preferences
    email_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT FALSE,
    push_notifications BOOLEAN DEFAULT TRUE,

    -- Quiet Hours (global)
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '07:00',
    timezone VARCHAR(50) DEFAULT 'America/New_York',

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Push tokens indexes
CREATE INDEX IF NOT EXISTS idx_push_tokens_user
    ON push_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_active
    ON push_tokens(user_id, is_active)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_push_tokens_device_type
    ON push_tokens(device_type);

-- Notification log indexes
CREATE INDEX IF NOT EXISTS idx_push_log_user
    ON push_notification_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_log_type
    ON push_notification_log(notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_log_status
    ON push_notification_log(status);

CREATE INDEX IF NOT EXISTS idx_push_log_storm
    ON push_notification_log(related_storm_id);

CREATE INDEX IF NOT EXISTS idx_push_log_alert
    ON push_notification_log(related_alert_id);

-- Notification preferences index
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user
    ON notification_preferences(user_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamps
CREATE OR REPLACE FUNCTION update_push_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_push_tokens_updated_at
    BEFORE UPDATE ON push_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_push_timestamp();

CREATE TRIGGER trigger_notification_prefs_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_push_timestamp();

-- Update last_used_at when notification sent
CREATE OR REPLACE FUNCTION update_token_last_used()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'sent' AND NEW.push_token_id IS NOT NULL THEN
        UPDATE push_tokens
        SET last_used_at = NOW()
        WHERE id = NEW.push_token_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_token_last_used
    AFTER INSERT OR UPDATE ON push_notification_log
    FOR EACH ROW
    EXECUTE FUNCTION update_token_last_used();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get all active tokens for a user
CREATE OR REPLACE FUNCTION get_user_push_tokens(p_user_id UUID)
RETURNS TABLE (
    token_id UUID,
    device_token TEXT,
    device_type VARCHAR,
    device_name VARCHAR,
    notifications_enabled BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pt.id as token_id,
        pt.device_token,
        pt.device_type,
        pt.device_name,
        pt.notifications_enabled
    FROM push_tokens pt
    WHERE pt.user_id = p_user_id
    AND pt.is_active = TRUE
    AND pt.notifications_enabled = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Check if user should receive notification now (quiet hours check)
CREATE OR REPLACE FUNCTION should_send_notification(
    p_user_id UUID,
    p_notification_type VARCHAR DEFAULT 'general'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_prefs notification_preferences%ROWTYPE;
    v_current_time TIME;
    v_in_quiet_hours BOOLEAN;
BEGIN
    -- Get user preferences
    SELECT * INTO v_prefs
    FROM notification_preferences
    WHERE user_id = p_user_id;

    -- If no preferences, allow notification
    IF NOT FOUND THEN
        RETURN TRUE;
    END IF;

    -- Check if all notifications disabled
    IF NOT v_prefs.all_notifications_enabled THEN
        RETURN FALSE;
    END IF;

    -- Check specific notification type
    IF p_notification_type = 'storm_alert' AND NOT v_prefs.storm_alerts_enabled THEN
        RETURN FALSE;
    ELSIF p_notification_type = 'impact_alert' AND NOT v_prefs.impact_alerts_enabled THEN
        RETURN FALSE;
    ELSIF p_notification_type = 'team_mention' AND NOT v_prefs.team_mention_alerts THEN
        RETURN FALSE;
    ELSIF p_notification_type = 'message' AND NOT v_prefs.team_message_alerts THEN
        RETURN FALSE;
    END IF;

    -- Check quiet hours
    IF v_prefs.quiet_hours_enabled THEN
        v_current_time := (NOW() AT TIME ZONE v_prefs.timezone)::TIME;

        -- Handle overnight quiet hours (e.g., 22:00 to 07:00)
        IF v_prefs.quiet_hours_start > v_prefs.quiet_hours_end THEN
            v_in_quiet_hours := v_current_time >= v_prefs.quiet_hours_start
                             OR v_current_time <= v_prefs.quiet_hours_end;
        ELSE
            v_in_quiet_hours := v_current_time >= v_prefs.quiet_hours_start
                            AND v_current_time <= v_prefs.quiet_hours_end;
        END IF;

        IF v_in_quiet_hours THEN
            RETURN FALSE;
        END IF;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Get notification stats for analytics
CREATE OR REPLACE FUNCTION get_notification_stats(
    p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    notification_type VARCHAR,
    total_sent BIGINT,
    total_delivered BIGINT,
    total_opened BIGINT,
    delivery_rate DECIMAL,
    open_rate DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pnl.notification_type,
        COUNT(*) as total_sent,
        COUNT(*) FILTER (WHERE status = 'delivered') as total_delivered,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as total_opened,
        ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivered') / NULLIF(COUNT(*), 0), 2) as delivery_rate,
        ROUND(100.0 * COUNT(*) FILTER (WHERE opened_at IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE status = 'delivered'), 0), 2) as open_rate
    FROM push_notification_log pnl
    WHERE pnl.created_at >= NOW() - (p_days_back || ' days')::INTERVAL
    GROUP BY pnl.notification_type
    ORDER BY total_sent DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active devices per user
CREATE OR REPLACE VIEW user_devices AS
SELECT
    pt.user_id,
    u.name as user_name,
    COUNT(*) as total_devices,
    COUNT(*) FILTER (WHERE pt.device_type = 'ios') as ios_devices,
    COUNT(*) FILTER (WHERE pt.device_type = 'android') as android_devices,
    COUNT(*) FILTER (WHERE pt.device_type = 'web') as web_devices,
    MAX(pt.last_used_at) as last_notification_sent
FROM push_tokens pt
JOIN users u ON pt.user_id = u.id
WHERE pt.is_active = TRUE
GROUP BY pt.user_id, u.name
ORDER BY total_devices DESC;

COMMENT ON VIEW user_devices IS 'Summary of registered devices per user';

-- Recent notification activity
CREATE OR REPLACE VIEW recent_notifications AS
SELECT
    pnl.id,
    pnl.user_id,
    u.name as user_name,
    pnl.notification_type,
    pnl.title,
    pnl.status,
    pnl.sent_at,
    pnl.delivered_at,
    pnl.opened_at,
    pnl.error_message
FROM push_notification_log pnl
JOIN users u ON pnl.user_id = u.id
WHERE pnl.created_at >= NOW() - INTERVAL '7 days'
ORDER BY pnl.created_at DESC;

COMMENT ON VIEW recent_notifications IS 'Recent push notification activity for monitoring';

-- ============================================================================
-- DEFAULT NOTIFICATION PREFERENCES
-- Create default preferences for existing users
-- ============================================================================

INSERT INTO notification_preferences (user_id)
SELECT id FROM users
WHERE id NOT IN (SELECT user_id FROM notification_preferences)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE push_tokens IS 'FCM/APNs tokens for push notifications to user devices';
COMMENT ON TABLE push_notification_log IS 'Log of all push notifications for debugging and analytics';
COMMENT ON TABLE notification_preferences IS 'User-level notification settings';

COMMENT ON COLUMN push_tokens.device_type IS 'Platform type: ios, android, or web';
COMMENT ON COLUMN push_notification_log.notification_type IS 'Type: storm_alert, impact_alert, team_mention, message, reminder, system';
COMMENT ON COLUMN notification_preferences.quiet_hours_enabled IS 'Suppress notifications during specified hours';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 022: Push Notification Tokens created successfully!';
    RAISE NOTICE '📊 Tables created: push_tokens, push_notification_log, notification_preferences';
    RAISE NOTICE '🔍 Functions created: get_user_push_tokens, should_send_notification, get_notification_stats';
    RAISE NOTICE '👀 Views created: user_devices, recent_notifications';
END $$;
