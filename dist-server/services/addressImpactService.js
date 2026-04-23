import { computeStormImpact } from './stormImpactService.js';
// Cap cold GRIB fetches per request to keep p95 latency bounded — first 5
// uncached dates get the round-trip, the rest fall back to point-report only.
const COLD_FETCH_CAP = 5;
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
export async function getAddressHailImpact(pool, lat, lng, monthsBack = 24) {
    const started = Date.now();
    const candidates = await getCandidateDates(pool, lat, lng, monthsBack);
    console.log(`[AddressImpact] (${lat.toFixed(3)},${lng.toFixed(3)}) ${monthsBack}mo → ${candidates.length} candidate dates (${candidates.filter((c) => c.has_swath_cache).length} cached)`);
    const directHits = [];
    const nearMiss = [];
    const areaImpact = [];
    let swathCacheHits = 0;
    let swathColdFetches = 0;
    let swathSkippedDueToCap = 0;
    // Prefer dates with cached swaths first — they're free and always tested.
    const sorted = [...candidates].sort((a, b) => {
        if (a.has_swath_cache !== b.has_swath_cache)
            return a.has_swath_cache ? -1 : 1;
        return isoDate(b.event_date).localeCompare(isoDate(a.event_date));
    });
    for (const c of sorted) {
        const dateIso = isoDate(c.event_date);
        const canAttemptSwath = c.has_swath_cache || swathColdFetches < COLD_FETCH_CAP;
        let directHit = false;
        let tier = null;
        if (canAttemptSwath) {
            try {
                const impact = await computeStormImpact({
                    date: dateIso,
                    points: [{ id: 'addr', lat, lng }],
                }, pool);
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
        else {
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
