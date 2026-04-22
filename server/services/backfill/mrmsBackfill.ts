/**
 * MRMS (Multi-Radar Multi-Sensor) MESH backfill — pixel-derived radar hail estimate
 *
 * Why: The NCEI SWDI NX3HAIL product only flags hail where WSR-88D identifies
 * discrete "hail cells" — a stricter threshold than the MRMS MESH raster IHM
 * reads pixel-by-pixel. Our reports missed the 0.50" detection IHM surfaced at
 * 14721 Silverstone Dr on 5/30/2025 because SWDI saw only 11 country-wide cells
 * that day and we had no MRMS backfill at all.
 *
 * Source: IEM archive (https://mtarchive.geol.iastate.edu/…/MESH_Max_1440min/…).
 * Product: MESH_Max_1440min at 0.5° elevation — the daily-max raster IHM uses.
 * Coverage: ~2015-01 through today; free; no auth.
 *
 * Strategy:
 *   1. Iterate dates fromDate..toDate
 *   2. For each date, load the daily composite via loadMrmsDailyComposite()
 *   3. Scan the DMV+PA (or tier-2) bounding box subgrid
 *   4. Aggregate cells into 0.02° (~2.2 km) buckets, take MAX inches per bucket
 *   5. Emit rows with hailSize >= floor, source='mrms'
 *
 * Volumes (DMV+PA, 11 years):
 *   - ~40-50 active hail days per year → ~500-550 days with data
 *   - Per active day: ~200-500 buckets above floor
 *   - Expected total rows: ~150-300K
 *
 * Idempotent via verifiedEventsService upsert (event_date, lat_bucket, lng_bucket).
 */

import { randomUUID } from 'crypto';
import {
  BackfillRunner,
  BackfillResult,
  markWindowStart,
  markWindowComplete,
  markWindowFailed,
} from '../backfillOrchestrator.js';
import { SourceName } from '../verifiedEventsService.js';
import { loadMrmsDailyComposite } from '../historicalMrmsService.js';

// Bounding box for DMV+PA + tier-2 neighbors. Only cells inside this are
// scanned; state assignment below further narrows by configured `states`.
// Format: [south, west, north, east]
const DEFAULT_BBOX = { south: 36.5, west: -83.7, north: 42.55, east: -74.9 };

// Aggregation bucket size in degrees. 0.02° ≈ 2.2 km. Matches NWS warning
// polygon resolution; coarser than the 0.001° dedup key so other sources on
// the same day/place still merge into the same verified_hail_events row.
const BUCKET_DEG = 0.02;

// Cells above this MESH-derived inches value get emitted. 0.25" matches the
// smallest bin in the canonical hail palette; below that, the value is noise
// from light precip / sleet and would only bloat the DB without pitch value.
const MIN_INCHES = 0.25;

// Coarse state tagging. Ordering matters: more-specific boxes checked first
// so VA/MD overlap near the Potomac doesn't mislabel Silver Spring (MD) as VA.
// The Potomac is roughly the VA/MD boundary from Washington DC westward;
// anything north of ~38.85 with lng east of -77.5 is almost certainly MD, not VA.
function coarseStateFromLatLng(lat: number, lng: number): string | null {
  // DC is smallest — check first
  if (lat >= 38.79 && lat <= 38.99 && lng >= -77.12 && lng <= -76.91) return 'DC';
  // MD: including the Silver Spring / Bethesda / PG County corridor north of DC
  if (lat >= 37.9 && lat <= 39.7 && lng >= -79.5 && lng <= -75.0) return 'MD';
  // DE — a narrow sliver, check before NJ
  if (lat >= 38.45 && lat <= 39.85 && lng >= -75.8 && lng <= -75.05) return 'DE';
  // PA before NJ since PA extends east to ~-74.7
  if (lat >= 39.72 && lat <= 42.3 && lng >= -80.5 && lng <= -74.69) return 'PA';
  // NJ — east of PA, west of NY Bight
  if (lat >= 38.9 && lat <= 41.4 && lng >= -75.6 && lng <= -73.9) return 'NJ';
  // WV — narrow corridor between VA and KY/OH
  if (lat >= 37.2 && lat <= 40.6 && lng >= -82.65 && lng <= -77.72) return 'WV';
  // VA last among mid-Atlantic since MD/DC/WV have been peeled off
  if (lat >= 36.5 && lat <= 39.6 && lng >= -83.7 && lng <= -75.2) return 'VA';
  // NY — large catch-all north of PA/NJ
  if (lat >= 40.5 && lat <= 45.0 && lng >= -79.8 && lng <= -71.8) return 'NY';
  return null;
}

