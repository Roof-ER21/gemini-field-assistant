#!/usr/bin/env node

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('🚀 Running Migration 026: Push Tokens');
  console.log('='.repeat(60));

  // Use DATABASE_URL from environment or default to local
  const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/gemini_field';

  const client = new Client({
    connectionString,
    ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Read migration file
    const migrationPath = path.join(__dirname, 'database', 'migrations', '026_push_tokens.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n📄 Executing migration...');
    await client.query(sql);
    console.log('✅ Migration completed successfully!');

    // Verify tables were created
    console.log('\n🔍 Verifying tables...');
    const tables = ['push_tokens', 'notification_preferences', 'push_notification_log'];

    for (const tableName of tables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [tableName]);

      const exists = result.rows[0].exists;
      console.log(`  ${exists ? '✅' : '❌'} ${tableName}: ${exists ? 'Created' : 'MISSING'}`);
    }

    console.log('\n✅ Migration 026 complete!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
