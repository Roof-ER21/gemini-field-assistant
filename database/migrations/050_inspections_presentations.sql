-- Migration 050: Inspections and Presentations System
-- Adds support for roof inspections with photos and presentation generation

-- Inspections table
CREATE TABLE IF NOT EXISTS inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_address TEXT NOT NULL,
  property_lat DECIMAL(10, 8),
  property_lng DECIMAL(11, 8),
  homeowner_name TEXT,
  homeowner_phone TEXT,
  homeowner_email TEXT,
  inspection_date TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inspection photos table
CREATE TABLE IF NOT EXISTS inspection_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('overview', 'damage', 'detail', 'other')),
  caption TEXT,
  damage_severity TEXT CHECK (damage_severity IN ('none', 'minor', 'moderate', 'severe')),
  upload_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Presentations table
CREATE TABLE IF NOT EXISTS presentations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inspection_id UUID REFERENCES inspections(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  cover_image TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Presentation slides table
CREATE TABLE IF NOT EXISTS presentation_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id UUID NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  slide_type TEXT NOT NULL CHECK (slide_type IN ('cover', 'damage_overview', 'photo_detail', 'recommendations', 'contact')),
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  slide_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Viewer sessions table (for tracking presentation views)
CREATE TABLE IF NOT EXISTS viewer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id UUID NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  viewer_ip TEXT,
  viewer_user_agent TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_viewed_at TIMESTAMPTZ DEFAULT NOW(),
  slides_viewed INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inspections_contractor ON inspections(contractor_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
CREATE INDEX IF NOT EXISTS idx_inspections_date ON inspections(inspection_date DESC);

CREATE INDEX IF NOT EXISTS idx_inspection_photos_inspection ON inspection_photos(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_type ON inspection_photos(photo_type);

CREATE INDEX IF NOT EXISTS idx_presentations_contractor ON presentations(contractor_id);
CREATE INDEX IF NOT EXISTS idx_presentations_inspection ON presentations(inspection_id);
CREATE INDEX IF NOT EXISTS idx_presentations_active ON presentations(is_active);

CREATE INDEX IF NOT EXISTS idx_presentation_slides_presentation ON presentation_slides(presentation_id);
CREATE INDEX IF NOT EXISTS idx_presentation_slides_order ON presentation_slides(presentation_id, slide_order);

CREATE INDEX IF NOT EXISTS idx_viewer_sessions_presentation ON viewer_sessions(presentation_id);
CREATE INDEX IF NOT EXISTS idx_viewer_sessions_started ON viewer_sessions(started_at DESC);

-- Update trigger for inspections
CREATE OR REPLACE FUNCTION update_inspection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inspection_timestamp
BEFORE UPDATE ON inspections
FOR EACH ROW
EXECUTE FUNCTION update_inspection_timestamp();

-- Update trigger for presentations
CREATE TRIGGER trigger_update_presentation_timestamp
BEFORE UPDATE ON presentations
FOR EACH ROW
EXECUTE FUNCTION update_inspection_timestamp();

-- Update trigger for presentation_slides
CREATE TRIGGER trigger_update_slide_timestamp
BEFORE UPDATE ON presentation_slides
FOR EACH ROW
EXECUTE FUNCTION update_inspection_timestamp();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON inspections TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_photos TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON presentations TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON presentation_slides TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON viewer_sessions TO PUBLIC;
