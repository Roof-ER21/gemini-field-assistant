# HailTrace Recon Report

**Captured**: 2026-04-21T19:41 UTC
**Source**: Authenticated session, admin account via Playwright
**Output**: `/Users/a21/web-recon/data/reports/hailtrace/option1-2026-04-21T19-41-44-331Z/`
**Legal basis**: Own admin account; observational only. No automated scraping implemented.

## Architecture

- **Frontend**: Next.js app at `app.hailtrace.com`
- **API**: GraphQL at `app-graphql.hailtrace.com/graphql`
- **Auth**: JWT Bearer (RS256), cookie `hailtrace-identity`
- **CDN / Geocode**: `api-cache.hailtrace.com/geocode/json`
- **Billing**: Stripe
- **Analytics**: PostHog, Google Analytics
- **Chat**: Zoho SalesIQ
- **Maps**: Google Maps JS API (NOT Mapbox despite one cookie reference)

## 40 GraphQL Operations Discovered

### Weather / Storm Data (core business)
| Operation | Purpose |
|---|---|
| `GetLatestWeatherEvent` | Most recent storm |
| `GetWeatherEventByDate` | Storm on specific date |
| `GetWeatherEventsByDates` | Range query |
| `GetWeatherEventByDateForPurchase` | Paid/metered variant |
| `FilterWeatherEvents` | Paginated filtered list |
| `CanvassingReport` | Door-knock canvassing data |
| `FilterGroups` / `FilterOptions` | Filter chip dropdowns |
| `MarkerTypes` | Map pin icon definitions |
| `MapPrice` | Map pricing tier |
| `FavoriteMaps` | User-saved favorites |

### Property / Asset CRM
| Operation | Purpose |
|---|---|
| `PaginatedAssetsWithImpactAnalysis` | Properties + storm impact rollup |
| `MapAssets` | Properties on map |
| `Asset` / `AssetSimple` | Single property details |
| `Contacts` / `ContactsWithAssets` | Contact management |
| `Opportunities` / `OpportunityStatuses` | Sales pipeline |
| `LocationDetailsSimplified` | Address detail |

### Dashboard / Reporting
| Operation | Purpose |
|---|---|
| `DashboardGeneralStats` | KPIs |
| `DashboardGrossRevenueGraphSeries` | Revenue chart |
| `DashboardLeaderboard` | Sales leaderboard |
| `DashboardOpportunityStageStats` | Stage funnel |

### Auth / User
| Operation | Purpose |
|---|---|
| `Authenticate` | Login |
| `SessionUser` | Current user |
| `Abilities` / `PermissionAccess` / `AccessAtLocation` | RBAC |
| `UsersSimple` | User list |
| `Company` | Company details |

### Misc
| Operation | Purpose |
|---|---|
| `Notifications` / `NotificationsUnopened` / `UpdateNotificationStatus` | In-app notifications |
| `Forms` / `Fields` | Custom form builder |
| `OpenCampaigns` | Active marketing campaigns |
| `TimeZones` | Timezone picker |
| `CreateStripeSetupIntent` / `StripePaymentMethods` | Billing |

## THE KEY FINDING — Dual-Track Data Model

HailTrace's `WeatherEvent` schema has TWO parallel tracks for every storm:

### Algorithm Track (machine-derived)
```graphql
maxAlgorithmHailSize
maxAlgorithmDamageProbability
lastAlgorithmHailImpactSizeInches
lastAlgorithmImpacts { hail { date, sizeInches } }
```
→ Computed from raw NEXRAD/MRMS radar data, fully automated, ~5 min latency.

### Meteorologist Track (human-verified)
```graphql
maxMeteorologistHailSize
maxMeteorologistWindSpeedMPH
maxMeteorologistTornadoEFRank
maxMeteorologistWindStarLevel         # 1-5 star rating
maxMeteorologistHailStarLevel         # 1-5 star rating
lastMeteorologistHailImpactSizeInches
lastMeteorologistWindImpactSpeedMPH
lastMeteorologistTornadoImpactDate
lastMeteorologistImpacts {
  hail { date, sizeInches }
  wind { date, speedMPH }
  tornado { date, efRank }
}
```
→ Reviewed/overridden by their 17 in-house meteorologists. Higher confidence for legal reports. Slower (hours-to-days).

## Individual Ground Reports

```graphql
weatherReports[] {
  _id, date, reportType, dateTime,
  magnitude, magnitudeUnit, source, comments,
  geometry { type, coordinates }    # GeoJSON Point
}
```
→ Points from NOAA LSR, SPC, trained spotters, photos. Same federal sources we use.

