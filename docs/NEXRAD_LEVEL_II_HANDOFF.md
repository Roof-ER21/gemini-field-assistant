# NEXRAD Level II Processing — Claude Code Briefing

## 🤖 STARTING THIS SESSION

Run in auto mode. Working directory: `/Users/a21/gemini-field-assistant/`. Read this whole file once before writing any code. Your paired session is executing mPING / NWS alerts / NEXRAD Level III in the main app right now — stay out of those files, they're being actively modified.

**Your first 5 actions in order:**

1. Read this file completely.
2. `git pull origin main` in `/Users/a21/gemini-field-assistant/` to sync latest from the paired session.
3. Inspect the existing Node patterns you'll integrate with (do not modify):
   - `server/services/cocorahsLiveService.ts` — the ingest service pattern
   - `server/services/verifiedEventsService.ts` — the upsert API you'll call
   - `server/routes/hailRoutes.ts` — grep for `admin/cocorahs-backfill` to see the auth/routing pattern
   - `database/migrations/` — latest migration number determines yours
4. Set up the new Python repo at `/Users/a21/gemini-nexrad-l2-worker/` (separate from the Node app — this is a microservice).
5. Start on the implementation sequence below. Commit incrementally. Deploy only after regression tests pass.

**When you're done, append a `## Completed` section to this file documenting what shipped + results. That's the signal to Ahmed the work is live.**

**Do NOT modify files in `/Users/a21/gemini-field-assistant/` except:**
- Add `database/migrations/075_add_source_nexrad_l2.sql`
- Add one route `/api/hail/admin/nexrad-l2-ingest` in `server/routes/hailRoutes.ts`
- Add `'nexrad_l2'` to the `SourceName` union in `server/services/verifiedEventsService.ts`
- That's it. Worker lives in its own repo.

---

## Who you are, what you're doing

You're building a Python microservice that ingests raw NEXRAD Level II volume scans from AWS, computes MESH (Maximum Expected Size of Hail) per grid cell, and posts derived hail events to the existing Node app's ingest endpoint. The Node app already owns `verified_hail_events` + the map UI + Susan chat bot — all of that has been built. You're extending the data layer so our coverage matches HailTrace's "Canopy Weather" proprietary algorithm.

## Current state — read this before you touch anything

**Node app:** `/Users/a21/gemini-field-assistant/` on main branch.
**Deploy target:** Railway, project "The S21", service "Susan 21", auto-deploys on `git push origin main`.
**DB:** Railway Postgres, conn string `postgresql://postgres:RNNiLPPQGUpCGIGIESYjlNQqGajUCPhb@hopper.proxy.rlwy.net:15533/railway`.

**What exists you'll integrate with:**
- `verified_hail_events` table with `source_*` boolean columns. You'll add `source_nexrad_l2`.
- `verifiedEventsService.ts` with `upsertBatch()` method — dedupes by date+lat_bucket+lng_bucket, ORs in source flags, takes GREATEST of hail_size_inches. Reuse this via a new ingest endpoint.
- `mrms_swath_cache` table stores per-date polygon collections. Your output goes into `verified_hail_events` (point events), NOT into this swath table.
- `addressImpactService.ts` already reads `verified_hail_events_public_sane` view → the moment you upsert rows with `source_nexrad_l2=TRUE`, the map + Susan + PDF light up automatically.
- There's an existing MRMS ingest at `server/services/historicalMrmsService.ts` — same data family, coarser resolution, pre-baked by NOAA. Don't duplicate it; your work produces FRESHER, HIGHER-RES hail estimates per-scan.

**What you're NOT touching:**
- The map UI, Susan, the PDF generator — all downstream consumers, already wired.
- Existing schedulers in `server/services/susanScheduledPosts.ts`.

## Architecture

Two pieces:

### Piece 1: Python worker (new repo)

Create at `/Users/a21/gemini-nexrad-l2-worker/`. New git repo, separate deploy.

