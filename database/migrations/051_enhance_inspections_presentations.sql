-- Migration 051: Enhance Inspections and Presentations
-- Adds missing fields for complete API functionality

-- Add missing fields to inspections table
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS inspector_notes TEXT,
  ADD COLUMN IF NOT EXISTS weather_conditions TEXT,
  ADD COLUMN IF NOT EXISTS roof_type TEXT,
  ADD COLUMN IF NOT EXISTS roof_age INTEGER,
  ADD COLUMN IF NOT EXISTS photo_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analyzed_photo_count INTEGER DEFAULT 0;

-- Backfill user_id from contractor_id if needed
UPDATE inspections SET user_id = contractor_id WHERE user_id IS NULL;

-- Backfill customer_name from homeowner_name if needed
UPDATE inspections SET customer_name = homeowner_name WHERE customer_name IS NULL;

-- Update status check constraint to match API
ALTER TABLE inspections DROP CONSTRAINT IF EXISTS inspections_status_check;
ALTER TABLE inspections
  ADD CONSTRAINT inspections_status_check
  CHECK (status IN ('draft', 'in_progress', 'completed', 'presented', 'archived'));

-- Add missing fields to inspection_photos table
ALTER TABLE inspection_photos
  ADD COLUMN IF NOT EXISTS photo_data TEXT, -- base64 encoded photo
  ADD COLUMN IF NOT EXISTS file_name TEXT DEFAULT 'photo.jpg',
  ADD COLUMN IF NOT EXISTS file_size INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mime_type TEXT DEFAULT 'image/jpeg',
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS ai_analysis JSONB,
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- Update category check constraint to match API
ALTER TABLE inspection_photos DROP CONSTRAINT IF EXISTS inspection_photos_category_check;
ALTER TABLE inspection_photos
  ADD CONSTRAINT inspection_photos_category_check
  CHECK (category IN ('damage', 'overview', 'detail', 'measurements', 'other'));

-- Keep old photo_type field for backwards compatibility, map to category
UPDATE inspection_photos SET category = photo_type WHERE category IS NULL;

-- Add missing fields to presentations table
ALTER TABLE presentations
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS property_address TEXT,
  ADD COLUMN IF NOT EXISTS presentation_type TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS slides JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS branding JSONB,
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- Backfill user_id from contractor_id if needed
UPDATE presentations SET user_id = contractor_id WHERE user_id IS NULL;

-- Add status check constraint
ALTER TABLE presentations DROP CONSTRAINT IF EXISTS presentations_status_check;
ALTER TABLE presentations
  ADD CONSTRAINT presentations_status_check
  CHECK (status IN ('draft', 'ready', 'shared'));

-- Add presentation_type check constraint
ALTER TABLE presentations DROP CONSTRAINT IF EXISTS presentations_type_check;
ALTER TABLE presentations
  ADD CONSTRAINT presentations_type_check
  CHECK (presentation_type IN ('standard', 'insurance', 'detailed'));

-- Create additional indexes for new fields
CREATE INDEX IF NOT EXISTS idx_inspections_user_id ON inspections(user_id);
CREATE INDEX IF NOT EXISTS idx_inspections_job_id ON inspections(job_id);
CREATE INDEX IF NOT EXISTS idx_inspections_analyzed ON inspections(analyzed_photo_count);

CREATE INDEX IF NOT EXISTS idx_inspection_photos_category ON inspection_photos(category);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_analyzed ON inspection_photos(analyzed_at);

CREATE INDEX IF NOT EXISTS idx_presentations_user_id ON presentations(user_id);
CREATE INDEX IF NOT EXISTS idx_presentations_share_token ON presentations(share_token);
CREATE INDEX IF NOT EXISTS idx_presentations_public ON presentations(is_public);
CREATE INDEX IF NOT EXISTS idx_presentations_status ON presentations(status);

-- Add function to automatically update photo counts
CREATE OR REPLACE FUNCTION update_inspection_photo_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE inspections
    SET photo_count = photo_count + 1
    WHERE id = NEW.inspection_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE inspections
    SET photo_count = GREATEST(0, photo_count - 1)
    WHERE id = OLD.inspection_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for photo count
DROP TRIGGER IF EXISTS trigger_update_photo_count ON inspection_photos;
CREATE TRIGGER trigger_update_photo_count
AFTER INSERT OR DELETE ON inspection_photos
FOR EACH ROW
EXECUTE FUNCTION update_inspection_photo_count();

-- Add function to automatically update analyzed photo count
CREATE OR REPLACE FUNCTION update_analyzed_photo_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.ai_analysis IS NULL AND NEW.ai_analysis IS NOT NULL THEN
    UPDATE inspections
    SET analyzed_photo_count = analyzed_photo_count + 1
    WHERE id = NEW.inspection_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for analyzed photo count
DROP TRIGGER IF EXISTS trigger_update_analyzed_count ON inspection_photos;
CREATE TRIGGER trigger_update_analyzed_count
AFTER UPDATE ON inspection_photos
FOR EACH ROW
EXECUTE FUNCTION update_analyzed_photo_count();

-- Comments for documentation
COMMENT ON COLUMN inspections.user_id IS 'User who created the inspection (maps to contractor_id)';
COMMENT ON COLUMN inspections.job_id IS 'Optional link to jobs table';
COMMENT ON COLUMN inspections.photo_count IS 'Total number of photos uploaded';
COMMENT ON COLUMN inspections.analyzed_photo_count IS 'Number of photos analyzed by AI';

COMMENT ON COLUMN inspection_photos.photo_data IS 'Base64 encoded photo data';
COMMENT ON COLUMN inspection_photos.ai_analysis IS 'AI analysis results in JSON format';
COMMENT ON COLUMN inspection_photos.category IS 'Photo category for organization';

COMMENT ON COLUMN presentations.slides IS 'Array of presentation slides in JSON format';
COMMENT ON COLUMN presentations.share_token IS 'Unique token for public sharing';
COMMENT ON COLUMN presentations.is_public IS 'Whether presentation is publicly accessible';
COMMENT ON COLUMN presentations.view_count IS 'Number of times presentation has been viewed';
COMMENT ON COLUMN presentations.presentation_type IS 'Type of presentation (standard, insurance, detailed)';
