-- HailTrace Import Events Table
-- Stores imported events from HailTrace JSON exports
-- ALL dates stored in Eastern timezone (America/New_York) for consistency

CREATE TABLE IF NOT EXISTS hailtrace_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- HailTrace event data
    event_id VARCHAR(255) NOT NULL UNIQUE, -- Original HailTrace ID
    event_date DATE NOT NULL, -- Normalized to Eastern timezone

    -- Event types (stored as JSONB array)
    types JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Example: ["ALGORITHM_HAIL_SIZE", "METEOROLOGIST_HAIL_SIZE"]

    -- Hail size measurements (in inches)
    hail_size DECIMAL(4, 2), -- Primary hail size
    hail_size_algorithm DECIMAL(4, 2), -- Algorithm-derived size
    hail_size_meteo DECIMAL(4, 2), -- Meteorologist-confirmed size

    -- Wind data
    wind_speed INTEGER, -- mph
    wind_star_level INTEGER, -- 0-5 star rating

    -- Geolocation (if available in HailTrace data)
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),

    -- Import metadata
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    source_file VARCHAR(500), -- Original JSON filename
    raw_data JSONB, -- Full original event data

    -- Soft delete
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_hailtrace_event_id ON hailtrace_events(event_id);
CREATE INDEX IF NOT EXISTS idx_hailtrace_event_date ON hailtrace_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_hailtrace_imported_at ON hailtrace_events(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_hailtrace_source_file ON hailtrace_events(source_file);
CREATE INDEX IF NOT EXISTS idx_hailtrace_hail_size ON hailtrace_events(hail_size DESC) WHERE hail_size IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hailtrace_coords ON hailtrace_events(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hailtrace_types ON hailtrace_events USING gin(types);
CREATE INDEX IF NOT EXISTS idx_hailtrace_not_deleted ON hailtrace_events(event_date) WHERE deleted_at IS NULL;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_hailtrace_event_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_hailtrace_event_timestamp ON hailtrace_events;
CREATE TRIGGER trigger_update_hailtrace_event_timestamp
BEFORE UPDATE ON hailtrace_events
FOR EACH ROW
EXECUTE FUNCTION update_hailtrace_event_timestamp();

-- Import statistics view
CREATE OR REPLACE VIEW hailtrace_import_stats AS
SELECT
    source_file,
    COUNT(*) as event_count,
    MIN(event_date) as earliest_event,
    MAX(event_date) as latest_event,
    AVG(hail_size) as avg_hail_size,
    MAX(hail_size) as max_hail_size,
    MIN(imported_at) as imported_at
FROM hailtrace_events
WHERE deleted_at IS NULL
GROUP BY source_file
ORDER BY imported_at DESC;

COMMENT ON TABLE hailtrace_events IS 'Imported HailTrace events with Eastern timezone normalization';
COMMENT ON COLUMN hailtrace_events.event_date IS 'Event date normalized to Eastern timezone (America/New_York)';
COMMENT ON COLUMN hailtrace_events.types IS 'JSONB array of event types (e.g., ALGORITHM_HAIL_SIZE, METEOROLOGIST_HAIL_SIZE)';
COMMENT ON COLUMN hailtrace_events.raw_data IS 'Full original HailTrace event data for audit purposes';
