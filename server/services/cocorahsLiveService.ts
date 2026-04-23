/**
 * CoCoRaHS live ingest — daily pull of yesterday's hail reports
 *
 * Runs daily at 8am ET. Fetches CoCoRaHS hail reports for VA/MD/PA
 * (plus neighbors if configured) for the previous 3 days (observers file up to 72h late).
 * Upserts to verified_hail_events via VerifiedEventsService.
 *
 * Feature flag: COCORAHS_LIVE_ENABLED (default: false)
 */

import { Pool } from 'pg';
import { VerifiedEventsService, SourceName } from './verifiedEventsService.js';

const COCORAHS_EXPORT_URL = 'https://data.cocorahs.org/cocorahs/export/exportreports.aspx';

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]; const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') {}
      else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.length === headers.length).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

function mdY(d: Date): string {
  // CoCoRaHS expects MM/DD/YYYY
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export class CocorahsLiveService {
  private svc: VerifiedEventsService;
  private enabled: boolean;
  private states: string[];

  constructor(pool: Pool) {
    this.svc = new VerifiedEventsService(pool);
    this.enabled = process.env.COCORAHS_LIVE_ENABLED === 'true';
    this.states = (process.env.COCORAHS_STATES || 'VA,MD,PA').split(',').map((s) => s.trim());
  }

  /**
   * Pull last N days of hail reports. N=3 covers 72h observer reporting lag.
   */
  async ingestRecent(days = 3): Promise<{ fetched: number; inserted: number; updated: number; errors: number }> {
    if (!this.enabled) {
      console.log('[cocorahs-live] COCORAHS_LIVE_ENABLED=false — skipping');
      return { fetched: 0, inserted: 0, updated: 0, errors: 0 };
    }

    let totalFetched = 0, totalInserted = 0, totalUpdated = 0, totalErrors = 0;
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(mdY(d));
    }

    for (const state of this.states) {
      for (const date of dates) {
        try {
          const url = `${COCORAHS_EXPORT_URL}?ReportType=Hail&dtf=1&Format=CSV&State=${state}&Date=${encodeURIComponent(date)}`;
          const resp = await fetch(url, { headers: { 'User-Agent': 'CC21-storm-live/1.0' } });
          if (!resp.ok) {
            console.warn(`[cocorahs-live] ${state} ${date} HTTP ${resp.status}`);
            continue;
          }
          const text = await resp.text();
          const rows = parseCsv(text);
          totalFetched += rows.length;

          const batch = [];
          for (const r of rows) {
            const lat = parseFloat(r.Latitude || r.latitude || '');
            const lng = parseFloat(r.Longitude || r.longitude || '');
            if (isNaN(lat) || isNaN(lng)) continue;

            const obsDate = r.ObservationDate || r['Observation Date'];
            if (!obsDate) continue;

            const largest = parseFloat(r.LargestSize || '');
            const avg = parseFloat(r.AverageSize || '');
            const hailSize = !isNaN(largest) && largest > 0 ? largest
                           : !isNaN(avg) && avg > 0 ? avg
                           : null;
            if (hailSize == null) continue;

            batch.push({
              eventDate: obsDate,
              latitude: lat,
              longitude: lng,
              state,
              hailSizeInches: hailSize,
              source: 'cocorahs' as SourceName,
              sourcePayload: {
                station_number: r.StationNumber,
                station_name: r.StationName,
                observation_time: r.ObservationTime,
                largest_size: isNaN(largest) ? null : largest,
                average_size: isNaN(avg) ? null : avg,
                damage: r.Damage,
                stone_consistency: r.StoneConsistency,
                ingested_via: 'live-daily',
              },
            });
          }

          if (batch.length > 0) {
            const res = await this.svc.upsertBatch(batch);
            totalInserted += res.inserted;
            totalUpdated += res.updated;
            totalErrors += res.errors.length;
            if (res.inserted > 0) {
              console.log(`[cocorahs-live] ${state} ${date}: +${res.inserted} new, +${res.updated} upd`);
            }
          }
        } catch (err: any) {
          console.error(`[cocorahs-live] ${state} ${date} error:`, err.message);
          totalErrors++;
        }

        // Be polite
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return { fetched: totalFetched, inserted: totalInserted, updated: totalUpdated, errors: totalErrors };
  }

  /**
   * Historical backfill — walks every day in the requested window. CoCoRaHS
   * has reports back to ~2005, so monthsBack can reasonably go up to 24+.
   * Runs serially with the same 500ms politeness delay.
   */
  async ingestHistorical(
    monthsBack: number,
    opts: { forceEnabled?: boolean; maxDays?: number } = {},
  ): Promise<{ fetched: number; inserted: number; updated: number; errors: number; daysProcessed: number }> {
    if (!this.enabled && !opts.forceEnabled) {
      console.log('[cocorahs-live] ingestHistorical — disabled via env (override with forceEnabled=true)');
      return { fetched: 0, inserted: 0, updated: 0, errors: 0, daysProcessed: 0 };
    }
    let fetched = 0, inserted = 0, updated = 0, errors = 0;
    const totalDays = Math.min(opts.maxDays ?? 99999, Math.ceil(monthsBack * 30.5));
    const today = new Date();
    let daysProcessed = 0;
    console.log(`[cocorahs-live] historical backfill starting — ${totalDays} days, states=${this.states.join(',')}`);
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = mdY(d);
      for (const state of this.states) {
        try {
          const url = `${COCORAHS_EXPORT_URL}?ReportType=Hail&dtf=1&Format=CSV&State=${state}&Date=${encodeURIComponent(dateStr)}`;
          const resp = await fetch(url, { headers: { 'User-Agent': 'CC21-storm-live/1.0' } });
          if (!resp.ok) { errors++; continue; }
          const text = await resp.text();
          const rows = parseCsv(text);
          fetched += rows.length;
          const batch: any[] = [];
          for (const r of rows) {
            const lat = parseFloat(r.Latitude || r.latitude || '');
            const lng = parseFloat(r.Longitude || r.longitude || '');
            if (isNaN(lat) || isNaN(lng)) continue;
            const obsDate = r.ObservationDate || r['Observation Date'];
            if (!obsDate) continue;
            const largest = parseFloat(r.LargestSize || '');
            const avg = parseFloat(r.AverageSize || '');
            const hailSize = !isNaN(largest) && largest > 0 ? largest
                           : !isNaN(avg) && avg > 0 ? avg
                           : null;
            if (hailSize == null) continue;
            batch.push({
              eventDate: obsDate, latitude: lat, longitude: lng, state,
              hailSizeInches: hailSize,
              source: 'cocorahs' as SourceName,
              sourcePayload: {
                station_number: r.StationNumber,
                station_name: r.StationName,
                observation_time: r.ObservationTime,
                largest_size: isNaN(largest) ? null : largest,
                average_size: isNaN(avg) ? null : avg,
                damage: r.Damage,
                stone_consistency: r.StoneConsistency,
                ingested_via: 'historical-backfill',
              },
            });
          }
          if (batch.length > 0) {
            const res = await this.svc.upsertBatch(batch);
            inserted += res.inserted;
            updated += res.updated;
            errors += res.errors.length;
          }
        } catch (err: any) {
          errors++;
          console.warn(`[cocorahs-live] backfill err ${state} ${dateStr}: ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      daysProcessed++;
      if (daysProcessed % 10 === 0) {
        console.log(`[cocorahs-live] backfill progress — ${daysProcessed}/${totalDays} days, +${inserted} new, +${updated} upd, ${errors} errors`);
      }
    }
    console.log(`[cocorahs-live] backfill done — ${daysProcessed} days, +${inserted} new, +${updated} upd`);
    return { fetched, inserted, updated, errors, daysProcessed };
  }
}
