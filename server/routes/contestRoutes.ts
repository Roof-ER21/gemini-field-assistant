/**
 * Contest API Routes
 * Provides endpoints for sales contest management and leaderboards
 */

import { Router, Request, Response } from 'express';
import type { Pool } from 'pg';

export function createContestRoutes(pool: Pool): Router {
  const router = Router();

  // ============================================================================
  // PUBLIC ENDPOINTS (for all users)
  // ============================================================================

  /**
   * GET /api/contests
   * List all contests with optional filters
   */
  router.get('/contests', async (req: Request, res: Response) => {
    try {
      const { active, past, type } = req.query;

      let query = `
        SELECT
          c.*,
          u.name as created_by_name,
          u.email as created_by_email,
          (SELECT COUNT(*) FROM contest_participants WHERE contest_id = c.id) as participant_count,
          (SELECT MAX(updated_at) FROM contest_standings WHERE contest_id = c.id) as standings_last_updated
        FROM contests c
        LEFT JOIN users u ON c.created_by = u.id
        WHERE 1=1
      `;

      const params: any[] = [];

      // Filter by active/past
      if (active === 'true') {
        query += ` AND c.is_active = true AND c.end_date >= CURRENT_DATE`;
      } else if (past === 'true') {
        query += ` AND (c.is_active = false OR c.end_date < CURRENT_DATE)`;
      }

      // Filter by type
      if (type && ['company_wide', 'team_based', 'individual'].includes(type as string)) {
        params.push(type);
        query += ` AND c.contest_type = $${params.length}`;
      }

      query += ` ORDER BY c.start_date DESC, c.created_at DESC`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        contests: result.rows
      });
    } catch (error: any) {
      console.error('Error fetching contests:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/contests/:id
   * Get contest details with standings
   */
  router.get('/contests/:id', async (req: Request, res: Response) => {
    try {
      const contestId = parseInt(req.params.id);

      // Get contest details
      const contestResult = await pool.query(
        `
        SELECT
          c.*,
          u.name as created_by_name,
          u.email as created_by_email,
          (SELECT COUNT(*) FROM contest_participants WHERE contest_id = c.id) as participant_count
        FROM contests c
        LEFT JOIN users u ON c.created_by = u.id
        WHERE c.id = $1
        `,
        [contestId]
      );

      if (contestResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contest not found'
        });
      }

      const contest = contestResult.rows[0];

      // Get standings
      const standingsResult = await pool.query(
        `
        SELECT
          cs.*,
          sr.name as rep_name,
          sr.email as rep_email,
          t.name as actual_team_name
        FROM contest_standings cs
        LEFT JOIN sales_reps sr ON cs.sales_rep_id = sr.id
        LEFT JOIN teams t ON sr.team_id = t.id
        WHERE cs.contest_id = $1
        ORDER BY cs.rank ASC NULLS LAST
        `,
        [contestId]
      );

      // Get participants (for team-based contests)
      const participantsResult = await pool.query(
        `
        SELECT
          cp.*,
          sr.name as rep_name,
          sr.email as rep_email,
          t.name as actual_team_name
        FROM contest_participants cp
        JOIN sales_reps sr ON cp.sales_rep_id = sr.id
        LEFT JOIN teams t ON sr.team_id = t.id
        WHERE cp.contest_id = $1
        ORDER BY cp.team_name, sr.name
        `,
        [contestId]
      );

      res.json({
        success: true,
        contest,
        standings: standingsResult.rows,
        participants: participantsResult.rows
      });
    } catch (error: any) {
      console.error('Error fetching contest details:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/contests/:id/my-standing
   * Get current user's standing in a contest
   */
  router.get('/contests/:id/my-standing', async (req: Request, res: Response) => {
    try {
      const contestId = parseInt(req.params.id);
      const userEmail = req.header('x-user-email')?.toLowerCase().trim();

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          error: 'User email required'
        });
      }

      // Find sales rep by email or mapping
      const repResult = await pool.query(
        `
        SELECT sr.id
        FROM sales_reps sr
        LEFT JOIN user_sales_rep_mapping m ON sr.id = m.sales_rep_id
        LEFT JOIN users u ON m.user_id = u.id
        WHERE LOWER(sr.email) = $1 OR LOWER(u.email) = $1
        LIMIT 1
        `,
        [userEmail]
      );

      if (repResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Sales rep not found for this user'
        });
      }

      const repId = repResult.rows[0].id;

      // Get standing
      const standingResult = await pool.query(
        `
        SELECT
          cs.*,
          sr.name as rep_name,
          c.metric_type,
          c.contest_type
        FROM contest_standings cs
        LEFT JOIN sales_reps sr ON cs.sales_rep_id = sr.id
        JOIN contests c ON cs.contest_id = c.id
        WHERE cs.contest_id = $1 AND cs.sales_rep_id = $2
        `,
        [contestId, repId]
      );

      // Get total participants
      const totalResult = await pool.query(
        `
        SELECT COUNT(DISTINCT
          CASE
            WHEN c.contest_type = 'team_based' THEN cs.team_name
            ELSE cs.sales_rep_id::text
          END
        ) as total
        FROM contest_standings cs
        JOIN contests c ON cs.contest_id = c.id
        WHERE cs.contest_id = $1
        `,
        [contestId]
      );

      res.json({
        success: true,
        standing: standingResult.rows[0] || null,
        total_participants: totalResult.rows[0]?.total || 0
      });
    } catch (error: any) {
      console.error('Error fetching user standing:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ADMIN ENDPOINTS
  // ============================================================================

  /**
   * POST /api/admin/contests
   * Create new contest
   */
  router.post('/admin/contests', async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        contest_type,
        metric_type,
        start_date,
        end_date,
        is_monthly,
        prize_description,
        rules,
        participants
      } = req.body;

      const userEmail = req.header('x-user-email')?.toLowerCase().trim();

      // Get user ID
      let userId = null;
      if (userEmail) {
        const userResult = await pool.query(
          'SELECT id FROM users WHERE LOWER(email) = $1',
          [userEmail]
        );
        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;
        }
      }

      // Validate required fields
      if (!name || !contest_type || !metric_type || !start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, contest_type, metric_type, start_date, end_date'
        });
      }

      // Validate types
      if (!['company_wide', 'team_based', 'individual'].includes(contest_type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid contest_type. Must be: company_wide, team_based, or individual'
        });
      }

      if (!['signups', 'revenue', 'both'].includes(metric_type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid metric_type. Must be: signups, revenue, or both'
        });
      }

      // Create contest
      const contestResult = await pool.query(
        `
        INSERT INTO contests (
          name, description, contest_type, metric_type,
          start_date, end_date, is_monthly,
          prize_description, rules, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        `,
        [
          name,
          description || null,
          contest_type,
          metric_type,
          start_date,
          end_date,
          is_monthly || false,
          prize_description || null,
          rules || null,
          userId
        ]
      );

      const contest = contestResult.rows[0];

      // Add participants if provided (for individual or team_based contests)
      if (participants && Array.isArray(participants) && participants.length > 0) {
        for (const participant of participants) {
          await pool.query(
            `
            INSERT INTO contest_participants (
              contest_id, sales_rep_id, team_name, is_team_leader
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (contest_id, sales_rep_id) DO NOTHING
            `,
            [
              contest.id,
              participant.sales_rep_id,
              participant.team_name || null,
              participant.is_team_leader || false
            ]
          );
        }
      }

      // Refresh standings
      await pool.query('SELECT refresh_contest_standings($1)', [contest.id]);

      res.status(201).json({
        success: true,
        contest
      });
    } catch (error: any) {
      console.error('Error creating contest:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * PUT /api/admin/contests/:id
   * Update contest
   */
  router.put('/admin/contests/:id', async (req: Request, res: Response) => {
    try {
      const contestId = parseInt(req.params.id);
      const {
        name,
        description,
        contest_type,
        metric_type,
        start_date,
        end_date,
        is_monthly,
        prize_description,
        rules,
        is_active
      } = req.body;

      // Build update query dynamically
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(description);
      }
      if (contest_type !== undefined) {
        if (!['company_wide', 'team_based', 'individual'].includes(contest_type)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid contest_type'
          });
        }
        updates.push(`contest_type = $${paramCount++}`);
        values.push(contest_type);
      }
      if (metric_type !== undefined) {
        if (!['signups', 'revenue', 'both'].includes(metric_type)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid metric_type'
          });
        }
        updates.push(`metric_type = $${paramCount++}`);
        values.push(metric_type);
      }
      if (start_date !== undefined) {
        updates.push(`start_date = $${paramCount++}`);
        values.push(start_date);
      }
      if (end_date !== undefined) {
        updates.push(`end_date = $${paramCount++}`);
        values.push(end_date);
      }
      if (is_monthly !== undefined) {
        updates.push(`is_monthly = $${paramCount++}`);
        values.push(is_monthly);
      }
      if (prize_description !== undefined) {
        updates.push(`prize_description = $${paramCount++}`);
        values.push(prize_description);
      }
      if (rules !== undefined) {
        updates.push(`rules = $${paramCount++}`);
        values.push(rules);
      }
      if (is_active !== undefined) {
        updates.push(`is_active = $${paramCount++}`);
        values.push(is_active);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
      }

      values.push(contestId);
      const query = `
        UPDATE contests
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contest not found'
        });
      }

      // Refresh standings if dates or metrics changed
      if (start_date || end_date || metric_type || contest_type) {
        await pool.query('SELECT refresh_contest_standings($1)', [contestId]);
      }

      res.json({
        success: true,
        contest: result.rows[0]
      });
    } catch (error: any) {
      console.error('Error updating contest:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * DELETE /api/admin/contests/:id
   * Delete contest
   */
  router.delete('/admin/contests/:id', async (req: Request, res: Response) => {
    try {
      const contestId = parseInt(req.params.id);

      const result = await pool.query(
        'DELETE FROM contests WHERE id = $1 RETURNING id',
        [contestId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contest not found'
        });
      }

      res.json({
        success: true,
        message: 'Contest deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting contest:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/admin/contests/:id/participants
   * Add participants to contest
   */
  router.post('/admin/contests/:id/participants', async (req: Request, res: Response) => {
    try {
      const contestId = parseInt(req.params.id);
      const { participants } = req.body;

      if (!Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'participants array required'
        });
      }

      // Add each participant
      const added = [];
      for (const participant of participants) {
        if (!participant.sales_rep_id) {
          continue;
        }

        const result = await pool.query(
          `
          INSERT INTO contest_participants (
            contest_id, sales_rep_id, team_name, is_team_leader
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (contest_id, sales_rep_id) DO UPDATE
          SET team_name = EXCLUDED.team_name,
              is_team_leader = EXCLUDED.is_team_leader
          RETURNING *
          `,
          [
            contestId,
            participant.sales_rep_id,
            participant.team_name || null,
            participant.is_team_leader || false
          ]
        );

        added.push(result.rows[0]);
      }

      // Refresh standings
      await pool.query('SELECT refresh_contest_standings($1)', [contestId]);

      res.json({
        success: true,
        added_count: added.length,
        participants: added
      });
    } catch (error: any) {
      console.error('Error adding participants:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * DELETE /api/admin/contests/:id/participants/:repId
   * Remove participant from contest
   */
  router.delete('/admin/contests/:id/participants/:repId', async (req: Request, res: Response) => {
    try {
      const contestId = parseInt(req.params.id);
      const repId = parseInt(req.params.repId);

      const result = await pool.query(
        'DELETE FROM contest_participants WHERE contest_id = $1 AND sales_rep_id = $2 RETURNING id',
        [contestId, repId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Participant not found in this contest'
        });
      }

      // Refresh standings
      await pool.query('SELECT refresh_contest_standings($1)', [contestId]);

      res.json({
        success: true,
        message: 'Participant removed successfully'
      });
    } catch (error: any) {
      console.error('Error removing participant:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/admin/contests/:id/refresh-standings
   * Manually refresh contest standings
   */
  router.post('/admin/contests/:id/refresh-standings', async (req: Request, res: Response) => {
    try {
      const contestId = parseInt(req.params.id);

      // Check contest exists
      const contestResult = await pool.query(
        'SELECT id FROM contests WHERE id = $1',
        [contestId]
      );

      if (contestResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contest not found'
        });
      }

      // Refresh standings
      await pool.query('SELECT refresh_contest_standings($1)', [contestId]);

      // Get updated standings
      const standingsResult = await pool.query(
        `
        SELECT
          cs.*,
          sr.name as rep_name,
          sr.email as rep_email
        FROM contest_standings cs
        LEFT JOIN sales_reps sr ON cs.sales_rep_id = sr.id
        WHERE cs.contest_id = $1
        ORDER BY cs.rank ASC NULLS LAST
        `,
        [contestId]
      );

      res.json({
        success: true,
        message: 'Standings refreshed successfully',
        standings: standingsResult.rows
      });
    } catch (error: any) {
      console.error('Error refreshing standings:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}
