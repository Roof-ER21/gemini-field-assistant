-- Migration 070: property_impact_rollup — precomputed per-property storm impact
--
-- Purpose: Mirror HailTrace's impactAnalysis structure. For each customer_property,
-- precompute the latest hail/wind/tornado impact across both tracks (algorithm + verified).
-- Refreshed on a schedule (10-min cadence). Makes /hail/search + PDF generation sub-100ms.
--
-- Dependency: migration 069 (verified_hail_events) must be applied first.

BEGIN;

CREATE TABLE IF NOT EXISTS property_impact_rollup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- FK to customer_properties — one rollup row per property
    customer_property_id UUID NOT NULL UNIQUE REFERENCES customer_properties(id) ON DELETE CASCADE,

    -- Cached property location (denormalized for fast queries)
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,

    -- ─── LAST IMPACT (any type, either track) ───
    last_impact_date DATE,
    last_impact_max_hail_inches DECIMAL(4, 2),
    last_impact_max_wind_mph INTEGER,

    -- ─── ALGORITHM TRACK (MRMS / NCEI SWDI — machine-derived) ───
    last_algorithm_hail_date DATE,
    last_algorithm_hail_inches DECIMAL(4, 2),
    last_algorithm_hail_event_id UUID,           -- FK to verified_hail_events.id
    last_algorithm_wind_date DATE,
    last_algorithm_wind_mph INTEGER,
    last_algorithm_wind_event_id UUID,

    -- ─── VERIFIED TRACK (NOAA NCEI / CoCoRaHS / approved rep reports) ───
    last_verified_hail_date DATE,
    last_verified_hail_inches DECIMAL(4, 2),
    last_verified_hail_event_id UUID,
    last_verified_wind_date DATE,
    last_verified_wind_mph INTEGER,
    last_verified_wind_event_id UUID,

    -- ─── TORNADO ───
    last_tornado_date DATE,
    last_tornado_ef_rank SMALLINT,
    last_tornado_event_id UUID,

    -- ─── LIFETIME COUNTS (all events ever at this property within search radius) ───
    total_hail_events INTEGER DEFAULT 0,
    total_wind_events INTEGER DEFAULT 0,
    total_tornado_events INTEGER DEFAULT 0,
    total_actionable_hail_events INTEGER DEFAULT 0,   -- hail ≥ 0.5"
    total_severe_wind_events INTEGER DEFAULT 0,        -- wind ≥ 58mph

    -- ─── MAX EVER OBSERVED (all-time max at this property, any source) ───
    max_hail_inches_ever DECIMAL(4, 2),
    max_hail_date DATE,
    max_wind_mph_ever INTEGER,
    max_wind_date DATE,

    -- ─── RECENT ROLLUPS (sliding windows) ───
    events_last_12_months INTEGER DEFAULT 0,
    events_last_24_months INTEGER DEFAULT 0,
    events_last_5_years INTEGER DEFAULT 0,

    -- ─── METADATA ───
    search_radius_miles DECIMAL(4, 2) DEFAULT 1.0,    -- radius to consider "at this property"
    verified_sources_in_last_event INTEGER,           -- verification_count of the most recent event
    last_refresh_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast property lookup
CREATE UNIQUE INDEX IF NOT EXISTS property_impact_rollup_property_idx
    ON property_impact_rollup (customer_property_id);

