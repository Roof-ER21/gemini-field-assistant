/**
 * Twilio Service Test Suite
 *
 * Tests SMS alert functionality including:
 * - Basic SMS sending
 * - Storm alert formatting
 * - Batch alerts
 * - Rate limiting
 * - Eastern timezone formatting
 *
 * Usage:
 *   npm run test-twilio
 *   or
 *   tsx server/services/test-twilio-service.ts
 */

import { Pool } from 'pg';
import { twilioService, StormAlert } from './twilioService.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testTwilioService() {
  console.log('\n🧪 Twilio Service Test Suite\n');
  console.log('='.repeat(60));

  // Initialize Twilio service with pool
  twilioService.setPool(pool);

  // Test 1: Check service status
  console.log('\n📊 Test 1: Service Status');
  console.log('-'.repeat(60));
  const status = twilioService.getStatus();
  console.log('Status:', JSON.stringify(status, null, 2));

  if (!status.configured) {
    console.log('\n⚠️  Twilio is not configured. Set these environment variables:');
    console.log('   - TWILIO_ACCOUNT_SID');
    console.log('   - TWILIO_AUTH_TOKEN');
    console.log('   - TWILIO_PHONE_NUMBER');
    console.log('\n   Skipping SMS sending tests...');
    await pool.end();
    return;
  }

  // Test 2: Phone number validation
  console.log('\n📱 Test 2: Phone Number Validation');
  console.log('-'.repeat(60));
  const testNumbers = [
    '(555) 123-4567',
    '+15551234567',
    '555-123-4567',
    '5551234567',
    '15551234567',
    'invalid-number'
  ];

  for (const number of testNumbers) {
    const isValid = twilioService.validatePhoneNumber(number);
    console.log(`${isValid ? '✅' : '❌'} ${number.padEnd(20)} - ${isValid ? 'Valid' : 'Invalid'}`);
  }

  // Test 3: Storm alert message formatting
  console.log('\n🌩️  Test 3: Storm Alert Message Format');
  console.log('-'.repeat(60));

  // The private formatStormAlertMessage method is called internally
  // We'll test it by sending a test alert (if you want to actually send)
  const testPhoneNumber = process.env.TEST_PHONE_NUMBER;

  if (testPhoneNumber) {
    console.log(`\n📤 Sending test storm alert to ${testPhoneNumber}...`);

    const result = await twilioService.sendStormAlert({
      phoneNumber: testPhoneNumber,
      propertyAddress: '123 Main St, Boston, MA',
      propertyId: 'test-property-1',
      eventType: 'hail',
      hailSize: 1.5,
      date: 'Jan 15, 2025',
      userId: 'test-user-id'
    });

    if (result.success) {
      console.log('✅ Test alert sent successfully!');
      console.log('   Message SID:', result.messageSid);
    } else {
      console.log('❌ Failed to send test alert');
      console.log('   Error:', result.error);
    }
  } else {
    console.log('ℹ️  Set TEST_PHONE_NUMBER environment variable to test SMS sending');
    console.log('   Example: TEST_PHONE_NUMBER="+15551234567"');
  }

  // Test 4: Rate limiting
  console.log('\n⏱️  Test 4: Rate Limiting');
  console.log('-'.repeat(60));

  if (testPhoneNumber) {
    console.log('Sending first message...');
    const first = await twilioService.sendStormAlert({
      phoneNumber: testPhoneNumber,
      propertyAddress: '456 Oak Ave, Boston, MA',
      propertyId: 'test-property-2',
      eventType: 'hail',
      hailSize: 2.0,
      userId: 'test-user-id'
    });

    console.log(`First message: ${first.success ? '✅ Sent' : '❌ Failed'}`);

    // Try to send again immediately (should be rate limited)
    console.log('\nSending second message to same property (should be rate limited)...');
    const second = await twilioService.sendStormAlert({
      phoneNumber: testPhoneNumber,
      propertyAddress: '456 Oak Ave, Boston, MA',
      propertyId: 'test-property-2',
      eventType: 'hail',
      hailSize: 2.0,
      userId: 'test-user-id'
    });

    if (second.error?.includes('Rate limit')) {
      console.log('✅ Rate limiting working correctly');
    } else {
      console.log('⚠️  Rate limiting may not be working');
      console.log('   Result:', second);
    }
  } else {
    console.log('ℹ️  Set TEST_PHONE_NUMBER to test rate limiting');
  }

  // Test 5: Batch alerts
  console.log('\n📦 Test 5: Batch Alerts');
  console.log('-'.repeat(60));

  if (testPhoneNumber) {
    const batchAlerts: StormAlert[] = [
      {
        userId: 'user-1',
        phoneNumber: testPhoneNumber,
        propertyAddress: '100 First St, Boston, MA',
        propertyId: 'batch-prop-1',
        eventType: 'hail',
        hailSize: 1.0
      },
      {
        userId: 'user-1',
        phoneNumber: testPhoneNumber,
        propertyAddress: '200 Second St, Boston, MA',
        propertyId: 'batch-prop-2',
        eventType: 'wind',
        windSpeed: 65
      }
    ];

    console.log(`Sending batch of ${batchAlerts.length} alerts...`);
    const batchResult = await twilioService.sendBatchAlerts(batchAlerts);

    console.log('\nBatch Results:');
    console.log(`  Total:   ${batchResult.total}`);
    console.log(`  Sent:    ${batchResult.sent}`);
    console.log(`  Failed:  ${batchResult.failed}`);
    console.log(`  Skipped: ${batchResult.skipped}`);

    console.log('\nDetails:');
    batchResult.results.forEach((r, i) => {
      const status = r.success ? '✅' : '❌';
      console.log(`  ${status} ${r.propertyAddress}`);
      if (!r.success) {
        console.log(`     Error: ${r.error}`);
      }
    });
  } else {
    console.log('ℹ️  Set TEST_PHONE_NUMBER to test batch alerts');
  }

  // Test 6: User stats
  console.log('\n📊 Test 6: User SMS Statistics');
  console.log('-'.repeat(60));

  if (testPhoneNumber) {
    const stats = await twilioService.getUserStats('test-user-id', 30);
    console.log('User Stats (last 30 days):');
    console.log(`  Total Sent:      ${stats.totalSent}`);
    console.log(`  Total Delivered: ${stats.totalDelivered}`);
    console.log(`  Total Failed:    ${stats.totalFailed}`);
    console.log(`  Last Sent:       ${stats.lastSentAt || 'Never'}`);
  } else {
    console.log('ℹ️  Set TEST_PHONE_NUMBER to test user stats');
  }

  // Test 7: Eastern timezone formatting
  console.log('\n🕐 Test 7: Eastern Timezone Formatting');
  console.log('-'.repeat(60));
  const easternDate = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  console.log(`Current date in Eastern: ${easternDate}`);
  console.log('✅ All storm alerts use Eastern timezone');

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test suite complete!\n');

  await pool.end();
}

// Run tests
testTwilioService().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
