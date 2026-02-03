# SA21 Storm Intelligence - Feature Summary

## Overview
Complete storm/hail intelligence system with multiple data sources, damage scoring, hot zone identification, PDF reports, and SMS alerts. All dates normalized to **Eastern timezone (America/New_York)**.

---

## Features Implemented

### 1. Damage Score (0-100)
**Service:** `/server/services/damageScoreService.ts`
**Endpoint:** `POST /api/hail/damage-score`

**Algorithm (100 points total):**
| Factor | Points | Description |
|--------|--------|-------------|
| Event Count | 0-20 | More events = higher risk |
| Max Hail Size | 0-30 | 1.5"+ = significant boost |
| Recent Activity | 0-25 | Last 12 months weighted 2x |
| Cumulative Exposure | 0-15 | Sum of all hail sizes |
| Severity Distribution | 0-10 | Severe vs moderate ratio |

**Risk Levels:**
- 0-25: **Low** (Green #22c55e)
- 26-50: **Moderate** (Yellow #eab308)
- 51-75: **High** (Orange #f97316)
- 76-100: **Critical** (Red #dc2626)

**UI:** Prominent display in TerritoryHailMap right panel + PDF reports

---

### 2. Hot Zones (Canvassing Priority Areas)
**Service:** `/server/services/hotZoneService.ts`
**Endpoint:** `GET /api/hail/hot-zones`

**Algorithm:**
- Clusters events into ~5-mile grid cells
- Scores based on:
  - **Recency** (40%): Recent storms (last 90 days) score higher
  - **Severity** (35%): Max hail size in area
  - **Frequency** (25%): Event count
- Returns top 10 zones per territory

**UI:**
- Toggle button with 🔥 emoji in control bar
- Color-coded circles on map (Red/Orange/Yellow)
- "Hot Zones" sidebar tab with ranked list
- Click to zoom to zone

**Recommendations:**
- 80-100%: "🔥 HOT ZONE - High priority area"
- 60-80%: "⚡ Strong Area - Good canvassing opportunity"
- 40-60%: "✓ Moderate Activity - Worth investigating"

---

### 3. HailTrace Data Import
**Service:** `/server/services/hailtraceImportService.ts`
**Migration:** `/database/migrations/048_hailtrace_events.sql`

**Features:**
- Watches `/scripts/hailtrace-automation/hailtrace-exports/` for JSON files
- Auto-imports new exports
- Deduplicates against existing events
- Normalizes all dates to Eastern timezone

**Endpoints:**
- `POST /api/hail/import-hailtrace` - Manual file import
- `GET /api/hail/hailtrace-status` - Integration status
- `POST /api/hail/hailtrace-watch` - Start/stop file watching
- `POST /api/hail/hailtrace-scan` - Manual directory scan
- `GET /api/hail/hailtrace-events` - Query imported events
- `GET /api/hail/hailtrace-stats` - Import statistics

**Database Table:**
```sql
hailtrace_events (
  event_id, event_date, types[],
  hail_size, hail_size_algorithm, hail_size_meteo,
  wind_speed, wind_star_level,
  latitude, longitude,
  source_file, raw_data
)
```

---

### 4. SMS Storm Alerts (Twilio)
**Service:** `/server/services/twilioService.ts`
**Routes:** `/server/routes/alertRoutes.ts`
**Migration:** `/database/migrations/047_sms_alerts.sql`

**Features:**
- Rate limiting: 1 SMS per property per hour
- Auto-sends when storm impacts monitored property
- Test SMS functionality
- User preferences (phone number, enabled/disabled)

**Endpoints:**
- `POST /api/alerts/test-sms` - Send test message (admin)
- `GET /api/alerts/sms-status` - Twilio config status
- `POST /api/alerts/storm-notification` - Single alert
- `POST /api/alerts/batch-storm-notifications` - Batch alerts (admin)
- `GET /api/alerts/sms-stats` - User SMS statistics
- `GET /api/alerts/recent-notifications` - Admin view

**Message Format:**
```
🌩️ STORM ALERT - SA21
Hail detected near 123 Main St, Dallas, TX
Size: 1.5" | Date: Jan 15, 2025
View details in app
```

**Environment Variables:**
```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+15551234567
```

---

### 5. PDF Reports
**Service:** `/server/services/pdfReportService.ts`
**Feature:** Free professional reports (vs $40/report from competitors)

**Includes:**
- Company branding
- Property address & coordinates
- Damage Score with color coding
- Storm event timeline
- NOAA certification statement
- Rep contact information

---

### 6. Data Sources

| Source | Description | Status |
|--------|-------------|--------|
| **IHM API** | Interactive Hail Maps commercial data | ✅ Active |
| **NOAA Storm Events** | Certified government database (10+ years) | ✅ Active |
| **HailTrace** | Meteorologist-verified data (via import) | ✅ Active |

---

## API Endpoints Summary

### Hail Routes (`/api/hail/`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/search` | Basic hail search |
| GET | `/search-advanced` | Advanced search with filters |
| POST | `/damage-score` | Calculate 0-100 damage score |
| GET | `/hot-zones` | Get canvassing priority areas |
| POST | `/report/pdf` | Generate PDF report |
| GET | `/status` | Service status |
| POST | `/import-hailtrace` | Import HailTrace JSON |
| GET | `/hailtrace-status` | HailTrace integration status |
| POST | `/hailtrace-watch` | Start/stop file watching |
| POST | `/hailtrace-scan` | Manual directory scan |
| GET | `/hailtrace-events` | Query imported events |

### Alert Routes (`/api/alerts/`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/test-sms` | Send test SMS (admin) |
| GET | `/sms-status` | Twilio config status |
| POST | `/storm-notification` | Send storm alert |
| POST | `/batch-storm-notifications` | Batch alerts (admin) |
| GET | `/sms-stats` | User SMS statistics |
| GET | `/recent-notifications` | Recent SMS log (admin) |

---

## Files Created/Modified

### New Services (6)
- `server/services/damageScoreService.ts` - Damage scoring algorithm
- `server/services/hotZoneService.ts` - Hot zone identification
- `server/services/hailtraceImportService.ts` - HailTrace import
- `server/services/twilioService.ts` - SMS alerts
- `server/services/pdfReportService.ts` - PDF generation
- `utils/timezone.ts` - Eastern timezone utilities

### New Routes
- `server/routes/alertRoutes.ts` - SMS alert endpoints

### Modified Files
- `server/routes/hailRoutes.ts` - Added damage score, hot zones, HailTrace endpoints
- `server/index.ts` - Service initialization and route registration
- `components/TerritoryHailMap.tsx` - UI for all features
- `components/ImpactedAssetsPanel.tsx` - SMS settings UI

### Database Migrations
- `047_sms_alerts.sql` - SMS tracking tables
- `048_hailtrace_events.sql` - HailTrace import table

### Documentation
- `DAMAGE_SCORE_README.md`
- `DAMAGE_SCORE_IMPLEMENTATION.md`
- `HOT_ZONES_FEATURE.md`
- `SMS_ALERTS_README.md`
- `SMS_QUICK_START.md`
- `SMS_IMPLEMENTATION_SUMMARY.md`
- `STORM_TIMEZONE_AUDIT.md`

---

## Timezone Compliance

All storm data uses **Eastern timezone (America/New_York)**:

```typescript
// Server-side (Node.js)
const normalizeToEastern = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
};

// Frontend utilities
import { toEasternDate, formatEasternDate } from '../utils/timezone';
```

---

## Deployment Checklist

### Before Deploying
- [x] Build passes (`npm run build`)
- [x] TypeScript compiles (`npm run server:build`)
- [x] All services exported
- [x] Routes registered
- [x] Migrations created

### After Deploying
1. Run migrations:
   ```bash
   npm run db:migrate:railway  # For Railway
   npm run db:migrate          # For local
   ```

2. Configure Twilio (for SMS):
   ```bash
   railway variables set TWILIO_ACCOUNT_SID=ACxxx
   railway variables set TWILIO_AUTH_TOKEN=xxx
   railway variables set TWILIO_PHONE_NUMBER=+1xxx
   ```

3. Test endpoints:
   ```bash
   curl https://app.railway.app/api/hail/status
   curl https://app.railway.app/api/alerts/sms-status
   ```

---

## Competitive Advantage

| Feature | HailTrace/HailRecon | SA21 |
|---------|---------------------|------|
| **Cost** | $1,000-2,000/year | **FREE** |
| **Weather History Report** | $40 each | **FREE (unlimited)** |
| **Damage Score** | Yes | **YES** |
| **Hot Zones** | Yes ("Honey Hole") | **YES** |
| **SMS Alerts** | Yes | **YES** |
| **AI Assistant** | No | **Susan 21 + Agnes** |
| **Integration** | Separate app | **All-in-one** |

---

**Last Updated:** February 3, 2026
**Build Status:** ✅ Passing
**TypeScript:** ✅ No errors
**Ready for Production:** ✅ Yes
