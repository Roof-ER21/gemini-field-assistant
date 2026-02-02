# Check-In System Architecture

## Component Hierarchy

```
TeamPanel.tsx
├── Tabs: [Messages, Team, Check-In, Roof]
└── Check-In Tab (activeTab === 'checkin')
    └── CheckInSection.tsx
        ├── View Toggle [List | Map]
        ├── List View (viewMode === 'list')
        │   ├── Check-In Button (if not checked in)
        │   ├── Active Session Card (if checked in)
        │   │   ├── Duration Timer (live updates)
        │   │   ├── Location Display
        │   │   ├── Notes Editor
        │   │   ├── Stats Inputs (4 fields)
        │   │   └── Check-Out Button
        │   └── Team Check-Ins List
        │       └── Team Member Cards (mapped)
        │           ├── Avatar
        │           ├── Name & Time
        │           ├── Duration
        │           ├── Location
        │           └── Notes
        └── Map View (viewMode === 'map')
            └── CheckInMap.tsx
                ├── Map Controls
                │   └── Hail Events Toggle
                ├── Leaflet MapContainer
                │   ├── TileLayer (OpenStreetMap)
                │   ├── MapBoundsController
                │   ├── Check-In Markers (mapped)
                │   │   └── Popups with session details
                │   └── Hail Event Circles (mapped)
                │       └── Popups with event details
                └── Loading Indicator
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER ACTIONS                            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CheckInSection Component                     │
│                                                                 │
│  State:                                                         │
│  - activeCheckIns: CheckIn[]                                   │
│  - myCheckIn: CheckIn | null                                   │
│  - notes: string                                                │
│  - stats: { doors, contacts, leads, appointments }             │
│  - duration: string (live timer)                               │
│  - viewMode: 'list' | 'map'                                    │
│                                                                 │
│  Effects:                                                       │
│  - fetchCheckIns() on mount                                    │
│  - Auto-refresh every 30 seconds                               │
│  - Update duration every minute                                │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API CALLS                               │
│                                                                 │
│  Check In:                                                      │
│    navigator.geolocation → POST /api/checkin                   │
│                                                                 │
│  Check Out:                                                     │
│    POST /api/checkout (with stats)                             │
│                                                                 │
│  Fetch Active:                                                  │
│    GET /api/checkins/active                                    │
│                                                                 │
│  Update Notes:                                                  │
│    PUT /api/checkin/:id/notes                                  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend Routes                               │
│            /server/routes/checkinRoutes.ts                     │
│                                                                 │
│  POST   /api/checkin                                           │
│  POST   /api/checkout                                          │
│  GET    /api/checkins/active                                   │
│  GET    /api/checkin/my-session                                │
│  GET    /api/checkin/history                                   │
│  GET    /api/checkin/stats                                     │
│  PUT    /api/checkin/:id/notes                                 │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CheckinService                               │
│           /server/services/checkinService.ts                   │
│                                                                 │
│  Methods:                                                       │
│  - startCheckin(userId, lat, lng, note)                        │
│  - endCheckin(checkinId, userId, stats, lat, lng, note)        │
│  - getActiveCheckins()                                         │
│  - getUserActiveSession(userId)                                │
│  - getUserCheckinHistory(userId, limit)                        │
│  - getUserCheckinStats(userId, days)                           │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                        │
│                                                                 │
│  Table: territory_checkins                                     │
│  ├── id (UUID, PK)                                             │
│  ├── user_id (UUID, FK → users)                                │
│  ├── check_in_time (TIMESTAMPTZ)                               │
│  ├── check_out_time (TIMESTAMPTZ, nullable)                    │
│  ├── check_in_lat (DECIMAL)                                    │
│  ├── check_in_lng (DECIMAL)                                    │
│  ├── check_out_lat (DECIMAL, nullable)                         │
│  ├── check_out_lng (DECIMAL, nullable)                         │
│  ├── doors_knocked (INTEGER)                                   │
│  ├── contacts_made (INTEGER)                                   │
│  ├── leads_generated (INTEGER)                                 │
│  ├── appointments_set (INTEGER)                                │
│  └── notes (TEXT, nullable)                                    │
│                                                                 │
│  Indexes:                                                       │
│  - idx_territory_checkins_user                                 │
│  - idx_territory_checkins_active (WHERE check_out_time IS NULL)│
└─────────────────────────────────────────────────────────────────┘
```

