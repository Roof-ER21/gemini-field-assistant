# HailTrace Import Service - API Reference

## Overview

The HailTrace import service provides automatic import of storm event data from JSON exports. All dates are normalized to Eastern timezone (America/New_York) for consistency with IHM and NOAA data.

## Base URL

```
http://localhost:8080/api/hail
```

Production:
```
https://a21.up.railway.app/api/hail
```

---

## Endpoints

### 1. Import HailTrace File (Manual)

Import a specific HailTrace JSON file.

**Endpoint:** `POST /api/hail/import-hailtrace`

**Request Body:**
```json
{
  "filepath": "/Users/a21/gemini-field-assistant/scripts/hailtrace-automation/hailtrace-exports/export-2024.json"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Import completed successfully",
  "imported": 25,
  "skipped": 0,
  "duplicates": 3,
  "errors": [],
  "filename": "export-2024.json"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Import completed with errors",
  "imported": 20,
  "skipped": 2,
  "duplicates": 3,
  "errors": [
    "Event missing required fields (id or date): {...}"
  ],
  "filename": "export-2024.json"
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/hail/import-hailtrace \
  -H "Content-Type: application/json" \
  -d '{
    "filepath": "/Users/a21/gemini-field-assistant/scripts/hailtrace-automation/hailtrace-exports/sample-export.json"
  }'
```

---

### 2. Get HailTrace Status

Check the status of the HailTrace integration.

**Endpoint:** `GET /api/hail/hailtrace-status`

**Response:**
```json
{
  "success": true,
  "watching": true,
  "exportDirectory": "/Users/a21/gemini-field-assistant/scripts/hailtrace-automation/hailtrace-exports",
  "totalImported": 128,
  "lastImportDate": "2025-02-03T10:30:00.000Z",
  "pendingFiles": ["export-2025-02.json"],
  "message": "Watching for files (1 pending)"
}
```

**Example:**
```bash
curl http://localhost:8080/api/hail/hailtrace-status
```

---

### 3. Control File Watching

Start or stop automatic file watching.

**Endpoint:** `POST /api/hail/hailtrace-watch`

**Request Body (Start):**
```json
{
  "action": "start",
  "intervalMs": 60000
}
```

**Request Body (Stop):**
```json
{
  "action": "stop"
}
```

**Response (Start):**
```json
{
  "success": true,
  "message": "HailTrace file watching started",
  "intervalMs": 60000
}
```

**Response (Stop):**
```json
{
  "success": true,
  "message": "HailTrace file watching stopped"
}
```

**Examples:**
```bash
# Start watching (check every 60 seconds)
curl -X POST http://localhost:8080/api/hail/hailtrace-watch \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "intervalMs": 60000}'

# Stop watching
curl -X POST http://localhost:8080/api/hail/hailtrace-watch \
  -H "Content-Type: application/json" \
  -d '{"action": "stop"}'
```

---

### 4. Manual Directory Scan

Trigger an immediate scan of the export directory.

**Endpoint:** `POST /api/hail/hailtrace-scan`

**Response:**
```json
{
  "success": true,
  "message": "Manual scan completed",
  "processed": 5,
  "pending": 2
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/hail/hailtrace-scan
```

---

### 5. Get HailTrace Events

Retrieve imported HailTrace events with optional filters.

**Endpoint:** `GET /api/hail/hailtrace-events`

**Query Parameters:**
- `startDate` (optional) - Filter events from this date (YYYY-MM-DD)
- `endDate` (optional) - Filter events to this date (YYYY-MM-DD)
- `minHailSize` (optional) - Minimum hail size in inches
- `limit` (optional) - Maximum number of results (default: 100)

**Response:**
```json
{
  "success": true,
  "events": [
    {
      "id": "hailtrace-20240715-001",
      "date": "2024-07-15",
      "latitude": 39.2904,
      "longitude": -76.6122,
      "hailSize": 2.5,
      "windSpeed": 65,
      "severity": "severe",
      "source": "HailTrace",
      "raw": { ... }
    }
  ],
  "count": 1
}
```

