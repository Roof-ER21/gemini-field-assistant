/**
 * HailTrace Cross-Validation Service
 *
 * Overlays HailTrace's meteorologist-confirmed hail-size points on top of
 * our automated MRMS radar polygons and flags any disagreement. Gives
 * reps (and adjusters) a trust signal: if our algorithm agrees with
 * HailTrace's $600/yr meteorologists, the swath is solid; if we disagree
 * by more than ±0.5", flag it so the rep knows to double-check.
 *
 * Data sources:
 *   hailtrace_events  — imported HailTrace JSON exports (meteorologist-graded)
 *   MRMS vector swath — our automated 10-band polygons
 *
 * This turns Roof-ER's existing HailTrace subscription data into continuous
 * QA for our automated pipeline — for free.
 */

import type { Pool } from 'pg';
import { getHistoricalMrmsSwathPolygons } from './historicalMrmsService.js';
import { computeStormImpact } from './stormImpactService.js';

export interface HailtracePoint {
  /** HailTrace event id (original) */
  eventId: string;
  lat: number;
  lng: number;
  /** Meteorologist-confirmed size (preferred) or null if not graded */
  meteoSizeInches: number | null;
  /** Algorithm-only size (less trusted) */
  algorithmSizeInches: number | null;
  /** Best size available (meteo if present, else algorithm) */
  sizeInches: number;
  types: string[];
  windSpeed: number | null;
  windStarLevel: number | null;
}

export interface HailtraceValidation {
  eventId: string;
  lat: number;
  lng: number;
  hailtraceSizeInches: number;
  mrmsSizeInches: number | null;
  mrmsLabel: string | null;
  mrmsColor: string | null;
  difference: number | null;
  agreement: 'match' | 'close' | 'diverge' | 'mrms_miss' | 'hailtrace_only';
  hasMeteorologist: boolean;
  windSpeed: number | null;
  windStarLevel: number | null;
}

export interface HailtraceValidationSummary {
  date: string;
  bounds: { north: number; south: number; east: number; west: number };
  totals: {
    hailtracePoints: number;
    mrmsFeatures: number;
    match: number;
    close: number;
    diverge: number;
    mrmsMiss: number;
    hailtraceOnly: number;
  };
  avgDifference: number | null;
  maxDifference: number | null;
  mrmsPeakInches: number;
  hailtracePeakInches: number;
  points: HailtraceValidation[];
}

/**
 * Classify agreement. ±0.25" is a match (within a single band width),
 * ±0.5" is close, beyond that is a divergence worth flagging.
 */
function classifyAgreement(
  hailtraceSize: number,
  mrmsSize: number | null,
): HailtraceValidation['agreement'] {
  if (mrmsSize === null) return 'mrms_miss';
  const diff = Math.abs(hailtraceSize - mrmsSize);
  if (diff <= 0.25) return 'match';
  if (diff <= 0.5) return 'close';
  return 'diverge';
}

