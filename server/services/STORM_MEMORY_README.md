# Storm Memory Service

## Overview

The Storm Memory Service enables Susan AI to remember and reference verified storm lookups from IHM (Interactive Hail Maps) and NOAA data. This allows Susan to:

- Remember previously verified storm events by location
- Find similar areas that experienced storms
- Learn from claim outcomes (won/lost/pending)
- Provide historical context for new storm lookups
- Build knowledge about which types of storms lead to successful claims

## Database Schema

### `storm_lookups` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | References users table |
| `address` | TEXT | Full address string |
| `city` | VARCHAR(100) | City name |
| `state` | VARCHAR(2) | State abbreviation |
| `zip_code` | VARCHAR(10) | ZIP code |
| `latitude` | DECIMAL(10,8) | Latitude coordinate |
| `longitude` | DECIMAL(11,8) | Longitude coordinate |
| `storm_events` | JSONB | Array of storm events (see below) |
| `event_count` | INTEGER | Number of storm events |
| `data_sources` | JSONB | `{noaa: boolean, ihm: boolean}` |
| `outcome` | VARCHAR(50) | `claim_won`, `claim_lost`, `pending`, `not_pursued` |
| `outcome_notes` | TEXT | Notes about the outcome |
| `outcome_date` | DATE | Date outcome was recorded |
| `lookup_date` | TIMESTAMPTZ | When lookup was performed |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### Storm Event Structure

```typescript
{
  id: string;
  eventType: 'hail' | 'wind' | 'tornado';
  date: string; // YYYY-MM-DD
  state?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  magnitude: number | null;
  magnitudeUnit: string; // e.g., "inches" for hail
  source: string; // e.g., "NWS", "IHM"
  narrative?: string;
  dataSource: string; // e.g., "NOAA Storm Events Database"
  certified?: boolean;
}
```

## API Endpoints

### Save Storm Lookup

**POST** `/api/storm-memory/save`

Save a verified storm lookup to memory.

**Request Body:**
```json
{
  "address": "123 Main St, Richmond, VA 23220",
  "city": "Richmond",
  "state": "VA",
  "zipCode": "23220",
  "latitude": 37.5407,
  "longitude": -77.4360,
  "stormEvents": [
    {
      "id": "noaa-12345",
      "eventType": "hail",
      "date": "2024-05-15",
      "magnitude": 1.75,
      "magnitudeUnit": "inches",
      "source": "NWS",
      "dataSource": "NOAA Storm Events Database",
      "certified": true
    }
  ],
  "dataSources": {
    "noaa": true,
    "ihm": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "lookup": { /* StormLookup object */ }
}
```

---

### Find Nearby Storms

**GET** `/api/storm-memory/nearby`

Find storm lookups within a radius of given coordinates.

**Query Parameters:**
- `lat` (required): Latitude
- `lng` (required): Longitude
- `radius` (optional): Radius in miles (default: 10)
- `userOnly` (optional): Only return current user's lookups (default: false)

**Example:**
```
GET /api/storm-memory/nearby?lat=37.5407&lng=-77.4360&radius=25
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "radiusMiles": 25,
  "results": [
    {
      "lookup": { /* StormLookup object */ },
      "distanceMiles": 12.5
    }
  ]
}
```

---

### Get Storms by ZIP Code

**GET** `/api/storm-memory/by-zip/:zipCode`

Get all storm lookups for a specific ZIP code.

**Query Parameters:**
- `userOnly` (optional): Only return current user's lookups (default: false)

**Example:**
```
GET /api/storm-memory/by-zip/23220
```

**Response:**
```json
{
  "success": true,
  "zipCode": "23220",
  "count": 5,
  "lookups": [ /* Array of StormLookup objects */ ]
}
```

---

### Get Storms by City

**GET** `/api/storm-memory/by-city`

Get storm lookups by city and state.

**Query Parameters:**
- `city` (required): City name
- `state` (required): State abbreviation
- `userOnly` (optional): Only return current user's lookups (default: false)

**Example:**
```
GET /api/storm-memory/by-city?city=Richmond&state=VA
```

**Response:**
```json
{
  "success": true,
  "city": "Richmond",
  "state": "VA",
  "count": 8,
  "lookups": [ /* Array of StormLookup objects */ ]
}
```

---

### Record Outcome

**POST** `/api/storm-memory/outcome`

Record the outcome of an insurance claim related to a storm lookup.

**Request Body:**
```json
{
  "lookupId": "uuid-here",
  "outcome": "claim_won",
  "outcomeNotes": "Approved for full roof replacement, $25,000"
}
```

**Valid Outcomes:**
- `claim_won` - Insurance claim was approved
- `claim_lost` - Insurance claim was denied
- `pending` - Claim is still being processed
- `not_pursued` - Customer decided not to file a claim

**Response:**
```json
{
  "success": true,
  "lookup": { /* Updated StormLookup object */ }
}
```

---

### Get Statistics

**GET** `/api/storm-memory/stats`

Get aggregate statistics about storm lookups.

