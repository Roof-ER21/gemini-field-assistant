/**
 * synopticObservationsService.ts — corroborate a property+date with surface
 * observations from Synoptic Data (MADIS-aggregated stations).
 *
 * Returns per-station hail/severe-wind signals for adjuster PDFs and rep
 * dashboards. Used by consilienceService as the surface-truth modality.
 */

import {
  SynopticClient,
  type GroundStation,
  type ObservationPoint,
} from './synopticClient.js';

export interface SignalThresholds {
  severeGustMph: number;
  heavyPrecipOneHourIn: number;
  burstPrecipFifteenMinIn: number;
}

export const DEFAULT_THRESHOLDS: SignalThresholds = {
  severeGustMph: 40,
  heavyPrecipOneHourIn: 0.5,
  burstPrecipFifteenMinIn: 0.25,
};

// METAR/SYNOP codes that indicate hail-bearing convective storms.
// 87/88 = shower of small hail; 89/90 = shower of moderate-large hail;
// 92-96 = thunderstorm with hail; 99 = severe thunderstorm with hail.
const HAIL_COND_CODES = new Set([87, 88, 89, 90, 92, 93, 94, 96, 99]);

const HAIL_KEYWORDS = [
  'hail',
  'thunderstorm',
  'tstm',
  'ts ',
  'gr',
  'gs ',
  'small hail',
  'ice pellets',
];

export interface HailSignal {
  hailReported: boolean;
  reasons: string[];
  peakGustMph: number | null;
  peakPrecipOneHourIn: number | null;
  peakPrecipFifteenMinIn: number | null;
  hailKeywordHits: string[];
  hailCondCodeHits: number[];
}

export interface CorroboratedStation extends GroundStation {
  signal: HailSignal;
}

export interface CorroborateInput {
  lat: number;
  lng: number;
  radiusMiles: number;
  startUtc: Date;
  endUtc: Date;
  thresholds?: Partial<SignalThresholds>;
  client?: SynopticClient;
}

export interface CorroborateResult {
  query: {
    lat: number;
    lng: number;
    radiusMiles: number;
    startUtc: string;
    endUtc: string;
  };
  stationsTotal: number;
  stationsWithHailSignal: number;
  stationsWithSevereWindSignal: number;
  stations: CorroboratedStation[];
  fetchedAt: string;
}

export async function corroborateProperty(
  input: CorroborateInput,
): Promise<CorroborateResult> {
  const client = input.client ?? new SynopticClient();
  const thresholds: SignalThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };

  const stations = await client.fetchTimeseriesByRadius({
    lat: input.lat,
    lng: input.lng,
    radiusMiles: input.radiusMiles,
    startUtc: input.startUtc,
    endUtc: input.endUtc,
  });

  const corroborated: CorroboratedStation[] = stations.map((s) => ({
    ...s,
    signal: detectHailSignal(s.observations, thresholds),
  }));

  return {
    query: {
      lat: input.lat,
      lng: input.lng,
      radiusMiles: input.radiusMiles,
      startUtc: input.startUtc.toISOString(),
      endUtc: input.endUtc.toISOString(),
    },
    stationsTotal: corroborated.length,
    stationsWithHailSignal: corroborated.filter((s) => s.signal.hailReported).length,
    stationsWithSevereWindSignal: corroborated.filter(
      (s) => s.signal.peakGustMph !== null && s.signal.peakGustMph >= thresholds.severeGustMph,
    ).length,
    stations: corroborated,
    fetchedAt: new Date().toISOString(),
  };
}

