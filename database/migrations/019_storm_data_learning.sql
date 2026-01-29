-- ==========================================================================
-- Migration 019: Storm Data Learning System
-- Stores verified hail/storm lookups for Susan's learning and pattern matching
-- ==========================================================================

-- Enable PostGIS extension for geographic queries (optional but recommended)
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- STORM EVENTS TABLE
-- Core table for storing verified storm/hail events
-- ============================================================================
CREATE TABLE IF NOT EXISTS storm_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Location Information
    address TEXT NOT NULL,
    street_address VARCHAR(500),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    zip_code VARCHAR(10) NOT NULL,
    county VARCHAR(100),

    -- Coordinates for geo-queries
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    -- Alternative: Use PostGIS geography type for advanced spatial queries
    -- location GEOGRAPHY(POINT, 4326),

    -- Storm Event Details
    event_date DATE NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'hail', 'wind', 'tornado', 'severe_thunderstorm', 'combined'
    hail_size_inches DECIMAL(4, 2), -- e.g., 1.75 for golf ball
    hail_size_description VARCHAR(50), -- 'golf ball', 'baseball', 'quarter', etc.
    wind_speed_mph INTEGER,

    -- Data Source & Verification
    data_source VARCHAR(50) NOT NULL, -- 'IHM', 'NOAA', 'NWS', 'manual', 'combined'
    source_confidence VARCHAR(20) DEFAULT 'verified', -- 'verified', 'probable', 'possible'
    source_url TEXT,
    source_metadata JSONB, -- Additional source-specific data

    -- Discovery Tracking
    discovered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    lookup_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verification_timestamp TIMESTAMPTZ,

    -- Related Job (if applicable)
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,

    -- Metadata
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE, -- Allow soft delete for disputed data
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Search indexes
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english',
            COALESCE(address, '') || ' ' ||
            COALESCE(city, '') || ' ' ||
            COALESCE(county, '')
        )
    ) STORED
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_storm_events_location
    ON storm_events(state, city, zip_code);

CREATE INDEX IF NOT EXISTS idx_storm_events_date
    ON storm_events(event_date DESC);

CREATE INDEX IF NOT EXISTS idx_storm_events_coords
    ON storm_events(latitude, longitude);

-- GiST index for geographic proximity searches
-- Requires PostGIS: CREATE INDEX idx_storm_events_geography ON storm_events USING GIST(location);

CREATE INDEX IF NOT EXISTS idx_storm_events_type
    ON storm_events(event_type);

CREATE INDEX IF NOT EXISTS idx_storm_events_source
    ON storm_events(data_source);

