# Handoff Addendum: Column Bucketing + Source Filtering + Mobile UI (afternoon session)

**Created:** 2026-04-27 (afternoon, ~14:22 ET)
**For:** Claude Code session(s) on **sa21** = `/Users/a21/gemini-field-assistant/`
**Stacks on:** `HANDOFF-DISPLAY-CAP-2026-04-27.md` (this morning)
**Sister addendum (DO NOT diverge from):**
`/Users/a21/Desktop/storm-maps/HANDOFF-AFTERNOON-ADDENDUM-2026-04-27.md`

This is a **supplemental** handoff. Do the morning handoff (display cap +
verification + Sterling-class) FIRST. Then layer this on top.

The morning's adjuster-vs-canvasser scope rule still applies: cap +
strict bucketing + primary-source filter run on **adjuster-facing
surfaces only**. Live MRMS alerts and internal canvass maps stay raw.

---

## What the afternoon session uncovered

Four additional issues surfaced after the morning meeting wrapped, all
needing to ship with (or right after) the cap:

1. **Column bucketing is broken.** "At Property / 1–3 mi / 3–5 mi"
   columns aren't strict — values from anywhere 0–4.9 mi spill into
   the at-property cell.
2. **Too many sources flooding the report.** NCEI / SPC / IEM LSR / KLX
   non-NEXRAD radars / one-off Hailtrace spotters are producing the
   4-inch outliers. Adjusters don't recognize most of these.
3. **Polygon swath rendering went ugly.** Vector swaths look "polygon-y"
   / "finicky" — same root cause as #2 (over-imported data).
4. **Mobile experience is unusable.** Click-to-pin-on-map breaks
   navigation; buttons cluttered; MRMS button blocked by search bar;
   storm date selection clears when user double-taps to zoom.

The first three connect to the cap work. #4 is independent and is the
sa21-only concern not in the Hail Yes addendum.

---

## Issue 1 — Strict column bucketing

### Current (broken) behavior

From Ahmed live-debugging the report at 14:12:

> "This 'At Property' is just showing what the largest one was within
> five miles. This is within five miles, but it's actually at property…
> If this 2 showed up at 1.1 instead of less than 0.9, that would be
> here and here. That's way too confusing."

Translation: a 4" value found at 0.6 mi spills into the "At Property"
column even though that column should mean ≤ 0.5 mi.

### Required behavior

Each column shows ONLY values from its own distance band. No spillage.

| Column header | Strict band |
|---|---|
| **At Property** | `dist ≤ 0.5 mi` ONLY |
| **1 to 3 mi** | `0.5 < dist ≤ 3 mi` ONLY |
| **3 to 5 mi** | `3 < dist ≤ 5 mi` ONLY |

If no reports fell in a band, that column shows null/blank — DO NOT
fall back to a neighboring band's value.

### Implementation in sa21

The per-column aggregation likely lives in
`server/services/stormImpactService.ts` or
`server/services/stormDataService.ts`. Search for the at-property logic:

```bash
rg -n "atProperty|at_property|withinMiles\s*[:=]\s*5|radius.*5\b" \
  server/services/ --type ts
```

Once located, replace any "max of everything within 5 mi" pattern with
strict bucketing:

```ts
// ❌ Current (broken)
// const atProperty = max(reportsWithinMiles(reports, 5))

// ✅ Required
const atProperty = reports.filter((r) => distMi(r) <= 0.5);
const oneToThree = reports.filter(
  (r) => distMi(r) > 0.5 && distMi(r) <= 3,
);
const threeToFive = reports.filter(
  (r) => distMi(r) > 3 && distMi(r) <= 5,
);
```

Then run the cap algorithm independently per column with that column's
own verification context:

```ts
import {
  displayHailInches,
  buildVerification,
} from "./displayCapService.js";

const atPropertyDisplay = atProperty.length === 0
  ? null
  : displayHailInches(
      Math.max(...atProperty.map((r) => r.inches)),
      buildVerification(atProperty, lat, lng, stormDate),
    );

const oneToThreeDisplay = oneToThree.length === 0
  ? null
  : displayHailInches(
      Math.max(...oneToThree.map((r) => r.inches)),
      buildVerification(oneToThree, lat, lng, stormDate),
    );

const threeToFiveDisplay = threeToFive.length === 0
  ? null
  : displayHailInches(
      Math.max(...threeToFive.map((r) => r.inches)),
      buildVerification(threeToFive, lat, lng, stormDate),
    );
```

### Test cases