**Examples:**
```bash
# All events (last 100)
curl http://localhost:8080/api/hail/hailtrace-events

# Events with hail >= 2 inches
curl "http://localhost:8080/api/hail/hailtrace-events?minHailSize=2"

# Events in date range
curl "http://localhost:8080/api/hail/hailtrace-events?startDate=2024-07-01&endDate=2024-07-31"

# Combine filters
curl "http://localhost:8080/api/hail/hailtrace-events?startDate=2024-01-01&minHailSize=1.5&limit=50"
```

---

### 6. Get Import Statistics

View statistics for all imported files.

**Endpoint:** `GET /api/hail/hailtrace-stats`

**Response:**
```json
{
  "success": true,
  "stats": [
    {
      "source_file": "export-2024.json",
      "event_count": 25,
      "earliest_event": "2024-01-15",
      "latest_event": "2024-12-20",
      "avg_hail_size": "1.85",
      "max_hail_size": "3.50",
      "imported_at": "2025-02-03T10:30:00.000Z"
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:8080/api/hail/hailtrace-stats
```

---

## Integration with Existing Hail Search

HailTrace events are stored separately but use the same `HailEvent` format as IHM and NOAA events. You can combine them in your queries:

```typescript
// Example: Get all storm data for a location
const ihmData = await hailMapsService.searchByAddress(...);
const noaaData = await noaaStormService.getStormEvents(...);
const hailtraceData = await hailtraceImportService.getEvents({
  startDate: '2024-01-01',
  minHailSize: 1.0
});

// Combine all sources
const allEvents = [
  ...ihmData.events,
  ...noaaData,
  ...hailtraceData
].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
```

---

## Automated Workflow

### Option 1: Server-Controlled Auto-Import

Start file watching when server boots:

```typescript
// In server/index.ts
hailtraceImportService.initialize(pool);
hailtraceImportService.startWatching(60000); // Check every 60 seconds
```

### Option 2: Cron-Based Import

Use the scan endpoint with a cron job:

```bash
# Add to crontab (every 5 minutes)
*/5 * * * * curl -X POST http://localhost:8080/api/hail/hailtrace-scan
```

### Option 3: Script-Triggered Import

Call the manual import endpoint from your automation script:

```bash
# After generating export.json
curl -X POST http://localhost:8080/api/hail/import-hailtrace \
  -H "Content-Type: application/json" \
  -d "{\"filepath\": \"$EXPORT_FILE\"}"
```

---

## Environment Variables

Configure the export directory location:

```bash
# .env
HAILTRACE_EXPORT_DIR=/custom/path/to/exports
```

Default: `/Users/a21/gemini-field-assistant/scripts/hailtrace-automation/hailtrace-exports`

---

## Database Schema

Events are stored in the `hailtrace_events` table:

```sql
CREATE TABLE hailtrace_events (
    id UUID PRIMARY KEY,
    event_id VARCHAR(255) UNIQUE,  -- Original HailTrace ID
    event_date DATE,                -- Eastern timezone
    types JSONB,                    -- Event types array
    hail_size DECIMAL(4,2),
    hail_size_algorithm DECIMAL(4,2),
    hail_size_meteo DECIMAL(4,2),
    wind_speed INTEGER,
    wind_star_level INTEGER,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    imported_at TIMESTAMPTZ,
    source_file VARCHAR(500),
    raw_data JSONB,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Detailed error message"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad request (missing/invalid parameters)
- `404` - Resource not found
- `500` - Server error

---

## Testing

Run the test script:

```bash
cd /Users/a21/gemini-field-assistant/scripts/hailtrace-automation
ts-node test-import.ts
```

Or test with custom file:

```bash
ts-node test-import.ts /path/to/custom-export.json
```

---

## Tips

1. **Timezone Consistency**: All dates are automatically converted to Eastern timezone. Don't convert them manually.

2. **Deduplication**: Events are deduplicated by `event_id` and by date + hail size similarity.

3. **File Processing**: Successfully imported files are moved to `processed/` subdirectory automatically.

4. **Performance**: The service uses database indexes on `event_date`, `hail_size`, and coordinates for fast queries.

5. **Monitoring**: Use the `/hailtrace-stats` endpoint to monitor import activity and data quality.
