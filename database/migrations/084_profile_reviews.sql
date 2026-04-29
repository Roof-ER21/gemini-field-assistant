-- Migration 084: per-rep review curation
--
-- Replaces the hardcoded SSR review block on /profile/:slug with a DB-backed
-- list. profile_id is nullable so the same table can hold:
--   * per-rep reviews (profile_id = rep's id) — quotes that name-drop the rep
--   * global fallback reviews (profile_id IS NULL) — used when a rep has no
--     curated reviews of their own
--
-- The SSR renderer queries by rep first, falls back to globals if empty.
-- Admin curates these via /api/profile-reviews — never auto-pull from a 3rd
-- party because real customer testimonials need explicit attribution.

CREATE TABLE IF NOT EXISTS profile_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  author TEXT NOT NULL,
  date_label TEXT,                  -- "2024", "Mar 2026" — display string
  source TEXT DEFAULT 'google',     -- google, gaf, bbb, manual
  source_url TEXT,                  -- direct link to verify
  rating SMALLINT DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_reviews_profile_id_idx
  ON profile_reviews (profile_id, is_active, display_order);

CREATE INDEX IF NOT EXISTS profile_reviews_global_idx
  ON profile_reviews (display_order)
  WHERE profile_id IS NULL AND is_active = TRUE;

COMMENT ON TABLE profile_reviews IS
  'Per-rep curated testimonials. profile_id NULL = global fallback shown when a rep has no own reviews.';
COMMENT ON COLUMN profile_reviews.profile_id IS
  'NULL for global fallback rows. Otherwise FK to employee_profiles.';
COMMENT ON COLUMN profile_reviews.source IS
  'Where the review came from: google | gaf | bbb | manual. Drives the attribution label on the card.';

-- Seed the 4 global fallback reviews (sourced from
-- knowledge/preselected_reviews.md). These are what reps see today and what
-- a brand-new rep without curated reviews will see going forward.
INSERT INTO profile_reviews (profile_id, text, author, date_label, source, display_order)
VALUES
  (NULL, 'I had several other companies look at my roof and tell me everything was fine. Roof-ER came out, identified significant wind and hail damage, and met with my adjuster. The claim was approved for a full replacement. Extremely professional and honest.', 'Barbara Joyal', '2024', 'google', 1),
  (NULL, 'The team guided me through the entire insurance process which was originally very overwhelming. They handled all the paperwork and the heavy lifting with the adjuster. I couldn''t be happier with the outcome and the quality of the new roof.', 'Arturo Santos', '2025', 'google', 2),
  (NULL, 'Unlike the high-pressure sales tactics I experienced with other contractors, this team focused on educating me about the damage. They worked directly with my insurance to ensure a fair assessment. Professional, transparent, and highly recommended.', 'S.M.', 'Mar 2026', 'google', 3),
  (NULL, 'Total professional experience from start to finish. They helped get my storm damage claim approved quickly and the crew was surgical in their cleanup. Not a single nail left in the yard. Truly a premium service.', 'Ivalee Jimenez', '2025', 'google', 4)
ON CONFLICT DO NOTHING;