```
gemini-nexrad-l2-worker/
├── pyproject.toml          # uv or poetry
├── Dockerfile
├── railway.toml            # deploy config
├── .env.example
├── README.md
├── src/
│   ├── main.py             # entrypoint, cron-style loop
│   ├── aws.py              # S3 listing + download
│   ├── parse.py            # py-art file parsing
│   ├── freezing_level.py   # GFS / NWS Rapid Refresh fetch
│   ├── mesh.py             # MESH algorithm
│   ├── grid.py             # sweep → lat/lng grid interpolation
│   ├── publish.py          # HTTPS POST to Node ingest endpoint
│   └── ledger.py           # local SQLite to track processed scans
├── tests/
│   ├── regression_storms.json
│   ├── test_mesh.py
│   └── test_regression.py
```

**Radars to cover (DMV + adjacent):**
- KLWX — Sterling, VA (primary)
- KDOX — Dover, DE
- KCCX — State College, PA
- KPBZ — Pittsburgh, PA
- KAKQ — Wakefield, VA
- KRLX — Charleston, WV

**Pipeline per scan:**

1. `aws.list_new_files(site, since_ts)` — use `boto3` against `s3://unidata-nexrad-level2/`. File path pattern: `{year}/{mm}/{dd}/{site}/{site}{YYYYMMDD_HHMMSS}_V06.gz`. Free S3 listing when running in us-east region.
2. Skip if already in local `ledger.db` (SQLite, key = s3_key).
3. `aws.download(key)` → local temp file.
4. `parse.load_level2(path)` → py-art Radar object.
5. `freezing_level.get(scan_time, lat, lng)` → meters. Source: NOAA NOMADS GFS 0.25° hourly analysis. Cache per-hour.
6. `mesh.compute(radar, freezing_m)` → 2-D numpy array of MESH (inches) at native sweep geometry.
7. `grid.interpolate(mesh_2d, radar.gate_lats, radar.gate_lons)` → values on a 0.01° lat/lng grid centered on the radar site (bbox ~2° square).
8. `publish.post_events(events)` — one array of `{date, lat, lng, hail_inches, scan_time, radar_site}` items for every grid cell ≥ 0.25".
9. Record in `ledger.db` on success.

**Scheduling:**
- Nightly catch-up at 04:00 UTC: list all scans from previous UTC day for each radar. Expect ~288 volume scans per radar per day. Cap per run to prevent runaway.
- Optional near-real-time: 10-min poll loop, only on days a DMV NWS active alert is up (see `nwsAlertsService` in Node app — you can query its ingested alerts table or just the upstream NWS API).

### Piece 2: Node ingest endpoint (add to existing app)

In `/Users/a21/gemini-field-assistant/server/routes/hailRoutes.ts`, add:

```ts
router.post('/admin/nexrad-l2-ingest', async (req, res) => {
  // HMAC auth: header 'x-ingest-token' must hmac-sha256 match body + secret
  // env var NEXRAD_L2_INGEST_SECRET — shared with worker.
  // Body: { scan_time, radar_site, events: [{date,lat,lng,hail_inches}] }
  // Call verifiedEventsService.upsertBatch with source='nexrad_l2'.
});
```

And a migration `database/migrations/075_add_source_nexrad_l2.sql`:

```sql
ALTER TABLE verified_hail_events ADD COLUMN source_nexrad_l2 BOOLEAN DEFAULT FALSE;
-- Update the public view + sane view to include the new source
CREATE OR REPLACE VIEW verified_hail_events_public AS ...;  -- copy existing + add source_nexrad_l2
CREATE OR REPLACE VIEW verified_hail_events_public_sane AS ...;
-- Update public_verification_count generated expression if present
```

Run it via: `psql "$RAILWAY_DB_URL" -f database/migrations/075_add_source_nexrad_l2.sql` (get URL from Railway dashboard or `railway variables`).

Add `SourceName` type in `server/services/verifiedEventsService.ts` to include `'nexrad_l2'`.

## The MESH algorithm — give this to Gemini Pro / o3 for a reference impl, don't hand-roll

```
MESH(mm) = 2.54 * SHI^0.5
SHI = 0.1 * integral(W_T(T(z)) * E(Z(z)) * dz)  from H0 to storm_top

W_T(T) = 0                         if T >= 0°C
       = (T - 0) / (-20 - 0)       if -20 <= T < 0
       = 1                         if T < -20°C

E(Z) = 0                                   if Z < 40 dBZ
     = (Z - 40) / (50 - 40)                if 40 <= Z < 50
     = 1                                    if Z >= 50
```

