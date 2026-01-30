-- ==========================================================================
-- Migration 035: Canvassing Tables (Simplified - No Dependencies)
-- Creates canvassing tables without requiring storm_events or jobs tables
-- ==========================================================================

-- ============================================================================
-- CANVASSING STATUS TABLE
-- Track contact status for each address during canvassing
-- ============================================================================
CREATE TABLE IF NOT EXISTS canvassing_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Location Information
    address TEXT NOT NULL,
    street_address VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),

    -- Coordinates for map display
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Contact Status
    status VARCHAR(50) NOT NULL DEFAULT 'not_contacted',
    -- Options: 'not_contacted', 'contacted', 'no_answer', 'return_visit',
    --          'not_interested', 'interested', 'lead', 'appointment_set', 'sold', 'customer'

    -- Contact Details
    contacted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    contact_date TIMESTAMPTZ,
    contact_method VARCHAR(50), -- 'door_knock', 'phone', 'email', 'text'

    -- Homeowner Info (if provided)
    homeowner_name VARCHAR(255),
    phone_number VARCHAR(20),
    email VARCHAR(255),

    -- Notes & Follow-up
    notes TEXT,
    follow_up_date DATE,
    follow_up_notes TEXT,

    -- Storm/Job Context (nullable since tables may not exist)
    related_storm_event_id UUID,
    related_job_id UUID,

    -- Team Tracking
    team_id UUID, -- Future: link to teams table
    territory VARCHAR(100),

    -- Contact Attempts
    attempt_count INTEGER DEFAULT 1,
    last_attempt_date TIMESTAMPTZ,

    -- Neighborhood Intel fields
    homeowner_phone VARCHAR(20),
    homeowner_email VARCHAR(255),
    property_notes TEXT,
    best_contact_time VARCHAR(100),
    property_type VARCHAR(50),
    roof_type VARCHAR(100),
    roof_age_years INTEGER,
    auto_monitor BOOLEAN DEFAULT true,
    linked_property_id UUID,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate entries for same address by same team
    UNIQUE(address, team_id)
);

