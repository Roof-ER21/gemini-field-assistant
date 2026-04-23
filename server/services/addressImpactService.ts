/**
 * Address Hail Impact Service — swath-first, distance-fallback.
 *
 * Leads with **MRMS swath intersection** (ground truth: "this polygon covers
 * the property") and falls back to point-report distance when the address
 * sits outside every cached swath for a given storm date.
 *
 * Fixes the Cub Stream Dr case discovered 2026-04-23: the raw distance query
 * was reporting "1.7 miles away" for a property that actually sits inside 5
 * nested MRMS swath bands on 2023-06-16 (up to 1.25").
 *
 * Three tiers, ranked for rep usefulness:
 *   1. Direct Hit   — inside an MRMS swath band (authoritative for that date)
 *   2. Near Miss    — ≤ 3 mi from a point report on that date, not in a swath
 *   3. Area Impact  — 3-15 mi, context only
 *
 * Cache strategy: on-demand with a per-request cap of 5 cold GRIB fetches so
 * we don't timeout a rep asking about a 10-year-old address.
 */
import type pg from 'pg';
import { computeStormImpact, type StormImpactPoint } from './stormImpactService.js';

export interface AddressImpactTier {
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Max hail band that contains the point (swath) or max point-report size (non-swath) */
  maxHailInches: number | null;
  /** MRMS band label when direct-hit (e.g. "1 1/4\"") */
  sizeLabel?: string | null;
  /** Severity label ("trace" / "moderate" / "severe" / ...) */
  severity?: string | null;
  /** Nearest point-report distance in miles — only populated for near-miss / area-impact */
  nearestMiles?: number;
  /** How many verified point reports on this date were within 2 mi of the address */
  confirmingReportCount: number;
  /** True if at least one NOAA NCEI-verified point report sits within 15 mi on the same date */
  noaaConfirmed: boolean;
  /** Roll-up of which sources confirmed something on this date (any source_* boolean true) */
  sources: string[];
  /** State of the strongest hit (for legacy display) */
  state?: string | null;
}

export interface AddressImpactReport {
  lat: number;
  lng: number;
  monthsBack: number;
  /** Inside an MRMS swath — lead with these. Sorted by date DESC. */
  directHits: AddressImpactTier[];
  /** Not in any swath, but ≤ 3 mi from a verified point report on that date. Sorted by date DESC. */
  nearMiss: AddressImpactTier[];
  /** 3-15 mi from the nearest point report. Context only. Sorted by date DESC. */
  areaImpact: AddressImpactTier[];
  summary: {
    directHitCount: number;
    nearMissCount: number;
    areaImpactCount: number;
    datesExamined: number;
  };
  cacheStats: {
    swathCacheHits: number;
    swathColdFetches: number;
    swathSkippedDueToCap: number;
  };
}

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
const COLD_FETCH_MIN_HAIL = 0.5;          // skip cold-fetch for trace-only days
const PER_FETCH_TIMEOUT_MS = 15_000;      // per-date, so slow ones don't eat budget

// Standard search window — can be overridden per caller.
const DEFAULT_RADIUS_MI = 15;

// Mph threshold for "wind-only" fallback matches the existing hailAtAddress rules.
const MIN_WIND_MPH = 40;

interface CandidateDateRow {
  event_date: Date | string;
  has_swath_cache: boolean;
  point_reports_within_15mi: number;
  max_hail_inches: number | null;
  max_wind_mph: number | null;
  nearest_miles: number | null;
  noaa_confirmed: boolean;
  sources: string[];
  state: string | null;
}

/**
 * Pull every candidate storm_date in the window — either (a) already in
 * mrms_swath_cache with a bbox covering the address point, OR (b) has a
 * verified point report within 15 mi. This is the full universe of dates
 * worth testing for swath-intersection.
 */
async function getCandidateDates(
  pool: pg.Pool,
  lat: number,
  lng: number,
  monthsBack: number,
): Promise<CandidateDateRow[]> {
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
    return rows as CandidateDateRow[];
  } catch (err) {
    console.warn('[AddressImpact] candidate-dates query failed:', (err as Error).message);
    return [];
  }
}

