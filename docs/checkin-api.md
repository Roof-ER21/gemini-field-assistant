# Check-In API Documentation

The Check-In API enables sales reps to track their field activities with location-based check-ins and check-outs, along with session statistics.

## Base URL

All endpoints are prefixed with `/api/checkin`

## Authentication

All endpoints (except `/active`) require the `x-user-email` header for user authentication.

```
x-user-email: user@example.com
```

## Endpoints

### 1. Start Check-In

**POST** `/api/checkin`

Start a new check-in session for the current user.

#### Request Headers
```
x-user-email: user@example.com
Content-Type: application/json
```

#### Request Body
```json
{
  "location_lat": 39.0458,
  "location_lng": -77.4875,
  "notes": "Starting canvassing in downtown area"
}
```

**Fields:**
- `location_lat` (required): Latitude coordinate (-90 to 90)
- `location_lng` (required): Longitude coordinate (-180 to 180)
- `notes` (optional): Initial note for the check-in session

#### Response (Success)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "checkInTime": "2026-02-01T15:30:00.000Z",
    "checkInLat": 39.0458,
    "checkInLng": -77.4875,
    "doorsKnocked": 0,
    "contactsMade": 0,
    "leadsGenerated": 0,
    "appointmentsSet": 0,
    "notes": "Starting canvassing in downtown area"
  }
}
```

#### Error Cases
- **401**: Missing `x-user-email` header
- **404**: User not found
- **400**: Invalid coordinates or missing required fields
- **500**: User already has an active session

---

### 2. End Check-Out

**POST** `/api/checkin/checkout`

End the current check-in session with final statistics.

#### Request Headers
```
x-user-email: user@example.com
Content-Type: application/json
```

#### Request Body
```json
{
  "checkinId": "550e8400-e29b-41d4-a716-446655440000",
  "stats": {
    "doorsKnocked": 45,
    "contactsMade": 12,
    "leadsGenerated": 3,
    "appointmentsSet": 1
  },
  "lat": 39.0512,
  "lng": -77.4823,
  "note": "Great afternoon, hit quota!"
}
```

**Fields:**
- `checkinId` (required): ID of the check-in session to end
- `stats` (required): Object containing session statistics
  - `doorsKnocked` (required): Number of doors knocked (≥ 0)
  - `contactsMade` (required): Number of contacts made (≥ 0)
  - `leadsGenerated` (required): Number of leads generated (≥ 0)
  - `appointmentsSet` (required): Number of appointments set (≥ 0)
- `lat` (required): Check-out latitude
- `lng` (required): Check-out longitude
- `note` (optional): Final note for the session

#### Response (Success)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "checkInTime": "2026-02-01T15:30:00.000Z",
    "checkOutTime": "2026-02-01T19:45:00.000Z",
    "checkInLat": 39.0458,
    "checkInLng": -77.4875,
    "checkOutLat": 39.0512,
    "checkOutLng": -77.4823,
    "doorsKnocked": 45,
    "contactsMade": 12,
    "leadsGenerated": 3,
    "appointmentsSet": 1,
    "notes": "Starting canvassing in downtown area | Great afternoon, hit quota!"
  }
}
```

#### Error Cases
- **401**: Missing `x-user-email` header
- **404**: User not found or session not found
- **400**: Invalid stats, coordinates, or missing required fields
- **500**: Session already ended or unauthorized

---

### 3. Get Active Check-Ins (Company-Wide)

**GET** `/api/checkin/active`

Get all currently active check-in sessions across the company.

#### Request Headers
None required (public endpoint for company visibility)

#### Response (Success)
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "userId": "123e4567-e89b-12d3-a456-426614174000",
      "userName": "John Smith",
      "userEmail": "john@example.com",
      "checkInTime": "2026-02-01T15:30:00.000Z",
      "checkInLat": 39.0458,
      "checkInLng": -77.4875,
      "doorsKnocked": 0,
      "contactsMade": 0,
      "leadsGenerated": 0,
      "appointmentsSet": 0,
      "notes": "Starting canvassing in downtown area"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440111",
      "userId": "223e4567-e89b-12d3-a456-426614174111",
      "userName": "Jane Doe",
      "userEmail": "jane@example.com",
      "checkInTime": "2026-02-01T14:00:00.000Z",
      "checkInLat": 38.9072,
      "checkInLng": -77.0369,
      "doorsKnocked": 0,
      "contactsMade": 0,
      "leadsGenerated": 0,
      "appointmentsSet": 0
    }
  ]
}
```

---

### 4. Get My Active Session

**GET** `/api/checkin/my-session`

Get the current user's active check-in session (if any).

#### Request Headers
```
x-user-email: user@example.com
```

#### Response (Success - Active Session)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "checkInTime": "2026-02-01T15:30:00.000Z",
    "checkInLat": 39.0458,
    "checkInLng": -77.4875,
    "doorsKnocked": 0,
    "contactsMade": 0,
    "leadsGenerated": 0,
    "appointmentsSet": 0,
    "notes": "Starting canvassing in downtown area"
  }
}
```

#### Response (Success - No Active Session)
```json
{
  "success": true,
  "data": null
}
```

#### Error Cases
- **401**: Missing `x-user-email` header
- **404**: User not found

---

### 5. Get Check-In History

**GET** `/api/checkin/history?limit=50`

Get the current user's check-in history.

#### Request Headers
```
x-user-email: user@example.com
```

#### Query Parameters
- `limit` (optional): Maximum number of sessions to return (default: 50)

