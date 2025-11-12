/**
 * Script to create the Baby Malik celebration announcement
 * Run this with: node scripts/create-baby-malik-announcement.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createBabyMalikAnnouncement() {
  try {
    // Set the time to today at 11:11 AM Eastern Time
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    // 11:11 AM Eastern Time (UTC-5 or UTC-4 depending on DST)
    // Using America/New_York timezone
    const startTime = `${year}-${month}-${day}T11:11:00-05:00`;

    console.log('Creating Baby Malik announcement for:', startTime);

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

    console.log('✅ Announcement created successfully!');
    console.log('Announcement details:', result.rows[0]);
    console.log('\nThe announcement will appear for all logged-in users at or after 11:11 AM Eastern Time today.');
    console.log('Users can dismiss it, and it will not reappear for them.');

    await pool.end();
  } catch (error) {
    console.error('❌ Error creating announcement:', error);
    await pool.end();
    process.exit(1);
  }
}

createBabyMalikAnnouncement();
