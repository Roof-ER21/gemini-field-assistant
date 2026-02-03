/**
 * Test script for Damage Score Service
 */

import { damageScoreService } from './damageScoreService.js';

// Test data
const testEvents = [
  {
    id: '1',
    date: '2024-06-15',
    latitude: 40.7128,
    longitude: -74.0060,
    hailSize: 1.75,
    severity: 'severe' as const,
    source: 'test'
  },
  {
    id: '2',
    date: '2024-03-10',
    latitude: 40.7128,
    longitude: -74.0060,
    hailSize: 1.0,
    severity: 'moderate' as const,
    source: 'test'
  },
  {
    id: '3',
    date: '2023-08-22',
    latitude: 40.7128,
    longitude: -74.0060,
    hailSize: 0.75,
    severity: 'minor' as const,
    source: 'test'
  }
];

const testNoaaEvents = [
  {
    id: 'noaa-1',
    date: '2024-05-20',
    latitude: 40.7128,
    longitude: -74.0060,
    magnitude: 2.0,
    eventType: 'hail' as const,
    location: 'Test Location'
  }
];

// Test 1: Low risk (no events)
console.log('Test 1: Low Risk (No Events)');
const result1 = damageScoreService.calculateDamageScore({
  lat: 40.7128,
  lng: -74.0060,
  events: [],
  noaaEvents: []
});
console.log(result1);
console.log('---\n');

// Test 2: Moderate risk (few events, moderate size)
console.log('Test 2: Moderate Risk');
const result2 = damageScoreService.calculateDamageScore({
  lat: 40.7128,
  lng: -74.0060,
  events: testEvents.slice(1, 3),
  noaaEvents: []
});
console.log(result2);
console.log('---\n');

// Test 3: High risk (multiple events including severe)
console.log('Test 3: High Risk');
const result3 = damageScoreService.calculateDamageScore({
  lat: 40.7128,
  lng: -74.0060,
  events: testEvents,
  noaaEvents: []
});
console.log(result3);
console.log('---\n');

// Test 4: Critical risk (multiple severe events)
console.log('Test 4: Critical Risk');
const result4 = damageScoreService.calculateDamageScore({
  lat: 40.7128,
  lng: -74.0060,
  events: testEvents,
  noaaEvents: testNoaaEvents
});
console.log(result4);
console.log('---\n');

console.log('All tests completed!');
