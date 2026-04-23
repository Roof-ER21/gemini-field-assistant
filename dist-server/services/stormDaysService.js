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
const MV_NAME = 'storm_days_public';
/**
 * Refresh the storm_days_public materialized view.
 * Tries CONCURRENTLY first (non-blocking); falls back to blocking refresh
 * if the unique index does not yet exist.
 */
export async function refreshStormDaysPublic(pool) {
    const t0 = Date.now();
    try {
        await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${MV_NAME}`);
        console.log(`[StormDays] CONCURRENT refresh done in ${Date.now() - t0}ms`);
    }
    catch (err) {
        const msg = err.message ?? '';
        // Postgres: "cannot refresh ... without a unique index" when the unique
        // index is missing (e.g. first run before migration 076 unique index lands).
        if (msg.includes('unique index')) {
            console.warn('[StormDays] Unique index not found — falling back to blocking refresh');
            const t1 = Date.now();
            await pool.query(`REFRESH MATERIALIZED VIEW ${MV_NAME}`);
            console.log(`[StormDays] Blocking refresh done in ${Date.now() - t1}ms`);
        }
        else {
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
export function startStormDaysRefresh(pool) {
    if (_refreshStarted)
        return;
    _refreshStarted = true;
    // Run immediately on startup so the MV is warm before first request.
    refreshStormDaysPublic(pool).catch((e) => console.error('[StormDays] Initial refresh error:', e));
    // Every hour at :10.
    cron.schedule('10 * * * *', () => {
        refreshStormDaysPublic(pool).catch((e) => console.error('[StormDays] Scheduled refresh error:', e));
    });
    console.log('[StormDays] Hourly refresh cron registered (at :10 each hour)');
}
