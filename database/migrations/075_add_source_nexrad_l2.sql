-- Migration 075: Add source_nexrad_l2 to verified_hail_events
-- Purpose: Register NEXRAD Level II MESH-derived hail estimates as a first-class
--          source alongside MRMS / NCEI SWDI / CoCoRaHS / LSR / NOAA NCEI.
--
-- Producer: gemini-nexrad-l2-worker (Python microservice, separate Railway service).
--           Posts per-scan MESH grid cells ≥0.25" to /api/hail/admin/nexrad-l2-ingest.
--
-- Track classification: ALGORITHM (radar-derived, machine-computed, no human review).
-- Priority tier: 6 (same as MRMS — both radar-derived, one pre-baked by NOAA
--                 at 1 km resolution, the other live from raw volume scans at
--                 native ~250 m resolution with per-scan freshness).
--
-- Scope: additive, non-destructive. Only touches:
--   - verified_hail_events.source_nexrad_l2 (new column)
--   - at_least_one_source CHECK constraint (drop + re-add to include new column)
--   - verified_hail_events_public view (recreate — includes source_nexrad_l2)
--   - verified_hail_events_stats_by_source view (recreate — adds NEXRAD L2 row)
--
-- Deliberately NOT modified (see ### Operator follow-ups ### at bottom):
--   - verification_count / confidence_tier generated columns — dropping +
--     re-adding forces full table rewrite on a production-sized table with
--     acquisition-lock contention. nexrad_l2-only rows will undercount by 1
--     in verification_count until a separate maintenance window is scheduled.
--   - verified_hail_events_public_sane view — its authoritative definition
--     lives only in production (applied as hotfix, not in a migration file).
--     Operator must `pg_dump -s -t verified_hail_events_public_sane`, add
--     source_nexrad_l2 to SELECT list, and re-apply. See follow-up section.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Add the new source flag column
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE verified_hail_events
  ADD COLUMN IF NOT EXISTS source_nexrad_l2 BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN verified_hail_events.source_nexrad_l2 IS
  'NEXRAD Level II MESH-derived hail estimate. Algorithm track. Produced by gemini-nexrad-l2-worker from raw AWS volume scans via Witt 1998 SHI/MESH. Fresher + higher-resolution than source_mrms (same family).';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Update at_least_one_source CHECK constraint to include new flag
--    (Postgres does not support ALTER CHECK in place — drop + re-add)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE verified_hail_events
  DROP CONSTRAINT IF EXISTS at_least_one_source;

ALTER TABLE verified_hail_events
  ADD CONSTRAINT at_least_one_source CHECK (
    source_noaa_ncei OR source_iem_lsr OR source_ncei_swdi OR source_mrms OR
    source_nws_alert OR source_iem_vtec OR source_cocorahs OR source_mping OR
    source_synoptic OR source_spc_wcm OR source_rep_report OR source_customer_report OR
    source_groupme OR source_hailtrace OR source_ihm OR source_nexrad_l2
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Recreate verified_hail_events_public to expose source_nexrad_l2
--    (Mirrors migration 069 definition exactly, with nexrad_l2 added.)
--
--    2026-04-23: Switched from CREATE OR REPLACE to DROP+CREATE because
--    Postgres refused the column reorder under CREATE OR REPLACE VIEW.
--    The sane view depends on this one, so drop that first.
-- ════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS verified_hail_events_public_sane;
DROP VIEW IF EXISTS verified_hail_events_public;

CREATE VIEW verified_hail_events_public AS
SELECT
    id, event_date, latitude, longitude, lat_bucket, lng_bucket, state,
    algorithm_hail_size_inches, algorithm_wind_mph,
    verified_hail_size_inches, verified_wind_mph,
    hail_size_inches, wind_mph, tornado_ef_rank,

    -- Public source flags: hide unverified rep/customer reports from count
    source_noaa_ncei, source_iem_lsr, source_ncei_swdi, source_mrms,
    source_nws_alert, source_iem_vtec, source_cocorahs, source_mping,
    source_synoptic, source_spc_wcm,
    (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE)) AS source_rep_report,
    (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE)) AS source_customer_report,
    source_groupme, source_hailtrace, source_ihm,
    source_nexrad_l2,

    -- Public verification count (unverified rep/customer don't count; nexrad_l2 does)
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
    source_noaa_ncei OR source_iem_lsr OR source_ncei_swdi OR source_mrms OR
    source_nws_alert OR source_iem_vtec OR source_cocorahs OR source_mping OR
    source_synoptic OR source_spc_wcm OR source_groupme OR source_hailtrace OR source_ihm OR
    source_nexrad_l2 OR
    (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE)) OR
    (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE));

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Recreate verified_hail_events_stats_by_source to include NEXRAD L2
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW verified_hail_events_stats_by_source AS
SELECT
    'NOAA NCEI' AS source, SUM(source_noaa_ncei::int) AS event_count FROM verified_hail_events
