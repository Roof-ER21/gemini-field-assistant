# Storm API Quick Reference Card

Quick copy-paste examples for common storm API operations.

## Imports

```typescript
// API Client
import { stormApi } from '@/services/stormApi';

// Types
import type {
  SearchResult,
  HailEvent,
  DamageScoreResult,
  HotZone
} from '@/services/stormApi';

// Timezone Utils
import {
  formatEasternDate,
  daysSince,
  toEasternDate
} from '@/utils/timezone';
```

## Search

### By Address
```typescript
const result = await stormApi.searchHail({
  address: '123 Main St, Chicago, IL 60601',
  radius: 10,
  months: 24
});
```

### By Coordinates
```typescript
const result = await stormApi.searchHail({
  lat: 41.8781,
  lng: -87.6298,
  radius: 10,
  months: 24
});
```

### Advanced Search
```typescript
const result = await stormApi.searchAdvanced({
  address: '123 Main St, Chicago, IL 60601',
  radius: 10,
  months: 24,
  includeWind: true,
  includeNOAA: true,
  minHailSize: 1.0
});
```

## Damage Score

```typescript
const score = await stormApi.getDamageScore({
  lat: 41.8781,
  lng: -87.6298,
  events: searchResult.events,
  noaaEvents: searchResult.noaaEvents
});

// score.score (0-100)
// score.riskLevel ('Low' | 'Moderate' | 'High' | 'Critical')
// score.color (hex color)
// score.summary (text description)
```

## Hot Zones

```typescript
const hotZones = await stormApi.getHotZones({
  centerLat: 41.8781,
  centerLng: -87.6298,
  radiusMiles: 50
});

hotZones.forEach(zone => {
  console.log(`Intensity: ${zone.intensity}/100`);
  console.log(`Events: ${zone.eventCount}`);
  console.log(zone.recommendation);
});
```

## PDF Reports

### Generate Blob
```typescript
const blob = await stormApi.generateReport({
  address: '123 Main St',
  lat: 41.8781,
  lng: -87.6298,
  radius: 10,
  events: result.events,
  noaaEvents: result.noaaEvents,
  damageScore: score,
  repName: 'John Smith',
  repPhone: '555-1234',
  filter: 'all'
});
```

### Auto Download
```typescript
await stormApi.downloadReport({
  // ... same params as above
}, 'storm-report.pdf');
```

## Date Formatting

```typescript
// Short format: "Jan 15, 2024"
const short = formatEasternDate(event.date, 'short');

// Long format: "Monday, January 15, 2024"
const long = formatEasternDate(event.date, 'long');

// Days ago
const days = daysSince(event.date);
console.log(`${days} days ago`);

// Convert to Eastern
const eastern = toEasternDate('2024-01-15T12:00:00Z');
```

## React Hooks

### useStormSearch
```typescript
function useStormSearch(address: string) {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const search = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await stormApi.searchHail({
          address,
          radius: 10,
          months: 24
        });
        setResult(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (address) search();
  }, [address]);

  return { result, loading, error };
}
```

### useDamageScore
```typescript
function useDamageScore(lat: number, lng: number, events, noaaEvents) {
  const [score, setScore] = useState<DamageScoreResult | null>(null);

  useEffect(() => {
    const calculate = async () => {
      const result = await stormApi.getDamageScore({
        lat,
        lng,
        events,
        noaaEvents
      });
      setScore(result);
    };

    if (events && noaaEvents) calculate();
  }, [lat, lng, events, noaaEvents]);

  return score;
}
```

## Components

### Search Component
```typescript
export default function StormSearch() {
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);

  const handleSearch = async () => {
    const data = await stormApi.searchHail({
      address,
      radius: 10,
      months: 24
    });
    setResult(data);
  };

  return (
    <div>
      <input value={address} onChange={e => setAddress(e.target.value)} />
      <button onClick={handleSearch}>Search</button>

      {result && (
        <div>
          <h3>{result.totalCount} events found</h3>
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

### Score Display
```typescript
export default function ScoreDisplay({ score }: { score: DamageScoreResult }) {
  return (
    <div style={{ borderLeft: `4px solid ${score.color}` }}>
      <h2>{score.score}/100</h2>
      <h3>{score.riskLevel} Risk</h3>
      <p>{score.summary}</p>
    </div>
  );
}
```

### Event List
```typescript
export default function EventList({ events }: { events: HailEvent[] }) {
  return (
    <div>
      {events.map(event => (
        <div key={event.id}>
          <span>{formatEasternDate(event.date)}</span>
          <span>{event.hailSize}"</span>
          <span>{event.severity}</span>
          {event.distanceMiles && <span>{event.distanceMiles.toFixed(1)} mi</span>}
        </div>
      ))}
    </div>
  );
}
```

## Utility Functions

### Distance
```typescript
import { calculateDistance, addDistanceToEvents } from '@/services/stormApi';