-- ============================================================================
-- CANVASSING SESSIONS TABLE
-- Track canvassing sessions/shifts for reporting
-- ============================================================================
CREATE TABLE IF NOT EXISTS canvassing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Session Details
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,

    -- Location Scope
    target_city VARCHAR(100),
    target_state VARCHAR(2),
    target_zip_code VARCHAR(10),
    target_territory VARCHAR(100),

    -- Related Storm (nullable since table may not exist)
    storm_event_id UUID,

    -- Session Stats (auto-calculated via triggers)
    doors_knocked INTEGER DEFAULT 0,
    contacts_made INTEGER DEFAULT 0,
    leads_generated INTEGER DEFAULT 0,
    appointments_set INTEGER DEFAULT 0,

    -- Notes
    notes TEXT,

    -- Status
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'paused', 'completed'

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- CANVASSING ACTIVITY LOG
-- Detailed log of each canvassing action
-- ============================================================================
CREATE TABLE IF NOT EXISTS canvassing_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links
    canvassing_status_id UUID REFERENCES canvassing_status(id) ON DELETE CASCADE,
    session_id UUID REFERENCES canvassing_sessions(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Activity Details
    action_type VARCHAR(50) NOT NULL, -- 'door_knock', 'status_change', 'note_added', 'follow_up_scheduled'
    previous_status VARCHAR(50),
    new_status VARCHAR(50),

    -- Location at time of action
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Notes
    notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_canvassing_status_location ON canvassing_status(state, city, zip_code);
CREATE INDEX IF NOT EXISTS idx_canvassing_status_coords ON canvassing_status(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_canvassing_status_user ON canvassing_status(contacted_by, contact_date DESC);
CREATE INDEX IF NOT EXISTS idx_canvassing_status_status ON canvassing_status(status);
CREATE INDEX IF NOT EXISTS idx_canvassing_status_follow_up ON canvassing_status(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canvassing_status_territory ON canvassing_status(territory);

CREATE INDEX IF NOT EXISTS idx_canvassing_sessions_user ON canvassing_sessions(user_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_canvassing_sessions_date ON canvassing_sessions(session_date DESC);
CREATE INDEX IF NOT EXISTS idx_canvassing_sessions_status ON canvassing_sessions(status);

CREATE INDEX IF NOT EXISTS idx_canvassing_activity_user ON canvassing_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canvassing_activity_session ON canvassing_activity_log(session_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_canvassing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_canvassing_status_updated_at
    BEFORE UPDATE ON canvassing_status
    FOR EACH ROW
    EXECUTE FUNCTION update_canvassing_timestamp();

CREATE TRIGGER trigger_canvassing_sessions_updated_at
    BEFORE UPDATE ON canvassing_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_canvassing_timestamp();

-- Auto-increment attempt count on status update
CREATE OR REPLACE FUNCTION increment_canvassing_attempts()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != NEW.status THEN
        NEW.attempt_count = OLD.attempt_count + 1;
        NEW.last_attempt_date = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_canvassing_attempt_increment
    BEFORE UPDATE ON canvassing_status
    FOR EACH ROW
    EXECUTE FUNCTION increment_canvassing_attempts();

-- Update session stats when activity logged
CREATE OR REPLACE FUNCTION update_session_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.session_id IS NOT NULL THEN
        UPDATE canvassing_sessions
        SET
            doors_knocked = (
                SELECT COUNT(*) FROM canvassing_activity_log
                WHERE session_id = NEW.session_id AND action_type = 'door_knock'
            ),
            contacts_made = (
                SELECT COUNT(*) FROM canvassing_activity_log
                WHERE session_id = NEW.session_id
                AND new_status IN ('contacted', 'interested', 'lead', 'appointment_set')
            ),
            leads_generated = (
                SELECT COUNT(*) FROM canvassing_activity_log
                WHERE session_id = NEW.session_id AND new_status = 'lead'
            ),
            appointments_set = (
                SELECT COUNT(*) FROM canvassing_activity_log
                WHERE session_id = NEW.session_id AND new_status = 'appointment_set'
            )
        WHERE id = NEW.session_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_session_stats
    AFTER INSERT ON canvassing_activity_log
    FOR EACH ROW
    EXECUTE FUNCTION update_session_stats();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get canvassing stats for a user (FIXED to use actual entries)
CREATE OR REPLACE FUNCTION get_user_canvassing_stats(
    p_user_id UUID,
    p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_doors INTEGER,
    total_contacts INTEGER,
    total_leads INTEGER,
    total_appointments INTEGER,
    conversion_rate DECIMAL,
    avg_doors_per_session DECIMAL
) AS $$
DECLARE
    v_cutoff_date DATE;
BEGIN
    v_cutoff_date := CURRENT_DATE - p_days_back;

    RETURN QUERY
    WITH activity_stats AS (
        -- Count actual canvassing activities from canvassing_status table
        SELECT
            -- Total doors knocked = all entries
            COUNT(*) as doors,
            -- Contacts made = status is contacted or better
            COUNT(*) FILTER (WHERE status IN ('contacted', 'interested', 'lead', 'appointment_set', 'sold', 'customer')) as contacts,
            -- Leads generated
            COUNT(*) FILTER (WHERE status IN ('lead', 'appointment_set', 'sold', 'customer')) as leads,
            -- Appointments set
            COUNT(*) FILTER (WHERE status IN ('appointment_set', 'sold', 'customer')) as appointments
        FROM canvassing_status
        WHERE contacted_by = p_user_id
        AND contact_date >= v_cutoff_date
    ),
    session_stats AS (
        -- Get session data if it exists
        SELECT
            COUNT(*) as session_count,
            COALESCE(SUM(doors_knocked), 0) as session_doors
        FROM canvassing_sessions
        WHERE user_id = p_user_id
        AND session_date >= v_cutoff_date
    )
    SELECT
        COALESCE(a.doors, 0)::INTEGER as total_doors,
        COALESCE(a.contacts, 0)::INTEGER as total_contacts,
        COALESCE(a.leads, 0)::INTEGER as total_leads,
        COALESCE(a.appointments, 0)::INTEGER as total_appointments,
        CASE WHEN a.doors > 0
            THEN ROUND(100.0 * a.leads / a.doors, 2)
            ELSE 0
        END as conversion_rate,
        CASE
            WHEN s.session_count > 0 THEN ROUND(s.session_doors::DECIMAL / s.session_count, 2)
            WHEN a.doors > 0 THEN a.doors::DECIMAL
            ELSE 0
        END as avg_doors_per_session
    FROM activity_stats a
    CROSS JOIN session_stats s;
END;
$$ LANGUAGE plpgsql;

-- Get neighborhood intelligence for an area
CREATE OR REPLACE FUNCTION get_neighborhood_intel(
    p_latitude DECIMAL,
    p_longitude DECIMAL,
    p_radius_miles DECIMAL DEFAULT 0.5
)
RETURNS TABLE (
    address TEXT,
    status VARCHAR,
    homeowner_name VARCHAR,
    homeowner_phone VARCHAR,
    homeowner_email VARCHAR,
    property_notes TEXT,
    best_contact_time VARCHAR,
    property_type VARCHAR,
    roof_type VARCHAR,
    roof_age_years INTEGER,
    contacted_by UUID,
    contact_date TIMESTAMPTZ,
    distance_miles DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cs.address,
        cs.status,
        cs.homeowner_name,
        cs.homeowner_phone,
        cs.homeowner_email,
        cs.property_notes,
        cs.best_contact_time,
        cs.property_type,
        cs.roof_type,
        cs.roof_age_years,
        cs.contacted_by,
        cs.contact_date,
        calculate_distance_miles(p_latitude, p_longitude, cs.latitude, cs.longitude) as distance_miles
    FROM canvassing_status cs
    WHERE cs.latitude IS NOT NULL AND cs.longitude IS NOT NULL
    AND calculate_distance_miles(p_latitude, p_longitude, cs.latitude, cs.longitude) <= p_radius_miles
    ORDER BY distance_miles ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW canvassing_heatmap AS
SELECT
    state,
    city,
    zip_code,
    COUNT(*) as total_addresses,
    COUNT(*) FILTER (WHERE status = 'lead') as leads,
    COUNT(*) FILTER (WHERE status = 'appointment_set') as appointments,
    COUNT(*) FILTER (WHERE status IN ('sold', 'customer')) as sales,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status IN ('lead', 'appointment_set', 'sold', 'customer'))
        / NULLIF(COUNT(*), 0),
        2
    ) as success_rate
FROM canvassing_status
GROUP BY state, city, zip_code
HAVING COUNT(*) >= 5
ORDER BY success_rate DESC;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 035: Canvassing tables created successfully!';
    RAISE NOTICE '📊 Tables: canvassing_status, canvassing_sessions, canvassing_activity_log';
    RAISE NOTICE '🔧 Function: get_user_canvassing_stats (FIXED to count actual entries)';
    RAISE NOTICE '✨ Stats now work without needing canvassing sessions';
END $$;
