# Check-In Push Notifications - Implementation Summary

## What Was Implemented

Push notifications are now automatically sent to team members when someone checks in to the field. This keeps everyone informed about team activity in real-time.

## New Files Created

### 1. Database Migration
**File**: `/Users/a21/gemini-field-assistant/database/migrations/045_checkin_notifications.sql`
- Adds `checkin_alerts_enabled` column (boolean, default true)
- Adds `checkin_proximity_miles` column (integer, optional distance filter)

### 2. Geographic Utilities
**File**: `/Users/a21/gemini-field-assistant/server/utils/geoUtils.ts`
- `calculateDistanceMiles()` - Haversine formula for distance calculation
- `formatDistance()` - Format miles for display (e.g., "2.5 mi", "nearby")
- `getLocationDescription()` - Placeholder for reverse geocoding

### 3. Check-In Notification Service
**File**: `/Users/a21/gemini-field-assistant/server/services/checkinNotificationService.ts`
- `notifyTeamOfCheckin()` - Send notifications to team members
- `getUsersToNotify()` - Query and filter eligible users
- `updateCheckinPreferences()` - Update user preferences
- `getCheckinPreferences()` - Get user preferences
- Smart filtering by:
  - User preferences (enabled/disabled)
  - Proximity (distance-based filtering)
  - Quiet hours
  - User roles (sales_rep, team_lead, manager)

### 4. Documentation
**File**: `/Users/a21/gemini-field-assistant/server/services/README_CHECKIN_NOTIFICATIONS.md`
- Complete feature documentation
- API examples
- Testing procedures
- Troubleshooting guide

## Modified Files