UNION ALL SELECT 'IEM LSR', SUM(source_iem_lsr::int) FROM verified_hail_events
UNION ALL SELECT 'NCEI SWDI', SUM(source_ncei_swdi::int) FROM verified_hail_events
UNION ALL SELECT 'MRMS', SUM(source_mrms::int) FROM verified_hail_events
UNION ALL SELECT 'NEXRAD L2', SUM(source_nexrad_l2::int) FROM verified_hail_events
UNION ALL SELECT 'NWS Alert', SUM(source_nws_alert::int) FROM verified_hail_events
UNION ALL SELECT 'IEM VTEC', SUM(source_iem_vtec::int) FROM verified_hail_events
UNION ALL SELECT 'CoCoRaHS', SUM(source_cocorahs::int) FROM verified_hail_events
UNION ALL SELECT 'mPING', SUM(source_mping::int) FROM verified_hail_events
UNION ALL SELECT 'Synoptic', SUM(source_synoptic::int) FROM verified_hail_events
UNION ALL SELECT 'SPC WCM', SUM(source_spc_wcm::int) FROM verified_hail_events
UNION ALL SELECT 'Rep Report', SUM(source_rep_report::int) FROM verified_hail_events
UNION ALL SELECT 'Customer Report', SUM(source_customer_report::int) FROM verified_hail_events
UNION ALL SELECT 'GroupMe', SUM(source_groupme::int) FROM verified_hail_events
UNION ALL SELECT 'HailTrace', SUM(source_hailtrace::int) FROM verified_hail_events
UNION ALL SELECT 'IHM', SUM(source_ihm::int) FROM verified_hail_events
ORDER BY event_count DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Helpful partial index for NEXRAD L2-only rows (diagnostics + backfill)
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS verified_hail_events_nexrad_l2_idx
    ON verified_hail_events (event_date DESC, latitude, longitude)
    WHERE source_nexrad_l2 = TRUE;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Recreate verified_hail_events_public_sane (inherits nexrad_l2 via SELECT *)
--    2026-04-23: Applied inline instead of as an operator follow-up. The sane
--    view is just a filter over _public + hail_size_inches <= 8 guard.
-- ════════════════════════════════════════════════════════════════════════════