Reference implementations to CROSS-CHECK yours against:
- `wradlib.qual.beam_block_frac` (not MESH but adjacent)
- `pyart.retrieve.hydroclass_semisupervised` (hydrometeor class, not size)
- NSSL documentation: Witt et al. 1998 "An Enhanced Hail Detection Algorithm for the WSR-88D"
- CanonicaL Python MESH impl you can study: https://github.com/DaleARoberts/hail-mesh-algorithm

Do NOT use a neural-net approach in sprint 1. MESH is calibrated, accepted by NWS, auditable. ML comes later.

## Tests before you ship ANY rows to production

Put in `tests/regression_storms.json`:

```json
[
  {"storm_date": "2024-07-16", "lat": 39.145, "lng": -77.597, "expected_hail_in": [2.5, 3.5], "label": "Silver Charm Pl softball storm"},
  {"storm_date": "2023-06-16", "lat": 38.841, "lng": -77.449, "expected_hail_in": [1.0, 1.75], "label": "Cub Stream Dr direct hit"},
  {"storm_date": "2024-08-29", "lat": 38.751, "lng": -77.475, "expected_hail_in": [2.5, 3.75], "label": "Manassas biggest 24mo"},
  {"storm_date": "2025-05-16", "lat": 39.234, "lng": -77.514, "expected_hail_in": [0.5, 1.25], "label": "Lucketts moderate"},
  {"storm_date": "2026-04-07", "lat": 39.5, "lng": -77.0, "expected_hail_in": [2.5, 3.5], "label": "April 2026 MD/PA"}
  // add 15 more from DMV archive — use `SELECT event_date, latitude, longitude, hail_size_inches FROM verified_hail_events WHERE state IN ('VA','MD','PA','WV','DE','DC') AND hail_size_inches >= 2 AND event_date >= '2024-01-01' ORDER BY event_date, hail_size_inches DESC`
]
```

Test gates (must ALL pass before production ingest):
- ≥18 of 20 regression storms fall within expected_hail_in range
- 10 clear-sky DMV dates produce <5 MESH rows ≥0.5" (noise floor)
- MESH spatial pattern visually matches MRMS swath for 5 random storms
- Code coverage ≥80% on `mesh.py` and `grid.py`

## How to run it

**Local dev:**
```
cd /Users/a21/gemini-nexrad-l2-worker
uv sync  # or: poetry install
cp .env.example .env
# Fill in NEXRAD_L2_INGEST_SECRET, NODE_APP_URL, AWS_DEFAULT_REGION=us-east-1
uv run python src/main.py --once --date 2024-07-16 --site KLWX  # one-shot test
```

**Deploy to Railway as a worker:**
- New Railway service in same project ("The S21") — label "NEXRAD L2 Worker"
- Attach a volume for the ledger.db (~1GB)
- Env vars: `NEXRAD_L2_INGEST_SECRET`, `NODE_APP_URL=https://sa21.up.railway.app`, `AWS_REGION=us-east-1`
- No public port needed — it's a worker, not a web service

## Sequence of implementation — execute in this order

1. **Scaffold repo + Dockerfile + hello-world cron** (day 1 morning)
2. **AWS S3 lister + downloader** — validate you can list 2024-07-16 scans for KLWX and download one (day 1 afternoon)
3. **py-art parse + inspect a known scan** — print sweep count, reflectivity range, scan time (day 2 morning)
4. **Freezing level fetcher + cache** (day 2 afternoon)
5. **MESH algorithm + unit tests on synthetic storms** (day 3) — THIS IS THE HARD PART, take your time
6. **Grid interpolation** (day 4)
7. **Migration 075 + Node ingest endpoint + HMAC auth** (day 5 morning)
8. **Worker → Node HTTP POST plumbing** (day 5 afternoon)
9. **Regression tests against 20 known storms** (day 6-7) — iterate on MESH params until ≥18/20 pass
10. **Production deploy + initial backfill last 30 days** (day 8)

