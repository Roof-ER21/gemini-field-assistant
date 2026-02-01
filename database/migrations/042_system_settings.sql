-- ==========================================================================
-- Migration 042: System Settings
-- Central configuration for app features (Leaderboard, Territories, etc.)
-- ==========================================================================

-- System settings table with JSONB values for flexible configuration
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    category VARCHAR(50) NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- Index for category lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_system_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_system_settings_updated_at ON system_settings;
CREATE TRIGGER trigger_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_system_settings_timestamp();

-- ==========================================================================
-- Default Settings
-- ==========================================================================

-- Feature toggles (master switches for sidebar visibility)
INSERT INTO system_settings (key, value, category, description) VALUES
('feature_leaderboard', '{"enabled": true}', 'features', 'Enable/disable Leaderboard feature in sidebar'),
('feature_territories', '{"enabled": true}', 'features', 'Enable/disable Territory Manager in sidebar'),
('feature_canvassing', '{"enabled": true}', 'features', 'Enable/disable Canvassing Tracker in sidebar'),
('feature_impacted_assets', '{"enabled": true}', 'features', 'Enable/disable Impacted Assets in sidebar'),
('feature_storm_map', '{"enabled": true}', 'features', 'Enable/disable Storm Map in sidebar'),
('feature_agnes', '{"enabled": true}', 'features', 'Enable/disable Agnes Training in sidebar'),
('feature_live', '{"enabled": true}', 'features', 'Enable/disable Live Conversation in sidebar'),
('feature_susan_chat', '{"enabled": true}', 'features', 'Enable/disable Susan AI Chat')
ON CONFLICT (key) DO NOTHING;

-- Leaderboard settings
INSERT INTO system_settings (key, value, category, description) VALUES
('leaderboard_sync_enabled', '{"enabled": true, "interval_hours": 12}', 'leaderboard', 'Automatic leaderboard sync configuration'),
('leaderboard_tiers', '{"rookie_to_bronze": 5, "bronze_to_silver": 15, "silver_to_gold": 30, "gold_to_platinum": 50}', 'leaderboard', 'Signup thresholds for tier advancement')
ON CONFLICT (key) DO NOTHING;

-- Territory settings
INSERT INTO system_settings (key, value, category, description) VALUES
('territory_auto_assign', '{"enabled": false}', 'territories', 'Auto-assign territories to new users'),
('territory_checkin_required', '{"enabled": true, "radius_miles": 0.5}', 'territories', 'Require location check-in for territory activities')
ON CONFLICT (key) DO NOTHING;

-- Canvassing settings
INSERT INTO system_settings (key, value, category, description) VALUES
('canvassing_session_timeout', '{"minutes": 480}', 'canvassing', 'Session timeout for canvassing tracker'),
('canvassing_statuses', '{"available": ["not_home", "interested", "not_interested", "follow_up", "signed"]}', 'canvassing', 'Available status options for door knocks')
ON CONFLICT (key) DO NOTHING;

-- Impacted assets settings
INSERT INTO system_settings (key, value, category, description) VALUES
('assets_hail_thresholds', '{"minor": 1.0, "moderate": 1.5, "severe": 2.0}', 'assets', 'Hail size thresholds in inches for damage classification'),
('assets_notification_rules', '{"notify_on_severe": true, "notify_radius_miles": 25}', 'assets', 'Notification rules for storm events')
ON CONFLICT (key) DO NOTHING;

-- Susan AI settings
INSERT INTO system_settings (key, value, category, description) VALUES
('susan_model', '{"provider": "gemini", "model": "gemini-2.0-flash"}', 'susan', 'AI model configuration for Susan'),
('susan_voice_enabled', '{"enabled": true}', 'susan', 'Enable voice responses from Susan'),
('susan_roleplay_enabled', '{"enabled": true}', 'susan', 'Enable Agnes roleplay training feature'),
('susan_storm_lookup', '{"enabled": true}', 'susan', 'Enable storm data lookup in conversations'),
('susan_performance_coaching', '{"enabled": true}', 'susan', 'Enable performance coaching based on leaderboard data')
ON CONFLICT (key) DO NOTHING;

-- ==========================================================================
-- Settings change log for audit trail
-- ==========================================================================

CREATE TABLE IF NOT EXISTS system_settings_log (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL,
    old_value JSONB,
    new_value JSONB NOT NULL,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_settings_log_key ON system_settings_log(setting_key);
CREATE INDEX IF NOT EXISTS idx_settings_log_time ON system_settings_log(changed_at DESC);

-- Function to log setting changes
CREATE OR REPLACE FUNCTION log_setting_change()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO system_settings_log (setting_key, old_value, new_value, changed_by)
    VALUES (NEW.key, OLD.value, NEW.value, NEW.updated_by);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_setting_change ON system_settings;
CREATE TRIGGER trigger_log_setting_change
    AFTER UPDATE ON system_settings
    FOR EACH ROW
    WHEN (OLD.value IS DISTINCT FROM NEW.value)
    EXECUTE FUNCTION log_setting_change();

DO $$
BEGIN
    RAISE NOTICE '=== Migration 042: System Settings ===';
    RAISE NOTICE 'Tables created: system_settings, system_settings_log';
    RAISE NOTICE 'Categories: features, leaderboard, territories, canvassing, assets, susan';
    RAISE NOTICE 'All features enabled by default';
END $$;
