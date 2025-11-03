/**
 * Seed insurance_companies table with initial data
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL or POSTGRES_URL not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seed() {
  const seedPath = path.join(__dirname, '../database/insurance_companies.seed.json');
  const raw = fs.readFileSync(seedPath, 'utf-8');
  const items = JSON.parse(raw);

  console.log(`🌱 Seeding ${items.length} insurance companies...`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const it of items) {
      await client.query(
        `INSERT INTO insurance_companies (name, state, phone, email, address, website, notes, category)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [it.name, it.state, it.phone || null, it.email || null, it.address || null, it.website || null, it.notes || null, it.category || null]
      );
    }
    await client.query('COMMIT');
    console.log('✅ Seeding complete');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding error:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

