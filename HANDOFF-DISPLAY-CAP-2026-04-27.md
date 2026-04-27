# Handoff: Display Cap Algorithm + Adjuster-Facing Report Updates (sa21)

**Created:** 2026-04-27 (afternoon, immediately after the storm-app demo meeting)
**For:** Claude Code session(s) working on **sa21** = `/Users/a21/gemini-field-assistant/`
**Sister handoff (DO NOT diverge from):** `/Users/a21/Desktop/storm-maps/HANDOFF-DISPLAY-CAP-2026-04-27.md` (Hail Yes app)
**Decided by:** Ahmed, Reese (field rep), Russell (boss), Louie — full meeting consensus
**Why:** the storm report demo this morning showed 4-inch and 3-inch hail "at
location" in Leesburg/Manassas. The data is technically correct (verified
ground spotters, government sources). Adjusters reject any report showing
>2.5" at location. We're now implementing a display-cap algorithm that sits
between verified raw data and any **adjuster-facing surface**.

---

## Critical scope rule — read this before changing anything

The cap applies to **adjuster-facing surfaces only**:

- ✅ PDF storm reports (`pdfReportServiceV2.ts`, `verifiedEventsPdfAdapter.ts`)
- ✅ Rep storm-impact summaries when delivered to a customer or adjuster
  (`repReportService.ts`)
- ✅ Property impact panels in the report-generation flow
- ✅ Narrative composition for adjuster correspondence (`narrativeService.ts`)

The cap does **NOT** apply to **internal canvassing surfaces**:

- ❌ Live MRMS alerts to Sales Team / GroupMe (`liveMrmsAlertService.ts`,
  `liveMrmsService.ts`, `liveNwsWarningAlertService.ts`,
  `mrmsTerritoryWatcher.ts`) — reps need the real value so they know what's
  actually falling
- ❌ Internal storm dashboards / territory hail maps (`TerritoryHailMap.tsx`)
- ❌ Map overlay layers showing raw radar data (`MRMSHailOverlay.tsx`,
  `MRMSSwathPolygonLayer.tsx`, `HailContourLayer.tsx`)
- ❌ MPing / Hailtrace import + validation pipelines — they preserve truth
- ❌ Storm memory ingestion (`stormMemoryService.ts`) — full fidelity stays

**Rule of thumb:** if a rep is reading it to decide where to canvass, show
truth. If an adjuster will see it, run it through the cap.

---

## TL;DR — what changes

1. New module `server/services/displayCapService.ts` is the single source of
   truth for the cap algorithm.
2. The underlying data is **NOT** modified. Raw values stay in the database
   and remain accessible via internal/debug endpoints.
3. Adjuster-facing report files call `displayHailInches()` before rendering.
4. UI: "At location" panel moves to the top of page 1 of the PDF report.
   Distance bands (at-property / 1–3 mi / 3–5 mi) stay underneath.
5. Date range selector: 1y / 2y / 3y / 5y, default 3y (VA statute of
   limitations).
6. The cap module must be **identical** to Hail Yes's
   (`/Users/a21/Desktop/storm-maps/server/storm/displayCapService.ts`).
   Same algorithm, same Sterling-class allow-list, same verification rules.

---

## The cap algorithm (locked, with Ahmed's override)

The meeting first-pass landed at "if a spotter says 4-inch, just show 1-inch"
(Reese: "with an inch I can get an adjuster to prove anything"). Ahmed
overrode this on the way out: **if it says 4, show 2; show 2.5 if verified.**
That's the rule below.

### Rules

| Raw max hail (in) | Verified? | Display |
|---|---|---|
| `< 0.4` | any | `null` (suppress, no hail event) |
| `0.4 – 0.74` | any | floor to **0.75"** |
| `0.75 – 2.00` | any | pass through, snapped to nearest 0.25" |
| `2.01 – 2.50` | not verified | **2.0** |
| `2.01 – 2.50` | verified + at-location | pass through, snapped to 0.25" |
| `2.51 – 3.00` | verified + Sterling-class | pass through, capped at **3.0** |
| `2.51 – 3.00` | not Sterling-class | **2.5** if verified, **2.0** if not |
| `> 3.00` | verified | **2.5** |
| `> 3.00` | not verified | **2.0** |

