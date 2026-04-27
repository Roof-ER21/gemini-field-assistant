/**
 * consilienceService.ts — multi-source corroboration aggregator for a
 * property + storm date. Powers the adjuster PDF v2 "Independent
 * Multi-Source Corroboration" section and the rep dashboard's
 * disagreement-flag display.
 *
 * Returns one ConsilienceReport per (lat, lng, dateIso) describing what
 * each independent measurement modality recorded:
 *
 *   1. MRMS    — radar reflectivity / hail-swath polygon (NOAA)
 *   2. NEXRAD  — raw radar scan corroboration (per-bucket NEXRAD L2)
 *   3. NWS     — forecaster judgment (severe storm / hail warnings)
 *   4. Ground  — federal post-event reports (NCEI SWDI, IEM LSR, NOAA NCEI, SPC WCM)
 *   5. mPING   — citizen visual reports (NOAA-affiliated)
 *   6. Surface — mechanical instrument readings (Synoptic / MADIS)
 *
 * Auto-curate rule (per Ahmed 2026-04-26): if a source has positive signal
 * → include. If silent → omit silently from adjuster PDF. Internal audit
 * trail keeps the full pull regardless.
 *
 * Consilience score = count of agreeing modalities (1-6). Higher = harder
 * to deny because the adjuster is arguing with NOAA + NWS + public stations
 * + citizens + their own agency's after-action database simultaneously.
 */

import type { Pool } from 'pg';
import { trySurfaceCorroboration, type CorroboratedStation } from './synopticObservationsService.js';

export interface ConsilienceSourceFinding<T = unknown> {
  /** Did this source register a positive signal at this property+date? */
  present: boolean;
  /** Human-readable headline for the adjuster PDF row. */
  headline: string | null;
  /** Public source URL the adjuster can verify themselves. */
  sourceUrl: string;
  /** Raw data — saved server-side for audit, not necessarily printed. */
  details: T;
}

export interface MrmsFinding {
  hailInches: number | null;
  swathPolygonHit: boolean;
  nearestPolygonMiles: number | null;
  scanTimeUtc: string | null;
}

export interface NexradFinding {
  scans: number;
  maxHailInches: number | null;
  radarSites: string[];
}

export interface NwsFinding {
  warningCount: number;
  warningTypes: string[];
  warningStartEt: string | null;
  warningEndEt: string | null;
}

export interface GroundFinding {
  reportCount: number;
  maxHailInches: number | null;
  nearestMiles: number | null;
  sources: string[]; // ['ncei_swdi', 'iem_lsr', 'noaa_ncei', 'spc_wcm']
}

export interface MpingFinding {
  reportCount: number;
  nearestMiles: number | null;
  sizeCategoriesReported: string[];
}

export interface SurfaceFinding {
  stationsQueried: number;
  stationsWithHailSignal: number;
  stationsWithSevereWind: number;
  topStations: Array<{
    stationId: string;
    name: string;
    network: string;
    distanceMiles: number | null;
    peakGustMph: number | null;
    peak1hPrecipIn: number | null;
    weatherCondCodes: number[];
    weatherKeywords: string[];
  }>;
}

export interface ConsilienceReport {
  property: { lat: number; lng: number };
  dateIso: string;
  consilienceScore: number;       // 0-6, count of modalities with positive signal
  sourcesAgreeing: number[];      // [1,2,3] if mrms+nexrad+nws fired
  mrms:    ConsilienceSourceFinding<MrmsFinding>;
  nexrad:  ConsilienceSourceFinding<NexradFinding>;
  nws:     ConsilienceSourceFinding<NwsFinding>;
  ground:  ConsilienceSourceFinding<GroundFinding>;
  mping:   ConsilienceSourceFinding<MpingFinding>;
  surface: ConsilienceSourceFinding<SurfaceFinding>;
  auditTrail: {
    fetchedAt: string;
    surfaceAvailable: boolean;
    surfaceSkipReason: string | null;
  };
}

