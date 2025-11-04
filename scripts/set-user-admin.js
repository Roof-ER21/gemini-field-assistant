/**
 * Script to set a user's role to admin
 * Usage:
 *   - Local: node scripts/set-user-admin.js <email>
 *   - Railway: railway run node scripts/set-user-admin.js <email>
 */

import pg from 'pg';

// Try to load dotenv if running locally (optional)
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.local' });
} catch (e) {
  // dotenv not available (Railway environment) - use env vars directly
}

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setUserAdmin(email) {
  if (!email) {
    console.error('❌ Error: Email is required');
    console.log('Usage: node scripts/set-user-admin.js <email>');
    process.exit(1);
  }

  try {
    console.log(`🔍 Looking for user: ${email}`);

    // Check if user exists
    const checkResult = await pool.query(
      'SELECT id, email, name, role FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (checkResult.rows.length === 0) {
      console.error(`❌ User not found: ${email}`);
      console.log('\n💡 Tip: The user must log in at least once before being promoted to admin.');
      process.exit(1);
    }

    const user = checkResult.rows[0];
    console.log(`✅ Found user: ${user.name} (${user.email})`);
    console.log(`   Current role: ${user.role}`);

    if (user.role === 'admin') {
      console.log('ℹ️  User is already an admin.');
      process.exit(0);
    }

    // Update user role to admin
    const updateResult = await pool.query(
      `UPDATE users
       SET role = 'admin', updated_at = CURRENT_TIMESTAMP
       WHERE email = $1
       RETURNING id, email, name, role`,
      [email.toLowerCase()]
    );

    const updatedUser = updateResult.rows[0];
    console.log('\n✅ Success! User promoted to admin:');
    console.log(`   Name: ${updatedUser.name}`);
    console.log(`   Email: ${updatedUser.email}`);
    console.log(`   New role: ${updatedUser.role}`);
    console.log('\n🔒 The user will now have access to the Admin Panel.');
    console.log('   They may need to log out and log back in to see the changes.');

  } catch (error) {
    console.error('❌ Error updating user role:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Get email from command line arguments
const email = process.argv[2];
setUserAdmin(email);
