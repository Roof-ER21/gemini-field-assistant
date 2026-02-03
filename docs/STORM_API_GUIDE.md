# Storm API Usage Guide

Complete guide to using the Storm Intelligence API in the Gemini Field Assistant.

## Quick Start

```typescript
import { stormApi } from '@/services/stormApi';
import { formatEasternDate } from '@/utils/timezone';

// Search for hail by address
const result = await stormApi.searchHail({
  address: '123 Main St, Chicago, IL 60601',
  radius: 10,
  months: 24
});

// Display results
result.events.forEach(event => {
  console.log(`${formatEasternDate(event.date)}: ${event.hailSize}" hail`);
});
```

## API Methods

### 1. Search Methods

#### searchHail()
Basic hail search by address or coordinates.

```typescript
// By address
const result = await stormApi.searchHail({
  address: '123 Main St, Chicago, IL 60601',
  radius: 10,    // miles
  months: 24     // lookback period
});

// By coordinates
const result = await stormApi.searchHail({
  lat: 41.8781,
  lng: -87.6298,
  radius: 10,
  months: 24
});

// By structured address
const result = await stormApi.searchHail({
  street: '123 Main St',
  city: 'Chicago',
  state: 'IL',
  zip: '60601',
  radius: 10,
  months: 24
});
```

#### searchAdvanced()
Advanced search with additional filters.

```typescript
const result = await stormApi.searchAdvanced({
  address: '123 Main St, Chicago, IL 60601',
  radius: 10,
  months: 24,
  includeWind: true,        // Include wind events
  includeNOAA: true,        // Include NOAA data
  minHailSize: 1.0,         // Minimum hail size (inches)
  maxDistance: 5            // Maximum distance (miles)
});
```

#### searchHailTrace()
Search HailTrace imported data only.

```typescript
const result = await stormApi.searchHailTrace({
  lat: 41.8781,
  lng: -87.6298,
  radius: 10,
  months: 24
});
```

### 2. Damage Score

Calculate risk score (0-100) for a location.

```typescript
const score = await stormApi.getDamageScore({
  lat: 41.8781,
  lng: -87.6298,
  events: result.events,           // From search
  noaaEvents: result.noaaEvents    // From search
});

console.log(`Risk Score: ${score.score}/100`);
console.log(`Risk Level: ${score.riskLevel}`); // Low/Moderate/High/Critical
console.log(`Summary: ${score.summary}`);
console.log(`Color: ${score.color}`);

// Factors breakdown
console.log('Factors:', {
  eventCount: score.factors.eventCount,
  maxHailSize: score.factors.maxHailSize,
  recentActivity: score.factors.recentActivity,
  severityDistribution: score.factors.severityDistribution
});
```

### 3. Hot Zones

Find high-priority canvassing areas.

```typescript
// By territory bounds
const hotZones = await stormApi.getHotZones({
  north: 42.0,
  south: 41.5,
  east: -87.0,
  west: -88.0
});

// By center point + radius
const hotZones = await stormApi.getHotZones({
  centerLat: 41.8781,
  centerLng: -87.6298,
  radiusMiles: 50
});

// Display hot zones
hotZones.forEach(zone => {
  console.log(`Hot Zone: ${zone.id}`);
  console.log(`  Intensity: ${zone.intensity}/100`);
  console.log(`  Events: ${zone.eventCount}`);
  console.log(`  Max Hail: ${zone.maxHailSize}"`);
  console.log(`  Recommendation: ${zone.recommendation}`);
});
```

### 4. PDF Reports

Generate and download professional reports.

```typescript
// Generate report blob
const blob = await stormApi.generateReport({
  address: '123 Main St, Chicago, IL 60601',
  lat: 41.8781,
  lng: -87.6298,
  radius: 10,
  events: result.events,
  noaaEvents: result.noaaEvents,
  damageScore: scoreResult,
  repName: 'John Smith',
  repPhone: '555-1234',
  repEmail: 'john@company.com',
  companyName: 'ABC Roofing',
  filter: 'all'  // 'all' | 'hail-only' | 'hail-wind' | 'ihm-only' | 'noaa-only'
});

// Auto-download
await stormApi.downloadReport({
  // ... same params as above
}, 'storm-report-2024-01-15.pdf');
```

### 5. HailTrace Import

Import and manage HailTrace CSV data.

```typescript
// Import CSV file
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

