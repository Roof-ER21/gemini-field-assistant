-- ==========================================================================
-- Migration 037: Leaderboard Integration with RoofTrack Railway
-- Connects Gemini Field Assistant users to RoofTrack sales reps
-- ==========================================================================

-- Map Gemini users to RoofTrack sales reps (by email)
CREATE TABLE IF NOT EXISTS rooftrack_user_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gemini_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rooftrack_sales_rep_id UUID,
    rooftrack_email VARCHAR(255),
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(gemini_user_id)
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_rooftrack_mapping_email ON rooftrack_user_mapping(rooftrack_email);
CREATE INDEX IF NOT EXISTS idx_rooftrack_mapping_gemini_user ON rooftrack_user_mapping(gemini_user_id);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 037: Leaderboard integration tables created!';
    RAISE NOTICE '📊 Table: rooftrack_user_mapping';
    RAISE NOTICE '🔗 Ready to connect to RoofTrack Railway database';
END $$;