```ts
// server/services/__tests__/columnBucketing.spec.ts

describe("strict column bucketing", () => {
  // The 17032 Silver Charm Place case — 4" found ~0.6 mi away
  it("4-inch at 0.6 mi → at-property null, 1-3 column populated", () => {
    const reports = [
      { source: "nws-lsr", lat: 38.85, lng: -77.30, inches: 4.0, date: "2025-07-16" },
    ];
    const result = bucketReports(reports, 38.86, -77.30); // ~0.6 mi
    expect(result.atProperty).toBeNull();
    expect(result.oneToThree).toBe(2.0); // single source = unverified
  });

  it("2.5 verified at-location → at-property only", () => {
    const reports = threeGovReportsAt(38.85, -77.30, 2.5);
    const result = bucketReports(reports, 38.85, -77.30);
    expect(result.atProperty).toBe(2.5);
    expect(result.oneToThree).toBeNull();
    expect(result.threeToFive).toBeNull();
  });

  it("1.5 at 4.5 mi → only 3-5 column populated", () => {
    const result = bucketReports(
      [{ source: "nws-lsr", lat: 38.79, lng: -77.30, inches: 1.5, date: "2025-07-16" }],
      38.85, -77.30,
    );
    expect(result.atProperty).toBeNull();
    expect(result.oneToThree).toBeNull();
    expect(result.threeToFive).toBe(1.5);
  });
});
```

---

## Issue 2 — Source filtering (primary vs supplemental)

### What Ahmed said (12:44 transcript, decisive)

> "You need to have it back to just NEXRAD and NWS. Because you have all
> this other KLX, W. Like no one uses that. Insurance company won't
> recognize that."
>
> "Insurance companies technically NWS probably isn't, but it's easier to
> get them to because it's called National Weather Service. Everything
> else can go. Nothing else is accepted by insurance companies."
>
> "I think you got too scared about that one storm not showing up that
> you over-flooded it with the one random report from Hailtrace."

### Required behavior

Two source tiers:

**PRIMARY** (drives the at-property / 1-3 / 3-5 display values):
- NEXRAD MRMS — `liveMrmsService.ts`, `historicalMrmsService.ts`,
  `mrmsTerritoryWatcher.ts`
- NWS Local Storm Reports — `nwsAlertService.ts`,
  `nwsAlertsService.ts`, `nwsTerritoryWatcher.ts`
- NCEI Storm Events — `noaaStormService.ts` (already typed
  `dataSource: 'NOAA Storm Events Database'`, `certified: true`)

**SUPPLEMENTAL** (still ingested, still listed in the Sources detail
section for transparency, but NEVER drives the headline display):
- Hailtrace imports — `hailtraceImportService.ts`,
  `hailtraceValidationService.ts`
- mPing (wherever ingested)
- CoCoRaHS (whatever client)
- IEM LSR (if ingested)
- KLX or any non-MRMS-feed radar
- Any single-source third-party report

### Implementation

Add a source-tier helper:

```ts
// server/services/sourceTier.ts (new file — must mirror Hail Yes
// /Users/a21/Desktop/storm-maps/server/storm/sourceTier.ts byte-for-byte)

export type SourceTier = "primary" | "supplemental";

const PRIMARY_SOURCES = new Set([
  "mrms",
  "nexrad-mrms",
  "nws-lsr",
  "ncei-storm-events",
]);

export function classifySource(source: string): SourceTier {
  return PRIMARY_SOURCES.has(source) ? "primary" : "supplemental";
}
```

Update `buildVerification()` to require ≥3 primary + ≥1 government-observer:

```ts
const primaryAtLocation = atLocationReports.filter(
  (r) => classifySource(r.source) === "primary",
);
const govObservers = primaryAtLocation.filter(
  (r) => r.source === "nws-lsr" || r.source === "ncei-storm-events",
);

return {
  isVerified: primaryAtLocation.length >= 3 && govObservers.length >= 1,
  isAtLocation: primaryAtLocation.length > 0,
  isSterlingClass: isSterlingClass(stormDate, queryLat, queryLng),
};
```

Note: NEXRAD MRMS counts as primary for **display** but doesn't satisfy
the "government-observer" requirement on its own — it's algorithmic, not
a human spotter. Need at least one NWS LSR or NCEI Storm Events
corroborating the display value.

### Where to wire the filter

In `stormImpactService.ts` and `stormDataService.ts` (and any other API
that feeds adjuster-facing surfaces): the **headline at-property /
1-3 / 3-5 cells** must use primary-only reports. The **Sources detail
list** stays full so transparency is preserved:

```ts
const allSources = await fetchAllSources(/* ... */);

const primarySources = allSources.filter(
  (s) => classifySource(s.source) === "primary",
);

const display = {
  atProperty: bucketAndCap(primarySources, lat, lng, /* ≤0.5 */),
  oneToThree: bucketAndCap(primarySources, lat, lng, /* 0.5–3 */),
  threeToFive: bucketAndCap(primarySources, lat, lng, /* 3–5 */),
};

const sourcesDetail = allSources.map((s) => ({
  ...s,
  isPrimary: classifySource(s.source) === "primary",
}));
```

