/**
 * Agent Task Routes
 * CRUD for follow-ups/reminders created by Susan or by reps directly.
 */

import express, { Request, Response, Router } from 'express';
import pg from 'pg';

function getRequestEmail(req: Request): string {
  return (req.header('x-user-email') || '').trim().toLowerCase();
}

export function createAgentTaskRoutes(pool: pg.Pool): Router {
  const router = express.Router();

  async function resolveUserId(email: string): Promise<string | null> {
    if (!email) return null;
    const r = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    return r.rows[0]?.id ?? null;
  }

  // GET / — list tasks for current user
  router.get('/', async (req: Request, res: Response) => {
    try {
      const userId = await resolveUserId(getRequestEmail(req));
      if (!userId) return res.status(401).json({ error: 'User not found' });

      const status = req.query.status as string || 'pending';
      const limit = Math.min(Number(req.query.limit) || 20, 100);

      const result = await pool.query(
        `SELECT * FROM agent_tasks
         WHERE user_id = $1 AND status = $2
         ORDER BY due_at ASC
         LIMIT $3`,
        [userId, status, limit]
      );

      return res.json(result.rows);
    } catch (err) {
      console.error('[AgentTasks] Error listing:', err);
      return res.status(500).json({ error: 'Failed to list tasks' });
    }
  });

  // POST / — create task
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = await resolveUserId(getRequestEmail(req));
      if (!userId) return res.status(401).json({ error: 'User not found' });

      const { title, description, task_type, due_at, priority, job_id, job_number, metadata } = req.body;
      if (!title || !due_at) {
        return res.status(400).json({ error: 'title and due_at are required' });
      }

      const result = await pool.query(
        `INSERT INTO agent_tasks (user_id, title, description, task_type, due_at, priority, job_id, job_number, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [userId, title, description || null, task_type || 'followup', due_at, priority || 'medium', job_id || null, job_number || null, metadata || {}]
      );

      return res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('[AgentTasks] Error creating:', err);
      return res.status(500).json({ error: 'Failed to create task' });
    }
  });

  // PUT /:id — update task (mark done, dismiss, reschedule)
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const userId = await resolveUserId(getRequestEmail(req));
      if (!userId) return res.status(401).json({ error: 'User not found' });

      const { status, due_at } = req.body;

      const result = await pool.query(
        `UPDATE agent_tasks SET
           status = COALESCE($3, status),
           due_at = COALESCE($4, due_at),
           completed_at = CASE WHEN $3 = 'done' THEN NOW() ELSE completed_at END
         WHERE id = $2 AND user_id = $1
         RETURNING *`,
        [userId, req.params.id, status || null, due_at || null]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      return res.json(result.rows[0]);
    } catch (err) {
      console.error('[AgentTasks] Error updating:', err);
      return res.status(500).json({ error: 'Failed to update task' });
    }
  });

  return router;
}

export default createAgentTaskRoutes;
