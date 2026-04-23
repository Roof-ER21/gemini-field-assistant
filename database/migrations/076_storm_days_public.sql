-- Migration 076: Materialized view storm_days_public
-- Purpose: Aggregate verified_hail_events_public_sane to one row per
--          (event_date, state, lat_bucket, lng_bucket) so the UI can
--          request 5-10 years of history without pulling 500K-1M raw rows.
--          The aggregate MV is ~3-4 orders of magnitude smaller than the base
--          table and refreshes concurrently via the hourly Storm Days scheduler.
--
-- Depends on: migration 075 (verified_hail_events_public_sane view)
-- Rollback: 076_rollback.sql

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Create the materialized view
-- ════════════════════════════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW IF NOT EXISTS storm_days_public AS
SELECT
  event_date,
  state,
  lat_bucket,
  lng_bucket,
  COUNT(*)::int                                          AS report_count,
  MAX(hail_size_inches)                                  AS max_hail,
  MAX(wind_mph)                                          AS max_wind,
  BOOL_OR(source_noaa_ncei)                              AS has_noaa,
  BOOL_OR(source_mrms)                                   AS has_mrms,
  BOOL_OR(source_nexrad_l2)                              AS has_nexrad_l2,
  BOOL_OR(source_ihm)                                    AS has_ihm,
  BOOL_OR(source_cocorahs)                               AS has_cocorahs,
  BOOL_OR(source_iem_lsr)                                AS has_iem_lsr,
  BOOL_OR(source_nws_alert OR source_iem_vtec)           AS has_nws_alert,
  SUM(public_verification_count)::int                    AS total_verifications
FROM verified_hail_events_public_sane
GROUP BY event_date, state, lat_bucket, lng_bucket;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
-- ════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX storm_days_public_pk
  ON storm_days_public (event_date, state, lat_bucket, lng_bucket);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Supporting indexes for the /api/hail/storm-days bbox queries
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX storm_days_public_event_date_idx
  ON storm_days_public (event_date DESC);

CREATE INDEX storm_days_public_bucket_idx
  ON storm_days_public (lat_bucket, lng_bucket);

CREATE INDEX storm_days_public_state_date_idx
  ON storm_days_public (state, event_date DESC);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Operator note
-- ════════════════════════════════════════════════════════════════════════════
-- After applying this migration the MV is populated once (synchronously).
-- Subsequent refreshes run concurrently via the hourly cron at :10 past the
-- hour (startStormDaysRefresh in server/services/stormDaysService.ts).
--
-- To check row count on production:
--   SELECT COUNT(*) FROM storm_days_public;
--
-- Expected order of magnitude: if the base table has 500K rows grouped into
-- ~(days × states × 0.1° buckets), expect 5K-50K rows in the MV — well
-- under the 100KB wire budget for a 10-year DMV query.
--
-- ROLLBACK (save as 076_rollback.sql):
--   BEGIN;
--   DROP MATERIALIZED VIEW IF EXISTS storm_days_public;
--   COMMIT;
