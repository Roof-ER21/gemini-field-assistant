-- Migration 087: QR scan bot filtering + honest source classification
-- Date: 2026-07-22
--
-- Why
-- ───
-- qr_scans has always recorded one row per page load of /profile/:slug with a
-- hardcoded source='direct', no bot filter and no dedup. The result: 41% of all
-- rows are automated traffic (Meta's facebookexternalhit link-preview crawler
-- dominates), and one rep showed 1,095 "scans" from 34 unique visitors after
-- promoting his profile link on Instagram/Facebook.
--
-- This migration keeps every raw row (audit trail intact) but marks automated
-- traffic so reporting can exclude it. Analytics + the weekly QR report read
-- from the qr_scans_human view instead of the base table.
--
-- Applied manually via psql — this repo does not run migrations at boot.

-- ── 1. Flag column ──────────────────────────────────────────────────────────
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN qr_scans.is_bot IS
  'True for crawlers, link-preview fetchers and monitors. Set at insert from the User-Agent; historical rows backfilled by migration 087. Excluded from all reporting via qr_scans_human.';

-- ── 2. Backfill historical rows ─────────────────────────────────────────────
-- Keep this pattern in sync with BOT_UA_PATTERN in server/lib/scanClassify.ts.
UPDATE qr_scans
   SET is_bot = TRUE
 WHERE is_bot = FALSE
   AND (
     user_agent IS NULL
     OR user_agent = ''
     OR user_agent = 'Google'
     OR user_agent ~* '(bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|preview|headless|phantom|python-requests|python-urllib|curl|wget|libwww|httpx|axios|node-fetch|go-http|okhttp|scrapy|lighthouse|pingdom|uptime|monitor|semrush|ahrefs|mj12|dotbot|applebot|gptbot|claudebot|perplexity|chatgpt)'
   );

-- ── 3. Index for the hot reporting path ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_qr_scans_human
  ON qr_scans (profile_slug, scanned_at DESC)
  WHERE is_bot = FALSE;

-- ── 4. The view every analytics query should read ───────────────────────────
-- Reporting reads this; the base table stays complete for forensics.
CREATE OR REPLACE VIEW qr_scans_human AS
  SELECT * FROM qr_scans WHERE is_bot = FALSE;

COMMENT ON VIEW qr_scans_human IS
  'qr_scans with automated traffic removed. All dashboards and the weekly QR report read from here. Query qr_scans directly only for bot/forensic analysis.';
