-- Migration 033: Hail Knowledge for Susan AI
-- Creates hail_knowledge table to store indexed storm reports for Susan's memory

-- Create hail_knowledge table
CREATE TABLE IF NOT EXISTS hail_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storm_lookup_id UUID NOT NULL REFERENCES storm_lookups(id) ON DELETE CASCADE,

  -- Searchable metadata
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  location VARCHAR(500) NOT NULL,
  state VARCHAR(2),
  city VARCHAR(200),
  zip_code VARCHAR(10),

  -- Date range for temporal search
  date_range_start DATE,
  date_range_end DATE,

  -- Event summary statistics
  total_events INTEGER NOT NULL DEFAULT 0,
  hail_events INTEGER NOT NULL DEFAULT 0,
  wind_events INTEGER NOT NULL DEFAULT 0,
  tornado_events INTEGER NOT NULL DEFAULT 0,
  max_hail_size NUMERIC(5,2), -- in inches

  -- Data sources (JSONB: {noaa: boolean, ihm: boolean})
  data_sources JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one knowledge entry per storm lookup
  CONSTRAINT unique_storm_lookup UNIQUE (storm_lookup_id)
);

-- Create indexes for fast searching
CREATE INDEX IF NOT EXISTS idx_hail_knowledge_user_id ON hail_knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_hail_knowledge_state ON hail_knowledge(state);
CREATE INDEX IF NOT EXISTS idx_hail_knowledge_city ON hail_knowledge(city);
CREATE INDEX IF NOT EXISTS idx_hail_knowledge_zip_code ON hail_knowledge(zip_code);
CREATE INDEX IF NOT EXISTS idx_hail_knowledge_date_range ON hail_knowledge(date_range_start, date_range_end);
CREATE INDEX IF NOT EXISTS idx_hail_knowledge_max_hail_size ON hail_knowledge(max_hail_size);
CREATE INDEX IF NOT EXISTS idx_hail_knowledge_updated_at ON hail_knowledge(updated_at DESC);

-- Full-text search index on content
CREATE INDEX IF NOT EXISTS idx_hail_knowledge_content_fts ON hail_knowledge USING GIN (to_tsvector('english', content));

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_hail_knowledge_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_hail_knowledge_updated_at
  BEFORE UPDATE ON hail_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION update_hail_knowledge_updated_at();

-- Add comment to table
COMMENT ON TABLE hail_knowledge IS 'Indexed storm reports for Susan AI knowledge base. Allows Susan to answer questions about past hail events by location, date, and severity.';

-- Add comments to columns
COMMENT ON COLUMN hail_knowledge.storm_lookup_id IS 'Reference to the original storm lookup in storm_lookups table';
COMMENT ON COLUMN hail_knowledge.content IS 'Formatted, searchable text describing all storm events';
COMMENT ON COLUMN hail_knowledge.date_range_start IS 'Earliest storm event date in this report';
COMMENT ON COLUMN hail_knowledge.date_range_end IS 'Latest storm event date in this report';
COMMENT ON COLUMN hail_knowledge.max_hail_size IS 'Maximum hail size in inches across all events';
COMMENT ON COLUMN hail_knowledge.data_sources IS 'JSON object indicating which data sources were used (NOAA, IHM)';
