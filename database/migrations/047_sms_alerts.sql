-- ==========================================================================
-- Migration 047: SMS Alerts for Impacted Assets
-- Add phone number and SMS preferences to users table
-- Add SMS tracking to impact alerts
-- ==========================================================================

-- ============================================================================
-- ADD SMS COLUMNS TO USERS TABLE
-- ============================================================================

-- Add phone_number column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'phone_number'
    ) THEN
        ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
        RAISE NOTICE 'Added phone_number column to users table';
    END IF;
END $$;

-- Add sms_alerts_enabled column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'sms_alerts_enabled'
    ) THEN
        ALTER TABLE users ADD COLUMN sms_alerts_enabled BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added sms_alerts_enabled column to users table';
    END IF;
END $$;

-- ============================================================================
-- ADD SMS TRACKING TO IMPACT ALERTS
-- ============================================================================

-- Add sms_sent column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'impact_alerts' AND column_name = 'sms_sent'
    ) THEN
        ALTER TABLE impact_alerts ADD COLUMN sms_sent BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added sms_sent column to impact_alerts table';
    END IF;
END $$;

-- Add sms_sent_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'impact_alerts' AND column_name = 'sms_sent_at'
    ) THEN
        ALTER TABLE impact_alerts ADD COLUMN sms_sent_at TIMESTAMPTZ;
        RAISE NOTICE 'Added sms_sent_at column to impact_alerts table';
    END IF;
END $$;

-- Add sms_message_sid column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'impact_alerts' AND column_name = 'sms_message_sid'
    ) THEN
        ALTER TABLE impact_alerts ADD COLUMN sms_message_sid VARCHAR(100);
        RAISE NOTICE 'Added sms_message_sid column to impact_alerts table';
    END IF;
END $$;

-- ============================================================================
-- CREATE SMS NOTIFICATION LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS sms_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User and alert tracking
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    impact_alert_id UUID REFERENCES impact_alerts(id) ON DELETE SET NULL,

    -- Phone details
    phone_number VARCHAR(20) NOT NULL,
    message_body TEXT NOT NULL,

    -- Twilio tracking
    message_sid VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed', 'undelivered'
    error_message TEXT,

    -- Timestamps
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index on phone_number for user lookups
CREATE INDEX IF NOT EXISTS idx_users_phone_number
    ON users(phone_number)
    WHERE phone_number IS NOT NULL;

-- Index on sms_alerts_enabled for filtering
CREATE INDEX IF NOT EXISTS idx_users_sms_enabled
    ON users(sms_alerts_enabled)
    WHERE sms_alerts_enabled = TRUE;

-- Index on sms_sent for impact alerts
CREATE INDEX IF NOT EXISTS idx_impact_alerts_sms_sent
    ON impact_alerts(sms_sent, created_at DESC);

-- Indexes for SMS notifications
CREATE INDEX IF NOT EXISTS idx_sms_notifications_user
    ON sms_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_notifications_alert
    ON sms_notifications(impact_alert_id);

CREATE INDEX IF NOT EXISTS idx_sms_notifications_status
    ON sms_notifications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_notifications_message_sid
    ON sms_notifications(message_sid)
    WHERE message_sid IS NOT NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger for sms_notifications
CREATE OR REPLACE FUNCTION update_sms_notification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sms_notifications_updated_at
    BEFORE UPDATE ON sms_notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_sms_notification_timestamp();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to log SMS notification
CREATE OR REPLACE FUNCTION log_sms_notification(
    p_user_id UUID,
    p_phone_number VARCHAR,
    p_message_body TEXT,
    p_impact_alert_id UUID DEFAULT NULL,
    p_message_sid VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO sms_notifications (
        user_id,
        impact_alert_id,
        phone_number,
        message_body,
        message_sid,
        status,
        sent_at
    ) VALUES (
        p_user_id,
        p_impact_alert_id,
        p_phone_number,
        p_message_body,
        p_message_sid,
        CASE WHEN p_message_sid IS NOT NULL THEN 'sent' ELSE 'failed' END,
        CASE WHEN p_message_sid IS NOT NULL THEN NOW() ELSE NULL END
    )
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update SMS notification status
CREATE OR REPLACE FUNCTION update_sms_status(
    p_message_sid VARCHAR,
    p_status VARCHAR,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_rows_updated INTEGER;
BEGIN
    UPDATE sms_notifications
    SET
        status = p_status,
        error_message = p_error_message,
        delivered_at = CASE WHEN p_status = 'delivered' THEN NOW() ELSE delivered_at END,
        updated_at = NOW()
    WHERE message_sid = p_message_sid;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    RETURN v_rows_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to get SMS stats for a user
CREATE OR REPLACE FUNCTION get_user_sms_stats(
    p_user_id UUID,
    p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_sent INTEGER,
    total_delivered INTEGER,
    total_failed INTEGER,
    last_sent_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_sent,
        COUNT(*) FILTER (WHERE status = 'delivered')::INTEGER as total_delivered,
        COUNT(*) FILTER (WHERE status IN ('failed', 'undelivered'))::INTEGER as total_failed,
        MAX(sent_at) as last_sent_at
    FROM sms_notifications
    WHERE user_id = p_user_id
    AND created_at >= NOW() - (p_days_back || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Recent SMS notifications with user details
CREATE OR REPLACE VIEW recent_sms_notifications AS
SELECT
    sn.id,
    sn.user_id,
    u.name as user_name,
    u.email as user_email,
    sn.phone_number,
    sn.message_body,
    sn.status,
    sn.message_sid,
    sn.error_message,
    sn.sent_at,
    sn.delivered_at,
    sn.created_at,
    ia.alert_type,
    ia.alert_severity,
    cp.customer_name,
    cp.address as property_address
FROM sms_notifications sn
JOIN users u ON sn.user_id = u.id
LEFT JOIN impact_alerts ia ON sn.impact_alert_id = ia.id
LEFT JOIN customer_properties cp ON ia.customer_property_id = cp.id
WHERE sn.created_at >= NOW() - INTERVAL '7 days'
ORDER BY sn.created_at DESC;

COMMENT ON VIEW recent_sms_notifications IS 'Recent SMS notifications with user and alert details';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE sms_notifications IS 'Log of all SMS notifications sent via Twilio';
COMMENT ON COLUMN users.phone_number IS 'User phone number for SMS alerts (E.164 format recommended)';
COMMENT ON COLUMN users.sms_alerts_enabled IS 'Whether user has enabled SMS alerts for impacted assets';
COMMENT ON COLUMN impact_alerts.sms_sent IS 'Whether SMS notification was sent for this alert';
COMMENT ON COLUMN impact_alerts.sms_sent_at IS 'When SMS notification was sent';
COMMENT ON COLUMN impact_alerts.sms_message_sid IS 'Twilio message SID for tracking';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 047: SMS Alerts System created successfully!';
    RAISE NOTICE '📱 Added SMS columns to users table';
    RAISE NOTICE '📊 Created sms_notifications table';
    RAISE NOTICE '🔍 Created helper functions: log_sms_notification, update_sms_status, get_user_sms_stats';
    RAISE NOTICE '👀 Created view: recent_sms_notifications';
END $$;