## When you're done, update this file

Append a "## Completed" section with:
- Production deploy date
- Link to the worker repo
- Results of the 20-storm regression suite (pass rate + mean absolute error)
- Notes on any MESH parameter tuning you did
- Any known edge cases / limitations

Then tell Ahmed it's live. He'll know what to do.

## Do not

- Don't rewrite existing Node code. The Node app is done.
- Don't skip the regression suite. A single false "direct hit" in a cornfield burns every rep's trust.
- Don't expand scope beyond DMV+ radars in sprint 1. Continental US is sprint 3.
- Don't store raw volume scans. Keep only computed MESH + the s3_key in the ledger.
- Don't use ML or neural nets. MESH first, then measure, then maybe ML.

## References

- AWS Open Data NEXRAD Level II: https://registry.opendata.aws/noaa-nexrad/
- py-art docs: https://arm-doe.github.io/pyart/
- NSSL MESH documentation: https://www.nssl.noaa.gov/education/svrwx101/hail/radar/
- Witt et al. 1998: https://journals.ametsoc.org/view/journals/wefo/13/2/1520-0434_1998_013_0286_aehdaf_2_0_co_2.xml
- NOAA NOMADS (freezing level source): https://nomads.ncep.noaa.gov/
- Existing Node ingest pattern — read `server/services/cocorahsLiveService.ts` for the pattern, `server/services/verifiedEventsService.ts` for the upsert

---

## Completed

**Status: Code shipped to disk. Not yet deployed. Not yet regression-validated. Not yet posting to production.**

**Date:** 2026-04-23

**Worker repo:** `/Users/a21/gemini-nexrad-l2-worker/` — new local git repo, 1 commit. Not yet pushed to GitHub or deployed to Railway.

### What ships in this PR (Node-side)

Three additions to `gemini-field-assistant/`, all non-destructive:

1. `database/migrations/075_add_source_nexrad_l2.sql`
   - Adds `source_nexrad_l2 BOOLEAN NOT NULL DEFAULT FALSE`
   - Drops + re-adds `at_least_one_source` CHECK constraint to include new column
   - Recreates `verified_hail_events_public` view to include `source_nexrad_l2`
   - Recreates `verified_hail_events_stats_by_source` view with NEXRAD L2 row
   - Adds partial index `verified_hail_events_nexrad_l2_idx`
   - Wrapped in BEGIN/COMMIT. Rollback SQL included inline.

2. `server/services/verifiedEventsService.ts`
   - `SourceName` union now includes `'nexrad_l2'`
   - `SOURCE_CONFIG` map: `{ track: 'algorithm', priority: 6 }` (same as MRMS — both radar-derived)

3. `server/routes/hailRoutes.ts`
   - New route `POST /api/hail/admin/nexrad-l2-ingest`
   - HMAC-SHA256 auth over `${timestamp}.${scan_time}.${radar_site}.${events.length}`
   - 5-minute replay window on `x-ingest-timestamp`
   - Body: `{ scan_time, radar_site, events: [{ date, lat, lng, hail_inches, state? }] }`
   - Max 100k events per POST, calls `VerifiedEventsService.upsertBatch` with `source='nexrad_l2'`
   - Positioned alongside existing `/admin/mping-backfill` etc.

TypeScript `tsc -p tsconfig.server.json --noEmit` passes clean.

### What ships in the worker repo (new)