### "Verified" — definition

A hail value is verified when ALL of the following hold:

- ≥ **3 ground spotter reports** for the same storm date in tight proximity
  to the query lat/lng. Sources that count, in the gemini-field-assistant
  pipeline:
  - NWS Local Storm Reports — `nwsAlertService.ts` / `nwsAlertsService.ts`
  - NCEI Storm Events — `noaaStormService.ts` (already modeled —
    `dataSource: 'NOAA Storm Events Database'`, `certified: true`)
  - mPing crowdsourced — pulled via `hailtraceImportService.ts` (mping
    paths) or wherever you've wired it
  - Hailtrace verified spotters — `hailtraceValidationService.ts`
- ≥ 1 source must be **government-backed** (NWS LSR or NCEI Storm Events)
- For "at-location" specifically, reports must be within **0.5 miles** of
  the queried point

Single-source readings — even high MRMS pixel values, even one Hailtrace
spotter — do not count as verified. This is what kills the 4-inch outlier
problem at the source.

### "At-location" — definition

The current bug: the at-property column is leaking values from a 15-mile
radius search. After this work:

- **At property**: ≤ 0.5 mi from query point
- **1 to 3 mi band**: > 0.5 mi and ≤ 3 mi
- **3 to 5 mi band**: > 3 mi and ≤ 5 mi

Each band runs the cap independently. The wider bands have looser
"at-location" requirements but the same cap logic applies.

### "Sterling-class" — definition

Storms with genuinely severe verified hail at unusual sizes. Allow-list:

