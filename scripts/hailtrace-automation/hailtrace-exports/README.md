# HailTrace Export Directory

This directory is monitored by the HailTrace import service for automatic import of storm events.

## Expected JSON Format

Place HailTrace JSON exports in this directory with the following structure:

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
  ],
  "metadata": {
    "exportDate": "2025-01-15",
    "source": "HailTrace Automation",
    "version": "1.0"
  }
}
```

## Required Fields

Each event must have:
- `id` - Unique event identifier (string)
- `date` - Event date in YYYY-MM-DD format (will be converted to Eastern timezone)

## Optional Fields

- `types` - Array of event type strings (e.g., ["ALGORITHM_HAIL_SIZE", "METEOROLOGIST_HAIL_SIZE"])
- `hailSize` - Primary hail size in inches (number)
- `hailSizeAlgorithm` - Algorithm-derived hail size in inches (number)
- `hailSizeMeteo` - Meteorologist-confirmed hail size in inches (number)
- `windSpeed` - Wind speed in mph (number)
- `windStarLevel` - Wind severity rating 0-5 (integer)
- `latitude` - Event latitude (number)
- `longitude` - Event longitude (number)

## Auto-Import Behavior

1. Place JSON files in this directory
2. Service scans every 60 seconds (configurable)
3. Events are imported and deduplicated
4. Processed files are moved to `processed/` subdirectory
5. Duplicates are automatically skipped

## Manual Import

Use the API endpoint:
```bash
POST /api/hail/import-hailtrace
{
  "filepath": "/path/to/export.json"
}
```

## File Watching Control

Start watching:
```bash
POST /api/hail/hailtrace-watch
{
  "action": "start",
  "intervalMs": 60000
}
```

Stop watching:
```bash
POST /api/hail/hailtrace-watch
{
  "action": "stop"
}
```

## Status Check

```bash
GET /api/hail/hailtrace-status
```

Returns:
- Watching status
- Total imported events
- Last import date
- Pending files count

## Important Notes

⚠️ **Eastern Timezone**: All dates are automatically converted to Eastern timezone (America/New_York) for consistency with IHM and NOAA data.

⚠️ **Deduplication**: Events are checked against existing HailTrace events by ID and similar events by date + hail size to prevent duplicates.

⚠️ **File Processing**: Successfully imported files are moved to `processed/` subdirectory to prevent re-import.
