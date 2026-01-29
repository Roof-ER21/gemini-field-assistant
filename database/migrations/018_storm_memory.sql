-- Migration 018: Storm Memory Service
-- Stores verified storm lookups from IHM/NOAA so Susan AI can reference them later

-- Storm lookups table
CREATE TABLE IF NOT EXISTS storm_lookups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Location info
    address TEXT NOT NULL,
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,

    -- Storm events (JSONB array of storm events from IHM/NOAA)
    storm_events JSONB NOT NULL DEFAULT '[]',
    event_count INTEGER NOT NULL DEFAULT 0,

    -- Data sources
    data_sources JSONB NOT NULL DEFAULT '{"noaa": false, "ihm": false}',

    -- Outcome tracking
    outcome VARCHAR(50), -- 'claim_won', 'claim_lost', 'pending', 'not_pursued'
    outcome_notes TEXT,
    outcome_date DATE,

    -- Metadata
    lookup_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_storm_lookups_user_id ON storm_lookups(user_id);
CREATE INDEX IF NOT EXISTS idx_storm_lookups_location ON storm_lookups(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_storm_lookups_zip ON storm_lookups(zip_code);
CREATE INDEX IF NOT EXISTS idx_storm_lookups_city_state ON storm_lookups(city, state);
CREATE INDEX IF NOT EXISTS idx_storm_lookups_created_at ON storm_lookups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storm_lookups_outcome ON storm_lookups(outcome);

-- GIN index for JSONB storm events search
CREATE INDEX IF NOT EXISTS idx_storm_lookups_events ON storm_lookups USING GIN (storm_events);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_storm_lookup_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_storm_lookup_timestamp ON storm_lookups;
CREATE TRIGGER trigger_update_storm_lookup_timestamp
    BEFORE UPDATE ON storm_lookups
    FOR EACH ROW
    EXECUTE FUNCTION update_storm_lookup_timestamp();

-- Function to calculate distance between two points (Haversine formula)
CREATE OR REPLACE FUNCTION calculate_distance_miles(
    lat1 DECIMAL,
    lon1 DECIMAL,
    lat2 DECIMAL,
    lon2 DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
    R CONSTANT DECIMAL := 3959; -- Earth's radius in miles
    dLat DECIMAL;
    dLon DECIMAL;
    a DECIMAL;
    c DECIMAL;
BEGIN
    dLat := RADIANS(lat2 - lat1);
    dLon := RADIANS(lon2 - lon1);

    a := SIN(dLat / 2) * SIN(dLat / 2) +
         COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
         SIN(dLon / 2) * SIN(dLon / 2);

    c := 2 * ATAN2(SQRT(a), SQRT(1 - a));

    RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON TABLE storm_lookups IS 'Stores verified storm lookups from IHM/NOAA for AI reference and learning';
COMMENT ON COLUMN storm_lookups.storm_events IS 'Array of storm events: [{id, eventType, date, magnitude, source, narrative}]';
COMMENT ON COLUMN storm_lookups.data_sources IS 'Data source flags: {noaa: boolean, ihm: boolean}';
COMMENT ON COLUMN storm_lookups.outcome IS 'Result of insurance claim: claim_won, claim_lost, pending, not_pursued';