function isoDate(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

/**
 * Query point reports within 2 mi of the address on a given date, used as
 * corroboration for a swath direct-hit (gives Susan "confirmed by N nearby
 * reports" framing).
 */
async function countConfirmingReports(
  pool: pg.Pool,
  lat: number,
  lng: number,
  dateIso: string,
): Promise<{ count: number; noaaConfirmed: boolean; sources: string[] }> {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt,
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
             )) <= 2`,
      [lat, lng, dateIso],
    );
    const row = rows[0] || { cnt: 0, noaa: false, sources: [] };
    return {
      count: Number(row.cnt || 0),
      noaaConfirmed: !!row.noaa,
      sources: Array.isArray(row.sources) ? row.sources : [],
    };
  } catch {
    return { count: 0, noaaConfirmed: false, sources: [] };
  }
}

/**
 * Main entry point — called by Susan bot, /api/hail/search, map UI, etc.
 */
export async function getAddressHailImpact(
  pool: pg.Pool,
  lat: number,
  lng: number,
  monthsBack: number = 24,
): Promise<AddressImpactReport> {
  const started = Date.now();
  const candidates = await getCandidateDates(pool, lat, lng, monthsBack);
  console.log(
    `[AddressImpact] (${lat.toFixed(3)},${lng.toFixed(3)}) ${monthsBack}mo → ${candidates.length} candidate dates (${candidates.filter((c) => c.has_swath_cache).length} cached)`,
  );

  const directHits: AddressImpactTier[] = [];
  const nearMiss: AddressImpactTier[] = [];
  const areaImpact: AddressImpactTier[] = [];

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
      if (aHail !== bHail) return bHail - aHail;
      return isoDate(b.event_date).localeCompare(isoDate(a.event_date));
    });
  const sorted = [...cachedSorted, ...uncachedSorted];

  const timeBudgetExpires = started + COLD_FETCH_TIME_BUDGET_MS;

  for (const c of sorted) {
    const dateIso = isoDate(c.event_date);
    const maxHailForThisDate = Number(c.max_hail_inches || 0);
    let canAttemptSwath = c.has_swath_cache;
    // For uncached: only cold-fetch dates with meaningful hail AND only while
    // within our time budget. Trace days (≤0.5") don't justify ~3-5s latency.
    if (!canAttemptSwath) {
      const budgetRemaining = timeBudgetExpires - Date.now() > 0;
      const hailWorthFetching = maxHailForThisDate >= COLD_FETCH_MIN_HAIL || (c.point_reports_within_15mi || 0) >= 3;
      canAttemptSwath = budgetRemaining && hailWorthFetching;
    }

    let directHit = false;
    let tier: AddressImpactTier | null = null;

    if (canAttemptSwath) {
      try {
        const impactPromise = computeStormImpact(
          {
            date: dateIso,
            points: [{ id: 'addr', lat, lng } as StormImpactPoint],
          },
          pool,
        );
        // Per-fetch timeout so one slow date doesn't eat the whole budget
        const impact = await Promise.race([
          impactPromise,
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error('per-fetch timeout')), PER_FETCH_TIMEOUT_MS),
          ),
        ]);
        if (c.has_swath_cache) swathCacheHits++; else swathColdFetches++;

        const r = impact.results[0];
        if (r && r.directHit && r.maxHailInches !== null) {
          // Corroborating point reports within 2 mi on the same date
          const conf = await countConfirmingReports(pool, lat, lng, dateIso);
          const srcSet = new Set<string>([...(c.sources || []), ...conf.sources]);
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
      } catch (err) {
        if (!c.has_swath_cache) swathColdFetches++;
        console.warn(`[AddressImpact] swath check failed for ${dateIso}: ${(err as Error).message}`);
      }
    } else if (!c.has_swath_cache) {
      swathSkippedDueToCap++;
    }

    // If swath didn't hit (or we skipped it), classify by point-report distance
    if (!directHit) {
      const nearest = c.nearest_miles;
      const maxHail = c.max_hail_inches !== null ? Number(c.max_hail_inches) : null;
      if (nearest === null || nearest === undefined) {
        continue; // no point reports either; skip entirely
      }
      const fallbackTier: AddressImpactTier = {
        date: dateIso,
        maxHailInches: maxHail,
        nearestMiles: Number(nearest),
        confirmingReportCount: Number(c.point_reports_within_15mi || 0),
        noaaConfirmed: !!c.noaa_confirmed,
        sources: Array.isArray(c.sources) ? c.sources : [],
        state: c.state ?? null,
      };
      if (nearest <= 3) nearMiss.push(fallbackTier);
      else if (nearest <= 15) areaImpact.push(fallbackTier);
    }
  }

  // Sort each tier DESC by date, then DESC by size for tie-break
  const sortTier = (a: AddressImpactTier, b: AddressImpactTier) => {
    const dc = b.date.localeCompare(a.date);
    if (dc !== 0) return dc;
    return (b.maxHailInches || 0) - (a.maxHailInches || 0);
  };
  directHits.sort(sortTier);
  nearMiss.sort(sortTier);
  areaImpact.sort(sortTier);

  const elapsed = Date.now() - started;
  console.log(
    `[AddressImpact] done in ${elapsed}ms — direct=${directHits.length} nearMiss=${nearMiss.length} area=${areaImpact.length} ` +
    `(swath cache=${swathCacheHits} cold=${swathColdFetches} skipped=${swathSkippedDueToCap})`,
  );

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
