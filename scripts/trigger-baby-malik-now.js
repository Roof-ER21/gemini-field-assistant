/**
 * Script to trigger Baby Malik celebration announcement immediately
 * This sets the start_time to NOW so it appears right away for all logged-in users
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

async function triggerBabyMalikAnnouncementNow() {
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

    // Check if announcement already exists
    console.log('\n✓ Checking for existing Baby Malik announcement...');
    const existingCheck = await pool.query(
      `SELECT id, title, start_time, is_active FROM announcements
       WHERE title LIKE '%Baby Malik%' OR title LIKE '%baby Malik%'
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (existingCheck.rows.length > 0) {
      const existing = existingCheck.rows[0];
      console.log('\n📢 Found existing Baby Malik announcement!');
      console.log('   ID:', existing.id);
      console.log('   Title:', existing.title);
      console.log('   Start Time:', existing.start_time);
      console.log('   Active:', existing.is_active);

      // Update it to trigger NOW
      console.log('\n🔄 Updating announcement to trigger immediately...');
      const updateResult = await pool.query(
        `UPDATE announcements
         SET start_time = NOW(), is_active = true
         WHERE id = $1
         RETURNING *`,
        [existing.id]
      );

      console.log('\n✅ Announcement updated and triggered!');
      console.log('\n📋 Updated announcement details:');
      console.log('   ID:', updateResult.rows[0].id);
      console.log('   Title:', updateResult.rows[0].title);
      console.log('   Start Time:', updateResult.rows[0].start_time);
      console.log('   Active:', updateResult.rows[0].is_active);
    } else {
      // Create new announcement starting NOW
      console.log('\n✓ Creating new Baby Malik announcement starting NOW...');

      const result = await pool.query(
        `INSERT INTO announcements (title, message, type, start_time, is_active)
         VALUES ($1, $2, $3, NOW(), $4)
         RETURNING *`,
        [
          '🎉 Welcome Baby Malik! 🎉',
          'Congratulations on the arrival of baby Malik born 11/11/25! This is a special moment worth celebrating. 💙',
          'celebration',
          true
        ]
      );

      console.log('\n✅ Announcement created and triggered successfully!');
      console.log('\n📋 Announcement details:');
      console.log('   ID:', result.rows[0].id);
      console.log('   Title:', result.rows[0].title);
      console.log('   Type:', result.rows[0].type);
      console.log('   Start Time:', result.rows[0].start_time);
      console.log('   Active:', result.rows[0].is_active);
    }

    console.log('\n🎉 The announcement is now LIVE and will appear for all logged-in users!');
    console.log('\n⏱️  Users will see it within 30 seconds (next polling cycle)');
    console.log('💡 Users can dismiss it, and it will not reappear for them.');
    console.log('\n🔍 To verify, check:');
    console.log('   GET /api/announcements/active');

    await pool.end();
  } catch (error) {
    console.error('\n❌ Error triggering announcement:');
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

triggerBabyMalikAnnouncementNow();