**Query Parameters:**
- `userOnly` (optional): Only count current user's lookups (default: true)

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalLookups": 42,
    "totalEvents": 156,
    "byOutcome": {
      "claim_won": 18,
      "claim_lost": 8,
      "pending": 12,
      "not_pursued": 4
    },
    "byDataSource": {
      "noaa": 35,
      "ihm": 28
    }
  }
}
```

---

### Search Storm Events

**GET** `/api/storm-memory/search`

Search storm events by various criteria.

**Query Parameters:**
- `eventType` (optional): 'hail', 'wind', or 'tornado'
- `minMagnitude` (optional): Minimum magnitude (e.g., 1.5 for hail)
- `dateFrom` (optional): Start date (YYYY-MM-DD)
- `dateTo` (optional): End date (YYYY-MM-DD)
- `userOnly` (optional): Only return current user's lookups (default: true)

**Example:**
```
GET /api/storm-memory/search?eventType=hail&minMagnitude=1.5&dateFrom=2024-01-01
```

**Response:**
```json
{
  "success": true,
  "count": 15,
  "lookups": [ /* Array of StormLookup objects */ ]
}
```

---

### Get Lookup by ID

**GET** `/api/storm-memory/:lookupId`

Get a specific storm lookup by ID.

**Response:**
```json
{
  "success": true,
  "lookup": { /* StormLookup object */ }
}
```

---

### Delete Lookup

**DELETE** `/api/storm-memory/:lookupId`

Delete a storm lookup. Users can only delete their own lookups.

**Response:**
```json
{
  "success": true,
  "message": "Storm lookup deleted"
}
```

---

### Get All User Lookups

**GET** `/api/storm-memory`

Get all storm lookups for the current user.

**Query Parameters:**
- `limit` (optional): Maximum number of results (default: 100)

**Response:**
```json
{
  "success": true,
  "count": 42,
  "lookups": [ /* Array of StormLookup objects */ ]
}
```

---

### Get Lookup by Address

**GET** `/api/storm-memory/by-address`

Find a storm lookup by address string (fuzzy match).

**Query Parameters:**
- `address` (required): Address to search for

**Example:**
```
GET /api/storm-memory/by-address?address=123%20Main%20St
```

**Response:**
```json
{
  "success": true,
  "lookup": { /* StormLookup object or null */ }
}
```

---

### Get Recent Lookups

**GET** `/api/storm-memory/recent`

Get recent storm lookups for the user.

**Query Parameters:**
- `limit` (optional): Maximum results (default: 10)
- `daysBack` (optional): Days to look back (default: 30)

**Example:**
```
GET /api/storm-memory/recent?limit=5&daysBack=7
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "lookups": [ /* Array of StormLookup objects */ ]
}
```

---

### Update Outcome (Alternative Endpoint)

**PUT** `/api/storm-memory/:lookupId/outcome`

Alternative endpoint to update outcome using PUT method.

**Request Body:**
```json
{
  "outcome": "claim_won",
  "outcomeNotes": "Approved for full roof replacement"
}
```

**Response:**
```json
{
  "success": true,
  "lookup": { /* Updated StormLookup object */ }
}
```

## Service Methods

### `saveStormLookup(params)`

Save a storm lookup to the database.

### `findNearbyStorms(lat, lng, radiusMiles, userId?)`

Find storms within a radius using the Haversine distance formula.

### `getStormsByZipCode(zipCode, userId?)`

Get all storms in a specific ZIP code.

### `getStormsByCity(city, state, userId?)`

Get all storms in a specific city/state.

### `recordOutcome(lookupId, outcome, outcomeNotes?)`

Record the insurance claim outcome for a lookup.

### `getLookupById(lookupId)`

Get a single lookup by ID.

### `getLookupsByUser(userId, limit?)`

Get all lookups for a user.

### `getStormStats(userId?)`

Get aggregate statistics.

### `searchStormEvents(params)`

Search storms by event type, magnitude, date range.

### `deleteLookup(lookupId, userId)`

Delete a lookup (with ownership verification).

## Database Functions

### `calculate_distance_miles(lat1, lon1, lat2, lon2)`

PostgreSQL function that calculates distance between two coordinates using the Haversine formula.

Returns distance in miles.

## Integration with Susan AI

### When to Save Lookups

Susan should automatically save storm lookups when:
1. User requests storm verification for an address
2. IHM or NOAA data is successfully retrieved
3. The lookup contains verified storm events

### When to Reference Past Lookups

Susan should check storm memory when:
1. User asks about an area where storms were previously verified
2. User asks "Have you checked this area before?"
3. Providing context about nearby verified storms
4. Learning from successful/unsuccessful claim outcomes

### Example Integration

```typescript
// When Susan performs a storm lookup
const stormEvents = await noaaStormService.getStormEvents(lat, lng, 10, 2);

if (stormEvents.length > 0) {
  // Save to memory
  await fetch('/api/storm-memory/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail
    },
    body: JSON.stringify({
      address: fullAddress,
      city, state, zipCode,
      latitude: lat,
      longitude: lng,
      stormEvents,
      dataSources: { noaa: true, ihm: false }
    })
  });
}

// When checking if area was previously verified
const nearby = await fetch(
  `/api/storm-memory/nearby?lat=${lat}&lng=${lng}&radius=5`
).then(r => r.json());

if (nearby.count > 0) {
  console.log(`Found ${nearby.count} previous verifications within 5 miles`);
}
```

## Migration

To apply the database migration:

```bash
psql $DATABASE_URL -f database/migrations/018_storm_memory.sql
```

Or use the app's migration system if available.

## Security Notes

- All endpoints require authentication via `x-user-email` header
- Users can only delete their own lookups
- Users can only update outcomes for their own lookups
- Lookups can be shared (userOnly=false) or private (userOnly=true)
- SQL injection protection via parameterized queries
- Input validation on all endpoints

## Performance Considerations

- Spatial queries use the Haversine function (indexed on lat/lng)
- JSONB indexes enable fast storm event searches
- Default pagination limits prevent excessive data transfer
- 24-hour cache on NOAA data (in noaaStormService)

## Future Enhancements

- Machine learning on successful claim patterns
- Automatic outcome tracking from job status changes
- Storm severity scoring based on magnitude + frequency
- Team-wide knowledge sharing (cross-user lookups)
- Integration with external claim success databases
