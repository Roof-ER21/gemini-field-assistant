# Damage Score Feature - Storm Map

## Overview

The Damage Score feature provides a **0-100 risk assessment** for properties based on historical hail event data. This score helps users quickly understand the storm damage risk for any location.

## Components

### Backend

#### 1. Damage Score Service (`/server/services/damageScoreService.ts`)

**Purpose**: Calculate a comprehensive damage risk score based on historical hail events.

**Algorithm Factors**:
- **Event Count** (0-20 points): Number of hail events in the area
- **Max Hail Size** (0-30 points): Largest hail size ever recorded (>1.5" = significant boost)
- **Recent Activity** (0-25 points): Events in the last 12 months weighted 2x
- **Cumulative Exposure** (0-15 points): Sum of all hail sizes
- **Severity Distribution** (0-10 points): Count of severe vs moderate vs minor events

**Score Ranges**:
- **0-25**: Low Risk (minimal storm history)
- **26-50**: Moderate Risk (some exposure)
- **51-75**: High Risk (significant history)
- **76-100**: Critical (multiple severe events)

**Color Coding**:
- **0-25**: Green (#22c55e)
- **26-50**: Yellow (#eab308)
- **51-75**: Orange (#f97316)
- **76-100**: Red (#dc2626)

**Key Methods**:

```typescript
// Main calculation method
calculateDamageScore(input: DamageScoreInput): DamageScoreResult

// Input interface
interface DamageScoreInput {
  lat?: number;
  lng?: number;
  address?: string;
  events?: HailEvent[];        // IHM events
  noaaEvents?: NOAAEvent[];    // NOAA storm events
}

// Output interface
interface DamageScoreResult {
  score: number;                           // 0-100
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  factors: DamageScoreFactors;            // Breakdown of scoring factors
  summary: string;                         // Human-readable summary
  color: string;                          // Hex color for the risk level
}
```

#### 2. API Endpoint (`/server/routes/hailRoutes.ts`)

**Endpoint**: `POST /api/hail/damage-score`

**Request Body**:
```json
{
  "lat": 40.7128,
  "lng": -74.0060,
  "address": "123 Main St, City, State",
  "events": [...],      // IHM hail events
  "noaaEvents": [...]   // NOAA storm events
}
```

**Response**:
```json
{
  "score": 67,
  "riskLevel": "High",
  "factors": {
    "eventCount": 5,
    "maxHailSize": 1.75,
    "recentActivity": 3,
    "cumulativeExposure": 6.5,
    "severityDistribution": {
      "severe": 2,
      "moderate": 2,
      "minor": 1
    },
    "recencyScore": 18.5
  },
  "summary": "High risk area with 5 recorded hail events. Maximum hail size of 1.8\" indicates significant damage potential. 3 events occurred in the past 12 months, indicating active storm activity. 2 severe events (1.5\"+) recorded.",
  "color": "#f97316"
}
```

### Frontend

#### 1. TerritoryHailMap Component Updates (`/components/TerritoryHailMap.tsx`)

**State Addition**:
```typescript
const [damageScore, setDamageScore] = useState<{
  score: number;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  factors: any;
  summary: string;
  color: string;
} | null>(null);
```

**Score Calculation** (in `handleAdvancedSearch`):
```typescript
// Calculate damage score after search completes
const scoreRes = await fetch(`${getApiBaseUrl()}/hail/damage-score`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    lat: data.searchCriteria.latitude,
    lng: data.searchCriteria.longitude,
    address: data.searchCriteria.address || `${data.searchCriteria.city}, ${data.searchCriteria.state}`,
    events: data.events || [],
    noaaEvents: data.noaaEvents || []
  })
});
```

**Display Location**:
- **Right Panel** (Hail Event Dates): Prominently displayed at the top with gradient background
- **PDF Report**: Highlighted section in the summary statistics

**UI Features**:
- Large score number (48px font)
- Color-coded background gradient
- Risk level badge
- Human-readable summary text
- Responsive design for mobile

## Usage Examples

### Example 1: Low Risk Property
```
Score: 15
Risk Level: Low
Summary: "No significant hail history detected in this area. Low risk for storm damage."
Color: Green
```

### Example 2: Moderate Risk Property
```
Score: 42
Risk Level: Moderate
Summary: "Moderate risk area with 3 recorded hail events. Maximum hail size of 1.2\" suggests moderate damage risk."
Color: Yellow
```

### Example 3: High Risk Property
```
Score: 68
Risk Level: High
Summary: "High risk area with 6 recorded hail events. Maximum hail size of 1.8\" indicates significant damage potential. 4 events occurred in the past 12 months, indicating active storm activity. 2 severe events (1.5\"+) recorded."
Color: Orange
```

### Example 4: Critical Risk Property
```
Score: 85
Risk Level: Critical
Summary: "Critical risk area with 12 recorded hail events. Maximum hail size of 2.5\" indicates significant damage potential. 8 events occurred in the past 12 months, indicating active storm activity. 7 severe events (1.5\"+) recorded."
Color: Red
```

## Algorithm Details

### Scoring Breakdown

#### 1. Event Count (0-20 points)
```
0 events = 0 points
1-2 events = 5-10 points (linear)
3-5 events = 10-16 points (linear)
6-10 events = 16-19 points (diminishing)
11+ events = 20 points (max)
```

#### 2. Max Hail Size (0-30 points)
```
< 0.75" = 0 points
0.75-1.0" = 5 points
1.0-1.25" = 10 points
1.25-1.5" = 15 points
1.5-1.75" = 20 points
1.75-2.0" = 25 points
> 2.0" = 30 points (max)
```

#### 3. Recency Score (0-25 points)
Events are weighted by age:
- **0-6 months**: 1.5x weight (recent events)
- **6-12 months**: 1.2x weight
- **12-24 months**: 0.8x weight
- **24+ months**: 0.5x weight (older events)

Additional multiplier by hail size:
- **1.5"+ hail**: 2x multiplier
- **1.0-1.5" hail**: 1.5x multiplier
- **< 1.0" hail**: 1x multiplier

#### 4. Cumulative Exposure (0-15 points)
Sum of all hail sizes × 1.5, capped at 15 points.

Example: 5 events with sizes [1.0, 1.5, 0.75, 2.0, 1.25]
```
Sum = 6.5"
Score = 6.5 × 1.5 = 9.75 points
```

#### 5. Severity Distribution (0-10 points)
```
Severe events (1.5"+) = 3 points each
Moderate events (1.0-1.5") = 1.5 points each
Minor events (< 1.0") = 0.5 points each
Total capped at 10 points
```

## PDF Report Integration

The damage score is prominently featured in the PDF report:

**Location**: After the property address, before statistics grid

**Format**:
- Red background box (220, 38, 38)
- White text
- Score displayed as "XX / 100"
- Risk level in uppercase
- Multi-line summary text below

**Example PDF Section**:
```
┌─────────────────────────────────────┐
│   DAMAGE RISK SCORE                 │
│   68 / 100                          │
│   HIGH RISK                         │
└─────────────────────────────────────┘
High risk area with 6 recorded hail events.
Maximum hail size of 1.8" indicates significant
damage potential. 4 events occurred in the past
12 months, indicating active storm activity.
```

## Testing

Run the test script to verify the algorithm:

```bash
cd /Users/a21/gemini-field-assistant
npm run server:build
node dist-server/services/test-damage-score.js
```

Expected output:
- Test 1: Low Risk (score 0-10)
- Test 2: Moderate Risk (score 20-40)
- Test 3: High Risk (score 50-70)
- Test 4: Critical Risk (score 75-90)

## Files Modified/Created

### Created:
- `/server/services/damageScoreService.ts` - Main scoring logic
- `/server/services/test-damage-score.ts` - Test script
- `/DAMAGE_SCORE_README.md` - This documentation

### Modified:
- `/server/routes/hailRoutes.ts` - Added `/api/hail/damage-score` endpoint
- `/components/TerritoryHailMap.tsx` - Added damage score display and PDF integration

## Future Enhancements

Potential improvements:
1. **Historical Trend Analysis**: Show if risk is increasing or decreasing
2. **Comparative Analysis**: Compare property to area average
3. **Insurance Impact Prediction**: Estimate insurance premium impact
4. **Seasonal Patterns**: Identify high-risk months
5. **Neighborhood Heatmap**: Color-code entire neighborhoods by risk
6. **Alert Thresholds**: Notify when score changes significantly
7. **Machine Learning**: Predict future risk based on climate trends

## Support

For questions or issues, contact the development team.

**Last Updated**: February 2, 2025
**Version**: 1.0
**Author**: Backend Development Team