## Per-Property Pre-Computed Impact (their UX moat)

Every asset carries a pre-rolled `impactAnalysis` object so the map renders instantly:
- `lastImpactDate`
- `lastMeteorologistHailImpactDate` + `...SizeInches`
- `lastAlgorithmHailImpactDate` + `...SizeInches`
- Arrays of historical impacts

**We don't pre-compute this.** That's a Phase 3 improvement for us.

## Star Level Rating System

1-5 star scale, separate for hail and wind. This is their consumer-facing summary for non-technical users. Replaces raw inch measurements in summary views.

**Likely mapping** (inferred from context):
| Star | Hail size | Damage likelihood |
|---|---|---|
| ★ | < 0.5" | Negligible |
| ★★ | 0.5-0.75" | Possible cosmetic |
| ★★★ | 0.75-1.25" | Moderate — code trigger |
| ★★★★ | 1.25-2" | Significant |
| ★★★★★ | 2"+ | Severe / catastrophic |

## What This Means For Our Plan

### Updated Decisions

**1. Mirror their dual-track model in our schema.**
Add to `verified_hail_events`:
- `algorithm_hail_size_inches` (from MRMS only)
- `verified_hail_size_inches` (from NOAA + CoCoRaHS + rep-reports)
- `algorithm_wind_mph` / `verified_wind_mph`
- Keep `hail_size_inches` as the max of both for backward compat

Rationale: if we ever import HailTrace data (Phase 6), the semantic equivalence makes it a 1:1 merge, not a reinterpretation.

**2. Add star-level rating computed from our verification count + size.**
- `hail_star_level INTEGER` GENERATED from size thresholds
- `wind_star_level INTEGER` GENERATED from wind mph thresholds
- These give our PDFs the same consumer-friendly summary HailTrace has, without the meteorologist overhead.

**3. Pre-compute per-property impact analysis.**
- New table `property_impact_rollup` refreshed every 10 min
- Mirrors their `impactAnalysis` structure
- Makes `/hail/search` and PDF generation sub-100ms

**4. Build OPTIONAL HailTrace import via manual export.**
User's admin account can view their data through the UI. A clean path:
- Bookmarklet or one-shot "export my HailTrace data" tool that fires the GraphQL queries with the user's own JWT
- Saves to local JSON
- Drops into `~/scripts/hailtrace-automation/hailtrace-exports/` (existing watcher)
- User-initiated, not automated — keeps us out of ToS gray zone

This is Phase 6, still optional. Not load-bearing.

### What We Do NOT Do

- ❌ Automated background scraping of HailTrace (ToS violation, legal risk)
- ❌ Redistribute their meteorologist-verified data to anyone who isn't our subscriber
- ❌ Claim our reports are "HailTrace-verified" — they're federally-verified, that's better
- ❌ Use their pricing data, user data, or internal org data we captured (only keep the schema)

## What Stays Confidential

The 82-user list of The Roof Docs accounts captured in the UsersSimple response is internal org data. Saved as part of the recon dump but never redistributed. Will be purged after plan finalization.

## Files Produced

- `api-calls.json` (2.7 MB) — every request with headers/postData
- `response-bodies.json` (162 KB) — JSON responses (capped at 500KB each)
- `storage.json` (42 KB) — localStorage, sessionStorage, cookies
- `summary.json` (15 KB) — domain/endpoint rollup
- `nav-links.json` — discovered routes
- `screenshots/` — per-route full-page PNGs (25 files)

## Open Questions Answered

| Question | Answer |
|---|---|
| Does HailTrace offer a bulk-export API? | Yes technically (GraphQL), but no officially-documented bulk-export endpoint; automated use violates ToS |
| What format are meteorologist points in? | GeoJSON Points, embedded in `weatherReports[]` array of `getWeatherEventByDate` response |
| Rate limits? | Not observed in captured traffic. Unknown upper bound. |
| PDF format to mirror? | Didn't capture any PDF generation in this session — deferred |
| Do they use MRMS? | Not explicitly named, but `maxAlgorithm*` field names strongly imply raw radar (MRMS/NEXRAD) is the algorithm input |

## Recommendation

**Proceed with Phase 1 (CoCoRaHS ingest) as planned, with updated Phase 0 schema to mirror the dual-track model.** HailTrace Phase 6 stays optional but now has a concrete implementation path if/when the user wants it.
