import { getHistoricalMrmsSwathPolygons } from './historicalMrmsService.js';
// 6-state footprint bbox — covers ALL of VA/MD/DC/PA/WV/DE with small padding.
// One cache entry at this bbox covers every address in our service area.
//
// Coverage notes (corners):
//   north: 42.3  — catches PA's northernmost border with NY (Erie, Bradford)
//   south: 36.5  — southern VA (Virginia Beach 36.85, Danville 36.58)
//   east:  -74.5 — off Atlantic coast, well past Delmarva + Virginia Beach
//   west:  -82.5 — western WV (past Huntington at -82.45) + western PA
//                  (Pittsburgh -79.99, well inside)
//
// Previously 40.5 on the north which clipped the top of PA (Erie + Scranton
// were outside the backfill). Widened 2026-04-24 per Ahmed's request for
// full PA coverage. MRMS coverage adds ~5-10% more storm-days per year but
// there's no downside — Pennsylvania reps need the same confidence as DMV.
const DMV_BBOX = {
    north: 42.3,
    south: 36.5,
    east: -74.5,
    west: -82.5,
};
// Rate limits for the IEM archive — 3s between fetches, max N per run.
const DELAY_MS = 3_000;
const DEFAULT_MAX_PER_RUN = 60;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
/**
 * Find DMV storm days ≥ 1" hail in last N months whose swath is NOT yet
 * cached (or expired). Ranked by hail size DESC so the biggest events are
 * backfilled first — if we hit the per-run cap, at least the biggest
 * storms are covered.
 */
async function findMissingStormDays(pool, monthsBack) {
    const { rows } = await pool.query(`SELECT event_date::text AS event_date,
            MAX(hail_size_inches)::numeric AS max_hail
     FROM verified_hail_events_public_sane
     WHERE event_date >= (CURRENT_DATE - ($1::int * INTERVAL '30 days'))
       AND state IN ('VA','MD','DC','PA','WV','DE')
       AND hail_size_inches >= 1.0
       AND event_date NOT IN (
         SELECT storm_date FROM mrms_swath_cache WHERE expires_at > NOW()
       )
     GROUP BY event_date
     ORDER BY MAX(hail_size_inches) DESC NULLS LAST, event_date DESC`, [monthsBack]);
    return rows.map((r) => ({
        event_date: String(r.event_date),
        max_hail: Number(r.max_hail || 0),
    }));
}
export async function backfillSwathCache(pool, opts = {}) {
    const monthsBack = opts.monthsBack ?? 24;
    const maxPerRun = opts.maxPerRun ?? DEFAULT_MAX_PER_RUN;
    const dryRun = opts.dryRun ?? false;
    const started = Date.now();
    const errors = [];
    let succeeded = 0;
    let failed = 0;
    const missing = await findMissingStormDays(pool, monthsBack);
    console.log(`[SwathBackfill] ${missing.length} missing DMV storm days (≥1" hail, ${monthsBack}mo). ` +
        `Will process up to ${maxPerRun} this run.`);
    if (missing.length === 0) {
        return {
            ok: true, attempted: 0, succeeded: 0, failed: 0, skipped: 0,
            durationMs: Date.now() - started, errors: [], daysRemaining: 0,
        };
    }
    if (dryRun) {
        console.log(`[SwathBackfill] DRY RUN — skipping actual fetches`);
        return {
            ok: true, attempted: 0, succeeded: 0, failed: 0,
            skipped: Math.min(missing.length, maxPerRun),
            durationMs: Date.now() - started, errors: [],
            daysRemaining: missing.length,
        };
    }
    const batch = missing.slice(0, maxPerRun);
    for (let i = 0; i < batch.length; i++) {
        const day = batch[i];
        try {
            await getHistoricalMrmsSwathPolygons({
                date: day.event_date,
                north: DMV_BBOX.north,
                south: DMV_BBOX.south,
                east: DMV_BBOX.east,
                west: DMV_BBOX.west,
                anchorTimestamp: null,
            }, pool);
            succeeded++;
            console.log(`[SwathBackfill] [${i + 1}/${batch.length}] ${day.event_date} — cached (max ${day.max_hail}")`);
        }
        catch (err) {
            failed++;
            const msg = `${day.event_date}: ${err.message}`;
            errors.push(msg);
            console.warn(`[SwathBackfill] [${i + 1}/${batch.length}] ${msg}`);
        }
        // Rate-limit so we don't hammer the IEM archive
        if (i < batch.length - 1)
            await sleep(DELAY_MS);
    }
    return {
        ok: true,
        attempted: batch.length,
        succeeded,
        failed,
        skipped: 0,
        durationMs: Date.now() - started,
        errors,
        daysRemaining: Math.max(0, missing.length - succeeded),
    };
}
/**
 * One-time full catch-up — call this manually (via a trigger endpoint) to
 * churn through ALL missing days in chunks. Respects the same rate-limit.
 */
export async function fullCatchUp(pool, opts = {}) {
    const runs = [];
    const maxTotal = opts.maxTotal ?? 500;
    let done = 0;
    while (done < maxTotal) {
        const runSize = Math.min(DEFAULT_MAX_PER_RUN, maxTotal - done);
        const r = await backfillSwathCache(pool, { monthsBack: opts.monthsBack, maxPerRun: runSize });
        runs.push(r);
        done += r.succeeded;
        if (r.succeeded === 0 || r.daysRemaining === 0)
            break;
    }
    return runs;
}
