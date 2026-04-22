-- Migration 069: Unified verified_hail_events table
-- Purpose: Single canonical home for multi-source storm events with
--          deterministic dedup, source flags, and auto-computed verification tier.
--
-- Companion to existing storm_events (migration 019). This table holds the
-- UNIFIED multi-source truth; storm_events continues its per-lookup discovery role.
--
-- Rollout strategy: dual-write during backfill. storm_events NOT modified.
-- Safe to apply without affecting any live reader. Read-path changes come later
-- behind feature flag USE_VERIFIED_EVENTS_TABLE.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- PRIMARY TABLE
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS verified_hail_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Canonical identity (dedup bucket at 3-decimal ≈ 110m)
    event_date DATE NOT NULL,                          -- America/New_York normalized
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    lat_bucket DECIMAL(6, 3) GENERATED ALWAYS AS (ROUND(latitude::numeric, 3)) STORED,
    lng_bucket DECIMAL(7, 3) GENERATED ALWAYS AS (ROUND(longitude::numeric, 3)) STORED,

    -- State/region for scope filtering (VA/MD/PA primary, neighbors allowed)
    state VARCHAR(2),                                  -- e.g. 'VA','MD','PA','WV','DE','NJ','NY','DC','OH','NC'

    -- ─── DUAL-TRACK MEASUREMENTS (mirrors HailTrace's algo/meteorologist split) ───
    -- Algorithm track — radar-derived, automated (MRMS, NCEI SWDI NX3HAIL)
    algorithm_hail_size_inches DECIMAL(4, 2),
    algorithm_wind_mph INTEGER,

    -- Verified track — human/ground-verified (NOAA NCEI, CoCoRaHS, rep-reports, NWS LSR)
    verified_hail_size_inches DECIMAL(4, 2),
    verified_wind_mph INTEGER,

    -- Reported maxima — MAX of both tracks with NOAA priority (see upsert logic)
    hail_size_inches DECIMAL(4, 2),
    wind_mph INTEGER,
    tornado_ef_rank SMALLINT,                          -- -1=EFU, 0-5=EF0-EF5, NULL=no tornado

    -- ─── SOURCE FLAGS ───
    -- Each flag true when that source has confirmed this bucket
    source_noaa_ncei BOOLEAN NOT NULL DEFAULT FALSE,   -- NOAA Storm Events (gold standard)
    source_iem_lsr BOOLEAN NOT NULL DEFAULT FALSE,     -- NWS Local Storm Reports via IEM
    source_ncei_swdi BOOLEAN NOT NULL DEFAULT FALSE,   -- NCEI SWDI radar signatures (NX3HAIL/MESH/TVS)
    source_mrms BOOLEAN NOT NULL DEFAULT FALSE,        -- MRMS MESH raster (IEM MTArchive)
    source_nws_alert BOOLEAN NOT NULL DEFAULT FALSE,   -- NWS severe alert polygon
    source_iem_vtec BOOLEAN NOT NULL DEFAULT FALSE,    -- NWS warning archive via IEM VTEC
    source_cocorahs BOOLEAN NOT NULL DEFAULT FALSE,    -- CoCoRaHS observer reports
    source_mping BOOLEAN NOT NULL DEFAULT FALSE,       -- mPING crowdsourced
    source_synoptic BOOLEAN NOT NULL DEFAULT FALSE,    -- Synoptic Mesonet (PennDOT/VDOT/MDOT/ASOS wind gusts)
    source_spc_wcm BOOLEAN NOT NULL DEFAULT FALSE,     -- SPC WCM archive
    source_rep_report BOOLEAN NOT NULL DEFAULT FALSE,  -- Roof-ER rep self-report
    source_customer_report BOOLEAN NOT NULL DEFAULT FALSE, -- Public customer-submitted report
    source_groupme BOOLEAN NOT NULL DEFAULT FALSE,     -- GroupMe Sales Team chat auto-parsed
    source_hailtrace BOOLEAN NOT NULL DEFAULT FALSE,   -- OPTIONAL — HailTrace import
    source_ihm BOOLEAN NOT NULL DEFAULT FALSE,         -- OPTIONAL — Interactive Hail Maps

    -- ─── AUTO-COMPUTED VERIFICATION COUNT ───
    verification_count INTEGER GENERATED ALWAYS AS (
        source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
        source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
        source_cocorahs::int + source_mping::int + source_synoptic::int +
        source_spc_wcm::int + source_rep_report::int + source_customer_report::int +
        source_groupme::int + source_hailtrace::int + source_ihm::int
    ) STORED,

    confidence_tier TEXT GENERATED ALWAYS AS (
        CASE
            WHEN (source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
                  source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
                  source_cocorahs::int + source_mping::int + source_synoptic::int +
                  source_spc_wcm::int + source_rep_report::int + source_customer_report::int +
                  source_groupme::int + source_hailtrace::int + source_ihm::int) >= 4
                THEN 'quadruple-verified'
            WHEN (source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
                  source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
                  source_cocorahs::int + source_mping::int + source_synoptic::int +
                  source_spc_wcm::int + source_rep_report::int + source_customer_report::int +
                  source_groupme::int + source_hailtrace::int + source_ihm::int) = 3
                THEN 'triple-verified'
            WHEN (source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
                  source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
                  source_cocorahs::int + source_mping::int + source_synoptic::int +
                  source_spc_wcm::int + source_rep_report::int + source_customer_report::int +
                  source_groupme::int + source_hailtrace::int + source_ihm::int) = 2
                THEN 'cross-verified'
            ELSE 'single-source'
        END
    ) STORED,

    -- ─── AUDIT TRAIL ───
    -- Raw per-source payloads for reproducibility.
    -- Structure: {"noaa_ncei": {"event_id": "...", "hail_size": 2.0, "narrative": "...", "raw": {...}}, "cocorahs": {...}, ...}
    source_details JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- ─── REP SELF-REPORT MODERATION ───
    -- NULL if no rep source involved. true/false when source_rep_report OR source_customer_report is true.
    rep_report_verified_by_admin BOOLEAN,
    rep_report_submitted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    rep_report_photo_urls TEXT[],                      -- Array of S3/local URLs
    rep_report_submitted_at TIMESTAMPTZ,
    rep_report_verified_at TIMESTAMPTZ,
    rep_report_verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- ─── TIMESTAMPS ───
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ─── CONSTRAINTS ───
    -- Continental US bounds roughly (generous for edge storms)
    CONSTRAINT valid_latitude CHECK (latitude BETWEEN 18.0 AND 72.0),
    CONSTRAINT valid_longitude CHECK (longitude BETWEEN -180.0 AND -66.0),
    -- Must report something
    CONSTRAINT at_least_one_measurement CHECK (
        hail_size_inches IS NOT NULL OR
        wind_mph IS NOT NULL OR
        tornado_ef_rank IS NOT NULL
    ),
    -- Must have at least one source
    CONSTRAINT at_least_one_source CHECK (
        source_noaa_ncei OR source_iem_lsr OR source_ncei_swdi OR source_mrms OR
        source_nws_alert OR source_iem_vtec OR source_cocorahs OR source_mping OR
        source_synoptic OR source_spc_wcm OR source_rep_report OR source_customer_report OR
        source_groupme OR source_hailtrace OR source_ihm
    ),
    -- Event date sanity
    CONSTRAINT valid_event_date CHECK (event_date BETWEEN '1950-01-01' AND CURRENT_DATE + INTERVAL '1 day')
);

