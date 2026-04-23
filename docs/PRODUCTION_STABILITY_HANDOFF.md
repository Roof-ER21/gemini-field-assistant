# Susan 21 Production Stability — Root Cause & Fix Plan

**Status:** Phases 1-5 implemented 2026-04-23. Pending operator step below.
**Context:** Ahmed has been getting repeated "Susan crashing and back on"
emails. Quick patches (bigger LIMIT, staggered cron, NODE_OPTIONS caps) were
addressing symptoms, not the cause. This document is the deep analysis and
the production fix plan that's now shipped.

## Phase status (2026-04-23 EDT)

- **Phase 1** (memory logger, bounded /search, opt-in enrichment) — **LIVE** in deploy 7d617bce. `[mem]` heartbeat visible in Railway logs every 60 s.
- **Phase 2** (worker service split) — **CODE MERGED**, service creation on Railway **PENDING**. See `docs/PHASE2_RAILWAY_SETUP.md`. Web container has `RUN_SCHEDULERS=true` by default until you create sa21-worker and flip the flag.
- **Phase 3** (storm_days_public MV + `/api/hail/storm-days` endpoint) — **LIVE**. Refreshed hourly at :10 by whichever service has `RUN_SCHEDULERS` on. Enables the 5-10 year history window.
- **Phase 4** (PDF job queue) — **LIVE**. `/api/hail/generate-report` returns 202 with jobId; worker renders; poll `/api/hail/report/:id` until `done`, download from `/api/hail/report/:id/download`. Consumer runs in the web container today until sa21-worker is up.
- **Phase 5** (10-year historical backfill endpoint) — **LIVE as an admin trigger**. `POST /api/hail/admin/noaa-historical-backfill` body `{yearFrom:2015, yearTo:2022}` runs in the background. Apply migration 078 is automatic. **Operator still needs to trigger the backfill run.**

## Pending operator steps

1. Create Railway service "sa21-worker" from same repo, set `RUN_SCHEDULERS=true`, start cmd `node dist-server/worker.js`. See `docs/PHASE2_RAILWAY_SETUP.md` for the exact commands.
2. Confirm worker healthy via `GET /api/admin/worker-status` (age < 2 min).
3. Flip `RUN_SCHEDULERS=false` on the Susan 21 web service to migrate cron work off it.
4. Trigger the 10-year backfill with the curl in Phase 5 section.

---

## TL;DR

Susan 21 is one container running three workloads that fight each other for
memory and CPU. It needs to be split into 2-3 services. The `/api/hail/search`
endpoint also can't scale to a 5-10 year history with the current
"return-everything" pattern — we need server-side pagination by storm day.
None of these are hard. They are **scope** problems, not difficulty problems.

Estimated effort: **2-3 focused engineering days** to stabilize; **4-6 days**
to reach the 10-year history goal. One engineer, no parallelism needed.

---

## 1. What's actually breaking

### 1.1 Single-container monolith

`Susan 21` is one Node process on Railway doing all of:

| Workload | What it does | How it strains the container |
|---|---|---|
| **A. Web traffic** | Rep APIs, SSE streams, WebSockets, Susan chat | Spiky, needs consistent latency |
| **B. Cron schedulers** | 10+ schedules: GroupMe posts, storm alerts every 30 min, NWS every 5 min, IEM LSR every 30 min, CoCoRaHS daily, mPING hourly, swath backfill 3 AM, daily digest 6 PM, Ross-recap 8:30 PM, motivation 7/12:15/3:30 | Spiky bursts, high allocation, competes with (A) |
| **C. Heavy queries** | `/search` (was loading 20 K rows into memory), `/generate-report` (100+ synchronous MRMS lookups), address-impact (point-in-polygon over 458 swath polygons) | Sustained 100-500 MB allocation per request, 30-300s duration |

When (B) or (C) spikes, (A) degrades. When total memory exceeds the Railway
container limit, Railway `SIGKILL`s the process. Health check flaps. The
crash-loop is real but it's not OOM-in-Node — it's OOM-in-container.

**Evidence:**

