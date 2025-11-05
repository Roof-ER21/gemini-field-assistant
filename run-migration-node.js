#!/usr/bin/env node

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  // Read DATABASE_URL from environment (set by Railway CLI)
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
  }

  console.log('✅ Found DATABASE_URL');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'database/migrations/003_analytics_and_monitoring.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Read migration file: 003_analytics_and_monitoring.sql');
    console.log('🔄 Running migration...');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Created tables:');
    console.log('  - live_susan_sessions');
    console.log('  - transcriptions');
    console.log('  - document_uploads');
    console.log('  - concerning_chats');
    console.log('  - user_activity_enhanced (view)');
    console.log('  - daily_activity_metrics (view)');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
