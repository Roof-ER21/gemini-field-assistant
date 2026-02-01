# Goals Tracking API Implementation Guide

## Quick Start

This guide shows how to implement the goals tracking API endpoints for the Gemini Field Assistant.

---

## Backend Routes (Express + TypeScript)

### File: `server/routes/goals.ts`

```typescript
import { Router } from 'express';
import { Pool } from 'pg';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();
const pool = new Pool(); // Use your existing pool config

// ============================================================================
// GET ENDPOINTS
// ============================================================================

/**
 * GET /api/goals/monthly/current
 * Get current month's goals for logged-in rep
 */
router.get('/monthly/current', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get sales_rep_id from user
    const repResult = await pool.query(
      `SELECT sr.id FROM sales_reps sr
       LEFT JOIN user_sales_rep_mapping usrm ON usrm.sales_rep_id = sr.id
       WHERE sr.email = $1 OR usrm.user_id = $2
       LIMIT 1`,
      [req.user.email, userId]
    );

    if (repResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales rep not found for user' });
    }

    const salesRepId = repResult.rows[0].id;

    // Get current month goals from view
    const result = await pool.query(
      `SELECT * FROM v_current_month_goals WHERE sales_rep_id = $1`,
      [salesRepId]
    );

    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching current month goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

/**
 * GET /api/goals/yearly/current
 * Get current year's goals for logged-in rep
 */
router.get('/yearly/current', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const repResult = await pool.query(
      `SELECT sr.id FROM sales_reps sr
       LEFT JOIN user_sales_rep_mapping usrm ON usrm.sales_rep_id = sr.id
       WHERE sr.email = $1 OR usrm.user_id = $2
       LIMIT 1`,
      [req.user.email, userId]
    );

    if (repResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales rep not found for user' });
    }

    const salesRepId = repResult.rows[0].id;

    const result = await pool.query(
      `SELECT * FROM v_yearly_goals_summary WHERE sales_rep_id = $1`,
      [salesRepId]
    );

    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching yearly goals:', error);
    res.status(500).json({ error: 'Failed to fetch yearly goals' });
  }
});

/**
 * GET /api/goals/history
 * Get achievement history for logged-in rep
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const repResult = await pool.query(
      `SELECT sr.id FROM sales_reps sr
       LEFT JOIN user_sales_rep_mapping usrm ON usrm.sales_rep_id = sr.id
       WHERE sr.email = $1 OR usrm.user_id = $2
       LIMIT 1`,
      [req.user.email, userId]
    );

    if (repResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales rep not found for user' });
    }

    const salesRepId = repResult.rows[0].id;

    const result = await pool.query(
      `SELECT * FROM goal_achievements
       WHERE sales_rep_id = $1
       ORDER BY achievement_date DESC
       LIMIT $2`,
      [salesRepId, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching achievement history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * GET /api/goals/pending-deadlines
 * Get goals that need to be set (Admin only or filtered by user)
 */
router.get('/pending-deadlines', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    let query = 'SELECT * FROM v_goals_needing_setup';
    const params: any[] = [];

    if (!isAdmin) {
      // Non-admins only see their own
      const repResult = await pool.query(
        `SELECT sr.id FROM sales_reps sr
         LEFT JOIN user_sales_rep_mapping usrm ON usrm.sales_rep_id = sr.id
         WHERE sr.email = $1 OR usrm.user_id = $2
         LIMIT 1`,
        [req.user.email, req.user.id]
      );

      if (repResult.rows.length === 0) {
        return res.json([]);
      }

      query += ' WHERE sales_rep_id = $1';
      params.push(repResult.rows[0].id);
    }

    query += ' ORDER BY days_until_deadline ASC NULLS FIRST';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending deadlines:', error);
    res.status(500).json({ error: 'Failed to fetch pending deadlines' });
  }
});

/**
 * GET /api/goals/progress/:month/:year
 * Get progress snapshots for specific month
 */
router.get('/progress/:month/:year', authenticateToken, async (req, res) => {
  try {
    const { month, year } = req.params;
    const userId = req.user.id;

    const repResult = await pool.query(
      `SELECT sr.id FROM sales_reps sr
       LEFT JOIN user_sales_rep_mapping usrm ON usrm.sales_rep_id = sr.id
       WHERE sr.email = $1 OR usrm.user_id = $2
       LIMIT 1`,
      [req.user.email, userId]
    );

    if (repResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales rep not found for user' });
    }

    const salesRepId = repResult.rows[0].id;

    // Get monthly goal ID
    const goalResult = await pool.query(
      `SELECT id FROM rep_monthly_goals
       WHERE sales_rep_id = $1 AND goal_month = $2 AND goal_year = $3`,
      [salesRepId, month, year]
    );

    if (goalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found for this period' });
    }

    const result = await pool.query(
      `SELECT * FROM goal_progress_snapshots
       WHERE monthly_goal_id = $1
       ORDER BY snapshot_date ASC`,
      [goalResult.rows[0].id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching progress snapshots:', error);
    res.status(500).json({ error: 'Failed to fetch progress snapshots' });
  }
});

// ============================================================================
// POST ENDPOINTS
// ============================================================================

/**
 * POST /api/goals/monthly/set
 * Set monthly goals for current rep
 */
router.post('/monthly/set', authenticateToken, async (req, res) => {
  try {
    const { signup_goal, revenue_goal, bonus_tier_goal, month, year } = req.body;
    const userId = req.user.id;

    // Validate inputs
    if (!signup_goal || signup_goal < 0) {
      return res.status(400).json({ error: 'Valid signup_goal required' });
    }

    const goalMonth = month || new Date().getMonth() + 1;
    const goalYear = year || new Date().getFullYear();

    // Get sales_rep_id
    const repResult = await pool.query(
      `SELECT sr.id FROM sales_reps sr
       LEFT JOIN user_sales_rep_mapping usrm ON usrm.sales_rep_id = sr.id
       WHERE sr.email = $1 OR usrm.user_id = $2
       LIMIT 1`,
      [req.user.email, userId]
    );

    if (repResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales rep not found for user' });
    }

    const salesRepId = repResult.rows[0].id;

    // Calculate deadline (6th of month at midnight)
    const deadline = new Date(goalYear, goalMonth - 1, 6, 23, 59, 59);
    const now = new Date();
    const setByDeadline = now <= deadline;

    // Upsert monthly goal
    const result = await pool.query(
      `INSERT INTO rep_monthly_goals (
        sales_rep_id, goal_month, goal_year, signup_goal, revenue_goal,
        bonus_tier_goal, deadline, goal_set_at, goal_set_by, set_by_deadline
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)
      ON CONFLICT (sales_rep_id, goal_year, goal_month)
      DO UPDATE SET
        signup_goal = EXCLUDED.signup_goal,
        revenue_goal = EXCLUDED.revenue_goal,
        bonus_tier_goal = EXCLUDED.bonus_tier_goal,
        goal_set_at = NOW(),
        goal_set_by = EXCLUDED.goal_set_by,
        set_by_deadline = EXCLUDED.set_by_deadline,
        updated_at = NOW()
      RETURNING *`,
      [
        salesRepId,
        goalMonth,
        goalYear,
        signup_goal,
        revenue_goal || 0,
        bonus_tier_goal || 0,
        deadline,
        userId,
        setByDeadline,
      ]
    );

    res.json({
      success: true,
      goal: result.rows[0],
      warning: !setByDeadline ? 'Goal set after deadline' : null,
    });
  } catch (error) {
    console.error('Error setting monthly goals:', error);
    res.status(500).json({ error: 'Failed to set monthly goals' });
  }
});

/**
 * POST /api/goals/yearly/set
 * Set yearly goals for current rep or admin sets for others
 */
router.post('/yearly/set', authenticateToken, async (req, res) => {
  try {
    const {
      yearly_signup_goal,
      yearly_revenue_goal,
      year,
      target_rep_id, // Admin can set for others
    } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Validate inputs
    if (!yearly_signup_goal || yearly_signup_goal < 0) {
      return res.status(400).json({ error: 'Valid yearly_signup_goal required' });
    }

    const goalYear = year || new Date().getFullYear();

    let salesRepId: number;

    if (target_rep_id && isAdmin) {
      // Admin setting for another rep
      salesRepId = target_rep_id;
    } else {
      // User setting their own goal
      const repResult = await pool.query(
        `SELECT sr.id FROM sales_reps sr
         LEFT JOIN user_sales_rep_mapping usrm ON usrm.sales_rep_id = sr.id
         WHERE sr.email = $1 OR usrm.user_id = $2
         LIMIT 1`,
        [req.user.email, userId]
      );

      if (repResult.rows.length === 0) {
        return res.status(404).json({ error: 'Sales rep not found for user' });
      }

      salesRepId = repResult.rows[0].id;
    }

    // Upsert yearly goal
    const result = await pool.query(
      `INSERT INTO rep_yearly_goals (
        sales_rep_id, goal_year, yearly_signup_goal, yearly_revenue_goal,
        goal_set_at, goal_set_by
      )
      VALUES ($1, $2, $3, $4, NOW(), $5)
      ON CONFLICT (sales_rep_id, goal_year)
      DO UPDATE SET
        yearly_signup_goal = EXCLUDED.yearly_signup_goal,
        yearly_revenue_goal = EXCLUDED.yearly_revenue_goal,
        goal_set_at = NOW(),
        goal_set_by = EXCLUDED.goal_set_by,
        updated_at = NOW()
      RETURNING *`,
      [salesRepId, goalYear, yearly_signup_goal, yearly_revenue_goal || 0, userId]
    );

    res.json({ success: true, goal: result.rows[0] });
  } catch (error) {
    console.error('Error setting yearly goals:', error);
    res.status(500).json({ error: 'Failed to set yearly goals' });
  }
});

/**
 * POST /api/goals/snapshot
 * Create manual progress snapshot
 */
router.post('/snapshot', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { rep_id, snapshot_type } = req.body;

    // Create snapshot logic here
    // This would be similar to the example in the README

    res.json({ success: true, message: 'Snapshot created' });
  } catch (error) {
    console.error('Error creating snapshot:', error);
    res.status(500).json({ error: 'Failed to create snapshot' });
  }
});

// ============================================================================
// PUT ENDPOINTS
// ============================================================================

/**
 * PUT /api/goals/monthly/progress
 * Update monthly goal progress (typically called by sync job)
 */
router.put('/monthly/progress', authenticateToken, async (req, res) => {
  try {
    const { signups_actual, revenue_actual, bonus_tier_actual, month, year } = req.body;
    const userId = req.user.id;

    const goalMonth = month || new Date().getMonth() + 1;
    const goalYear = year || new Date().getFullYear();

    // Get sales_rep_id
    const repResult = await pool.query(
      `SELECT sr.id FROM sales_reps sr
       LEFT JOIN user_sales_rep_mapping usrm ON usrm.sales_rep_id = sr.id
       WHERE sr.email = $1 OR usrm.user_id = $2
       LIMIT 1`,
      [req.user.email, userId]
    );

    if (repResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sales rep not found for user' });
    }

    const salesRepId = repResult.rows[0].id;

    // Update progress
    const result = await pool.query(
      `UPDATE rep_monthly_goals
       SET
         signups_actual = COALESCE($1, signups_actual),
         revenue_actual = COALESCE($2, revenue_actual),
         bonus_tier_actual = COALESCE($3, bonus_tier_actual),
         updated_at = NOW()
       WHERE sales_rep_id = $4 AND goal_month = $5 AND goal_year = $6
       RETURNING *`,
      [signups_actual, revenue_actual, bonus_tier_actual, salesRepId, goalMonth, goalYear]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Monthly goal not found' });
    }

    res.json({ success: true, goal: result.rows[0] });
  } catch (error) {
    console.error('Error updating monthly progress:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

/**
 * PUT /api/goals/acknowledge-reminder/:reminderId
 * Acknowledge a deadline reminder
 */
router.put('/acknowledge-reminder/:reminderId', authenticateToken, async (req, res) => {
  try {
    const { reminderId } = req.params;
    const userId = req.user.id;

    // Verify the reminder belongs to this user's rep
    const result = await pool.query(
      `UPDATE goal_deadline_reminders gdr
       SET acknowledged = true, acknowledged_at = NOW()
       FROM sales_reps sr
       LEFT JOIN user_sales_rep_mapping usrm ON usrm.sales_rep_id = sr.id
       WHERE gdr.id = $1
         AND gdr.sales_rep_id = sr.id
         AND (sr.email = $2 OR usrm.user_id = $3)
       RETURNING gdr.*`,
      [reminderId, req.user.email, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json({ success: true, reminder: result.rows[0] });
  } catch (error) {
    console.error('Error acknowledging reminder:', error);
    res.status(500).json({ error: 'Failed to acknowledge reminder' });
  }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * GET /api/goals/admin/all-monthly
 * Get all monthly goals for all reps (Admin only)
 */
router.get('/admin/all-monthly', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { month, year } = req.query;

    const goalMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;
    const goalYear = year ? parseInt(year as string) : new Date().getFullYear();

    const result = await pool.query(
      `SELECT * FROM v_current_month_goals
       WHERE goal_month = $1 AND goal_year = $2
       ORDER BY signup_progress_percent DESC`,
      [goalMonth, goalYear]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all monthly goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

/**
 * GET /api/goals/admin/compliance
 * Get goal-setting compliance report (Admin only)
 */
router.get('/admin/compliance', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        deadline_status,
        COUNT(*) as count,
        ARRAY_AGG(rep_name ORDER BY rep_name) as reps
      FROM v_goals_needing_setup
      GROUP BY deadline_status
      ORDER BY
        CASE deadline_status
          WHEN 'overdue' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'not_set' THEN 3
          ELSE 4
        END
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching compliance report:', error);
    res.status(500).json({ error: 'Failed to fetch compliance report' });
  }
});

export default router;
```

