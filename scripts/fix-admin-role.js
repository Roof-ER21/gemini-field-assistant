#!/usr/bin/env node
/**
 * Script to fix admin role in Railway PostgreSQL database
 * Usage: node scripts/fix-admin-role.js
 * Or via Railway: railway run node scripts/fix-admin-role.js
 */

import pg from 'pg';

const { Pool } = pg;

// Admin email to set
const ADMIN_EMAIL = 'ahmed.mahmoud@theroofdocs.com';

async function fixAdminRole() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔧 Fixing admin role in Railway PostgreSQL...\n');

    // 1. Check if user exists
    console.log(`📧 Admin Email: ${ADMIN_EMAIL}\n`);

    const existingUser = await pool.query(
      'SELECT id, email, name, role, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [ADMIN_EMAIL]
    );

    if (existingUser.rows.length === 0) {
      console.log(`❌ ERROR: User "${ADMIN_EMAIL}" NOT FOUND in database!`);
      console.log('\n📝 The user must log in first to create their account.');
      console.log('   After they log in, run this script again.\n');
      process.exit(1);
    }

    const user = existingUser.rows[0];

    console.log('='.repeat(80));
    console.log('👤 USER FOUND - CURRENT STATUS:');
    console.log('='.repeat(80));
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.name || 'N/A'}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Created: ${user.created_at}`);
    console.log('');

    if (user.role === 'admin') {
      console.log('✅ User already has admin role - no update needed!');
      console.log('');
    } else {
      // 2. Update role to admin
      console.log(`🔧 Updating role from "${user.role}" to "admin"...\n`);

      const updateResult = await pool.query(
        `UPDATE users
         SET role = 'admin', updated_at = NOW()
         WHERE LOWER(email) = LOWER($1)
         RETURNING email, role, updated_at`,
        [ADMIN_EMAIL]
      );

      if (updateResult.rows.length > 0) {
        console.log('✅ SUCCESS! Role updated to admin.');
        console.log(`   Updated at: ${updateResult.rows[0].updated_at}`);
        console.log('');
      } else {
        console.log('❌ Update failed!');
        console.log('');
      }
    }

    // 3. Show all admin users
    console.log('='.repeat(80));
    console.log('👑 ALL ADMIN USERS:');
    console.log('='.repeat(80));

    const admins = await pool.query(
      "SELECT email, name, role, created_at FROM users WHERE role = 'admin' ORDER BY created_at"
    );

    if (admins.rows.length === 0) {
      console.log('  (No admin users found)');
    } else {
      admins.rows.forEach((admin, index) => {
        console.log(`  ${index + 1}. ${admin.email}`);
        console.log(`     Name: ${admin.name || 'N/A'}`);
        console.log(`     Created: ${admin.created_at}`);
        console.log('');
      });
    }

    // 4. Show all users for reference
    console.log('='.repeat(80));
    console.log('📋 ALL USERS IN DATABASE:');
    console.log('='.repeat(80));

    const allUsers = await pool.query(
      'SELECT email, name, role, created_at FROM users ORDER BY created_at DESC'
    );

    allUsers.rows.forEach((u, index) => {
      const roleEmoji = u.role === 'admin' ? '👑' : '📋';
      console.log(`  ${index + 1}. ${roleEmoji} ${u.email} (${u.role})`);
    });

    console.log('\n✅ Admin role fix completed successfully!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('\nMake sure DATABASE_URL is set in Railway environment variables.\n');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
fixAdminRole();
