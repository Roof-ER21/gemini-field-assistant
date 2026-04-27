# sa21 Storm Maps — Architecture Reference

**Purpose:** end-to-end reference for any future CC working on the Storm Maps feature.
Covers the 4 user-facing layers, the data they read from, the classification logic
that powers DIRECT HIT / AT LOCATION / AREA IMPACT, and the wiring between them.

---

## 1. The 4 user-facing layers

Storm Maps presents 4 distinct surfaces. Each is backed by different data:

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: Date list  (left panel, top — territory-wide)         │
│    Source endpoint:  GET /api/hail/storm-days                   │
│    Backing data:     storm_days_public  (materialized view)     │
│    Renders:          one row per (state, lat_bucket, lng_bucket)│
│                      collapsed to dates with: max hail, # reps, │
│                      states affected, source badges             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: Property history panel  (left, after address search)  │
│    Source endpoint:  GET /api/hail/address-impact               │
│    Backing service:  addressImpactService.ts                    │
│    Sub-sections:     DIRECT HITS / AT LOCATION / AREA IMPACT    │
│                      "Property History" header with date range  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: Map  (right panel)                                    │
│    Layers (z-order top→bottom):                                 │
│      • NWS warning polygons (live)                              │
│      • MRMS swath polygons  (selected date)                     │
│      • NEXRAD raster        (selected date)                     │
│      • Hail-event circle markers (storm dots)                   │
│      • Basemap (Mapbox satellite-streets)                       │
│    Components: TerritoryHailMap.tsx + MRMSSwathPolygonLayer.tsx │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: PDF "Storm Impact Analysis" report                    │
│    Source endpoint:  POST /api/hail/generate-report             │
│    Backing service:  pdfReportServiceV2.ts                      │
│    Sections:                                                    │
│      • Property Information                                     │
│      • Documented Hail Events (per-date table)                  │
│      • Independent Multi-Source Corroboration  ← consilience    │
│      • Documented Wind Events                                   │
│      • Storm Radar Evidence                                     │
│      • Active NWS Warnings                                      │
│      • Historical Storm Activity (distance bands)               │
│      • Disclaimer & sources                                     │
└─────────────────────────────────────────────────────────────────┘
```

**Critical:** Layer 2 and Layer 4 both call `addressImpactService.getAddressHailImpact()`,
but render different fields. A field added to the service is consumed by Layer 4 only
when explicitly wired into `pdfReportServiceV2`'s `ReportInput` and `drawConsilienceSection`.

---

## 2. Database tables and views

### `verified_hail_events` (base table — write-side)
Every hail/wind/tornado observation Roof-ER pulls from any source.

Key columns:
- `event_date` (date) — the ET calendar day of the storm
- `latitude, longitude` (numeric) — point location
- `lat_bucket, lng_bucket` (numeric, generated) — `ROUND(lat, 3)` and `ROUND(lng, 3)`
  → the dedup grain (~110m × 77m at this latitude)
- `hail_size_inches, wind_mph, tornado_ef_rank` — measurements
- `source_*` (16 boolean columns) — which ingest sources confirmed this row
- `verification_count, confidence_tier` (generated) — sum of source flags + tier label
- `source_details` (jsonb) — per-source audit payload

Unique index: `(event_date, lat_bucket, lng_bucket)` — same bucket merges via
`ON CONFLICT DO UPDATE` in `verifiedEventsService.upsertBatch`.

CHECK constraint: `at_least_one_source` requires at least one `source_*` flag TRUE.

### `verified_hail_events_public` and `_public_sane` (views — read-side)
What user-facing queries should hit. Two safety filters layered on top of the base
table:

1. `_public` filters out unverified rep/customer reports AND single-source NEXRAD L2
   noise (post-migration 081 — see §6).
2. `_public_sane` adds: `hail_size_inches IS NULL OR hail_size_inches <= 8.0`
   (defense against bogus unit-converted ingests).

### `mrms_swath_cache` (table — derived)
Cached MRMS hail-swath polygons for a (date, query-bbox). Each row contains:
- `storm_date, north, south, east, west, anchor_timestamp` (composite key)
- `geojson` (jsonb) — `SwathPolygonCollection`
- `max_mesh_inches, hail_cells, feature_count` — summary stats
- `expires_at` — TTL

Built on demand by `historicalMrmsService.getHistoricalMrmsSwathPolygons()` when
the polygon for an exact bbox isn't cached. Computation pulls the MRMS GRIB file
from NCEP and runs vector contouring.

### `storm_days_public` (materialized view — aggregate)
One row per `(event_date, state, lat_bucket, lng_bucket)` with rolled-up
`max_hail`, `max_wind`, `report_count`, plus `BOOL_OR(source_*)` indicators.
Refreshed concurrently every hour by `stormDaysService`.

This is what `/api/hail/storm-days` reads. Keeps the wire payload small for
deep-history queries (5–10 years).

---

## 3. The classifier — DIRECT HIT / AT LOCATION / AREA IMPACT

Lives in `server/services/addressImpactService.ts`. For a given lat/lng/months,
returns three buckets sorted by date DESC.

### Phase A — pull candidate dates
```
getCandidateDates(pool, lat, lng, monthsBack)
  → UNION of:
      • dates with point reports ≤15mi in verified_hail_events_public_sane
      • dates with cached MRMS swaths whose bbox contains the point
