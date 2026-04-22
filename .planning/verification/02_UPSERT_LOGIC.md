# Phase 0 — Upsert Logic Specification

How each source writes to `verified_hail_events`. All sources use the same pattern.

## The Upsert Pattern (pseudocode)

```typescript
async function upsertVerifiedEvent(params: {
  eventDate: Date;           // ET normalized
  latitude: number;
  longitude: number;
  hailSizeInches: number | null;
  windMph: number | null;
  source: 'noaa' | 'cocorahs' | 'mrms' | 'nws' | 'rep_report' | 'hailtrace' | 'ihm';
  sourcePayload: object;     // raw data for audit trail
  repReportPhotoUrl?: string;
  repReportPreApproved?: boolean;  // rep reports default false (admin must verify)
}): Promise<{ inserted: boolean; verificationCount: number; tier: string }> {

  const sourceFlag = `source_${params.source}`;
  const sourceDetailsKey = params.source;

  // Priority for size/wind override
  const sourcePriority: Record<string, number> = {
    noaa: 1,      // highest
    cocorahs: 2,
    hailtrace: 3, // (meteorologist)
    rep_report: 4,
    mrms: 5,
    ihm: 6,
    nws: 7
  };

  const query = `
    INSERT INTO verified_hail_events (
      event_date, latitude, longitude,
      hail_size_inches, wind_mph,
      ${sourceFlag},
      source_details,
      rep_report_verified_by_admin,
      rep_report_photo_url
    )
    VALUES ($1, $2, $3, $4, $5, TRUE, $6::jsonb, $7, $8)
    ON CONFLICT (event_date, lat_bucket, lng_bucket) DO UPDATE SET
      -- Flip the source flag to TRUE (never back to false)
      ${sourceFlag} = TRUE,

      -- Size/wind: take MAX unless NOAA is already source and we're a lower priority
      hail_size_inches = CASE
        WHEN verified_hail_events.source_noaa AND $9 > 1  -- existing has NOAA and we're lower priority
          THEN verified_hail_events.hail_size_inches     -- keep NOAA's value
        ELSE GREATEST(
          COALESCE(verified_hail_events.hail_size_inches, 0),
          COALESCE(EXCLUDED.hail_size_inches, 0)
        )
      END,
      wind_mph = GREATEST(
        COALESCE(verified_hail_events.wind_mph, 0),
        COALESCE(EXCLUDED.wind_mph, 0)
      ),

      -- Merge source_details (preserve all source payloads)
      source_details = verified_hail_events.source_details || $6::jsonb,

      -- Rep report fields only updated if this upsert IS the rep report
      rep_report_verified_by_admin = CASE
        WHEN $7 IS NOT NULL THEN $7
        ELSE verified_hail_events.rep_report_verified_by_admin
      END,
      rep_report_photo_url = COALESCE(EXCLUDED.rep_report_photo_url, verified_hail_events.rep_report_photo_url),

      last_updated_at = NOW()
    RETURNING id, verification_count, confidence_tier,
              (xmax = 0) AS was_inserted;
  `;

  const result = await pool.query(query, [
    params.eventDate,
    params.latitude,
    params.longitude,
    params.hailSizeInches,
    params.windMph,
    JSON.stringify({ [sourceDetailsKey]: params.sourcePayload }),
    params.source === 'rep_report' ? (params.repReportPreApproved ?? false) : null,
    params.repReportPhotoUrl ?? null,
    sourcePriority[params.source]
  ]);

  return {
    inserted: result.rows[0].was_inserted,
    verificationCount: result.rows[0].verification_count,
    tier: result.rows[0].confidence_tier
  };
}
```

## Why `ON CONFLICT DO UPDATE`

- **Atomic** — no race condition between SELECT and INSERT
- **Idempotent** — running the same source ingest twice produces identical result
- **Preserves source flags** — existing true flags never get flipped to false
- **Accumulative** — `source_details` JSONB merges via `||` operator

## The `$9` Priority Parameter

