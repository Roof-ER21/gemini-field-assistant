import { computeStormImpact } from './stormImpactService.js';
// Swath coverage — we want as many dates as possible classified by swath-
// intersection (authoritative) rather than distance (fuzzy). Strategy:
//   - Cached dates: free, always checked
//   - Uncached dates with point reports ≥ 0.5": cold-fetch until time budget exhausted
//   - Uncached dates < 0.5" hail: skipped (not worth paying cold-fetch latency)
//
// Budget caps total request latency so reps don't wait forever on deep history.
// Anything skipped shows up in cacheStats.swathSkippedDueToCap so the UI can
// tell the rep "N more dates pending — refresh in a minute".
const COLD_FETCH_TIME_BUDGET_MS = 45_000; // 45s total across all cold fetches
const COLD_FETCH_MIN_HAIL = 0.5; // skip cold-fetch for trace-only days
// Global concurrency cap. Each getAddressHailImpact holds swath polygon
// buffers in heap; when my test-replay fired 10 in parallel 2026-04-23,
// the web container OOM'd (Railway SIGKILL). Cap at 3 concurrent so a
// burst of rep questions or a test harness can't blow the heap. Extra
// requests wait in a FIFO queue — individual response time grows from
// ~2s to at most ~6s under worst-case contention, which is fine.
const MAX_CONCURRENT_IMPACTS = 3;
let _active = 0;
const _waiters = [];
function acquire() {
    if (_active < MAX_CONCURRENT_IMPACTS) {
        _active++;
        return Promise.resolve();
    }
    return new Promise((resolve) => _waiters.push(() => { _active++; resolve(); }));
}
function release() {
    _active--;
    const next = _waiters.shift();
    if (next)
        next();
}
const PER_FETCH_TIMEOUT_MS = 15_000; // per-date, so slow ones don't eat budget
// Standard search window — can be overridden per caller.
const DEFAULT_RADIUS_MI = 15;
// Mph threshold for "wind-only" fallback matches the existing hailAtAddress rules.
const MIN_WIND_MPH = 40;
/**
 * Pull every candidate storm_date in the window — either (a) already in
 * mrms_swath_cache with a bbox covering the address point, OR (b) has a
 * verified point report within 15 mi. This is the full universe of dates
 * worth testing for swath-intersection.
 */
