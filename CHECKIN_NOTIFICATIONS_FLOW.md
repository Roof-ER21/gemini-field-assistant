# Check-In Notifications - Complete Flow Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT APPLICATION                          │
├─────────────────────────────────────────────────────────────────────┤
│  User Action: Check In Button Clicked                              │
│    ↓                                                                 │
│  POST /api/checkin                                                   │
│    {                                                                 │
│      location_lat: 40.7128,                                         │
│      location_lng: -74.0060,                                        │
│      notes: "Starting morning canvass"                              │
│    }                                                                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      checkinRoutes.ts                               │
├─────────────────────────────────────────────────────────────────────┤
│  1. Validate user email header                                      │
│  2. Get user ID from email                                          │
│  3. Validate coordinates                                            │
│  4. Call checkinService.startCheckin()                              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      checkinService.ts                              │
├─────────────────────────────────────────────────────────────────────┤
│  Step 1: Check for existing active session                         │
│    ↓ (none found)                                                   │
│  Step 2: Insert check-in to database                                │
│    INSERT INTO territory_checkins                                   │
│    RETURNING *                                                       │
│    ↓                                                                 │
│  Step 3: Get user details (name, email)                            │
│    SELECT name, email FROM users WHERE id = $1                      │
│    ↓                                                                 │
│  Step 4: Broadcast via WebSocket (real-time)                       │
│    presence.broadcastToAll({                                        │
│      type: 'checkin_start',                                         │
│      data: { session, userName, userEmail }                         │
│    })                                                                │
│    ↓                                                                 │
│  Step 5: Trigger push notifications (async, non-blocking)          │
│    checkinNotificationService.notifyTeamOfCheckin({                 │
│      checkinId, userId, userName,                                   │
│      checkInLat, checkInLng, note                                   │
│    }).catch(error => log error)                                     │
│    ↓                                                                 │
│  Step 6: Return session to client                                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ (async)
┌─────────────────────────────────────────────────────────────────────┐
│              checkinNotificationService.ts                          │
├─────────────────────────────────────────────────────────────────────┤
│  Step 1: Query eligible users                                      │
│    WITH user_last_location AS (                                     │
│      SELECT DISTINCT ON (user_id)                                   │
│        user_id, check_in_lat, check_in_lng                          │
│      FROM territory_checkins                                        │
│      ORDER BY user_id, check_in_time DESC                           │
│    )                                                                 │
│    SELECT                                                            │
│      u.id, u.name, u.email,                                         │
│      ull.check_in_lat as last_known_lat,                            │
│      ull.check_in_lng as last_known_lng,                            │
│      np.checkin_alerts_enabled,                                     │
│      np.checkin_proximity_miles,                                    │
│      np.all_notifications_enabled                                   │
│    FROM users u                                                      │
│    LEFT JOIN user_last_location ull ON u.id = ull.user_id          │
│    LEFT JOIN notification_preferences np ON u.id = np.user_id      │
│    WHERE u.id != $1  -- Exclude check-in user                      │
│      AND u.role IN ('sales_rep', 'team_lead', 'manager')           │
│    ↓                                                                 │
│  Step 2: Filter users                                               │
│    For each user:                                                    │
│      ✓ Check all_notifications_enabled                             │
│      ✓ Check checkin_alerts_enabled                                │
│      ✓ Check proximity (if checkin_proximity_miles set)            │
│         - Calculate distance using Haversine formula                │
│         - Skip if distance > proximity limit                        │
│    ↓                                                                 │
│  Step 3: Build and send notifications                              │
│    For each eligible user:                                          │
│      - Calculate distance (if location available)                   │
│      - Build notification title and body                            │
│      - Call pushService.sendToUser()                                │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                 pushNotificationService.ts                          │
├─────────────────────────────────────────────────────────────────────┤
│  Step 1: Check if user should receive notification                 │
│    shouldSendNotification(userId, 'checkin_alert')                  │
│      ✓ Check all_notifications_enabled                             │
│      ✓ Check checkin_alerts_enabled                                │
│      ✓ Check quiet hours                                            │
│    ↓ (true)                                                         │
│  Step 2: Get user's push tokens                                    │
│    SELECT * FROM push_tokens                                        │
│    WHERE user_id = $1                                               │
│      AND is_active = TRUE                                           │
│      AND notifications_enabled = TRUE                               │
│    ↓                                                                 │
│  Step 3: Send to each device                                       │
│    For each token:                                                   │
│      - Build FCM message                                            │
│      - Platform-specific config (iOS/Android/Web)                   │
│      - Call messaging.send(message)                                 │
│      - Log notification to database                                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                 Firebase Cloud Messaging (FCM)                      │
├─────────────────────────────────────────────────────────────────────┤
│  Delivers to user devices:                                          │
│    - iOS (APNs)                                                     │
│    - Android (FCM)                                                  │
│    - Web (Service Worker)                                           │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         USER DEVICES                                │
├─────────────────────────────────────────────────────────────────────┤
│  Notification Received:                                             │
│  ┌────────────────────────────────────────┐                        │
│  │ 📍 John Doe checked in                  │                        │
│  │ John Doe is now in the field (2.5 mi   │                        │
│  │ away) - Starting morning canvass        │                        │
│  └────────────────────────────────────────┘                        │
│                                                                      │
│  Tap to view check-in details                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Database Tables Involved

