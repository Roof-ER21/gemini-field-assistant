/**
 * Analytics Migration Script
 * Runs the analytics and monitoring migration (003)
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.log('⚠️  No DATABASE_URL found, cannot run migration');
  process.exit(1);
}

console.log('🔄 Running analytics migration (003)...');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
});

async function runAnalyticsMigration() {
  const client = await pool.connect();

  try {
    console.log('✓ Connected to database');

    // Read the migration SQL file
    const migrationPath = join(__dirname, '..', 'database', 'migrations', '003_analytics_and_monitoring.sql');
    console.log('📝 Reading migration file:', migrationPath);

    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('🚀 Executing analytics migration...');
    await client.query(migrationSQL);

    console.log('✅ Analytics migration completed successfully');

    // Verify tables were created
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('live_susan_sessions', 'transcriptions', 'document_uploads', 'concerning_chats')
      ORDER BY table_name;
    `);

    console.log('📊 Tables created:');
    result.rows.forEach(row => {
      console.log('  ✓', row.table_name);
    });

    // Verify views were created
    const viewsResult = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      AND table_name IN ('user_activity_enhanced', 'daily_activity_metrics')
      ORDER BY table_name;
    `);

    console.log('📊 Views created:');
    viewsResult.rows.forEach(row => {
      console.log('  ✓', row.table_name);
    });

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runAnalyticsMigration()
  .then(() => {
    console.log('🎉 Analytics migration finished successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Analytics migration failed:', error);
    process.exit(1);
  });
