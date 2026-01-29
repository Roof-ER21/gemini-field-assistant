-- ============================================================================
-- STORM MEMORY MIGRATION
-- ============================================================================
-- Purpose: Store verified storm lookups for caching and memory context
-- Created: 2025-01-29
-- ============================================================================

-- Enable PostGIS for geospatial queries (optional but recommended)
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- STORM LOOKUPS TABLE
-- ============================================================================
-- Stores verified storm data from successful API lookups
CREATE TABLE IF NOT EXISTS storm_lookups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Address information
    address_full TEXT NOT NULL,
    address_street VARCHAR(255),
    address_city VARCHAR(100),
    address_state VARCHAR(2),
    address_zip VARCHAR(10),

    -- Location (for proximity searches)
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(11, 7) NOT NULL,

    -- Search parameters
    search_radius_miles INTEGER DEFAULT 0,
    search_months INTEGER DEFAULT 24,

    -- Results summary
    total_events INTEGER DEFAULT 0,
    ihm_events_count INTEGER DEFAULT 0,
    noaa_events_count INTEGER DEFAULT 0,
    wind_events_count INTEGER DEFAULT 0,

    -- Storm events (stored as JSONB)
    events JSONB NOT NULL, -- Array of HailEvent objects
    wind_events JSONB, -- Array of WeatherEvent objects
    noaa_events JSONB, -- Array of NOAAStormEvent objects

    -- Metadata
    data_source VARCHAR(100) DEFAULT 'Interactive Hail Maps + NOAA',
    confidence_score DECIMAL(3, 2) DEFAULT 1.0, -- 0.0-1.0

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),

    -- Usage tracking
    times_referenced INTEGER DEFAULT 0,
    times_used_in_emails INTEGER DEFAULT 0,
    was_helpful BOOLEAN,

    -- Session tracking
    session_id UUID,
    lookup_context TEXT -- What the user was trying to do
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_storm_lookups_user_id ON storm_lookups(user_id);
CREATE INDEX IF NOT EXISTS idx_storm_lookups_address ON storm_lookups(address_full);
CREATE INDEX IF NOT EXISTS idx_storm_lookups_state ON storm_lookups(address_state);
CREATE INDEX IF NOT EXISTS idx_storm_lookups_created_at ON storm_lookups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storm_lookups_expires_at ON storm_lookups(expires_at);

-- Geospatial index for proximity searches
-- Note: This is a simple B-tree index. For better performance with large datasets,
-- consider using PostGIS with CREATE INDEX USING GIST (geography(point))
CREATE INDEX IF NOT EXISTS idx_storm_lookups_location ON storm_lookups(latitude, longitude);

-- JSONB indexes for querying events
CREATE INDEX IF NOT EXISTS idx_storm_lookups_events ON storm_lookups USING gin(events);
CREATE INDEX IF NOT EXISTS idx_storm_lookups_noaa_events ON storm_lookups USING gin(noaa_events);

-- ============================================================================
-- HELPER FUNCTION: Find nearby storm lookups
-- ============================================================================
-- Find cached storm lookups within a certain radius of a location
CREATE OR REPLACE FUNCTION find_nearby_storm_lookups(
    user_email VARCHAR,
    search_lat DECIMAL,
    search_lng DECIMAL,
    radius_miles INTEGER DEFAULT 5,
    max_age_days INTEGER DEFAULT 7
)
RETURNS TABLE (
    id UUID,
    address_full TEXT,
    latitude DECIMAL,
    longitude DECIMAL,
    total_events INTEGER,
    events JSONB,
    distance_miles DECIMAL,
    age_days INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sl.id,
        sl.address_full,
        sl.latitude,
        sl.longitude,
        sl.total_events,
        sl.events,
        -- Calculate distance using Haversine formula approximation
        -- 69 miles per degree latitude, adjusted for longitude
        (
            SQRT(
                POW(69.0 * (sl.latitude - search_lat), 2) +
                POW(69.0 * (sl.longitude - search_lng) * COS(search_lat / 57.3), 2)
            )
        )::DECIMAL(10, 2) AS distance_miles,
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - sl.created_at))::INTEGER AS age_days,
        sl.created_at
    FROM storm_lookups sl
    INNER JOIN users u ON sl.user_id = u.id
    WHERE u.email = user_email
        AND sl.expires_at > CURRENT_TIMESTAMP
        AND (
            SQRT(
                POW(69.0 * (sl.latitude - search_lat), 2) +
                POW(69.0 * (sl.longitude - search_lng) * COS(search_lat / 57.3), 2)
            )
        ) <= radius_miles
        AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - sl.created_at)) <= max_age_days
    ORDER BY distance_miles ASC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTION: Update storm lookup access
-- ============================================================================
CREATE OR REPLACE FUNCTION update_storm_lookup_access(lookup_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE storm_lookups
    SET
        last_accessed_at = CURRENT_TIMESTAMP,
        times_referenced = times_referenced + 1
    WHERE id = lookup_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTION: Cleanup expired storm lookups
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_storm_lookups()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM storm_lookups
    WHERE expires_at < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-update last_accessed_at on read
-- ============================================================================
-- Note: This would require application-level tracking since SELECT doesn't trigger updates
-- Instead, we'll handle this in the application code

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================
-- Insert a test storm lookup (optional)
-- INSERT INTO storm_lookups (user_id, address_full, latitude, longitude, total_events, events)
-- SELECT
--     id,
--     '123 Main St, Fairfax, VA 22030',
--     38.8462,
--     -77.3064,
--     2,
--     '[{"id":"1","date":"2024-06-15","latitude":38.8462,"longitude":-77.3064,"hailSize":1.5,"severity":"moderate","source":"Interactive Hail Maps"}]'::jsonb
-- FROM users WHERE email = 'test@roofer.com'
-- LIMIT 1;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Run this migration using:
-- railway run psql $DATABASE_URL -f database/storm_memory_migration.sql
-- ============================================================================