#### Response (Success)
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "userId": "123e4567-e89b-12d3-a456-426614174000",
      "checkInTime": "2026-02-01T15:30:00.000Z",
      "checkOutTime": "2026-02-01T19:45:00.000Z",
      "checkInLat": 39.0458,
      "checkInLng": -77.4875,
      "checkOutLat": 39.0512,
      "checkOutLng": -77.4823,
      "doorsKnocked": 45,
      "contactsMade": 12,
      "leadsGenerated": 3,
      "appointmentsSet": 1,
      "notes": "Great afternoon session"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440111",
      "userId": "123e4567-e89b-12d3-a456-426614174000",
      "checkInTime": "2026-01-31T14:00:00.000Z",
      "checkOutTime": "2026-01-31T18:30:00.000Z",
      "checkInLat": 38.9072,
      "checkInLng": -77.0369,
      "checkOutLat": 38.9123,
      "checkOutLng": -77.0412,
      "doorsKnocked": 38,
      "contactsMade": 10,
      "leadsGenerated": 2,
      "appointmentsSet": 0
    }
  ]
}
```

#### Error Cases
- **401**: Missing `x-user-email` header
- **404**: User not found

---

### 6. Get Check-In Statistics

**GET** `/api/checkin/stats?days=30`

Get aggregated statistics for the current user's check-ins.

#### Request Headers
```
x-user-email: user@example.com
```

#### Query Parameters
- `days` (optional): Number of days to look back (default: 30)

#### Response (Success)
```json
{
  "success": true,
  "data": {
    "totalSessions": 15,
    "totalDoors": 675,
    "totalContacts": 180,
    "totalLeads": 45,
    "totalAppointments": 12,
    "avgDoorsPerSession": 45.0,
    "avgDuration": 245.5
  }
}
```

**Fields:**
- `totalSessions`: Total completed check-in sessions
- `totalDoors`: Total doors knocked
- `totalContacts`: Total contacts made
- `totalLeads`: Total leads generated
- `totalAppointments`: Total appointments set
- `avgDoorsPerSession`: Average doors per session
- `avgDuration`: Average session duration in minutes

#### Error Cases
- **401**: Missing `x-user-email` header
- **404**: User not found

---

## Database Schema

The check-in data is stored in the `territory_checkins` table:

```sql
CREATE TABLE territory_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    territory_id UUID REFERENCES territories(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    check_in_time TIMESTAMPTZ DEFAULT NOW(),
    check_out_time TIMESTAMPTZ,
    check_in_lat DECIMAL(10, 8),
    check_in_lng DECIMAL(11, 8),
    check_out_lat DECIMAL(10, 8),
    check_out_lng DECIMAL(11, 8),
    doors_knocked INTEGER DEFAULT 0,
    contacts_made INTEGER DEFAULT 0,
    leads_generated INTEGER DEFAULT 0,
    appointments_set INTEGER DEFAULT 0,
    notes TEXT
);
```

**Indexes:**
- `idx_territory_checkins_user` on `user_id`
- `idx_territory_checkins_active` on `check_out_time` WHERE `check_out_time IS NULL`

---

## Usage Examples

### Example 1: Full Check-In/Out Flow

```javascript
// 1. Start check-in
const checkinResponse = await fetch('/api/checkin', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-email': 'john@example.com'
  },
  body: JSON.stringify({
    location_lat: 39.0458,
    location_lng: -77.4875,
    notes: 'Starting downtown canvassing'
  })
});

const { data: session } = await checkinResponse.json();
console.log('Session ID:', session.id);

// 2. Work in the field...

// 3. End check-out
const checkoutResponse = await fetch('/api/checkin/checkout', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-email': 'john@example.com'
  },
  body: JSON.stringify({
    checkinId: session.id,
    stats: {
      doorsKnocked: 45,
      contactsMade: 12,
      leadsGenerated: 3,
      appointmentsSet: 1
    },
    lat: 39.0512,
    lng: -77.4823,
    note: 'Great session!'
  })
});
```

### Example 2: Check for Active Session on App Load

```javascript
// Check if user has active session
const response = await fetch('/api/checkin/my-session', {
  headers: {
    'x-user-email': 'john@example.com'
  }
});

const { data: activeSession } = await response.json();

if (activeSession) {
  console.log('Active session found:', activeSession);
  // Resume session UI
} else {
  console.log('No active session');
  // Show start session button
}
```

### Example 3: Display Team Activity

```javascript
// Get all active check-ins (for manager dashboard)
const response = await fetch('/api/checkin/active');
const { data: activeCheckins } = await response.json();

console.log(`${activeCheckins.length} reps currently in the field:`);
activeCheckins.forEach(checkin => {
  console.log(`- ${checkin.userName} (checked in at ${checkin.checkInTime})`);
});
```

---

## Notes

- **Territory Assignment**: The `territory_id` field is optional and can be `null` for standalone check-ins
- **Location Privacy**: Location data is stored but should only be visible to authorized users/managers
- **Session Validation**: Users cannot start a new check-in while having an active session
- **Notes Concatenation**: When checking out with a note, it's appended to existing notes with a pipe separator
- **Statistics Validation**: All stat values must be non-negative integers
- **Time Zones**: All timestamps are stored in UTC with timezone support (TIMESTAMPTZ)

---

## Future Enhancements

Potential future additions to the Check-In API:

1. **Territory Auto-Detection**: Automatically assign `territory_id` based on check-in location
2. **Real-Time Updates**: WebSocket support for live check-in notifications
3. **Session Pausing**: Allow reps to pause/resume sessions (e.g., lunch breaks)
4. **Photo Attachments**: Allow reps to attach photos to check-ins
5. **Route Tracking**: Store GPS breadcrumb trail during active sessions
6. **Geofencing Alerts**: Notify when reps enter/exit designated territories
7. **Team Leaderboards**: Real-time leaderboards based on check-in stats
8. **Automated Reports**: Daily/weekly summary reports of check-in activity

---

**Created**: February 1, 2026
**Version**: 1.0.0
**Status**: Production Ready
