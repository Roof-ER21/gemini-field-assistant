-- ==========================================================================
-- Migration 020: Canvassing Tracker System
-- Tracks door-to-door canvassing status for sales reps
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
    --          'not_interested', 'interested', 'lead', 'appointment_set', 'sold'

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

    -- Storm/Job Context
    related_storm_event_id UUID REFERENCES storm_events(id) ON DELETE SET NULL,
    related_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,

    -- Team Tracking
    team_id UUID, -- Future: link to teams table
    territory VARCHAR(100),

    -- Contact Attempts
    attempt_count INTEGER DEFAULT 1,
    last_attempt_date TIMESTAMPTZ,

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

    -- Related Storm (if storm chasing)
    storm_event_id UUID REFERENCES storm_events(id) ON DELETE SET NULL,

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

-- Canvassing Status indexes
CREATE INDEX IF NOT EXISTS idx_canvassing_status_location
    ON canvassing_status(state, city, zip_code);

CREATE INDEX IF NOT EXISTS idx_canvassing_status_coords
    ON canvassing_status(latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_canvassing_status_user
    ON canvassing_status(contacted_by, contact_date DESC);

CREATE INDEX IF NOT EXISTS idx_canvassing_status_status
    ON canvassing_status(status);

CREATE INDEX IF NOT EXISTS idx_canvassing_status_follow_up
    ON canvassing_status(follow_up_date)
    WHERE follow_up_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canvassing_status_territory
    ON canvassing_status(territory);

CREATE INDEX IF NOT EXISTS idx_canvassing_status_storm
    ON canvassing_status(related_storm_event_id);

-- Session indexes
CREATE INDEX IF NOT EXISTS idx_canvassing_sessions_user
    ON canvassing_sessions(user_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_canvassing_sessions_date
    ON canvassing_sessions(session_date DESC);

CREATE INDEX IF NOT EXISTS idx_canvassing_sessions_status
    ON canvassing_sessions(status);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_canvassing_activity_user
    ON canvassing_activity_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canvassing_activity_session
    ON canvassing_activity_log(session_id);

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

-- Get canvassing stats for a user
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
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(cs.doors_knocked), 0)::INTEGER as total_doors,
        COALESCE(SUM(cs.contacts_made), 0)::INTEGER as total_contacts,
        COALESCE(SUM(cs.leads_generated), 0)::INTEGER as total_leads,
        COALESCE(SUM(cs.appointments_set), 0)::INTEGER as total_appointments,
        CASE WHEN SUM(cs.doors_knocked) > 0
            THEN ROUND(100.0 * SUM(cs.leads_generated) / SUM(cs.doors_knocked), 2)
            ELSE 0
        END as conversion_rate,
        CASE WHEN COUNT(*) > 0
            THEN ROUND(SUM(cs.doors_knocked)::DECIMAL / COUNT(*), 2)
            ELSE 0
        END as avg_doors_per_session
    FROM canvassing_sessions cs
    WHERE cs.user_id = p_user_id
    AND cs.session_date >= CURRENT_DATE - p_days_back;
END;
$$ LANGUAGE plpgsql;

-- Get addresses needing follow-up
CREATE OR REPLACE FUNCTION get_follow_up_list(
    p_user_id UUID DEFAULT NULL,
    p_territory VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    address TEXT,
    status VARCHAR,
    follow_up_date DATE,
    follow_up_notes TEXT,
    homeowner_name VARCHAR,
    phone_number VARCHAR,
    last_attempt_date TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cs.id,
        cs.address,
        cs.status,
        cs.follow_up_date,
        cs.follow_up_notes,
        cs.homeowner_name,
        cs.phone_number,
        cs.last_attempt_date
    FROM canvassing_status cs
    WHERE
        cs.follow_up_date <= CURRENT_DATE
        AND cs.status IN ('return_visit', 'interested', 'lead')
        AND (p_user_id IS NULL OR cs.contacted_by = p_user_id)
        AND (p_territory IS NULL OR cs.territory = p_territory)
    ORDER BY cs.follow_up_date ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Daily canvassing summary by user
CREATE OR REPLACE VIEW daily_canvassing_summary AS
SELECT
    cs.user_id,
    u.name as user_name,
    cs.session_date,
    COUNT(*) as sessions,
    SUM(cs.doors_knocked) as total_doors,
    SUM(cs.contacts_made) as total_contacts,
    SUM(cs.leads_generated) as total_leads,
    SUM(cs.appointments_set) as total_appointments,
    ROUND(
        100.0 * SUM(cs.leads_generated) / NULLIF(SUM(cs.doors_knocked), 0),
        2
    ) as conversion_rate
FROM canvassing_sessions cs
JOIN users u ON cs.user_id = u.id
GROUP BY cs.user_id, u.name, cs.session_date
ORDER BY cs.session_date DESC, total_doors DESC;

COMMENT ON VIEW daily_canvassing_summary IS 'Daily performance summary for each sales rep';

-- Territory heatmap data
CREATE OR REPLACE VIEW canvassing_heatmap AS
SELECT
    state,
    city,
    zip_code,
    COUNT(*) as total_addresses,
    COUNT(*) FILTER (WHERE status = 'lead') as leads,
    COUNT(*) FILTER (WHERE status = 'appointment_set') as appointments,
    COUNT(*) FILTER (WHERE status = 'sold') as sales,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status IN ('lead', 'appointment_set', 'sold'))
        / NULLIF(COUNT(*), 0),
        2
    ) as success_rate
FROM canvassing_status
GROUP BY state, city, zip_code
HAVING COUNT(*) >= 5
ORDER BY success_rate DESC;

COMMENT ON VIEW canvassing_heatmap IS 'Success rates by area for territory planning';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE canvassing_status IS 'Track contact status for each address during door-to-door canvassing';
COMMENT ON TABLE canvassing_sessions IS 'Track canvassing sessions/shifts for performance reporting';
COMMENT ON TABLE canvassing_activity_log IS 'Detailed log of canvassing activities for audit trail';

COMMENT ON COLUMN canvassing_status.status IS 'Contact status: not_contacted, contacted, no_answer, return_visit, not_interested, interested, lead, appointment_set, sold';
COMMENT ON COLUMN canvassing_status.attempt_count IS 'Number of contact attempts for this address';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 020: Canvassing Tracker System created successfully!';
    RAISE NOTICE '📊 Tables created: canvassing_status, canvassing_sessions, canvassing_activity_log';
    RAISE NOTICE '🔍 Functions created: get_user_canvassing_stats, get_follow_up_list';
    RAISE NOTICE '👀 Views created: daily_canvassing_summary, canvassing_heatmap';
END $$;
