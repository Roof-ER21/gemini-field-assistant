/**
 * Script to create the Baby Malik celebration announcement
 * Run locally: node scripts/create-baby-malik-announcement.js
 * Run on Railway: railway run node scripts/create-baby-malik-announcement.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Get database URL from environment
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL or POSTGRES_URL environment variable not set');
  process.exit(1);
}

console.log('🔗 Connecting to PostgreSQL...');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

async function createBabyMalikAnnouncement() {
  try {
    // Test connection
    console.log('✓ Testing database connection...');
    const testResult = await pool.query('SELECT NOW()');
    console.log('✓ Connected successfully at', testResult.rows[0].now);

    // Verify announcements table exists
    console.log('\n✓ Verifying announcements table exists...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'announcements'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('❌ Announcements table does not exist!');
      console.log('💡 Please run: npm run db:init:railway');
      console.log('   This will create all database tables including announcements.');
      process.exit(1);
    }

    console.log('✓ Announcements table exists');

    // Set the time to today at 11:11 AM Eastern Time
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    // 11:11 AM Eastern Time (UTC-5 or UTC-4 depending on DST)
    // Using America/New_York timezone - adjust based on DST
    const isDST = today.getMonth() >= 2 && today.getMonth() <= 10; // Rough DST check
    const offset = isDST ? '-04:00' : '-05:00';
    const startTime = `${year}-${month}-${day}T11:11:00${offset}`;

    console.log('\n✓ Creating Baby Malik announcement for:', startTime);

    // Check if announcement already exists
    const existingCheck = await pool.query(
      `SELECT id, title FROM announcements
       WHERE title LIKE '%Baby Malik%' OR title LIKE '%baby Malik%'
       LIMIT 1`
    );

    if (existingCheck.rows.length > 0) {
      console.log('\n⚠️  Baby Malik announcement already exists!');
      console.log('   ID:', existingCheck.rows[0].id);
      console.log('   Title:', existingCheck.rows[0].title);
      console.log('\n💡 To create a new one, delete the existing announcement first:');
      console.log(`   DELETE FROM announcements WHERE id = '${existingCheck.rows[0].id}';`);

      await pool.end();
      return;
    }

    const result = await pool.query(
      `INSERT INTO announcements (title, message, type, start_time, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        '🎉 Welcome Baby Malik! 🎉',
        'Congratulations on the arrival of baby Malik to the world! This is a special moment worth celebrating. 💙',
        'celebration',
        startTime,
        true
      ]
    );

    console.log('\n✅ Announcement created successfully!');
    console.log('\n📋 Announcement details:');
    console.log('   ID:', result.rows[0].id);
    console.log('   Title:', result.rows[0].title);
    console.log('   Type:', result.rows[0].type);
    console.log('   Start Time:', result.rows[0].start_time);
    console.log('   Active:', result.rows[0].is_active);

    console.log('\n🎉 The announcement will appear for all logged-in users at or after:');
    console.log('   11:11 AM Eastern Time on', `${month}/${day}/${year}`);
    console.log('\n💡 Users can dismiss it, and it will not reappear for them.');
    console.log('\n🔍 To verify, visit:');
    console.log('   GET /api/announcements/active');

    await pool.end();
  } catch (error) {
    console.error('\n❌ Error creating announcement:');
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

createBabyMalikAnnouncement();