export async function crossValidateHailtrace(
  params: {
    date: string;
    north: number;
    south: number;
    east: number;
    west: number;
    anchorTimestamp?: string | null;
  },
  pool: Pool,
): Promise<HailtraceValidationSummary> {
  // 1. Pull HailTrace points for this date + bounding box.
  //    Filter to HailSize reports only (`hail_size > 0`) — the live API mixes
  //    WindSpeed and Tornado reports into `weatherReports[]`, and comparing
  //    wind mph to MRMS hail-inch polygons produces meaningless
  //    `mrms_miss` noise on the overlay. Wind events have their own overlay
  //    path; this endpoint is specifically for hail cross-validation.
  const { rows } = await pool.query<{
    event_id: string;
    latitude: string;
    longitude: string;
    hail_size: string | null;
    hail_size_algorithm: string | null;
    hail_size_meteo: string | null;
    types: string[];
    wind_speed: number | null;
    wind_star_level: number | null;
  }>(
    `SELECT event_id, latitude, longitude, hail_size, hail_size_algorithm,
            hail_size_meteo, types, wind_speed, wind_star_level
       FROM hailtrace_events
      WHERE deleted_at IS NULL
        AND event_date = $1
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND latitude BETWEEN $2 AND $3
        AND longitude BETWEEN $4 AND $5
        AND hail_size IS NOT NULL
        AND hail_size > 0
      ORDER BY hail_size DESC NULLS LAST`,
    [params.date, params.south, params.north, params.west, params.east],
  );

  const hailtracePoints: HailtracePoint[] = rows.map((r) => {
    const meteo = r.hail_size_meteo !== null ? Number(r.hail_size_meteo) : null;
    const algo = r.hail_size_algorithm !== null ? Number(r.hail_size_algorithm) : null;
    const primary = r.hail_size !== null ? Number(r.hail_size) : null;
    const sizeInches = meteo ?? primary ?? algo ?? 0;
    return {
      eventId: r.event_id,
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      meteoSizeInches: meteo,
      algorithmSizeInches: algo,
      sizeInches,
      types: Array.isArray(r.types) ? r.types : [],
      windSpeed: r.wind_speed,
      windStarLevel: r.wind_star_level,
    };
  });

  // 2. Fetch MRMS polygons for the same date + bounds.
  const mrmsCollection = await getHistoricalMrmsSwathPolygons(
    {
      date: params.date,
      north: params.north,
      south: params.south,
      east: params.east,
      west: params.west,
      anchorTimestamp: params.anchorTimestamp ?? null,
    },
    pool,
  );

  // 3. Short-circuit if nothing to validate.
  if (hailtracePoints.length === 0) {
    return {
      date: params.date,
      bounds: {
        north: params.north,
        south: params.south,
        east: params.east,
        west: params.west,
      },
      totals: {
        hailtracePoints: 0,
        mrmsFeatures: mrmsCollection.features.length,
        match: 0,
        close: 0,
        diverge: 0,
        mrmsMiss: 0,
        hailtraceOnly: 0,
      },
      avgDifference: null,
      maxDifference: null,
      mrmsPeakInches: mrmsCollection.metadata.maxMeshInches,
      hailtracePeakInches: 0,
      points: [],
    };
  }

  // 4. Run the same point-in-polygon logic the storm-impact endpoint uses.
  const impactResult = await computeStormImpact(
    {
      date: params.date,
      anchorTimestamp: params.anchorTimestamp ?? null,
      points: hailtracePoints.map((p) => ({
        id: p.eventId,
        lat: p.lat,
        lng: p.lng,
      })),
      bounds: {
        north: params.north,
        south: params.south,
        east: params.east,
        west: params.west,
      },
    },
    pool,
  );

  const impactById = new Map(impactResult.results.map((r) => [r.id, r]));

  // 5. Merge and classify.
  const diffs: number[] = [];
  let match = 0, close = 0, diverge = 0, mrmsMiss = 0, hailtraceOnly = 0;

  const validations: HailtraceValidation[] = hailtracePoints.map((p) => {
    const mrmsHit = impactById.get(p.eventId);
    const mrmsSize = mrmsHit?.maxHailInches ?? null;
    const agreement = classifyAgreement(p.sizeInches, mrmsSize);
    const diff = mrmsSize !== null ? Math.abs(p.sizeInches - mrmsSize) : null;
    if (diff !== null) diffs.push(diff);

    switch (agreement) {
      case 'match': match++; break;
      case 'close': close++; break;
      case 'diverge': diverge++; break;
      case 'mrms_miss': mrmsMiss++; break;
    }

    return {
      eventId: p.eventId,
      lat: p.lat,
      lng: p.lng,
      hailtraceSizeInches: p.sizeInches,
      mrmsSizeInches: mrmsSize,
      mrmsLabel: mrmsHit?.label ?? null,
      mrmsColor: mrmsHit?.color ?? null,
      difference: diff,
      agreement,
      hasMeteorologist: p.meteoSizeInches !== null,
      windSpeed: p.windSpeed,
      windStarLevel: p.windStarLevel,
    };
  });

  // Sort largest disagreement first — that's the rep's "check me" list.
  validations.sort((a, b) => (b.difference ?? -1) - (a.difference ?? -1));

  const avgDifference = diffs.length > 0
    ? diffs.reduce((s, d) => s + d, 0) / diffs.length
    : null;
  const maxDifference = diffs.length > 0 ? Math.max(...diffs) : null;
  const hailtracePeakInches = hailtracePoints.reduce(
    (m, p) => Math.max(m, p.sizeInches),
    0,
  );

  return {
    date: params.date,
    bounds: {
      north: params.north,
      south: params.south,
      east: params.east,
      west: params.west,
    },
    totals: {
      hailtracePoints: hailtracePoints.length,
      mrmsFeatures: mrmsCollection.features.length,
      match,
      close,
      diverge,
      mrmsMiss,
      hailtraceOnly,
    },
    avgDifference,
    maxDifference,
    mrmsPeakInches: mrmsCollection.metadata.maxMeshInches,
    hailtracePeakInches,
    points: validations,
  };
}
