# Check-In Routes Quick Reference

## Endpoints

All endpoints are prefixed with `/api/checkin`

### 1. Start Check-In
```
POST /api/checkin
Headers: x-user-email
Body: { location_lat, location_lng, notes? }
```

### 2. End Check-Out
```
POST /api/checkin/checkout
Headers: x-user-email
Body: { checkinId, stats: { doorsKnocked, contactsMade, leadsGenerated, appointmentsSet }, lat, lng, note? }
```

### 3. Get Active Check-Ins (Company-Wide)
```
GET /api/checkin/active
```

### 4. Get My Active Session
```
GET /api/checkin/my-session
Headers: x-user-email
```

### 5. Get Check-In History
```
GET /api/checkin/history?limit=50
Headers: x-user-email
```

### 6. Get Check-In Statistics
```
GET /api/checkin/stats?days=30
Headers: x-user-email
```

## Service Methods

```typescript
import { createCheckinService } from '../services/checkinService.js';

const checkinService = createCheckinService(pool);

// Start check-in
await checkinService.startCheckin(userId, lat, lng, note?);

// End check-in
await checkinService.endCheckin(checkinId, userId, stats, endLat, endLng, note?);

// Get active check-ins
await checkinService.getActiveCheckins();

// Get user's active session
await checkinService.getUserActiveSession(userId);

// Get user's history
await checkinService.getUserCheckinHistory(userId, limit?);

// Get user's stats
await checkinService.getUserCheckinStats(userId, daysBack?);
```

## Database Table

```sql
territory_checkins (
  id UUID PRIMARY KEY,
  territory_id UUID,
  user_id UUID,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  check_in_lat DECIMAL(10,8),
  check_in_lng DECIMAL(11,8),
  check_out_lat DECIMAL(10,8),
  check_out_lng DECIMAL(11,8),
  doors_knocked INTEGER,
  contacts_made INTEGER,
  leads_generated INTEGER,
  appointments_set INTEGER,
  notes TEXT
)
```

See `/Users/a21/gemini-field-assistant/docs/checkin-api.md` for full documentation.
