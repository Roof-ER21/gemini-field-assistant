-- Migration 081: Hide single-source NEXRAD L2 rows from user-facing views
--
-- Problem (observed 2026-04-25/26 on event_date 2026-04-22 + 2026-04-23 + 2026-04-24):
--   verified_hail_events accumulated thousands of single-source NEXRAD L2
--   rows per UTC day (4/23 prod: 2,472 of 2,673 were L2-only; 4/24: 952 of
--   952 were L2-only). The rolling nexrad-l2-worker writes every MESH-flagged
--   radar pixel ≥ 0.25" with no multi-radar QC, no event clustering, and no
--   per-bucket dedup against existing storm-days. Spread across 24h of
--   polling over multiple radar sites it forms a smear that covers the
--   entire Mid-Atlantic — visually a giant fake "swath" that doesn't
--   reflect any real storm structure.
--
-- Root cause:
--   075 added source_nexrad_l2 to verified_hail_events_public's WHERE filter,
--   which means every L2-only pixel surfaces in adjuster PDFs, swath
--   renders, storm calendars, Susan posts, and city impact rollups. L2 raw
--   scan output is too noisy to act as a primary verification source on
--   its own; it's useful only as corroboration for higher-confidence sources
--   (MRMS, NWS warnings, mPING, ground reports, etc.).
--
-- Fix:
--   Drop and recreate verified_hail_events_public + _public_sane with
--   source_nexrad_l2 REMOVED from the WHERE filter. The column stays in
--   the SELECT list and verification counts so consumers can still see
--   when L2 *corroborates* a row that already qualifies via another
--   source. L2-only rows are hidden from user-facing queries.
--
--   storm_days_public (materialized view, depends on _public_sane) is
--   dropped + recreated identically. It will repopulate from the new
--   filtered _public_sane on creation. Indexes are recreated.
--
-- Scope: views only. No base-table data modification. NEXRAD L2 worker
--   continues writing as-is; this migration just stops user surfaces from
--   acting on L2-only rows.
--
-- Post-deploy: the hourly storm_days_public refresh cron will re-run
--   normally on the new definition.
--
-- Rollback: 081_rollback.sql restores the 075 view definitions verbatim
--   and recreates storm_days_public against them.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Drop dependents (MV first, then sane, then public)
-- ════════════════════════════════════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS storm_days_public;
DROP VIEW IF EXISTS verified_hail_events_public_sane;
DROP VIEW IF EXISTS verified_hail_events_public;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Recreate verified_hail_events_public WITHOUT source_nexrad_l2 in WHERE
--    SELECT list and public_verification_count keep nexrad_l2 — when an L2
--    row is corroborated by another source, the count benefits from it.
-- ════════════════════════════════════════════════════════════════════════════

CREATE VIEW verified_hail_events_public AS
SELECT
    id, event_date, latitude, longitude, lat_bucket, lng_bucket, state,
    algorithm_hail_size_inches, algorithm_wind_mph,
    verified_hail_size_inches, verified_wind_mph,
    hail_size_inches, wind_mph, tornado_ef_rank,

    source_noaa_ncei, source_iem_lsr, source_ncei_swdi, source_mrms,
    source_nws_alert, source_iem_vtec, source_cocorahs, source_mping,
    source_synoptic, source_spc_wcm,
    (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE)) AS source_rep_report,
    (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE)) AS source_customer_report,
    source_groupme, source_hailtrace, source_ihm,
    source_nexrad_l2,

    (
        source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
        source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
        source_cocorahs::int + source_mping::int + source_synoptic::int +
        source_spc_wcm::int +
        (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE))::int +
        (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE))::int +
        source_groupme::int + source_hailtrace::int + source_ihm::int +
        source_nexrad_l2::int
    ) AS public_verification_count,

    source_details,
    first_observed_at, last_updated_at
FROM verified_hail_events
WHERE
    -- L2-only rows are excluded; require at least one corroborating source.
    -- source_nexrad_l2 is intentionally NOT in this list.
    source_noaa_ncei OR source_iem_lsr OR source_ncei_swdi OR source_mrms OR
    source_nws_alert OR source_iem_vtec OR source_cocorahs OR source_mping OR
    source_synoptic OR source_spc_wcm OR source_groupme OR source_hailtrace OR source_ihm OR
    (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE)) OR
    (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE));

COMMENT ON VIEW verified_hail_events_public IS
  'User-facing verified hail events. Single-source NEXRAD L2 rows are excluded as raw scan noise; L2 surfaces only as corroboration for rows already qualifying via another source.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Recreate verified_hail_events_public_sane (filter on _public + size guard)
-- ════════════════════════════════════════════════════════════════════════════

CREATE VIEW verified_hail_events_public_sane AS
SELECT * FROM verified_hail_events_public
WHERE hail_size_inches IS NULL OR hail_size_inches <= 8.0;

COMMENT ON VIEW verified_hail_events_public_sane IS
  'verified_hail_events_public filtered to physically plausible hail sizes (<= 8"). Inherits the L2-only exclusion from _public.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Recreate storm_days_public materialized view (definition unchanged)
--    Sources from the now-filtered _public_sane, so L2-only rows are
--    automatically excluded.
-- ════════════════════════════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW storm_days_public AS
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

CREATE UNIQUE INDEX storm_days_public_pk
  ON storm_days_public (event_date, state, lat_bucket, lng_bucket);

CREATE INDEX storm_days_public_event_date_idx
  ON storm_days_public (event_date DESC);

CREATE INDEX storm_days_public_bucket_idx
  ON storm_days_public (lat_bucket, lng_bucket);

CREATE INDEX storm_days_public_state_date_idx
  ON storm_days_public (state, event_date DESC);

COMMIT;
