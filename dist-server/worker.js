/**
 * sa21-worker — Background worker entry point
 *
 * NOT an HTTP server. This process owns every cron scheduler so the web
 * container (server/index.ts) can run rep-facing traffic without memory
 * pressure from scheduled ingest jobs.
 *
 * Railway service name: "sa21-worker"
 * Start command: node --max-old-space-size=1024 dist-server/worker.js
 *
 * Environment: same variables as the "Susan 21" web service. Both services
 * point at the same Postgres instance. The worker does NOT listen on any port.
 *
 * The web container has RUN_SCHEDULERS unset (defaults to false).
 * This worker runs with RUN_SCHEDULERS=true.
 *
 * See docs/PHASE2_RAILWAY_SETUP.md for the Railway UI / CLI setup steps.
 * See docs/PRODUCTION_STABILITY_HANDOFF.md Phase 2 for the full design rationale.
 */
import pg from 'pg';
import { startSusanScheduler } from './services/susanScheduledPosts.js';
import { startStormDaysRefresh } from './services/stormDaysService.js';
import { startPdfJobWorker } from './services/pdfJobQueue.js';
const { Pool } = pg;
// ─── Database pool ────────────────────────────────────────────────────────────
// Mirrors the pool config in server/index.ts. Worker does mostly writes
// (heartbeat) and the same queries as cron handlers — keep pool small so we
// don't starve the web container's connections.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 5, // worker runs background work; 5 is plenty
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('[worker] DB connection error:', err.message);
    }
    else {
        console.log('[worker] DB connected at', res.rows[0].now);
    }
});
// ─── Memory heartbeat (mirrors the web container's startMemoryHeartbeat) ─────
const MB = 1024 * 1024;
function fmtMB(bytes) {
    return `${Math.round(bytes / MB)}MB`;
}
function startWorkerMemoryLog(intervalMs = 60_000) {
    const timer = setInterval(() => {
        const u = process.memoryUsage();
        console.log(`[mem] worker rss=${fmtMB(u.rss)} heap=${fmtMB(u.heapUsed)}/${fmtMB(u.heapTotal)} ext=${fmtMB(u.external)}`);
    }, intervalMs);
    timer.unref();
    return timer;
}
// ─── Worker heartbeat (written to Postgres every 60 s) ────────────────────────
// Web container reads this via GET /api/admin/worker-status. If age > 10 min
// the admin panel shows "dead" and someone should investigate.
async function startWorkerHeartbeat(heartbeatPool) {
    async function beat() {
        try {
            await heartbeatPool.query(`INSERT INTO worker_heartbeat (service, last_beat_at)
         VALUES ('sa21-worker', NOW())
         ON CONFLICT (service)
         DO UPDATE SET last_beat_at = EXCLUDED.last_beat_at`);
        }
        catch (e) {
            // Non-fatal: log and continue. The stale/dead status will surface on the
            // admin page — we don't want a transient DB hiccup to crash the worker.
            console.warn('[worker] heartbeat write failed:', e.message);
        }
    }
    // Fire immediately on startup so the admin page goes green right away.
    await beat();
    const timer = setInterval(beat, 60_000);
    timer.unref();
    return timer;
}
// ─── Graceful shutdown ────────────────────────────────────────────────────────
// node-cron tasks continue running until the process exits; Railway sends
// SIGTERM before force-killing. We give in-flight handlers a brief window
// to finish before we pull the pool.
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    console.log(`[worker] received ${signal} — shutting down gracefully`);
    // Give in-flight cron handlers up to 10 s to finish.
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    await pool.end();
    console.log('[worker] pool closed, exiting');
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    console.error('[worker] uncaughtException:', err);
});
process.on('unhandledRejection', (err) => {
    console.error('[worker] unhandledRejection:', err);
});
// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function main() {
    console.log('[worker] sa21-worker starting — pid', process.pid);
    console.log('[worker] node', process.version, '| env', process.env.NODE_ENV || 'development');
    // Memory observability
    startWorkerMemoryLog(60_000);
    // Write a heartbeat row immediately and every 60 s thereafter
    await startWorkerHeartbeat(pool);
    // Start ALL Susan 21 scheduled jobs.
    //
    // startSusanScheduler reads the same SUSAN_SCHEDULED_POSTS / SUSAN_STORM_ALERTS /
    // etc. env vars it always has — the worker service in Railway should have these
    // set to 'true' (or whatever values the web service had before). The web
    // container now has RUN_SCHEDULERS unset so it won't call startSusanScheduler.
    //
    // Individual feature flags (SUSAN_SCHEDULED_POSTS, SUSAN_EVENING_POST,
    // SUSAN_DIGEST_EMAIL, SUSAN_STORM_ALERTS, SUSAN_SWATH_BACKFILL,
    // COCORAHS_LIVE_ENABLED, IEM_LSR_LIVE_ENABLED, NWS_ALERTS_LIVE_ENABLED,
    // MPING_LIVE_ENABLED) are all honoured exactly as before — we haven't changed
    // any handler logic, only where the scheduler is registered.
    startSusanScheduler(pool);
    // Phase 3: storm-days materialized view refresh (every hour at :10).
    // Powers the paginated /api/hail/storm-days endpoint that lets the UI
    // show 5-10 years of history without loading hundreds of thousands of
    // raw events into the web container.
    startStormDaysRefresh(pool);
    // Phase 4: PDF job queue consumer. The web container enqueues a row
    // into pdf_jobs on POST /api/hail/generate-report; this worker renders
    // them asynchronously so the web never blocks on pdfkit.
    startPdfJobWorker(pool);
    // Live MRMS → Sales Team hail alert. Polls MRMS every 10 min during
    // 8 AM - 10 PM EDT, posts a single bulleted alert when >=1" cells
    // detected in DMV/PA/WV/DE. Dedup via bot_storm_alerts_sent table.
    // Default threshold 1.0" (claim tier). Gated on LIVE_MRMS_ALERT_ENABLED
    // env var: 'test-group' → post to GROUPME_TEST_GROUP_ID, 'true' → post
    // to Sales Team. Default off so flipping it on is a conscious choice.
    if (process.env.LIVE_MRMS_ALERT_ENABLED === 'true' || process.env.LIVE_MRMS_ALERT_ENABLED === 'test-group') {
        const { runLiveMrmsAlertCheck } = await import('./services/liveMrmsAlertService.js');
        const { runLiveNwsWarningCheck } = await import('./services/liveNwsWarningAlertService.js');
        const TEN_MIN = 10 * 60_000;
        const FIVE_MIN = 5 * 60_000;
        const MRMS_POLL = async () => {
            const now = new Date();
            const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
            const h = et.getHours();
            if (h < 8 || h >= 22)
                return; // quiet 10pm-8am EDT
            try {
                const r = await runLiveMrmsAlertCheck(pool);
                if (r.posted || r.new_cells > 0) {
                    console.log(`[LiveMrmsAlert-cron] posted=${r.posted} new=${r.new_cells} peak=${r.cells?.[0]?.inches ?? '-'}"`);
                }
            }
            catch (e) {
                console.warn('[LiveMrmsAlert-cron] err:', e.message);
            }
        };
        // NWS warnings are time-sensitive (lead time before storm hits) — poll
        // every 5 min during daytime. No quiet hours for tornado warnings.
        const NWS_POLL = async () => {
            try {
                const r = await runLiveNwsWarningCheck(pool);
                if (r.new_posted > 0) {
                    console.log(`[LiveNwsAlert-cron] posted=${r.new_posted} dup=${r.skipped_duplicate} out-of-scope=${r.skipped_out_of_scope} active=${r.active_warnings}`);
                }
            }
            catch (e) {
                console.warn('[LiveNwsAlert-cron] err:', e.message);
            }
        };
        // MRMS first run ~30s after startup; then every 10 min
        setTimeout(MRMS_POLL, 30_000);
        setInterval(MRMS_POLL, TEN_MIN);
        // NWS first run ~45s after startup; then every 5 min
        setTimeout(NWS_POLL, 45_000);
        setInterval(NWS_POLL, FIVE_MIN);
        const target = process.env.LIVE_MRMS_ALERT_ENABLED === 'true' ? 'SALES-TEAM' : 'TEST-GROUP';
        console.log(`[worker] LiveMrmsAlert cron registered (${target} target, 10-min poll, 8am-10pm EDT, 0.25" tiered)`);
        console.log(`[worker] LiveNwsWarning cron registered (${target} target, 5-min poll, 24/7, SVR-TSTM + TORNADO warnings)`);
    }
    else {
        console.log('[worker] LiveMrmsAlert + LiveNwsWarning crons NOT registered (LIVE_MRMS_ALERT_ENABLED unset)');
    }
    // Keep the process alive. node-cron installs its own setIntervals, but if
    // every cron job is disabled the event loop would drain and the worker would
    // exit. The heartbeat interval above keeps the loop alive anyway, but this
    // explicit daemon loop makes the intent obvious.
    console.log('[worker] all schedulers registered — running');
    setInterval(() => {
        // intentional no-op daemon tick
    }, 60_000 * 60); // once per hour — just to document the daemon intent
}
main().catch((err) => {
    console.error('[worker] fatal startup error:', err);
    process.exit(1);
});
