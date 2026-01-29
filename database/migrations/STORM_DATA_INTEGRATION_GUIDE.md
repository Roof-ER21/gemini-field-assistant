# Storm Data Integration Guide

## Quick Start

### 1. Run the Migration

```bash
cd /Users/a21/gemini-field-assistant

# Railway deployment
railway run psql $DATABASE_URL -f database/migrations/019_storm_data_learning.sql

# Or local PostgreSQL
psql $DATABASE_URL -f database/migrations/019_storm_data_learning.sql
```

### 2. Import the Service

```typescript
import { StormDataService } from './services/stormDataService';
import { pool } from './db'; // Your existing DB pool

const stormService = new StormDataService(pool);
```

### 3. Add API Routes

Create `/Users/a21/gemini-field-assistant/server/routes/storm.ts`:

```typescript
import express from 'express';
import { StormDataService } from '../services/stormDataService';

const router = express.Router();

// POST /api/storm/lookup
// Find storms near a location
router.post('/lookup', async (req, res) => {
  try {
    const { latitude, longitude, radius_miles, days_back } = req.body;

    const stormService = new StormDataService(req.app.locals.db);
    const storms = await stormService.findStormsNearLocation({
      latitude,
      longitude,
      radius_miles,
      days_back,
    });

    // Track the lookup
    await stormService.trackLookup({
      user_id: req.user?.id,
      query_type: 'radius_search',
      query_latitude: latitude,
      query_longitude: longitude,
      query_radius_miles: radius_miles,
      results_found: storms.length,
      storm_event_ids: storms.map(s => s.storm_id),
      session_id: req.sessionId,
    });

    res.json({ storms, count: storms.length });
  } catch (error) {
    console.error('Storm lookup error:', error);
    res.status(500).json({ error: 'Failed to lookup storms' });
  }
});

// GET /api/storm/strategies?state=VA&zip_code=22401&insurance_company=State%20Farm
// Get successful strategies for an area
router.get('/strategies', async (req, res) => {
  try {
    const { state, city, zip_code, insurance_company } = req.query;

    const stormService = new StormDataService(req.app.locals.db);
    const strategies = await stormService.getAreaStrategies({
      state: state as string,
      city: city as string,
      zip_code: zip_code as string,
      insurance_company: insurance_company as string,
    });

    res.json(strategies);
  } catch (error) {
    console.error('Strategy lookup error:', error);
    res.status(500).json({ error: 'Failed to get strategies' });
  }
});

// POST /api/storm/event
// Create a new storm event
router.post('/event', async (req, res) => {
  try {
    const stormService = new StormDataService(req.app.locals.db);
    const event = await stormService.createStormEvent({
      ...req.body,
      discovered_by: req.user?.id,
    });

    res.json(event);
  } catch (error) {
    console.error('Create storm event error:', error);
    res.status(500).json({ error: 'Failed to create storm event' });
  }
});

// POST /api/storm/claim-outcome
// Record a claim outcome
router.post('/claim-outcome', async (req, res) => {
  try {
    const stormService = new StormDataService(req.app.locals.db);
    const outcome = await stormService.createClaimOutcome({
      ...req.body,
      user_id: req.user?.id,
    });

    res.json(outcome);
  } catch (error) {
    console.error('Create claim outcome error:', error);
    res.status(500).json({ error: 'Failed to record claim outcome' });
  }
});

// GET /api/storm/susan-recommendations
// Get contextual recommendations for Susan
router.get('/susan-recommendations', async (req, res) => {
  try {
    const { latitude, longitude, zip_code, state, insurance_company } = req.query;

    const stormService = new StormDataService(req.app.locals.db);
    const recommendations = await stormService.getSusanRecommendations({
      latitude: latitude ? parseFloat(latitude as string) : undefined,
      longitude: longitude ? parseFloat(longitude as string) : undefined,
      zip_code: zip_code as string,
      state: state as string,
      insurance_company: insurance_company as string,
    });

    res.json(recommendations);
  } catch (error) {
    console.error('Susan recommendations error:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// GET /api/storm/hotspots?state=VA&limit=20
// Get storm hotspots
router.get('/hotspots', async (req, res) => {
  try {
    const { state, limit } = req.query;

    const stormService = new StormDataService(req.app.locals.db);
    const hotspots = await stormService.getStormHotspots(
      state as string,
      limit ? parseInt(limit as string) : 20
    );

    res.json(hotspots);
  } catch (error) {
    console.error('Hotspots error:', error);
    res.status(500).json({ error: 'Failed to get hotspots' });
  }
});

// GET /api/storm/recent-wins?state=VA&limit=10
// Get recent successful claims
router.get('/recent-wins', async (req, res) => {
  try {
    const { state, limit } = req.query;

    const stormService = new StormDataService(req.app.locals.db);
    const claims = await stormService.getRecentSuccessfulClaims(
      limit ? parseInt(limit as string) : 10,
      state as string
    );

    res.json(claims);
  } catch (error) {
    console.error('Recent wins error:', error);
    res.status(500).json({ error: 'Failed to get recent wins' });
  }
});

export default router;
```

