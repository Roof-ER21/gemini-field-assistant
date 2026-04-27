/**
 * synopticClient.ts — surface-station observations from Synoptic Data API.
 *
 * Data: MADIS-aggregated network of 170k+ stations across 320 networks
 *   (CWOP, NWS METAR, mesonet, etc.). Free public token; 5,000 calls/day;
 *   365-day historical depth on the free tier.
 *
 * Why we use it (vs. paid alternatives):
 *   - Same MADIS-fed data NOAA HRRR/MRMS use, but exposed as a plain REST API
 *     keyed by lat/lng or bbox + time window (no GRIB decoding needed).
 *   - Free public token — no commercial-use TOS landmines (Wunderground PWS
 *     contributor key is non-commercial only and would be a TOS violation
 *     inside Roof-ER's revenue ops).
 *   - Mechanical instrument readings (anemometer + tipping bucket) at fixed
 *     lat/lng — independent of MRMS/NEXRAD radar. Defeats the adjuster
 *     "radar can be wrong" objection: physical sensor at a known address.
 *
 * Token: SYNOPTIC_TOKEN env var (the public token, NOT the master API key).
 *   Master API key (~/.synoptic-token SYNOPTIC_API_KEY) is for minting/rotating
 *   tokens and never goes in code or env.
 *
 * Ported from ~/synoptic-poc/src/synopticClient.ts (validated end-to-end on
 * real DMV data 2026-04-25). Class shape matches sa21's noaaStormService /
 * nwsAlertService style.
 */
const SYNOPTIC_BASE = 'https://api.synopticdata.com/v2';
const REQUESTED_VARS = [
    'wind_speed',
    'wind_gust',
    'precip_accum_one_hour',
    'precip_accum_fifteen_minute',
    'air_temp',
    'weather_summary',
    'weather_cond_code',
];
export class SynopticClient {
    token;
    constructor(token) {
        const t = token ?? process.env.SYNOPTIC_TOKEN;
        if (!t) {
            throw new Error('SYNOPTIC_TOKEN not set in environment');
        }
        this.token = t;
    }
    async fetchTimeseriesByRadius(q) {
        const params = new URLSearchParams({
            token: this.token,
            radius: `${q.lat},${q.lng},${q.radiusMiles}`,
            start: toSynopticUtc(q.startUtc),
            end: toSynopticUtc(q.endUtc),
            vars: REQUESTED_VARS.join(','),
            units: 'english,speed|mph,precip|in',
            obtimezone: 'utc',
        });
        return this.fetchAndParse(params);
    }
    async fetchTimeseriesByBbox(q) {
        const { minLat, minLng, maxLat, maxLng } = q.bbox;
        // Synoptic bbox order: minLon,minLat,maxLon,maxLat (longitude first —
        // unusual, most APIs are lat-first). Don't flip.
        const params = new URLSearchParams({
            token: this.token,
            bbox: `${minLng},${minLat},${maxLng},${maxLat}`,
            start: toSynopticUtc(q.startUtc),
            end: toSynopticUtc(q.endUtc),
            vars: REQUESTED_VARS.join(','),
            units: 'english,speed|mph,precip|in',
            obtimezone: 'utc',
        });
        return this.fetchAndParse(params);
    }
    async fetchAndParse(params) {
        const url = `${SYNOPTIC_BASE}/stations/timeseries?${params.toString()}`;
        const safeUrl = url.replace(this.token, '***');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) {
                const body = await res.text();
                throw new Error(`Synoptic HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)} (url=${safeUrl})`);
            }
            const env = (await res.json());
            const code = env.SUMMARY?.RESPONSE_CODE;
            if (code !== 1) {
                throw new Error(`Synoptic API error code=${code} msg=${env.SUMMARY?.RESPONSE_MESSAGE}`);
            }
            const stations = env.STATION ?? [];
            return stations.map(toGroundStation);
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
function toSynopticUtc(d) {
    const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
    const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = d.getUTCDate().toString().padStart(2, '0');
    const hh = d.getUTCHours().toString().padStart(2, '0');
    const mi = d.getUTCMinutes().toString().padStart(2, '0');
    return `${yyyy}${mm}${dd}${hh}${mi}`;
}
function toGroundStation(s) {
    const obs = s.OBSERVATIONS ?? {};
    const dateTime = obs['date_time'] ?? [];
    const pickArr = (...keys) => {
        for (const k of keys) {
            const v = obs[k];
            if (Array.isArray(v))
                return v;
        }
        return [];
    };
    const windSpeed = pickArr('wind_speed_set_1', 'wind_speed_value_1');
    const windGust = pickArr('wind_gust_set_1', 'wind_gust_value_1');
    const precip1h = pickArr('precip_accum_one_hour_set_1', 'precip_accum_one_hour_value_1');
    const precip15 = pickArr('precip_accum_fifteen_minute_set_1', 'precip_accum_fifteen_minute_value_1');
    const airTemp = pickArr('air_temp_set_1', 'air_temp_value_1');
    const weatherSummary = pickArr('weather_summary_set_1d', 'weather_summary_set_1');
    const weatherCondCode = pickArr('weather_cond_code_set_1d', 'weather_cond_code_set_1');
    const observations = dateTime.map((ts, i) => ({
        timestamp: ts,
        windSpeedMph: numOrNull(windSpeed[i]),
        windGustMph: numOrNull(windGust[i]),
        precipOneHourIn: numOrNull(precip1h[i]),
        precipFifteenMinIn: numOrNull(precip15[i]),
        airTempF: numOrNull(airTemp[i]),
        weatherSummary: strOrNull(weatherSummary[i]),
        weatherCondCode: numOrNull(weatherCondCode[i]),
    }));
    return {
        stationId: s.STID,
        name: s.NAME ?? s.STID,
        network: s.MNET_ID ?? '?',
        latitude: parseFloat(s.LATITUDE ?? 'NaN'),
        longitude: parseFloat(s.LONGITUDE ?? 'NaN'),
        distanceMiles: typeof s.DISTANCE === 'number' ? s.DISTANCE : null,
        observations,
    };
}
function numOrNull(v) {
    if (v === null || v === undefined)
        return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
}
function strOrNull(v) {
    if (v === null || v === undefined)
        return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
}
