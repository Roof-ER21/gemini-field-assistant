#!/usr/bin/env node

/**
 * SA21 Database Audit Script
 * Checks Railway PostgreSQL schema and connectivity
 */

import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = 'postgresql://postgres:RNNiLPPQGUpCGIGIESYjlNQqGajUCPhb@hopper.proxy.rlwy.net:15533/railway';

async function auditDatabase() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to Railway PostgreSQL...\n');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    // 1. Check sms_notifications table
    console.log('=' .repeat(70));
    console.log('1️⃣  SMS_NOTIFICATIONS TABLE');
    console.log('=' .repeat(70));

    const smsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sms_notifications'
      );
    `);

    if (smsTableExists.rows[0].exists) {
      console.log('✅ Table exists\n');

      // Get columns
      const smsColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'sms_notifications'
        ORDER BY ordinal_position;
      `);

      console.log('Columns:');
      smsColumns.rows.forEach(col => {
        console.log(`  - ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });

      // Get row count
      const smsCount = await client.query('SELECT COUNT(*) FROM sms_notifications');
      console.log(`\nRow count: ${smsCount.rows[0].count}`);

      // Get recent records
      const recentSms = await client.query(`
        SELECT id, user_id, phone_number, message_body, status, created_at
        FROM sms_notifications
        ORDER BY created_at DESC
        LIMIT 5
      `);

      if (recentSms.rows.length > 0) {
        console.log('\nRecent 5 records:');
        recentSms.rows.forEach(row => {
          console.log(`  [${row.id}] ${row.phone_number} - ${row.status} - ${row.created_at}`);
        });
      }
    } else {
      console.log('❌ Table does NOT exist');
    }

    // 2. Check hailtrace_events table
    console.log('\n' + '=' .repeat(70));
    console.log('2️⃣  HAILTRACE_EVENTS TABLE');
    console.log('=' .repeat(70));

    const hailtraceTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'hailtrace_events'
      );
    `);

    if (hailtraceTableExists.rows[0].exists) {
      console.log('✅ Table exists\n');

      const hailtraceColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'hailtrace_events'
        ORDER BY ordinal_position;
      `);

      console.log('Columns:');
      hailtraceColumns.rows.forEach(col => {
        console.log(`  - ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });

      const hailtraceCount = await client.query('SELECT COUNT(*) FROM hailtrace_events');
      console.log(`\nRow count: ${hailtraceCount.rows[0].count}`);

      // Get recent events
      const recentEvents = await client.query(`
        SELECT id, event_id, event_date, latitude, longitude, max_size, created_at
        FROM hailtrace_events
        ORDER BY created_at DESC
        LIMIT 5
      `);

      if (recentEvents.rows.length > 0) {
        console.log('\nRecent 5 events:');
        recentEvents.rows.forEach(row => {
          console.log(`  [${row.id}] Event ${row.event_id} - ${row.event_date} - ${row.max_size}" - (${row.latitude}, ${row.longitude})`);
        });
      }
    } else {
      console.log('❌ Table does NOT exist');
    }

    // 3. Check users with sms_alerts_enabled
    console.log('\n' + '=' .repeat(70));
    console.log('3️⃣  USERS WITH SMS ALERTS ENABLED');
    console.log('=' .repeat(70));

    const usersTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);

    if (usersTableExists.rows[0].exists) {
      // Check if sms_alerts_enabled column exists
      const smsAlertColumnExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'users'
          AND column_name = 'sms_alerts_enabled'
        );
      `);

      if (smsAlertColumnExists.rows[0].exists) {
        const usersWithSms = await client.query(`
          SELECT id, email, phone_number, sms_alerts_enabled, created_at
          FROM users
          WHERE sms_alerts_enabled = true
          ORDER BY created_at DESC
        `);

        console.log(`✅ Found ${usersWithSms.rows.length} users with SMS alerts enabled\n`);

        if (usersWithSms.rows.length > 0) {
          console.log('Users:');
          usersWithSms.rows.forEach(user => {
            console.log(`  [${user.id}] ${user.email} - ${user.phone_number || 'NO PHONE'}`);
          });
        }
      } else {
        console.log('❌ Column sms_alerts_enabled does NOT exist in users table');
      }
    } else {
      console.log('❌ Users table does NOT exist');
    }

    // 4. Check impact_alerts table for sms_sent column
    console.log('\n' + '=' .repeat(70));
    console.log('4️⃣  IMPACT_ALERTS TABLE');
    console.log('=' .repeat(70));

    const impactAlertsExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'impact_alerts'
      );
    `);

    if (impactAlertsExists.rows[0].exists) {
      console.log('✅ Table exists\n');

      const impactColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'impact_alerts'
        ORDER BY ordinal_position;
      `);

      console.log('Columns:');
      impactColumns.rows.forEach(col => {
        console.log(`  - ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });

      // Check if sms_sent column exists
      const smsSentExists = impactColumns.rows.find(col => col.column_name === 'sms_sent');
      if (smsSentExists) {
        console.log('\n✅ sms_sent column exists');
      } else {
        console.log('\n❌ sms_sent column does NOT exist');
      }

      const impactCount = await client.query('SELECT COUNT(*) FROM impact_alerts');
      console.log(`\nRow count: ${impactCount.rows[0].count}`);
    } else {
      console.log('❌ Table does NOT exist');
    }

    // 5. Check customer_properties table
    console.log('\n' + '=' .repeat(70));
    console.log('5️⃣  CUSTOMER_PROPERTIES TABLE');
    console.log('=' .repeat(70));

    const propertiesExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'customer_properties'
      );
    `);

    if (propertiesExists.rows[0].exists) {
      console.log('✅ Table exists\n');

      const propColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'customer_properties'
        ORDER BY ordinal_position;
      `);

      console.log('Columns:');
      propColumns.rows.forEach(col => {
        console.log(`  - ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });

      const propCount = await client.query('SELECT COUNT(*) FROM customer_properties');
      console.log(`\nRow count: ${propCount.rows[0].count}`);

      // Sample properties
      const sampleProps = await client.query(`
        SELECT id, user_id, address, latitude, longitude, created_at
        FROM customer_properties
        ORDER BY created_at DESC
        LIMIT 5
      `);

      if (sampleProps.rows.length > 0) {
        console.log('\nRecent 5 properties:');
        sampleProps.rows.forEach(prop => {
          console.log(`  [${prop.id}] User ${prop.user_id} - ${prop.address} - (${prop.latitude}, ${prop.longitude})`);
        });
      }
    } else {
      console.log('❌ Table does NOT exist');
    }

    // 6. Check for migrations table
    console.log('\n' + '=' .repeat(70));
    console.log('6️⃣  DATABASE MIGRATIONS');
    console.log('=' .repeat(70));

    const migrationsExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('migrations', 'schema_migrations', 'knex_migrations')
      );
    `);

    if (migrationsExists.rows[0].exists) {
      console.log('✅ Migrations table exists\n');

      // Try to get migration records
      const migrationTables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('migrations', 'schema_migrations', 'knex_migrations')
      `);

      for (const table of migrationTables.rows) {
        console.log(`Checking ${table.table_name}...`);
        const migrations = await client.query(`SELECT * FROM ${table.table_name} ORDER BY id DESC LIMIT 10`);
        if (migrations.rows.length > 0) {
          console.log(`Recent migrations:`);
          migrations.rows.forEach(mig => {
            console.log(`  - ${JSON.stringify(mig)}`);
          });
        }
      }
    } else {
      console.log('⚠️  No migrations table found');
    }

    // 7. List all tables
    console.log('\n' + '=' .repeat(70));
    console.log('7️⃣  ALL TABLES IN DATABASE');
    console.log('=' .repeat(70));

    const allTables = await client.query(`
      SELECT table_name,
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(`\nTotal tables: ${allTables.rows.length}\n`);
    allTables.rows.forEach(table => {
      console.log(`  📋 ${table.table_name.padEnd(35)} (${table.column_count} columns)`);
    });

    // 8. Check for any foreign key constraints
    console.log('\n' + '=' .repeat(70));
    console.log('8️⃣  FOREIGN KEY CONSTRAINTS');
    console.log('=' .repeat(70));

    const foreignKeys = await client.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name;
    `);

    if (foreignKeys.rows.length > 0) {
      console.log(`\nFound ${foreignKeys.rows.length} foreign key constraints:\n`);
      foreignKeys.rows.forEach(fk => {
        console.log(`  ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      });
    } else {
      console.log('\n⚠️  No foreign key constraints found');
    }

    console.log('\n' + '=' .repeat(70));
    console.log('✅ Database audit complete!');
    console.log('=' .repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ Error during database audit:');
    console.error(error.message);
    console.error('\nFull error:', error);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed.\n');
  }
}

// Run the audit
auditDatabase().catch(console.error);