### 4. Register Routes in Main Server

In `/Users/a21/gemini-field-assistant/server/index.ts`:

```typescript
import stormRoutes from './routes/storm';

// ... existing code ...

app.use('/api/storm', stormRoutes);
```

## Susan AI Integration

### Enhance Susan's Context Awareness

When a user asks about storms, Susan can now provide intelligent, data-driven responses:

```typescript
// In your chat handler
import { StormDataService } from './services/stormDataService';

async function handleStormQuery(userMessage: string, context: any) {
  const stormService = new StormDataService(pool);

  // Extract location from context (job, user state, etc.)
  const { latitude, longitude, state, insurance_company } = context;

  // Get comprehensive recommendations
  const recommendations = await stormService.getSusanRecommendations({
    latitude,
    longitude,
    state,
    insurance_company,
  });

  // Build Susan's response
  const susanResponse = buildStormResponse(recommendations);

  return susanResponse;
}

function buildStormResponse(data: any): string {
  let response = '';

  if (data.nearby_storms.length > 0) {
    response += `📍 I found ${data.nearby_storms.length} verified storm events near this location:\n\n`;
    data.nearby_storms.slice(0, 3).forEach(storm => {
      response += `• ${storm.event_date}: ${storm.hail_size_inches}" hail (${storm.city}) - ${storm.distance_miles.toFixed(1)} miles away\n`;
    });
  }

  if (data.area_strategies?.total_claims > 0) {
    response += `\n💡 Success rate in this area: ${data.area_strategies.success_rate}%\n`;
    response += `Average settlement: $${data.area_strategies.avg_settlement?.toFixed(2)}\n`;
  }

  if (data.top_arguments.length > 0) {
    response += `\n🎯 Top winning arguments:\n`;
    data.top_arguments.forEach((arg, i) => {
      response += `${i + 1}. ${arg}\n`;
    });
  }

  if (data.top_evidence.length > 0) {
    response += `\n📁 Most effective evidence:\n`;
    data.top_evidence.forEach(ev => {
      response += `• ${ev.replace('_', ' ')}\n`;
    });
  }

  return response;
}
```

### Example Susan Conversations

**User**: "Are there any storms near 123 Main St, Fredericksburg VA?"

**Susan** (using storm data):
```
📍 I found 3 verified storm events near this location:

• 2024-06-15: 1.75" hail (Fredericksburg) - 2.3 miles away
• 2024-04-20: 2.00" hail (Spotsylvania) - 5.8 miles away
• 2023-08-10: 1.50" hail (Fredericksburg) - 1.2 miles away

💡 Success rate in this area: 85%
Average settlement: $12,450.00

🎯 Top winning arguments:
1. Provided detailed IHM report showing hail damage
2. Submitted photos of clear impact damage
3. Referenced VA building codes

📁 Most effective evidence:
• IHM report
• photos
• engineer report

Would you like me to pull up the IHM report for the June 15th storm?
```

**User**: "What works with State Farm in Maryland?"

**Susan** (using area strategies):
```
Based on 47 successful State Farm claims in Maryland:

📊 Stats:
• Success rate: 82%
• Average settlement: $15,200
• Typical response time: 12 days

🎯 What works:
1. Strong photo documentation (used in 89% of wins)
2. Engineer reports (76% success rate when included)
3. IHM confirmation reports (highly effective)

⚠️ Common challenges:
• Initial resistance to roof replacement (39% required supplement)
• Reinspection requests (28% of claims)

💡 Best approach:
Lead with comprehensive documentation package including IHM report, photos showing
clear impact patterns, and contractor estimate. State Farm adjusters in MD tend to
approve faster when you reference neighboring approved claims.

Want me to show you recent wins with specific State Farm adjusters?
```

## Frontend Integration

### React Component Example

```typescript
// StormLookupPanel.tsx
import React, { useState } from 'react';
import type { StormNearLocation } from '../types/storm-data';

interface StormLookupPanelProps {
  latitude: number;
  longitude: number;
  onStormSelect?: (storm: StormNearLocation) => void;
}

