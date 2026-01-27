/**
 * Script to list all users in the database
 * Usage:
 *   - Local: node scripts/list-users.js
 *   - Railway: railway run node scripts/list-users.js
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import fs from 'fs';

// Load .env.local if it exists, otherwise load .env
const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env';
dotenv.config({ path: envPath });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function listUsers() {
  try {
    console.log('📋 Fetching all users...\n');

    const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.state,
        u.created_at,
        u.last_login_at,
        COUNT(DISTINCT ch.id) as total_messages
      FROM users u
      LEFT JOIN chat_history ch ON u.id = ch.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    if (result.rows.length === 0) {
      console.log('No users found in the database.');
      return;
    }

    console.log(`Found ${result.rows.length} user(s):\n`);
    console.log('─'.repeat(120));
    console.log(
      'Email'.padEnd(35) +
      'Name'.padEnd(25) +
      'Role'.padEnd(15) +
      'State'.padEnd(10) +
      'Messages'.padEnd(12) +
      'Last Login'
    );
    console.log('─'.repeat(120));

    result.rows.forEach((user) => {
      const email = user.email.padEnd(35);
      const name = (user.name || 'N/A').padEnd(25);
      const role = user.role.padEnd(15);
      const state = (user.state || 'N/A').padEnd(10);
      const messages = user.total_messages.toString().padEnd(12);
      const lastLogin = user.last_login_at
        ? new Date(user.last_login_at).toLocaleString()
        : 'Never';

      console.log(`${email}${name}${role}${state}${messages}${lastLogin}`);
    });

    console.log('─'.repeat(120));
    console.log(`\n💡 To promote a user to admin, run:`);
    console.log('   node scripts/set-user-admin.js <email>');

  } catch (error) {
    console.error('❌ Error fetching users:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

listUsers();