- `railway deployment list --service "Susan 21"` — 3 consecutive FAILED
  deploys today between 15:58 and 16:00 because my `NODE_OPTIONS=1536`
  was too low for `tsc` during the build stage (Node default heap is
  ~1.4 GB; tsc needs ~1.5 GB; I capped at exactly 1.5 → OOM).
- `/api/hail/search?months=24&radius=25` previously returned only the
  last 9 months of events because `LIMIT 2000` in the SQL truncated
  dense metros. Raising to 20 000 was a patch, not a fix.
- `/api/hail/generate-report` hit Railway's 300s HTTP gateway timeout
  because swath-enrichment walks all 100+ storm dates in the bbox
  synchronously, each potentially triggering a cold 30-60s GRIB2 fetch.
- Cron schedulers pre-stagger fire: *afternoon-motivation (15:30 EDT),
  storm-alerts (every :00/:30), IEM LSR (every :00/:30), NWS alerts
  (every :00-:55 by 5)* — four heavy tasks collided at 19:30 UTC right
  before Ahmed's "Susan crashed" email.

### 1.2 Data scale is fine; query pattern isn't

- `verified_hail_events`: 221 K rows in the last 24 months alone. Projecting to 10 years, expect **~700 K – 1.1 M rows**. Still a single-Postgres workload — no sharding needed.
- `mrms_swath_cache`: 458 rows, but each `geojson` blob is ~200 KB – 2 MB. That's ~500 MB of polygon data. Fine in Postgres but **not fine** to load into the web container's memory on every `/address-impact` call.
- Current `/api/hail/search` pattern: bbox prefilter → SQL returns raw rows → Node does haversine filter in app layer → serializes 1000s of rows in JSON back to the client. This scales roughly *linearly* with window size. At 10 years, a 25-mile-radius query will push 100 K+ rows through serialization.

**The fix is query semantics, not Postgres size.** Return *storm days* (aggregated), fetch events per day on demand. 700 K rows aggregated to ~1000 storm days is trivial to serve.

### 1.3 No backpressure or queues

- Every heavy operation is inline with the HTTP request.
- No job queue (BullMQ, PgBoss, etc.).
- No rate limiting on admin endpoints (`/admin/backfill-catchup` could be triggered repeatedly and starve the web worker).
- Cron bursts have no coalescing: if the 3 AM swath backfill takes longer than its window, the 4:30 AM CoCoRaHS ingest starts on top of it.

### 1.4 No memory observability

We find out Susan is crashing by getting emails. We have no:
- Per-request memory profiling
- Memory timeline over the last N hours
- Which cron fired right before the OOM
- Whether Railway is killing for memory or CPU

This is why every "fix" so far has been guess-and-check.

---

## 2. Target architecture

Three Railway services, same codebase, different entry points:

```
                        ┌────────────────────────────────┐
                        │   sa21-web (HTTP + WS + SSE)   │
                        │   - rep traffic only           │
                        │   - Susan chat                 │
                        │   - Paginated hail queries     │
                        │   - No cron, no ingest         │
                        │   - Target: <1 GB steady-state │
                        └────────────┬───────────────────┘
                                     │
                                     │  DB read/write
                                     ▼
┌────────────────────────┐   ┌────────────────┐   ┌───────────────────────────┐
│ NEXRAD L2 Worker       │──▶│   Postgres     │◀──│ sa21-worker               │
│ (already separate ✓)   │   │   (unchanged)  │   │ - ALL cron schedulers     │
│ POST → sa21-web/ingest │   │                │   │ - multi-source ingests    │
└────────────────────────┘   │   1 instance   │   │ - MRMS swath backfill     │
                             │   no split     │   │ - daily digest email      │
                             │   yet          │   │ - PDF report queue        │
                             └────────────────┘   │ - Susan scheduled posts   │
                                                  └───────────────────────────┘
```

**Why not another Postgres:** We're at 221 K rows and ~1 GB database size.
Postgres on Railway will comfortably serve 10 M rows with proper indexes.
Sharding/replica before we need it is a trap.