export function StormLookupPanel({ latitude, longitude, onStormSelect }: StormLookupPanelProps) {
  const [storms, setStorms] = useState<StormNearLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState(10);

  const lookupStorms = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/storm/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude, radius_miles: radiusMiles }),
      });
      const data = await response.json();
      setStorms(data.storms);
    } catch (error) {
      console.error('Failed to lookup storms:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="storm-lookup-panel">
      <h3>Storm History Lookup</h3>

      <div className="controls">
        <label>
          Search radius:
          <input
            type="number"
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(parseInt(e.target.value))}
          />
          miles
        </label>
        <button onClick={lookupStorms} disabled={loading}>
          {loading ? 'Searching...' : 'Find Storms'}
        </button>
      </div>

      {storms.length > 0 && (
        <div className="results">
          <h4>Found {storms.length} storm(s)</h4>
          <ul>
            {storms.map((storm) => (
              <li key={storm.storm_id} onClick={() => onStormSelect?.(storm)}>
                <strong>{new Date(storm.event_date).toLocaleDateString()}</strong>
                {' - '}
                {storm.hail_size_inches}" hail
                {' - '}
                {storm.city}, {storm.state}
                {' - '}
                <em>{storm.distance_miles.toFixed(1)} miles away</em>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

## Database Maintenance

### Periodic Tasks

Run these periodically to keep data fresh:

```sql
-- Recalculate area patterns (weekly)
-- See README_019_STORM_DATA.md for full query

-- Clean up old analytics (monthly)
DELETE FROM storm_lookup_analytics
WHERE created_at < NOW() - INTERVAL '6 months';

-- Update storm event verification
UPDATE storm_events
SET verified_by = $1, verification_timestamp = NOW()
WHERE id = $2;
```

### Performance Monitoring

```sql
-- Check index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read
FROM pg_stat_user_indexes
WHERE tablename LIKE 'storm_%'
ORDER BY idx_scan DESC;

-- Check table sizes
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'storm_%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Data Import Scripts

### Import IHM Data

```typescript
// scripts/import-ihm-data.ts
import { StormDataService } from '../server/services/stormDataService';
import { pool } from '../server/db';

interface IHMRecord {
  address: string;
  latitude: number;
  longitude: number;
  date: string;
  hailSize: number;
  reportUrl: string;
}

async function importIHMData(records: IHMRecord[], userId: string) {
  const stormService = new StormDataService(pool);

  for (const record of records) {
    await stormService.createStormEvent({
      address: record.address,
      city: extractCity(record.address),
      state: extractState(record.address),
      zip_code: extractZip(record.address),
      latitude: record.latitude,
      longitude: record.longitude,
      event_date: new Date(record.date),
      event_type: 'hail',
      hail_size_inches: record.hailSize,
      hail_size_description: getHailDescription(record.hailSize),
      data_source: 'IHM',
      source_confidence: 'verified',
      source_url: record.reportUrl,
      discovered_by: userId,
    });
  }

  console.log(`Imported ${records.length} IHM storm events`);
}
```

## Testing

```typescript
// __tests__/storm-data.test.ts
import { StormDataService } from '../server/services/stormDataService';

describe('StormDataService', () => {
  let service: StormDataService;

  beforeAll(() => {
    service = new StormDataService(pool);
  });

  test('should find storms near location', async () => {
    const storms = await service.findStormsNearLocation({
      latitude: 38.3032053,
      longitude: -77.4605399,
      radius_miles: 10,
      days_back: 365,
    });

    expect(Array.isArray(storms)).toBe(true);
  });

  test('should get area strategies', async () => {
    const strategies = await service.getAreaStrategies({
      state: 'VA',
      city: 'Fredericksburg',
    });

    expect(strategies).toHaveProperty('total_claims');
    expect(strategies).toHaveProperty('success_rate');
  });

  test('should create storm event', async () => {
    const event = await service.createStormEvent({
      address: '123 Test St, Richmond, VA 23220',
      city: 'Richmond',
      state: 'VA',
      zip_code: '23220',
      latitude: 37.5407,
      longitude: -77.4360,
      event_date: new Date('2024-06-15'),
      event_type: 'hail',
      hail_size_inches: 1.75,
      data_source: 'manual',
    });

    expect(event).toHaveProperty('id');
    expect(event.city).toBe('Richmond');
  });
});
```

## Next Steps

1. **Deploy migration** to Railway
2. **Add API routes** to server
3. **Update Susan's chat logic** to use recommendations
4. **Build frontend UI** for storm lookup
5. **Import historical data** from IHM/NOAA
6. **Set up periodic pattern recalculation**
7. **Add admin UI** for managing storm data
8. **Implement data validation** and quality checks

---

**For detailed schema documentation, see**: `README_019_STORM_DATA.md`
**For API usage examples, see**: `stormDataService.ts`
