/**
 * SMS Integration Test
 *
 * Tests the complete SMS alert flow:
 * 1. Create customer property
 * 2. Create impact alert
 * 3. Verify SMS sent automatically
 * 4. Check database logging
 *
 * Usage:
 *   export TEST_PHONE_NUMBER="+15551234567"
 *   export TEST_USER_EMAIL="test@example.com"
 *   npx tsx server/services/test-sms-integration.ts
 */

import { Pool } from 'pg';
import { createImpactedAssetService } from './impactedAssetService.js';
import { twilioService } from './twilioService.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testSMSIntegration() {
  console.log('\n🧪 SMS Integration Test Suite\n');
  console.log('='.repeat(60));

  try {
    // Initialize Twilio service
    twilioService.setPool(pool);

    // Check Twilio configuration
    const status = twilioService.getStatus();
    console.log('\n📊 Twilio Status:');
    console.log(JSON.stringify(status, null, 2));

    if (!status.configured) {
      console.log('\n⚠️  Twilio not configured. Skipping SMS tests.');
      await pool.end();
      return;
    }

    const testPhone = process.env.TEST_PHONE_NUMBER;
    const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';

    if (!testPhone) {
      console.log('\n⚠️  Set TEST_PHONE_NUMBER to run integration test');
      await pool.end();
      return;
    }

    console.log('\n📱 Test Configuration:');
    console.log(`  Phone: ${testPhone}`);
    console.log(`  Email: ${testEmail}`);

    // Step 1: Create or get test user
    console.log('\n👤 Step 1: Setting up test user...');
    let userResult = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [testEmail]
    );

    let userId: string;
    if (userResult.rows.length === 0) {
      // Create test user
      const newUserResult = await pool.query(
        `INSERT INTO users (name, email, role, phone_number, sms_alerts_enabled)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['Test User', testEmail, 'user', testPhone, true]
      );
      userId = newUserResult.rows[0].id;
      console.log(`✅ Created test user: ${userId}`);
    } else {
      userId = userResult.rows[0].id;
      // Update phone and enable SMS
      await pool.query(
        `UPDATE users
         SET phone_number = $1, sms_alerts_enabled = $2
         WHERE id = $3`,
        [testPhone, true, userId]
      );
      console.log(`✅ Updated existing user: ${userId}`);
    }

    // Step 2: Create test property
    console.log('\n🏠 Step 2: Creating test property...');
    const service = createImpactedAssetService(pool);

    // Delete existing test property
    await pool.query(
      `DELETE FROM customer_properties
       WHERE user_id = $1 AND customer_name = 'SMS Test Property'`,
      [userId]
    );

    const property = await service.addCustomerProperty({
      userId,
      customerName: 'SMS Test Property',
      customerPhone: testPhone,
      address: '123 Test St',
      city: 'Boston',
      state: 'MA',
      zipCode: '02101',
      latitude: 42.3601,
      longitude: -71.0589,
      notifyOnHail: true,
      notifyOnWind: true,
      notifyThresholdHailSize: 0.75,
      notifyRadiusMiles: 25
    });

    console.log(`✅ Created property: ${property.id}`);
    console.log(`   Address: ${property.address}, ${property.city}, ${property.state}`);

    // Step 3: Create impact alert (this should trigger SMS)
    console.log('\n⚡ Step 3: Creating impact alert (should trigger SMS)...');

    const alerts = await service.createImpactAlerts({
      stormLatitude: 42.3601,
      stormLongitude: -71.0589,
      stormEventId: 'test-storm-' + Date.now(),
      eventType: 'hail',
      stormDate: new Date().toISOString().split('T')[0],
      hailSize: 1.5
    });

    if (alerts.length === 0) {
      console.log('❌ No impact alerts created');
      await cleanup(userId);
      await pool.end();
      return;
    }

    const alert = alerts[0];
    console.log(`✅ Created impact alert: ${alert.id}`);
    console.log(`   Type: ${alert.alertType}`);
    console.log(`   Severity: ${alert.alertSeverity}`);

    // Step 4: Wait a moment for SMS to process
    console.log('\n⏳ Waiting for SMS to process...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 5: Check if SMS was sent
    console.log('\n📧 Step 4: Checking SMS status...');
    const alertCheck = await pool.query(
      `SELECT sms_sent, sms_sent_at, sms_message_sid
       FROM impact_alerts
       WHERE id = $1`,
      [alert.id]
    );

    if (alertCheck.rows[0].sms_sent) {
      console.log('✅ SMS was sent!');
      console.log(`   Sent at: ${alertCheck.rows[0].sms_sent_at}`);
      console.log(`   Message SID: ${alertCheck.rows[0].sms_message_sid}`);
    } else {
      console.log('❌ SMS was not sent');
      console.log('   Check Twilio credentials and user settings');
    }

    // Step 6: Check SMS notification log
    console.log('\n📝 Step 5: Checking SMS notification log...');
    const smsLog = await pool.query(
      `SELECT *
       FROM sms_notifications
       WHERE impact_alert_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [alert.id]
    );

    if (smsLog.rows.length > 0) {
      const log = smsLog.rows[0];
      console.log('✅ Found SMS log entry:');
      console.log(`   Phone: ${log.phone_number}`);
      console.log(`   Status: ${log.status}`);
      console.log(`   Message SID: ${log.message_sid}`);
      console.log(`   Sent at: ${log.sent_at}`);
      console.log(`\n   Message Body:`);
      console.log(`   ${log.message_body.split('\n').join('\n   ')}`);
    } else {
      console.log('⚠️  No SMS log entry found');
    }

    // Step 7: Test rate limiting
    console.log('\n🛡️  Step 6: Testing rate limiting...');
    const alerts2 = await service.createImpactAlerts({
      stormLatitude: 42.3601,
      stormLongitude: -71.0589,
      stormEventId: 'test-storm-2-' + Date.now(),
      eventType: 'hail',
      stormDate: new Date().toISOString().split('T')[0],
      hailSize: 2.0
    });

    if (alerts2.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const alert2Check = await pool.query(
        `SELECT sms_sent
         FROM impact_alerts
         WHERE id = $1`,
        [alerts2[0].id]
      );

      if (alert2Check.rows[0].sms_sent) {
        console.log('⚠️  Second SMS was sent (rate limiting may not be working)');
      } else {
        console.log('✅ Second SMS was blocked by rate limiting');
      }
    }

    // Step 8: Get user statistics
    console.log('\n📊 Step 7: User SMS statistics...');
    const stats = await twilioService.getUserStats(userId, 30);
    console.log(`  Total Sent: ${stats.totalSent}`);
    console.log(`  Total Delivered: ${stats.totalDelivered}`);
    console.log(`  Total Failed: ${stats.totalFailed}`);
    console.log(`  Last Sent: ${stats.lastSentAt || 'Never'}`);

    // Cleanup
    await cleanup(userId);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Integration test complete!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function cleanup(userId: string) {
  console.log('\n🧹 Cleaning up test data...');
  try {
    // Delete test properties (cascades to alerts)
    await pool.query(
      `DELETE FROM customer_properties
       WHERE user_id = $1 AND customer_name = 'SMS Test Property'`,
      [userId]
    );
    console.log('✅ Cleanup complete');
  } catch (error) {
    console.error('⚠️  Cleanup error:', error);
  }
}

// Run test
testSMSIntegration().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
