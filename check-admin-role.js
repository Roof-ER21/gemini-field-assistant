/**
 * Script to check admin role in Railway PostgreSQL database
 * Run with: node check-admin-role.js
 */

import pg from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const { Pool } = pg;

// Connect to Railway PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkAdminRole() {
  try {
    console.log('🔍 Checking Railway PostgreSQL database...\n');

    // 1. Check what email is configured as admin
    const adminEmail = (process.env.EMAIL_ADMIN_ADDRESS || process.env.ADMIN_EMAIL || '').toLowerCase();
    console.log('📧 CONFIGURED ADMIN EMAIL (from env):', adminEmail || 'NOT SET');
    console.log('');

    // 2. Query all users to see who has admin role
    console.log('👥 ALL USERS IN DATABASE:');
    console.log('='.repeat(80));
    const allUsers = await pool.query('SELECT id, email, name, role, state, created_at FROM users ORDER BY created_at DESC');

    if (allUsers.rows.length === 0) {
      console.log('⚠️  NO USERS FOUND IN DATABASE!');
    } else {
      allUsers.rows.forEach((user, index) => {
        const isAdmin = user.role === 'admin';
        const badge = isAdmin ? '👑 ADMIN' : `📋 ${user.role}`;
        console.log(`${index + 1}. ${badge}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Name: ${user.name || 'N/A'}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   State: ${user.state || 'N/A'}`);
        console.log(`   Created: ${user.created_at}`);
        console.log('');
      });
    }

    // 3. Check if configured admin email exists in database
    console.log('='.repeat(80));
    console.log('🔍 CHECKING CONFIGURED ADMIN EMAIL...\n');

    if (!adminEmail) {
      console.log('❌ NO ADMIN EMAIL CONFIGURED IN ENVIRONMENT VARIABLES!');
      console.log('   Please set EMAIL_ADMIN_ADDRESS in .env.local or Railway environment variables');
    } else {
      const adminUser = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
        [adminEmail]
      );

      if (adminUser.rows.length === 0) {
        console.log(`❌ ADMIN EMAIL "${adminEmail}" NOT FOUND IN DATABASE!`);
        console.log('   The user needs to log in first to create their account.');
      } else {
        const user = adminUser.rows[0];
        console.log(`✅ ADMIN USER FOUND: ${user.email}`);
        console.log(`   Name: ${user.name}`);
        console.log(`   Current Role: ${user.role}`);
        console.log(`   State: ${user.state || 'N/A'}`);
        console.log('');

        if (user.role !== 'admin') {
          console.log('⚠️  WARNING: User exists but does NOT have admin role!');
          console.log(`   Current role: ${user.role}`);
          console.log('');
          console.log('🔧 SQL FIX:');
          console.log(`   UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER('${adminEmail}');`);
        } else {
          console.log('✅ User has correct admin role!');
        }
      }
    }

    // 4. List all admin users
    console.log('');
    console.log('='.repeat(80));
    console.log('👑 USERS WITH ADMIN ROLE:');
    console.log('='.repeat(80));
    const adminUsers = await pool.query(
      "SELECT id, email, name, role, created_at FROM users WHERE role = 'admin' ORDER BY created_at"
    );

    if (adminUsers.rows.length === 0) {
      console.log('❌ NO ADMIN USERS FOUND IN DATABASE!');
      console.log('');
      console.log('🔧 TO FIX: Run this SQL command:');
      if (adminEmail) {
        console.log(`   UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER('${adminEmail}');`);
      } else {
        console.log(`   UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER('your-email@example.com');`);
      }
    } else {
      adminUsers.rows.forEach((admin, index) => {
        console.log(`${index + 1}. ${admin.email}`);
        console.log(`   Name: ${admin.name || 'N/A'}`);
        console.log(`   ID: ${admin.id}`);
        console.log(`   Created: ${admin.created_at}`);
        console.log('');
      });
    }

    // 5. Check auto-login token email (from authService localStorage simulation)
    console.log('='.repeat(80));
    console.log('📱 CURRENT LOGIN STATUS:');
    console.log('='.repeat(80));
    console.log('Check browser localStorage for:');
    console.log('  - s21_auth_token (contains user info and email)');
    console.log('  - s21_auth_user (current user)');
    console.log('');
    console.log('To check in browser console:');
    console.log('  JSON.parse(localStorage.getItem("s21_auth_token")).user.email');
    console.log('');

    // 6. Generate SQL fix command
    console.log('='.repeat(80));
    console.log('🔧 QUICK FIX SQL COMMANDS:');
    console.log('='.repeat(80));
    if (adminEmail) {
      console.log('-- Set your configured admin email to admin role:');
      console.log(`UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER('${adminEmail}');`);
      console.log('');
      console.log('-- Verify the change:');
      console.log(`SELECT email, role FROM users WHERE LOWER(email) = LOWER('${adminEmail}');`);
    } else {
      console.log('-- Replace YOUR_EMAIL with your actual email:');
      console.log(`UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER('YOUR_EMAIL@example.com');`);
    }
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('');
    console.error('Make sure DATABASE_URL or POSTGRES_URL is set in .env.local or Railway environment');
  } finally {
    await pool.end();
  }
}

// Run the check
checkAdminRole();
