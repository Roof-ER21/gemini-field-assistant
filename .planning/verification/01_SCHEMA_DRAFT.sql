-- Migration 070: Unified verified_hail_events table
-- Phase 0 DRAFT — not yet applied
-- Purpose: single canonical table that all hail sources write to,
-- with deterministic dedup and auto-computed verification tier.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- PRIMARY TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS verified_hail_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Canonical identity (dedup bucket)
    event_date DATE NOT NULL,                          -- Eastern timezone normalized
    latitude DECIMAL(10,7) NOT NULL,                   -- GPS-precision preserved
    longitude DECIMAL(10,7) NOT NULL,

    -- Derived dedup columns (generated from lat/lng at 3 decimal places ≈ 110m)
    lat_bucket DECIMAL(6,3) GENERATED ALWAYS AS (ROUND(latitude::numeric, 3)) STORED,
    lng_bucket DECIMAL(7,3) GENERATED ALWAYS AS (ROUND(longitude::numeric, 3)) STORED,

    -- Aggregated measurements (max across sources, with NOAA-priority override)
    hail_size_inches DECIMAL(4,2),                     -- NULL if wind-only event
    wind_mph INTEGER,                                  -- NULL if hail-only event

    -- Source flags — each true when that source has confirmed this bucket
    source_noaa BOOLEAN NOT NULL DEFAULT FALSE,        -- Verified federal (highest rigor)
    source_cocorahs BOOLEAN NOT NULL DEFAULT FALSE,    -- Observer-verified (NSF/CSU)
    source_rep_report BOOLEAN NOT NULL DEFAULT FALSE,  -- Field crowdsource (admin-verified only)
    source_mrms BOOLEAN NOT NULL DEFAULT FALSE,        -- Federal radar (algorithmic)
    source_nws BOOLEAN NOT NULL DEFAULT FALSE,         -- NWS alert polygon (federal)
    source_hailtrace BOOLEAN NOT NULL DEFAULT FALSE,   -- OPTIONAL — commercial
    source_ihm BOOLEAN NOT NULL DEFAULT FALSE,         -- OPTIONAL — commercial

    -- Auto-computed verification metrics
    verification_count INTEGER GENERATED ALWAYS AS (
        source_noaa::int +
        source_cocorahs::int +
        source_rep_report::int +
        source_mrms::int +
        source_nws::int +
        source_hailtrace::int +
        source_ihm::int
    ) STORED,

    confidence_tier TEXT GENERATED ALWAYS AS (
        CASE
            WHEN (source_noaa::int + source_cocorahs::int + source_rep_report::int +
                  source_mrms::int + source_nws::int + source_hailtrace::int + source_ihm::int) >= 4
                THEN 'quadruple-verified'
            WHEN (source_noaa::int + source_cocorahs::int + source_rep_report::int +
                  source_mrms::int + source_nws::int + source_hailtrace::int + source_ihm::int) = 3
                THEN 'triple-verified'
            WHEN (source_noaa::int + source_cocorahs::int + source_rep_report::int +
                  source_mrms::int + source_nws::int + source_hailtrace::int + source_ihm::int) = 2
                THEN 'cross-verified'
            ELSE 'single-source'
        END
    ) STORED,

    -- Audit trail — raw per-source payloads for reproducibility
    source_details JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Moderation for rep reports
    rep_report_verified_by_admin BOOLEAN,              -- NULL when no rep source; true/false when rep source present
    rep_report_photo_url TEXT,                         -- S3/local URL if rep submitted photo

    -- Timestamps
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Bounds check — US lat/lng rough box
    CONSTRAINT valid_latitude CHECK (latitude BETWEEN 18.0 AND 72.0),
    CONSTRAINT valid_longitude CHECK (longitude BETWEEN -180.0 AND -66.0),
    CONSTRAINT at_least_one_measurement CHECK (hail_size_inches IS NOT NULL OR wind_mph IS NOT NULL),
    CONSTRAINT at_least_one_source CHECK (
        source_noaa OR source_cocorahs OR source_rep_report OR
        source_mrms OR source_nws OR source_hailtrace OR source_ihm
    )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- DEDUP CONSTRAINT — THE CORE INVARIANT