-- ════════════════════════════════════════════════════════════════════════════
-- DEDUP CONSTRAINT — THE CORE INVARIANT
-- Same date + same ~110m bucket = same record. Enforced at DB level.
-- ════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS verified_hail_events_dedup_idx
    ON verified_hail_events (event_date, lat_bucket, lng_bucket);

-- ════════════════════════════════════════════════════════════════════════════
-- QUERY INDEXES
-- ════════════════════════════════════════════════════════════════════════════

-- Spatial proximity (powers /hail/search)
CREATE INDEX IF NOT EXISTS verified_hail_events_location_idx
    ON verified_hail_events (latitude, longitude);

-- Date-range scans
CREATE INDEX IF NOT EXISTS verified_hail_events_date_idx
    ON verified_hail_events (event_date DESC);

-- State-scoped queries (VA/MD/PA filter)
CREATE INDEX IF NOT EXISTS verified_hail_events_state_date_idx
    ON verified_hail_events (state, event_date DESC)
    WHERE state IS NOT NULL;

-- Confidence-filtered queries
CREATE INDEX IF NOT EXISTS verified_hail_events_tier_idx
    ON verified_hail_events (confidence_tier, event_date DESC);

-- Actionable hail (≥0.5")
CREATE INDEX IF NOT EXISTS verified_hail_events_actionable_hail_idx
    ON verified_hail_events (event_date DESC, latitude, longitude)
    WHERE hail_size_inches >= 0.5;

-- Actionable wind (≥58mph, severe threshold)
CREATE INDEX IF NOT EXISTS verified_hail_events_actionable_wind_idx
    ON verified_hail_events (event_date DESC, latitude, longitude)
    WHERE wind_mph >= 58;

-- Pending rep-report moderation queue
CREATE INDEX IF NOT EXISTS verified_hail_events_pending_rep_idx
    ON verified_hail_events (rep_report_submitted_at DESC)
    WHERE (source_rep_report OR source_customer_report)
      AND rep_report_verified_by_admin IS DISTINCT FROM TRUE;

-- JSONB source_details GIN for audit queries
CREATE INDEX IF NOT EXISTS verified_hail_events_source_details_gin
    ON verified_hail_events USING gin (source_details);

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_verified_hail_events_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verified_hail_events_updated ON verified_hail_events;
CREATE TRIGGER trg_verified_hail_events_updated
    BEFORE UPDATE ON verified_hail_events
    FOR EACH ROW
    EXECUTE FUNCTION update_verified_hail_events_timestamp();

-- ════════════════════════════════════════════════════════════════════════════
-- PUBLIC VIEW — excludes unverified rep/customer reports from verification count
-- Used by /hail/search and PDF generation (when flag flipped).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW verified_hail_events_public AS
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

    -- Public verification count (unverified rep/customer don't count)
    (
        source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
        source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
        source_cocorahs::int + source_mping::int + source_synoptic::int +
        source_spc_wcm::int +
        (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE))::int +
        (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE))::int +
        source_groupme::int + source_hailtrace::int + source_ihm::int
    ) AS public_verification_count,

    source_details,
    first_observed_at, last_updated_at