```
Each candidate carries: `nearest_miles`, `max_hail_inches`, `point_reports_within_15mi`,
`noaa_confirmed`, `sources[]`, `state`.

### Phase B — order candidates for the time-budget loop
```
cachedBySize  ← cached dates, sorted by (max_hail DESC, date DESC)
uncachedSorted ← uncached, sorted same way
walked = [cachedBySize, ...uncachedSorted].slice(0, MAX_CANDIDATES_PER_REQUEST)
```
Cap at 150 candidates per request. Time-budget cap of 45s for cold GRIB fetches.

### Phase C — for each candidate, classify
```
1. Try MRMS swath check
     computeStormImpact({ date, points: [{ lat, lng }] }) → r
     if r.directHit && r.maxHailInches !== null:
         → DIRECT HIT (Path A — polygon containment)
         tier carries sizeLabel + severity from r.label/r.severity

2. If not direct-hit-by-polygon, try ground-truth upgrade
     if ANY federal ground source (NCEI SWDI, IEM LSR, NOAA NCEI, SPC WCM, CoCoRaHS)
        AND nearest report distance + hail size meets threshold
     → DIRECT HIT (Path B — ground-report upgrade)

3. Otherwise fall back by distance
     if nearest_miles ≤ 3mi  → AT LOCATION (rendered as "AT LOCATION")
     if nearest_miles ≤ 15mi → AREA IMPACT
     else                    → dropped
```

### Why two paths to DIRECT HIT?
- Path A (polygon): radar-derived, multi-radar QC'd, point-in-polygon test against
  the property's exact lat/lng. Strongest evidence type. Catches "the swath is
  literally over your house."
- Path B (ground-report upgrade): catches the case where the polygon edge missed
  the property by a few hundred feet but multiple federal ground reports show
  hail at the property's neighbor. Real example: 8482 Stonewall Rd, 4/1/2026 had
  three NCEI SWDI reports of 1.0–1.25" hail within 0.7mi; MRMS polygon's vertices
  didn't quite enclose the lat/lng. Path A returns false; Path B catches it.

### `nearestMiles` calculation
Standard great-circle (Haversine) distance from the property lat/lng to the
nearest hail-or-wind row in `verified_hail_events_public_sane` for that date.

```sql
3959 * acos(
  cos(radians($1)) * cos(radians(latitude)) *
  cos(radians(longitude) - radians($2)) +
  sin(radians($1)) * sin(radians(latitude))
)
```

### `confirmingReportCount`
Count of point reports within 2mi of the property on that date — used as the
"confirming reports" badge in the UI.

---

## 4. The map (Layer 3) state machine

### State transitions
```
1. Rep clicks a row in the date list
       ↓
2. setSelectedDate(stormDate) — stormDate object includes .stormBbox
       ↓
3. selectedStormEvents = events.filter(e => e.date === selectedDate.date)
       ↓
4. selectedStormBounds = (priority order):
     A. extendBounds() over selectedStormEvents lat/lngs (if events exist near user)
     B. selectedDate.stormBbox  ← actual MRMS swath extent for this date
     C. ~28mi box around searchLat/searchLng (last-resort fallback)
       ↓
