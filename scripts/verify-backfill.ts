#!/usr/bin/env node
/**
 * verify-backfill.ts — audits verified_hail_events after backfill completes
 *
 * Runs a series of diagnostic queries and prints a full health report.
 * Safe: read-only. Does NOT modify data.
 *
 * Usage: railway run bash -c 'npx tsx scripts/verify-backfill.ts'
 */

import pg from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!databaseUrl) { console.error('DB URL required'); process.exit(1); }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') || databaseUrl.includes('amazonaws') ? { rejectUnauthorized: false } : false,
  });

  const divider = '═'.repeat(70);
  const title = (s: string) => { console.log(`\n${divider}\n ${s}\n${divider}`); };

  // ─── 1. Overall totals ───
  title('1. TOTALS');
  const totals = await pool.query(`
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(*) FILTER (WHERE hail_size_inches IS NOT NULL)::int AS hail_events,
      COUNT(*) FILTER (WHERE hail_size_inches >= 0.5)::int AS actionable_hail,
      COUNT(*) FILTER (WHERE hail_size_inches >= 1.0)::int AS hail_1in_plus,
      COUNT(*) FILTER (WHERE hail_size_inches >= 2.0)::int AS hail_2in_plus,
      COUNT(*) FILTER (WHERE wind_mph IS NOT NULL)::int AS wind_events,
      COUNT(*) FILTER (WHERE wind_mph >= 58)::int AS severe_wind,
      COUNT(*) FILTER (WHERE tornado_ef_rank IS NOT NULL)::int AS tornadoes,
      MIN(event_date) AS earliest,
      MAX(event_date) AS latest
    FROM verified_hail_events
  `);
  console.table(totals.rows);

  // ─── 2. Dedup integrity ───
  title('2. DEDUP INTEGRITY (must be 0 violations)');
  const dupes = await pool.query(`
    SELECT event_date, lat_bucket, lng_bucket, COUNT(*) AS n
    FROM verified_hail_events
    GROUP BY event_date, lat_bucket, lng_bucket
    HAVING COUNT(*) > 1
    LIMIT 5
  `);
  if (dupes.rows.length === 0) {
    console.log('✓ Zero duplicate (date, lat_bucket, lng_bucket) combinations');
  } else {
    console.log('✗ DEDUP FAILURE:', dupes.rows);
  }

  // ─── 3. By source ───
  title('3. BY SOURCE');
  const bySource = await pool.query(`SELECT * FROM verified_hail_events_stats_by_source WHERE event_count > 0 ORDER BY event_count DESC`);
  console.table(bySource.rows);

  // ─── 4. By confidence tier ───
  title('4. BY CONFIDENCE TIER');
  const byTier = await pool.query(`SELECT * FROM verified_hail_events_stats_by_tier`);
  console.table(byTier.rows);

  // ─── 5. By state/year ───
  title('5. BY STATE × YEAR (events)');
  const byStateYear = await pool.query(`
    SELECT state, EXTRACT(YEAR FROM event_date)::int AS year, COUNT(*)::int AS events
    FROM verified_hail_events
    WHERE state IS NOT NULL
    GROUP BY state, year
    ORDER BY year DESC, state
  `);
  console.table(byStateYear.rows);

  // ─── 6. Multi-source examples (proof of dedup/merge working) ───
  title('6. SAMPLE MULTI-SOURCE EVENTS (verification_count >= 3)');
  const multi = await pool.query(`
    SELECT event_date, state, latitude, longitude,
           hail_size_inches, wind_mph, verification_count, confidence_tier
    FROM verified_hail_events
    WHERE verification_count >= 3
    ORDER BY event_date DESC
    LIMIT 10
  `);
  console.table(multi.rows);

  // ─── 7. Sanity check: Vienna VA 4/20/2026 CoCoRaHS event ───
  title('7. VIENNA VA 4/20/2026 (CoCoRaHS-caught storm)');
  const vienna = await pool.query(`
    SELECT event_date, latitude, longitude, hail_size_inches,
           source_cocorahs, source_mrms, source_noaa_ncei, source_iem_lsr,
           verification_count, confidence_tier
    FROM verified_hail_events
    WHERE event_date = '2026-04-20'
      AND latitude BETWEEN 38.9 AND 39.0
      AND longitude BETWEEN -77.4 AND -77.2
  `);
  if (vienna.rows.length > 0) {
    console.log('✓ Vienna storm captured:');
    console.table(vienna.rows);
  } else {
    console.log('⚠ Vienna 4/20 not found — CoCoRaHS live ingest may be needed to catch this');
  }

  // ─── 8. Row-count budget check ───
  title('8. ROW COUNT BUDGET (should be in 100k-300k range)');
  const totalRows = totals.rows[0].total_events;
  if (totalRows < 50_000) {
    console.log(`⚠ Only ${totalRows} rows — expected ~100k+. Backfill may be incomplete.`);
  } else if (totalRows > 500_000) {
    console.log(`⚠ ${totalRows} rows — unexpectedly high. Investigate dedup.`);
  } else {
    console.log(`✓ ${totalRows} rows within expected range.`);
  }

  // ─── 9. Progress table ───
  title('9. BACKFILL PROGRESS TABLE');
  const progress = await pool.query(`
    SELECT source,
           COUNT(*)::int AS windows,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
           SUM(rows_inserted)::int AS total_new,
           SUM(rows_updated)::int AS total_updates
    FROM backfill_progress
    GROUP BY source
    ORDER BY source
  `);
  console.table(progress.rows);

  // ─── 10. Failed windows detail ───
  title('10. FAILED WINDOWS (need retry)');
  const failed = await pool.query(`
    SELECT source, window_key, error_detail
    FROM backfill_progress
    WHERE status = 'failed'
    ORDER BY source, window_key
    LIMIT 20
  `);
  if (failed.rows.length === 0) {
    console.log('✓ No failed windows in progress table.');
  } else {
    console.table(failed.rows);
  }

  await pool.end();
  console.log(`\n${divider}\n Verification complete.\n${divider}\n`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