-- Spatial queries (e.g., "show me all properties with hail ≥1" in the last year")
CREATE INDEX IF NOT EXISTS property_impact_rollup_location_idx
    ON property_impact_rollup (latitude, longitude);

-- Stale rollup detection
CREATE INDEX IF NOT EXISTS property_impact_rollup_refresh_idx
    ON property_impact_rollup (last_refresh_at);

-- Recent impact filter
CREATE INDEX IF NOT EXISTS property_impact_rollup_recent_idx
    ON property_impact_rollup (last_impact_date DESC NULLS LAST);

-- ────────────────────────────────────────────────────────────────────────────
-- REFRESH FUNCTION
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_property_impact_rollup(p_customer_property_id UUID)
RETURNS VOID AS $$
DECLARE
    v_lat DECIMAL(10, 8);
    v_lng DECIMAL(11, 8);
    v_radius DECIMAL(4, 2);
BEGIN
    -- Pull property location + configured search radius
    SELECT
        cp.latitude, cp.longitude,
        COALESCE(pir.search_radius_miles, 1.0)
    INTO v_lat, v_lng, v_radius
    FROM customer_properties cp
    LEFT JOIN property_impact_rollup pir ON pir.customer_property_id = cp.id
    WHERE cp.id = p_customer_property_id;

    IF v_lat IS NULL THEN
        RAISE NOTICE 'Property % has no location; skipping rollup', p_customer_property_id;
        RETURN;
    END IF;

    -- Compute rollup using Haversine distance (from migration 018 function)
    -- Use verified_hail_events_public view (excludes unverified rep reports from count)
    INSERT INTO property_impact_rollup (
        customer_property_id, latitude, longitude,

        last_impact_date, last_impact_max_hail_inches, last_impact_max_wind_mph,

        last_algorithm_hail_date, last_algorithm_hail_inches, last_algorithm_hail_event_id,
        last_verified_hail_date, last_verified_hail_inches, last_verified_hail_event_id,

        last_algorithm_wind_date, last_algorithm_wind_mph, last_algorithm_wind_event_id,
        last_verified_wind_date, last_verified_wind_mph, last_verified_wind_event_id,

        last_tornado_date, last_tornado_ef_rank, last_tornado_event_id,

        total_hail_events, total_wind_events, total_tornado_events,
        total_actionable_hail_events, total_severe_wind_events,

        max_hail_inches_ever, max_hail_date,
        max_wind_mph_ever, max_wind_date,

        events_last_12_months, events_last_24_months, events_last_5_years,

        search_radius_miles, verified_sources_in_last_event, last_refresh_at
    )
    SELECT
        p_customer_property_id,
        v_lat, v_lng,

        -- Last any-type impact
        (SELECT event_date FROM verified_hail_events_public
         WHERE 3959 * acos(
            cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) +
            sin(radians(v_lat)) * sin(radians(latitude))
         ) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        (SELECT MAX(hail_size_inches) FROM verified_hail_events_public
         WHERE event_date = (SELECT MAX(event_date) FROM verified_hail_events_public
            WHERE 3959 * acos(
                cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) +
                sin(radians(v_lat)) * sin(radians(latitude))
            ) <= v_radius)
         AND 3959 * acos(
            cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) +
            sin(radians(v_lat)) * sin(radians(latitude))
         ) <= v_radius),
        (SELECT MAX(wind_mph) FROM verified_hail_events_public
         WHERE event_date = (SELECT MAX(event_date) FROM verified_hail_events_public
            WHERE 3959 * acos(
                cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) +
                sin(radians(v_lat)) * sin(radians(latitude))
            ) <= v_radius)
         AND 3959 * acos(
            cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) +
            sin(radians(v_lat)) * sin(radians(latitude))
         ) <= v_radius),

        -- Last algorithm hail (MRMS / NCEI SWDI)
        (SELECT event_date FROM verified_hail_events_public
         WHERE algorithm_hail_size_inches > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        (SELECT algorithm_hail_size_inches FROM verified_hail_events_public
         WHERE algorithm_hail_size_inches > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        (SELECT id FROM verified_hail_events_public
         WHERE algorithm_hail_size_inches > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),

        -- Last verified hail (NOAA / CoCoRaHS / approved rep)
        (SELECT event_date FROM verified_hail_events_public
         WHERE verified_hail_size_inches > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        (SELECT verified_hail_size_inches FROM verified_hail_events_public
         WHERE verified_hail_size_inches > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        (SELECT id FROM verified_hail_events_public
         WHERE verified_hail_size_inches > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),

        -- Last algorithm wind
        (SELECT event_date FROM verified_hail_events_public
         WHERE algorithm_wind_mph > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        (SELECT algorithm_wind_mph FROM verified_hail_events_public
         WHERE algorithm_wind_mph > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        (SELECT id FROM verified_hail_events_public
         WHERE algorithm_wind_mph > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),

        -- Last verified wind
        (SELECT event_date FROM verified_hail_events_public
         WHERE verified_wind_mph > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        (SELECT verified_wind_mph FROM verified_hail_events_public
         WHERE verified_wind_mph > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        (SELECT id FROM verified_hail_events_public
         WHERE verified_wind_mph > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),

        -- Last tornado
        (SELECT event_date FROM verified_hail_events_public
         WHERE tornado_ef_rank IS NOT NULL
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        (SELECT tornado_ef_rank FROM verified_hail_events_public
         WHERE tornado_ef_rank IS NOT NULL
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        (SELECT id FROM verified_hail_events_public
         WHERE tornado_ef_rank IS NOT NULL
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),

        -- Lifetime counts
        (SELECT COUNT(*) FROM verified_hail_events_public
         WHERE hail_size_inches > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius),
        (SELECT COUNT(*) FROM verified_hail_events_public
         WHERE wind_mph > 0
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius),
        (SELECT COUNT(*) FROM verified_hail_events_public
         WHERE tornado_ef_rank IS NOT NULL
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius),
        (SELECT COUNT(*) FROM verified_hail_events_public
         WHERE hail_size_inches >= 0.5
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius),
        (SELECT COUNT(*) FROM verified_hail_events_public
         WHERE wind_mph >= 58
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius),

        -- Max-ever
        (SELECT MAX(hail_size_inches) FROM verified_hail_events_public
         WHERE 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius),
        (SELECT event_date FROM verified_hail_events_public
         WHERE hail_size_inches IS NOT NULL
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY hail_size_inches DESC NULLS LAST LIMIT 1),
        (SELECT MAX(wind_mph) FROM verified_hail_events_public
         WHERE 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius),
        (SELECT event_date FROM verified_hail_events_public
         WHERE wind_mph IS NOT NULL
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY wind_mph DESC NULLS LAST LIMIT 1),

        -- Sliding windows
        (SELECT COUNT(*) FROM verified_hail_events_public
         WHERE event_date >= CURRENT_DATE - INTERVAL '12 months'
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius),
        (SELECT COUNT(*) FROM verified_hail_events_public
         WHERE event_date >= CURRENT_DATE - INTERVAL '24 months'
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius),
        (SELECT COUNT(*) FROM verified_hail_events_public
         WHERE event_date >= CURRENT_DATE - INTERVAL '5 years'
           AND 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius),

        v_radius,
        (SELECT public_verification_count FROM verified_hail_events_public
         WHERE 3959 * acos(cos(radians(v_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(v_lng)) + sin(radians(v_lat)) * sin(radians(latitude))) <= v_radius
         ORDER BY event_date DESC LIMIT 1),
        NOW()

    ON CONFLICT (customer_property_id) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        last_impact_date = EXCLUDED.last_impact_date,
        last_impact_max_hail_inches = EXCLUDED.last_impact_max_hail_inches,
        last_impact_max_wind_mph = EXCLUDED.last_impact_max_wind_mph,
        last_algorithm_hail_date = EXCLUDED.last_algorithm_hail_date,
        last_algorithm_hail_inches = EXCLUDED.last_algorithm_hail_inches,
        last_algorithm_hail_event_id = EXCLUDED.last_algorithm_hail_event_id,
        last_algorithm_wind_date = EXCLUDED.last_algorithm_wind_date,
        last_algorithm_wind_mph = EXCLUDED.last_algorithm_wind_mph,
        last_algorithm_wind_event_id = EXCLUDED.last_algorithm_wind_event_id,
        last_verified_hail_date = EXCLUDED.last_verified_hail_date,
        last_verified_hail_inches = EXCLUDED.last_verified_hail_inches,
        last_verified_hail_event_id = EXCLUDED.last_verified_hail_event_id,
        last_verified_wind_date = EXCLUDED.last_verified_wind_date,
        last_verified_wind_mph = EXCLUDED.last_verified_wind_mph,
        last_verified_wind_event_id = EXCLUDED.last_verified_wind_event_id,
        last_tornado_date = EXCLUDED.last_tornado_date,
        last_tornado_ef_rank = EXCLUDED.last_tornado_ef_rank,
        last_tornado_event_id = EXCLUDED.last_tornado_event_id,
        total_hail_events = EXCLUDED.total_hail_events,
        total_wind_events = EXCLUDED.total_wind_events,
        total_tornado_events = EXCLUDED.total_tornado_events,
        total_actionable_hail_events = EXCLUDED.total_actionable_hail_events,
        total_severe_wind_events = EXCLUDED.total_severe_wind_events,
        max_hail_inches_ever = EXCLUDED.max_hail_inches_ever,
        max_hail_date = EXCLUDED.max_hail_date,
        max_wind_mph_ever = EXCLUDED.max_wind_mph_ever,
        max_wind_date = EXCLUDED.max_wind_date,
        events_last_12_months = EXCLUDED.events_last_12_months,
        events_last_24_months = EXCLUDED.events_last_24_months,
        events_last_5_years = EXCLUDED.events_last_5_years,
        verified_sources_in_last_event = EXCLUDED.verified_sources_in_last_event,
        last_refresh_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Refresh all properties (called by cron every 10 min)
CREATE OR REPLACE FUNCTION refresh_all_property_impact_rollups()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM customer_properties WHERE archived_at IS NULL LOOP
        PERFORM refresh_property_impact_rollup(r.id);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE property_impact_rollup IS
    'Precomputed per-property storm impact (dual-track). Mirrors HailTrace impactAnalysis. Refresh cadence: 10 min. See migration 070.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (070_rollback.sql)
-- ════════════════════════════════════════════════════════════════════════════
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS refresh_all_property_impact_rollups();
-- DROP FUNCTION IF EXISTS refresh_property_impact_rollup(UUID);
-- DROP TABLE IF EXISTS property_impact_rollup CASCADE;
-- COMMIT;
