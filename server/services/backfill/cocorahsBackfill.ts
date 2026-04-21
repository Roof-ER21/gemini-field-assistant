/**
 * CoCoRaHS observer hail reports backfill
 *
 * Source: https://data.cocorahs.org/cocorahs/export/exportreports.aspx
 * Why: Observer-measured hail (stone size, duration, consistency). Catches sub-½"
 *      events MRMS/HailTrace miss. Proved critical on 4/20/2026 Vienna event.
 * Format: CSV
 * Coverage: 1998+ (observer density grew 2010+)
 * Auth: none for CSV export
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

export const cocorahsBackfill: BackfillRunner = {
  name: 'cocorahs' as SourceName,

  async run({ pool, verifiedSvc, states, fromDate, toDate, dryRun, onProgress }) {
    const startedAt = new Date().toISOString();
    const runId = randomUUID();
    const result: BackfillResult = {
      source: 'cocorahs' as SourceName,
      success: true,
      rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0,
      errors: [],
      startedAt, finishedAt: '', durationSec: 0,
    };

    const startYear = new Date(fromDate).getFullYear();
    const endYear = new Date(toDate).getFullYear();

    // One window per (state, year)
    for (const state of states) {
      for (let year = startYear; year <= endYear; year++) {
        const label = `COCORAHS:${state}:${year}`;
        await markWindowStart(pool, 'cocorahs', runId, label);

        try {
          // Hail reports export — dtf=2 uses Year filter
          const url = `https://data.cocorahs.org/cocorahs/export/exportreports.aspx?ReportType=Hail&dtf=2&Format=CSV&State=${state}&Year=${year}`;

          onProgress?.({
            source: 'cocorahs' as SourceName, phase: 'fetching',
            rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0, errors: 0,
            currentWindow: label,
          });

          const resp = await fetch(url, { headers: { 'User-Agent': 'CC21-storm-backfill/1.0' } });
          if (!resp.ok) throw new Error(`CoCoRaHS ${state}/${year} HTTP ${resp.status}`);
          const text = await resp.text();
          const rows = parseCsv(text);

          result.rowsInput += rows.length;
          console.log(`[cocorahs] ${label}: ${rows.length} reports`);

          if (dryRun) {
            await markWindowComplete(pool, 'cocorahs', runId, label, {
              rowsInput: rows.length, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: rows.length, errorCount: 0,
            });
            continue;
          }

          // CoCoRaHS CSV columns (typical):
          // StationNumber, StationName, ObservationDate, ObservationTime, Latitude, Longitude,
          // TotalPrecipAmt, NewSnowDepth, NewSnowSWE, MultiDayPrecipAmt, HailAccumDepth,
          // HailAccumDuration, LargestHailStone, AvgHailStone, SmallestHailStone, HailConsistency, Comments
          const batch = [];
          for (const r of rows) {
            const lat = parseFloat(r.Latitude || r.latitude || '');
            const lng = parseFloat(r.Longitude || r.longitude || '');
            if (isNaN(lat) || isNaN(lng)) continue;

            const obsDate = r.ObservationDate || r.observationdate || r['Observation Date'];
            if (!obsDate) continue;

            // Parse hail stone sizes (reported in inches)
            const largest = parseFloat(r.LargestHailStone || r.largesthailstone || r['Largest Hail Stone'] || '');
            const avg = parseFloat(r.AvgHailStone || r.avghailstone || r['Avg Hail Stone'] || '');
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
              windMph: null,
              tornadoEfRank: null,
              source: 'cocorahs' as SourceName,
              sourcePayload: {
                station_number: r.StationNumber || r.stationnumber,
                station_name: r.StationName || r.stationname,
                observation_date: obsDate,
                observation_time: r.ObservationTime || r.observationtime,
                latitude: lat,
                longitude: lng,
                largest_hailstone: largest || null,
                avg_hailstone: avg || null,
                smallest_hailstone: parseFloat(r.SmallestHailStone || r.smallesthailstone || '') || null,
                hail_accum_depth: r.HailAccumDepth || null,
                hail_accum_duration: r.HailAccumDuration || null,
                hail_consistency: r.HailConsistency || null,
                comments: (r.Comments || r.comments || '').slice(0, 500),
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

          await markWindowComplete(pool, 'cocorahs', runId, label, {
            rowsInput: rows.length, rowsInserted: wInserted, rowsUpdated: wUpdated,
            rowsSkipped: 0, errorCount: wErrors,
          });
        } catch (err: any) {
          await markWindowFailed(pool, 'cocorahs', runId, label, err.message);
          result.errors.push({ reason: `${label} failed: ${err.message}` });
          console.error(`[cocorahs] ${label} failed:`, err.message);
        }

        // Be polite to CoCoRaHS
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const finishedAt = new Date().toISOString();
    result.finishedAt = finishedAt;
    result.durationSec = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
    result.success = result.errors.length === 0;
    return result;
  },
};