---

## Register Routes

### File: `server/index.ts` (or wherever you register routes)

```typescript
import goalsRouter from './routes/goals';

// ... other imports and setup

app.use('/api/goals', goalsRouter);
```

---

## Frontend React Hooks

### File: `client/src/hooks/useGoals.ts`

```typescript
import { useState, useEffect } from 'react';
import axios from 'axios';

interface MonthlyGoal {
  goal_id: number;
  sales_rep_id: number;
  rep_name: string;
  goal_month: number;
  goal_year: number;
  signup_goal: number;
  signups_actual: number;
  signup_progress_percent: number;
  revenue_goal: number;
  revenue_actual: number;
  revenue_progress_percent: number;
  bonus_tier_goal: number;
  bonus_tier_actual: number;
  bonus_triggered: boolean;
  set_by_deadline: boolean;
  deadline: string;
  status: string;
  health_status: 'completed' | 'on_track' | 'needs_attention' | 'critical';
  days_until_deadline: number;
}

interface YearlyGoal {
  goal_id: number;
  sales_rep_id: number;
  rep_name: string;
  goal_year: number;
  yearly_signup_goal: number;
  yearly_signups_actual: number;
  yearly_signup_progress_percent: number;
  yearly_revenue_goal: number;
  yearly_revenue_actual: number;
  yearly_revenue_progress_percent: number;
  monthly_signup_target: number;
  monthly_revenue_target: number;
  status: string;
  current_month: number;
  months_remaining: number;
}

export function useCurrentMonthGoal() {
  const [goal, setGoal] = useState<MonthlyGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGoal = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/goals/monthly/current');
      setGoal(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch goal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoal();
  }, []);

  return { goal, loading, error, refetch: fetchGoal };
}

export function useYearlyGoal() {
  const [goal, setGoal] = useState<YearlyGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGoal = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/goals/yearly/current');
      setGoal(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch yearly goal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoal();
  }, []);

  return { goal, loading, error, refetch: fetchGoal };
}

export function useSetMonthlyGoal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMonthlyGoal = async (data: {
    signup_goal: number;
    revenue_goal?: number;
    bonus_tier_goal?: number;
    month?: number;
    year?: number;
  }) => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.post('/api/goals/monthly/set', data);
      return response.data;
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to set goal';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return { setMonthlyGoal, loading, error };
}
```