5. <MRMSSwathPolygonLayer> fetches /api/hail/mrms-swath-polygons with bounds
       ↓
6. useEffect auto-pans map: if storm_center > 50mi from search anchor, fitBounds()
       ↓
7. Polygon endpoint returns SwathPolygonCollection (GeoJSON FeatureCollection)
       ↓
8. SVG polygons rendered via react-leaflet
```

### Why the priority order matters
- Path A is the fast path when the user's address is in/near the storm.
- Path B catches the case where storm hit far away (WV/PA) but the date is in
  the user's filtered list. Without it, polygon-fetch bbox is the user's address
  → polygon endpoint returns empty → no swath visible.
- Path C exists for legacy dates older than `mrms_swath_cache` data.

### Polygon endpoint cache logic
```
GET /api/hail/mrms-swath-polygons?date&north&south&east&west
  ↓
loadSwathFromDb(pool, date, roundedBounds)
  • Looks up mrms_swath_cache by EXACT bbox match (not intersection)
  • If found AND not expired → return cached geojson
  ↓
Otherwise: pull MRMS GRIB from NCEP, decode, contour to polygons
  • saveSwathToDb to cache for next time (6h TTL)
  • Returns SwathPolygonCollection with hail-band features
```

Each feature has `properties: { sizeInches, level, color, label, severity }`.

---

## 5. The PDF (Layer 4) — what each section reads

```
generateReport(input: ReportInput)
  ↓
Property Information         ← input.address, lat, lng, mapImage
  ↓
Storm Impact Summary         ← input.events (from VerifiedEventsPdfAdapter)
  ↓
Storm Impact Narrative       ← narrativeService.generateHailNarrative(input.events)
  ↓
Documented Hail Events       ← input.events (one row per date, max hail, sources)
  ↓
Independent Multi-Source Corroboration  ← input.consilienceReports[]
                                            ← consilienceService.buildConsilience()
                                            ← per-date 6-source aggregator
  ↓
Documented Wind Events       ← input.noaaEvents (filtered to wind/tornado)
  ↓
Storm Radar Evidence         ← input.nexradImage (per-warning composites)
  ↓
Active NWS Warnings          ← input.nwsAlerts
  ↓
Historical Storm Activity    ← input.historyEvents (per-distance-band table)
  ↓