In the PDF / UI, render `sourcesDetail` with a visual cue distinguishing
primary from supplemental — but the headline cells are already strict.

### Internal-only services left alone

Per the morning handoff's scope rule, do NOT apply this filter to:

- `liveMrmsAlertService.ts` — reps need raw MRMS for canvassing
- `liveMrmsService.ts`, `liveNwsWarningAlertService.ts`
- `mrmsTerritoryWatcher.ts`, `nwsTerritoryWatcher.ts`
- `historicalMrmsService.ts`, `stormMemoryService.ts`
- Internal map overlays (`MRMSHailOverlay.tsx`, `MRMSSwathPolygonLayer.tsx`,
  `HailContourLayer.tsx`, `TerritoryHailMap.tsx`)

The filter applies only at the adjuster-facing aggregation layer.

---

## Issue 3 — Polygon swath render quality

### What Ahmed said (13:04)

> "The rebound spots, they look more natural… they don't do that, they
> draw theirs. That's why theirs gets more in the background and more…
> I honestly think it's because you imported all these random data that
> we didn't need. All the small data, like 'camp', what the hell's that?
> We just need NEXRAD, NWS — that's it."

Polygons used to render as smooth storm-shaped vectors. After data
additions they render as fragmented "polygon-y / finicky" mess.

### Required behavior

Apply the primary-source filter (Issue 2) to swath rendering. The
swath layer should be drawn from MRMS contours, NOT from every
single supplemental data point getting its own mini-polygon.

### Files to look at

- `server/services/historicalMrmsService.ts` — MRMS contour generation
- `server/services/hailMapsService.ts` — map data API
- `components/HailSwathLayer.tsx` — UI rendering
- `components/HailContourLayer.tsx` — contour rendering
- `components/MRMSSwathPolygonLayer.tsx` — internal canvasser layer
  (NOT affected — keep raw)

For the **adjuster-facing report swath**, ensure the source feeding
the polygon layer is filtered to primary sources only. For the
**internal canvass map**, keep showing all the data.

### Visual smoke test

1. Pre-change: screenshot the April 15 storm rendering on the report
2. Apply primary-source filter to the report's swath input
3. Reload, screenshot
4. Compare: polygons should be smoother, fewer fragments, "looks like
   a storm" again

---

## Issue 4 — Mobile UI (sa21-only)

This one's not in Hail Yes's addendum because Hail Yes doesn't have the
same mobile flow (yet). For sa21, Ahmed surfaced specific blockers from
12:54 transcript while testing on his phone.

### Bug 4a — Click-to-pin-on-map breaks navigation

> "When you click on the map, it tells you what address that you
> clicked on is. Not only that though, it takes away the storm date
> you have selected and brings you… It brings up a swath of the most…
> If I click that, it thinks I'm pinning a location. If I click this
> [button], it thinks I'm pinning a location."

Translation: any click anywhere on the map (including button hits that
overlap the map) registers as "user wants to pin a new location" and
clears the current storm-date selection.

**Fix:** disable the auto-pin-on-map-click behavior entirely. Address
selection should ONLY happen via the search box. Map clicks should be
no-ops (or at most show a tooltip — never reset state).

If pin-on-click is needed for canvassing later, gate it behind an
explicit "pin mode" toggle.

### Bug 4b — Buttons / overlays cluttering small screens

> "What is that? It's all jumbled up over there. Do you want me to
> remove all those buttons? That's too much stuff. The MRMS button is
> blocked by the search bar."
>
> "There's too much click action stuff."

**Fix:** on mobile (or all viewports), do an audit of the map control
overlays and consolidate. The MRMS toggle being hidden behind the
search bar is the highest-priority concrete bug.

Files: `src/components/AppHeader.tsx`, `src/components/Legend.tsx`,
plus whichever component holds the map control buttons (search by
"Radar", "MRMS", "Layer toggle" in components).

### Bug 4c — Double-tap zoom clears storm date

When the user double-taps to zoom on mobile, the map's click handler
fires, which (per Bug 4a) clears the storm-date selection.

**Fix:** falls out of fixing Bug 4a. Once map clicks no longer mutate
state, double-tap zoom won't break anything.

### Bug 4d — Storm-pass animation request was misinterpreted

> "What is this? Oh, that was a request by your people of seeing the
> storm pass."
> "People that have never used [it]… No, no, no, get rid of that. We
> want just one large swath that you had of all the spots the storm was."

**Fix:** the "storm pass / 24h replay" UI was added based on a request
but is in the way. Remove or hide it. Default behavior: one consolidated
swath of all hail cells from the storm, NOT a time-animated replay.

If the replay is actually wanted by some users, gate it behind an
explicit "replay" toggle — off by default.

