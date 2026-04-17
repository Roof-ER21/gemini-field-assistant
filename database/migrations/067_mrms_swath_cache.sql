-- MRMS Vector Swath Polygon Cache
--
-- Persists the output of meshVectorService.meshGridToPolygons() so vector
-- polygon GeoJSON survives server restarts. The in-memory swathPolyCache is
-- still the first line (~1ms read), this table is the durable fallback
-- (~20-50ms read) before falling through to the 2-5 second GRIB decode.
--
-- A single row covers one (date, bounds, anchor) request — the bounds are
-- rounded to 2 decimal places (matching the cache key in
-- historicalMrmsService.ts) so near-identical viewport requests share cache.

CREATE TABLE IF NOT EXISTS mrms_swath_cache (
    id BIGSERIAL PRIMARY KEY,

    -- Storm date (YYYY-MM-DD) the polygons represent
    storm_date DATE NOT NULL,

    -- Viewport bounds (rounded to 2dp to match in-memory cache key)
    north NUMERIC(7, 2) NOT NULL,
    south NUMERIC(7, 2) NOT NULL,
    east  NUMERIC(7, 2) NOT NULL,
    west  NUMERIC(7, 2) NOT NULL,

    -- Optional anchor timestamp (used for multi-storm days); empty string for "any"
    anchor_timestamp VARCHAR(64) NOT NULL DEFAULT '',

    -- Full GeoJSON FeatureCollection from meshGridToPolygons()
    geojson JSONB NOT NULL,

    -- Metadata pulled out for quick filtering / reporting
    max_mesh_inches NUMERIC(5, 2) NOT NULL DEFAULT 0,
    hail_cells INTEGER NOT NULL DEFAULT 0,
    feature_count INTEGER NOT NULL DEFAULT 0,
    source_files TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT mrms_swath_cache_unique_key
        UNIQUE (storm_date, north, south, east, west, anchor_timestamp)
);

CREATE INDEX IF NOT EXISTS mrms_swath_cache_date_idx
    ON mrms_swath_cache (storm_date);

CREATE INDEX IF NOT EXISTS mrms_swath_cache_expires_idx
    ON mrms_swath_cache (expires_at);

CREATE INDEX IF NOT EXISTS mrms_swath_cache_max_mesh_idx
    ON mrms_swath_cache (max_mesh_inches DESC)
    WHERE max_mesh_inches > 0;

COMMENT ON TABLE mrms_swath_cache IS
    'Durable cache of MRMS MESH vector swath polygons (GeoJSON). Survives server restart. Entries expire per expires_at; periodic cleanup runs via cleanExpiredSwathCache().';