FROM verified_hail_events
WHERE
    -- Show event if at least one non-rep source is true,
    -- OR rep report is admin-verified
    source_noaa_ncei OR source_iem_lsr OR source_ncei_swdi OR source_mrms OR
    source_nws_alert OR source_iem_vtec OR source_cocorahs OR source_mping OR
    source_synoptic OR source_spc_wcm OR source_groupme OR source_hailtrace OR source_ihm OR
    (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE)) OR
    (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE));

-- ════════════════════════════════════════════════════════════════════════════
-- REPORTING VIEWS
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW verified_hail_events_stats_by_source AS
SELECT
    'NOAA NCEI' AS source, SUM(source_noaa_ncei::int) AS event_count FROM verified_hail_events
UNION ALL SELECT 'IEM LSR', SUM(source_iem_lsr::int) FROM verified_hail_events
UNION ALL SELECT 'NCEI SWDI', SUM(source_ncei_swdi::int) FROM verified_hail_events
UNION ALL SELECT 'MRMS', SUM(source_mrms::int) FROM verified_hail_events
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

CREATE OR REPLACE VIEW verified_hail_events_stats_by_tier AS
SELECT
    confidence_tier,
    COUNT(*) AS event_count,
    COUNT(DISTINCT event_date) AS distinct_dates,
    MIN(event_date) AS earliest_date,
    MAX(event_date) AS latest_date,
    ROUND(AVG(hail_size_inches)::numeric, 2) AS avg_hail_size,
    MAX(hail_size_inches) AS max_hail_size,
    MAX(wind_mph) AS max_wind_mph
FROM verified_hail_events
GROUP BY confidence_tier
ORDER BY
    CASE confidence_tier
        WHEN 'quadruple-verified' THEN 1
        WHEN 'triple-verified' THEN 2
        WHEN 'cross-verified' THEN 3
        WHEN 'single-source' THEN 4
    END;

CREATE OR REPLACE VIEW verified_hail_events_stats_by_state_year AS
SELECT
    state,
    EXTRACT(YEAR FROM event_date) AS year,
    COUNT(*) AS event_count,
    COUNT(*) FILTER (WHERE hail_size_inches IS NOT NULL) AS hail_events,
    COUNT(*) FILTER (WHERE wind_mph IS NOT NULL) AS wind_events,
    COUNT(*) FILTER (WHERE tornado_ef_rank IS NOT NULL) AS tornado_events,
    MAX(hail_size_inches) AS max_hail,
    MAX(wind_mph) AS max_wind
FROM verified_hail_events
WHERE state IS NOT NULL
GROUP BY state, EXTRACT(YEAR FROM event_date)
ORDER BY state, year DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- DOCS
-- ════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE verified_hail_events IS
    'Unified multi-source verified hail/wind/tornado events. Companion to storm_events. See .planning/verification/';

COMMENT ON COLUMN verified_hail_events.source_details IS
    'Per-source audit payloads. Merged via jsonb ||. Example: {"noaa_ncei":{"event_id":"1234","hail_size":2.0,"narrative":"...","raw":{...}},"cocorahs":{"station":"VA-FX-40","stone_size":0.10,...}}';

COMMENT ON COLUMN verified_hail_events.lat_bucket IS
    'Dedup bucket: latitude rounded to 3 decimals ≈ 110m. Combined with lng_bucket + event_date, forms UNIQUE constraint.';

COMMENT ON COLUMN verified_hail_events.verification_count IS
    'Auto-computed from all source_* flags. Includes unverified rep/customer reports. Use verified_hail_events_public view for adjuster-facing count.';

COMMENT ON COLUMN verified_hail_events.algorithm_hail_size_inches IS
    'Radar-derived max hail size from MRMS/NCEI SWDI. Machine-generated, no human review.';

COMMENT ON COLUMN verified_hail_events.verified_hail_size_inches IS
    'Human-verified max hail size from NOAA NCEI (NWS-reviewed) or CoCoRaHS (observer-measured). Higher legal weight than algorithm track.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (save as 069_rollback.sql)
-- ════════════════════════════════════════════════════════════════════════════
--
-- BEGIN;
-- DROP VIEW IF EXISTS verified_hail_events_stats_by_state_year;
-- DROP VIEW IF EXISTS verified_hail_events_stats_by_tier;
-- DROP VIEW IF EXISTS verified_hail_events_stats_by_source;
-- DROP VIEW IF EXISTS verified_hail_events_public;
-- DROP TRIGGER IF EXISTS trg_verified_hail_events_updated ON verified_hail_events;
-- DROP FUNCTION IF EXISTS update_verified_hail_events_timestamp();
-- DROP TABLE IF EXISTS verified_hail_events CASCADE;
-- COMMIT;
