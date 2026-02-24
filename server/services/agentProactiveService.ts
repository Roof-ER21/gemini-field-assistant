/**
 * Agent Proactive Service
 * Periodically checks for due tasks and pushes reminders
 * to connected users via Socket.io.
 */

import pg from 'pg';
import type { PresenceService } from './presenceService.js';

export class AgentProactiveService {
  private pool: pg.Pool;
  private presence: PresenceService;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(pool: pg.Pool, presence: PresenceService) {
    this.pool = pool;
    this.presence = presence;
  }

  /** Start the periodic checker (every 5 minutes) */
  start() {
    console.log('[AgentProactive] Starting task checker (every 5 min)');
    // Run once immediately, then every 5 min
    this.checkDueTasks().catch(err =>
      console.error('[AgentProactive] Initial check error:', err)
    );
    this.intervalId = setInterval(() => {
      this.checkDueTasks().catch(err =>
        console.error('[AgentProactive] Check error:', err)
      );
    }, 5 * 60 * 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Find pending tasks that are due and push a proactive message */
  async checkDueTasks() {
    try {
      // Find tasks due within the next 5 minutes (not yet notified)
      const result = await this.pool.query(
        `SELECT t.id, t.user_id, t.title, t.description, t.task_type, t.due_at, t.job_number
         FROM agent_tasks t
         WHERE t.status = 'pending'
           AND t.due_at <= NOW() + INTERVAL '5 minutes'
           AND (t.metadata->>'notified') IS NULL
         ORDER BY t.due_at ASC
         LIMIT 20`
      );

      if (result.rows.length === 0) return;

      console.log(`[AgentProactive] Found ${result.rows.length} due task(s)`);

      for (const task of result.rows) {
        const message = task.description
          ? `${task.title} — ${task.description}`
          : task.title;

        // Emit to user via Socket.io
        this.presence.emitAgentProactive(task.user_id, {
          taskId: task.id,
          title: task.title,
          message,
        });

        // Mark as notified so we don't re-send
        await this.pool.query(
          `UPDATE agent_tasks
           SET metadata = metadata || '{"notified": true}'::jsonb
           WHERE id = $1`,
          [task.id]
        );
      }
    } catch (err) {
      // Table may not exist yet (pre-migration) — suppress
      const msg = (err as Error).message || '';
      if (!msg.includes('does not exist')) {
        console.error('[AgentProactive] checkDueTasks error:', err);
      }
    }
  }
}