Handles Edge Case #6 (NOAA 2" + MRMS 1" at same point). When a lower-priority source (MRMS, priority=5) tries to write to a bucket already verified by NOAA (priority=1), the SQL keeps NOAA's higher size and still flips `source_mrms=true` so the verification count increments but the reported size stays correct.

## Rep Report Special Handling

Rep self-reports default to `rep_report_verified_by_admin=false`. The `verification_count` generated column does NOT subtract for this — the rep's `source_rep_report=true` flag DOES increment the count regardless.

**Problem**: that lets unverified rep reports inflate the tier.

**Solution**: don't expose rep reports through `/hail/search` or PDFs until admin-approved. Handle at query layer, not DB layer. Two views:
- `verified_hail_events` (raw, includes unverified rep reports) — used for admin moderation UI
- `verified_hail_events_public` (filtered, only admin-approved rep reports contribute) — used by `/hail/search` + PDFs

```sql
CREATE VIEW verified_hail_events_public AS
SELECT
    id, event_date, latitude, longitude, hail_size_inches, wind_mph,
    source_noaa, source_cocorahs, source_mrms, source_nws,
    source_hailtrace, source_ihm,
    -- Rep reports only count when admin-verified
    (source_rep_report AND rep_report_verified_by_admin = TRUE) AS source_rep_report,
    -- Recompute count and tier using filtered flags
    (
        source_noaa::int + source_cocorahs::int + source_mrms::int +
        source_nws::int + source_hailtrace::int + source_ihm::int +
        (source_rep_report AND rep_report_verified_by_admin = TRUE)::int
    ) AS verification_count,
    source_details
FROM verified_hail_events
WHERE source_rep_report = FALSE  -- non-rep-report events always shown
   OR rep_report_verified_by_admin = TRUE;  -- OR rep report is approved
```

Wait — that's wrong. Events with rep_report=true AND other sources=true should still appear, just without the rep count.

**Corrected view:**

```sql
CREATE VIEW verified_hail_events_public AS
SELECT
    id, event_date, latitude, longitude, hail_size_inches, wind_mph,
    source_noaa, source_cocorahs, source_mrms, source_nws,
    source_hailtrace, source_ihm,
    (source_rep_report AND rep_report_verified_by_admin = TRUE) AS source_rep_report_counted,
    (
        source_noaa::int + source_cocorahs::int + source_mrms::int +
        source_nws::int + source_hailtrace::int + source_ihm::int +
        (source_rep_report AND rep_report_verified_by_admin = TRUE)::int
    ) AS public_verification_count,
    source_details
FROM verified_hail_events
WHERE
    -- Show event if at least one non-rep source is true,
    -- OR rep report is admin-verified
    source_noaa OR source_cocorahs OR source_mrms OR
    source_nws OR source_hailtrace OR source_ihm OR
    (source_rep_report AND rep_report_verified_by_admin = TRUE);
```

This way:
- Edge case 7 passes (unverified rep report stored but doesn't inflate public count)
- Rep-only unverified events hidden from public queries
- Rep-verified events count normally

## Testing Harness (Phase 5 validation)

Test every edge case with a single script:

```typescript
// scripts/test-upsert-logic.ts
const tests = [
  {
    name: 'Edge case 2: same storm 50m apart',
    steps: [
      { source: 'mrms', lat: 38.94747, lng: -77.26375, date: '2026-04-20', hail: 0.09 },
      { source: 'cocorahs', lat: 38.94748, lng: -77.26376, date: '2026-04-20', hail: 0.10 }
    ],
    expect: { rows: 1, verification_count: 2, hail_size: 0.10 }
  },
  {
    name: 'Edge case 6: NOAA priority over MRMS',
    steps: [
      { source: 'mrms', lat: 39.0, lng: -77.0, date: '2025-06-01', hail: 1.0 },
      { source: 'noaa', lat: 39.0, lng: -77.0, date: '2025-06-01', hail: 2.0 }
    ],
    expect: { rows: 1, verification_count: 2, hail_size: 2.0 }
  },
  // ... all 10 edge cases
];
```

Runs against a scratch schema, asserts every expected outcome, fails loudly if any drift.
