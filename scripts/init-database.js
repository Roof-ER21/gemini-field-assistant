/**
 * Database Initialization Script
 * Runs the schema.sql file on Railway PostgreSQL
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get database URL from environment
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL or POSTGRES_URL environment variable not set');
  process.exit(1);
}

console.log('🔗 Connecting to PostgreSQL...');

// Create connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Railway requires SSL
});

async function initializeDatabase() {
  try {
    // Test connection
    console.log('✓ Testing database connection...');
    const testResult = await pool.query('SELECT NOW()');
    console.log('✓ Connected successfully at', testResult.rows[0].now);

    // Read schema file
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    console.log('✓ Reading schema from:', schemaPath);
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute schema
    console.log('✓ Executing schema...');
    await pool.query(schema);
    console.log('✅ Database schema initialized successfully!');

    // Verify tables were created
    console.log('\n📊 Verifying tables...');
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('\n✅ Tables created:');
    tablesResult.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.table_name}`);
    });

    // Verify views
    const viewsResult = await pool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    if (viewsResult.rows.length > 0) {
      console.log('\n✅ Views created:');
      viewsResult.rows.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.table_name}`);
      });
    }

    // Check test user
    const userResult = await pool.query('SELECT * FROM users LIMIT 1');
    if (userResult.rows.length > 0) {
      console.log('\n✅ Test user created:', userResult.rows[0].email);
    }

    console.log('\n🎉 Database initialization complete!');

  } catch (error) {
    console.error('\n❌ Error initializing database:');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run initialization
initializeDatabase();
