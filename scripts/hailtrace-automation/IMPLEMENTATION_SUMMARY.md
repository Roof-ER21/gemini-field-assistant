# HailTrace Import Service - Implementation Summary

## What Was Built

A complete HailTrace import service that watches for JSON exports and automatically imports them into the PostgreSQL database with timezone normalization and deduplication.

## Files Created

### 1. Database Migration
**File:** `/Users/a21/gemini-field-assistant/database/migrations/048_hailtrace_events.sql`

Creates:
- `hailtrace_events` table with full schema
- Indexes for performance (event_id, date, hail_size, coordinates, types)
- Triggers for timestamp updates
- View `hailtrace_import_stats` for monitoring

### 2. Service Layer
**File:** `/Users/a21/gemini-field-assistant/server/services/hailtraceImportService.ts`

Provides:
- `importFromFile(filepath)` - Manual import function
- `startWatching(intervalMs)` - Auto-watch directory
- `stopWatching()` - Stop auto-watch
- `getStatus()` - Get integration status
- `getEvents(params)` - Query imported events
- `getImportStats()` - View import statistics
- `manualScan()` - Trigger directory scan

Key Features:
- Eastern timezone normalization (America/New_York)
- Deduplication by event_id and date+hail_size
- Automatic file archiving to `processed/` subdirectory
- Converts HailTrace format to standard HailEvent format

### 3. API Routes
**File:** `/Users/a21/gemini-field-assistant/server/routes/hailRoutes.ts` (updated)

New endpoints:
- `POST /api/hail/import-hailtrace` - Manual import trigger
- `GET /api/hail/hailtrace-status` - Status check
- `POST /api/hail/hailtrace-watch` - Start/stop watching
- `POST /api/hail/hailtrace-scan` - Manual directory scan
- `GET /api/hail/hailtrace-events` - Query events with filters
- `GET /api/hail/hailtrace-stats` - Import statistics

### 4. Server Integration
**File:** `/Users/a21/gemini-field-assistant/server/index.ts` (updated)

Added:
```typescript
import { hailtraceImportService } from './services/hailtraceImportService.js';

// After database pool initialization
hailtraceImportService.initialize(pool);
console.log('✅ HailTrace import service initialized');
```

### 5. Documentation
**Files:**
- `/scripts/hailtrace-automation/API_REFERENCE.md` - Complete API docs
- `/scripts/hailtrace-automation/hailtrace-exports/README.md` - Export format guide
- `/scripts/hailtrace-automation/IMPLEMENTATION_SUMMARY.md` - This file

### 6. Test Script
**File:** `/scripts/hailtrace-automation/test-import.ts`

Demonstrates:
- Manual import
- Status checking
- Event querying
- Statistics viewing

### 7. Sample Data
**File:** `/scripts/hailtrace-automation/hailtrace-exports/sample-export.json`

Provides 4 sample events for testing.

## Database Schema

```sql
CREATE TABLE hailtrace_events (
    id UUID PRIMARY KEY,
    event_id VARCHAR(255) UNIQUE,      -- HailTrace event ID
    event_date DATE,                    -- Eastern timezone
    types JSONB,                        -- Event types array
    hail_size DECIMAL(4,2),            -- Primary hail size
    hail_size_algorithm DECIMAL(4,2),  -- Algorithm size
    hail_size_meteo DECIMAL(4,2),      -- Meteorologist size
    wind_speed INTEGER,                 -- mph
    wind_star_level INTEGER,            -- 0-5 rating
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    imported_at TIMESTAMPTZ,
    source_file VARCHAR(500),
    raw_data JSONB,                     -- Full original data
    deleted_at TIMESTAMPTZ,             -- Soft delete
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

## HailTrace JSON Format

```json
{
  "events": [
    {
      "id": "hailtrace-20240715-001",
      "date": "2024-07-15",
      "types": ["ALGORITHM_HAIL_SIZE", "METEOROLOGIST_HAIL_SIZE"],
      "hailSize": 2.5,
      "hailSizeAlgorithm": 2.25,
      "hailSizeMeteo": 2.5,
      "windSpeed": 65,
      "windStarLevel": 2,
      "latitude": 39.2904,
      "longitude": -76.6122
    }
  ]
}
```

## How It Works

### Auto-Import Flow

```
1. JSON file placed in hailtrace-exports/
2. Service scans directory (every 60s by default)
3. Parse JSON and validate schema
4. Normalize dates to Eastern timezone
5. Check for duplicates
6. Insert events into database
7. Move file to processed/ subdirectory
8. Update import statistics
```

### Deduplication Logic

Events are skipped if:
1. **Event ID exists**: Same `event_id` in database
2. **Similar event exists**: Same date AND hail size within 0.5 inches

### Timezone Normalization

**CRITICAL**: All dates are converted to Eastern timezone (America/New_York)

```typescript
// Input: "2024-07-15" or "2024-07-15T14:30:00Z"
// Process: new Date(input).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
// Output: "2024-07-15" (Eastern timezone)
```

This ensures consistency with IHM and NOAA event dates.

## API Usage Examples

### Manual Import

```bash
curl -X POST http://localhost:8080/api/hail/import-hailtrace \
  -H "Content-Type: application/json" \
  -d '{
    "filepath": "/Users/a21/gemini-field-assistant/scripts/hailtrace-automation/hailtrace-exports/sample-export.json"
  }'
