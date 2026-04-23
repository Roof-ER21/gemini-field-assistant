/**
 * Admin routes — operational visibility endpoints for the web container.
 *
 * GET /api/admin/worker-status
 *   Returns the last heartbeat written by the sa21-worker process.
 *   Status classification:
 *     healthy : age < 2 min  (worker is alive and checking in normally)
 *     stale   : age 2-10 min (worker may be restarting or fell behind)
 *     dead    : age > 10 min (worker is down — check Railway logs)
 *
 * The heartbeat row is written every 60 s by server/worker.ts via the
 * worker_heartbeat table (migration 076_worker_heartbeat.sql).
 */

import { Router, type Request, type Response } from 'express';
import type pg from 'pg';

/**
 * Idempotent schema bootstrap for the worker_heartbeat table (migration 076).
 * Web startup calls this so /api/admin/worker-status doesn't 500 when the
 * psql-based migration application hasn't been done.
 */
export async function ensureWorkerHeartbeatSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS worker_heartbeat (
      service TEXT PRIMARY KEY,
      last_beat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export function createAdminRoutes(pool: pg.Pool): Router {
  const router = Router();

  // GET /api/admin/worker-status
  router.get('/worker-status', async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await pool.query<{
        service: string;
        last_beat_at: Date;
        age_seconds: number;
      }>(
        `SELECT service,
                last_beat_at,
                EXTRACT(EPOCH FROM (NOW() - last_beat_at))::int AS age_seconds
         FROM worker_heartbeat
         WHERE service = 'sa21-worker'`,
      );

      if (result.rows.length === 0) {
        // Migration hasn't run yet — table exists but row not seeded.
        res.status(503).json({
          status: 'unknown',
          message: 'No heartbeat row found. Run migration 076_worker_heartbeat.sql and start the sa21-worker service.',
          service: 'sa21-worker',
          last_beat_at: null,
          age_seconds: null,
        });
        return;
      }

      const row = result.rows[0];
      const ageSeconds = row.age_seconds;

      let status: 'healthy' | 'stale' | 'dead';
      if (ageSeconds < 120) {
        status = 'healthy';
      } else if (ageSeconds < 600) {
        status = 'stale';
      } else {
        status = 'dead';
      }

      res.json({
        status,
        service: row.service,
        last_beat_at: row.last_beat_at,
        age_seconds: ageSeconds,
        thresholds: {
          healthy_under_seconds: 120,
          stale_under_seconds: 600,
          dead_at_or_over_seconds: 600,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Table may not exist yet if migration hasn't run.
      if (message.includes('worker_heartbeat') && message.includes('does not exist')) {
        res.status(503).json({
          status: 'unknown',
          message: 'worker_heartbeat table not found. Run database migration 076_worker_heartbeat.sql.',
          service: 'sa21-worker',
          last_beat_at: null,
          age_seconds: null,
        });
        return;
      }
      console.error('[adminRoutes] worker-status query error:', err);
      res.status(500).json({ status: 'error', message });
    }
  });

  return router;
}