async function getCandidateDates(pool, lat, lng, monthsBack) {
    // One UNION query keeps DB round-trips to a single call. Haversine matches
    // the existing pattern in susanGroupMeBotRoutes.hailAtAddress.
    const sql = `
    WITH point_dates AS (
      SELECT event_date,
             COUNT(*)::int AS point_reports,
             MAX(hail_size_inches) AS max_hail,
             MAX(wind_mph) AS max_wind,
             MIN(3959 * acos(
               cos(radians($1)) * cos(radians(latitude)) *
               cos(radians(longitude) - radians($2)) +
               sin(radians($1)) * sin(radians(latitude))
             )) AS nearest_miles,
             BOOL_OR(source_noaa_ncei) AS noaa_confirmed,
             MAX(state) AS state,
             ARRAY_REMOVE(ARRAY[
               CASE WHEN BOOL_OR(source_noaa_ncei)     THEN 'noaa_ncei'     END,
               CASE WHEN BOOL_OR(source_iem_lsr)       THEN 'iem_lsr'       END,
               CASE WHEN BOOL_OR(source_ncei_swdi)     THEN 'ncei_swdi'     END,
               CASE WHEN BOOL_OR(source_mrms)          THEN 'mrms'          END,
               CASE WHEN BOOL_OR(source_nws_alert)     THEN 'nws_alert'     END,
               CASE WHEN BOOL_OR(source_iem_vtec)      THEN 'iem_vtec'      END,
               CASE WHEN BOOL_OR(source_cocorahs)      THEN 'cocorahs'      END,
               CASE WHEN BOOL_OR(source_mping)         THEN 'mping'         END,
               CASE WHEN BOOL_OR(source_synoptic)      THEN 'synoptic'      END,
               CASE WHEN BOOL_OR(source_spc_wcm)       THEN 'spc_wcm'       END
             ], NULL) AS sources
      FROM verified_hail_events_public_sane
      WHERE event_date >= (CURRENT_DATE - ($3::int * INTERVAL '30 days'))
        AND (hail_size_inches >= 0.25 OR wind_mph >= ${MIN_WIND_MPH})
        AND (3959 * acos(
               cos(radians($1)) * cos(radians(latitude)) *
               cos(radians(longitude) - radians($2)) +
               sin(radians($1)) * sin(radians(latitude))
            )) <= ${DEFAULT_RADIUS_MI}
      GROUP BY event_date
    ),
    swath_dates AS (
      SELECT DISTINCT storm_date AS event_date
      FROM mrms_swath_cache
      WHERE storm_date >= (CURRENT_DATE - ($3::int * INTERVAL '30 days'))
        AND expires_at > NOW()
        AND north >= $1 AND south <= $1
        AND east  >= $2 AND west  <= $2
    )
    SELECT
      COALESCE(p.event_date, s.event_date) AS event_date,
      (s.event_date IS NOT NULL)           AS has_swath_cache,
      COALESCE(p.point_reports, 0)          AS point_reports_within_15mi,
      p.max_hail                            AS max_hail_inches,
      p.max_wind                            AS max_wind_mph,
      p.nearest_miles,
      COALESCE(p.noaa_confirmed, false)     AS noaa_confirmed,
      COALESCE(p.sources, ARRAY[]::text[])  AS sources,
      p.state
    FROM point_dates p
    FULL OUTER JOIN swath_dates s ON p.event_date = s.event_date
    ORDER BY event_date DESC
  `;
    try {
        const { rows } = await pool.query(sql, [lat, lng, monthsBack]);
        return rows;
    }
    catch (err) {
        console.warn('[AddressImpact] candidate-dates query failed:', err.message);
        return [];
    }
}
function isoDate(d) {
    if (d instanceof Date)
        return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
}
/**
 * Query point reports within 2 mi of the address on a given date, used as
 * corroboration for a swath direct-hit (gives Susan "confirmed by N nearby
 * reports" framing).
 */
async function countConfirmingReports(pool, lat, lng, dateIso) {
    try {
        const { rows } = await pool.query(`SELECT COUNT(*)::int AS cnt,
              BOOL_OR(source_noaa_ncei) AS noaa,
              ARRAY_REMOVE(ARRAY[
                CASE WHEN BOOL_OR(source_noaa_ncei) THEN 'noaa_ncei' END,
                CASE WHEN BOOL_OR(source_iem_lsr)   THEN 'iem_lsr' END,
                CASE WHEN BOOL_OR(source_mrms)      THEN 'mrms' END,
                CASE WHEN BOOL_OR(source_cocorahs)  THEN 'cocorahs' END,
                CASE WHEN BOOL_OR(source_nws_alert) THEN 'nws_alert' END
              ], NULL) AS sources
       FROM verified_hail_events_public_sane
       WHERE event_date = $3::date
         AND (3959 * acos(
                cos(radians($1)) * cos(radians(latitude)) *
                cos(radians(longitude) - radians($2)) +
                sin(radians($1)) * sin(radians(latitude))
             )) <= 2`, [lat, lng, dateIso]);
        const row = rows[0] || { cnt: 0, noaa: false, sources: [] };
        return {
            count: Number(row.cnt || 0),
            noaaConfirmed: !!row.noaa,
            sources: Array.isArray(row.sources) ? row.sources : [],
        };
    }
    catch {
        return { count: 0, noaaConfirmed: false, sources: [] };
    }
}
/**
 * Main entry point — called by Susan bot, /api/hail/search, map UI, etc.
 */
