-- ==========================================================================
-- Migration 021: Impacted Assets System
-- Stores customer properties to monitor for storm impacts
-- Sends alerts when past customers are affected by new storms
-- ==========================================================================

-- ============================================================================
-- CUSTOMER PROPERTIES TABLE
-- Store addresses of past customers to monitor for future storms
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Owner (the sales rep who added this customer)
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Customer Information
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    customer_email VARCHAR(255),

    -- Property Address
    address TEXT NOT NULL,
    street_address VARCHAR(500),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    zip_code VARCHAR(10) NOT NULL,

    -- Coordinates for storm proximity matching
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,

    -- Property Details (optional)
    property_type VARCHAR(50), -- 'residential', 'commercial', 'multi-family'
    roof_type VARCHAR(100), -- 'shingle', 'metal', 'tile', etc.
    roof_age_years INTEGER,
    last_roof_date DATE,

    -- Relationship Status
    relationship_status VARCHAR(50) DEFAULT 'past_customer',
    -- Options: 'past_customer', 'active_customer', 'prospect', 'referral'

    -- Job History
    original_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    total_jobs INTEGER DEFAULT 1,
    last_service_date DATE,
    lifetime_value DECIMAL(10, 2),

    -- Notification Preferences
    notify_on_hail BOOLEAN DEFAULT TRUE,
    notify_on_wind BOOLEAN DEFAULT TRUE,
    notify_on_tornado BOOLEAN DEFAULT TRUE,
    notify_threshold_hail_size DECIMAL(4, 2) DEFAULT 1.0, -- Minimum hail size to trigger alert
    notify_radius_miles DECIMAL(6, 2) DEFAULT 5.0, -- How close storm must be to trigger

    -- Contact Preferences
    preferred_contact_method VARCHAR(20) DEFAULT 'phone', -- 'phone', 'email', 'text', 'any'
    do_not_contact BOOLEAN DEFAULT FALSE,
    contact_notes TEXT,

    -- Notes
    notes TEXT,
    tags TEXT[], -- Array of tags for categorization

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate properties per user
    UNIQUE(user_id, address)
);