## State Management Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Check-In Flow                                │
└─────────────────────────────────────────────────────────────────┘

1. User clicks "Check In" button
         │
         ▼
2. Request location permission
         │
         ├── Denied → Show error message
         │
         └── Granted
                 │
                 ▼
3. Capture coordinates (lat, lng)
         │
         ▼
4. POST /api/checkin { location_lat, location_lng, notes }
         │
         ▼
5. Backend validates:
   - User is authenticated
   - No active session exists
   - Coordinates are valid
         │
         ▼
6. Create check-in record
         │
         ▼
7. Response: { success: true, data: session }
         │
         ▼
8. Frontend updates state:
   - myCheckIn = session
   - Start duration timer
   - Show active session card
         │
         ▼
9. User works in field, updates notes/stats periodically


┌─────────────────────────────────────────────────────────────────┐
│                   Check-Out Flow                                │
└─────────────────────────────────────────────────────────────────┘

1. User updates final stats:
   - doors_knocked
   - contacts_made
   - leads_generated
   - appointments_set
         │
         ▼
2. User clicks "Check Out" button
         │
         ▼
3. POST /api/checkout { doors_knocked, contacts_made, ... }
         │
         ▼
4. Backend:
   - Finds user's active session
   - Updates stats
   - Sets check_out_time = NOW()
         │
         ▼
5. Response: { success: true, data: updated_session }
         │
         ▼
6. Frontend updates state:
   - myCheckIn = null
   - Clear stats
   - Clear notes
   - Stop duration timer
   - Hide active session card
         │
         ▼
7. User can check in again


┌─────────────────────────────────────────────────────────────────┐
│                Team Visibility Flow                             │
└─────────────────────────────────────────────────────────────────┘

1. Component mounts
         │
         ▼
2. fetchCheckIns() called
         │
         ▼
3. GET /api/checkins/active
         │
         ▼
4. Backend queries:
   SELECT * FROM territory_checkins
   JOIN users ON territory_checkins.user_id = users.id
   WHERE check_out_time IS NULL
         │
         ▼
5. Response: { checkIns: CheckIn[] }
         │
         ▼
6. Update state:
   - activeCheckIns = checkIns
   - myCheckIn = find my session
         │
         ▼
7. Render list:
   - My session → Active Session Card
   - Others → Team Check-Ins List
         │
         ▼
8. Auto-refresh every 30 seconds (interval)
         │
         └─→ Back to step 2
```

## Real-Time Updates

```
┌────────────────────────────────────┐
│     Duration Timer (Client)       │
│                                    │
│  useEffect(() => {                │
│    if (myCheckIn) {                │
│      updateDuration()              │
│      interval = setInterval(       │
│        updateDuration,             │
│        60000  // 1 minute          │
│      )                             │
│    }                               │
│  }, [myCheckIn])                  │
└────────────────────────────────────┘
              │
              ▼
    Updates duration display
    "2h 15m" → "2h 16m" → ...


┌────────────────────────────────────┐
│   Auto-Refresh (Client)           │
│                                    │
│  useEffect(() => {                │
│    fetchCheckIns()                 │
│    interval = setInterval(         │
│      fetchCheckIns,                │
│      30000  // 30 seconds          │
│    )                               │
│  }, [])                            │
└────────────────────────────────────┘
              │
              ▼
    Refreshes all team check-ins
    Shows new check-ins
    Removes completed check-outs