```
gemini-nexrad-l2-worker/
├── pyproject.toml        — arm-pyart, boto3, xarray/cfgrib, click, tenacity
├── Dockerfile            — python:3.11-slim + libeccodes + libhdf5 + libnetcdf
├── railway.toml          — DOCKERFILE builder, no healthcheck (it's a worker)
├── .env.example          — NEXRAD_L2_INGEST_SECRET, NODE_APP_URL, NEXRAD_SITES, ...
├── README.md             — architecture, CLI, deploy steps, MESH formula
├── src/
│   ├── config.py         — env-backed Settings + RADAR_STATE / RADAR_COORDS
│   ├── aws.py            — unsigned boto3 client, list_scans_for_day, download
│   ├── parse.py          — py-art load_level2 wrapper → VolumeScan/Sweep
│   ├── freezing_level.py — NOMADS GFS 0.25° OPeNDAP ASCII fetcher + disk cache
│   ├── mesh.py           — Witt W_T/E_Z, SHI trapezoid integral, MESH grid
│   ├── grid.py           — polar → 0.01° lat/lng bilinear resample
│   ├── ledger.py         — SQLite (WAL) processed-scan tracker
│   ├── publish.py        — HMAC-signed POST to /admin/nexrad-l2-ingest
│   └── main.py           — click CLI: once / backfill / run / stats
└── tests/
    ├── test_mesh.py              — 21 cases (Witt weights + synthetic volume)
    ├── test_grid.py              — 7 cases (polar → lat/lng + bilinear)
    ├── test_ledger.py            — 3 cases (SQLite round-trip)
    ├── test_publish_signing.py   — 2 cases (HMAC cross-check with Node)
    ├── test_regression.py        — 20-storm harness (pytest marker: regression)
    └── regression_storms.json    — 20 DMV+ storms + 5 clear-sky controls
```

**Unit tests: 33/33 passing locally** (Python 3.10/3.11 via `timezone.utc` compat).

The regression suite is gated behind `pytest -m regression` because it
requires AWS S3 + NOAA NOMADS network access and takes ~15 minutes — we
have not yet executed it. Operator must run it before turning on prod ingest.

### Deploy checklist — what the operator still has to do

1. **Run migration 075 against production DB** — not yet executed:
   ```
   psql "$RAILWAY_DB_URL" -f database/migrations/075_add_source_nexrad_l2.sql
   ```
   Expected: `COMMIT` after ~200 ms. No table rewrite (additive only).

2. **Update `verified_hail_events_public_sane` view** — this view was created
   as a hotfix directly in production and is not defined in any migration
   file in this repo. See `### Operator follow-ups ###` at the bottom of
   migration 075 for the exact steps:
   ```
   pg_dump -s -t verified_hail_events_public_sane "$RAILWAY_DB_URL" > /tmp/sane.sql
   # Add source_nexrad_l2 to SELECT list + WHERE clause, re-apply.
   ```
   Until done, `source_nexrad_l2=TRUE` rows will NOT appear in addressImpact,
   swathBackfill, or susanGroupMeBot queries (they all hit `_sane`).

3. **Push the worker repo to GitHub:**
   ```
   cd /Users/a21/gemini-nexrad-l2-worker
   gh repo create Roof-ER21/gemini-nexrad-l2-worker --private --source=. --remote=origin
   git push -u origin main
   ```

4. **Create the Railway worker service:**
   - Project: "The S21"
   - Name: "NEXRAD L2 Worker"
   - Source: `Roof-ER21/gemini-nexrad-l2-worker` main branch
   - Volume: 1 GB at `/data`
   - Env vars:
     - `NEXRAD_L2_INGEST_SECRET` — same value as Node app (generate `openssl rand -hex 32`, set on BOTH services)
     - `NODE_APP_URL` — prefer internal URL (`http://sa21.railway.internal:<port>`)
     - `AWS_REGION=us-east-1`
   - Start command already in `railway.toml`: `python src/main.py run --loop`

5. **Run the regression suite before enabling live ingest:**
   ```
   cd /Users/a21/gemini-nexrad-l2-worker
   NEXRAD_L2_INGEST_SECRET=dummy DRY_RUN=true \
     pytest tests/test_regression.py -m regression -v --tb=short
   ```
   Gate: ≥18/20 storms in range, ≤5 false positives on controls.
   If the gate fails, tune MESH parameters in `src/mesh.py` (most likely
   knobs: `_AZ_BIN_DEG`, `_RANGE_BIN_M`, the W_T linear ramp endpoints).

6. **Backfill last 30 days** once regression passes:
   ```
   # In Railway shell, or locally with prod env pointed at Railway Postgres:
   python src/main.py backfill --days 30
   ```
   Expected: ~6 radars × 30 days × 288 scans = ~50k scans processed,
   ~500k–5M events depending on season. Monitor via:
   ```
   curl -s https://sa21.up.railway.app/api/hail/admin/ingest-stats | jq
   ```