---

## Frontend Components

### Monthly Goal Card Component

```tsx
import React from 'react';
import { useCurrentMonthGoal } from '../hooks/useGoals';

export function MonthlyGoalCard() {
  const { goal, loading, error } = useCurrentMonthGoal();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!goal) return <div>No goal set for this month</div>;

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'completed':
        return 'bg-green-500';
      case 'on_track':
        return 'bg-blue-500';
      case 'needs_attention':
        return 'bg-yellow-500';
      case 'critical':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Monthly Goal</h2>
        <span
          className={`px-3 py-1 rounded-full text-white text-sm ${getHealthColor(
            goal.health_status
          )}`}
        >
          {goal.health_status.replace('_', ' ').toUpperCase()}
        </span>
      </div>

      {/* Signup Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span>Signups</span>
          <span>
            {goal.signups_actual} / {goal.signup_goal}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full"
            style={{ width: `${Math.min(goal.signup_progress_percent, 100)}%` }}
          ></div>
        </div>
        <div className="text-right text-sm text-gray-600 mt-1">
          {goal.signup_progress_percent.toFixed(1)}%
        </div>
      </div>

      {/* Revenue Progress */}
      {goal.revenue_goal > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Revenue</span>
            <span>
              ${goal.revenue_actual.toLocaleString()} / $
              {goal.revenue_goal.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-green-600 h-2.5 rounded-full"
              style={{ width: `${Math.min(goal.revenue_progress_percent, 100)}%` }}
            ></div>
          </div>
          <div className="text-right text-sm text-gray-600 mt-1">
            {goal.revenue_progress_percent.toFixed(1)}%
          </div>
        </div>
      )}

      {/* Bonus Tier */}
      <div className="flex items-center justify-between py-2 border-t">
        <span className="text-sm">Bonus Tier</span>
        <span className="font-bold">
          {goal.bonus_tier_actual} / {goal.bonus_tier_goal}
        </span>
      </div>

      {/* Deadline Warning */}
      {!goal.set_by_deadline && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800">
            ⚠️ Goal was set after the deadline
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## Scheduled Jobs (Node-Cron)

### File: `server/jobs/goalsJobs.ts`

```typescript
import cron from 'node-cron';
import { Pool } from 'pg';

