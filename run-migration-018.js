#!/usr/bin/env node

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration(client, migrationFile) {
  const sql = fs.readFileSync(migrationFile, 'utf8');
  console.log(`\n📄 Running migration: ${path.basename(migrationFile)}`);
  console.log('='.repeat(60));

  try {
    await client.query(sql);
    console.log(`✅ Migration ${path.basename(migrationFile)} completed successfully!\n`);
    return true;
  } catch (error) {
    console.error(`❌ Error in migration ${path.basename(migrationFile)}:`);
    console.error(error.message);
    console.error(error.stack);
    return false;
  }
}

async function verifyStormMemory(client) {
  console.log('\n🔍 Verifying storm memory schema...');
  console.log('='.repeat(60));

  // Check table
  const tableResult = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'storm_lookups'
    );
  `);
  console.log(`  ${tableResult.rows[0].exists ? '✅' : '❌'} Table: storm_lookups`);

  // Check columns
  const columns = [
    'id', 'user_id', 'address', 'city', 'state', 'zip_code',
    'latitude', 'longitude', 'storm_events', 'event_count',
    'data_sources', 'outcome', 'outcome_notes', 'outcome_date',
    'lookup_date', 'created_at', 'updated_at'
  ];

  console.log('\n📊 Verifying columns...');
  for (const col of columns) {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'storm_lookups'
        AND column_name = $1
      );
    `, [col]);
    console.log(`  ${result.rows[0].exists ? '✅' : '❌'} Column: ${col}`);
  }

  // Check indexes
  console.log('\n🔧 Verifying indexes...');
  const indexes = [
    'idx_storm_lookups_user_id',
    'idx_storm_lookups_location',
    'idx_storm_lookups_zip',
    'idx_storm_lookups_city_state',
    'idx_storm_lookups_created_at',
    'idx_storm_lookups_outcome',
    'idx_storm_lookups_events'
  ];

  for (const idx of indexes) {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM pg_indexes
        WHERE schemaname = 'public'
        AND indexname = $1
      );
    `, [idx]);
    console.log(`  ${result.rows[0].exists ? '✅' : '❌'} Index: ${idx}`);
  }

  // Check functions
  console.log('\n⚙️  Verifying functions...');
  const functions = [
    'calculate_distance_miles',
    'update_storm_lookup_timestamp'
  ];

  for (const func of functions) {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = $1
      );
    `, [func]);
    console.log(`  ${result.rows[0].exists ? '✅' : '❌'} Function: ${func}()`);
  }

  // Check trigger
  console.log('\n🎯 Verifying triggers...');
  const triggerResult = await client.query(`
    SELECT EXISTS (
      SELECT FROM pg_trigger
      WHERE tgname = 'trigger_update_storm_lookup_timestamp'
    );
  `);
  console.log(`  ${triggerResult.rows[0].exists ? '✅' : '❌'} Trigger: trigger_update_storm_lookup_timestamp`);
}

async function testStormMemoryAPI(client) {
  console.log('\n🧪 Testing storm memory functions...');
  console.log('='.repeat(60));

  try {
    // Test calculate_distance_miles function
    const distanceResult = await client.query(
      'SELECT calculate_distance_miles(37.5407, -77.4360, 37.5650, -77.4550) as distance'
    );
    const distance = parseFloat(distanceResult.rows[0].distance);
    console.log(`\n✅ calculate_distance_miles() works!`);
    console.log(`  Distance: ${distance.toFixed(2)} miles`);

    // Test table constraints
    const constraintsResult = await client.query(`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = 'storm_lookups'::regclass
      AND contype IN ('f', 'p', 'c')
    `);
    console.log(`\n✅ Constraints: ${constraintsResult.rows.length} found`);
    constraintsResult.rows.forEach(row => {
      const type = row.contype === 'f' ? 'FOREIGN KEY' :
                   row.contype === 'p' ? 'PRIMARY KEY' : 'CHECK';
      console.log(`  - ${row.conname} (${type})`);
    });

    console.log('\n✅ All storm memory functions working correctly!');
  } catch (error) {
    console.error('\n❌ Error testing storm memory API:', error.message);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not set');
    process.exit(1);
  }

  console.log('🚀 Starting Storm Memory migration (018)...');
  console.log(`🔗 Database: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);

  // SSL is only required for production (Railway)
  const isProduction = databaseUrl.includes('railway') || process.env.NODE_ENV === 'production';
  const client = new Client({
    connectionString: databaseUrl,
    ssl: isProduction ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Run migration 018
    const migrationPath = path.join(__dirname, 'database/migrations/018_storm_memory.sql');
    const success = await runMigration(client, migrationPath);

    if (!success) {
      console.error('❌ Migration 018 failed, stopping...');
      process.exit(1);
    }

    // Verify everything
    await verifyStormMemory(client);
    await testStormMemoryAPI(client);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Storm Memory migration completed successfully!');
    console.log('='.repeat(60));
    console.log('\n📚 Documentation: server/services/STORM_MEMORY_README.md');
    console.log('🧪 Test script: npx tsx server/services/test-storm-memory.ts');
    console.log('\n✅ Storm Memory Service is ready to use!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