### 1. Check-In Service
**File**: `/Users/a21/gemini-field-assistant/server/services/checkinService.ts`
**Changes**:
- Import `checkinNotificationService`
- After successful check-in, trigger notifications
- Non-blocking async call (doesn't fail check-in if notifications fail)

### 2. Push Routes
**File**: `/Users/a21/gemini-field-assistant/server/routes/pushRoutes.ts`
**Changes**:
- Added `checkinAlertsEnabled` to GET `/api/push/preferences`
- Added `checkinProximityMiles` to GET `/api/push/preferences`
- Added both fields to PUT `/api/push/preferences`
- Import `checkinNotificationService`

### 3. Push Notification Service
**File**: `/Users/a21/gemini-field-assistant/server/services/pushNotificationService.ts`
**Changes**:
- Added `checkin_alert` case to `shouldSendNotification()` method
- Respects `checkin_alerts_enabled` preference

## How It Works

### 1. Check-In Flow
```
User checks in
    ↓
checkinService.startCheckin()
    ↓
Save to database
    ↓
Broadcast via WebSocket
    ↓
Trigger push notifications (async)
    ↓
checkinNotificationService.notifyTeamOfCheckin()
    ↓
Query eligible users (with preferences & location)
    ↓
Filter by:
  - Not the user who checked in
  - Role (sales_rep, team_lead, manager)
  - Notifications enabled
  - Proximity (if set)
  - Quiet hours
    ↓
Calculate distances (if locations available)
    ↓
Send via pushNotificationService
    ↓
Firebase Cloud Messaging
    ↓
User devices
```

### 2. Notification Format

**Example 1** (with distance):
```
Title: 📍 John Doe checked in
Body: John Doe is now in the field (2.5 mi away) - Starting morning canvass
```

**Example 2** (without distance):
```
Title: 📍 Sarah Smith checked in
Body: Sarah Smith is now in the field
```

**Example 3** (nearby):
```
Title: 📍 Mike Jones checked in
Body: Mike Jones is now in the field (nearby)
```

### 3. Notification Data
```json
{
  "type": "checkin",
  "checkinId": "uuid",
  "userId": "uuid",
  "userName": "John Doe",
  "latitude": "40.7128",
  "longitude": "-74.0060",
  "timestamp": "2025-02-01T10:00:00.000Z"
}
```

## API Endpoints

### Get Preferences
```bash
GET /api/push/preferences
Headers:
  x-user-email: user@example.com

Response:
{
  "preferences": {
    "checkinAlertsEnabled": true,
    "checkinProximityMiles": null,
    ...
  }
}
```

### Update Preferences
```bash
PUT /api/push/preferences
Headers:
  x-user-email: user@example.com
Body:
{
  "checkinAlertsEnabled": true,
  "checkinProximityMiles": 10
}
```

### Check-In (Triggers Notifications)
```bash
POST /api/checkin
Headers:
  x-user-email: user@example.com
Body:
{
  "location_lat": 40.7128,
  "location_lng": -74.0060,
  "notes": "Starting morning canvass"
}
```

## User Preferences

### Enable/Disable
- **Default**: Enabled
- **Control**: `checkinAlertsEnabled` (boolean)
- **Effect**: Completely disable check-in notifications

### Proximity Filter
- **Default**: NULL (always notify)
- **Control**: `checkinProximityMiles` (integer)
- **Effect**: Only notify if within X miles of check-in location
- **Example**: Set to 10 to only be notified of check-ins within 10 miles

### Other Settings
- **Quiet Hours**: Respected (no notifications during quiet hours)
- **Master Toggle**: Respected (`allNotificationsEnabled`)

## Distance Calculation

### Last Known Location
- Uses user's most recent check-in location
- Query: `SELECT DISTINCT ON (user_id) ... ORDER BY check_in_time DESC`
- Falls back gracefully if no location available

### Haversine Formula
- Calculates great-circle distance between coordinates
- Earth radius: 3958.8 miles
- Accurate for distances < 500 miles
- Returns distance in miles

### Display Format
- `< 0.1 mi`: "nearby"
- `< 1 mi`: "0.3 mi"
- `>= 1 mi`: "2 mi" (rounded)

## Testing

### 1. Run Migration
```bash
cd /Users/a21/gemini-field-assistant
npm run db:migrate
```

### 2. Register Push Token
```bash
curl -X POST http://localhost:3000/api/push/register \
  -H "x-user-email: user1@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceToken": "test-token-123",
    "deviceType": "web"
  }'
```

### 3. Set Preferences
```bash
curl -X PUT http://localhost:3000/api/push/preferences \
  -H "x-user-email: user1@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "checkinAlertsEnabled": true,
    "checkinProximityMiles": 5
  }'
```

### 4. Check In as Another User
```bash
curl -X POST http://localhost:3000/api/checkin \
  -H "x-user-email: user2@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "location_lat": 40.7128,
    "location_lng": -74.0060,
    "notes": "Testing check-in notifications"
  }'
```

### 5. Verify Notifications
```sql
SELECT
  pnl.*,
  u.name as recipient_name,
  u.email as recipient_email
FROM push_notification_log pnl
JOIN users u ON pnl.user_id = u.id
WHERE notification_type = 'checkin_alert'
ORDER BY created_at DESC
LIMIT 10;
```

## Error Handling

### Non-Blocking
- Notifications sent asynchronously
- Check-in succeeds even if notifications fail
- Errors logged but don't throw

### Invalid Tokens
- Automatically detected by Firebase
- Tokens marked as inactive
- User must re-register device

### Missing Data
- No location: Notification sent without distance
- No preferences: Uses defaults (enabled, no proximity filter)
- No last known location: Can't calculate distance (skipped if proximity filter set)

## Performance

### Optimized Queries
- Uses indexed columns (`user_id`, `check_in_time`)
- `DISTINCT ON` for efficient location lookup
- Left joins for optional data

### Async Processing
- Non-blocking notification sending
- Doesn't delay check-in response
- Error handling with `.catch()`

## Next Steps

### Required for Production
1. **Run Migration**: Execute `045_checkin_notifications.sql`
2. **Test Push Tokens**: Ensure Firebase is configured
3. **Set Preferences**: Users can configure in app settings
4. **Monitor Logs**: Watch `push_notification_log` table

### Optional Enhancements
1. **Frontend UI**: Add preference controls in settings
2. **Rich Notifications**: Add map links, quick actions
3. **Batch Notifications**: Daily summary of check-ins
4. **Geofencing**: Alert when entering specific territories
5. **Analytics**: Track engagement and optimize

## Files Changed

### Created
- `/Users/a21/gemini-field-assistant/database/migrations/045_checkin_notifications.sql`
- `/Users/a21/gemini-field-assistant/server/utils/geoUtils.ts`
- `/Users/a21/gemini-field-assistant/server/services/checkinNotificationService.ts`
- `/Users/a21/gemini-field-assistant/server/services/README_CHECKIN_NOTIFICATIONS.md`

### Modified
- `/Users/a21/gemini-field-assistant/server/services/checkinService.ts`
- `/Users/a21/gemini-field-assistant/server/routes/pushRoutes.ts`
- `/Users/a21/gemini-field-assistant/server/services/pushNotificationService.ts`

## Key Features

✅ Automatic notifications on check-in
✅ Distance-based filtering (proximity)
✅ User preference controls
✅ Quiet hours respect
✅ Role-based filtering
✅ Graceful error handling
✅ Non-blocking async processing
✅ Comprehensive logging
✅ Distance calculations (Haversine)
✅ Last known location tracking

## Support

For questions or issues:
1. Check `/server/services/README_CHECKIN_NOTIFICATIONS.md`
2. Review `push_notification_log` table for errors
3. Verify Firebase configuration
4. Check user preferences in database
