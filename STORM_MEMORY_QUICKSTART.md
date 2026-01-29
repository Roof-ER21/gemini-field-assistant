# Storm Memory Service - Quick Start

## Installation (One-Time Setup)

```bash
cd /Users/a21/gemini-field-assistant

# Run database migration
node run-migration-018.js

# OR on Railway production
railway run node run-migration-018.js
```

## Testing

```bash
# Run test suite
npx tsx server/services/test-storm-memory.ts
```

## API Usage Examples

### 1. Save a Storm Lookup

```bash
curl -X POST http://localhost:3001/api/storm-memory/save \
  -H "Content-Type: application/json" \
  -H "x-user-email: user@example.com" \
  -d '{
    "address": "123 Main St, Richmond, VA 23220",
    "city": "Richmond",
    "state": "VA",
    "zipCode": "23220",
    "latitude": 37.5407,
    "longitude": -77.4360,
    "stormEvents": [
      {
        "id": "noaa-12345",
        "eventType": "hail",
        "date": "2024-05-15",
        "magnitude": 1.75,
        "magnitudeUnit": "inches",
        "source": "NWS",
        "dataSource": "NOAA Storm Events Database",
        "certified": true
      }
    ],
    "dataSources": {
      "noaa": true,
      "ihm": false
    }
  }'
```

### 2. Find Nearby Storms

```bash
curl "http://localhost:3001/api/storm-memory/nearby?lat=37.5407&lng=-77.4360&radius=10" \
  -H "x-user-email: user@example.com"
```

### 3. Get Storms by ZIP

```bash
curl "http://localhost:3001/api/storm-memory/by-zip/23220" \
  -H "x-user-email: user@example.com"
```

### 4. Record Claim Outcome

```bash
curl -X POST http://localhost:3001/api/storm-memory/outcome \
  -H "Content-Type: application/json" \
  -H "x-user-email: user@example.com" \
  -d '{
    "lookupId": "uuid-here",
    "outcome": "claim_won",
    "outcomeNotes": "Approved for $25,000 roof replacement"
  }'
```

### 5. Get Statistics

```bash
curl "http://localhost:3001/api/storm-memory/stats" \
  -H "x-user-email: user@example.com"
```

## JavaScript/TypeScript Integration

```typescript
import { createStormMemoryService } from './server/services/stormMemoryService.js';

// In your route or service
const service = createStormMemoryService(pool);

// Save a lookup
const lookup = await service.saveStormLookup({
  userId,
  address: "123 Main St",
  latitude: 37.5407,
  longitude: -77.4360,
  stormEvents: [...],
  dataSources: { noaa: true }
});

// Find nearby
const nearby = await service.findNearbyStorms(37.5407, -77.4360, 10);

// Record outcome
await service.recordOutcome(lookupId, 'claim_won', 'Notes here');
```

## Susan AI Integration Example

```typescript
// When Susan performs a storm lookup
async function susanStormLookup(address: string, lat: number, lng: number, userEmail: string) {
  // 1. Check if we've looked up this area before
  const previousLookup = await fetch(
    `/api/storm-memory/by-address?address=${encodeURIComponent(address)}`,
    { headers: { 'x-user-email': userEmail } }
  ).then(r => r.json());

  if (previousLookup.lookup) {
    return {
      message: `I've verified storms at this address before on ${previousLookup.lookup.lookupDate}. Found ${previousLookup.lookup.eventCount} events.`,
      cachedData: previousLookup.lookup
    };
  }

  // 2. Perform new lookup
  const stormEvents = await noaaStormService.getStormEvents(lat, lng, 10, 2);

  // 3. Save to memory
  if (stormEvents.length > 0) {
    await fetch('/api/storm-memory/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': userEmail
      },
      body: JSON.stringify({
        address,
        latitude: lat,
        longitude: lng,
        stormEvents,
        dataSources: { noaa: true }
      })
    });
  }

  return { message: `Found ${stormEvents.length} storm events`, stormEvents };
}
```

## Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/storm-memory/save` | Save storm lookup |
| GET | `/api/storm-memory/nearby` | Find nearby storms |
| GET | `/api/storm-memory/by-zip/:zipCode` | Get by ZIP |
| GET | `/api/storm-memory/by-city` | Get by city/state |
| GET | `/api/storm-memory/by-address` | Search by address |
| GET | `/api/storm-memory/recent` | Recent lookups |
| GET | `/api/storm-memory/search` | Advanced search |
| GET | `/api/storm-memory/stats` | Statistics |
| GET | `/api/storm-memory/:lookupId` | Get specific lookup |
| GET | `/api/storm-memory` | Get all user lookups |
| POST | `/api/storm-memory/outcome` | Record outcome |
| PUT | `/api/storm-memory/:lookupId/outcome` | Update outcome |
| DELETE | `/api/storm-memory/:lookupId` | Delete lookup |

## Database Queries

```sql
-- Find all lookups with outcomes
SELECT address, outcome, event_count
FROM storm_lookups
WHERE outcome IS NOT NULL
ORDER BY created_at DESC;

-- Find successful claims with large hail
SELECT sl.address, sl.outcome, sl.storm_events
FROM storm_lookups sl
WHERE sl.outcome = 'claim_won'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(sl.storm_events) AS event
    WHERE (event->>'magnitude')::numeric > 1.5
  );

-- Success rate by user
SELECT
  u.email,
  COUNT(*) FILTER (WHERE sl.outcome = 'claim_won') as won,
  COUNT(*) FILTER (WHERE sl.outcome = 'claim_lost') as lost,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sl.outcome = 'claim_won') /
    NULLIF(COUNT(*) FILTER (WHERE sl.outcome IN ('claim_won', 'claim_lost')), 0), 2) as success_rate
FROM storm_lookups sl
JOIN users u ON sl.user_id = u.id
GROUP BY u.email
ORDER BY success_rate DESC;
```

## Files

| File | Purpose |
|------|---------|
| `database/migrations/018_storm_memory.sql` | Database schema |
| `server/services/stormMemoryService.ts` | Service layer |
| `server/routes/stormMemoryRoutes.ts` | API routes |
| `server/services/STORM_MEMORY_README.md` | Full documentation |
| `server/services/test-storm-memory.ts` | Test suite |
| `run-migration-018.js` | Migration script |
| `STORM_MEMORY_IMPLEMENTATION.md` | Implementation guide |

## Quick Commands

```bash
# Development
npm run server:dev

# Run migration
node run-migration-018.js

# Test service
npx tsx server/services/test-storm-memory.ts

# Production deploy
git add .
git commit -m "Add Storm Memory Service"
git push origin main
railway run node run-migration-018.js
```

## Common Use Cases

### Prevent Duplicate Lookups
```typescript
const existing = await fetch(`/api/storm-memory/by-address?address=${addr}`)
if (existing.lookup) {
  // Use cached data
}
```

### Find Similar Areas
```typescript
const nearby = await fetch(`/api/storm-memory/nearby?lat=${lat}&lng=${lng}&radius=5`)
console.log(`Found ${nearby.count} similar areas`)
```

### Track Success Patterns
```typescript
const stats = await fetch('/api/storm-memory/stats')
console.log(`Win rate: ${stats.byOutcome.claim_won / stats.totalLookups}`)
```

## Support

- Full docs: `server/services/STORM_MEMORY_README.md`
- Implementation: `STORM_MEMORY_IMPLEMENTATION.md`
- Test: `npx tsx server/services/test-storm-memory.ts`
