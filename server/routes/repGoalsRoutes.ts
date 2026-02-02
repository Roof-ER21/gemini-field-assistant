/**
 * Rep Goals API Routes
 * Provides endpoints for individual sales rep goal tracking and progress
 */

import { Router, Request, Response } from 'express';
import type { Pool } from 'pg';

export function createRepGoalsRoutes(pool: Pool) {
  const router = Router();

  /**
   * GET /api/rep/goals
   * Get current user's goals (monthly and yearly)
   */
  router.get('/goals', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          error: 'User email required'
        });
      }

      const result = await pool.query(
        `SELECT
          monthly_signup_goal,
          yearly_signup_goal
         FROM sales_reps
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [userEmail]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Rep not found',
          hint: 'User may not be synced from Google Sheets'
        });
      }

      const rep = result.rows[0];

      res.json({
        success: true,
        goals: {
          monthly: {
            signups: rep.monthly_signup_goal || 15,
            revenue: 0  // Revenue goals not yet implemented
          },
          yearly: {
            signups: rep.yearly_signup_goal || 180,
            revenue: 0  // Revenue goals not yet implemented
          }
        }
      });
    } catch (error) {
      console.error('❌ Rep goals fetch error:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  /**
   * GET /api/rep/goals/progress
   * Get current user's progress toward goals
   */
  router.get('/goals/progress', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!userEmail) {
        return res.status(401).json({
          success: false,
          error: 'User email required'
        });
      }

      // Get current month/year
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const currentDay = now.getDate();
      const daysRemaining = daysInMonth - currentDay;

      // Get rep data with goals
      const repResult = await pool.query(
        `SELECT
          id,
          name,
          monthly_signups,
          monthly_revenue,
          yearly_signups,
          yearly_revenue,
          monthly_signup_goal,
          yearly_signup_goal,
          goal_progress
         FROM sales_reps
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [userEmail]
      );

      if (repResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Rep not found'
        });
      }

      const rep = repResult.rows[0];

      // Get monthly history (last 6 months)
      const monthlyHistoryResult = await pool.query(
        `SELECT
          year,
          month,
          signups,
          revenue
         FROM sales_rep_monthly_metrics
         WHERE sales_rep_id = $1
         ORDER BY year DESC, month DESC
         LIMIT 6`,
        [rep.id]
      );

      // Calculate progress percentages
      const monthlySignupsGoal = rep.monthly_signup_goal || 15;
      const yearlySignupsGoal = rep.yearly_signup_goal || 180;
      // Revenue goals not yet implemented in sales_reps table
      const monthlyRevenueGoal = 0;
      const yearlyRevenueGoal = 0;

      const monthlySignupsProgress = monthlySignupsGoal > 0
        ? Math.min((rep.monthly_signups / monthlySignupsGoal) * 100, 100)
        : 0;

      const yearlySignupsProgress = yearlySignupsGoal > 0
        ? Math.min((rep.yearly_signups / yearlySignupsGoal) * 100, 100)
        : 0;

      const monthlyRevenueProgress = monthlyRevenueGoal > 0
        ? Math.min((rep.monthly_revenue / monthlyRevenueGoal) * 100, 100)
        : 0;

      const yearlyRevenueProgress = yearlyRevenueGoal > 0
        ? Math.min((rep.yearly_revenue / yearlyRevenueGoal) * 100, 100)
        : 0;

      // Determine status
      const getStatus = (progress: number, daysRemaining: number, totalDays: number) => {
        const expectedProgress = ((totalDays - daysRemaining) / totalDays) * 100;
        if (progress >= 100) return 'completed';
        if (progress >= expectedProgress + 10) return 'ahead';
        if (progress >= expectedProgress - 10) return 'on-track';
        return 'behind';
      };

      const monthlyStatus = getStatus(monthlySignupsProgress, daysRemaining, daysInMonth);

      // Get leaderboard rank using ROW_NUMBER for consistency with leaderboard
      const rankResult = await pool.query(
        `WITH ranked AS (
           SELECT id, ROW_NUMBER() OVER (ORDER BY monthly_signups DESC, name ASC) as rank
           FROM sales_reps
           WHERE is_active = true
         )
         SELECT rank FROM ranked WHERE id = $1`,
        [rep.id]
      );

      const totalActiveResult = await pool.query(
        `SELECT COUNT(*) as total FROM sales_reps WHERE is_active = true`
      );

      const rank = parseInt(rankResult.rows[0]?.rank) || 0;
      const totalActive = parseInt(totalActiveResult.rows[0]?.total) || 1;

      res.json({
        success: true,
        progress: {
          monthly: {
            signups: {
              current: rep.monthly_signups || 0,
              goal: monthlySignupsGoal,
              percentage: Math.round(monthlySignupsProgress * 10) / 10,
              remaining: Math.max(0, monthlySignupsGoal - (rep.monthly_signups || 0)),
              status: monthlyStatus
            },
            revenue: {
              current: rep.monthly_revenue || 0,
              goal: monthlyRevenueGoal,
              percentage: Math.round(monthlyRevenueProgress * 10) / 10,
              remaining: Math.max(0, monthlyRevenueGoal - (rep.monthly_revenue || 0))
            }
          },
          yearly: {
            signups: {
              current: rep.yearly_signups || 0,
              goal: yearlySignupsGoal,
              percentage: Math.round(yearlySignupsProgress * 10) / 10,
              remaining: Math.max(0, yearlySignupsGoal - (rep.yearly_signups || 0)),
              monthlyAverageNeeded: Math.ceil((yearlySignupsGoal - (rep.yearly_signups || 0)) / Math.max(1, 12 - currentMonth + 1))
            },
            revenue: {
              current: rep.yearly_revenue || 0,
              goal: yearlyRevenueGoal,
              percentage: Math.round(yearlyRevenueProgress * 10) / 10,
              remaining: Math.max(0, yearlyRevenueGoal - (rep.yearly_revenue || 0)),
              monthlyAverageNeeded: Math.ceil((yearlyRevenueGoal - (rep.yearly_revenue || 0)) / Math.max(1, 12 - currentMonth + 1))
            }
          },
          calendar: {
            year: currentYear,
            month: currentMonth,
            daysInMonth,
            currentDay,
            daysRemaining
          },
          leaderboard: {
            rank,
            totalActive,
            percentile: rank > 0 && totalActive > 0 ? Math.round((1 - rank / totalActive) * 100) : 0
          }
        },
        history: monthlyHistoryResult.rows.map(row => ({
          year: row.year,
          month: row.month,
          signups: row.signups || 0,
          revenue: row.revenue || 0
        }))
      });
    } catch (error) {
      console.error('❌ Rep goals progress error:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  return router;
}

export default createRepGoalsRoutes;
