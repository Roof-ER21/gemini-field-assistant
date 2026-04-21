/**
 * IEM VTEC — NWS Warning polygon archive (stub for v1)
 *
 * Source: https://mesonet.agron.iastate.edu/cgi-bin/request/gis/watchwarn.py
 * Why: Historical warning polygons (SVR/TOR) to answer "was a warning issued for
 *      this address within X hours of the impact?"
 *
 * Implementation note: VTEC data comes as shapefile ZIP. For v1 we stub this out —
 *  unpacking shapefiles server-side is heavy. Ingestion path would be:
 *   1. Download shapefile ZIP per month
 *   2. Parse with shapefile-reader
 *   3. For each polygon, compute centroid → upsert as a single point event
 *      (loses polygon fidelity but still indicates coverage)
 *
 * Better approach: treat VTEC as a SEPARATE table indexed by polygon + time,
 * queried at read-time for "was inside a warning polygon" feature. Defer to
 * its own dedicated service, not shoehorned into verified_hail_events.
 *
 * This stub logs that work is deferred and returns zero rows, so the CLI
 * doesn't complain when invoked with --sources iem_vtec.
 */

import { BackfillRunner, BackfillResult } from '../backfillOrchestrator.js';
import { SourceName } from '../verifiedEventsService.js';

export const iemVtecBackfill: BackfillRunner = {
  name: 'iem_vtec' as SourceName,

  async run({ states, fromDate, toDate }) {
    const startedAt = new Date().toISOString();
    console.warn('[iem_vtec] DEFERRED — VTEC polygon ingest is a separate service (not unified into verified_hail_events). Zero rows written.');
    const finishedAt = new Date().toISOString();
    return {
      source: 'iem_vtec' as SourceName,
      success: true,
      rowsInput: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      errors: [{
        reason: 'iem_vtec backfill is deferred; implement as separate warning_polygons table + service',
      }],
      startedAt,
      finishedAt,
      durationSec: 0,
    };
  },
};
