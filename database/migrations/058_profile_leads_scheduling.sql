-- Migration 058: Add scheduling fields to profile_leads
-- Allows homeowners to specify preferred date/time when requesting an inspection via QR code

ALTER TABLE profile_leads ADD COLUMN IF NOT EXISTS preferred_date DATE;
ALTER TABLE profile_leads ADD COLUMN IF NOT EXISTS preferred_time VARCHAR(10);

-- Index for upcoming scheduled leads
CREATE INDEX IF NOT EXISTS idx_profile_leads_preferred_date ON profile_leads(preferred_date) WHERE preferred_date IS NOT NULL;