- 2024-08-29 Sterling, VA outbreak (Reese: "the best storm I've ever seen,
  independent adjusters from out of town")

Anything not on the allow-list runs under the standard 2.5" cap. Add to the
list only on team approval (escalate to Ahmed).

### Reference TypeScript

Drop this in `server/services/displayCapService.ts` (new file):

```ts
// server/services/displayCapService.ts

export interface VerificationContext {
  /** ≥3 ground reports, ≥1 government-backed, within tight proximity */
  isVerified: boolean;
  /** lat/lng exact match (≤0.5 mi); only true for the at-property band */
  isAtLocation: boolean;
  /** storm is on the Sterling-class allow-list */
  isSterlingClass: boolean;
}

export function displayHailInches(
  rawMaxInches: number,
  v: VerificationContext,
): number | null {
  if (rawMaxInches <= 0 || rawMaxInches < 0.4) return null;
  if (rawMaxInches < 0.75) return 0.75;
  if (rawMaxInches <= 2.0) return roundToQuarter(rawMaxInches);

  if (rawMaxInches <= 2.5) {
    return v.isVerified && v.isAtLocation ? roundToQuarter(rawMaxInches) : 2.0;
  }

  if (
    rawMaxInches <= 3.0 &&
    v.isSterlingClass &&
    v.isVerified &&
    v.isAtLocation
  ) {
    return Math.min(roundToQuarter(rawMaxInches), 3.0);
  }

  // outlier branch — Ahmed's override of the meeting's "1 inch" position:
  // verified → 2.5, unverified → 2.0
  return v.isVerified ? 2.5 : 2.0;
}

function roundToQuarter(x: number): number {
  return Math.round(x * 4) / 4;
}

// --- Sterling-class allow-list ---

interface SterlingClassStorm {
  date: string; // YYYY-MM-DD
  label: string;
  centerLat: number;
  centerLng: number;
  radiusMi: number;
}

export const STERLING_CLASS_STORMS: SterlingClassStorm[] = [
  {
    date: "2024-08-29",
    label: "Sterling VA hail outbreak",
    centerLat: 39.0067,
    centerLng: -77.4291,
    radiusMi: 15,
  },
];

export function isSterlingClass(
  stormDate: string,
  lat: number,
  lng: number,
): boolean {
  return STERLING_CLASS_STORMS.some((s) => {
    if (s.date !== stormDate.slice(0, 10)) return false;
    return haversineMiles(lat, lng, s.centerLat, s.centerLng) <= s.radiusMi;
  });
}

function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

Companion verification builder. This should live next to the multi-source
agreement logic — likely a new helper in `stormDataService.ts` or
`stormImpactService.ts`:

```ts
import {
  displayHailInches,
  isSterlingClass,
  type VerificationContext,
} from "./displayCapService.js";

interface SpotterReport {
  source:
    | "nws-lsr"
    | "ncei-storm-events"
    | "mping"
    | "hailtrace-verified"
    | "mrms";
  lat: number;
  lng: number;
  inches: number;
  date: string; // YYYY-MM-DD
}

export function buildVerification(
  reports: SpotterReport[],
  queryLat: number,
  queryLng: number,
  stormDate: string,
): VerificationContext {
  const distMi = (r: SpotterReport) =>
    haversineMiles(queryLat, queryLng, r.lat, r.lng);

  const atLocationReports = reports.filter((r) => distMi(r) <= 0.5);
  const govReports = atLocationReports.filter(
    (r) => r.source === "nws-lsr" || r.source === "ncei-storm-events",
  );

  return {
    isVerified: atLocationReports.length >= 3 && govReports.length >= 1,
    isAtLocation: atLocationReports.length > 0,
    isSterlingClass: isSterlingClass(stormDate, queryLat, queryLng),
  };
}
```

---

## Where to wire it in

These are the call sites. Every adjuster-facing one must call
`displayHailInches()` instead of returning the raw max. Internal-only
surfaces stay raw.

### Server side — adjuster-facing (cap REQUIRED)

| File | What to change |
|------|----------------|
| `server/services/pdfReportServiceV2.ts` | Headline "At Property" cell on page 1 = display value. Sources detail section can keep raw values for transparency. |
| `server/services/verifiedEventsPdfAdapter.ts` | Adapter that feeds the PDF — make sure the verified events list is wrapped through the cap before render. |
| `server/services/narrativeService.ts` | When producing human-readable narrative ("3-inch hail at property on July 16"), use display value, not raw. |
| `server/services/repReportService.ts` | Rep storm-impact reports that go to adjusters or homeowners — display value. Add an internal flag to opt out for rep-internal-only reports. |
| `server/services/stormImpactService.ts` | The aggregate storm impact for a property — adjuster-facing API consumers get display values. Internal endpoints can opt-in to raw. |

### Server side — internal only (NO cap)

Leave these alone. They serve canvassing reps who need real numbers:

- `server/services/liveMrmsAlertService.ts` — keeps raw, tiered messaging
  (0.25–0.5"=heads-up, 0.5–1.0"=alert, 1.0+"=severe)
- `server/services/liveMrmsService.ts`
- `server/services/liveNwsWarningAlertService.ts`
- `server/services/mrmsTerritoryWatcher.ts`
- `server/services/nwsTerritoryWatcher.ts`
- `server/services/stormAlertService.ts`
- `server/services/stormDaysService.ts`
- `server/services/historicalMrmsService.ts` — raw archive
- `server/services/hailtraceImportService.ts` — preserves source truth
- `server/services/hailtraceValidationService.ts` — preserves source truth
- `server/services/stormMemoryService.ts` — full-fidelity storage

### UI side

| Component | Behavior |
|-----------|----------|
| `components/PropertyImpactPanel.tsx` | Adjuster-facing → display values |
| `components/HailSwathLayer.tsx` | Map labels — when in "report mode" use display values; when in "canvass mode" use raw |
| `components/HailContourLayer.tsx` | Same — context-dependent |
| `components/MRMSSwathPolygonLayer.tsx` | Internal canvass tool — raw |
| `components/MRMSHailOverlay.tsx` | Internal — raw |
| `components/HailtraceValidationLayer.tsx` | Internal validation — raw |
| `components/ImpactedAssetsPanel.tsx` | Adjuster-facing → display values |
| `components/TerritoryHailMap.tsx` | Internal canvass tool — raw |
| `components/CheckInMap.tsx` | Internal — raw |

If the same component is rendered in both contexts, take a `displayMode:
"adjuster" | "canvass"` prop and branch the value selection.

Search hint:
```bash
rg -n "max_hail|maxHail|max_inch|maxHailInches|hailSize|hail_size" \
  server/ components/ --type ts --type tsx
```

---

## UI / report layout changes (locked from meeting)

The team consensus on PDF layout (Russ + Reese + Ahmed):

1. **At-location panel moves to top of page 1.** Adjuster reads the verdict
   without scrolling.
2. **Three distance columns** stay: At Property | 1–3 mi | 3–5 mi.
   No new "comparison" columns showing Hail Trace / Hail Recon side by side.
   Final tiebreaker on this still going to Oliver (former field) — for now,
   don't build it.
3. **Sources section** (NWS, SPC, mPing, NCEI, MRMS, CoCoRaHS) stays, but
   moves below the at-location summary. This is the "trust me, look it up"
   transparency layer.
4. **Disclaimer goes to the bottom of page 1**, not interspersed.
5. **Date range selector**: 1y / 2y / 3y / 5y, default 3y.
6. **Header**: address text + satellite/aerial image (Hail Trace's styling
   was cited as the reference).

The PDF layout work touches `pdfReportServiceV2.ts` and any HTML/CSS
templates under `server/templates/` (if you store them there — verify).

---

## Test cases (build them, run them, ship them)

```ts
// server/services/__tests__/displayCap.spec.ts

import {
  displayHailInches,
  type VerificationContext,
} from "../displayCapService";

const verified: VerificationContext = {
  isVerified: true,
  isAtLocation: true,
  isSterlingClass: false,
};
const unverified: VerificationContext = {
  isVerified: false,
  isAtLocation: true,
  isSterlingClass: false,
};
const sterling: VerificationContext = {
  isVerified: true,
  isAtLocation: true,
  isSterlingClass: true,
};

describe("displayHailInches", () => {
  it("0.5 → 0.75 floor", () =>
    expect(displayHailInches(0.5, verified)).toBe(0.75));

  it("0.33 → 0.75 floor", () =>
    expect(displayHailInches(0.33, verified)).toBe(0.75));

  it("0.2 → null (suppress)", () =>
    expect(displayHailInches(0.2, verified)).toBeNull());

  it("1.25 → 1.25 (in-band)", () =>
    expect(displayHailInches(1.25, verified)).toBe(1.25));

  it("1.5 unverified → 1.5 (in-band)", () =>
    expect(displayHailInches(1.5, unverified)).toBe(1.5));

  it("2.3 verified → 2.25 (rounded)", () =>
    expect(displayHailInches(2.3, verified)).toBe(2.25));

  it("2.3 unverified → 2.0", () =>
    expect(displayHailInches(2.3, unverified)).toBe(2.0));

  // The 17032 Silver Charm Place, Leesburg case — raw 4" "at location"
  // Per Ahmed's override: 4 verified → 2.5, 4 unverified → 2.0.
  it("4.0 verified at non-Sterling location → 2.5", () =>
    expect(displayHailInches(4.0, verified)).toBe(2.5));

  it("4.0 unverified → 2.0", () =>
    expect(displayHailInches(4.0, unverified)).toBe(2.0));

  // Sterling-class exception (2024-08-29 outbreak)
  it("2.75 verified Sterling-class → 2.75", () =>
    expect(displayHailInches(2.75, sterling)).toBe(2.75));

  it("3.5 verified Sterling-class → 3.0 hard cap", () =>
    expect(displayHailInches(3.5, sterling)).toBe(3.0));

  // The 2.7" Leesburg case — verified spotters but NOT Sterling-class
  it("2.7 verified non-Sterling → 2.5", () =>
    expect(displayHailInches(2.7, verified)).toBe(2.5));
});
```

End-to-end smoke tests:

- Generate a PDF for **17032 Silver Charm Place, Leesburg, VA** for
  **2025-07-16** → confirm at-property cell reads ≤ 2.5", not 4".
- Generate a PDF for the same address for **2024-08-29** → confirm
  Sterling-class exception activates and shows real value (2.5"–2.75").
- Generate a PDF for a non-event date → at-property suppressed (null/blank),
  no false hail size.
- **Critically**: trigger a live MRMS alert with a 4" cell → confirm Sales
  Team / GroupMe alert shows the **raw 4" value** (NOT capped). Reps need
  truth for canvassing.

---

## At-location radius bug — separate fix needed

Independent of the cap, the at-property column is currently pulling values
from a 15-mile radius search, not from at-location. This is a real bug.

Wherever the at-property pull happens (likely `stormImpactService.ts` or
`stormDataService.ts` — search for `15` near hail/distance code), tighten
to ≤ 0.5 mi for the at-property column. The 1–3 mi and 3–5 mi columns can
keep using the existing band logic.

```bash
rg -n "15.*mile|radiusMiles\s*[:=]\s*15|distance.*15" server/services/
```

---

## Sister-app sync — Hail Yes alignment

Hail Yes (`/Users/a21/Desktop/storm-maps/`) is implementing the same
algorithm in parallel. To keep both apps in lockstep:

- Treat `displayCapService.ts` as a portable module — no
  sa21/gemini-specific imports. Should be byte-identical to Hail Yes's
  `server/storm/displayCapService.ts` modulo file path.
- Sterling-class allow-list should ultimately live in shared config. For
  now, duplicate it; harmonize later when both apps ship.
- When you ship this in sa21, drop a one-line note in the commit body
  pointing at the Hail Yes equivalent path so the other session can
  cross-check.
- If you find a bug in the cap algorithm, fix it in BOTH places same day,
  same logic. Do not allow drift.

Ahmed has not yet decided whether sa21's storm-map gets retired in favor of
Hail Yes (Russ saw Hail Yes today for the first time and liked it). Until
that decision: both apps maintain feature parity for adjuster-facing
reports.

---

## Open items (NOT for this handoff session — escalate to Ahmed)

1. **Comparison columns** (gov-backed / Hail Trace / Hail Recon side by
   side): Reese against, Russ leaning against. Final tiebreaker pending
   Oliver. Don't build.
2. **Susan vs Hail Yes consolidation**: TBD. Don't make schema or
   API-shape decisions that would block merging or replacing.
3. **At-property null inconsistency**: Russ noticed during the demo that
   some addresses show no at-property value but show data in the wider
   bands. Could be the 15-mi leak hiding the truth, or a coord-resolution
   mismatch, or genuine no-data. Investigate after cap ships.
4. **Susan downloadable app**: scrapped. Going link-only, on homepage as
   saved bookmark. Doesn't affect this handoff but worth knowing.
5. **Live alert flip from approval-gate to live**: per the latest sa21
   memory note (`sa21-session-apr25.md`), `LIVE_MRMS_ALERT_ENABLED` is
   currently `approval-gate`. Don't flip it to `true` as part of this
   work. That's a separate decision.

---

## Definition of done

- [ ] `server/services/displayCapService.ts` exists with the algorithm above
- [ ] `buildVerification()` helper added wherever multi-source agreement
      already lives (likely `stormDataService.ts` or `stormImpactService.ts`)
- [ ] `pdfReportServiceV2.ts` page 1 "At Property" column = display value
- [ ] `verifiedEventsPdfAdapter.ts` wraps verified events through cap
- [ ] `narrativeService.ts` uses display values
- [ ] `repReportService.ts` uses display values for adjuster/homeowner
      output, raw for rep-internal output (with explicit flag)
- [ ] `stormImpactService.ts` API responses include both `displayInches`
      and `rawInches`; default consumers see `displayInches`
- [ ] Adjuster-facing UI components show display values; canvass-only
      components stay raw (per the table above)
- [ ] At-location query tightened from 15-mi to ≤ 0.5-mi for the
      at-property column
- [ ] Test suite passes
- [ ] Manual: 17032 Silver Charm Place, 2025-07-16 → ≤ 2.5", not 4"
- [ ] Manual: 17032 Silver Charm Place, 2024-08-29 → Sterling-class
      activates correctly
- [ ] Manual: live MRMS alert for a high-value cell still shows raw value
      to reps (NOT capped)
- [ ] PDF layout: at-location panel at top, distance bands below, sources
      below that, disclaimer at bottom
- [ ] Date range selector live: 1y / 2y / 3y / 5y, default 3y
- [ ] Commit body links to the Hail Yes equivalent commit so the other
      session can mirror

---

## Files quick map

```
sa21 = /Users/a21/gemini-field-assistant
github: https://github.com/Roof-ER21/gemini-field-assistant
runtime: Vite + Express + Drizzle + Postgres on Railway
```

| Concern | File |
|---------|------|
| **NEW: cap algorithm** | `server/services/displayCapService.ts` |
| Multi-source agreement / verification builder | `server/services/stormDataService.ts` (extend) |
| PDF report (adjuster) | `server/services/pdfReportServiceV2.ts` |
| Verified events → PDF | `server/services/verifiedEventsPdfAdapter.ts` |
| Narrative composer | `server/services/narrativeService.ts` |
| Rep storm-impact reports | `server/services/repReportService.ts` |
| Property impact (API) | `server/services/stormImpactService.ts` |
| Hail map data (API) | `server/services/hailMapsService.ts` |
| **Live alerts (DO NOT cap)** | `server/services/liveMrmsAlertService.ts` |
| **Internal canvass map (DO NOT cap)** | `server/services/historicalMrmsService.ts` |
| Adjuster UI panel | `components/PropertyImpactPanel.tsx` |
| Adjuster impact panel | `components/ImpactedAssetsPanel.tsx` |
| Map labels (context-dependent) | `components/HailSwathLayer.tsx`, `HailContourLayer.tsx` |
| **Internal territory map** | `components/TerritoryHailMap.tsx` |

---

## Reference: source quotes from this morning

If you want the source-of-truth quotes:

- `~/Blackbox/transcripts/2026-04-27_10-40-17.txt` — Ahmed's demo opener,
  Reese surfaces the 4-inch problem
- `~/Blackbox/transcripts/2026-04-27_10-50-36.txt` — UI layout demands
- `~/Blackbox/transcripts/2026-04-27_11-00-52.txt` — algorithm philosophy
  ("government verified vs. their algorithm")
- `~/Blackbox/transcripts/2026-04-27_11-11-09.txt` — Gemini/ChatGPT
  excerpt ("radar 2-inch but melted to 0.5 before hitting roof")
- `~/Blackbox/transcripts/2026-04-27_11-21-23.txt` — Reese: "I'd rather
  say one inch — they can't argue one inch" (the position Ahmed
  overrode to 2/2.5)
- `~/Blackbox/transcripts/2026-04-27_11-31-44.txt` — Russ joins,
  "We can't take 4-inch and present it 'at location.' We cannot."
- `~/Blackbox/transcripts/2026-04-27_11-42-04.txt` — final cap rules
  locked in; Hail Yes app revealed to Russ
- `/tmp/whisper-out/post-meeting.txt` — Russ closes positive: "give me
  the demo when ready, growing pains, we'll get there"

End of handoff.
