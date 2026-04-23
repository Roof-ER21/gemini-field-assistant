/**
 * Storm Days Service
 *
 * Manages the storm_days_public materialized view:
 *   - refreshStormDaysPublic(pool)  — single refresh, called directly or by cron
 *   - startStormDaysRefresh(pool)   — schedules hourly refresh at :10 past the hour
 *
 * The MV aggregates verified_hail_events_public_sane to one row per
 * (event_date, state, lat_bucket, lng_bucket) so the /api/hail/storm-days
 * endpoint can serve 5-10 years of history without pulling raw event rows.
 *
 * Refresh strategy:
 *   - CONCURRENTLY is the default once the unique index exists (migration 076).
 *   - If the first-ever refresh fails (unique index not yet present because
 *     the migration was applied mid-run), we fall back to a blocking refresh.
 *   - The cron offset (:10) avoids stacking on the :00/:15/:30/:45 pollers.
 */

import cron from 'node-cron';
import type { Pool } from 'pg';

const MV_NAME = 'storm_days_public';

/**
 * Idempotent schema bootstrap. Runs the 077 migration body on startup
 * so the MV exists before the first /api/hail/storm-days request. The
 * sandbox that builds these images cannot apply migrations via psql
 * so every service that needs a new schema object self-bootstraps.
 * Safe on redeploys — every statement uses IF NOT EXISTS.
 */
export async function ensureStormDaysSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS storm_days_public AS
    SELECT
      event_date, state, lat_bucket, lng_bucket,
      COUNT(*)::int                                    AS report_count,
      MAX(hail_size_inches)                            AS max_hail,
      MAX(wind_mph)                                    AS max_wind,
      BOOL_OR(source_noaa_ncei)                        AS has_noaa,
      BOOL_OR(source_mrms)                             AS has_mrms,
      BOOL_OR(source_nexrad_l2)                        AS has_nexrad_l2,
      BOOL_OR(source_ihm)                              AS has_ihm,
      BOOL_OR(source_cocorahs)                         AS has_cocorahs,
      BOOL_OR(source_iem_lsr)                          AS has_iem_lsr,
      BOOL_OR(source_nws_alert OR source_iem_vtec)     AS has_nws_alert,
      SUM(public_verification_count)::int              AS total_verifications
    FROM verified_hail_events_public_sane
    GROUP BY event_date, state, lat_bucket, lng_bucket
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS storm_days_public_pk
      ON storm_days_public (event_date, state, lat_bucket, lng_bucket)
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS storm_days_public_event_date_idx ON storm_days_public (event_date DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS storm_days_public_bucket_idx ON storm_days_public (lat_bucket, lng_bucket)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS storm_days_public_state_date_idx ON storm_days_public (state, event_date DESC)`);
  // Populate once synchronously when empty so /storm-days has data
  // immediately instead of waiting up to an hour for the first cron tick.
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${MV_NAME}`);
  if ((rows[0]?.n ?? 0) === 0) {
    const t0 = Date.now();
    await pool.query(`REFRESH MATERIALIZED VIEW ${MV_NAME}`);
    const { rows: r2 } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${MV_NAME}`);
    console.log(`[storm-days] initial refresh — ${r2[0].n} rows in ${Date.now() - t0}ms`);
  }
}

/**
 * Refresh the storm_days_public materialized view.
 * Tries CONCURRENTLY first (non-blocking); falls back to blocking refresh
 * if the unique index does not yet exist.
 */
export async function refreshStormDaysPublic(pool: Pool): Promise<void> {
  const t0 = Date.now();
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${MV_NAME}`);
    console.log(`[StormDays] CONCURRENT refresh done in ${Date.now() - t0}ms`);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    // Postgres: "cannot refresh ... without a unique index" when the unique
    // index is missing (e.g. first run before migration 076 unique index lands).
    if (msg.includes('unique index')) {
      console.warn('[StormDays] Unique index not found — falling back to blocking refresh');
      const t1 = Date.now();
      await pool.query(`REFRESH MATERIALIZED VIEW ${MV_NAME}`);
      console.log(`[StormDays] Blocking refresh done in ${Date.now() - t1}ms`);
    } else {
      throw err;
    }
  }
}

/**
 * Start the hourly Storm Days refresh cron.
 * Fires at :10 past every hour (offset from :00/:15/:30/:45 pollers).
 * Safe to call multiple times — will only register once per process.
 */
let _refreshStarted = false;

export function startStormDaysRefresh(pool: Pool): void {
  if (_refreshStarted) return;
  _refreshStarted = true;

  // Run immediately on startup so the MV is warm before first request.
  refreshStormDaysPublic(pool).catch((e) =>
    console.error('[StormDays] Initial refresh error:', e),
  );

  // Every hour at :10.
  cron.schedule('10 * * * *', () => {
    refreshStormDaysPublic(pool).catch((e) =>
      console.error('[StormDays] Scheduled refresh error:', e),
    );
  });

  console.log('[StormDays] Hourly refresh cron registered (at :10 each hour)');
}
