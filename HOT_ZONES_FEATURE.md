# Hot Zones Feature - Implementation Summary

## Overview
Added a "Hot Zones" feature to the Storm Map that identifies the best areas to canvass based on storm activity, severity, and recency.

## Backend Implementation

### 1. Hot Zone Service (`/server/services/hotZoneService.ts`)
**Algorithm:**
- Analyzes last 2 years of storm data from IHM and NOAA
- Groups events into geographic grid cells (~5 miles)
- Calculates intensity score (0-100) based on:
  - **Recency** (40% weight): Recent events (last 90 days) score higher
  - **Severity** (35% weight): Based on maximum hail size
  - **Frequency** (25% weight): Number of events in the area

**Output:**
- Top 10 hot zones per territory
- Each zone includes:
  - Center coordinates (lat/lng)
  - Intensity score (0-100)
  - Event count
  - Average and maximum hail size
  - Last event date
  - Canvassing recommendation text

### 2. API Endpoint (`/server/routes/hailRoutes.ts`)
**Endpoint:** `GET /api/hail/hot-zones`

**Parameters:**
- `territoryId` - Get hot zones for a specific territory
- `north`, `south`, `east`, `west` - Custom bounding box
- `lat`, `lng`, `radius` - Center point with radius

**Response:**
```json
{
  "success": true,
  "hotZones": [
    {
      "id": "hotzone-39.500-77.500",
      "centerLat": 39.5,
      "centerLng": -77.5,
      "intensity": 85,
      "eventCount": 12,
      "avgHailSize": 1.5,
      "maxHailSize": 2.25,
      "lastEventDate": "2025-01-15",
      "recommendation": "🔥 HOT ZONE - High priority area with 12 events. Recent severe damage likely.",
      "radius": 5.175
    }
  ],
  "count": 10,
  "message": "Found 10 hot zones for canvassing"
}
```

## Frontend Implementation

### 1. UI Components (`/components/TerritoryHailMap.tsx`)

#### Hot Zones Toggle Button
- Located in the control bar next to the month filter
- Only enabled when a territory is selected
- Shows count badge when hot zones are active
- 🔥 emoji indicator

#### Map Visualization
Hot zones rendered as colored circles on the map:
- **High Intensity (80-100%)**: Red (`rgba(244, 67, 54, 0.7)`)
- **Medium Intensity (60-80%)**: Orange (`rgba(255, 152, 0, 0.5)`)
- **Low Intensity (40-60%)**: Yellow (`rgba(255, 193, 7, 0.3)`)

Each zone displays a popup with:
- Intensity percentage badge
- Event count and max hail size
- Average hail size
- Last event date
- Canvassing recommendation

#### Hot Zones Tab
New sidebar tab showing ranked list of hot zones:
- **Rank badge** (#1, #2, etc.)
- **Intensity score** with color-coded badge
- **Stats grid**: Event count, Max hail size
- **Last event date**
- **Recommendation** with color-coded background
- Click to zoom to zone on map

### 2. Color Scheme

**Intensity Colors:**
```typescript
High (80-100%):  #ef4444 (red)       - "High Priority"
Medium (60-80%): #f97316 (orange)    - "Strong"
Low (40-60%):    #eab308 (yellow)    - "Moderate"
```

**Recommendation Backgrounds:**
```typescript
High:   #fee2e2 (light red)
Medium: #fed7aa (light orange)
Low:    #fef3c7 (light yellow)
```

## Usage Flow

1. **Select Territory** - Choose a territory from the dropdown
2. **Enable Hot Zones** - Click the "🔥 Hot Zones" button
3. **View on Map** - Hot zones appear as colored circles
4. **Explore Rankings** - Switch to "Hot Zones" tab to see ranked list
5. **Navigate** - Click a zone card to zoom to that area
6. **Details** - Click map circles for detailed popup information

## Recommendation Logic

```typescript
Intensity >= 80: "🔥 HOT ZONE - High priority area with X events. Recent severe damage likely."
Intensity >= 60: "⚡ Strong Area - X events with significant hail activity. Good canvassing opportunity."
Intensity >= 40: "✓ Moderate Activity - X events. Worth investigating for potential leads."
Intensity < 40:  "Low Activity - X events. Lower priority for canvassing."
```

## Technical Details

### Grid Clustering
- Grid size: 0.075 degrees (~5 miles at mid-latitudes)
- Events clustered by rounding coordinates to grid cells
- Each cell represents a potential hot zone

### Data Sources
- **IHM (Interactive Hail Maps)**: Historical hail events (if configured)
- **NOAA Storm Events Database**: Certified government storm data
- Combined and deduplicated for comprehensive coverage

### Performance
- Hot zones calculated server-side
- Cached results per territory
- Only top 10 zones returned to minimize data transfer
- Lazy loading - only fetched when feature is enabled

## Files Modified

1. `/server/services/hotZoneService.ts` - **NEW**
2. `/server/routes/hailRoutes.ts` - Added hot zones endpoint
3. `/components/TerritoryHailMap.tsx` - Added UI components and map rendering

## Future Enhancements

Potential improvements:
- [ ] Cache hot zones in database for faster retrieval
- [ ] Add filtering by minimum intensity threshold
- [ ] Export hot zones to CSV/PDF for field teams
- [ ] Historical trending (zones getting hotter/cooler)
- [ ] Integration with canvassing routes
- [ ] Push notifications when new hot zones appear
- [ ] Predictive modeling based on weather patterns

## Testing

To test the feature:
```bash
# Start development server
cd /Users/a21/gemini-field-assistant
npm run dev

# In another terminal, start the backend
npm run server:dev

# Navigate to Storm Map
# 1. Select a territory (e.g., "North Virginia")
# 2. Click "🔥 Hot Zones" button
# 3. View zones on map
# 4. Switch to "Hot Zones" tab to see rankings
```

## API Testing

```bash
# Test hot zones endpoint
curl "http://localhost:3001/api/hail/hot-zones?territoryId=TERRITORY_ID"

# Or with bounding box
curl "http://localhost:3001/api/hail/hot-zones?north=40&south=39&east=-76&west=-78"

# Or with center point
curl "http://localhost:3001/api/hail/hot-zones?lat=39.5&lng=-77.5&radius=50"
```

---

**Status:** ✅ Complete and tested
**Build:** ✅ Passes TypeScript compilation
**Integration:** ✅ Fully integrated with existing Storm Map
