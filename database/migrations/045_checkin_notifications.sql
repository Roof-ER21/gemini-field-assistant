-- Add check-in notification preferences
-- Migration: 045_checkin_notifications.sql

-- Add checkin_alerts_enabled to notification_preferences
ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS checkin_alerts_enabled BOOLEAN DEFAULT TRUE;

-- Add checkin_proximity_miles to notification_preferences (for proximity-based alerts)
ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS checkin_proximity_miles INTEGER DEFAULT NULL;

-- Comment on new columns
COMMENT ON COLUMN notification_preferences.checkin_alerts_enabled IS 'Enable/disable notifications when teammates check in';
COMMENT ON COLUMN notification_preferences.checkin_proximity_miles IS 'Only notify when check-ins are within this many miles (NULL = always notify)';