// Calculate distance
const miles = calculateDistance(lat1, lng1, lat2, lng2);

// Add distance to events
const eventsWithDistance = addDistanceToEvents(
  events,
  centerLat,
  centerLng
);
```

### Formatting
```typescript
import {
  formatHailSize,
  formatWindSpeed,
  getScoreColor,
  getSeverityColor
} from '@/services/stormApi';

const size = formatHailSize(1.5);           // "1.50\""
const speed = formatWindSpeed(60);          // "60 mph"
const scoreColor = getScoreColor(75);       // "#f97316"
const sevColor = getSeverityColor('severe'); // "#dc2626"
```

## Error Handling

```typescript
try {
  const result = await stormApi.searchHail({ address });
} catch (error) {
  if (error.message.includes('geocode')) {
    // Address not found
  } else if (error.message.includes('timeout')) {
    // Request timeout
  } else {
    // Other error
  }
}
```

## Common Patterns

### Search + Score + Report
```typescript
// 1. Search
const search = await stormApi.searchHail({ address, radius: 10, months: 24 });

// 2. Calculate score
const score = await stormApi.getDamageScore({
  lat: search.searchArea.center.lat,
  lng: search.searchArea.center.lng,
  events: search.events,
  noaaEvents: search.noaaEvents
});

// 3. Download report
await stormApi.downloadReport({
  address,
  lat: search.searchArea.center.lat,
  lng: search.searchArea.center.lng,
  radius: 10,
  events: search.events,
  noaaEvents: search.noaaEvents,
  damageScore: score
}, `report-${Date.now()}.pdf`);
```

### Filter Recent Events
```typescript
import { isWithinLastDays } from '@/utils/timezone';

const recentEvents = events.filter(event =>
  isWithinLastDays(event.date, 90)
);
```

### Group by Severity
```typescript
const grouped = events.reduce((acc, event) => {
  acc[event.severity] = [...(acc[event.severity] || []), event];
  return acc;
}, {} as Record<string, HailEvent[]>);

console.log(`Severe: ${grouped.severe?.length || 0}`);
console.log(`Moderate: ${grouped.moderate?.length || 0}`);
console.log(`Minor: ${grouped.minor?.length || 0}`);
```

## Environment Setup

Ensure `config.ts` has:

```typescript
export const config = {
  apiUrl: process.env.REACT_APP_API_URL || 'http://localhost:3000'
};
```

## TypeScript Tips

```typescript
// Import types
import type {
  SearchParams,
  SearchResult,
  HailEvent,
  NOAAStormEvent,
  DamageScoreResult,
  HotZone
} from '@/services/stormApi';

// Use in function signatures
async function searchAndScore(
  params: SearchParams
): Promise<{ search: SearchResult; score: DamageScoreResult }> {
  // ...
}

// Type guards
function isHailEvent(event: any): event is HailEvent {
  return 'hailSize' in event;
}
```

## Status Checks

```typescript
// Check service status
const status = await stormApi.getStatus();

console.log('IHM:', status.ihm.status);
console.log('NOAA:', status.noaa.status);
console.log('HailTrace:', status.hailTrace.eventCount);
```

## Batch Operations

```typescript
const results = await stormApi.batchSearch([
  { id: '1', address: 'Address 1', radius: 10 },
  { id: '2', address: 'Address 2', radius: 10 },
  { id: '3', address: 'Address 3', radius: 10 }
]);

results.forEach(({ id, result, error }) => {
  if (error) {
    console.log(`${id}: Error`);
  } else {
    console.log(`${id}: ${result.totalCount} events`);
  }
});
```

---

**For full documentation**: See `/docs/STORM_API_GUIDE.md`
**For audit details**: See `/STORM_TIMEZONE_AUDIT.md`
