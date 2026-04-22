#!/usr/bin/env node
/**
 * run-backfill.ts — CLI for historical storm data backfill
 *
 * Usage examples:
 *   # Dry-run: count rows, don't write
 *   npx tsx scripts/run-backfill.ts \
 *     --sources noaa_ncei,iem_lsr,ncei_swdi,cocorahs,spc_wcm \
 *     --states VA,MD,PA \
 *     --from 2015-01-01 --to 2026-04-21 \
 *     --dry-run
 *
 *   # Real run (writes to verified_hail_events)
 *   npx tsx scripts/run-backfill.ts \
 *     --sources noaa_ncei \
 *     --states VA,MD,PA \
 *     --from 2024-01-01 --to 2026-04-21
 *
 *   # Single source, single state, narrow date window for testing
 *   npx tsx scripts/run-backfill.ts \
 *     --sources cocorahs --states VA --from 2026-04-01 --to 2026-04-21
 *
 *   # Show progress summary
 *   npx tsx scripts/run-backfill.ts --summary
 */

import pg from 'pg';
import { backfillOrchestrator, registerAllRunners } from '../server/services/backfillOrchestrator.js';
import { SourceName } from '../server/services/verifiedEventsService.js';

const VALID_SOURCES: SourceName[] = [
  'noaa_ncei', 'iem_lsr', 'ncei_swdi', 'mrms', 'cocorahs',
  'mping', 'synoptic', 'spc_wcm', 'iem_vtec',
];

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Prefer DATABASE_PUBLIC_URL (works from outside Railway) over DATABASE_URL (internal only)
  const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL or DATABASE_PUBLIC_URL env var required');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') || databaseUrl.includes('amazonaws') ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 30_000,
    // Keepalive helps with Railway proxy staleness
    keepAlive: true,
  });

  // Survive transient connection losses — don't crash the process
  pool.on('error', (err) => {
    console.error('[pg pool] Idle client error (non-fatal):', err.message);
  });

  // Test connection
  try {
    await pool.query('SELECT 1');
  } catch (err: any) {
    console.error('ERROR: Could not connect to database:', err.message);
    process.exit(1);
  }

  await registerAllRunners();

  // Mode: summary
  if (args.summary) {
    const summary = await backfillOrchestrator.summary(pool);
    console.log('\n=== BACKFILL PROGRESS SUMMARY ===');
    console.table(summary);

    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM verified_hail_events) AS total_events,
        (SELECT COUNT(*) FROM verified_hail_events WHERE event_date >= '2024-01-01') AS since_2024,
        (SELECT COUNT(*) FROM verified_hail_events WHERE event_date >= '2026-01-01') AS since_2026,
        (SELECT COUNT(DISTINCT state) FROM verified_hail_events WHERE state IS NOT NULL) AS distinct_states
    `);
    console.log('\n=== verified_hail_events TOTALS ===');
    console.table(stats.rows);

    const bySource = await pool.query('SELECT * FROM verified_hail_events_stats_by_source');
    console.log('\n=== BY SOURCE ===');
    console.table(bySource.rows);

    const byTier = await pool.query('SELECT * FROM verified_hail_events_stats_by_tier');
    console.log('\n=== BY CONFIDENCE TIER ===');
    console.table(byTier.rows);

    await pool.end();
    return;
  }

  // Mode: run backfill
  const sources = String(args.sources || '').split(',').filter(Boolean) as SourceName[];
  const states = String(args.states || 'VA,MD,PA').split(',').filter(Boolean);
  const fromDate = String(args.from || '2015-01-01');
  const toDate = String(args.to || new Date().toISOString().slice(0, 10));
  const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';

  if (sources.length === 0) {
    console.error('ERROR: --sources required. Valid values:', VALID_SOURCES.join(','));
    console.error('Usage: --sources noaa_ncei,iem_lsr,ncei_swdi,cocorahs,spc_wcm --states VA,MD,PA --from 2015-01-01 --to 2026-04-21 [--dry-run]');
    process.exit(1);
  }

  for (const s of sources) {
    if (!VALID_SOURCES.includes(s)) {
      console.error(`ERROR: invalid source "${s}". Valid: ${VALID_SOURCES.join(',')}`);
      process.exit(1);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' BACKFILL RUN');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Sources:  ${sources.join(', ')}`);
  console.log(`  States:   ${states.join(', ')}`);
  console.log(`  Range:    ${fromDate} → ${toDate}`);
  console.log(`  Dry run:  ${dryRun ? 'YES (no DB writes)' : 'NO (writing to verified_hail_events)'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const startedAt = Date.now();

  const results = await backfillOrchestrator.run(pool, {
    sources,
    states,
    fromDate,
    toDate,
    dryRun,
    onProgress: (update) => {
      if (update.phase === 'done') {
        console.log(`  ${update.source} window ${update.currentWindow}: +${update.rowsInserted} new, +${update.rowsUpdated} upd, ${update.errors} errs`);
      }
    },
  });

  const elapsed = Math.round((Date.now() - startedAt) / 1000);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  const totals = {
    rowsInput: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    errors: 0,
  };
  for (const r of results) {
    console.log(`\n[${r.source}] ${r.success ? '✓' : '✗'}`);
    console.log(`  Input:    ${r.rowsInput}`);
    console.log(`  Inserted: ${r.rowsInserted}`);
    console.log(`  Updated:  ${r.rowsUpdated}`);
    console.log(`  Skipped:  ${r.rowsSkipped}`);
    console.log(`  Errors:   ${r.errors.length}`);
    console.log(`  Duration: ${r.durationSec}s`);
    if (r.errors.length > 0 && r.errors.length <= 5) {
      console.log(`  Error samples:`);
      for (const e of r.errors.slice(0, 5)) {
        console.log(`    - ${e.reason}`);
      }
    } else if (r.errors.length > 5) {
      console.log(`  First 3 errors:`);
      for (const e of r.errors.slice(0, 3)) {
        console.log(`    - ${e.reason}`);
      }
      console.log(`  ... and ${r.errors.length - 3} more`);
    }
    totals.rowsInput += r.rowsInput;
    totals.rowsInserted += r.rowsInserted;
    totals.rowsUpdated += r.rowsUpdated;
    totals.rowsSkipped += r.rowsSkipped;
    totals.errors += r.errors.length;
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(` TOTALS (${elapsed}s elapsed)`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Input rows:    ${totals.rowsInput}`);
  console.log(`  Inserted:      ${totals.rowsInserted}`);
  console.log(`  Updated:       ${totals.rowsUpdated}`);
  console.log(`  Skipped:       ${totals.rowsSkipped}`);
  console.log(`  Errors:        ${totals.errors}`);

  // Post-run stats
  if (!dryRun) {
    const postStats = await pool.query(`SELECT COUNT(*)::int AS c FROM verified_hail_events`);
    console.log(`\n  verified_hail_events row count: ${postStats.rows[0].c}`);
  }

  await pool.end();
  process.exit(totals.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
