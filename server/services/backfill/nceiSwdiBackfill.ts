/**
 * NCEI SWDI (Severe Weather Data Inventory) — radar-derived hail signatures
 *
 * Source: https://www.ncei.noaa.gov/swdiws/{csv|json}/{dataset}/{startdate}:{enddate}?bbox=...
 * Datasets: nx3hail (hail signature), nx3mesh (MESH), nx3tvs (tornado vortex signature)
 * Why: Adds radar-derived hail events that are INDEPENDENT of ground reports — fills the gap
 *      where no observer was present to see/measure hail.
 * Format: CSV
 * Coverage: 1995+ for hail signatures
 * Auth: none (14-day max window per call)
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { BackfillRunner, BackfillResult, markWindowStart, markWindowComplete, markWindowFailed } from '../backfillOrchestrator.js';
import { SourceName } from '../verifiedEventsService.js';

const SWDI_BASE = 'https://www.ncei.noaa.gov/swdiws/csv';

// Bounding box covers VA/MD/PA + reasonable buffer for neighbors
// Format for SWDI: minLng,minLat,maxLng,maxLat
const TRISTATE_BBOX = '-83.68,36.54,-74.98,42.51';

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

/**
 * Determine state for a lat/lng using coarse bounding boxes.
 * For backfill tagging only; not a precise geocoder.
 */
function coarseStateFromLatLng(lat: number, lng: number): string | null {
  // VA: ~36.5-39.5N, -83.7 to -75.2
  if (lat >= 36.5 && lat <= 39.5 && lng >= -83.7 && lng <= -75.2) return 'VA';
  // MD: ~37.9-39.7N, -79.5 to -75.0
  if (lat >= 37.9 && lat <= 39.7 && lng >= -79.5 && lng <= -75.0) return 'MD';
  // PA: ~39.7-42.3N, -80.5 to -74.7
  if (lat >= 39.7 && lat <= 42.3 && lng >= -80.5 && lng <= -74.7) return 'PA';
  // WV: ~37.2-40.6N, -82.6 to -77.7
  if (lat >= 37.2 && lat <= 40.6 && lng >= -82.6 && lng <= -77.7) return 'WV';
  // DE: ~38.5-39.8N, -75.8 to -75.0
  if (lat >= 38.5 && lat <= 39.8 && lng >= -75.8 && lng <= -75.0) return 'DE';
  // NJ: ~38.9-41.4N, -75.6 to -73.9
  if (lat >= 38.9 && lat <= 41.4 && lng >= -75.6 && lng <= -73.9) return 'NJ';
  // NY: ~40.5-45.0N, -79.8 to -71.8
  if (lat >= 40.5 && lat <= 45.0 && lng >= -79.8 && lng <= -71.8) return 'NY';
  // DC: inside VA/MD coords bucket roughly
  if (lat >= 38.79 && lat <= 38.99 && lng >= -77.12 && lng <= -76.91) return 'DC';
  return null;
}

