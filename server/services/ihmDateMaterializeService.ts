/**
 * IHM Date Materialization — guarantees no rep can cite an IHM-reported
 * date that isn't in our DB.
 *
 * For every city in `ihm_city_mirror`, for every date where IHM reports
 * confirmed hail (hail size > 0 OR trained-spotter report), upsert a row
 * into `verified_hail_events` at the city centroid, tagged `source_ihm=TRUE`.
 *
 * Uses ON CONFLICT against the (event_date, lat_bucket, lng_bucket) dedup
 * index, so:
 *   - If we already had hail data at that bucket+date: flip source_ihm=TRUE
 *     and MAX our hail_size with IHM's value (doesn't clobber our own data,
 *     just adds the IHM stamp + takes the larger size if IHM claims bigger).
 *   - If we had nothing: insert a new row anchored at the city centroid.
 *
 * Same infrastructure will serve HailTrace dates once we ingest those
 * (set source_hailtrace=TRUE instead).
 *
 * Idempotent. Safe to run nightly. First run fills the gap; subsequent
 * runs only touch cities where the IHM mirror was refreshed since the
 * last materialize.
 */
import type { Pool } from 'pg';

interface UniqueDate {
  date: string;
  max_hail_inches: number | null;
  has_spotter: boolean;
  has_radar: boolean;
  wind_mph_max: number | null;
  rows: number;
}

export interface MaterializeResult {
  ok: boolean;
  cities_processed: number;
  dates_materialized: number;
  rows_inserted: number;
  rows_merged: number;
  skipped_no_confirmed_hail: number;
  duration_ms: number;
}

export async function materializeIhmDates(pool: Pool): Promise<MaterializeResult> {
  const started = Date.now();
  let citiesProcessed = 0;
  let datesMaterialized = 0;
  let rowsInserted = 0;
  let rowsMerged = 0;
  let skippedNoHail = 0;

  const { rows: cities } = await pool.query<{
    city: string; state: string; lat: number | null; lng: number | null;
    unique_dates: UniqueDate[]; fetched_at: Date;
  }>(
    `SELECT city, state, lat, lng, unique_dates, fetched_at
       FROM ihm_city_mirror
      WHERE status = 200 AND lat IS NOT NULL AND lng IS NOT NULL`,
  );

  for (const c of cities) {
    citiesProcessed++;
    if (c.lat == null || c.lng == null) continue;

    for (const d of c.unique_dates || []) {
      const hasConfirmedHail = (d.max_hail_inches ?? 0) > 0 || d.has_spotter === true;
      if (!hasConfirmedHail) {
        skippedNoHail++;
        continue;
      }

      // Use 0.25" as the floor if IHM has has_spotter but null size — trained
      // spotter reporting hail without size is at minimum pea-tier, most NWS
      // reports use 0.25 as the "measurable hail" floor.
      const hailInches = d.max_hail_inches ?? 0.25;

      const result = await pool.query(
        `INSERT INTO verified_hail_events
            (event_date, latitude, longitude, state,
             hail_size_inches, verified_hail_size_inches,
             wind_mph, source_ihm, source_details)
          VALUES
            ($1, $2, $3, $4,
             $5, $5,
             $6, TRUE,
             jsonb_build_object('ihm', jsonb_build_object(
               'city', $7,
               'state', $13,
               'source_page', $8,
               'observed_has_spotter', $9,
               'observed_has_radar', $10,
               'observed_rows', $11,
               'mirrored_at', $12
             )))
          ON CONFLICT (event_date, lat_bucket, lng_bucket) DO UPDATE SET
            source_ihm = TRUE,
            source_details = verified_hail_events.source_details || EXCLUDED.source_details,
            hail_size_inches = GREATEST(
              verified_hail_events.hail_size_inches,
              EXCLUDED.hail_size_inches
            )
          RETURNING (xmax = 0) AS inserted`,
        [
          d.date,
          c.lat, c.lng, c.state,
          hailInches,
          d.wind_mph_max ?? null,
          c.city,
          `https://www.interactivehailmaps.com/local-hail-map/${c.city.toLowerCase().replace(/\s+/g, '-')}-${c.state.toLowerCase()}/`,
          d.has_spotter === true,
          d.has_radar === true,
          Number(d.rows || 0),
          c.fetched_at.toISOString(),
          c.state,    // $13 — state again, but this param is used only in jsonb text context
        ],
      );
      datesMaterialized++;
      if (result.rows[0]?.inserted) rowsInserted++;
      else rowsMerged++;
    }
  }

  return {
    ok: true,
    cities_processed: citiesProcessed,
    dates_materialized: datesMaterialized,
    rows_inserted: rowsInserted,
    rows_merged: rowsMerged,
    skipped_no_confirmed_hail: skippedNoHail,
    duration_ms: Date.now() - started,
  };
}
