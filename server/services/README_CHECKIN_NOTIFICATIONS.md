# Check-In Push Notifications

## Overview

When a team member checks in to the field, push notifications are automatically sent to other team members to keep everyone informed about field activity in real-time.

## Features

### 1. Automatic Notifications
- **Triggered on Check-In**: Notifications are sent when a user successfully checks in
- **Team-Wide Alerts**: All eligible team members receive the notification
- **Location Context**: Shows distance if recipient's location is known
- **Custom Notes**: Includes check-in notes if provided

### 2. Smart Filtering
- **Self-Exclusion**: The user who checked in doesn't receive their own notification
- **Role-Based**: Only sends to sales_rep, team_lead, and manager roles
- **Proximity-Based**: Optional distance filtering (only notify users within X miles)
- **Preference Respect**: Honors user notification preferences and quiet hours

### 3. User Preferences
Users can control check-in notifications with:
- **Enable/Disable**: Toggle check-in notifications on/off
- **Proximity Filter**: Set a distance limit (e.g., only notify if within 10 miles)
- **Quiet Hours**: Respect global quiet hours setting
- **Master Toggle**: Respect "all notifications disabled" setting

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                  Check-In Flow                          │
├─────────────────────────────────────────────────────────┤
│  1. User checks in (checkinService.startCheckin)       │
│  2. Check-in saved to database                          │
│  3. Real-time broadcast (WebSocket)                     │
│  4. Push notifications triggered                        │
│     ↓                                                    │
│  checkinNotificationService.notifyTeamOfCheckin()      │
│     ↓                                                    │
│  - Query eligible users (with preferences)              │
│  - Filter by proximity (if enabled)                     │
│  - Calculate distances                                  │
│  - Send via pushNotificationService                     │
│     ↓                                                    │
│  Firebase Cloud Messaging (FCM)                         │
│     ↓                                                    │
│  User devices (iOS, Android, Web)                       │
└─────────────────────────────────────────────────────────┘
```

### Services

#### 1. `checkinService.ts`
- Handles check-in/check-out operations
- Triggers notification service after successful check-in
- Broadcasts to WebSocket clients

#### 2. `checkinNotificationService.ts`
- Manages check-in notification logic
- Queries users with preferences
- Filters by proximity
- Sends notifications via push service

#### 3. `pushNotificationService.ts`
- Core push notification service
- Handles FCM integration
- Manages preferences and quiet hours
- Logs all notifications

#### 4. `geoUtils.ts`
- Geographic utility functions
- Haversine distance calculation
- Distance formatting

### Database Schema

#### Notification Preferences (Extended)
```sql
ALTER TABLE notification_preferences
ADD COLUMN checkin_alerts_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE notification_preferences
ADD COLUMN checkin_proximity_miles INTEGER DEFAULT NULL;
```

- `checkin_alerts_enabled`: Master toggle for check-in notifications
- `checkin_proximity_miles`: Distance filter (NULL = always notify)

## API Endpoints

### Get Notification Preferences
```http
GET /api/push/preferences
Headers:
  x-user-email: user@example.com

Response:
{
  "success": true,
  "preferences": {
    "allNotificationsEnabled": true,
    "stormAlertsEnabled": true,
    "impactAlertsEnabled": true,
    "teamMentionAlerts": true,
    "teamMessageAlerts": true,
    "checkinAlertsEnabled": true,
    "checkinProximityMiles": null,
    "quietHoursEnabled": false,
    "quietHoursStart": "22:00",
    "quietHoursEnd": "07:00",
    "timezone": "America/New_York"
  }
}
```

### Update Notification Preferences
```http
PUT /api/push/preferences
Headers:
  x-user-email: user@example.com
Body:
{
  "checkinAlertsEnabled": true,
  "checkinProximityMiles": 10
}

Response:
{
  "success": true,
  "message": "Preferences updated"
}
```

### Check-In (Triggers Notifications)
```http
POST /api/checkin
Headers:
  x-user-email: user@example.com
