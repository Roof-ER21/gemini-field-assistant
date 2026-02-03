/**
 * Run Migration 047 - SMS Alerts
 * Adds SMS notification support to the Impacted Assets system
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  console.log('🔄 Running Migration 047: SMS Alerts...\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'database', 'migrations', '047_sms_alerts.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Run migration
    await pool.query(migrationSQL);

    console.log('\n✅ Migration 047 completed successfully!\n');

    // Verify the changes
    console.log('📊 Verifying migration...\n');

    // Check if columns were added to users table
    const usersCheck = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('phone_number', 'sms_alerts_enabled')
      ORDER BY column_name;
    `);

    console.log('Users table SMS columns:');
    usersCheck.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name} (${row.data_type})`);
    });

    // Check if columns were added to impact_alerts table
    const alertsCheck = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'impact_alerts'
      AND column_name IN ('sms_sent', 'sms_sent_at', 'sms_message_sid')
      ORDER BY column_name;
    `);

    console.log('\nImpact alerts table SMS columns:');
    alertsCheck.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name} (${row.data_type})`);
    });

    // Check if sms_notifications table was created
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'sms_notifications'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('\n✓ SMS notifications table created');

      // Get column count
      const columnCount = await pool.query(`
        SELECT COUNT(*) as count
        FROM information_schema.columns
        WHERE table_name = 'sms_notifications';
      `);

      console.log(`  Columns: ${columnCount.rows[0].count}`);
    }

    console.log('\n✅ All SMS alert components verified!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
