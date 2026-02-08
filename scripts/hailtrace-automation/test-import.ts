#!/usr/bin/env ts-node
/**
 * HailTrace Import Test Script
 *
 * This script demonstrates how to test the HailTrace import service
 * independently or integrate it with your automation.
 *
 * Usage:
 *   ts-node test-import.ts [filepath]
 *   ts-node test-import.ts  # Uses sample-export.json
 */

import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { hailtraceImportService } from '../../server/services/hailtraceImportService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🔍 HailTrace Import Test');
  console.log('========================\n');

  // Get filepath from command line or use sample
  const filepath = process.argv[2] || path.join(__dirname, 'hailtrace-exports', 'sample-export.json');
  console.log(`📁 Import file: ${filepath}\n`);

  // Initialize database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Test database connection
    console.log('🔌 Connecting to database...');
    const dbTest = await pool.query('SELECT NOW()');
    console.log(`✅ Database connected at ${dbTest.rows[0].now}\n`);

    // Initialize the import service
    console.log('🚀 Initializing HailTrace import service...');
    hailtraceImportService.initialize(pool);
    console.log('✅ Service initialized\n');

    // Check current status
    console.log('📊 Current Status:');
    const statusBefore = await hailtraceImportService.getStatus();
    console.log(`   - Total imported: ${statusBefore.totalImported}`);
    console.log(`   - Last import: ${statusBefore.lastImportDate || 'Never'}`);
    console.log(`   - Watching: ${statusBefore.watching}`);
    console.log(`   - Pending files: ${statusBefore.pendingFiles.length}\n`);

    // Import the file
    console.log('📥 Importing events...');
    const result = await hailtraceImportService.importFromFile(filepath);

    console.log('\n📋 Import Results:');
    console.log(`   - Success: ${result.success}`);
    console.log(`   - Imported: ${result.imported}`);
    console.log(`   - Duplicates: ${result.duplicates}`);
    console.log(`   - Skipped: ${result.skipped}`);
    console.log(`   - Filename: ${result.filename}`);

    if (result.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      result.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
    }

    // Check status after import
    console.log('\n📊 Status After Import:');
    const statusAfter = await hailtraceImportService.getStatus();
    console.log(`   - Total imported: ${statusAfter.totalImported}`);
    console.log(`   - Last import: ${statusAfter.lastImportDate}\n`);

    // Get import statistics
    console.log('📈 Import Statistics:');
    const stats = await hailtraceImportService.getImportStats();
    stats.slice(0, 5).forEach((stat, i) => {
      console.log(`\n   ${i + 1}. ${stat.source_file}`);
      console.log(`      Events: ${stat.event_count}`);
      console.log(`      Date range: ${stat.earliest_event} to ${stat.latest_event}`);
      console.log(`      Avg hail size: ${stat.avg_hail_size ? Number(stat.avg_hail_size).toFixed(2) : 'N/A'}""`);
      console.log(`      Max hail size: ${stat.max_hail_size ? Number(stat.max_hail_size).toFixed(2) : 'N/A'}""`);
      console.log(`      Imported: ${new Date(stat.imported_at).toLocaleString()}`);
    });

    // Get recent events
    console.log('\n\n🌩️  Recent HailTrace Events (Last 5):');
    const events = await hailtraceImportService.getEvents({ limit: 5 });
    events.forEach((event, i) => {
      console.log(`\n   ${i + 1}. ${event.date} - ${event.source}`);
      console.log(`      ID: ${event.id}`);
      console.log(`      Hail size: ${event.hailSize ? event.hailSize.toFixed(2) : 'N/A'}""`);
      console.log(`      Wind speed: ${event.windSpeed || 'N/A'} mph`);
      console.log(`      Severity: ${event.severity}`);
      console.log(`      Location: ${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`);
    });

    console.log('\n\n✅ Test completed successfully!');
    console.log('\n💡 Next Steps:');
    console.log('   1. Start file watching: POST /api/hail/hailtrace-watch {"action": "start"}');
    console.log('   2. Check status: GET /api/hail/hailtrace-status');
    console.log('   3. Query events: GET /api/hail/hailtrace-events?minHailSize=2');
    console.log('   4. View stats: GET /api/hail/hailtrace-stats\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