**Why a worker service:** The web container is what reps hit. Anything that
spikes memory/CPU needs to be isolated so a failed ingest can't kill the
rep-facing API. This is the #1 cause of the "Susan crashing" emails.

**Why keep NEXRAD L2 separate:** Already done, working. It's a good model
for how to split the others.

---

## 3. Execution plan (ordered)

### Phase 1 — Stop the bleeding (1 day)

Goal: Zero crash emails for 48 hours.

1. **Add memory instrumentation first.** `server/middleware/memoryLogger.ts`:
   log `process.memoryUsage()` every 60 s, plus the route name on each
   request entry/exit with delta. Dump to a rolling file or stderr so
   Railway logs capture it. We need to see the actual crash mechanism
   before we keep guessing.
2. **Disable MRMS swath enrichment on `/generate-report`.** Already done
   via `skipEnrichment: true` flag, but make that the **default**. PDF
   gets exactly the events the caller sends. Swath enrichment should be
   a separate dedicated endpoint, not a silent pre-step.
3. **Bound `/api/hail/search` memory.** Paginate by date — return max 5000
   rows OR 90 days of events, whichever hits first. Add `?cursor=` for
   next page. Frontend adapts.
4. **Move `NODE_OPTIONS` off the Railway variable.** Put it in `Procfile`
   or the start command so it only applies at runtime, not build. Set
   to `--max-old-space-size=768` for web, `--max-old-space-size=1024`
   for worker (once split).
5. **Kill the `--once-now` SSH trigger pattern.** I kept invoking it
   during this session; it's a manual footgun that runs outside the
   daemon loop. Replace with an admin endpoint.

### Phase 2 — Split the worker service (1 day)

1. **New entry point:** `server/worker.ts` — imports cron bootstrap +
   DB pool, no Express, no HTTP listener. Exits only on SIGTERM.
2. **Move every `cron.schedule(...)` out of `server/index.ts` + `server/services/susanScheduledPosts.ts`** into the new worker. The web container no longer schedules anything.
3. **Railway service:** new service "sa21-worker" pointing at same
   repo with `startCommand = "node dist-server/worker.js"`. Same
   environment variables as Susan 21 (it talks to the same DB).
4. **Health check for worker:** a simple heartbeat row in a
   `worker_heartbeat(service, last_beat_at)` table updated every 60 s.
   Web container reads it to show a "worker is alive" status indicator
   on admin page.
5. **Decommission schedulers in web.** `SUSAN_SCHEDULED_POSTS=false` on
   the web service. The worker takes over.

### Phase 3 — Fix `/api/hail/search` for real (1-2 days)

1. **Materialized view `storm_days_public`:**
   ```sql
   CREATE MATERIALIZED VIEW storm_days_public AS
   SELECT
     event_date,
     state,
     lat_bucket,
     lng_bucket,
     COUNT(*) AS report_count,
     MAX(hail_size_inches) AS max_hail,
     MAX(wind_mph) AS max_wind,
     BOOL_OR(source_noaa_ncei) AS has_noaa,
     BOOL_OR(source_mrms) AS has_mrms,
     BOOL_OR(source_nexrad_l2) AS has_nexrad_l2,
     BOOL_OR(source_ihm) AS has_ihm
   FROM verified_hail_events_public_sane
   GROUP BY event_date, state, lat_bucket, lng_bucket;

   CREATE INDEX ON storm_days_public (event_date DESC);
   CREATE INDEX ON storm_days_public (lat_bucket, lng_bucket);
   ```
   Refresh hourly via worker cron.
2. **New endpoint `GET /api/hail/storm-days`:** returns `(date, max_hail, count, sources[])` rows for a bbox + window. For 10 years × DMV this is
   ~3000 rows total — fits in <100 KB JSON.
3. **New endpoint `GET /api/hail/storm-day-events?date=X&lat=&lng=`:**
   returns the raw events for one storm day. Called on demand when the rep
   clicks a day in the UI.
4. **Update `TerritoryHailMap`** to use the new two-step pattern. Old
   `/search` stays for backwards compatibility but adds a deprecation
   header.