const result = await stormApi.importHailTrace(file);
console.log(`Imported ${result.eventsImported} events`);

// Check import status
const status = await stormApi.getHailTraceStatus();
console.log(`Has data: ${status.hasData}`);
console.log(`Event count: ${status.eventCount}`);
console.log(`Date range: ${status.dateRange?.earliest} to ${status.dateRange?.latest}`);
```

### 6. NOAA Data

Get certified NOAA storm events.

```typescript
const noaaEvents = await stormApi.getNOAAEvents(
  41.8781,  // lat
  -87.6298, // lng
  10,       // radius miles
  2         // years lookback
);

noaaEvents.forEach(event => {
  console.log(`${event.eventType}: ${event.magnitude} ${event.magnitudeUnit}`);
  console.log(`  Location: ${event.location}, ${event.state}`);
  console.log(`  Date: ${formatEasternDate(event.date)}`);
  console.log(`  Narrative: ${event.narrative}`);
});
```

### 7. Utilities

#### Geocoding
```typescript
const coords = await stormApi.geocodeAddress('123 Main St, Chicago, IL 60601');
console.log(`Coordinates: ${coords.lat}, ${coords.lng}`);
```

#### Batch Search
```typescript
const results = await stormApi.batchSearch([
  { id: 'prop1', address: '123 Main St, Chicago, IL 60601', radius: 10 },
  { id: 'prop2', address: '456 Oak Ave, Detroit, MI 48201', radius: 10 },
  { id: 'prop3', address: '789 Elm St, Cleveland, OH 44101', radius: 10 }
]);

results.forEach(({ id, result, error }) => {
  if (error) {
    console.log(`${id}: Error - ${error}`);
  } else {
    console.log(`${id}: ${result.totalCount} events found`);
  }
});
```

#### Service Status
```typescript
const status = await stormApi.getStatus();

console.log('IHM:', status.ihm.configured ? 'Configured' : 'Not configured');
console.log('NOAA:', status.noaa.status, `(${status.noaa.cacheSize} cached)`);
console.log('Weather API:', status.weatherApi.configured ? 'Configured' : 'Not configured');
console.log('HailTrace:', status.hailTrace.eventCount, 'events');
```

## Utility Functions

### Distance Calculations

```typescript
import { calculateDistance, addDistanceToEvents, filterByDistance } from '@/services/stormApi';

// Calculate distance between two points
const miles = calculateDistance(41.8781, -87.6298, 42.0, -87.5);
console.log(`Distance: ${miles.toFixed(2)} miles`);

// Add distance to all events
const eventsWithDistance = addDistanceToEvents(
  result.events,
  41.8781,  // center lat
  -87.6298  // center lng
);

// Filter events by distance
const nearbyEvents = filterByDistance(
  result.events,
  41.8781,
  -87.6298,
  5  // max 5 miles
);
```

### Formatting Functions

```typescript
import {
  getScoreColor,
  getSeverityColor,
  formatHailSize,
  formatWindSpeed,
  getEventTypeName
} from '@/services/stormApi';

// Get color for damage score
const scoreColor = getScoreColor(75); // "#f97316" (orange)

// Get color for severity
const sevColor = getSeverityColor('severe'); // "#dc2626" (red)

// Format hail size
const size = formatHailSize(1.5); // "1.50\""

// Format wind speed
const speed = formatWindSpeed(60); // "60 mph"

// Get event type name
const name = getEventTypeName('hail'); // "Hail"
```

### Timezone Functions

```typescript
import {
  toEasternDate,
  formatEasternDate,
  formatEasternDateTime,
  daysSince,
  isWithinLastDays,
  daysAgo,
  monthsAgo
} from '@/utils/timezone';

// Convert to Eastern date
const normalized = toEasternDate('2024-01-15T12:00:00Z'); // "2024-01-15"

// Format for display
const short = formatEasternDate('2024-01-15', 'short'); // "Jan 15, 2024"
const long = formatEasternDate('2024-01-15', 'long');   // "Monday, January 15, 2024"
const dateTime = formatEasternDateTime('2024-01-15T12:00:00Z'); // "Jan 15, 2024, 7:00 AM"

