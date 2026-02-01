/**
 * Run Migration 041: Add Revenue Goals
 * Adds monthly_revenue_goal and yearly_revenue_goal columns to sales_reps table
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
  try {
    console.log('🚀 Running Migration 041: Add Revenue Goals...\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'database', 'migrations', '041_add_revenue_goals.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await pool.query(sql);

    console.log('\n✅ Migration 041 completed successfully!');
    console.log('📊 Added columns: monthly_revenue_goal, yearly_revenue_goal');

    // Verify the columns were added
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sales_reps'
      AND column_name IN ('monthly_revenue_goal', 'yearly_revenue_goal')
      ORDER BY column_name;
    `);

    console.log('\n📋 Verification:');
    verifyResult.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type}): default = ${row.column_default}`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