### Phase 4 — Report queue (1 day)

1. **`pg-boss` or a lightweight table-based queue.** `pdf_jobs(id, status, payload, result_path, created_at, completed_at)`.
2. **POST `/api/hail/generate-report` enqueues, returns job ID.** Worker polls the table, runs the PDF generation, uploads result to `/uploads/reports/<id>.pdf`, updates the row.
3. **GET `/api/hail/report/:id`** returns either `{status:"pending"}` or a 302 to the PDF URL.
4. **Web container no longer does PDF generation** — that was the #2 cause of memory spikes.

### Phase 5 — Historical backfill for the 10-year window (1-2 days, independent of stability work)

1. Extend `verifiedEventsService.upsertBatch` to accept any pre-2022 date without the current 24-mo cap.
2. Run historical NOAA NCEI Storm Events pulls for 2015-2022 (CSV downloads, ~20 MB/year, well-documented API).
3. Run NCEI SWDI hail backfill for the same period.
4. MRMS swath data only goes back to ~2016 at usable resolution — accept that and document it.
5. Verify `storm_days_public` materialized view refresh scales — may need to chunk by year.

---

## 4. What I've already done this session (keep or roll back)

| Change | Keep? | Notes |
|---|---|---|
| `verified_hail_events_public_sane` view (hail ≤ 8") | **Keep** | Real fix for the 36 K impossible-size rows |
| `/api/hail/search` LIMIT 2000 → 20000 + sane view | **Keep** for now | Phase 3 replaces this with the day aggregate |
| `/api/hail/verify-date` closest-distance fix | **Keep** | Was a real bug |
| `/api/hail/generate-report skipEnrichment` flag | **Keep** | Phase 1 makes it default |
| ET timezone sweep across 47 files | **Keep** | Independent of stability work |
| Cron stagger (`:07/:37`, `:15/:45`, `*/5 offset 2`) | **Delete** in Phase 2 | Workers won't have collision because they're alone |
| `NODE_OPTIONS=--max-old-space-size=1536` on Railway | **Already reverted** — caused 3 FAILED deploys |
| NEXRAD L2 worker wired to sa21 ingest | **Keep** | Model for worker split |
| Address-impact tiered lookup (Direct Hit / At Location / Area Impact) | **Keep** | UX is good, perf gated by Phase 3 |

---

## 5. What Codex (or next engineer) should do first

In order, don't skip:

1. Read this doc.
2. Read `server/index.ts`, `server/services/susanScheduledPosts.ts`, and
   `server/routes/hailRoutes.ts` lines 289-600 (the `/search` endpoint)
   to confirm the problem description.
3. Do Phase 1 entirely before touching Phase 2+. Stability first.
4. After Phase 1, wait 48 hours and check Railway's memory graph + crash
   emails before starting Phase 2.
5. Before Phase 3, take a Postgres backup. The materialized view + index
   changes are reversible but a backup is cheap.

---

## 6. Operational notes

- **Railway project:** "The S21" (id `2b46e24c-5ee6-46a1-86bb-7b4c5af48dd8`)
- **Current services:** Susan 21 (web), NEXRAD L2 Worker, Postgres, ollama (completed/stopped)
- **Git:** https://github.com/Roof-ER21/gemini-field-assistant, main branch
- **Deploy flow:** push to main → Railway auto-builds → pre-push hook rebuilds `dist-server/`.
  Watch for `dist-server/` drift — the hook auto-commits a second time; if your PR has a `dist-server/` edit and a source edit, push twice.
- **Public base:** https://sa21.up.railway.app
- **Health check:** `GET /api/health`

---

## 7. When NOT to do this refactor

- If Ahmed wants to stop rep-facing changes and just keep the site running
  until a bigger release — Phase 1 alone (memory logger, defaults, pagination cap) gets 80% of the stability win in 1 day and leaves the codebase shippable.
- If a major storm is imminent (weekend severe weather) — delay Phase 2
  and Phase 3 until after the storm. Reps need a stable tool during active events, not a refactor.