```
┌──────────────────────────────┐
│    territory_checkins        │
├──────────────────────────────┤
│ id (UUID)                    │
│ user_id (FK)                 │
│ check_in_time                │
│ check_out_time               │
│ check_in_lat                 │  ← Used for notifications
│ check_in_lng                 │  ← Used for notifications
│ notes                        │  ← Included in notification
│ doors_knocked                │
│ contacts_made                │
│ leads_generated              │
│ appointments_set             │
└──────────────────────────────┘
           ↓
┌──────────────────────────────┐
│         users                 │
├──────────────────────────────┤
│ id (UUID)                    │
│ name                         │  ← Notification sender name
│ email                        │
│ role                         │  ← Filter: sales_rep, etc.
└──────────────────────────────┘
           ↓
┌──────────────────────────────┐
│  notification_preferences    │
├──────────────────────────────┤
│ user_id (FK)                 │
│ all_notifications_enabled    │  ← Master toggle
│ checkin_alerts_enabled       │  ← NEW: Check-in toggle
│ checkin_proximity_miles      │  ← NEW: Distance filter
│ quiet_hours_enabled          │
│ quiet_hours_start            │
│ quiet_hours_end              │
│ timezone                     │
└──────────────────────────────┘
           ↓
┌──────────────────────────────┐
│        push_tokens            │
├──────────────────────────────┤
│ id (UUID)                    │
│ user_id (FK)                 │
│ device_token                 │  ← FCM token
│ device_type                  │  ← ios/android/web
│ is_active                    │
│ notifications_enabled        │
└──────────────────────────────┘
           ↓
┌──────────────────────────────┐
│   push_notification_log      │
├──────────────────────────────┤
│ id (UUID)                    │
│ user_id (FK)                 │
│ notification_type            │  ← 'checkin_alert'
│ title                        │
│ body                         │
│ data (JSONB)                 │
│ status                       │  ← sent/failed
│ fcm_message_id               │
│ error_message                │
│ created_at                   │
└──────────────────────────────┘
```