export async function getAddressHailImpact(pool, lat, lng, monthsBack = 24, opts = {}) {
    await acquire();
    try {
        return await _impactInner(pool, lat, lng, monthsBack, opts.skipColdFetch === true);
    }
    finally {
        release();
    }
}
async function _impactInner(pool, lat, lng, monthsBack, skipColdFetch = false) {
    const started = Date.now();
    const candidates = await getCandidateDates(pool, lat, lng, monthsBack);
    console.log(`[AddressImpact] (${lat.toFixed(3)},${lng.toFixed(3)}) ${monthsBack}mo → ${candidates.length} candidate dates (${candidates.filter((c) => c.has_swath_cache).length} cached)`);
    const directHits = [];
    const nearMiss = [];
    const areaImpact = [];
    let swathCacheHits = 0;
    let swathColdFetches = 0;
    let swathSkippedDueToCap = 0;
    // Two-phase ordering so we maximize direct-hit coverage under a time budget:
    //   Phase A — cached dates (free, always checked), ranked recent first
    //   Phase B — uncached dates, ranked BY HAIL SIZE DESC (biggest first so the
    //             most important dates get swath-checked before budget exhausts)
    const cachedSorted = candidates
        .filter((c) => c.has_swath_cache)
        .sort((a, b) => isoDate(b.event_date).localeCompare(isoDate(a.event_date)));
    const uncachedSorted = candidates
        .filter((c) => !c.has_swath_cache)
        .sort((a, b) => {
        const aHail = Number(a.max_hail_inches || 0);
        const bHail = Number(b.max_hail_inches || 0);
        if (aHail !== bHail)
            return bHail - aHail;
        return isoDate(b.event_date).localeCompare(isoDate(a.event_date));
    });
    // Re-sort the cached phase by HAIL SIZE DESC (same as uncached phase)
    // so the biggest storms win. A prior attempt sorted cached by date DESC
    // (recent wins) and capped the walk at 60 — that dropped 7/16/24's 3"
    // DIRECT HIT from the Monrovia walk because it was 21 months old. For
    // dense DMV addresses with 400+ cached candidates, "biggest hail first"
    // is the right priority: an adjuster-worthy direct hit will never be
    // missed, and small-hail dates fall through to the point-report tier
    // even if we truncate later.
    const cachedBySize = [...cachedSorted].sort((a, b) => {
        const aHail = Number(a.max_hail_inches || 0);
        const bHail = Number(b.max_hail_inches || 0);
        if (aHail !== bHail)
            return bHail - aHail;
        return isoDate(b.event_date).localeCompare(isoDate(a.event_date));
    });
    // HARD CAP on candidates processed per request. Previously unbounded —
    // for dense DMV addresses with 400+ cached dates (Leesburg, Baltimore),
    // sequentially loading every polygon through mrms_swath_cache + running
    // point-in-polygon OOM'd the web container at ~300 dates because each
    // cached collection deserializes a ~100-500KB GeoJSON, and V8 GC couldn't
    // keep pace with how fast we were allocating. Container would 502, then
    // restart, then the retry would 502 again — classic "PDF idle" from the
    // rep's perspective. Biggest-hail-first sort above ensures we keep every
    // claim-worthy Direct Hit even with the cap.
    const MAX_CANDIDATES_PER_REQUEST = 150;
    const sorted = [...cachedBySize, ...uncachedSorted].slice(0, MAX_CANDIDATES_PER_REQUEST);
    const timeBudgetExpires = started + COLD_FETCH_TIME_BUDGET_MS;
    let processedSinceGc = 0;
    for (const c of sorted) {
        const dateIso = isoDate(c.event_date);
        const maxHailForThisDate = Number(c.max_hail_inches || 0);
        let canAttemptSwath = c.has_swath_cache;
        // For uncached: only cold-fetch dates with meaningful hail AND only while
        // within our time budget. Trace days (≤0.5") don't justify ~3-5s latency.
        // skipColdFetch=true forces cache-only mode (used by PDF-enqueue enrichment
        // where we can't block the client for 30-60s of cold fetches).
        if (!canAttemptSwath && !skipColdFetch) {
            const budgetRemaining = timeBudgetExpires - Date.now() > 0;
            const hailWorthFetching = maxHailForThisDate >= COLD_FETCH_MIN_HAIL || (c.point_reports_within_15mi || 0) >= 3;
            canAttemptSwath = budgetRemaining && hailWorthFetching;
        }
        let directHit = false;
        let tier = null;
        if (canAttemptSwath) {
            try {
                const impactPromise = computeStormImpact({
                    date: dateIso,
                    points: [{ id: 'addr', lat, lng }],
                }, pool);
                // Per-fetch timeout so one slow date doesn't eat the whole budget
                const impact = await Promise.race([
                    impactPromise,
                    new Promise((_, rej) => setTimeout(() => rej(new Error('per-fetch timeout')), PER_FETCH_TIMEOUT_MS)),
                ]);
                if (c.has_swath_cache)
                    swathCacheHits++;
                else
                    swathColdFetches++;
                const r = impact.results[0];
                if (r && r.directHit && r.maxHailInches !== null) {
                    // Corroborating point reports within 2 mi on the same date
                    const conf = await countConfirmingReports(pool, lat, lng, dateIso);
                    const srcSet = new Set([...(c.sources || []), ...conf.sources]);
                    tier = {
                        date: dateIso,
                        maxHailInches: r.maxHailInches,
                        sizeLabel: r.label,
                        severity: r.severity,
                        confirmingReportCount: conf.count,
                        noaaConfirmed: conf.noaaConfirmed || c.noaa_confirmed,
                        sources: [...srcSet].sort(),
                        state: c.state ?? null,
                    };
                    directHit = true;
                    directHits.push(tier);
                }
            }
            catch (err) {
                if (!c.has_swath_cache)
                    swathColdFetches++;
                console.warn(`[AddressImpact] swath check failed for ${dateIso}: ${err.message}`);
            }
        }
        else if (!c.has_swath_cache) {
            swathSkippedDueToCap++;
        }
        // If swath didn't hit (or we skipped it), classify by point-report distance
        if (!directHit) {
            const nearest = c.nearest_miles;
            const maxHail = c.max_hail_inches !== null ? Number(c.max_hail_inches) : null;
            if (nearest === null || nearest === undefined) {
                continue; // no point reports either; skip entirely
            }
            const fallbackTier = {
                date: dateIso,
                maxHailInches: maxHail,
                nearestMiles: Number(nearest),
                confirmingReportCount: Number(c.point_reports_within_15mi || 0),
                noaaConfirmed: !!c.noaa_confirmed,
                sources: Array.isArray(c.sources) ? c.sources : [],
                state: c.state ?? null,
            };
            if (nearest <= 3)
                nearMiss.push(fallbackTier);
            else if (nearest <= 15)
                areaImpact.push(fallbackTier);
        }
        // Explicit GC nudge every 40 candidates — each iteration deserialized
        // a potentially 100-500KB GeoJSON collection; without a hint V8 lets
        // RSS climb during the hot loop.
        processedSinceGc++;
        if (processedSinceGc >= 40 && typeof global.gc === 'function') {
            try {
                global.gc();
            }
            catch { /* noop */ }
            processedSinceGc = 0;
        }
    }
    // Sort each tier DESC by date, then DESC by size for tie-break
    const sortTier = (a, b) => {
        const dc = b.date.localeCompare(a.date);
        if (dc !== 0)
            return dc;
        return (b.maxHailInches || 0) - (a.maxHailInches || 0);
    };
    directHits.sort(sortTier);
    nearMiss.sort(sortTier);
    areaImpact.sort(sortTier);
    const elapsed = Date.now() - started;
    console.log(`[AddressImpact] done in ${elapsed}ms — direct=${directHits.length} nearMiss=${nearMiss.length} area=${areaImpact.length} ` +
        `(swath cache=${swathCacheHits} cold=${swathColdFetches} skipped=${swathSkippedDueToCap})`);
    return {
        lat,
        lng,
        monthsBack,
        directHits,
        nearMiss,
        areaImpact,
        summary: {
            directHitCount: directHits.length,
            nearMissCount: nearMiss.length,
            areaImpactCount: areaImpact.length,
            datesExamined: candidates.length,
        },
        cacheStats: {
            swathCacheHits,
            swathColdFetches,
            swathSkippedDueToCap,
        },
    };
}
