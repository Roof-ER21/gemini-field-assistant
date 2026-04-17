# Storm Maps — Update Breakdown (April 1-2, 2026)

## Summary

Major storm maps overhaul: added real-time hail detection via SPC + NWS, interactive swath tooltips, wider/more visible MRMS rendering, territory-wide push alerts to all reps, and Susan AI now auto-knows about recent storms.

---

## 1. NEW DATA SOURCE: SPC Same-Day Storm Reports

**What changed:** Added NOAA's Storm Prediction Center (SPC) as a real-time data source alongside the existing NOAA Storm Events Database.

**Why:** NOAA Storm Events has a days-to-weeks reporting delay. SPC publishes verified hail/wind reports the same day — within hours of the event. This means reps can see today's hail on the map immediately instead of waiting weeks.

**How it works:**
- Fetches `today_hail.csv`, `yesterday_hail.csv`, plus the last 7 days of dated archives (`YYMMDD_rpts_filtered_hail.csv`)
- Same for wind reports
- Events are merged with NOAA historical data, sorted by date, deduped by location
- 10-minute cache to avoid rate-limiting SPC servers

**Data flow:**
```
SPC (minutes) → shows on map + Susan knows
     ↓ (days/weeks later)
NOAA Storm Events DB → replaces SPC with verified record
```

**Files:** `server/services/noaaStormService.ts`

---

## 2. NWS REAL-TIME ALERT DETECTION (5-minute scan)

**What changed:** Added NWS active severe weather warning monitoring for VA/MD/PA. Scans every 5 minutes via the free `api.weather.gov/alerts/active` endpoint.

**Why:** NWS issues severe thunderstorm warnings within MINUTES of radar detecting hail. This is faster than SPC ground reports (hours). When a warning mentions hail ≥0.25", all reps get pushed immediately.

**How it works:**
- Checks `api.weather.gov/alerts/active?area=VA`, `MD`, `PA` for Severe Thunderstorm Warnings
- Parses warning text for hail size mentions (regex extraction)
- Any hail ≥0.25" triggers an alert
- Deduped by NWS alert ID — same warning never triggers twice
- Runs on its own 5-minute cron (separate from the 15-minute push scan)

**Alert speed hierarchy:**
| Source | Speed | What it detects |
|--------|-------|----------------|
| NWS Warnings | 2-5 minutes | Radar-detected hail (before it hits ground) |
| SPC Reports | 1-6 hours | Ground-verified hail (spotter confirmed) |
| NOAA Storm Events | Days-weeks | Official federal record (meteorologist reviewed) |

**Files:** `server/services/stormAlertService.ts`, `server/services/cronService.ts`

---

## 3. TERRITORY-WIDE PUSH ALERTS TO ALL REPS

**What changed:** Built a 3-phase alert system that pushes storm notifications to ALL 84 reps (not just tracked-property owners).

**Phase 1 — IMMEDIATE (within 5-15 min of detection):**
- Push notification to all reps: hail size, location, county, state, time
- In-app notification with lat/lng
- Uses existing `pushNotificationService.sendStormAlert()`

**Phase 2 — NEXT DAY FOLLOW-UP (automatic):**
- Consolidated summary: "Storm Follow-Up — VA Apr 1: 3 hail reports, up to 1.00" — Manassas Park, Clifton, Bedford"
- "Time to knock doors and schedule inspections!"

**Phase 3 — NOAA UPDATE (schema ready):**
- When NOAA ingests the full historical data, send final comprehensive update
- `noaa_reconciled` column tracks this — not yet wired, schema in place

**Database:** New `storm_alerts` table tracks every detected event, alert phase, notification status.

**Files:** `server/services/stormAlertService.ts`, `server/services/cronService.ts`, `server/index.ts` (migration)

---

## 4. MRMS SWATH IMPROVEMENTS

### 4a. Wider Bounding Box (1° minimum)

**What changed:** MRMS historical overlay bounds increased from 0.04° (~3mi) minimum to 1.0° (~69mi) minimum.

**Why:** The bounding box was calculated from SPC event point locations. If two reports were close together (e.g., Manassas Park + Clifton = 5mi apart), the MRMS fetch area was tiny — cropping the storm's full path. Testing showed 92 hail pixels at tight bounds vs 484 at 1° bounds. Most of the storm was being hidden.

**Files:** `components/TerritoryHailMap.tsx` (`padBounds` function)

### 4b. Higher Opacity

**What changed:** MRMS hail color alpha values boosted across all tiers:
- Green (pea-penny): 170 → 210 (67% → 82%)
- Yellow (penny-quarter): 182 → 220
- Orange (quarter-ping pong): 194 → 230
- All higher tiers similarly boosted

**Why:** Swath was nearly invisible on the map — the faint green was hard to see against the map tiles.

**Files:** `server/services/historicalMrmsService.ts`

### 4c. Trace-Level Rendering (0.05" threshold)

**What changed:** Added new "Trace to Pea" tier (0.05" - 0.25") rendered in light green. Previous minimum was 0.25" (pea-size).

**Why:** IHM/HailTrace show much larger swaths because they render down to near-zero MESH values. We were cutting off at 0.25", hiding the storm cell edges. The core hail is small (0.70" max) but the surrounding storm cell that produced it covers a much wider area. Adding the trace tier shows the full storm footprint.

**Legend updated:** New "Trace to Pea" entry with light green color.

**Files:** `server/services/historicalMrmsService.ts`, `components/MRMSHailOverlay.tsx`

