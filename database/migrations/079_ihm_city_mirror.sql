-- Migration 079: ihm_city_mirror
-- Purpose: Store IHM's public per-city hail stats (scraped nightly from
--          Wayback Machine's mirror of interactivehailmaps.com/local-hail-map/)
--          so reps can't claim "IHM has more dates" without us producing
--          the exact per-date diff on demand.
--
-- Data source: web.archive.org/web/2025id_/https://www.interactivehailmaps.com/local-hail-map/{city}-{st}/
--              Internet Archive is public-interest archival — no IHM ToS exposure,
--              no auth, no Cloudflare challenge. The `id_` modifier returns the
--              raw mirror without the Wayback toolbar so we get pure IHM HTML.
--
-- Depends on: none (standalone fact table)
-- Rollback: 079_rollback.sql

BEGIN;

CREATE TABLE IF NOT EXISTS ihm_city_mirror (
  id                         SERIAL PRIMARY KEY,
  city_slug                  TEXT        NOT NULL,             -- url slug: "fairfax"
  city                       TEXT        NOT NULL,             -- "Fairfax"
  state                      CHAR(2)     NOT NULL,             -- "VA"
  lat                        NUMERIC(9,6),
  lng                        NUMERIC(9,6),

  -- Summary counts scraped directly from IHM's page text
  doppler_lifetime           INT,                              -- "detected hail ... on N occasions"
  doppler_past_year          INT,                              -- "... including K during the past year"
  spotter_reports_past_12mo  INT,                              -- "had X reports of on-the-ground hail"
  severe_warnings_past_12mo  INT,                              -- "severe weather warnings N times"
  top_recent_date            TEXT,                             -- "Friday, May 16, 2025"

  -- Our structured parse of the NWS warning log (the juicy bit)
  unique_dates_count         INT,                              -- distinct storm_dates in log
  events_count               INT,                              -- total NWS rows
  unique_dates               JSONB,                            -- [{date,max_hail_inches,has_spotter,has_radar,wind_mph_max,rows}]

  -- Fetch metadata
  fetched_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_url                 TEXT,
  status                     INT,                              -- 200 | 404 | 0

  UNIQUE (city_slug, state)
);

CREATE INDEX IF NOT EXISTS idx_ihm_city_mirror_state        ON ihm_city_mirror (state);
CREATE INDEX IF NOT EXISTS idx_ihm_city_mirror_fetched      ON ihm_city_mirror (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_ihm_city_mirror_city_state   ON ihm_city_mirror (LOWER(city), state);

-- GIN index for "which cities have data for date X?" queries — fast containment
-- lookups against the unique_dates JSONB array.
CREATE INDEX IF NOT EXISTS idx_ihm_city_mirror_dates_gin ON ihm_city_mirror USING GIN (unique_dates);

COMMENT ON TABLE ihm_city_mirror IS
  'Scraped IHM per-city hail stats from Internet Archive mirror. Populated by scripts/ihm-wayback/crawl.mjs and ingested via ihmMirrorIngestService.';

COMMIT;
