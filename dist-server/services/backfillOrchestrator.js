/**
 * backfillOrchestrator — coordinates historical storm data backfill from all free sources.
 *
 * Usage:
 *   import { backfillOrchestrator } from './backfillOrchestrator';
 *   await backfillOrchestrator.run({
 *     sources: ['noaa_ncei', 'iem_lsr', 'ncei_swdi', 'cocorahs'],
 *     states: ['VA', 'MD', 'PA'],
 *     fromDate: '2015-01-01',
 *     toDate: '2026-04-21',
 *     dryRun: true,  // first run — counts only, no writes
 *   });
 *
 * Safety:
 *   - Idempotent — safe to re-run
 *   - Progress persisted to backfill_progress table
 *   - Dry-run mode for estimating row counts before committing
 *   - Graceful resume if interrupted
 *   - All writes go through VerifiedEventsService (dedup enforced)
 */
import { VerifiedEventsService } from './verifiedEventsService.js';
// ════════════════════════════════════════════════════════════════════════════
// PROGRESS TRACKING (separate table for resumability)
// ════════════════════════════════════════════════════════════════════════════
async function ensureProgressTable(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS backfill_progress (
      id SERIAL PRIMARY KEY,
      source VARCHAR(50) NOT NULL,
      run_id UUID NOT NULL,
      window_key VARCHAR(200) NOT NULL,  -- e.g., 'NOAA:VA:2024' or 'SWDI:bbox:2024-06-01:2024-06-14'
      status VARCHAR(20) NOT NULL,       -- 'pending','in_progress','completed','failed'
      rows_input INTEGER DEFAULT 0,
      rows_inserted INTEGER DEFAULT 0,
      rows_updated INTEGER DEFAULT 0,
      rows_skipped INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      error_detail TEXT,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (source, run_id, window_key)
    );
    CREATE INDEX IF NOT EXISTS backfill_progress_status_idx
      ON backfill_progress (source, status);
    CREATE INDEX IF NOT EXISTS backfill_progress_run_idx
      ON backfill_progress (run_id);
  `);
}
export async function markWindowStart(pool, source, runId, windowKey) {
    await pool.query(`INSERT INTO backfill_progress (source, run_id, window_key, status, started_at)
     VALUES ($1, $2, $3, 'in_progress', NOW())
     ON CONFLICT (source, run_id, window_key) DO UPDATE SET
       status = 'in_progress', started_at = NOW(), error_detail = NULL`, [source, runId, windowKey]);
}
export async function markWindowComplete(pool, source, runId, windowKey, stats) {
    await pool.query(`UPDATE backfill_progress
     SET status = 'completed',
         rows_input = $4, rows_inserted = $5, rows_updated = $6, rows_skipped = $7,
         error_count = $8, finished_at = NOW()
     WHERE source = $1 AND run_id = $2 AND window_key = $3`, [source, runId, windowKey, stats.rowsInput, stats.rowsInserted, stats.rowsUpdated, stats.rowsSkipped, stats.errorCount]);
}
export async function markWindowFailed(pool, source, runId, windowKey, errorMsg) {
    await pool.query(`UPDATE backfill_progress
     SET status = 'failed', error_detail = $4, finished_at = NOW()
     WHERE source = $1 AND run_id = $2 AND window_key = $3`, [source, runId, windowKey, errorMsg.slice(0, 2000)]);
}
export async function isWindowComplete(pool, source, runId, windowKey) {
    const r = await pool.query(`SELECT status FROM backfill_progress
     WHERE source = $1 AND run_id = $2 AND window_key = $3`, [source, runId, windowKey]);
    return r.rows[0]?.status === 'completed';
}
// ════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR
// ════════════════════════════════════════════════════════════════════════════
class BackfillOrchestrator {
    runners = new Map();
    register(runner) {
        this.runners.set(runner.name, runner);
    }
    async run(pool, config) {
        await ensureProgressTable(pool);
        const verifiedSvc = new VerifiedEventsService(pool);
        const results = [];
        for (const source of config.sources) {
            const runner = this.runners.get(source);
            if (!runner) {
                console.warn(`[backfill] No runner registered for source: ${source}`);
                continue;
            }
            console.log(`[backfill] Starting ${source} for states=${config.states.join(',')} range=${config.fromDate}..${config.toDate} dryRun=${!!config.dryRun}`);
            const result = await runner.run({
                pool,
                verifiedSvc,
                states: config.states,
                fromDate: config.fromDate,
                toDate: config.toDate,
                dryRun: !!config.dryRun,
                onProgress: config.onProgress,
            });
            results.push(result);
            console.log(`[backfill] ${source} done: inserted=${result.rowsInserted} updated=${result.rowsUpdated} errors=${result.errors.length} (${result.durationSec}s)`);
        }
        return results;
    }
    /**
     * Summary of what's been backfilled so far.
     */
    async summary(pool) {
        const r = await pool.query(`
      SELECT
        source,
        COUNT(*) AS window_count,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_windows,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_windows,
        SUM(rows_inserted) AS total_inserted,
        SUM(rows_updated) AS total_updated,
        SUM(rows_skipped) AS total_skipped,
        SUM(error_count) AS total_errors,
        MIN(started_at) AS first_started,
        MAX(finished_at) AS last_finished
      FROM backfill_progress
      GROUP BY source
      ORDER BY source;
    `);
        return r.rows;
    }
}
export const backfillOrchestrator = new BackfillOrchestrator();
/**
 * Convenience: register all known runners. Imported runners self-register at module load.
 */
export async function registerAllRunners() {
    // Registrations are in each source file to avoid circular imports at startup
    const { noaaNceiBackfill } = await import('./backfill/noaaNceiBackfill.js');
    const { iemLsrBackfill } = await import('./backfill/iemLsrBackfill.js');
    const { nceiSwdiBackfill } = await import('./backfill/nceiSwdiBackfill.js');
    const { cocorahsBackfill } = await import('./backfill/cocorahsBackfill.js');
    const { spcWcmBackfill } = await import('./backfill/spcWcmBackfill.js');
    const { iemVtecBackfill } = await import('./backfill/iemVtecBackfill.js');
    backfillOrchestrator.register(noaaNceiBackfill);
    backfillOrchestrator.register(iemLsrBackfill);
    backfillOrchestrator.register(nceiSwdiBackfill);
    backfillOrchestrator.register(cocorahsBackfill);
    backfillOrchestrator.register(spcWcmBackfill);
    backfillOrchestrator.register(iemVtecBackfill);
}
