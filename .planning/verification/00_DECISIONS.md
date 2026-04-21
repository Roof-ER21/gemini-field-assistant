# Phase 0 — Decisions & Foundation

**Date**: 2026-04-21
**Owner**: ahmed.mahmoud@theroofdocs.com
**Status**: DRAFT — awaiting HailTrace recon + sign-off

## Goal

Make Gemini Field Assistant's storm reports **multi-source verifiable** so they carry more weight with adjusters than any single-source competitor product (HailTrace legal-grade, IHM field-grade). The verification mechanism itself is our differentiator: "confirmed by N independent sources" is stronger than "confirmed by us."

## Decision 1 — Primary Strategy

**Chosen: Path D — 5 free federal/crowdsourced sources as the core verification story**

Sources:
1. NOAA NCEI SWDI (federal, verified, 3-14d lag) — already ingested
2. MRMS radar grid (federal, ~30m latency) — already ingested
3. NWS severe alerts (federal, 15m poll) — already ingested
4. CoCoRaHS observer network (NSF/CSU, ~24h) — **NOT YET INGESTED → Phase 1**
5. Rep self-reports (proprietary, real-time) — **NOT YET BUILT → Phase 4**

Why:
- Zero per-seat cost vs HailTrace $600-1200/user/yr, IHM $400-1200/user/yr
- No ToS/licensing risk
- Independently reproducible by adjusters (stronger legal narrative)
- CoCoRaHS caught the 4/20 Vienna storm that HailTrace + SPC + MRMS + NWS + IEM LSR all missed

HailTrace and IHM data stay as **optional bonus tiers** (Phase 6) — used if we subscribe but never load-bearing.

## Decision 2 — Unified Schema

One canonical table: `verified_hail_events`. All sources write to it via upsert. Source-specific tables remain for audit trail but are no longer read-path primary.

Key fields:
- `event_date DATE` — ET normalized
- `latitude, longitude DECIMAL(10,7)` — GPS precision preserved
- `hail_size_inches DECIMAL(4,2)` — max across sources (with override for NOAA verified)
- `wind_mph INTEGER` — max across sources
- `source_<name> BOOLEAN` flags for each of 7 sources (including optional HT+IHM)
- `verification_count INTEGER GENERATED` — auto-computed from source flags
- `confidence_tier TEXT GENERATED` — quadruple/triple/cross-verified/single-source
- `source_details JSONB` — raw per-source data for audit trail

## Decision 3 — Dedup Rule

**Bucket**: `(event_date, ROUND(latitude, 3), ROUND(longitude, 3))`

- 3 decimal places ≈ **110m grid cell**
- Tight enough to keep separate storms separate
- Loose enough to unify MRMS 1km pixel centroid + CoCoRaHS GPS point + NOAA town-level report when they describe the same storm

Enforced via `UNIQUE` constraint at DB level → physically impossible to duplicate.

## Decision 4 — Size Aggregation Within a Bucket

When multiple sources report different hail sizes at same bucket:

| Rule | Rationale |
|---|---|
| **NOAA > CoCoRaHS > HailTrace met > Rep self-report > MRMS > IHM > HailTrace algo** | Priority by verification rigor |
| `hail_size_inches` = MAX(verified, observed) | Never under-report |
| But store each source's value in `source_details.{source}.hail_size` | Preserve audit trail |

Never silently downgrade a NOAA 2" event because MRMS only saw 1" at the same point.

## Decision 5 — Confidence Tier Formula

```
verification_count = source_mrms + source_noaa + source_nws +
                     source_cocorahs + source_rep_report +
                     source_hailtrace + source_ihm

tier:
  4+  → "quadruple-verified"   (dark green, max legal weight)
  3   → "triple-verified"       (green)
  2   → "cross-verified"        (yellow-green)
  1   → "single-source"         (gray, informational — NEVER RED)
```

**Gray not red**: a single-source event is still legitimate — MRMS alone is federal radar data. We don't punish thin confirmation; we reward triangulation.

## Decision 6 — Rollout Strategy

- **Dual-write for 7 days** during Phase 2 before flipping read-path to unified table
- **Feature flags** on every behavior change:
  - `COCORAHS_INGEST_ENABLED` (Phase 1)
  - `USE_VERIFIED_EVENTS_TABLE` (Phase 2)
  - `PDF_VERIFICATION_BADGE` (Phase 3)
  - `REP_REPORTS_ENABLED` (Phase 4)
- **Legacy tables never dropped** until Phase 5 audit passes
- **Per-rep rollout** for PDF changes before global

## 10 Edge Cases (must all pass verification in Phase 1-5)

| # | Scenario | Expected |
|---|---|---|
| 1 | Same storm, 2 observations 200m apart | 2 records (different buckets) |
| 2 | Same storm, 2 observations 50m apart | 1 record, both source flags true |
| 3 | Cross-midnight storm (report at 11:58pm ET, next report at 12:03am ET) | 2 records (different dates) — correct, different event_dates |
| 4 | Same lat/lng, storms 6 months apart | 2 records (different dates) |
| 5 | MRMS 0.09" + CoCoRaHS 0.10" at same point | 1 record, size=0.10, 2 sources |
| 6 | NOAA verified 2" + MRMS pixel 1" at same point | 1 record, size=2.00 (NOAA priority), 2 sources |
| 7 | Rep self-report submitted but not admin-approved | stored but `rep_report_verified_by_admin=false`, does NOT increment `verification_count` |
| 8 | Same rep submits identical report twice within 10min | 1 record, 2nd request returns "already reported" |
| 9 | CoCoRaHS report lat/lng outside US bounds | rejected, not inserted |
| 10 | MRMS backfill runs twice for same date | Idempotent — no duplicates, counts identical |

## Non-Goals

- NOT building our own meteorologist review (would require hiring + licensing)
- NOT scraping HailTrace or IHM (ToS risk)
- NOT replacing NOAA as claims-grade source — it remains the gold standard
- NOT dropping legacy tables (30+ day grace period always)

## Open Questions (need HailTrace recon to answer)

1. Does HailTrace offer a bulk-export API with your admin account? → determines Phase 6 scope
2. What format do their meteorologist points come in (JSON? GeoJSON? CSV)? → affects import service
3. Are there rate limits on their exports? → affects ingest cadence
4. Does their PDF report format have a field/layout we should mirror for adjuster familiarity? → affects Phase 3 PDF design

## Go/No-Go Gate to Phase 1

☐ User signs off on schema + dedup rules (this doc)
☐ HailTrace recon completed (Option 1 when user returns)
☐ Open questions above answered or explicitly deferred
☐ Migration 070 draft reviewed

Once all ✅, Phase 1 (CoCoRaHS ingest) begins.