CREATE VIEW verified_hail_events_public_sane AS
SELECT * FROM verified_hail_events_public
WHERE hail_size_inches IS NULL OR hail_size_inches <= 8.0;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ### Operator follow-ups (run these manually after the base migration) ###
-- ════════════════════════════════════════════════════════════════════════════
--
-- A) (COMPLETED 2026-04-23) verified_hail_events_public_sane now inlined above
--    in step 5. No manual re-apply needed.
--
-- B) (optional, later) Include source_nexrad_l2 in generated columns:
--    Requires a maintenance window. Drops + re-adds verification_count +
--    confidence_tier, forcing a full table rewrite. Do this off-hours when
--    writes are quiesced.
--
--    BEGIN;
--    DROP INDEX IF EXISTS verified_hail_events_tier_idx;
--    ALTER TABLE verified_hail_events DROP COLUMN verification_count;
--    ALTER TABLE verified_hail_events DROP COLUMN confidence_tier;
--    ALTER TABLE verified_hail_events ADD COLUMN verification_count INTEGER
--      GENERATED ALWAYS AS (
--        source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
--        source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
--        source_cocorahs::int + source_mping::int + source_synoptic::int +
--        source_spc_wcm::int + source_rep_report::int + source_customer_report::int +
--        source_groupme::int + source_hailtrace::int + source_ihm::int +
--        source_nexrad_l2::int
--      ) STORED;
--    ALTER TABLE verified_hail_events ADD COLUMN confidence_tier TEXT
--      GENERATED ALWAYS AS (
--        CASE
--          WHEN (source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
--                source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
--                source_cocorahs::int + source_mping::int + source_synoptic::int +
--                source_spc_wcm::int + source_rep_report::int + source_customer_report::int +
--                source_groupme::int + source_hailtrace::int + source_ihm::int +
--                source_nexrad_l2::int) >= 4 THEN 'quadruple-verified'
--          WHEN (source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
--                source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
--                source_cocorahs::int + source_mping::int + source_synoptic::int +
--                source_spc_wcm::int + source_rep_report::int + source_customer_report::int +
--                source_groupme::int + source_hailtrace::int + source_ihm::int +
--                source_nexrad_l2::int) = 3 THEN 'triple-verified'
--          WHEN (source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
--                source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
--                source_cocorahs::int + source_mping::int + source_synoptic::int +
--                source_spc_wcm::int + source_rep_report::int + source_customer_report::int +
--                source_groupme::int + source_hailtrace::int + source_ihm::int +
--                source_nexrad_l2::int) = 2 THEN 'cross-verified'
--          ELSE 'single-source'
--        END
--      ) STORED;
--    CREATE INDEX verified_hail_events_tier_idx
--      ON verified_hail_events (confidence_tier, event_date DESC);
--    COMMIT;
--
-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (save as 075_rollback.sql)
-- ════════════════════════════════════════════════════════════════════════════
--
-- BEGIN;
-- DROP INDEX IF EXISTS verified_hail_events_nexrad_l2_idx;
-- -- Restore original stats view (no NEXRAD L2 row)
-- CREATE OR REPLACE VIEW verified_hail_events_stats_by_source AS
--   SELECT 'NOAA NCEI' AS source, SUM(source_noaa_ncei::int) AS event_count FROM verified_hail_events
--   UNION ALL SELECT 'IEM LSR', SUM(source_iem_lsr::int) FROM verified_hail_events
--   UNION ALL SELECT 'NCEI SWDI', SUM(source_ncei_swdi::int) FROM verified_hail_events
--   UNION ALL SELECT 'MRMS', SUM(source_mrms::int) FROM verified_hail_events
--   UNION ALL SELECT 'NWS Alert', SUM(source_nws_alert::int) FROM verified_hail_events
--   UNION ALL SELECT 'IEM VTEC', SUM(source_iem_vtec::int) FROM verified_hail_events
--   UNION ALL SELECT 'CoCoRaHS', SUM(source_cocorahs::int) FROM verified_hail_events
--   UNION ALL SELECT 'mPING', SUM(source_mping::int) FROM verified_hail_events
--   UNION ALL SELECT 'Synoptic', SUM(source_synoptic::int) FROM verified_hail_events
--   UNION ALL SELECT 'SPC WCM', SUM(source_spc_wcm::int) FROM verified_hail_events
--   UNION ALL SELECT 'Rep Report', SUM(source_rep_report::int) FROM verified_hail_events
--   UNION ALL SELECT 'Customer Report', SUM(source_customer_report::int) FROM verified_hail_events
--   UNION ALL SELECT 'GroupMe', SUM(source_groupme::int) FROM verified_hail_events
--   UNION ALL SELECT 'HailTrace', SUM(source_hailtrace::int) FROM verified_hail_events
--   UNION ALL SELECT 'IHM', SUM(source_ihm::int) FROM verified_hail_events
--   ORDER BY event_count DESC;
-- -- Restore original public view (without source_nexrad_l2)
-- CREATE OR REPLACE VIEW verified_hail_events_public AS
--   SELECT id, event_date, latitude, longitude, lat_bucket, lng_bucket, state,
--          algorithm_hail_size_inches, algorithm_wind_mph,
--          verified_hail_size_inches, verified_wind_mph,
--          hail_size_inches, wind_mph, tornado_ef_rank,
--          source_noaa_ncei, source_iem_lsr, source_ncei_swdi, source_mrms,
--          source_nws_alert, source_iem_vtec, source_cocorahs, source_mping,
--          source_synoptic, source_spc_wcm,
--          (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE)) AS source_rep_report,
--          (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE)) AS source_customer_report,
--          source_groupme, source_hailtrace, source_ihm,
--          (source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
--           source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
--           source_cocorahs::int + source_mping::int + source_synoptic::int +
--           source_spc_wcm::int +
--           (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE))::int +
--           (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE))::int +
--           source_groupme::int + source_hailtrace::int + source_ihm::int) AS public_verification_count,
--          source_details, first_observed_at, last_updated_at
--     FROM verified_hail_events
--    WHERE source_noaa_ncei OR source_iem_lsr OR source_ncei_swdi OR source_mrms OR
--          source_nws_alert OR source_iem_vtec OR source_cocorahs OR source_mping OR
--          source_synoptic OR source_spc_wcm OR source_groupme OR source_hailtrace OR source_ihm OR
--          (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE)) OR
--          (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE));
-- ALTER TABLE verified_hail_events DROP CONSTRAINT IF EXISTS at_least_one_source;
-- ALTER TABLE verified_hail_events ADD CONSTRAINT at_least_one_source CHECK (
--     source_noaa_ncei OR source_iem_lsr OR source_ncei_swdi OR source_mrms OR
--     source_nws_alert OR source_iem_vtec OR source_cocorahs OR source_mping OR
--     source_synoptic OR source_spc_wcm OR source_rep_report OR source_customer_report OR
--     source_groupme OR source_hailtrace OR source_ihm
-- );
-- ALTER TABLE verified_hail_events DROP COLUMN IF EXISTS source_nexrad_l2;
-- COMMIT;
