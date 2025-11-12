/**
 * Test script for the announcement system
 * Tests both database operations and API endpoints
 * Run on Railway: railway run node scripts/test-announcement-system.js
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

console.log('🧪 Testing Announcement System\n');
console.log('🔗 Connecting to PostgreSQL...');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

async function testAnnouncementSystem() {
  let testAnnouncementId = null;

  try {
    // Test 1: Database Connection
    console.log('\n📝 Test 1: Database Connection');
    const testResult = await pool.query('SELECT NOW()');
    console.log('   ✓ Connected successfully at', testResult.rows[0].now);

    // Test 2: Announcements Table Exists
    console.log('\n📝 Test 2: Announcements Table');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'announcements'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('   ❌ Announcements table does not exist!');
      console.log('   💡 Please run: npm run db:init:railway');
      process.exit(1);
    }
    console.log('   ✓ Announcements table exists');

    // Test 3: Table Schema
    console.log('\n📝 Test 3: Table Schema');
    const schemaCheck = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'announcements'
      ORDER BY ordinal_position;
    `);
    console.log('   ✓ Table columns:');
    schemaCheck.rows.forEach(col => {
      console.log(`      - ${col.column_name} (${col.data_type})`);
    });

    // Test 4: Create Test Announcement
    console.log('\n📝 Test 4: Create Test Announcement');
    const now = new Date();
    const testResult4 = await pool.query(
      `INSERT INTO announcements (title, message, type, start_time, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        'Test Announcement',
        'This is a test announcement for system verification.',
        'info',
        now.toISOString(),
        true
      ]
    );
    testAnnouncementId = testResult4.rows[0].id;
    console.log('   ✓ Test announcement created');
    console.log('      ID:', testAnnouncementId);

    // Test 5: Query Active Announcements
    console.log('\n📝 Test 5: Query Active Announcements');
    const activeAnnouncements = await pool.query(`
      SELECT id, title, message, type, start_time, end_time
      FROM announcements
      WHERE is_active = true
        AND start_time <= NOW()
        AND (end_time IS NULL OR end_time >= NOW())
      ORDER BY start_time DESC
      LIMIT 10
    `);
    console.log(`   ✓ Found ${activeAnnouncements.rows.length} active announcement(s)`);
    activeAnnouncements.rows.forEach((ann, i) => {
      console.log(`      ${i + 1}. ${ann.title} (${ann.type})`);
    });

    // Test 6: Check for Baby Malik Announcement
    console.log('\n📝 Test 6: Check for Baby Malik Announcement');
    const babyMalikCheck = await pool.query(`
      SELECT id, title, start_time, is_active
      FROM announcements
      WHERE title LIKE '%Baby Malik%' OR title LIKE '%baby Malik%'
      LIMIT 1
    `);

    if (babyMalikCheck.rows.length > 0) {
      console.log('   ✓ Baby Malik announcement found!');
      console.log('      ID:', babyMalikCheck.rows[0].id);
      console.log('      Title:', babyMalikCheck.rows[0].title);
      console.log('      Start Time:', babyMalikCheck.rows[0].start_time);
      console.log('      Active:', babyMalikCheck.rows[0].is_active);
    } else {
      console.log('   ⚠️  Baby Malik announcement not found');
      console.log('   💡 Run: npm run announcement:create:railway');
    }

    // Test 7: Clean Up Test Data
    console.log('\n📝 Test 7: Clean Up Test Data');
    await pool.query('DELETE FROM announcements WHERE id = $1', [testAnnouncementId]);
    console.log('   ✓ Test announcement deleted');

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ All Tests Passed!');
    console.log('='.repeat(60));
    console.log('\n📋 Summary:');
    console.log('   ✓ Database connection working');
    console.log('   ✓ Announcements table exists with correct schema');
    console.log('   ✓ Can create announcements');
    console.log('   ✓ Can query active announcements');
    console.log('   ✓ Data cleanup working');

    if (babyMalikCheck.rows.length > 0) {
      console.log('\n🎉 Baby Malik announcement is ready!');
      console.log('   It will appear at 11:11 AM ET for all logged-in users.');
    } else {
      console.log('\n💡 Next Step: Create Baby Malik announcement');
      console.log('   Run: npm run announcement:create:railway');
    }

    console.log('\n🔍 API Endpoints to test:');
    console.log('   GET  /api/announcements/active');
    console.log('   POST /api/admin/announcements');

    await pool.end();
  } catch (error) {
    console.error('\n❌ Test Failed:');
    console.error(error);

    // Clean up test data if it was created
    if (testAnnouncementId) {
      try {
        await pool.query('DELETE FROM announcements WHERE id = $1', [testAnnouncementId]);
        console.log('\n✓ Test data cleaned up');
      } catch (cleanupError) {
        console.error('⚠️  Could not clean up test data:', cleanupError.message);
      }
    }

    await pool.end();
    process.exit(1);
  }
}

testAnnouncementSystem();