export const nceiSwdiBackfill: BackfillRunner = {
  name: 'ncei_swdi' as SourceName,

  async run({ pool, verifiedSvc, states, fromDate, toDate, dryRun, onProgress }) {
    const startedAt = new Date().toISOString();
    const runId = randomUUID();
    const result: BackfillResult = {
      source: 'ncei_swdi' as SourceName,
      success: true,
      rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0,
      errors: [],
      startedAt, finishedAt: '', durationSec: 0,
    };

    const allowedStates = new Set(states);

    // 14-day windows per SWDI API limit
    const start = new Date(fromDate + 'T00:00:00Z');
    const end = new Date(toDate + 'T00:00:00Z');
    const WINDOW_DAYS = 14;

    // Iterate nx3hail only for now (MESH is radar grid, TVS is tornado signatures)
    const datasets = ['nx3hail'];

    for (const dataset of datasets) {
      const cursor = new Date(start);
      while (cursor < end) {
        const winStart = new Date(cursor);
        const winEnd = new Date(cursor);
        winEnd.setUTCDate(winEnd.getUTCDate() + WINDOW_DAYS);
        if (winEnd > end) winEnd.setTime(end.getTime());

        const s = winStart.toISOString().slice(0, 10).replace(/-/g, '');
        const e = winEnd.toISOString().slice(0, 10).replace(/-/g, '');
        const label = `SWDI:${dataset}:${s}:${e}`;

        await markWindowStart(pool, 'ncei_swdi', runId, label);

        try {
          const url = `${SWDI_BASE}/${dataset}/${s}:${e}?bbox=${TRISTATE_BBOX}`;

          onProgress?.({
            source: 'ncei_swdi' as SourceName, phase: 'fetching',
            rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0, errors: 0,
            currentWindow: label,
          });

          const resp = await fetch(url, { headers: { 'User-Agent': 'CC21-storm-backfill/1.0' } });
          if (!resp.ok) {
            if (resp.status === 404) {
              // 404 often means no data in this window — normal
              await markWindowComplete(pool, 'ncei_swdi', runId, label, {
                rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0, errorCount: 0,
              });
              cursor.setUTCDate(cursor.getUTCDate() + WINDOW_DAYS);
              continue;
            }
            throw new Error(`SWDI HTTP ${resp.status}`);
          }
          const text = await resp.text();
          // SWDI returns a header comment + CSV. Strip comment lines.
          const cleaned = text.split('\n').filter((l) => !l.startsWith('#')).join('\n');
          const rows = parseCsv(cleaned);

          result.rowsInput += rows.length;
          console.log(`[ncei_swdi] ${label}: ${rows.length} signatures`);

          if (dryRun) {
            await markWindowComplete(pool, 'ncei_swdi', runId, label, {
              rowsInput: rows.length, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: rows.length, errorCount: 0,
            });
            cursor.setUTCDate(cursor.getUTCDate() + WINDOW_DAYS);
            continue;
          }

          // SWDI nx3hail fields: ZTIME, LON, LAT, WSR_ID, MAXSIZE, PROB, SEVPROB, AZ, RAN, AZ2, RAN2, CELL_ID, CELL_TYPE
          const batch = [];
          for (const r of rows) {
            const lat = parseFloat(r.LAT);
            const lng = parseFloat(r.LON);
            if (isNaN(lat) || isNaN(lng)) continue;

            const state = coarseStateFromLatLng(lat, lng);
            if (state && !allowedStates.has(state)) continue;   // enforce state scope

            const maxsize = parseFloat(r.MAXSIZE);   // inches
            if (isNaN(maxsize) || maxsize <= 0) continue;

            const ztime = r.ZTIME;
            if (!ztime) continue;

            batch.push({
              eventDate: ztime,                              // SWDI ZTIME is ISO UTC
              latitude: lat,
              longitude: lng,
              state,
              hailSizeInches: maxsize,
              windMph: null,
              tornadoEfRank: null,
              source: 'ncei_swdi' as SourceName,
              sourcePayload: {
                dataset,
                wsr_id: r.WSR_ID,
                maxsize_inches: maxsize,
                prob: parseFloat(r.PROB) || null,
                sevprob: parseFloat(r.SEVPROB) || null,
                az: parseFloat(r.AZ) || null,
                ran: parseFloat(r.RAN) || null,
                cell_id: r.CELL_ID,
                cell_type: r.CELL_TYPE,
                ztime,
              },
            });
          }

          const CHUNK = 500;
          let wInserted = 0, wUpdated = 0, wErrors = 0;
          for (let i = 0; i < batch.length; i += CHUNK) {
            const slice = batch.slice(i, i + CHUNK);
            const res = await verifiedSvc.upsertBatch(slice);
            wInserted += res.inserted; wUpdated += res.updated; wErrors += res.errors.length;
            result.errors.push(...res.errors.map((e) => ({ reason: e.error, sample: e.params })));
          }
          result.rowsInserted += wInserted;
          result.rowsUpdated += wUpdated;

          await markWindowComplete(pool, 'ncei_swdi', runId, label, {
            rowsInput: rows.length, rowsInserted: wInserted, rowsUpdated: wUpdated,
            rowsSkipped: 0, errorCount: wErrors,
          });
        } catch (err: any) {
          await markWindowFailed(pool, 'ncei_swdi', runId, label, err.message);
          result.errors.push({ reason: `${label} failed: ${err.message}` });
          console.error(`[ncei_swdi] ${label} failed:`, err.message);
        }

        cursor.setUTCDate(cursor.getUTCDate() + WINDOW_DAYS);
        // Rate limit: be polite to NCEI
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    const finishedAt = new Date().toISOString();
    result.finishedAt = finishedAt;
    result.durationSec = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
    result.success = result.errors.length === 0;
    return result;
  },
};