```

## Map Integration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CheckInMap Component                         │
└─────────────────────────────────────────────────────────────────┘

1. Receives props: { checkIns: CheckIn[] }
         │
         ▼
2. Filter valid check-ins (have lat/lng)
         │
         ▼
3. Calculate map bounds from all check-ins
         │
         ▼
4. Fetch hail events for area:
   - Calculate center point
   - GET /api/hail/search?lat={lat}&lng={lng}&radius=50&months=6
         │
         ▼
5. Render map:
   - OpenStreetMap tiles
   - Check-in markers (custom icons)
   - Hail event circles (color-coded)
         │
         ▼
6. User interactions:
   - Click marker → Show popup with rep details
   - Click circle → Show popup with hail event details
   - Toggle hail events visibility
   - Zoom/pan map
```

## Authentication Flow

```
┌────────────────────────────────────────────────────────────────┐
│                  Authentication Pattern                        │
└────────────────────────────────────────────────────────────────┘

Frontend:
  const currentUser = authService.getCurrentUser()

  fetch(url, {
    headers: {
      'Authorization': `Bearer ${currentUser.token}`,
      'x-user-email': currentUser.email
    }
  })
         │
         ▼
Backend:
  const userEmail = req.headers['x-user-email']
  const userId = await getUserIdFromEmail(pool, userEmail)

  if (!userId) return 404

  // Validate user owns resource
  const result = await pool.query(
    'SELECT * FROM territory_checkins WHERE id = $1 AND user_id = $2',
    [checkinId, userId]
  )
```

## Error Handling Patterns

```
┌────────────────────────────────────────────────────────────────┐
│                     Error Scenarios                            │
└────────────────────────────────────────────────────────────────┘

Location Permission Denied:
  ├── Catch GeolocationPositionError
  ├── Set error state with user-friendly message
  └── Show error banner above check-in button

Already Checked In:
  ├── Backend checks for active session
  ├── Returns 400 error
  └── Frontend shows error message

Network Failure:
  ├── Catch fetch errors
  ├── Log to console
  └── Show error with retry suggestion

Invalid Stats:
  ├── Backend validates numbers
  ├── Returns 400 with validation error
  └── Frontend shows field-specific errors

Missing Session on Checkout:
  ├── Backend checks for active session
  ├── Returns 404
  └── Frontend shows "No active session" error
```

## Performance Optimizations

```
┌────────────────────────────────────────────────────────────────┐
│                  Performance Strategies                        │
└────────────────────────────────────────────────────────────────┘

Database:
  ├── Indexes on user_id and check_out_time
  ├── Partial index for active sessions
  └── Efficient JOIN for team visibility

Frontend:
  ├── Auto-refresh interval (30s, not too frequent)
  ├── Duration updates (1 minute, not every second)
  ├── Lazy load map view (only when selected)
  ├── Hail events fetched once per map render
  └── useCallback for fetchCheckIns

API:
  ├── Single endpoint for all active check-ins
  ├── No N+1 query problems (JOINs users table)
  └── Proper response caching headers

Geolocation:
  ├── enableHighAccuracy: true (precision)
  ├── timeout: 10000ms (prevent hanging)
  └── maximumAge: 0 (fresh location)
```

## Mobile Responsive Adaptations

```
┌────────────────────────────────────────────────────────────────┐
│                Mobile-First Considerations                     │
└────────────────────────────────────────────────────────────────┘

Touch Targets:
  ├── Check-In button: 60px height
  ├── All buttons: 44px minimum
  ├── Tab buttons: 44px minimum
  └── Input fields: 44px minimum

Layout:
  ├── Cards stack vertically
  ├── Map: 600px height (scrollable)
  ├── Stats: 2-column grid
  └── Team list: Single column

Typography:
  ├── Tab text hidden on mobile
  ├── Icons always visible
  └── Responsive font sizes

Interactions:
  ├── Touch-friendly hover states
  ├── No hover-only UI
  └── Swipe-friendly scrolling
```

## Summary

The check-in system provides a complete solution for:
- Real-time field activity tracking
- Team-wide visibility and coordination
- Location-based insights with map integration
- Stats collection (doors, contacts, leads, appointments)
- Mobile-first responsive design
- Secure authentication and data access
- Performance-optimized database queries
- Comprehensive error handling

All components follow the existing codebase patterns and integrate seamlessly with the TeamPanel navigation structure.
