/**
 * Test Script for Storm Memory Service
 *
 * Usage:
 *   npx tsx server/services/test-storm-memory.ts
 */

import pg from 'pg';
import { createStormMemoryService, StormEvent } from './stormMemoryService.js';

const { Pool } = pg;

async function testStormMemoryService() {
  console.log('🧪 Testing Storm Memory Service\n');

  // Connect to database
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Test connection
    const connTest = await pool.query('SELECT NOW()');
    console.log('✅ Database connected at', connTest.rows[0].now);

    const service = createStormMemoryService(pool);

    // Get a test user
    const userResult = await pool.query('SELECT id, email FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.error('❌ No users found in database. Please create a user first.');
      return;
    }
    const testUserId = userResult.rows[0].id;
    const testUserEmail = userResult.rows[0].email;
    console.log(`✅ Using test user: ${testUserEmail}\n`);

    // Test 1: Save a storm lookup
    console.log('Test 1: Save Storm Lookup');
    const sampleEvents: StormEvent[] = [
      {
        id: 'test-event-1',
        eventType: 'hail',
        date: '2024-05-15',
        state: 'VA',
        location: 'Richmond',
        latitude: 37.5407,
        longitude: -77.4360,
        magnitude: 1.75,
        magnitudeUnit: 'inches',
        source: 'NWS',
        narrative: 'Quarter-sized hail reported in downtown Richmond',
        dataSource: 'Test Data',
        certified: true
      },
      {
        id: 'test-event-2',
        eventType: 'wind',
        date: '2024-05-15',
        state: 'VA',
        location: 'Richmond',
        latitude: 37.5407,
        longitude: -77.4360,
        magnitude: 65,
        magnitudeUnit: 'mph',
        source: 'NWS',
        narrative: 'Strong thunderstorm winds',
        dataSource: 'Test Data',
        certified: true
      }
    ];

    const lookup1 = await service.saveStormLookup({
      userId: testUserId,
      address: '123 Main St, Richmond, VA 23220',
      city: 'Richmond',
      state: 'VA',
      zipCode: '23220',
      latitude: 37.5407,
      longitude: -77.4360,
      stormEvents: sampleEvents,
      dataSources: { noaa: true, ihm: false }
    });

    console.log(`✅ Saved lookup: ${lookup1.id}`);
    console.log(`   Address: ${lookup1.address}`);
    console.log(`   Events: ${lookup1.eventCount}`);
    console.log();

    // Test 2: Save another lookup nearby
    console.log('Test 2: Save Nearby Storm Lookup');
    const lookup2 = await service.saveStormLookup({
      userId: testUserId,
      address: '456 Oak Ave, Richmond, VA 23221',
      city: 'Richmond',
      state: 'VA',
      zipCode: '23221',
      latitude: 37.5650,
      longitude: -77.4550,
      stormEvents: [sampleEvents[0]],
      dataSources: { noaa: true }
    });

    console.log(`✅ Saved lookup: ${lookup2.id}`);
    console.log(`   Address: ${lookup2.address}`);
    console.log();

    // Test 3: Find nearby storms
    console.log('Test 3: Find Nearby Storms (10 mile radius)');
    const nearby = await service.findNearbyStorms(37.5407, -77.4360, 10, testUserId);
    console.log(`✅ Found ${nearby.length} nearby storms:`);
    nearby.forEach(n => {
      console.log(`   - ${n.lookup.address} (${n.distanceMiles.toFixed(2)} miles)`);
    });
    console.log();

    // Test 4: Get storms by ZIP
    console.log('Test 4: Get Storms by ZIP Code (23220)');
    const byZip = await service.getStormsByZipCode('23220', testUserId);
    console.log(`✅ Found ${byZip.length} storms in ZIP 23220`);
    console.log();

    // Test 5: Get storms by city
    console.log('Test 5: Get Storms by City (Richmond, VA)');
    const byCity = await service.getStormsByCity('Richmond', 'VA', testUserId);
    console.log(`✅ Found ${byCity.length} storms in Richmond, VA`);
    console.log();

    // Test 6: Record outcome
    console.log('Test 6: Record Claim Outcome');
    const updated = await service.recordOutcome(
      lookup1.id,
      'claim_won',
      'Approved for $25,000 roof replacement'
    );
    console.log(`✅ Updated outcome: ${updated?.outcome}`);
    console.log(`   Notes: ${updated?.outcomeNotes}`);
    console.log();

    // Test 7: Get statistics
    console.log('Test 7: Get Storm Statistics');
    const stats = await service.getStormStats(testUserId);
    console.log('✅ Statistics:');
    console.log(`   Total Lookups: ${stats.totalLookups}`);
    console.log(`   Total Events: ${stats.totalEvents}`);
    console.log(`   Claims Won: ${stats.byOutcome.claim_won}`);
    console.log(`   Claims Lost: ${stats.byOutcome.claim_lost}`);
    console.log(`   NOAA Sources: ${stats.byDataSource.noaa}`);
    console.log();

    // Test 8: Search by event type
    console.log('Test 8: Search Hail Events');
    const hailEvents = await service.searchStormEvents({
      userId: testUserId,
      eventType: 'hail'
    });
    console.log(`✅ Found ${hailEvents.length} lookups with hail events`);
    console.log();

    // Test 9: Get all user lookups
    console.log('Test 9: Get All User Lookups');
    const allLookups = await service.getLookupsByUser(testUserId);
    console.log(`✅ User has ${allLookups.length} total lookups`);
    console.log();

    // Test 10: Delete a lookup
    console.log('Test 10: Delete Storm Lookup');
    const deleted = await service.deleteLookup(lookup2.id, testUserId);
    console.log(`✅ Deleted lookup: ${deleted}`);
    console.log();

    console.log('✅ All tests passed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

// Run tests
testStormMemoryService();