// Calculate days ago
const days = daysSince('2024-01-01'); // Number of days since Jan 1

// Check if recent
if (isWithinLastDays(event.date, 90)) {
  console.log('Recent event (within 90 days)');
}

// Get past dates
const thirtyDaysAgo = daysAgo(30);
const sixMonthsAgo = monthsAgo(6);
```

## React Component Examples

### Search Component

```typescript
import { useState } from 'react';
import { stormApi, SearchResult } from '@/services/stormApi';
import { formatEasternDate } from '@/utils/timezone';

export default function StormSearch() {
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const data = await stormApi.searchHail({
        address,
        radius: 10,
        months: 24
      });
      setResult(data);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Enter address"
      />
      <button onClick={handleSearch} disabled={loading}>
        {loading ? 'Searching...' : 'Search'}
      </button>

      {result && (
        <div>
          <h3>Found {result.totalCount} events</h3>
          {result.events.map(event => (
            <div key={event.id}>
              {formatEasternDate(event.date)}: {event.hailSize}" hail
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Damage Score Display

```typescript
import { useEffect, useState } from 'react';
import { stormApi, DamageScoreResult } from '@/services/stormApi';

export default function DamageScore({ lat, lng, events, noaaEvents }) {
  const [score, setScore] = useState<DamageScoreResult | null>(null);

  useEffect(() => {
    const fetchScore = async () => {
      const result = await stormApi.getDamageScore({
        lat,
        lng,
        events,
        noaaEvents
      });
      setScore(result);
    };

    fetchScore();
  }, [lat, lng, events, noaaEvents]);

  if (!score) return <div>Calculating...</div>;

  return (
    <div style={{ borderLeft: `4px solid ${score.color}` }}>
      <h2>{score.score}/100</h2>
      <h3>{score.riskLevel} Risk</h3>
      <p>{score.summary}</p>

      <div>
        <h4>Factors</h4>
        <ul>
          <li>Events: {score.factors.eventCount}</li>
          <li>Max Hail: {score.factors.maxHailSize}"</li>
          <li>Recent Activity: {score.factors.recentActivity}</li>
          <li>Severe Events: {score.factors.severityDistribution.severe}</li>
        </ul>
      </div>
    </div>
  );
}
```

### Report Download Button

```typescript
import { stormApi } from '@/services/stormApi';

export default function DownloadReportButton({ searchData, scoreData }) {
  const handleDownload = async () => {
    try {
      await stormApi.downloadReport({
        address: searchData.address,
        lat: searchData.coordinates.lat,
        lng: searchData.coordinates.lng,
        radius: 10,
        events: searchData.events,
        noaaEvents: searchData.noaaEvents,
        damageScore: scoreData,
        repName: 'John Smith',
        repPhone: '555-1234',
        repEmail: 'john@company.com',
        filter: 'all'
      }, `storm-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <button onClick={handleDownload}>
      Download PDF Report
    </button>
  );
}
```

## Error Handling

All API methods throw errors on failure. Use try/catch:

```typescript
try {
  const result = await stormApi.searchHail({ address: 'invalid' });
} catch (error) {
  if (error.message.includes('geocode')) {
    console.error('Address not found');
  } else if (error.message.includes('timeout')) {
    console.error('Request timed out');
  } else {
    console.error('Search failed:', error.message);
  }
}
```

## TypeScript Interfaces

All types are exported from the API service:

```typescript
import type {
  SearchParams,
  AdvancedSearchParams,
  SearchResult,
  HailEvent,
  NOAAStormEvent,
  DamageScoreParams,
  DamageScoreResult,
  HotZoneParams,
  HotZone,
  ReportParams,
  ServiceStatus
} from '@/services/stormApi';
```

## Best Practices

1. **Always use timezone utilities** for date display
2. **Cache search results** to avoid duplicate API calls
3. **Handle errors gracefully** with user-friendly messages
4. **Use TypeScript types** for type safety
5. **Debounce searches** to prevent excessive API calls
6. **Show loading states** for better UX
7. **Validate inputs** before making API calls

## Support

For issues or questions:
- Check `/server/services/` for backend implementation
- See `/docs/API.md` for endpoint documentation
- Review `/STORM_TIMEZONE_AUDIT.md` for timezone details
