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
