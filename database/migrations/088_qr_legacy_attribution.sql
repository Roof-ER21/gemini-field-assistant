-- Migration 088: recover attribution for cards already in the field + card register
-- Date: 2026-07-22
--
-- Why
-- ───
-- Migration 087 stopped bots polluting the counts, but every card printed before
-- 2026-07-22 encodes a bare /profile/{slug} with no ?src=qr marker, so its scans
-- were landing in 'direct' alongside typed URLs. ~10 reps are still to be carded
-- and the rest are already in wallets — reprinting everything is not realistic.
--
-- Two recoveries, both applied to history as well as new traffic:
--
--   1. Camera-scan signature. A QR scan from a phone's camera app opens a clean
--      mobile browser with no referrer. 550 historical rows across 32 reps match
--      that shape -> reclassified 'card_likely'. (A texted link looks identical,
--      so this is "card or direct share", not proof. New cards carry ?src=qr and
--      resolve to a certain 'qr'.)
--
--   2. Social in-app browsers. Instagram/Facebook open links in an embedded
--      browser that strips the referrer. Referrer-matching found 19 social rows;
--      the User-Agent identifies 382 -> reclassified 'social'. This is what made
--      one rep's Instagram campaign look like anonymous direct traffic.
--
-- Also adds a card register so "who actually has a card" lives in the product
-- instead of a side spreadsheet, letting the report separate a carded rep with
-- no scans (coaching) from a rep who was never carded (logistics).
--
-- Applied manually via psql — this repo does not run migrations at boot.
-- Keep the patterns in sync with server/lib/scanClassify.ts.

-- ── 1. Reclassify social in-app browser traffic ─────────────────────────────
-- Runs first: an in-app browser beats the no-referrer test.
UPDATE qr_scans
   SET source = 'social'
 WHERE is_bot = FALSE
   AND source <> 'qr'
   AND user_agent ~ '(FBAN|FBAV|FB_IAB|FBIOS|FBDV|Instagram|Snapchat|TikTok|musical_ly|Line/|Twitter|LinkedInApp|Pinterest)';

-- ── 2. Reclassify known social referrers ────────────────────────────────────
UPDATE qr_scans
   SET source = 'social'
 WHERE is_bot = FALSE
   AND source NOT IN ('qr', 'social')
   AND referrer ~* '(instagram|facebook|fb\.com|threads|tiktok|twitter|x\.com|linkedin|snapchat|pinterest|reddit|youtube)';

-- ── 3. Recover legacy card scans ────────────────────────────────────────────
UPDATE qr_scans
   SET source = 'card_likely'
 WHERE is_bot = FALSE
   AND source NOT IN ('qr', 'social', 'referral')
   AND COALESCE(referrer, '') = ''
   AND device_type = 'mobile';

-- ── 4. Card register on the profile ─────────────────────────────────────────
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS card_issued_at  TIMESTAMP WITH TIME ZONE;
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS card_batch      VARCHAR(60);
ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS card_notes      TEXT;

COMMENT ON COLUMN employee_profiles.card_issued_at IS
  'When this rep was handed QR business cards. NULL = never carded. Lets the weekly report separate "carded but idle" (coaching) from "not carded yet" (logistics).';
COMMENT ON COLUMN employee_profiles.card_batch IS
  'Which print run, e.g. "2026-07 pre-marker" or "2026-07-22 tagged". Cards in a pre-marker batch cannot report a certain qr source.';

CREATE INDEX IF NOT EXISTS idx_employee_profiles_card_issued
  ON employee_profiles (card_issued_at)
  WHERE card_issued_at IS NOT NULL;

-- ── 5. Seed the register from observed evidence ─────────────────────────────
-- Any rep whose page has already taken a likely-card scan demonstrably has a
-- card in the field. Backdated to their first such scan. Star can correct these
-- and fill in the rest from the admin panel.
UPDATE employee_profiles ep
   SET card_issued_at = seed.first_scan,
       card_batch     = '2026-07 pre-marker (inferred)'
  FROM (
    SELECT profile_slug, MIN(scanned_at) AS first_scan
      FROM qr_scans
     WHERE is_bot = FALSE AND source = 'card_likely'
     GROUP BY profile_slug
  ) seed
 WHERE seed.profile_slug = ep.slug
   AND ep.card_issued_at IS NULL;