-- ============================================================================
-- IMPACT ALERTS TABLE
-- Log when customer properties are impacted by storms
-- ============================================================================
CREATE TABLE IF NOT EXISTS impact_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links
    customer_property_id UUID NOT NULL REFERENCES customer_properties(id) ON DELETE CASCADE,
    storm_event_id UUID REFERENCES storm_events(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Alert Details
    alert_type VARCHAR(50) NOT NULL, -- 'hail', 'wind', 'tornado', 'combined'
    alert_severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'

    -- Storm Details at time of alert
    storm_date DATE NOT NULL,
    storm_distance_miles DECIMAL(6, 2),
    hail_size_inches DECIMAL(4, 2),
    wind_speed_mph INTEGER,

    -- Alert Status
    status VARCHAR(30) DEFAULT 'pending',
    -- Options: 'pending', 'sent', 'viewed', 'contacted', 'converted', 'dismissed'

    -- Follow-up Tracking
    contacted_at TIMESTAMPTZ,
    contact_method VARCHAR(20),
    contact_notes TEXT,
    outcome VARCHAR(50), -- 'inspection_scheduled', 'not_interested', 'no_answer', 'converted', 'pending'

    -- Job Conversion
    converted_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    conversion_date DATE,

    -- Push Notification Tracking
    push_sent BOOLEAN DEFAULT FALSE,
    push_sent_at TIMESTAMPTZ,
    push_device_token TEXT,

    -- Email Notification Tracking
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- STORM MONITORING RUNS TABLE
-- Track when storm checks are performed (for audit/debugging)
-- ============================================================================
CREATE TABLE IF NOT EXISTS storm_monitoring_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Run Details
    run_type VARCHAR(50) NOT NULL, -- 'scheduled', 'manual', 'new_storm'
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,

    -- Results
    properties_checked INTEGER DEFAULT 0,
    alerts_generated INTEGER DEFAULT 0,
    alerts_sent INTEGER DEFAULT 0,

    -- Errors
    errors JSONB,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Customer properties indexes
CREATE INDEX IF NOT EXISTS idx_customer_properties_user
    ON customer_properties(user_id);

CREATE INDEX IF NOT EXISTS idx_customer_properties_location
    ON customer_properties(state, city, zip_code);

CREATE INDEX IF NOT EXISTS idx_customer_properties_coords
    ON customer_properties(latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_customer_properties_active
    ON customer_properties(is_active)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_customer_properties_notify
    ON customer_properties(notify_on_hail, notify_on_wind, notify_on_tornado)
    WHERE is_active = TRUE AND do_not_contact = FALSE;

-- GIN index for tags search
CREATE INDEX IF NOT EXISTS idx_customer_properties_tags
    ON customer_properties USING GIN(tags);

-- Impact alerts indexes
CREATE INDEX IF NOT EXISTS idx_impact_alerts_property
    ON impact_alerts(customer_property_id);

CREATE INDEX IF NOT EXISTS idx_impact_alerts_user
    ON impact_alerts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_impact_alerts_storm
    ON impact_alerts(storm_event_id);

CREATE INDEX IF NOT EXISTS idx_impact_alerts_status
    ON impact_alerts(status);

CREATE INDEX IF NOT EXISTS idx_impact_alerts_pending
    ON impact_alerts(user_id, status)
    WHERE status IN ('pending', 'sent', 'viewed');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamps
CREATE OR REPLACE FUNCTION update_impacted_assets_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_customer_properties_updated_at
    BEFORE UPDATE ON customer_properties
    FOR EACH ROW
    EXECUTE FUNCTION update_impacted_assets_timestamp();

CREATE TRIGGER trigger_impact_alerts_updated_at
    BEFORE UPDATE ON impact_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_impacted_assets_timestamp();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Check if a storm impacts any customer properties
-- Returns list of impacted properties with distances
CREATE OR REPLACE FUNCTION check_storm_impact(
    p_latitude DECIMAL,
    p_longitude DECIMAL,
    p_event_type VARCHAR DEFAULT 'hail',
    p_hail_size DECIMAL DEFAULT NULL,
    p_wind_speed INTEGER DEFAULT NULL
)
RETURNS TABLE (
    property_id UUID,
    user_id UUID,
    customer_name VARCHAR,
    address TEXT,
    distance_miles DECIMAL,
    notify_method VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cp.id as property_id,
        cp.user_id,
        cp.customer_name,
        cp.address,
        calculate_distance_miles(p_latitude, p_longitude, cp.latitude, cp.longitude) as distance_miles,
        cp.preferred_contact_method as notify_method
    FROM customer_properties cp
    WHERE
        cp.is_active = TRUE
        AND cp.do_not_contact = FALSE
        -- Check notification preferences
        AND (
            (p_event_type = 'hail' AND cp.notify_on_hail = TRUE
             AND (p_hail_size IS NULL OR p_hail_size >= cp.notify_threshold_hail_size))
            OR (p_event_type = 'wind' AND cp.notify_on_wind = TRUE)
            OR (p_event_type = 'tornado' AND cp.notify_on_tornado = TRUE)
        )
        -- Check distance
        AND calculate_distance_miles(p_latitude, p_longitude, cp.latitude, cp.longitude) <= cp.notify_radius_miles
    ORDER BY distance_miles ASC;
END;
$$ LANGUAGE plpgsql;

-- Get all pending alerts for a user
CREATE OR REPLACE FUNCTION get_pending_alerts(p_user_id UUID)
RETURNS TABLE (
    alert_id UUID,
    customer_name VARCHAR,
    address TEXT,
    alert_type VARCHAR,
    storm_date DATE,
    distance_miles DECIMAL,
    hail_size DECIMAL,
    status VARCHAR,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ia.id as alert_id,
        cp.customer_name,
        cp.address,
        ia.alert_type,
        ia.storm_date,
        ia.storm_distance_miles,
        ia.hail_size_inches,
        ia.status,
        ia.created_at
    FROM impact_alerts ia
    JOIN customer_properties cp ON ia.customer_property_id = cp.id
    WHERE ia.user_id = p_user_id
    AND ia.status IN ('pending', 'sent', 'viewed')
    ORDER BY ia.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Calculate alert severity based on storm characteristics
CREATE OR REPLACE FUNCTION calculate_alert_severity(
    p_event_type VARCHAR,
    p_distance_miles DECIMAL,
    p_hail_size DECIMAL DEFAULT NULL,
    p_wind_speed INTEGER DEFAULT NULL
)
RETURNS VARCHAR AS $$
BEGIN
    -- Direct hit (within 1 mile)
    IF p_distance_miles <= 1 THEN
        IF p_event_type = 'tornado' THEN
            RETURN 'critical';
        ELSIF p_hail_size >= 2.5 OR p_wind_speed >= 80 THEN
            RETURN 'critical';
        ELSIF p_hail_size >= 1.75 OR p_wind_speed >= 60 THEN
            RETURN 'high';
        ELSE
            RETURN 'medium';
        END IF;
    -- Close (1-3 miles)
    ELSIF p_distance_miles <= 3 THEN
        IF p_event_type = 'tornado' THEN
            RETURN 'high';
        ELSIF p_hail_size >= 2.0 OR p_wind_speed >= 70 THEN
            RETURN 'high';
        ELSE
            RETURN 'medium';
        END IF;
    -- Nearby (3-5 miles)
    ELSE
        IF p_event_type = 'tornado' THEN
            RETURN 'medium';
        ELSE
            RETURN 'low';
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Get impact statistics for a user
CREATE OR REPLACE FUNCTION get_impact_stats(
    p_user_id UUID,
    p_days_back INTEGER DEFAULT 90
)
RETURNS TABLE (
    total_properties INTEGER,
    total_alerts INTEGER,
    alerts_pending INTEGER,
    alerts_converted INTEGER,
    conversion_rate DECIMAL,
    total_conversion_value DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT
            (SELECT COUNT(*) FROM customer_properties WHERE user_id = p_user_id AND is_active = TRUE) as props,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status IN ('pending', 'sent', 'viewed')) as pending,
            COUNT(*) FILTER (WHERE status = 'converted') as converted
        FROM impact_alerts
        WHERE user_id = p_user_id
        AND created_at >= NOW() - (p_days_back || ' days')::INTERVAL
    )
    SELECT
        stats.props::INTEGER as total_properties,
        stats.total::INTEGER as total_alerts,
        stats.pending::INTEGER as alerts_pending,
        stats.converted::INTEGER as alerts_converted,
        CASE WHEN stats.total > 0
            THEN ROUND(100.0 * stats.converted / stats.total, 2)
            ELSE 0
        END as conversion_rate,
        COALESCE((
            SELECT SUM(j.estimated_value)
            FROM impact_alerts ia
            JOIN jobs j ON ia.converted_job_id = j.id
            WHERE ia.user_id = p_user_id
            AND ia.created_at >= NOW() - (p_days_back || ' days')::INTERVAL
        ), 0) as total_conversion_value
    FROM stats;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Recent impact alerts with customer details
CREATE OR REPLACE VIEW recent_impact_alerts AS
SELECT
    ia.id as alert_id,
    ia.user_id,
    u.name as user_name,
    cp.customer_name,
    cp.address,
    cp.customer_phone,
    cp.customer_email,
    ia.alert_type,
    ia.alert_severity,
    ia.storm_date,
    ia.storm_distance_miles,
    ia.hail_size_inches,
    ia.status,
    ia.outcome,
    ia.created_at
FROM impact_alerts ia
JOIN customer_properties cp ON ia.customer_property_id = cp.id
JOIN users u ON ia.user_id = u.id
WHERE ia.created_at >= NOW() - INTERVAL '30 days'
ORDER BY ia.created_at DESC;

COMMENT ON VIEW recent_impact_alerts IS 'Recent storm impact alerts with customer details for quick follow-up';

-- Customer property map data
CREATE OR REPLACE VIEW customer_property_map AS
SELECT
    cp.id,
    cp.user_id,
    cp.customer_name,
    cp.address,
    cp.city,
    cp.state,
    cp.latitude,
    cp.longitude,
    cp.relationship_status,
    cp.last_service_date,
    COUNT(ia.id) as total_alerts,
    MAX(ia.storm_date) as last_storm_date
FROM customer_properties cp
LEFT JOIN impact_alerts ia ON cp.id = ia.customer_property_id
WHERE cp.is_active = TRUE
GROUP BY cp.id
ORDER BY cp.created_at DESC;

COMMENT ON VIEW customer_property_map IS 'Customer properties with alert counts for map display';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE customer_properties IS 'Store customer addresses to monitor for future storm impacts';
COMMENT ON TABLE impact_alerts IS 'Alerts generated when storms affect customer properties';
COMMENT ON TABLE storm_monitoring_runs IS 'Audit log of storm monitoring job runs';

COMMENT ON COLUMN customer_properties.notify_threshold_hail_size IS 'Minimum hail size (inches) to trigger notification';
COMMENT ON COLUMN customer_properties.notify_radius_miles IS 'Maximum distance (miles) for storm to trigger notification';
COMMENT ON COLUMN impact_alerts.alert_severity IS 'Calculated severity: low, medium, high, critical';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 021: Impacted Assets System created successfully!';
    RAISE NOTICE '📊 Tables created: customer_properties, impact_alerts, storm_monitoring_runs';
    RAISE NOTICE '🔍 Functions created: check_storm_impact, get_pending_alerts, calculate_alert_severity, get_impact_stats';
    RAISE NOTICE '👀 Views created: recent_impact_alerts, customer_property_map';
END $$;
