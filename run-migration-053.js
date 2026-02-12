/**
 * Run Migration 053 - DocuSeal E-Signature Integration
 * Adds DocuSeal tracking columns to the agreements table
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
  console.log('🔄 Running Migration 053: DocuSeal E-Signature Integration...\n');

  try {
    const migrationPath = path.join(__dirname, 'database', 'migrations', '053_docuseal_integration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(migrationSQL);

    console.log('✅ Migration 053 completed successfully!\n');

    // Verify the changes
    console.log('📊 Verifying migration...\n');

    const columnsCheck = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'agreements'
      AND column_name IN ('docuseal_submission_id', 'docuseal_slug', 'signed_pdf_url', 'signing_method')
      ORDER BY column_name;
    `);

    console.log('Agreements table DocuSeal columns:');
    columnsCheck.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name} (${row.data_type})${row.column_default ? ` default: ${row.column_default}` : ''}`);
    });

    if (columnsCheck.rows.length === 4) {
      console.log('\n✅ All DocuSeal columns verified!\n');
    } else {
      console.log(`\n⚠️  Expected 4 columns, found ${columnsCheck.rows.length}\n`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