### Bug 4e — Bottom-of-screen storm-date selector unreachable

> "Where's the storm though? … And then select a storm date maybe at
> the bottom?"
> "Yeah, scroll. Yeah, right. Whoa. There's the bottom. Flip it to
> the side and then let's see if it does it. Nope. But there's the
> bottom. Not usable on the phone, dude."

**Fix:** the storm-date selector is below the fold on mobile. Move it
above the fold (just under the search box, or as a drawer at the top).
Critical to the entire workflow being usable on phone.

### Mobile UI — testing checklist

- [ ] On iPhone Safari: open storm map, search address, select storm
      date, view swath. No map clicks should reset state.
- [ ] MRMS toggle button visible and tappable (not hidden by search bar)
- [ ] Storm-date picker reachable without scrolling to bottom
- [ ] Double-tap to zoom works without clearing state
- [ ] Time-replay UI removed (or off by default behind a toggle)

---

## Order of operations

1. **Day 1 — Cap module + verification builder** (morning handoff): create
   `server/services/displayCapService.ts`, Sterling allow-list, unit
   tests pass.
2. **Day 1 — Source tiering**: create `server/services/sourceTier.ts`,
   wire into `buildVerification()`.
3. **Day 1 — Strict column bucketing** in `stormImpactService.ts` /
   `stormDataService.ts`. Each column independent. Cap runs per-column.
4. **Day 1 — Wire into adjuster surfaces**: `pdfReportServiceV2.ts`,
   `verifiedEventsPdfAdapter.ts`, `narrativeService.ts`,
   `repReportService.ts`. Headline cells = primary-only, strict-bucketed,
   capped.
5. **Day 2 — Swath layer filter** for adjuster-facing report views.
   Internal canvass layers stay untouched.
6. **Day 2 — Mobile UI fixes**: Bug 4a → 4e in the order above.

---

## Open items deliberately deferred (still — same list as morning)

- Comparison columns (gov / Hail Trace / Hail Recon) — Oliver tiebreaker
- Susan vs Hail Yes consolidation — Russ + Ahmed
- At-property null inconsistency Russ noticed earlier — investigate
  AFTER bucketing fix lands; strict bucketing may be the cause/fix
- Live alert flip from `approval-gate` to `true` — separate decision,
  not now

---

## Definition of done (additions to morning handoff's checklist)

- [ ] `server/services/sourceTier.ts` exists with
      primary/supplemental classification
- [ ] Bucketing is strict per-band, no spillage between columns
- [ ] Cap runs per-column with its own `VerificationContext`
- [ ] Headline cells use primary sources only
- [ ] Sources detail section still lists supplemental for transparency
- [ ] Adjuster-facing swath layer uses primary sources only
- [ ] Internal canvasser layers unchanged (live alerts, territory
      maps, raw MRMS)
- [ ] Mobile: map clicks are no-ops (no state mutation)
- [ ] Mobile: storm-date picker above the fold
- [ ] Mobile: MRMS toggle visible (not hidden by search bar)
- [ ] Mobile: time-replay removed or gated off by default
- [ ] All test cases pass (morning + afternoon)
- [ ] Manual: 4" at 0.6 mi → does NOT appear in At Property
- [ ] Manual: April 15 swath renders smoothly, no fragments
- [ ] Manual: storm map fully usable on phone (search-only flow)

---

## Quick file map (afternoon additions)

| Concern | File |
|---|---|
| **NEW: source tier classifier** | `server/services/sourceTier.ts` |
| Strict column bucketing | `server/services/stormImpactService.ts`, `stormDataService.ts` |
| Adjuster swath rendering | `server/services/historicalMrmsService.ts`, `hailMapsService.ts` |
| Mobile map controls | `src/components/AppHeader.tsx`, `src/components/Legend.tsx`, plus whichever holds MRMS/Radar buttons |
| Click-to-pin behavior | search components for `onMapClick`, `setPin`, `dropPin` patterns |
| Storm-date picker placement | search for the date selector component, likely in a panel/drawer |

---

## Source-of-truth quotes (afternoon)

- `~/Blackbox/transcripts/2026-04-27_12-44-14.txt` — source restriction
  decision; "you got too scared… you overflooded it with the one
  random report from Hailtrace"
- `~/Blackbox/transcripts/2026-04-27_12-54-32.txt` — mobile complaints;
  "Not usable on the phone, dude"; "you need to have it back to just
  NEXRAD and NWS"
- `~/Blackbox/transcripts/2026-04-27_13-04-47.txt` — polygon "ugly /
  finicky" feedback
- `/tmp/whisper-out/right-now-v2.txt` — column bucketing realization;
  "This 'At Property' is just showing what the largest one was within
  five miles"

End of addendum.