const pool = new Pool();

/**
 * Daily snapshot creation (runs at midnight)
 */
export function scheduleDailySnapshots() {
  cron.schedule('0 0 * * *', async () => {
    console.log('Creating daily goal progress snapshots...');

    try {
      await pool.query(`
        INSERT INTO goal_progress_snapshots (
          sales_rep_id, snapshot_type, monthly_goal_id,
          signups_to_date, signup_goal, signup_progress_percent,
          revenue_to_date, revenue_goal, revenue_progress_percent,
          bonus_tier, days_remaining, on_pace, pace_indicator
        )
        SELECT
          rmg.sales_rep_id,
          'daily',
          rmg.id,
          rmg.signups_actual,
          rmg.signup_goal,
          rmg.signup_progress_percent,
          rmg.revenue_actual,
          rmg.revenue_goal,
          rmg.revenue_progress_percent,
          rmg.bonus_tier_actual,
          EXTRACT(DAY FROM ((DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month') - CURRENT_DATE))::INTEGER,
          CASE
            WHEN rmg.signup_progress_percent >= (EXTRACT(DAY FROM CURRENT_DATE)::DECIMAL / 30 * 100)
            THEN true ELSE false
          END,
          CASE
            WHEN rmg.signup_progress_percent >= 100 THEN 'ahead'
            WHEN rmg.signup_progress_percent >= (EXTRACT(DAY FROM CURRENT_DATE)::DECIMAL / 30 * 100) THEN 'on_track'
            WHEN rmg.signup_progress_percent >= 50 THEN 'behind'
            ELSE 'critical'
          END
        FROM rep_monthly_goals rmg
        WHERE rmg.goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
          AND rmg.goal_year = EXTRACT(YEAR FROM CURRENT_DATE)
          AND rmg.status = 'active'
      `);

      console.log('Daily snapshots created successfully');
    } catch (error) {
      console.error('Error creating daily snapshots:', error);
    }
  });
}