CREATE INDEX IF NOT EXISTS idx_storm_events_user
    ON storm_events(discovered_by, lookup_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_storm_events_job
    ON storm_events(job_id);

CREATE INDEX IF NOT EXISTS idx_storm_events_search
    ON storm_events USING GIN(search_vector);

-- Composite index for common "storms near this address" queries
CREATE INDEX IF NOT EXISTS idx_storm_events_state_date
    ON storm_events(state, event_date DESC)
    WHERE is_active = TRUE;

COMMENT ON TABLE storm_events IS 'Verified storm/hail events for Susan learning and pattern matching';
COMMENT ON COLUMN storm_events.source_confidence IS 'Data quality: verified (confirmed), probable (high confidence), possible (needs verification)';
COMMENT ON COLUMN storm_events.hail_size_inches IS 'Hail diameter in inches (e.g., 1.00=quarter, 1.75=golf ball, 2.75=baseball)';

-- ============================================================================
-- STORM CLAIM OUTCOMES TABLE
-- Track claim outcomes and strategies for learning
-- ============================================================================
CREATE TABLE IF NOT EXISTS storm_claim_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to storm event and job
    storm_event_id UUID REFERENCES storm_events(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Insurance Claim Information
    insurance_company VARCHAR(255),
    adjuster_name VARCHAR(255),
    claim_number VARCHAR(100),
    claim_filed_date DATE,

    -- Claim Outcome
    claim_status VARCHAR(50) NOT NULL, -- 'approved', 'denied', 'partial', 'pending', 'appealed', 'withdrawn'
    claim_result VARCHAR(20), -- 'won', 'lost', 'partial_win', 'pending'
    approval_amount DECIMAL(10, 2),
    initial_estimate DECIMAL(10, 2),
    final_settlement DECIMAL(10, 2),
    outcome_date DATE,

    -- Strategy & Arguments Used
    key_arguments TEXT[], -- Array of successful arguments
    supporting_evidence TEXT[], -- Types of evidence used: 'photos', 'IHM_report', 'engineer_report', etc.
    challenges_faced TEXT[], -- Obstacles encountered
    resolution_method VARCHAR(100), -- 'supplement', 'appeal', 'escalation', 'mediation', 'direct_approval'

    -- Adjuster Response Patterns
    adjuster_behavior VARCHAR(50), -- 'cooperative', 'difficult', 'neutral', 'initially_resistant'
    adjuster_notes TEXT,
    response_time_days INTEGER,
    required_reinspection BOOLEAN DEFAULT FALSE,

    -- Timeline
    initial_denial_reasons TEXT[],
    appeal_strategy TEXT,
    appeal_outcome VARCHAR(50),

    -- Learning Tags
    success_factors TEXT[], -- What made this successful
    lessons_learned TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_storm_outcomes_storm
    ON storm_claim_outcomes(storm_event_id);

CREATE INDEX IF NOT EXISTS idx_storm_outcomes_job
    ON storm_claim_outcomes(job_id);

CREATE INDEX IF NOT EXISTS idx_storm_outcomes_user
    ON storm_claim_outcomes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_storm_outcomes_insurer
    ON storm_claim_outcomes(insurance_company);

CREATE INDEX IF NOT EXISTS idx_storm_outcomes_result
    ON storm_claim_outcomes(claim_result);

-- GIN indexes for array searches
CREATE INDEX IF NOT EXISTS idx_storm_outcomes_arguments
    ON storm_claim_outcomes USING GIN(key_arguments);

CREATE INDEX IF NOT EXISTS idx_storm_outcomes_evidence
    ON storm_claim_outcomes USING GIN(supporting_evidence);

COMMENT ON TABLE storm_claim_outcomes IS 'Track claim outcomes and successful strategies for Susan learning';
COMMENT ON COLUMN storm_claim_outcomes.key_arguments IS 'Array of successful arguments that won the claim';
COMMENT ON COLUMN storm_claim_outcomes.success_factors IS 'Tags for what made this successful: timing, evidence_quality, adjuster_relationship, etc.';

-- ============================================================================
-- STORM AREA PATTERNS TABLE
-- Aggregate patterns for specific geographic areas
-- ============================================================================
CREATE TABLE IF NOT EXISTS storm_area_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Geographic Scope
    scope_type VARCHAR(20) NOT NULL, -- 'zip_code', 'city', 'county', 'state'
    state VARCHAR(2) NOT NULL,
    county VARCHAR(100),
    city VARCHAR(100),
    zip_code VARCHAR(10),

    -- Pattern Statistics (auto-calculated)
    total_events INTEGER DEFAULT 0,
    total_claims INTEGER DEFAULT 0,
    successful_claims INTEGER DEFAULT 0,
    success_rate DECIMAL(5, 2), -- Percentage

    -- Common Patterns
    common_event_types JSONB, -- {"hail": 45, "wind": 30, "tornado": 5}
    common_insurers JSONB, -- {"State Farm": 20, "Allstate": 15}
    average_approval_amount DECIMAL(10, 2),

    -- Successful Strategies (aggregated)
    top_arguments TEXT[],
    top_evidence_types TEXT[],
    typical_adjuster_behavior VARCHAR(50),

    -- Date Range
    earliest_event_date DATE,
    latest_event_date DATE,

    -- Metadata
    last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure unique patterns per scope
    UNIQUE(scope_type, state, county, city, zip_code)
);

CREATE INDEX IF NOT EXISTS idx_storm_patterns_scope
    ON storm_area_patterns(scope_type, state);

CREATE INDEX IF NOT EXISTS idx_storm_patterns_zip
    ON storm_area_patterns(zip_code) WHERE scope_type = 'zip_code';

CREATE INDEX IF NOT EXISTS idx_storm_patterns_success
    ON storm_area_patterns(success_rate DESC);

COMMENT ON TABLE storm_area_patterns IS 'Aggregated storm/claim patterns for geographic areas - used for quick recommendations';

-- ============================================================================
-- STORM LOOKUP ANALYTICS TABLE
-- Track when and how users query storm data
-- ============================================================================
CREATE TABLE IF NOT EXISTS storm_lookup_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Query Parameters
    query_type VARCHAR(50) NOT NULL, -- 'address_lookup', 'radius_search', 'zip_search', 'date_range'
    query_address TEXT,
    query_latitude DECIMAL(10, 8),
    query_longitude DECIMAL(11, 8),
    query_radius_miles DECIMAL(6, 2),
    query_date_range DATERANGE,

    -- Results
    results_found INTEGER DEFAULT 0,
    storm_event_ids UUID[], -- Array of storm event IDs returned

    -- Context
    related_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    session_id VARCHAR(255),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storm_analytics_user
    ON storm_lookup_analytics(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_storm_analytics_type
    ON storm_lookup_analytics(query_type);

COMMENT ON TABLE storm_lookup_analytics IS 'Track storm lookup queries for usage analytics and improvement';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Calculate distance between two points (Haversine formula)
-- Returns distance in miles
CREATE OR REPLACE FUNCTION calculate_distance_miles(
    lat1 DECIMAL, lon1 DECIMAL,
    lat2 DECIMAL, lon2 DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
    R DECIMAL := 3959.0; -- Earth radius in miles
    dLat DECIMAL;
    dLon DECIMAL;
    a DECIMAL;
    c DECIMAL;
BEGIN
    dLat := RADIANS(lat2 - lat1);
    dLon := RADIANS(lon2 - lon1);

    a := SIN(dLat/2) * SIN(dLat/2) +
         COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
         SIN(dLon/2) * SIN(dLon/2);

    c := 2 * ATAN2(SQRT(a), SQRT(1-a));

    RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_distance_miles IS 'Calculate distance in miles between two lat/lon points using Haversine formula';

-- Function: Find storms near coordinates
CREATE OR REPLACE FUNCTION find_storms_near_location(
    p_latitude DECIMAL,
    p_longitude DECIMAL,
    p_radius_miles DECIMAL DEFAULT 10,
    p_days_back INTEGER DEFAULT 365
)
RETURNS TABLE (
    storm_id UUID,
    distance_miles DECIMAL,
    event_date DATE,
    event_type VARCHAR(50),
    hail_size_inches DECIMAL,
    city VARCHAR(100),
    state VARCHAR(2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        se.id,
        calculate_distance_miles(p_latitude, p_longitude, se.latitude, se.longitude) as distance,
        se.event_date,
        se.event_type,
        se.hail_size_inches,
        se.city,
        se.state
    FROM storm_events se
    WHERE
        se.is_active = TRUE
        AND se.event_date >= CURRENT_DATE - (p_days_back || ' days')::INTERVAL
        AND calculate_distance_miles(p_latitude, p_longitude, se.latitude, se.longitude) <= p_radius_miles
    ORDER BY distance ASC, se.event_date DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_storms_near_location IS 'Find storm events within radius of coordinates';

-- Function: Get successful claim strategies for area
CREATE OR REPLACE FUNCTION get_area_claim_strategies(
    p_state VARCHAR(2),
    p_city VARCHAR(100) DEFAULT NULL,
    p_zip_code VARCHAR(10) DEFAULT NULL,
    p_insurance_company VARCHAR(255) DEFAULT NULL
)
RETURNS TABLE (
    total_claims BIGINT,
    success_rate DECIMAL,
    top_arguments TEXT[],
    common_evidence TEXT[],
    avg_settlement DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH area_claims AS (
        SELECT sco.*
        FROM storm_claim_outcomes sco
        JOIN storm_events se ON sco.storm_event_id = se.id
        WHERE
            se.state = p_state
            AND (p_city IS NULL OR se.city = p_city)
            AND (p_zip_code IS NULL OR se.zip_code = p_zip_code)
            AND (p_insurance_company IS NULL OR sco.insurance_company = p_insurance_company)
            AND sco.claim_result IN ('won', 'partial_win')
    ),
    aggregated AS (
        SELECT
            COUNT(*) as total,
            ROUND(
                100.0 * COUNT(*) FILTER (WHERE claim_result = 'won') / NULLIF(COUNT(*), 0),
                2
            ) as success_pct,
            ARRAY_AGG(DISTINCT unnested_arg) FILTER (WHERE unnested_arg IS NOT NULL) as arguments,
            ARRAY_AGG(DISTINCT unnested_ev) FILTER (WHERE unnested_ev IS NOT NULL) as evidence,
            ROUND(AVG(final_settlement), 2) as avg_amt
        FROM area_claims
        CROSS JOIN UNNEST(area_claims.key_arguments) as unnested_arg
        CROSS JOIN UNNEST(area_claims.supporting_evidence) as unnested_ev
    )
    SELECT
        total,
        success_pct,
        arguments,
        evidence,
        avg_amt
    FROM aggregated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_area_claim_strategies IS 'Get aggregated successful claim strategies for a geographic area';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_storm_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_storm_events_updated_at
    BEFORE UPDATE ON storm_events
    FOR EACH ROW
    EXECUTE FUNCTION update_storm_timestamp();

CREATE TRIGGER trigger_storm_outcomes_updated_at
    BEFORE UPDATE ON storm_claim_outcomes
    FOR EACH ROW
    EXECUTE FUNCTION update_storm_timestamp();

CREATE TRIGGER trigger_storm_patterns_updated_at
    BEFORE UPDATE ON storm_area_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_storm_timestamp();

-- ============================================================================
-- USEFUL VIEWS
-- ============================================================================

-- View: Recent successful claims with details
CREATE OR REPLACE VIEW recent_successful_claims AS
SELECT
    se.event_date,
    se.city,
    se.state,
    se.zip_code,
    se.event_type,
    se.hail_size_inches,
    sco.insurance_company,
    sco.claim_result,
    sco.final_settlement,
    sco.key_arguments,
    sco.supporting_evidence,
    sco.success_factors,
    sco.outcome_date
FROM storm_claim_outcomes sco
JOIN storm_events se ON sco.storm_event_id = se.id
WHERE sco.claim_result IN ('won', 'partial_win')
ORDER BY sco.outcome_date DESC;

COMMENT ON VIEW recent_successful_claims IS 'Recent successful claims with strategies for Susan learning';

-- View: Storm events with claim success rates by area
CREATE OR REPLACE VIEW storm_hotspots AS
SELECT
    state,
    city,
    zip_code,
    COUNT(*) as total_storms,
    COUNT(DISTINCT CASE WHEN sco.claim_result IN ('won', 'partial_win') THEN sco.id END) as successful_claims,
    ROUND(
        100.0 * COUNT(DISTINCT CASE WHEN sco.claim_result IN ('won', 'partial_win') THEN sco.id END)
        / NULLIF(COUNT(DISTINCT sco.id), 0),
        2
    ) as success_rate,
    MAX(event_date) as last_storm_date,
    AVG(hail_size_inches) as avg_hail_size
FROM storm_events se
LEFT JOIN storm_claim_outcomes sco ON se.id = sco.storm_event_id
WHERE se.is_active = TRUE
GROUP BY state, city, zip_code
HAVING COUNT(*) >= 3
ORDER BY total_storms DESC, success_rate DESC;

COMMENT ON VIEW storm_hotspots IS 'Areas with multiple storms and claim success metrics';

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================

-- Example storm event
INSERT INTO storm_events (
    address, street_address, city, state, zip_code, county,
    latitude, longitude,
    event_date, event_type, hail_size_inches, hail_size_description,
    data_source, source_confidence,
    notes
) VALUES (
    '123 Main St, Fredericksburg, VA 22401',
    '123 Main St',
    'Fredericksburg',
    'VA',
    '22401',
    'Spotsylvania',
    38.3032053,
    -77.4605399,
    '2024-06-15',
    'hail',
    1.75,
    'golf ball',
    'IHM',
    'verified',
    'Sample storm event for testing'
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 019: Storm Data Learning System created successfully!';
    RAISE NOTICE '📊 Tables created: storm_events, storm_claim_outcomes, storm_area_patterns, storm_lookup_analytics';
    RAISE NOTICE '🔍 Functions created: calculate_distance_miles, find_storms_near_location, get_area_claim_strategies';
    RAISE NOTICE '👀 Views created: recent_successful_claims, storm_hotspots';
END $$;