### 4d. Hover Tooltip on Swath

**What changed:** When a rep moves their cursor over the MRMS hail swath, a tooltip follows showing:
- Hail size range (e.g., "0.25" - 0.75"")
- Size description (e.g., "Pea to Penny")
- Color-coded border matching the swath color at that point

**How it works:** Loads the MRMS overlay image into an offscreen canvas, reads pixel color on mousemove, maps RGB to closest hail size range. Tooltip has `pointerEvents: none` so it doesn't interfere with map interaction.

**Files:** `components/MRMSHailOverlay.tsx`

---

## 5. SUSAN AI — STORM AWARENESS

**What changed:** Susan's system prompt now auto-includes the last 3 days of storm alerts from the `storm_alerts` table on every chat.

**Why:** When a rep asks "any hail near me?" or "what happened yesterday?", Susan should already know about the alerts the system pushed — not make the rep wait for a tool call search.

**How it works:**
- On every chat request, queries `storm_alerts WHERE event_date >= CURRENT_DATE - 3`
- Formats as: `[RECENT STORM ALERTS — LAST 3 DAYS]` block appended to system prompt
- Susan can reference exact size, location, county, time for any alerted storm
- No tool call needed — data is pre-loaded

**Files:** `server/routes/susanAgentRoutes.ts`

---

## 6. GEOCODER FALLBACK

**What changed:** When a street address can't be found by Census Bureau or Nominatim (e.g., new developments), the geocoder now drops the street and retries with just city/state/zip.

**Why:** "9431 Jackson Loop, Manassas, VA 20110" returned null coordinates because neither geocoder recognized the street. City-level geocoding to "Manassas, VA 20110" succeeds and gives a city-center coordinate — good enough for a 15-mile storm radius search.

**Files:** `server/routes/hailRoutes.ts`

---

## 7. BUG FIXES

### 7a. SPC Data Retention
**Bug:** SPC moves reports: today → yesterday → dated archive. We only fetched today + yesterday, so storms disappeared 2 days after the event.
**Fix:** Now fetches last 7 days of dated SPC archives (`YYMMDD_rpts_filtered_hail.csv`).

### 7b. NWSWatcher toFixed Crash
**Bug:** `lat.toFixed is not a function` — PostgreSQL NUMERIC columns return as strings.
**Fix:** Cast to `Number()` before use.

### 7c. NotificationScheduler Column Name
**Bug:** `column cp.owner_name does not exist` — column is `customer_name`.
**Fix:** Updated query to use correct column name.

### 7d. Storm-Memory Route Ordering
**Bug:** `/api/storm-memory/by-address` and `/knowledge/context` were caught by `/:lookupId` catch-all route (defined earlier in Express).
**Fix:** Moved named routes before parameterized routes.

### 7e. Config Log Spam
**Bug:** `[Config] Production web detected` logged on EVERY API call (dozens per page load).
**Fix:** Cache the API URL, log once.

### 7f. toFixed Crash on Null Coordinates
**Bug:** `territoryContextService` and `checkinContextService` called `.toFixed()` on undefined lat/lng values.
**Fix:** Null guards before `.toFixed()`.

---

## 8. ALERT THRESHOLD

**What changed:** NWS alert hail threshold lowered from 0.75" to 0.25".

**Why:** Any documented hail is relevant for insurance claims. Even pea-size hail establishes storm activity. The 0.75" threshold was missing smaller events that could still support a claim.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│                  DATA SOURCES                    │
├──────────┬──────────────┬────────────────────────┤
│ NWS API  │ SPC Reports  │ NOAA Storm Events DB   │
│ (5 min)  │ (5 min)      │ (24hr cache)           │
│ Minutes  │ Hours        │ Days-Weeks             │
└────┬─────┴──────┬───────┴──────────┬─────────────┘
     │            │                  │
     ▼            ▼                  ▼
┌─────────────────────────────────────────────────┐
│              storm_alerts TABLE                  │
│  (deduped, phased: initial → followup → noaa)   │
└────────────────────┬────────────────────────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
    ┌──────────┐ ┌────────┐ ┌────────────┐
    │ Push     │ │ In-App │ │ Susan AI   │
    │ Notify   │ │ Alert  │ │ Context    │
    │ All Reps │ │ Banner │ │ (3-day)    │
    └──────────┘ └────────┘ └────────────┘

┌─────────────────────────────────────────────────┐
│              STORM MAPS UI                       │
├─────────────────────────────────────────────────┤
│ MRMS Swath Overlay (trace → softball+ scale)    │
│ + Hover tooltip (pixel → hail size)             │
│ + SPC event dots (ground-verified)              │
│ + NOAA historical events                        │
│ + Wider bounds (1° min = ~69mi coverage)        │
└─────────────────────────────────────────────────┘
```

---

## Competitive Position vs IHM/HailTrace

| Feature | Before | After | IHM/HailTrace |
|---------|--------|-------|---------------|
| Alert speed | Days-weeks | 5 minutes | 2-5 minutes |
| Swath visibility | Faint, cropped | Full path, opaque | Full path |
| Swath threshold | 0.25" min | 0.05" min | ~0.05" |
| Same-day hail | No | Yes (SPC) | Yes (MRMS) |
| Push alerts | Tracked properties only | ALL reps, territory-wide | Premium feature |
| AI awareness | None | 3-day auto-context | N/A |
| Hover tooltip | No | Yes (hail size at cursor) | No |
| Data cost | $0 | $0 | $500+/mo |