## Distance Calculation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Distance Calculation                             │
├─────────────────────────────────────────────────────────────────────┤
│  Input: Two coordinate pairs                                        │
│    - Check-in location: (lat1, lng1)                               │
│    - User's last known location: (lat2, lng2)                      │
│    ↓                                                                 │
│  Step 1: Haversine Formula                                          │
│    R = 3958.8 miles (Earth's radius)                               │
│    dLat = (lat2 - lat1) in radians                                 │
│    dLng = (lng2 - lng1) in radians                                 │
│    ↓                                                                 │
│  Step 2: Calculate 'a'                                              │
│    a = sin(dLat/2)² +                                              │
│        cos(lat1) × cos(lat2) × sin(dLng/2)²                       │
│    ↓                                                                 │
│  Step 3: Calculate 'c'                                              │
│    c = 2 × atan2(√a, √(1-a))                                       │
│    ↓                                                                 │
│  Step 4: Calculate distance                                         │
│    distance = R × c                                                 │
│    ↓                                                                 │
│  Output: Distance in miles                                          │
│    - Used for proximity filtering                                   │
│    - Formatted for notification body                                │
└─────────────────────────────────────────────────────────────────────┘
```

## Notification Filtering Decision Tree

```
                      User checks in
                           ↓
                   Get all other users
                           ↓
           ┌───────────────┴───────────────┐
           ↓                               ↓
    Is same user?                   Role filter
        YES → SKIP            sales_rep/team_lead/manager?
         NO ↓                       NO → SKIP
                                   YES ↓
           ┌───────────────┴───────────────┐
           ↓                               ↓
    All notifications        Check-in notifications
       enabled?                    enabled?
        NO → SKIP                 NO → SKIP
       YES ↓                     YES ↓
           └───────────────┬───────────────┘
                           ↓
                 Quiet hours enabled?
                           ↓
            ┌──────────────┴──────────────┐
            ↓ NO                          ↓ YES
      Continue                    In quiet hours?
            ↓                             ↓
            │                      YES → SKIP
            │                       NO ↓
            └──────────────┬──────────────┘
                           ↓
             Proximity filter set?
                           ↓
            ┌──────────────┴──────────────┐
            ↓ NO                          ↓ YES
      Send notification          Has last location?
                                         ↓
                              ┌──────────┴──────────┐
                              ↓ NO                 ↓ YES
                            SKIP          Calculate distance
                                                   ↓
                                      Within proximity limit?
                                                   ↓
                                      ┌────────────┴────────────┐
                                      ↓ YES                    ↓ NO
                              Send notification              SKIP
```

## Example Scenarios

### Scenario 1: Basic Notification (No Filters)

```
User A checks in at (40.7128, -74.0060)
    ↓
User B preferences:
  - checkin_alerts_enabled: true
  - checkin_proximity_miles: null
  - all_notifications_enabled: true
  - quiet_hours_enabled: false
    ↓
Decision: SEND NOTIFICATION
    ↓
User B's last location: (40.7500, -74.0200)
Distance: 3.2 miles
    ↓
Notification:
  Title: "📍 User A checked in"
  Body: "User A is now in the field (3 mi away)"
```

### Scenario 2: Proximity Filter Applied

```
User A checks in at (40.7128, -74.0060)
    ↓
User C preferences:
  - checkin_alerts_enabled: true
  - checkin_proximity_miles: 5
  - all_notifications_enabled: true
    ↓
User C's last location: (40.8000, -74.1000)
Distance: 6.8 miles
    ↓
Decision: SKIP (6.8 miles > 5 miles limit)
```

### Scenario 3: Disabled Notifications

```
User A checks in at (40.7128, -74.0060)
    ↓
User D preferences:
  - checkin_alerts_enabled: false
  - all_notifications_enabled: true
    ↓
Decision: SKIP (check-in alerts disabled)
```

### Scenario 4: Quiet Hours

```
User A checks in at 11:30 PM
    ↓
User E preferences:
  - checkin_alerts_enabled: true
  - quiet_hours_enabled: true
  - quiet_hours_start: "22:00"
  - quiet_hours_end: "07:00"
  - timezone: "America/New_York"
    ↓
Current time in timezone: 23:30 (11:30 PM)
    ↓
Decision: SKIP (in quiet hours)
```

## Performance Characteristics

```
Query Performance:
  ├─ Get eligible users: ~10-50ms (indexed on user_id)
  ├─ Get last locations: ~5-20ms (DISTINCT ON, indexed)
  ├─ Get preferences: ~5-10ms (indexed on user_id)
  ├─ Distance calculations: ~1ms per user (in-memory)
  └─ Send notifications: ~100-500ms per user (Firebase API)

Total time for 10 users: ~1-2 seconds (async, non-blocking)

Database Queries:
  └─ 1 main query (with CTEs and JOINs)
     - Fetches users, locations, preferences in single query
     - Filtering done in application layer
```

## Error Handling

```
Possible Errors:
├─ Invalid coordinates
│  └─ Validation: -90 to 90 lat, -180 to 180 lng
├─ User already checked in
│  └─ Check before insert
├─ Firebase not initialized
│  └─ Log warning, continue without notifications
├─ Invalid push token
│  └─ Mark token inactive, continue to next token
├─ Network error (Firebase)
│  └─ Log error, continue to next user
└─ Database query error
   └─ Log error, use default preferences

All errors are non-fatal - check-in always succeeds
```
