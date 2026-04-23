/**
 * NWS Active Alerts live ingest.
 *
 * Polls api.weather.gov/alerts every 5 min for active Severe Thunderstorm
 * Warnings and Tornado Warnings in DMV that carry explicit hail tags.
 * Extracts the max-hail-size tag and the polygon centroid → upserts into
 * verified_hail_events with source_nws_alert=TRUE.
 *
 * The NWS API is free, no auth, rate-limited reasonably (~300 req/hr).
 * Fills the "did anyone warn about hail?" signal which HailTrace uses heavily.
 *
 * Feature flag: NWS_ALERTS_LIVE_ENABLED (default: false)
 */
import { Pool } from 'pg';
import { VerifiedEventsService, SourceName } from './verifiedEventsService.js';

const NWS_ACTIVE_URL = 'https://api.weather.gov/alerts/active';

// DMV state codes the alert API uses
const DEFAULT_STATES = ['VA', 'MD', 'PA', 'WV', 'DC', 'DE'];

// Only hail-producing event types. Tornado Warnings often carry a hail tag.
const HAIL_EVENT_TYPES = new Set([
  'Severe Thunderstorm Warning',
  'Tornado Warning',
  'Special Marine Warning', // includes hail reports
]);

interface NwsAlert {
  id: string;
  properties: {
    id: string;
    event: string;
    effective: string;
    expires: string;
    areaDesc: string;
    parameters?: Record<string, string[] | undefined>;
    description?: string;
    headline?: string;
  };
  geometry?: {
    type: string;
    coordinates: number[][][] | number[][] | number[];
  };
}

/** Extract max hail size from the parameters block — "maxHailSize": ["0.75"] */
function extractHailSize(a: NwsAlert): number | null {
  const p = a.properties.parameters || {};
  const raw = p.maxHailSize?.[0] || p.hailSize?.[0];
  if (raw) {
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0 && n < 8) return n;
  }
  // Fall back: scan description/headline for explicit hail size
  const text = (a.properties.description || '') + ' ' + (a.properties.headline || '');
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:inch|")\s*hail/i);
  if (m) {
    const n = parseFloat(m[1]);
    if (!isNaN(n) && n > 0 && n < 8) return n;
  }
  return null;
}

/** Extract max wind gust from params — "maxWindGust": ["60 mph"] */
function extractWindMph(a: NwsAlert): number | null {
  const p = a.properties.parameters || {};
  const raw = p.maxWindGust?.[0] || p.windGust?.[0];
  if (raw) {
    const m = raw.match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 30 && n < 200) return n;
    }
  }
  return null;
}

/** Compute centroid of alert polygon (naive average of outer-ring vertices). */
function polygonCentroid(a: NwsAlert): { lat: number; lng: number } | null {
  const g = a.geometry;
  if (!g) return null;
  try {
    let coords: number[][];
    if (g.type === 'Polygon') coords = (g.coordinates as number[][][])[0];
    else if (g.type === 'MultiPolygon') coords = (g.coordinates as any)[0][0];
    else if (g.type === 'Point') {
      const pt = g.coordinates as number[];
      return { lat: Number(pt[1]), lng: Number(pt[0]) };
    }
    else return null;
    let sLat = 0, sLng = 0, n = 0;
    for (const p of coords) {
      sLng += p[0]; sLat += p[1]; n++;
    }
    if (n === 0) return null;
    return { lat: sLat / n, lng: sLng / n };
  } catch {
    return null;
  }
}

/** Extract state code from areaDesc ("Fairfax, VA; Loudoun, VA" → VA). */
function extractState(a: NwsAlert): string {
  const m = (a.properties.areaDesc || '').match(/,\s*([A-Z]{2})\b/);
  return m ? m[1] : '';
}

export class NwsAlertsLiveService {
  private svc: VerifiedEventsService;
  private enabled: boolean;
  private states: string[];

  constructor(pool: Pool) {
    this.svc = new VerifiedEventsService(pool);
    this.enabled = process.env.NWS_ALERTS_LIVE_ENABLED === 'true';
    this.states = (process.env.NWS_ALERTS_STATES || DEFAULT_STATES.join(','))
      .split(',').map((s) => s.trim());
  }

  /**
   * Poll active warnings. Fetches per state (NWS limits area queries) and
   * merges results. Rate: ~6 req/poll, well under 300/hr budget.
   */
  async ingestActive(): Promise<{ fetched: number; relevant: number; inserted: number; updated: number; errors: number }> {
    if (!this.enabled) {
      console.log('[nws-alerts-live] NWS_ALERTS_LIVE_ENABLED=false — skipping');
      return { fetched: 0, relevant: 0, inserted: 0, updated: 0, errors: 0 };
    }
    let totalFetched = 0, totalRelevant = 0, totalInserted = 0, totalUpdated = 0, totalErrors = 0;

    for (const state of this.states) {
      try {
        const url = `${NWS_ACTIVE_URL}?area=${state}`;
        const resp = await fetch(url, {
          headers: {
            'User-Agent': 'CC21-storm-live/1.0 (contact: ahmed.mahmoud@theroofdocs.com)',
            'Accept': 'application/geo+json',
          },
        });
        if (!resp.ok) {
          totalErrors++;
          console.warn(`[nws-alerts-live] ${state} HTTP ${resp.status}`);
          continue;
        }
        const data: any = await resp.json();
        const alerts: NwsAlert[] = data.features || [];
        totalFetched += alerts.length;

        const relevant = alerts.filter((a) => HAIL_EVENT_TYPES.has(a.properties?.event || ''));
        totalRelevant += relevant.length;

        const batch: any[] = [];
        for (const a of relevant) {
          const centroid = polygonCentroid(a);
          if (!centroid) continue;
          const hail = extractHailSize(a);
          const wind = extractWindMph(a);
          if (hail == null && wind == null) continue;
          const alertState = extractState(a) || state;
          const effective = a.properties.effective || new Date().toISOString();
          batch.push({
            eventDate: effective,
            latitude: centroid.lat,
            longitude: centroid.lng,
            state: alertState,
            hailSizeInches: hail,
            windMph: wind,
            source: 'nws_alert' as SourceName,
            sourcePayload: {
              alert_id: a.id,
              event: a.properties.event,
              effective: a.properties.effective,
              expires: a.properties.expires,
              area_desc: a.properties.areaDesc,
              headline: a.properties.headline,
              ingested_via: 'live-5min',
            },
          });
        }
        if (batch.length > 0) {
          const res = await this.svc.upsertBatch(batch);
          totalInserted += res.inserted;
          totalUpdated += res.updated;
          totalErrors += res.errors.length;
          if (res.inserted > 0) {
            console.log(`[nws-alerts-live] ${state}: +${res.inserted} new, +${res.updated} upd (from ${relevant.length} relevant of ${alerts.length} active)`);
          }
        }
      } catch (err: any) {
        totalErrors++;
        console.warn(`[nws-alerts-live] ${state} error:`, err.message);
      }
      // Be polite — 500ms between state queries keeps us well under NWS limits
      await new Promise((r) => setTimeout(r, 500));
    }

    return {
      fetched: totalFetched,
      relevant: totalRelevant,
      inserted: totalInserted,
      updated: totalUpdated,
      errors: totalErrors,
    };
  }
}
