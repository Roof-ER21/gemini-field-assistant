/**
 * SPC WCM (Storm Prediction Center Warning Coordination Meteorologist) archive
 *
 * Source: https://www.spc.noaa.gov/wcm/data/1950-{YEAR}_{TYPE}.csv
 * Why: Cleaner/tidier schema than NCEI, consistent 1950-present. Dedup insurance
 *      against NCEI compilation errors. Often includes events NCEI missed.
 * Format: CSV (annual compilation)
 * Coverage: 1950-most-recent-closed-year
 * Auth: none
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { BackfillRunner, BackfillResult, markWindowStart, markWindowComplete, markWindowFailed } from '../backfillOrchestrator.js';
import { SourceName } from '../verifiedEventsService.js';

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

// SPC WCM state names use two-letter abbrevs in "st" column
const STATE_ABBREV = new Set(['VA', 'MD', 'PA', 'DC', 'WV', 'DE', 'NJ', 'NY', 'OH', 'NC', 'KY', 'TN']);

/**
 * Try common SPC filenames. Files are named like:
 *   - 1950-2023_hail.csv
 *   - 1950-2023_torn.csv
 *   - 1950-2023_wind.csv
 * The endYear in filename changes each year.
 */
async function resolveFile(type: 'hail' | 'torn' | 'wind', guesses: number[] = [2024, 2023, 2022]): Promise<string | null> {
  for (const endY of guesses) {
    const url = `https://www.spc.noaa.gov/wcm/data/1950-${endY}_${type}.csv`;
    const resp = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'CC21-storm-backfill/1.0' } });
    if (resp.ok) return url;
  }
  return null;
}

export const spcWcmBackfill: BackfillRunner = {
  name: 'spc_wcm' as SourceName,

  async run({ pool, verifiedSvc, states, fromDate, toDate, dryRun, onProgress }) {
    const startedAt = new Date().toISOString();
    const runId = randomUUID();
    const result: BackfillResult = {
      source: 'spc_wcm' as SourceName,
      success: true,
      rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0,
      errors: [],
      startedAt, finishedAt: '', durationSec: 0,
    };

    const allowedStates = new Set(states.filter((s) => STATE_ABBREV.has(s)));
    const startYear = new Date(fromDate).getFullYear();
    const endYear = new Date(toDate).getFullYear();

    const types: Array<'hail' | 'torn' | 'wind'> = ['hail', 'wind', 'torn'];

    for (const t of types) {
      const label = `SPC-WCM:${t}:${fromDate}:${toDate}`;
      await markWindowStart(pool, 'spc_wcm', runId, label);

      try {
        const url = await resolveFile(t);
        if (!url) {
          console.warn(`[spc_wcm] Could not resolve ${t} file`);
          await markWindowComplete(pool, 'spc_wcm', runId, label, {
            rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0, errorCount: 1,
          });
          continue;
        }

        onProgress?.({
          source: 'spc_wcm' as SourceName, phase: 'fetching',
          rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0, errors: 0,
          currentWindow: label,
        });

        const resp = await fetch(url, { headers: { 'User-Agent': 'CC21-storm-backfill/1.0' } });
        if (!resp.ok) throw new Error(`SPC ${t} HTTP ${resp.status}`);
        const text = await resp.text();
        const rows = parseCsv(text);

        // SPC WCM columns (consistent across types):
        // om, yr, mo, dy, date, time, tz, st, stf, stn, mag, inj, fat, loss, closs,
        // slat, slon, elat, elon, len, wid, ns, sn, sg, f1, f2, f3, f4, fc
        const filtered = rows.filter((r) => {
          const yr = parseInt(r.yr || '', 10);
          const st = (r.st || '').toUpperCase().trim();
          return yr >= startYear && yr <= endYear && allowedStates.has(st);
        });

        result.rowsInput += filtered.length;
        console.log(`[spc_wcm] ${t}: ${filtered.length} rows in scope from ${rows.length} total`);

        if (dryRun) {
          await markWindowComplete(pool, 'spc_wcm', runId, label, {
            rowsInput: filtered.length, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: filtered.length, errorCount: 0,
          });
          continue;
        }

        const batch = [];
        for (const r of filtered) {
          const lat = parseFloat(r.slat || '');
          const lng = parseFloat(r.slon || '');
          if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

          // Date: yr/mo/dy columns or 'date' column
          const yr = r.yr, mo = (r.mo || '').padStart(2, '0'), dy = (r.dy || '').padStart(2, '0');
          const eventDate = `${yr}-${mo}-${dy}`;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) continue;

          const mag = parseFloat(r.mag || '');
          const st = (r.st || '').toUpperCase();

          let hailSize: number | null = null;
          let windMph: number | null = null;
          let tornadoEfRank: number | null = null;

          if (t === 'hail') {
            // SPC hail magnitude is in hundredths of inch (e.g., 175 = 1.75")
            hailSize = !isNaN(mag) && mag > 0 ? mag / 100 : null;
          } else if (t === 'wind') {
            // SPC wind is mph directly
            windMph = !isNaN(mag) && mag > 0 ? Math.round(mag) : null;
          } else if (t === 'torn') {
            tornadoEfRank = !isNaN(mag) ? Math.round(mag) : null;
          }

          if (hailSize == null && windMph == null && tornadoEfRank == null) continue;

          batch.push({
            eventDate,
            latitude: lat,
            longitude: lng,
            state: st,
            hailSizeInches: hailSize,
            windMph,
            tornadoEfRank,
            source: 'spc_wcm' as SourceName,
            sourcePayload: {
              event_type: t,
              om_id: r.om,                        // SPC omega ID
              date: r.date,
              time: r.time,
              tz: r.tz,
              county_fips: r.f1,
              magnitude_raw: mag,
              injuries: r.inj,
              fatalities: r.fat,
              loss: r.loss,
              length_mi: r.len,
              width_yd: r.wid,
              state: st,
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

        await markWindowComplete(pool, 'spc_wcm', runId, label, {
          rowsInput: filtered.length, rowsInserted: wInserted, rowsUpdated: wUpdated,
          rowsSkipped: 0, errorCount: wErrors,
        });
      } catch (err: any) {
        await markWindowFailed(pool, 'spc_wcm', runId, label, err.message);
        result.errors.push({ reason: `${label} failed: ${err.message}` });
        console.error(`[spc_wcm] ${label} failed:`, err.message);
      }
    }

    const finishedAt = new Date().toISOString();
    result.finishedAt = finishedAt;
    result.durationSec = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
    result.success = result.errors.length === 0;
    return result;
  },
};