const NOAA_SWDI_BASE = 'https://www.ncdc.noaa.gov/swdiws/';
const NOAA_STORM_EVENTS_BASE = 'https://www.ncdc.noaa.gov/stormevents/';
const NWS_API_BASE = 'https://api.weather.gov/alerts/';
const MPING_BASE = 'https://mping.ou.edu/';
const SYNOPTIC_VERIFY_BASE = 'https://api.synopticdata.com/v2/stations/timeseries';
const MRMS_NCEP_BASE = 'https://mrms.ncep.noaa.gov/data/';

export interface BuildConsilienceInput {
  lat: number;
  lng: number;
  dateIso: string;
  /** Radius for surface obs query (default 10 miles). */
  surfaceRadiusMiles?: number;
}

export async function buildConsilience(
  pool: Pool,
  input: BuildConsilienceInput,
): Promise<ConsilienceReport> {
  const { lat, lng, dateIso } = input;

  // Run DB queries in parallel; surface obs is a remote API call so kick
  // it off concurrently. Each modality fails closed: missing data → silent
  // omission (present=false), never throws past this layer.
  const [dbResult, surfaceResult] = await Promise.allSettled([
    queryDatabase(pool, lat, lng, dateIso),
    trySurfaceCorroboration({
      lat,
      lng,
      dateIso,
      radiusMiles: input.surfaceRadiusMiles ?? 10,
    }),
  ]);

  const db = dbResult.status === 'fulfilled' ? dbResult.value : emptyDbResult();
  const mrms = buildMrmsFinding(db, lat, lng, dateIso);
  const nexrad = buildNexradFinding(db, dateIso);
  const nws = buildNwsFinding(db, dateIso);
  const ground = buildGroundFinding(db, dateIso);
  const mping = buildMpingFinding(db, dateIso);

  const surfaceAvailable =
    surfaceResult.status === 'fulfilled' && surfaceResult.value.available;
  let surfaceSkipReason: string | null = null;
  if (surfaceResult.status === 'fulfilled') {
    const v = surfaceResult.value;
    if (v.available === false) {
      surfaceSkipReason = v.reason;
    }
  } else if (surfaceResult.status === 'rejected') {
    surfaceSkipReason = (surfaceResult.reason as Error)?.message || 'rejected';
  }

  const surface = buildSurfaceFinding(
    surfaceResult.status === 'fulfilled' && surfaceResult.value.available
      ? surfaceResult.value.topStations
      : [],
    surfaceResult.status === 'fulfilled' && surfaceResult.value.available
      ? surfaceResult.value.result.stationsTotal
      : 0,
    surfaceResult.status === 'fulfilled' && surfaceResult.value.available
      ? surfaceResult.value.result.stationsWithHailSignal
      : 0,
    surfaceResult.status === 'fulfilled' && surfaceResult.value.available
      ? surfaceResult.value.result.stationsWithSevereWindSignal
      : 0,
    lat,
    lng,
    dateIso,
  );

  const sourcesAgreeing: number[] = [];
  if (mrms.present)    sourcesAgreeing.push(1);
  if (nexrad.present)  sourcesAgreeing.push(2);
  if (nws.present)     sourcesAgreeing.push(3);
  if (ground.present)  sourcesAgreeing.push(4);
  if (mping.present)   sourcesAgreeing.push(5);
  if (surface.present) sourcesAgreeing.push(6);

  return {
    property: { lat, lng },
    dateIso,
    consilienceScore: sourcesAgreeing.length,
    sourcesAgreeing,
    mrms,
    nexrad,
    nws,
    ground,
    mping,
    surface,
    auditTrail: {
      fetchedAt: new Date().toISOString(),
      surfaceAvailable,
      surfaceSkipReason,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Database side — single round-trip for every source we have locally.
// ──────────────────────────────────────────────────────────────────────────

interface DbResult {
  // From verified_hail_events_public_sane within 5 mi (banded for the row-
  // level findings — mrms/ncei/mping etc each get their own slice)
  pointReports: Array<{
    latitude: number;
    longitude: number;
    distance_mi: number;
    hail_size_inches: number | null;
    wind_mph: number | null;
    sources: {
      mrms: boolean;
      nexrad_l2: boolean;
      noaa_ncei: boolean;
      ncei_swdi: boolean;
      iem_lsr: boolean;
      iem_vtec: boolean;
      nws_alert: boolean;
      cocorahs: boolean;
      mping: boolean;
      synoptic: boolean;
      spc_wcm: boolean;
      hailtrace: boolean;
      ihm: boolean;
    };
    source_details: Record<string, unknown> | null;
  }>;
  // From mrms_swath_cache for the date
  swathPolygon: {
    hits: number;
    maxMeshInches: number | null;
    nearestMiles: number | null;
  };
}

async function queryDatabase(
  pool: Pool,
  lat: number,
  lng: number,
  dateIso: string,
): Promise<DbResult> {
  const [pointResult, swathResult] = await Promise.all([
    pool.query(
      `SELECT
         latitude::float AS latitude,
         longitude::float AS longitude,
         (3959 * acos(
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
         ))::float AS distance_mi,
         hail_size_inches::float AS hail_size_inches,
         wind_mph,
         source_mrms, source_nexrad_l2, source_noaa_ncei, source_ncei_swdi,
         source_iem_lsr, source_iem_vtec, source_nws_alert, source_cocorahs,
         source_mping, source_synoptic, source_spc_wcm, source_hailtrace,
         source_ihm,
         source_details
       FROM verified_hail_events_public_sane
       WHERE event_date = $3::date
         AND (3959 * acos(
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
         )) <= 10
       ORDER BY distance_mi ASC
       LIMIT 200`,
      [lat, lng, dateIso],
    ),
    pool.query(
      `SELECT
         max_mesh_inches::float AS max_mesh_inches,
         hail_cells,
         north, south, east, west
       FROM mrms_swath_cache
       WHERE storm_date = $1::date
         AND north >= $2 AND south <= $2
         AND east  >= $3 AND west  <= $3
         AND hail_cells > 0
       ORDER BY hail_cells DESC
       LIMIT 5`,
      [dateIso, lat, lng],
    ),
  ]);

  const pointReports = pointResult.rows.map((r: any) => ({
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    distance_mi: Number(r.distance_mi),
    hail_size_inches: r.hail_size_inches !== null ? Number(r.hail_size_inches) : null,
    wind_mph: r.wind_mph !== null ? Number(r.wind_mph) : null,
    sources: {
      mrms: !!r.source_mrms,
      nexrad_l2: !!r.source_nexrad_l2,
      noaa_ncei: !!r.source_noaa_ncei,
      ncei_swdi: !!r.source_ncei_swdi,
      iem_lsr: !!r.source_iem_lsr,
      iem_vtec: !!r.source_iem_vtec,
      nws_alert: !!r.source_nws_alert,
      cocorahs: !!r.source_cocorahs,
      mping: !!r.source_mping,
      synoptic: !!r.source_synoptic,
      spc_wcm: !!r.source_spc_wcm,
      hailtrace: !!r.source_hailtrace,
      ihm: !!r.source_ihm,
    },
    source_details: r.source_details ?? null,
  }));

  const swathHits = swathResult.rows.length;
  const swathMax = swathResult.rows.reduce(
    (m: number, r: any) =>
      r.max_mesh_inches !== null && Number(r.max_mesh_inches) > m
        ? Number(r.max_mesh_inches)
        : m,
    0,
  );

  return {
    pointReports,
    swathPolygon: {
      hits: swathHits,
      maxMeshInches: swathHits > 0 ? swathMax : null,
      nearestMiles: null, // computed inside MRMS finding from polygon edge if needed
    },
  };
}

function emptyDbResult(): DbResult {
  return {
    pointReports: [],
    swathPolygon: { hits: 0, maxMeshInches: null, nearestMiles: null },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Source-specific finding builders
// ──────────────────────────────────────────────────────────────────────────

function buildMrmsFinding(
  db: DbResult,
  lat: number,
  lng: number,
  dateIso: string,
): ConsilienceSourceFinding<MrmsFinding> {
  const swathHit = db.swathPolygon.hits > 0;
  const mrmsRows = db.pointReports.filter((r) => r.sources.mrms);
  const closestMrms = mrmsRows.length > 0
    ? Math.min(...mrmsRows.map((r) => r.distance_mi))
    : null;

  // Prefer the per-row hail size from verified_hail_events_public_sane —
  // it's already capped at 8" by the view's sanity filter. Fall back to
  // mrms_swath_cache.max_mesh only when no MRMS-tagged rows exist within
  // 10mi (rare). Cache values can be bogus from old unit-mismatched
  // ingests; clamp to 8" defensively to match the rest of the pipeline.
  const rowMaxHail = mrmsRows.length > 0
    ? mrmsRows.reduce((m, r) => Math.max(m, r.hail_size_inches ?? 0), 0)
    : null;
  let maxHail: number | null;
  if (rowMaxHail !== null && rowMaxHail > 0) {
    maxHail = rowMaxHail;
  } else if (db.swathPolygon.maxMeshInches !== null && db.swathPolygon.maxMeshInches > 0) {
    maxHail = Math.min(db.swathPolygon.maxMeshInches, 8.0);
  } else {
    maxHail = null;
  }

  const present = swathHit || mrmsRows.length > 0;
  const headline = !present
    ? null
    : swathHit
    ? `MRMS swath polygon present at property — peak hail ${maxHail?.toFixed(2) ?? '?'}"`
    : `MRMS hail at ${closestMrms?.toFixed(2) ?? '?'} mi — ${maxHail?.toFixed(2) ?? '?'}"`;

  return {
    present,
    headline,
    sourceUrl: `${MRMS_NCEP_BASE}`,
    details: {
      hailInches: maxHail,
      swathPolygonHit: swathHit,
      nearestPolygonMiles: closestMrms,
      scanTimeUtc: null,
    },
  };
}

function buildNexradFinding(
  db: DbResult,
  _dateIso: string,
): ConsilienceSourceFinding<NexradFinding> {
  const nexradRows = db.pointReports.filter((r) => r.sources.nexrad_l2);
  const present = nexradRows.length > 0;
  const radarSites = new Set<string>();
  let maxHail = 0;
  for (const r of nexradRows) {
    const details = r.source_details as Record<string, any> | null;
    const rs = details?.nexrad_l2?.radar_site;
    if (typeof rs === 'string') radarSites.add(rs);
    if (r.hail_size_inches !== null) maxHail = Math.max(maxHail, r.hail_size_inches);
  }
  const headline = present
    ? `NEXRAD L2: ${nexradRows.length} hail-flagged scans, peak ${maxHail.toFixed(2)}"`
    : null;
  return {
    present,
    headline,
    sourceUrl: 'https://www.ncei.noaa.gov/products/radar/next-generation-weather-radar',
    details: {
      scans: nexradRows.length,
      maxHailInches: present ? maxHail : null,
      radarSites: [...radarSites],
    },
  };
}

function buildNwsFinding(
  db: DbResult,
  dateIso: string,
): ConsilienceSourceFinding<NwsFinding> {
  const nwsRows = db.pointReports.filter(
    (r) => r.sources.nws_alert || r.sources.iem_vtec,
  );
  const present = nwsRows.length > 0;
  const types = new Set<string>();
  for (const r of nwsRows) {
    const details = r.source_details as Record<string, any> | null;
    const t = details?.nws_alert?.event || details?.iem_vtec?.phenomena;
    if (typeof t === 'string') types.add(t);
  }
  const headline = present
    ? `NWS warnings active: ${[...types].join(', ') || 'severe weather warning'}`
    : null;
  return {
    present,
    headline,
    sourceUrl: `${NWS_API_BASE}?date=${dateIso}`,
    details: {
      warningCount: nwsRows.length,
      warningTypes: [...types],
      warningStartEt: null,
      warningEndEt: null,
    },
  };
}

function buildGroundFinding(
  db: DbResult,
  dateIso: string,
): ConsilienceSourceFinding<GroundFinding> {
  const groundRows = db.pointReports.filter(
    (r) =>
      r.sources.noaa_ncei ||
      r.sources.ncei_swdi ||
      r.sources.iem_lsr ||
      r.sources.spc_wcm ||
      r.sources.cocorahs,
  );
  const present = groundRows.length > 0;
  const sourcesPresent = new Set<string>();
  let maxHail = 0;
  let nearestMi = Number.POSITIVE_INFINITY;
  for (const r of groundRows) {
    if (r.sources.noaa_ncei) sourcesPresent.add('noaa_ncei');
    if (r.sources.ncei_swdi) sourcesPresent.add('ncei_swdi');
    if (r.sources.iem_lsr) sourcesPresent.add('iem_lsr');
    if (r.sources.spc_wcm) sourcesPresent.add('spc_wcm');
    if (r.sources.cocorahs) sourcesPresent.add('cocorahs');
    if (r.hail_size_inches !== null) maxHail = Math.max(maxHail, r.hail_size_inches);
    nearestMi = Math.min(nearestMi, r.distance_mi);
  }
  const headline = present
    ? `${groundRows.length} federal ground report${groundRows.length === 1 ? '' : 's'}, peak ${maxHail.toFixed(2)}" at ${nearestMi.toFixed(1)} mi`
    : null;
  return {
    present,
    headline,
    sourceUrl: `${NOAA_STORM_EVENTS_BASE}choosedates.jsp?statefips=51%2CVIRGINIA&beginDate_mm=${dateIso.slice(5, 7)}&beginDate_dd=${dateIso.slice(8, 10)}&beginDate_yyyy=${dateIso.slice(0, 4)}`,
    details: {
      reportCount: groundRows.length,
      maxHailInches: present ? maxHail : null,
      nearestMiles: present ? nearestMi : null,
      sources: [...sourcesPresent].sort(),
    },
  };
}

function buildMpingFinding(
  db: DbResult,
  _dateIso: string,
): ConsilienceSourceFinding<MpingFinding> {
  const mpingRows = db.pointReports.filter((r) => r.sources.mping);
  const present = mpingRows.length > 0;
  const sizes = new Set<string>();
  let nearestMi = Number.POSITIVE_INFINITY;
  for (const r of mpingRows) {
    nearestMi = Math.min(nearestMi, r.distance_mi);
    const details = r.source_details as Record<string, any> | null;
    const sz = details?.mping?.size_category;
    if (typeof sz === 'string') sizes.add(sz);
  }
  const headline = present
    ? `${mpingRows.length} citizen mPING report${mpingRows.length === 1 ? '' : 's'} within ${nearestMi.toFixed(1)} mi`
    : null;
  return {
    present,
    headline,
    sourceUrl: `${MPING_BASE}data/`,
    details: {
      reportCount: mpingRows.length,
      nearestMiles: present ? nearestMi : null,
      sizeCategoriesReported: [...sizes],
    },
  };
}

function buildSurfaceFinding(
  topStations: CorroboratedStation[],
  total: number,
  withHail: number,
  withSevereWind: number,
  lat: number,
  lng: number,
  dateIso: string,
): ConsilienceSourceFinding<SurfaceFinding> {
  const present = withHail > 0 || withSevereWind > 0;
  const headline = !present
    ? null
    : withHail > 0
    ? `${withHail} of ${total} surface stations corroborate hail/severe storm`
    : `${withSevereWind} of ${total} surface stations report severe wind/precip`;

  return {
    present,
    headline,
    sourceUrl: `${SYNOPTIC_VERIFY_BASE}?radius=${lat},${lng},10&start=${dateIso.replace(/-/g, '')}0000&end=${dateIso.replace(/-/g, '')}2359`,
    details: {
      stationsQueried: total,
      stationsWithHailSignal: withHail,
      stationsWithSevereWind: withSevereWind,
      topStations: topStations.map((s) => ({
        stationId: s.stationId,
        name: s.name,
        network: s.network,
        distanceMiles: s.distanceMiles,
        peakGustMph: s.signal.peakGustMph,
        peak1hPrecipIn: s.signal.peakPrecipOneHourIn,
        weatherCondCodes: s.signal.hailCondCodeHits,
        weatherKeywords: s.signal.hailKeywordHits,
      })),
    },
  };
}