Body:
{
  "location_lat": 40.7128,
  "location_lng": -74.0060,
  "notes": "Starting morning canvass in Manhattan"
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "checkInTime": "2025-02-01T10:00:00Z",
    "checkInLat": 40.7128,
    "checkInLng": -74.0060,
    "notes": "Starting morning canvass in Manhattan",
    ...
  }
}
```

## Notification Format

### Notification Data
```json
{
  "title": "📍 John Doe checked in",
  "body": "John Doe is now in the field (2.5 mi away) - Starting morning canvass in Manhattan",
  "data": {
    "type": "checkin",
    "checkinId": "uuid",
    "userId": "uuid",
    "userName": "John Doe",
    "latitude": "40.7128",
    "longitude": "-74.0060",
    "timestamp": "2025-02-01T10:00:00.000Z"
  }
}
```

### Notification Types
- **With Distance**: "John Doe is now in the field (2.5 mi away)"
- **Without Distance**: "John Doe is now in the field"
- **With Note**: Appends " - [note]" to the body
- **Nearby**: Shows "nearby" for distances < 0.1 miles

## User Flow Examples

### Example 1: Basic Check-In Notification
```
1. Sarah checks in at 40.7128, -74.0060
2. System finds 3 eligible team members (excluding Sarah)
3. All 3 have checkin_alerts_enabled = true
4. None have proximity filters
5. Notifications sent to all 3
```

### Example 2: Proximity Filtering
```
1. Mike checks in at 40.7128, -74.0060
2. System finds 5 eligible team members
3. Tom has checkin_proximity_miles = 10
4. Tom's last known location: 40.7500, -74.0200 (3 miles away)
5. Tom receives notification (within 10 miles)
6. Other 4 users receive notifications (no proximity filter)
```

### Example 3: Disabled Notifications
```
1. Lisa checks in at 40.7128, -74.0060
2. System finds 4 eligible team members
3. Dave has checkin_alerts_enabled = false
4. Dave is excluded from notifications
5. Other 3 users receive notifications
```

### Example 4: Quiet Hours
```
1. Emily checks in at 11:30 PM
2. System finds 2 eligible team members
3. Bob has quiet_hours_enabled = true (10 PM - 7 AM)
4. Bob is excluded (current time in quiet hours)
5. Other user receives notification
```

## Distance Calculation

### Haversine Formula
The system uses the Haversine formula to calculate great-circle distances between coordinates:

```typescript
function calculateDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
```

### Accuracy
- Accurate for short to medium distances
- Assumes spherical Earth (good enough for < 500 miles)
- Returns distance in miles

## Last Known Location

The system tracks user location from their check-ins:

```sql
WITH user_last_location AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    check_in_lat,
    check_in_lng
  FROM territory_checkins
  WHERE check_in_lat IS NOT NULL
    AND check_in_lng IS NOT NULL
  ORDER BY user_id, check_in_time DESC
)
```

- Uses most recent check-in location
- Only if coordinates are available
- Used for distance calculations in notifications

## Testing

### Manual Testing
```bash
# 1. Register a push token
curl -X POST http://localhost:3000/api/push/register \
  -H "x-user-email: user1@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceToken": "test-token-123",
    "deviceType": "web"
  }'

# 2. Check notification preferences
curl http://localhost:3000/api/push/preferences \
  -H "x-user-email: user1@example.com"

# 3. Update preferences (enable proximity filter)
curl -X PUT http://localhost:3000/api/push/preferences \
  -H "x-user-email: user1@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "checkinAlertsEnabled": true,
    "checkinProximityMiles": 5
  }'

# 4. Check in as another user
curl -X POST http://localhost:3000/api/checkin \
  -H "x-user-email: user2@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "location_lat": 40.7128,
    "location_lng": -74.0060,
    "notes": "Testing check-in notifications"
  }'

# 5. Check notification logs
SELECT * FROM push_notification_log
WHERE notification_type = 'checkin_alert'
ORDER BY created_at DESC
LIMIT 10;
```

### Unit Testing
```typescript
// Test proximity filtering
const service = createCheckinNotificationService(pool);
await service.notifyTeamOfCheckin({
  checkinId: 'test-id',
  userId: 'user-123',
  userName: 'Test User',
  checkInLat: 40.7128,
  checkInLng: -74.0060,
  note: 'Test check-in'
});

// Verify notifications sent to correct users
// Verify distance calculations
// Verify preference filtering
```

## Performance Considerations

### Query Optimization
- Uses indexed joins on user_id
- DISTINCT ON for efficient last location lookup
- Left joins for optional preferences

### Async Processing
- Notifications sent asynchronously (non-blocking)
- Errors logged but don't fail check-in operation
- Promise.catch() prevents unhandled rejections

### Scalability
- For large teams (100+ users), consider:
  - Background job queue (Bull/BullMQ)
  - Batch notification sending
  - Rate limiting per user

## Error Handling

### Graceful Degradation
```typescript
notificationService.notifyTeamOfCheckin(data)
  .catch(error => {
    console.error('Error sending notifications:', error);
    // Check-in still succeeds even if notifications fail
  });
```

### Invalid Tokens
- Firebase automatically detects invalid tokens
- Service marks tokens as inactive
- User must re-register device

### Missing Location
- Notifications still sent without distance info
- Body shows "is now in the field" (no distance)

## Future Enhancements

### Potential Features
1. **Geofencing**: Notify when someone enters a specific area
2. **Team Channels**: Notifications only within team/territory
3. **Custom Radius**: Per-user proximity settings
4. **Rich Notifications**: Maps, quick actions
5. **Notification History**: View past check-in alerts
6. **Batch Notifications**: Daily summary of team check-ins
7. **Smart Grouping**: Combine nearby check-ins into one notification

### Analytics
- Track notification engagement (opens, dismissals)
- Measure optimal proximity settings
- Identify notification fatigue patterns

## Troubleshooting

### Users Not Receiving Notifications
1. Check `notification_preferences.checkin_alerts_enabled`
2. Verify `notification_preferences.all_notifications_enabled`
3. Check quiet hours settings
4. Verify push token is active
5. Check proximity filter (if set)
6. Verify user role (must be sales_rep, team_lead, or manager)

### Distance Calculations Incorrect
1. Verify coordinates are valid (-90 to 90 lat, -180 to 180 lng)
2. Check last known location exists for user
3. Verify Haversine formula parameters

### Notifications Not Sending
1. Check Firebase initialization
2. Verify FCM credentials
3. Check network connectivity
4. Review `push_notification_log` for errors
5. Verify device tokens are valid

## Related Documentation

- `/server/services/pushNotificationService.ts` - Core push service
- `/server/services/checkinService.ts` - Check-in operations
- `/server/routes/pushRoutes.ts` - Notification preference API
- `/database/migrations/026_push_tokens.sql` - Push notification schema
- `/database/migrations/045_checkin_notifications.sql` - Check-in preference schema
