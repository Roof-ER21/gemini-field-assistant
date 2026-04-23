# Phase 2 — Railway Setup: sa21-worker Service

## What This Is

A second Railway service created from the **same GitHub repo and same branch**
as "Susan 21" (the web container). The worker process runs every cron scheduler
so the web container handles only rep-facing HTTP traffic. Both services talk to
the same Postgres database.

Entry point: `server/worker.ts` (compiled to `dist-server/worker.js`)

---

## Step 1 — Run the migration (one-time)

Before starting the worker service, run migration 076 to create the heartbeat
table. From your local machine with `DATABASE_URL` set to the Railway Postgres
URL:

```bash
# Option A — via the Railway runner (recommended)
railway run node run-migrations.js --service "Susan 21"

# Option B — psql directly
psql "$DATABASE_URL" -f database/migrations/076_worker_heartbeat.sql
```

Verify it worked:

```bash
railway run psql "$DATABASE_URL" -c "SELECT * FROM worker_heartbeat;" --service "Susan 21"
```

---

## Step 2 — Create the worker service in Railway UI

1. Open https://railway.app → project "The S21"
2. Click **"+ New"** → **"Empty Service"** (NOT from template)
3. Name it: `sa21-worker`
4. Connect the same GitHub repo: `Roof-ER21/gemini-field-assistant`, branch `main`
5. Under **"Settings" → "Deploy"**:
   - **Build Command:** `npm run build` (same as web — both need `dist-server/`)
   - **Start Command:** `node --max-old-space-size=1024 dist-server/worker.js`
6. Under **"Settings" → "Networking"**: leave **all ports unconfigured** — the
   worker does not listen on any port.
7. Under **"Settings" → "Health Check"**: disable or leave blank (no HTTP port
   to check — Railway will treat it as a background worker).

---

## Step 3 — Copy environment variables

The worker needs the same variables as "Susan 21" **plus** these additions.

### Via Railway CLI (fastest)

```bash
# List what's on the web service today
railway variables --service "Susan 21"

# On the worker: copy each variable from the output above, then add/change:

railway variables --set "RUN_SCHEDULERS=true" --service "sa21-worker"

# These should match what Susan 21 already has (copy their values):
railway variables --set "DATABASE_URL=<paste from Susan 21>" --service "sa21-worker"
railway variables --set "POSTGRES_URL=<paste from Susan 21>" --service "sa21-worker"
railway variables --set "NODE_ENV=production" --service "sa21-worker"
railway variables --set "GEMINI_API_KEY=<paste>" --service "sa21-worker"
railway variables --set "GROQ_API_KEY=<paste>" --service "sa21-worker"
railway variables --set "GROUPME_TOKEN=<paste>" --service "sa21-worker"
railway variables --set "GROUPME_SUSAN_GROUP_ID=<paste>" --service "sa21-worker"
railway variables --set "EMAIL_ADMIN_ADDRESS=<paste>" --service "sa21-worker"

# Scheduler feature flags — set to match what they were on Susan 21:
railway variables --set "SUSAN_SCHEDULED_POSTS=true" --service "sa21-worker"
railway variables --set "SUSAN_EVENING_POST=true" --service "sa21-worker"
railway variables --set "SUSAN_DIGEST_EMAIL=true" --service "sa21-worker"
railway variables --set "SUSAN_STORM_ALERTS=true" --service "sa21-worker"
railway variables --set "SUSAN_SWATH_BACKFILL=true" --service "sa21-worker"
railway variables --set "COCORAHS_LIVE_ENABLED=<paste>" --service "sa21-worker"
railway variables --set "IEM_LSR_LIVE_ENABLED=<paste>" --service "sa21-worker"
railway variables --set "NWS_ALERTS_LIVE_ENABLED=<paste>" --service "sa21-worker"
railway variables --set "MPING_LIVE_ENABLED=<paste>" --service "sa21-worker"
railway variables --set "MPING_API_TOKEN=<paste>" --service "sa21-worker"
```

### Via Railway UI

In the "sa21-worker" service → Variables tab → click "Add a Reference" and
point each variable at the Susan 21 service so they stay in sync automatically.
Then override `RUN_SCHEDULERS=true` as a literal on the worker only.

---

## Step 4 — Disable schedulers on the web service

Ensure "Susan 21" does NOT have `RUN_SCHEDULERS=true`:

```bash
railway variables --unset "RUN_SCHEDULERS" --service "Susan 21"
# OR explicitly set it off:
railway variables --set "RUN_SCHEDULERS=false" --service "Susan 21"
```

The web container's startup log will show:
```
[web] RUN_SCHEDULERS not set — schedulers deferred to sa21-worker service
```

---

## Step 5 — Deploy and verify

```bash
# Trigger a deploy on the worker (push to main does both automatically after setup)
railway redeploy --service "sa21-worker"

# Check worker logs
railway logs --service "sa21-worker" --tail

# Verify heartbeat after ~90 s
curl https://sa21.up.railway.app/api/admin/worker-status
# Expected: {"status":"healthy","service":"sa21-worker","age_seconds":45,...}
```

---

## Rollback

If the worker service has problems, you can temporarily re-enable schedulers
on the web container without downtime:

```bash
railway variables --set "RUN_SCHEDULERS=true" --service "Susan 21"
railway redeploy --service "Susan 21"
```

Then investigate the worker and re-disable once fixed.

---

## Architecture Reference

```
sa21-web (Susan 21)              sa21-worker
  - Express HTTP server            - No HTTP port
  - Rep traffic, Susan chat        - ALL cron schedulers
  - RUN_SCHEDULERS unset/false     - RUN_SCHEDULERS=true
  - --max-old-space-size=768       - --max-old-space-size=1024
        |                                  |
        └─────── same Postgres DB ─────────┘
```

Health check from the web side: `GET /api/admin/worker-status`
Returns `healthy` (age < 2 min), `stale` (2-10 min), or `dead` (> 10 min).
