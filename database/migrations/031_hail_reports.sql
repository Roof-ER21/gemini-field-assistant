-- Hail Search Reports System
-- Enables users to save advanced hail searches and reload them later

CREATE TABLE IF NOT EXISTS hail_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,

    -- Search criteria (stored as JSONB for flexibility)
    search_criteria JSONB NOT NULL,
    -- Example search_criteria structure:
    -- {
    --   "address": "123 Main St",
    --   "city": "Baltimore",
    --   "state": "MD",
    --   "zip": "21201",
    --   "latitude": 39.2904,
    --   "longitude": -76.6122,
    --   "startDate": "2024-01-01",
    --   "endDate": "2024-12-31",
    --   "minHailSize": 1.0,
    --   "radius": 50
    -- }

    -- Search results summary
    results_count INTEGER DEFAULT 0,
    ihm_events_count INTEGER DEFAULT 0,
    noaa_events_count INTEGER DEFAULT 0,
    max_hail_size DECIMAL(4, 2),
    avg_hail_size DECIMAL(4, 2),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_hail_reports_user ON hail_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_hail_reports_created ON hail_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hail_reports_accessed ON hail_reports(last_accessed_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_hail_report_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_hail_report_timestamp ON hail_reports;
CREATE TRIGGER trigger_update_hail_report_timestamp
BEFORE UPDATE ON hail_reports
FOR EACH ROW
EXECUTE FUNCTION update_hail_report_timestamp();

COMMENT ON TABLE hail_reports IS 'Saved hail search reports with advanced search criteria';
COMMENT ON COLUMN hail_reports.search_criteria IS 'JSONB containing all search parameters (address, dates, hail size, etc.)';