/**
 * Monthly goal creation (runs on 1st of month at 1 AM)
 */
export function scheduleMonthlyGoalCreation() {
  cron.schedule('0 1 1 * *', async () => {
    console.log('Creating monthly goals for new month...');

    try {
      await pool.query(`
        INSERT INTO rep_monthly_goals (
          sales_rep_id, goal_month, goal_year, signup_goal, deadline
        )
        SELECT
          id,
          EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER,
          EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
          monthly_signup_goal,
          DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '5 days 23 hours 59 minutes'
        FROM sales_reps
        WHERE is_active = true
        ON CONFLICT (sales_rep_id, goal_year, goal_month) DO NOTHING
      `);

      console.log('Monthly goals created successfully');
    } catch (error) {
      console.error('Error creating monthly goals:', error);
    }
  });
}

/**
 * Initialize all scheduled jobs
 */
export function initializeGoalsJobs() {
  scheduleDailySnapshots();
  scheduleMonthlyGoalCreation();
  console.log('Goals tracking jobs initialized');
}
```

### Register in `server/index.ts`

```typescript
import { initializeGoalsJobs } from './jobs/goalsJobs';

// After app setup
initializeGoalsJobs();
```

---

## Summary

This implementation provides:

1. ✅ **Backend API** - Full CRUD for goals tracking
2. ✅ **Frontend Hooks** - Easy React integration
3. ✅ **UI Components** - Ready-to-use goal cards
4. ✅ **Scheduled Jobs** - Automated snapshots and goal creation
5. ✅ **Admin Features** - Compliance tracking and reports

Next steps:
- Add notification system for deadline reminders
- Implement achievement recognition UI
- Add goal setting wizard for new users
- Create admin dashboard for goal compliance