```

Response:
```json
{
  "success": true,
  "imported": 4,
  "duplicates": 0,
  "skipped": 0,
  "errors": [],
  "filename": "sample-export.json"
}
```

### Start Auto-Watching

```bash
curl -X POST http://localhost:8080/api/hail/hailtrace-watch \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "intervalMs": 60000}'
```

### Check Status

```bash
curl http://localhost:8080/api/hail/hailtrace-status
```

Response:
```json
{
  "success": true,
  "watching": true,
  "exportDirectory": "/Users/a21/gemini-field-assistant/scripts/hailtrace-automation/hailtrace-exports",
  "totalImported": 4,
  "lastImportDate": "2025-02-03T14:30:00.000Z",
  "pendingFiles": []
}
```

### Query Events

```bash
# All events with hail >= 2 inches
curl "http://localhost:8080/api/hail/hailtrace-events?minHailSize=2"

# Events in date range
curl "http://localhost:8080/api/hail/hailtrace-events?startDate=2024-07-01&endDate=2024-07-31"
```

## Testing

### Run Test Script

```bash
cd /Users/a21/gemini-field-assistant/scripts/hailtrace-automation
ts-node test-import.ts
```

Output shows:
- Database connection status
- Service initialization
- Import results
- Event statistics
- Recent events

### Run Database Migration

```bash
cd /Users/a21/gemini-field-assistant
npm run db:migrate
```

This creates the `hailtrace_events` table and related indexes/views.

## Integration with Existing Code

The service integrates seamlessly with existing hail search:

```typescript
// Example: Combine all hail data sources
const [ihmData, noaaData, hailtraceData] = await Promise.all([
  hailMapsService.searchByAddress(address, months),
  noaaStormService.getStormEvents(lat, lng, radius, years),
  hailtraceImportService.getEvents({ startDate, endDate, minHailSize })
]);

// All use the same HailEvent interface
const allEvents = [
  ...ihmData.events,
  ...noaaData,
  ...hailtraceData
];
```

## Monitoring

### View Import Statistics

```bash
curl http://localhost:8080/api/hail/hailtrace-stats
```

Shows per-file statistics:
- Event count
- Date range
- Average/max hail size
- Import timestamp

### Database Queries

```sql
-- Total imported events
SELECT COUNT(*) FROM hailtrace_events WHERE deleted_at IS NULL;

-- Recent imports
SELECT * FROM hailtrace_import_stats ORDER BY imported_at DESC LIMIT 10;

-- Events by severity
SELECT
  CASE
    WHEN hail_size >= 2 THEN 'severe'
    WHEN hail_size >= 1 THEN 'moderate'
    ELSE 'minor'
  END as severity,
  COUNT(*) as count
FROM hailtrace_events
WHERE deleted_at IS NULL
GROUP BY severity;
```

## Deployment Options

### Option 1: Auto-Start on Server Boot

Edit `/server/index.ts`:

```typescript
hailtraceImportService.initialize(pool);
hailtraceImportService.startWatching(60000); // Auto-start
```

### Option 2: API-Controlled

Start via API when needed:

```bash
curl -X POST http://localhost:8080/api/hail/hailtrace-watch \
  -d '{"action": "start"}'
```

### Option 3: Cron Job

```bash
# Add to crontab
*/5 * * * * curl -X POST http://localhost:8080/api/hail/hailtrace-scan
```

## Environment Variables

```bash
# Optional: Custom export directory
HAILTRACE_EXPORT_DIR=/custom/path/to/exports

# Required: Database connection
DATABASE_URL=postgresql://user:pass@host/db
```

## Key Features

✅ **Automatic Import**: Files placed in directory are auto-imported
✅ **Deduplication**: Prevents duplicate events
✅ **Timezone Normalization**: All dates in Eastern timezone
✅ **File Archiving**: Processed files moved to subdirectory
✅ **RESTful API**: Full API for manual control
✅ **Statistics**: Per-file import tracking
✅ **Error Handling**: Comprehensive error messages
✅ **Type Safety**: Full TypeScript implementation
✅ **Database Optimization**: Indexes on all query fields
✅ **Monitoring View**: `hailtrace_import_stats` for analytics

## Complete File List

### Created Files
1. `/database/migrations/048_hailtrace_events.sql`
2. `/server/services/hailtraceImportService.ts`
3. `/scripts/hailtrace-automation/API_REFERENCE.md`
4. `/scripts/hailtrace-automation/test-import.ts`
5. `/scripts/hailtrace-automation/hailtrace-exports/README.md`
6. `/scripts/hailtrace-automation/hailtrace-exports/sample-export.json`
7. `/scripts/hailtrace-automation/IMPLEMENTATION_SUMMARY.md`

### Modified Files
1. `/server/routes/hailRoutes.ts` - Added 6 new endpoints
2. `/server/index.ts` - Added service initialization

## Next Steps

1. **Run Migration**: `npm run db:migrate`
2. **Test Import**: `ts-node test-import.ts`
3. **Start Watching**: POST to `/api/hail/hailtrace-watch`
4. **Place JSON Files**: In `hailtrace-exports/`
5. **Monitor**: GET `/api/hail/hailtrace-status`

## Support

For complete API documentation, see: [API_REFERENCE.md](./API_REFERENCE.md)

For export format details, see: [hailtrace-exports/README.md](./hailtrace-exports/README.md)
