-- Territory Management System
-- Enables reps to define and manage their sales territories
-- Competitors: SPOTIO, HailTrace have similar features

-- Enable PostGIS for geographic operations (if not enabled)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Territories table
CREATE TABLE IF NOT EXISTS territories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#dc2626', -- Hex color for map display

    -- Owner and team
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID, -- For shared territories
    is_shared BOOLEAN DEFAULT FALSE,

    -- Geographic boundary (polygon)
    boundary GEOMETRY(POLYGON, 4326),

    -- Center point for quick lookups
    center_lat DECIMAL(10, 8),
    center_lng DECIMAL(11, 8),

    -- Statistics (updated by triggers)
    total_addresses INTEGER DEFAULT 0,
    addresses_canvassed INTEGER DEFAULT 0,
    total_leads INTEGER DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    revenue_generated DECIMAL(12, 2) DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

-- Territory assignments (for shared territories)
CREATE TABLE IF NOT EXISTS territory_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    territory_id UUID REFERENCES territories(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- 'owner', 'manager', 'member'
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ, -- Optional expiration

    UNIQUE(territory_id, user_id)
);

-- Territory activity log
CREATE TABLE IF NOT EXISTS territory_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    territory_id UUID REFERENCES territories(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    activity_type VARCHAR(50) NOT NULL, -- 'canvass', 'lead', 'appointment', 'sale', 'check_in', 'check_out'

    -- Location of activity
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    address TEXT,

    -- Activity details
    details JSONB DEFAULT '{}',
    revenue_amount DECIMAL(10, 2),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Territory check-ins (for tracking rep location)
CREATE TABLE IF NOT EXISTS territory_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    territory_id UUID REFERENCES territories(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    check_in_time TIMESTAMPTZ DEFAULT NOW(),
    check_out_time TIMESTAMPTZ,

    -- Location tracking
    check_in_lat DECIMAL(10, 8),
    check_in_lng DECIMAL(11, 8),
    check_out_lat DECIMAL(10, 8),
    check_out_lng DECIMAL(11, 8),

    -- Session stats (updated on check-out)
    doors_knocked INTEGER DEFAULT 0,
    contacts_made INTEGER DEFAULT 0,
    leads_generated INTEGER DEFAULT 0,
    appointments_set INTEGER DEFAULT 0,

    notes TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_territories_owner ON territories(owner_id);
CREATE INDEX IF NOT EXISTS idx_territories_boundary ON territories USING GIST(boundary);
CREATE INDEX IF NOT EXISTS idx_territories_center ON territories(center_lat, center_lng);
CREATE INDEX IF NOT EXISTS idx_territory_assignments_user ON territory_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_territory_activity_territory ON territory_activity(territory_id);
CREATE INDEX IF NOT EXISTS idx_territory_activity_created ON territory_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_territory_checkins_user ON territory_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_territory_checkins_active ON territory_checkins(check_out_time) WHERE check_out_time IS NULL;

-- Function to check if a point is within any territory
CREATE OR REPLACE FUNCTION get_territory_for_point(lat DECIMAL, lng DECIMAL)
RETURNS TABLE(territory_id UUID, territory_name VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT t.id, t.name
    FROM territories t
    WHERE ST_Contains(t.boundary, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
    AND t.archived_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to get territories for a user
CREATE OR REPLACE FUNCTION get_user_territories(p_user_id UUID)
RETURNS TABLE(
    territory_id UUID,
    territory_name VARCHAR,
    role VARCHAR,
    total_addresses INTEGER,
    addresses_canvassed INTEGER,
    total_leads INTEGER,
    is_owner BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.name,
        COALESCE(ta.role, 'owner')::VARCHAR,
        t.total_addresses,
        t.addresses_canvassed,
        t.total_leads,
        (t.owner_id = p_user_id)
    FROM territories t
    LEFT JOIN territory_assignments ta ON t.id = ta.territory_id AND ta.user_id = p_user_id
    WHERE t.archived_at IS NULL
    AND (t.owner_id = p_user_id OR ta.user_id = p_user_id);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update territory stats when activity is logged
CREATE OR REPLACE FUNCTION update_territory_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE territories
    SET
        total_leads = total_leads + CASE WHEN NEW.activity_type = 'lead' THEN 1 ELSE 0 END,
        total_appointments = total_appointments + CASE WHEN NEW.activity_type = 'appointment' THEN 1 ELSE 0 END,
        total_sales = total_sales + CASE WHEN NEW.activity_type = 'sale' THEN 1 ELSE 0 END,
        revenue_generated = revenue_generated + COALESCE(NEW.revenue_amount, 0),
        updated_at = NOW()
    WHERE id = NEW.territory_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_territory_stats
AFTER INSERT ON territory_activity
FOR EACH ROW
EXECUTE FUNCTION update_territory_stats();

-- Trigger to update territory canvassing stats
CREATE OR REPLACE FUNCTION update_territory_canvassing_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update territory stats when a check-in session ends
    IF NEW.check_out_time IS NOT NULL AND OLD.check_out_time IS NULL THEN
        UPDATE territories
        SET
            addresses_canvassed = addresses_canvassed + NEW.doors_knocked,
            total_leads = total_leads + NEW.leads_generated,
            total_appointments = total_appointments + NEW.appointments_set,
            updated_at = NOW()
        WHERE id = NEW.territory_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_territory_canvassing
AFTER UPDATE ON territory_checkins
FOR EACH ROW
EXECUTE FUNCTION update_territory_canvassing_stats();

-- View for territory leaderboard
CREATE OR REPLACE VIEW territory_leaderboard AS
SELECT
    t.id AS territory_id,
    t.name AS territory_name,
    t.color,
    u.name AS owner_name,
    u.email AS owner_email,
    t.total_addresses,
    t.addresses_canvassed,
    t.total_leads,
    t.total_appointments,
    t.total_sales,
    t.revenue_generated,
    CASE WHEN t.total_addresses > 0
        THEN ROUND((t.addresses_canvassed::DECIMAL / t.total_addresses) * 100, 1)
        ELSE 0
    END AS coverage_percent,
    CASE WHEN t.addresses_canvassed > 0
        THEN ROUND((t.total_leads::DECIMAL / t.addresses_canvassed) * 100, 1)
        ELSE 0
    END AS lead_rate
FROM territories t
JOIN users u ON t.owner_id = u.id
WHERE t.archived_at IS NULL
ORDER BY t.revenue_generated DESC;

-- Insert sample territory for testing (if none exist)
-- This creates a sample territory around Frederick, MD
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM territories LIMIT 1) THEN
        INSERT INTO territories (
            name,
            description,
            color,
            boundary,
            center_lat,
            center_lng
        ) VALUES (
            'Frederick Downtown',
            'Main canvassing area covering downtown Frederick, MD',
            '#dc2626',
            ST_GeomFromText('POLYGON((-77.43 39.40, -77.40 39.40, -77.40 39.43, -77.43 39.43, -77.43 39.40))', 4326),
            39.415,
            -77.415
        );
    END IF;
END $$;

COMMENT ON TABLE territories IS 'Sales territories with geographic boundaries for canvassing management';
COMMENT ON TABLE territory_assignments IS 'Tracks which users are assigned to which territories';
COMMENT ON TABLE territory_activity IS 'Log of all activity within territories';
COMMENT ON TABLE territory_checkins IS 'Tracks rep check-ins/outs within territories';