Disclaimer & Sources         ← static template
```

### `consilienceService` 6-source aggregator
For each `(lat, lng, dateIso)` produces a `ConsilienceReport`:

| # | Modality | Source | Fed by |
|---|---|---|---|
| 1 | MRMS Radar | mrms_swath_cache + verified_hail_events.source_mrms | Migration 075 schema + GRIB |
| 2 | NEXRAD L2 | source_nexrad_l2 | Python worker repo |
| 3 | NWS Warning | source_nws_alert OR source_iem_vtec | nwsAlertService ingest |
| 4 | Federal Ground | source_noaa_ncei OR ncei_swdi OR iem_lsr OR spc_wcm OR cocorahs | Multiple backfill services |
| 5 | mPING Citizen | source_mping | mPING REST API ingest |
| 6 | Surface Stations | live Synoptic API call | synopticObservationsService.ts |

Auto-curate rule: only sources with `present === true` render in the PDF.
Silent absence is omission, not "no data" placeholder. The full audit trail
is preserved in `auditTrail` regardless of what's printed.

### Per-date selection (which dates appear in the consilience block)
Picked in `/api/hail/generate-report`:
```typescript
1. directHitsSorted = swathDirectHits sorted by date ASC
2. take up to 6 distinct dates
3. fall back to events filtered (hail >= 0.5") sorted ASC if no direct hits
```
Earliest-first establishes longest claim timeline ("hail history since [date]").

---

## 6. Migration 081 — why single-source NEXRAD L2 hides

NEXRAD L2 is raw radar volume scan output. The Python worker (`gemini-nexrad-l2-worker`)
applies the Witt 1998 SHI/MESH algorithm per polar column, interpolates to a 0.01° grid,
and POSTs cells ≥ MESH_PUBLISH_FLOOR_INCHES to `/api/hail/admin/nexrad-l2-ingest`.

L2 has no multi-radar QC, no event clustering, and no per-bucket dedup at the
algorithm level (we added per-bucket dedup at the worker's ledger layer 2026-04-27).
Across 24h of polling over 6 radar sites, a single quiet day can produce 2,000+
distinct cells across the entire Mid-Atlantic — not because there's a storm, but
because every pixel where the algorithm fires above floor becomes a row.

Migration 081 fix: drop `source_nexrad_l2` from the WHERE filter on
`verified_hail_events_public` and `_public_sane`. L2 surfaces only as a
*corroborating* source on rows that already qualify via another flag. The L2-only
rows still exist in the base table; they're just invisible to user-facing queries.

The base table → views → MV chain:
```
verified_hail_events  (16 source flags)
   │
   ├── verified_hail_events_public         (filtered: drops L2-only)
   │     │
   │     └── verified_hail_events_public_sane  (+ hail_size <= 8" sanity)
   │           │
   │           └── storm_days_public  (materialized aggregate)
   │
   └── direct reads from worker scripts only (admin, backfill)
```

---

## 7. Storm-days bbox (the "click-to-show-where-it-hit" data)

`/api/hail/storm-days` returns each storm date with a `storm_bbox` field:
```json
{
  "date": "2026-04-23",
  "state": "MD",
  "max_hail": 0.1,
  "report_count": 1,
  "sources": ["CoCoRaHS"],
  "has_direct_hit": false,
  "storm_bbox": {
    "north": 41.5,
    "south": 39.0,
    "east": -78.0,
    "west": -81.5
  }
}
```

Picked from `mrms_swath_cache` per date with this priority:
```sql
ROW_NUMBER() OVER (
  PARTITION BY storm_date
  ORDER BY (hail_cells > 0) DESC,                    -- prefer rows with actual hail
           (north - south) * (east - west) ASC,      -- prefer narrowest bbox
           hail_cells DESC                            -- tie-break by hail volume
)
```

This is what enables the map to zoom to the actual storm location even when the
storm is hundreds of miles from the search anchor. Without it, the polygon-fetch
bbox is the user's address → empty polygons.

The cache is populated organically by user queries. To "pre-warm" specific dates
with a tighter bbox, hit `/api/hail/mrms-swath-polygons?date=YYYY-MM-DD&north&south&east&west`
with a focused box over the storm area. The result is cached for 6 hours.

---

## 8. Rep-facing filters that gate what the UI renders

The UI applies two filters on top of the API response in `TerritoryHailMap.tsx`:

### `showLightHail` (toggle)
- `false` (default): hides any tier where `maxHailInches < 0.5`
- `true`: shows everything down to 0.25" (radar-band edges)

### `maxDistanceMi` (slider, default 3)
- Applied to AT LOCATION and AREA IMPACT tiers only
- DIRECT HITS bypass this filter (polygon containment is authoritative)

### `historyRange` (button group)
Translated to `monthsBack` for the API call:
- "1Y" → 12, "2Y" → 24 (default), "5Y" → 60, "10Y" → 120, "Since" → custom date

If the user sets historyRange to 2Y and lat/lng is searched, the API call is
`GET /api/hail/address-impact?lat=X&lng=Y&months=24`. The API in turn caps at 60
months max regardless.

---

## 9. File map

```
server/services/
  addressImpactService.ts        — DIRECT HIT / AT LOCATION / AREA IMPACT classifier
  consilienceService.ts          — 6-source PDF block aggregator
  synopticClient.ts              — MADIS station REST API client
  synopticObservationsService.ts — surface obs corroboration helper
  pdfReportServiceV2.ts          — PDF generator
  verifiedEventsService.ts       — base-table writes (ON CONFLICT)
  historicalMrmsService.ts       — MRMS GRIB → polygons, mrms_swath_cache
  stormImpactService.ts          — point-in-polygon engine
  stormDaysService.ts            — storm_days_public refresh cron
  hailPalette.ts                 — getHailLevel(): label/color/severity by inches
  verifiedEventsPdfAdapter.ts    — DB → PDF event shape adapter

server/routes/
  hailRoutes.ts:4028   — GET /api/hail/storm-days
  hailRoutes.ts:3680   — GET /api/hail/address-impact
  hailRoutes.ts:2120   — GET /api/hail/mrms-swath-polygons
  hailRoutes.ts:1320   — POST /api/hail/generate-report

components/  (frontend)
  TerritoryHailMap.tsx         — main map state, side panel, auto-pan
  MRMSSwathPolygonLayer.tsx    — react-leaflet polygon renderer
  PropertyImpactPanel.tsx      — "Your Homes" customer-property panel (different)
  stormMapHelpers.ts           — fetchers, types, distance helpers, hailPalette mirror

database/migrations/
  069_verified_hail_events.sql                     — base table
  075_add_source_nexrad_l2.sql                     — L2 source flag
  077_storm_days_public.sql                        — MV
  081_drop_nexrad_l2_from_public_view.sql          — hide L2-only

scripts/
  test-verified-pdf.ts          — local PDF generation against prod DB
```

---

## 10. Verification recipes

### Probe the API for a known address
```bash
curl -s "https://sa21.up.railway.app/api/hail/address-impact?lat=38.7509&lng=-77.4753&months=24" \
  | python3 -m json.tool | head -50
```

### Generate test PDFs against prod DB
```bash
TOKEN=$(grep "^SYNOPTIC_TOKEN=" /Users/a21/.synoptic-token | cut -d= -f2)
SYNOPTIC_TOKEN="$TOKEN" railway run bash -c \
  "SYNOPTIC_TOKEN=\"$TOKEN\" npx tsx scripts/test-verified-pdf.ts"
# PDFs land in /tmp/pdf-test/
```

### Inspect a PDF's consilience section
```bash
pdftotext /tmp/pdf-test/scenic-perryhall-LIFETIME-verified.pdf - \
  | grep -A 50 "Multi-Source" | head -60
```

### Local PG17 mirror queries
```bash
docker exec gff-pg17 psql -U postgres -d gff -c "
  SELECT event_date, COUNT(*) AS rows,
         COUNT(*) FILTER (WHERE source_nexrad_l2 AND verification_count = 0) AS l2_orphans,
         BOOL_OR(source_mrms) AS has_mrms
  FROM verified_hail_events
  WHERE event_date >= CURRENT_DATE - INTERVAL '14 days'
  GROUP BY event_date ORDER BY event_date DESC;
"
```

### Build + deploy
```bash
cd /Users/a21/gemini-field-assistant
npm run build
railway service "Susan 21"
railway up --detach
```

---

## 11. Invariants (do NOT break)

- `verified_hail_events.event_date` is the **ET calendar day** of the storm. UTC midnight
  is not a day boundary for our pipeline. Any new ingest must convert to ET first.
- `(event_date, lat_bucket, lng_bucket)` is the dedup grain. New ingests ON CONFLICT into
  existing rows; flags merge, source_details merges, hail_size takes the max.
- ⅛" is the MRMS visualization floor; ¼" is the PDF display floor; ½" is the insurance-
  actionable threshold. Anything below ½" should not surface as a "claim-worthy" hit.
- DIRECT HIT semantics: property is inside an MRMS swath polygon OR has multi-source
  ground-report corroboration sub-mile. Distance bands are secondary.
- `SYNOPTIC_API_KEY` (master key) NEVER goes in code or env files. Only `SYNOPTIC_TOKEN`
  ships. The master key is for token rotation only.
- `source_nexrad_l2` is intentionally excluded from `verified_hail_events_public`'s WHERE
  filter. Re-adding it would re-introduce the fake-swath problem from migration 081.

---

## 12. Memory references

- `~/.claude/projects/-Users-a21/memory/sa21-session-apr27-overnight.md` — full overnight session
- `~/.claude/projects/-Users-a21/memory/feedback_nexrad-l2-noise.md` — why L2 hides
- `~/.claude/projects/-Users-a21/memory/feedback_direct-hit-ground-truth.md` — Path B upgrade
- `~/.claude/projects/-Users-a21/memory/feedback_swath-first-direct-hit.md` — Path A authoritative
- `~/.claude/projects/-Users-a21/memory/feedback_storm-data-sources.md` — source quality rules
- `~/.claude/projects/-Users-a21/memory/feedback_swath-first-direct-hit.md` — UI/PDF/Susan agreement

---

**End of architecture reference.**