export function detectHailSignal(
  obs: ObservationPoint[],
  th: SignalThresholds,
): HailSignal {
  const reasons: string[] = [];
  const hailKeywordHits = new Set<string>();
  const hailCondCodeHits = new Set<number>();

  let peakGust: number | null = null;
  let peakPrecip1h: number | null = null;
  let peakPrecip15: number | null = null;

  for (const o of obs) {
    if (o.windGustMph !== null && (peakGust === null || o.windGustMph > peakGust)) {
      peakGust = o.windGustMph;
    }
    if (o.precipOneHourIn !== null && (peakPrecip1h === null || o.precipOneHourIn > peakPrecip1h)) {
      peakPrecip1h = o.precipOneHourIn;
    }
    if (
      o.precipFifteenMinIn !== null &&
      (peakPrecip15 === null || o.precipFifteenMinIn > peakPrecip15)
    ) {
      peakPrecip15 = o.precipFifteenMinIn;
    }
    if (o.weatherCondCode !== null && HAIL_COND_CODES.has(o.weatherCondCode)) {
      hailCondCodeHits.add(o.weatherCondCode);
    }
    if (o.weatherSummary) {
      const lower = o.weatherSummary.toLowerCase();
      for (const kw of HAIL_KEYWORDS) {
        if (lower.includes(kw)) hailKeywordHits.add(kw);
      }
    }
  }

  if (hailKeywordHits.has('hail') || hailKeywordHits.has('gr')) {
    reasons.push(`weather text reported hail keyword(s): ${[...hailKeywordHits].join(',')}`);
  }
  if (hailCondCodeHits.size > 0) {
    reasons.push(`hail-bearing storm codes: ${[...hailCondCodeHits].join(',')}`);
  }
  if (peakGust !== null && peakGust >= th.severeGustMph) {
    reasons.push(`severe wind gust ${peakGust} mph >= ${th.severeGustMph}`);
  }
  if (peakPrecip1h !== null && peakPrecip1h >= th.heavyPrecipOneHourIn) {
    reasons.push(
      `heavy 1h precip ${peakPrecip1h.toFixed(2)}" >= ${th.heavyPrecipOneHourIn}"`,
    );
  }
  if (peakPrecip15 !== null && peakPrecip15 >= th.burstPrecipFifteenMinIn) {
    reasons.push(
      `15-min burst ${peakPrecip15.toFixed(2)}" >= ${th.burstPrecipFifteenMinIn}"`,
    );
  }

  const explicitHail =
    hailKeywordHits.has('hail') ||
    hailKeywordHits.has('gr') ||
    hailCondCodeHits.size > 0;
  const convective =
    peakGust !== null &&
    peakGust >= th.severeGustMph &&
    ((peakPrecip1h ?? 0) >= th.heavyPrecipOneHourIn ||
      (peakPrecip15 ?? 0) >= th.burstPrecipFifteenMinIn);

  return {
    hailReported: explicitHail || convective,
    reasons,
    peakGustMph: peakGust,
    peakPrecipOneHourIn: peakPrecip1h,
    peakPrecipFifteenMinIn: peakPrecip15,
    hailKeywordHits: [...hailKeywordHits],
    hailCondCodeHits: [...hailCondCodeHits],
  };
}

/**
 * Wrapper for the consilience service: returns true/false + summary if
 * surface obs corroborate hail at this property+date. Auto-handles the
 * "no SYNOPTIC_TOKEN" case (returns null, never throws — silent omission
 * from PDF is correct behavior).
 */
export async function trySurfaceCorroboration(input: {
  lat: number;
  lng: number;
  dateIso: string;
  radiusMiles?: number;
  windowHoursBefore?: number;
  windowHoursAfter?: number;
}): Promise<{
  available: false;
  reason: string;
} | {
  available: true;
  result: CorroborateResult;
  surfaceCorroboratesHail: boolean;
  topStations: CorroboratedStation[];
}> {
  if (!process.env.SYNOPTIC_TOKEN) {
    return { available: false, reason: 'SYNOPTIC_TOKEN not configured' };
  }
  try {
    // Storm windows are in ET; observations are UTC. Generous before/after
    // padding catches early-morning and late-evening storms. 365-day max
    // historical depth on the free Synoptic tier — older queries 403.
    const dateMidnightEt = new Date(`${input.dateIso}T00:00:00-04:00`);
    const startUtc = new Date(
      dateMidnightEt.getTime() - (input.windowHoursBefore ?? 0) * 3600 * 1000,
    );
    const endUtc = new Date(
      dateMidnightEt.getTime() + (24 + (input.windowHoursAfter ?? 0)) * 3600 * 1000,
    );
    const radius = input.radiusMiles ?? 10;

    const result = await corroborateProperty({
      lat: input.lat,
      lng: input.lng,
      radiusMiles: radius,
      startUtc,
      endUtc,
    });

    // Top-N stations to surface in PDF — those with hail signal first,
    // then severe-wind, sorted by distance ascending. Cap at 5 for layout.
    const ranked = [...result.stations]
      .filter((s) => s.signal.hailReported || (s.signal.peakGustMph ?? 0) >= 40)
      .sort((a, b) => {
        const aHasHail = a.signal.hailReported ? 0 : 1;
        const bHasHail = b.signal.hailReported ? 0 : 1;
        if (aHasHail !== bHasHail) return aHasHail - bHasHail;
        const da = a.distanceMiles ?? Number.POSITIVE_INFINITY;
        const db = b.distanceMiles ?? Number.POSITIVE_INFINITY;
        return da - db;
      })
      .slice(0, 5);

    return {
      available: true,
      result,
      surfaceCorroboratesHail: result.stationsWithHailSignal > 0,
      topStations: ranked,
    };
  } catch (err) {
    return {
      available: false,
      reason: (err as Error).message || 'unknown synoptic error',
    };
  }
}