### Known limitations / tradeoffs

- **`verification_count` + `confidence_tier` generated columns NOT updated.**
  `source_nexrad_l2`-only rows will undercount by 1 in those columns. Migration
  075 step "B" in the operator follow-ups section has the maintenance-window
  SQL when we're ready. Deliberate tradeoff: dropping + re-adding a GENERATED
  STORED column forces a full table rewrite we don't want to pay for on the
  first deploy of a new source.

- **`verified_hail_events_public_sane` view NOT updated in this migration.**
  Its authoritative definition is not in the repo (added as a production hotfix).
  Operator must dump + patch + re-apply — see step 2 above.

- **MESH parameters are textbook defaults**, not calibrated to DMV storms yet.
  The regression suite (step 5) will tell us how much tuning is needed. First-run
  expectation is ≥15/20 passing; may need 1–2 iterations on W_T/E_Z ramp endpoints.

- **Freezing-level fetch uses NOMADS OPeNDAP ASCII**, which NOAA throttles. If
  we hit rate limits during backfill, `freezing_level.py` will fall back to
  synthetic profile (4 km / 7.5 km) — sufficient for sprint-1 MVP, but future
  versions should download GFS GRIB2 once per cycle instead of per-query.

- **No near-real-time polling yet** — nightly catch-up only. Adding a 10-min
  poll that only fires during active NWS alert windows is a sprint-2 item.

### What Ahmed should know

- Migration 075 + the new ingest route are **deployed to `main` of
  `gemini-field-assistant`** pending your review. Not yet applied to the prod
  DB (step 1 above). Auto-deploy will pick up the Node route the moment you push.
- The worker repo exists locally at `/Users/a21/gemini-nexrad-l2-worker/` and
  has one commit. Nothing pushed to GitHub yet.
- The 20-storm regression run is the ship gate. Until it passes, we set
  `DRY_RUN=true` on the worker service so we can eyeball the volumes without
  pushing bad rows into `verified_hail_events`.
- Once regression passes and backfill lands, CC21's hail map, Susan, and the
  adjuster PDF will all light up with NEXRAD-L2-derived events automatically
  (through the existing `verified_hail_events_public_sane` path, assuming
  step 2 has been completed).


---

## Completed

**Date:** 2026-04-23 (post-handoff integration by Ahmed's paired Claude session)

**What shipped:**
- ✅ `gemini-nexrad-l2-worker/` Python scaffold at `/Users/a21/gemini-nexrad-l2-worker/` (one commit: "Initial scaffold: NEXRAD Level II MESH worker")
- ✅ Migration 075 applied to production DB (Railway Postgres)
- ✅ `source_nexrad_l2` column on `verified_hail_events`
- ✅ `at_least_one_source` CHECK constraint updated to include new column
- ✅ `verified_hail_events_public` view recreated with `source_nexrad_l2`
- ✅ `verified_hail_events_public_sane` view recreated (inherits via `SELECT *`)
- ✅ `POST /api/hail/admin/nexrad-l2-ingest` route live with HMAC auth via `NEXRAD_L2_INGEST_SECRET` env var
- ✅ `SourceName` TypeScript union updated (`'nexrad_l2'`, track='algorithm', priority=6)

**Post-handoff fixes applied:**
- `CREATE OR REPLACE VIEW` → `DROP+CREATE VIEW` in migration 075. Postgres refused the column reorder under the REPLACE path. The sane view was added to the migration itself instead of leaving it as an operator follow-up.

**What's still TODO (not in scope of original handoff):**
- 🔶 Set `NEXRAD_L2_INGEST_SECRET` on Railway (same value on both Node app + Python worker)
- 🔶 Deploy Python worker to Railway as a separate service with its own container
- 🔶 Run the 20-storm regression suite against the MESH implementation
- 🔶 Begin historical backfill once regression passes

**Immediate downstream effect (verified):**
- The moment the worker starts publishing events, they flow through `verifiedEventsService.upsertBatch` → `verified_hail_events` → `verified_hail_events_public_sane` → `addressImpactService` → map + Susan + PDF. No additional consumer changes needed.
