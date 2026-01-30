# Canvassing Stats Fix - January 30, 2026

## Problem
Canvassing stats were showing 0 for all metrics even though entries were being saved.

Example issue:
- User saved entry for "8100 Boone Boulevard" (visible in Recent Activity)
- All stats showed 0:
  - Doors Knocked: 0
  - Contacts Made: 0
  - Leads Generated: 0
  - Sales Closed: 0

## Root Cause

The `get_user_canvassing_stats()` PostgreSQL function was calculating stats from the `canvassing_sessions` table only. However, when users save canvassing entries via the `/api/canvassing/mark` endpoint, they weren't creating sessions first - they were just marking addresses directly.

**Original logic (broken):**
```sql
SELECT
    COALESCE(SUM(cs.doors_knocked), 0) as total_doors,
    COALESCE(SUM(cs.contacts_made), 0) as total_contacts,
    -- ...
FROM canvassing_sessions cs  -- ← Only counting sessions!
WHERE cs.user_id = p_user_id
```

This meant:
- If user never explicitly starts/ends a session → stats show 0
- Actual canvassing entries in `canvassing_status` table were ignored

## Solution

Modified the `get_user_canvassing_stats()` function to count from the `canvassing_status` table (where actual entries are saved) instead of just `canvassing_sessions`.

**New logic (fixed):**
```sql
WITH activity_stats AS (
    SELECT
        COUNT(*) as doors,  -- All entries = doors knocked
        COUNT(*) FILTER (WHERE status IN ('contacted', 'interested', 'lead', ...)) as contacts,
        COUNT(*) FILTER (WHERE status IN ('lead', 'appointment_set', ...)) as leads,
        -- ...
    FROM canvassing_status  -- ← Now counting actual entries!
    WHERE contacted_by = p_user_id
    AND contact_date >= v_cutoff_date
)
```

## Changes Made

### 1. Database Migration
Created `/Users/a21/gemini-field-assistant/database/migrations/035_canvassing_tables_simplified.sql`:

- Recreated canvassing tables without requiring `storm_events` or `jobs` dependencies
- Replaced `get_user_canvassing_stats()` function with fixed version
- Added `get_neighborhood_intel()` function for location-based queries

### 2. Stats Calculation Logic

**Doors Knocked**: All canvassing entries count (any status change means a door was knocked)

**Contacts Made**: Status is `contacted` or better:
- contacted
- interested
- lead
- appointment_set
- sold
- customer

**Leads Generated**: Status is `lead` or better:
- lead
- appointment_set
- sold
- customer

**Appointments**: Status is `appointment_set` or better:
- appointment_set
- sold
- customer

**Conversion Rate**: `(leads / doors) * 100`

## Testing Results

Created 3 test entries and verified stats:

```bash
# Entry 1: contacted
curl -X POST /api/canvassing/mark -d '{
  "address": "8100 Boone Boulevard",
  "status": "contacted"
}'

# Entry 2: lead
curl -X POST /api/canvassing/mark -d '{
  "address": "123 Main Street",
  "status": "lead"
}'

# Entry 3: appointment_set
curl -X POST /api/canvassing/mark -d '{
  "address": "456 Oak Avenue",
  "status": "appointment_set"
}'

# Result:
GET /api/canvassing/stats
{
  "totalDoors": 3,
  "totalContacts": 3,
  "totalLeads": 2,
  "totalAppointments": 1,
  "conversionRate": 66.67
}
```

All stats now calculate correctly!

## Database Tables

### canvassing_status
Primary table storing all canvassing entries:
- User marks an address → row inserted/updated here
- Tracks: address, status, contact info, homeowner details
- Stats now calculate from this table

### canvassing_sessions
Optional session tracking:
- User can start/end sessions for time tracking
- Includes: start_time, end_time, target area
- Stats use this for "avg doors per session" IF sessions exist

### canvassing_activity_log
Audit trail of all canvassing actions:
- Logs every status change
- Used by triggers to update session stats (if session exists)

## Files Modified

1. `/database/migrations/035_canvassing_tables_simplified.sql` - NEW
   - Creates canvassing tables
   - Implements fixed stats function

2. `/database/migrations/034_fix_canvassing_stats.sql` - OBSOLETE
   - Initial attempt (failed due to missing tables)
   - Replaced by migration 035

## How to Verify Fix

```bash
# 1. Check tables exist
psql $DATABASE_URL -c "\dt canvassing*"

# 2. Test marking an address
curl -X POST http://localhost:8080/api/canvassing/mark \
  -H "Content-Type: application/json" \
  -H "x-user-email: test@roofer.com" \
  -d '{"address":"Test Street","status":"contacted"}'

# 3. Verify stats show the entry
curl http://localhost:8080/api/canvassing/stats \
  -H "x-user-email: test@roofer.com"

# Expected: totalDoors >= 1, totalContacts >= 1
```

## Production Deployment

When deploying to production:

```bash
# Run migration 035
psql $DATABASE_URL -f database/migrations/035_canvassing_tables_simplified.sql

# Restart server
npm run server:build
pm2 restart gemini-server
```

## Related Files

- `/server/routes/canvassingRoutes.ts` - API endpoints (unchanged)
- `/server/services/canvassingService.ts` - Business logic (unchanged)
- `/services/canvassingApi.ts` - Frontend API client (unchanged)

## Summary

**Before Fix**: Stats always showed 0 because they only counted sessions (which users weren't creating).

**After Fix**: Stats count actual canvassing entries from the `canvassing_status` table, accurately reflecting all saved activity.

**Impact**: All canvassing entries now correctly contribute to:
- Doors Knocked
- Contacts Made
- Leads Generated
- Appointments Set
- Conversion Rate

The user's "8100 Boone Boulevard" entry and all other saved entries will now appear in stats!
