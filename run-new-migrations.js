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
  console.log('=' .repeat(60));

  try {
    await client.query(sql);
    console.log(`✅ Migration ${path.basename(migrationFile)} completed successfully!\n`);
    return true;
  } catch (error) {
    console.error(`❌ Error in migration ${path.basename(migrationFile)}:`);
    console.error(error.message);
    // Continue despite errors (tables may already exist)
    return false;
  }
}

async function verifyNewTables(client) {
  console.log('\n🔍 Verifying new tables...');
  console.log('=' .repeat(60));

  const tables = [
    // 020 - Canvassing
    'canvassing_status',
    'canvassing_sessions',
    'canvassing_activity_log',
    // 021 - Impacted Assets
    'customer_properties',
    'impact_alerts',
    'storm_monitoring_runs',
    // 022 - Push Tokens
    'push_tokens',
    'push_notification_log',
    'notification_preferences'
  ];

  for (const tableName of tables) {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      );
    `, [tableName]);

    const exists = result.rows[0].exists;
    console.log(`  ${exists ? '✅' : '❌'} Table: ${tableName}`);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not set');
    process.exit(1);
  }

  console.log('🚀 Running new migrations (020, 021, 022)...');
  console.log(`🔗 Database: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);

  const isProduction = databaseUrl.includes('railway') || process.env.NODE_ENV === 'production';
  const client = new Client({
    connectionString: databaseUrl,
    ssl: isProduction ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Run migrations in order
    const migrations = [
      '020_canvassing_tracker.sql',
      '021_impacted_assets.sql',
      '022_push_tokens.sql'
    ];

    for (const migration of migrations) {
      const migrationPath = path.join(__dirname, 'database/migrations', migration);
      if (fs.existsSync(migrationPath)) {
        await runMigration(client, migrationPath);
      } else {
        console.error(`❌ Migration file not found: ${migrationPath}`);
      }
    }

    // Verify tables
    await verifyNewTables(client);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 New migrations completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