-- Same date + same ~110m bucket = same record. Enforced at DB level.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS verified_hail_events_dedup_idx
    ON verified_hail_events (event_date, lat_bucket, lng_bucket);

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERY INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

-- Spatial queries (for /hail/search proximity lookups)
CREATE INDEX IF NOT EXISTS verified_hail_events_location_idx
    ON verified_hail_events (latitude, longitude);

-- Date-range queries
CREATE INDEX IF NOT EXISTS verified_hail_events_date_idx
    ON verified_hail_events (event_date DESC);

-- Confidence-filtered queries (e.g. "show me only cross-verified+")
CREATE INDEX IF NOT EXISTS verified_hail_events_tier_idx
    ON verified_hail_events (confidence_tier, event_date DESC);

-- Actionable hail lookups (>= 0.5")
CREATE INDEX IF NOT EXISTS verified_hail_events_actionable_idx
    ON verified_hail_events (event_date DESC, latitude, longitude)
    WHERE hail_size_inches >= 0.5;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_verified_hail_events_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verified_hail_events_updated
    BEFORE UPDATE ON verified_hail_events
    FOR EACH ROW
    EXECUTE FUNCTION update_verified_hail_events_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════
-- MATERIALIZED VIEW — PER-PROPERTY VERIFICATION ROLLUP
-- Used by PDF verification badge + /hail/search responses.
-- Refreshed by cron every 10 min.
-- ═══════════════════════════════════════════════════════════════════════════

-- (Deferred to Phase 3 — build after verified_hail_events has real data)

-- ═══════════════════════════════════════════════════════════════════════════
-- REPORTING VIEW — quick stats for monitoring
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW verified_hail_events_stats AS
SELECT
    confidence_tier,
    COUNT(*) AS event_count,
    COUNT(DISTINCT event_date) AS distinct_dates,
    MIN(event_date) AS earliest,
    MAX(event_date) AS latest,
    ROUND(AVG(hail_size_inches)::numeric, 2) AS avg_hail_size,
    MAX(hail_size_inches) AS max_hail_size,
    MAX(wind_mph) AS max_wind_mph,
    SUM(source_noaa::int) AS noaa_count,
    SUM(source_cocorahs::int) AS cocorahs_count,
    SUM(source_rep_report::int) AS rep_report_count,
    SUM(source_mrms::int) AS mrms_count,
    SUM(source_nws::int) AS nws_count,
    SUM(source_hailtrace::int) AS hailtrace_count,
    SUM(source_ihm::int) AS ihm_count
FROM verified_hail_events
GROUP BY confidence_tier
ORDER BY
    CASE confidence_tier
        WHEN 'quadruple-verified' THEN 1
        WHEN 'triple-verified' THEN 2
        WHEN 'cross-verified' THEN 3
        WHEN 'single-source' THEN 4
    END;

COMMENT ON TABLE verified_hail_events IS
    'Unified multi-source verified hail/wind events. Phase 0 of verification pipeline. See .planning/verification/00_DECISIONS.md for full design.';

COMMENT ON COLUMN verified_hail_events.source_details IS
    'JSONB per-source audit trail. Structure: {"noaa": {"event_id": "...", "hail_size": 2.0, "raw": {...}}, "cocorahs": {...}, ...}';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (070_rollback.sql)
-- ═══════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP VIEW IF EXISTS verified_hail_events_stats;
-- DROP TRIGGER IF EXISTS trg_verified_hail_events_updated ON verified_hail_events;
-- DROP FUNCTION IF EXISTS update_verified_hail_events_timestamp();
-- DROP TABLE IF EXISTS verified_hail_events CASCADE;
-- COMMIT;