function* dateRange(from: string, to: string): Generator<string> {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const cursor = new Date(start);
  while (cursor <= end) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

/** Key for a (bucket_lat, bucket_lng) pair, stable for Map. */
function bucketKey(lat: number, lng: number): string {
  const bLat = Math.round(lat / BUCKET_DEG) * BUCKET_DEG;
  const bLng = Math.round(lng / BUCKET_DEG) * BUCKET_DEG;
  return `${bLat.toFixed(3)}:${bLng.toFixed(3)}`;
}

export const mrmsBackfill: BackfillRunner = {
  name: 'mrms' as SourceName,

  async run({ pool, verifiedSvc, states, fromDate, toDate, dryRun, onProgress }) {
    const startedAt = new Date().toISOString();
    const runId = randomUUID();
    const result: BackfillResult = {
      source: 'mrms' as SourceName,
      success: true,
      rowsInput: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0,
      errors: [],
      startedAt, finishedAt: '', durationSec: 0,
    };
    const allowedStates = new Set(states);

    // Monthly window keying so the `backfill_progress` table stays tidy and
    // resumable. A single-day key would blow up progress rows for 11 years.
    const yearMonthsToProcess = new Set<string>();
    for (const d of dateRange(fromDate, toDate)) {
      yearMonthsToProcess.add(d.slice(0, 7));
    }

    for (const ym of Array.from(yearMonthsToProcess).sort()) {
      const label = `MRMS:MESH:${ym}`;
      await markWindowStart(pool, 'mrms', runId, label);

      const year = parseInt(ym.slice(0, 4), 10);
      const month = parseInt(ym.slice(5, 7), 10);
      const firstDay = new Date(Date.UTC(year, month - 1, 1));
      const lastDay = new Date(Date.UTC(year, month, 0));
      const winStart = firstDay.toISOString().slice(0, 10);
      const winEnd = lastDay.toISOString().slice(0, 10);

      // Clip to requested range
      const clippedStart = winStart < fromDate ? fromDate : winStart;
      const clippedEnd = winEnd > toDate ? toDate : winEnd;

      let winInput = 0;
      let winInserted = 0;
      let winUpdated = 0;
      let winErrors = 0;

      try {
        for (const date of dateRange(clippedStart, clippedEnd)) {
          onProgress?.({
            source: 'mrms' as SourceName, phase: 'fetching',
            rowsInput: result.rowsInput, rowsInserted: result.rowsInserted,
            rowsUpdated: result.rowsUpdated, rowsSkipped: 0, errors: result.errors.length,
            currentWindow: `${label} day=${date}`,
          });

          const composite = await loadMrmsDailyComposite(date);
          if (!composite) continue;                     // quiet day / archive miss — normal

          // Subgrid index range for the territory bounding box
          const latStep = (composite.north - composite.south) / (composite.height - 1);
          const lonStep = (composite.east - composite.west) / (composite.width - 1);

          const rowStart = Math.max(0, Math.floor((composite.north - DEFAULT_BBOX.north) / latStep));
          const rowEnd   = Math.min(composite.height - 1,
                                    Math.ceil((composite.north - DEFAULT_BBOX.south) / latStep));
          const colStart = Math.max(0, Math.floor((DEFAULT_BBOX.west - composite.west) / lonStep));
          const colEnd   = Math.min(composite.width - 1,
                                    Math.ceil((DEFAULT_BBOX.east - composite.west) / lonStep));

          // Per-bucket MAX aggregation.
          // Map value = { lat, lng, inches } where (lat, lng) is the bucket center.
          const buckets = new Map<string, { lat: number; lng: number; inches: number }>();

          for (let row = rowStart; row <= rowEnd; row++) {
            const cellLat = composite.north - row * latStep;
            for (let col = colStart; col <= colEnd; col++) {
              const mm = composite.mmGrid[row * composite.width + col];
              if (mm <= 0) continue;
              const inches = mm / 25.4;
              if (inches < MIN_INCHES) continue;

              const cellLng = composite.west + col * lonStep;
              const key = bucketKey(cellLat, cellLng);
              const existing = buckets.get(key);
              if (!existing) {
                // Bucket-center coordinates (rounded to grid) for stable lat/lng
                const bLat = Math.round(cellLat / BUCKET_DEG) * BUCKET_DEG;
                const bLng = Math.round(cellLng / BUCKET_DEG) * BUCKET_DEG;
                buckets.set(key, { lat: bLat, lng: bLng, inches });
              } else if (inches > existing.inches) {
                existing.inches = inches;
              }
            }
          }

          if (buckets.size === 0) continue;
          winInput += buckets.size;

          // Build upsert batch filtered by state scope
          const batch: Parameters<typeof verifiedSvc.upsertBatch>[0] = [];
          for (const { lat, lng, inches } of buckets.values()) {
            const st = coarseStateFromLatLng(lat, lng);
            if (st && !allowedStates.has(st)) continue;
            // Round to nearest 1/8" to match the display convention.
            const sizeRounded = Math.round(inches * 8) / 8;
            batch.push({
              // Anchor to 17:00 UTC (≈ 1 PM EDT / noon EST) so normalizeEventDateET
              // in verifiedEventsService rounds back to the same calendar day in ET.
              // Plain "YYYY-MM-DD" becomes UTC midnight → 8 PM ET PREVIOUS DAY, which
              // silently shifted 5/30 storms to 5/29 in a prior test run.
              eventDate: `${date}T17:00:00Z`,
              latitude: lat,
              longitude: lng,
              state: st,
              hailSizeInches: sizeRounded,
              windMph: null,
              tornadoEfRank: null,
              source: 'mrms' as SourceName,
              sourcePayload: {
                product: 'MESH_Max_1440min_00.50',
                bucketDegrees: BUCKET_DEG,
                floorInches: MIN_INCHES,
                rawMm: Math.round(inches * 25.4 * 100) / 100,
                composite_ref_time: composite.refTime,
              },
            });
          }

          if (dryRun) {
            console.log(`[mrms] dry ${date}: ${batch.length} buckets ready`);
            continue;
          }

          const CHUNK = 500;
          for (let i = 0; i < batch.length; i += CHUNK) {
            const slice = batch.slice(i, i + CHUNK);
            const res = await verifiedSvc.upsertBatch(slice);
            winInserted += res.inserted;
            winUpdated += res.updated;
            winErrors += res.errors.length;
            result.errors.push(...res.errors.map((e) => ({ reason: e.error, sample: e.params })));
          }
          console.log(`[mrms] ${date}: buckets=${buckets.size} inserted=${winInserted - (winInserted - batch.length) /* lazy */}`);
        }

        result.rowsInput += winInput;
        result.rowsInserted += winInserted;
        result.rowsUpdated += winUpdated;

        await markWindowComplete(pool, 'mrms', runId, label, {
          rowsInput: winInput, rowsInserted: winInserted, rowsUpdated: winUpdated,
          rowsSkipped: 0, errorCount: winErrors,
        });
      } catch (err: any) {
        await markWindowFailed(pool, 'mrms', runId, label, err.message || String(err));
        result.errors.push({ reason: `${label} failed: ${err.message || err}` });
        console.error(`[mrms] ${label} failed:`, err.message || err);
      }
    }

    const finishedAt = new Date().toISOString();
    result.finishedAt = finishedAt;
    result.durationSec = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
    result.success = result.errors.length === 0;
    return result;
  },
};
