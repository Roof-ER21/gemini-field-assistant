/**
 * QR Analytics Routes
 * API endpoints for QR scan tracking and analytics
 */

import { Router, Request, Response } from 'express';
import type { Pool } from 'pg';

export function createQRAnalyticsRoutes(pool: Pool) {
  const router = Router();

  // Helper: Check if user is admin
  async function isAdminUser(email?: string): Promise<boolean> {
    if (!email) return false;
    try {
      const result = await pool.query(
        'SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email]
      );
      return result.rows[0]?.role === 'admin';
    } catch (error) {
      console.error('❌ QR Analytics admin check failed:', error);
      return false;
    }
  }

  /**
   * GET /api/qr-analytics/summary
   * Get QR scan summary stats
   */
  router.get('/summary', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const result = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE scanned_at > NOW() - INTERVAL '1 day') as scans_today,
          COUNT(*) FILTER (WHERE scanned_at > NOW() - INTERVAL '7 days') as scans_week,
          COUNT(*) FILTER (WHERE scanned_at > NOW() - INTERVAL '30 days') as scans_month,
          COUNT(*) as scans_all_time,
          COUNT(DISTINCT ip_hash) FILTER (WHERE scanned_at > NOW() - INTERVAL '30 days') as unique_visitors_month,
          COUNT(DISTINCT profile_slug) FILTER (WHERE scanned_at > NOW() - INTERVAL '30 days') as profiles_scanned_month
        FROM qr_scans
      `);

      const stats = result.rows[0];

      res.json({
        success: true,
        scansToday: parseInt(stats.scans_today),
        scansThisWeek: parseInt(stats.scans_week),
        scansThisMonth: parseInt(stats.scans_month),
        scansAllTime: parseInt(stats.scans_all_time),
        uniqueVisitorsMonth: parseInt(stats.unique_visitors_month),
        profilesScannedMonth: parseInt(stats.profiles_scanned_month)
      });
    } catch (error) {
      console.error('❌ QR analytics summary error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get analytics'
      });
    }
  });

  /**
   * GET /api/qr-analytics/daily
   * Get daily scan counts for chart
   */
  router.get('/daily', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const days = parseInt(req.query.days as string) || 30;

      const result = await pool.query(`
        SELECT
          DATE(scanned_at) as date,
          COUNT(*) as scans,
          COUNT(DISTINCT ip_hash) as unique_visitors
        FROM qr_scans
        WHERE scanned_at > NOW() - INTERVAL '${Math.min(days, 90)} days'
        GROUP BY DATE(scanned_at)
        ORDER BY date ASC
      `);

      res.json({
        success: true,
        days,
        data: result.rows.map(row => ({
          date: row.date,
          scans: parseInt(row.scans),
          uniqueVisitors: parseInt(row.unique_visitors)
        }))
      });
    } catch (error) {
      console.error('❌ QR analytics daily error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get daily analytics'
      });
    }
  });

  /**
   * GET /api/qr-analytics/top-profiles
   * Get top scanned profiles
   */
  router.get('/top-profiles', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const limit = parseInt(req.query.limit as string) || 10;
      const days = parseInt(req.query.days as string) || 30;

      const result = await pool.query(`
        SELECT
          qs.profile_slug,
          ep.name,
          ep.image_url,
          COUNT(*) as scan_count,
          COUNT(DISTINCT qs.ip_hash) as unique_visitors
        FROM qr_scans qs
        LEFT JOIN employee_profiles ep ON ep.slug = qs.profile_slug
        WHERE qs.scanned_at > NOW() - INTERVAL '${Math.min(days, 90)} days'
        GROUP BY qs.profile_slug, ep.name, ep.image_url
        ORDER BY scan_count DESC
        LIMIT $1
      `, [Math.min(limit, 50)]);

      res.json({
        success: true,
        period: `${days} days`,
        profiles: result.rows.map(row => ({
          slug: row.profile_slug,
          name: row.name || 'Unknown',
          imageUrl: row.image_url,
          scanCount: parseInt(row.scan_count),
          uniqueVisitors: parseInt(row.unique_visitors)
        }))
      });
    } catch (error) {
      console.error('❌ QR analytics top profiles error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get top profiles'
      });
    }
  });

  /**
   * GET /api/qr-analytics/recent
   * Get recent scans
   */
  router.get('/recent', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const limit = parseInt(req.query.limit as string) || 20;

      const result = await pool.query(`
        SELECT
          qs.id,
          qs.profile_slug,
          qs.scanned_at,
          qs.device_type,
          qs.source,
          ep.name as profile_name
        FROM qr_scans qs
        LEFT JOIN employee_profiles ep ON ep.slug = qs.profile_slug
        ORDER BY qs.scanned_at DESC
        LIMIT $1
      `, [Math.min(limit, 100)]);

      res.json({
        success: true,
        scans: result.rows.map(row => ({
          id: row.id,
          profileSlug: row.profile_slug,
          profileName: row.profile_name || 'Unknown',
          scannedAt: row.scanned_at,
          deviceType: row.device_type,
          source: row.source
        }))
      });
    } catch (error) {
      console.error('❌ QR analytics recent scans error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get recent scans'
      });
    }
  });

  /**
   * GET /api/qr-analytics/by-device
   * Get scan breakdown by device type
   */
  router.get('/by-device', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await isAdminUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const days = parseInt(req.query.days as string) || 30;

      const result = await pool.query(`
        SELECT
          COALESCE(device_type, 'unknown') as device_type,
          COUNT(*) as count
        FROM qr_scans
        WHERE scanned_at > NOW() - INTERVAL '${Math.min(days, 90)} days'
        GROUP BY device_type
        ORDER BY count DESC
      `);

      res.json({
        success: true,
        period: `${days} days`,
        breakdown: result.rows.map(row => ({
          deviceType: row.device_type,
          count: parseInt(row.count)
        }))
      });
    } catch (error) {
      console.error('❌ QR analytics by device error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get device breakdown'
      });
    }
  });

  /**
   * GET /api/qr-analytics/profile/:slug
   * Get analytics for a specific profile
   */
  router.get('/profile/:slug', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      const { slug } = req.params;

      // Allow admins or profile owners
      const isAdmin = await isAdminUser(userEmail);

      if (!isAdmin) {
        // Check if user owns this profile
        const profileCheck = await pool.query(`
          SELECT ep.id FROM employee_profiles ep
          JOIN users u ON u.id = ep.user_id
          WHERE ep.slug = $1 AND LOWER(u.email) = LOWER($2)
        `, [slug, userEmail]);

        if (profileCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            error: 'Access denied'
          });
        }
      }

      const result = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE scanned_at > NOW() - INTERVAL '1 day') as scans_today,
          COUNT(*) FILTER (WHERE scanned_at > NOW() - INTERVAL '7 days') as scans_week,
          COUNT(*) FILTER (WHERE scanned_at > NOW() - INTERVAL '30 days') as scans_month,
          COUNT(*) as scans_all_time,
          COUNT(DISTINCT ip_hash) FILTER (WHERE scanned_at > NOW() - INTERVAL '30 days') as unique_visitors
        FROM qr_scans
        WHERE profile_slug = $1
      `, [slug]);

      const stats = result.rows[0];

      // Get daily breakdown
      const dailyResult = await pool.query(`
        SELECT DATE(scanned_at) as date, COUNT(*) as scans
        FROM qr_scans
        WHERE profile_slug = $1 AND scanned_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(scanned_at)
        ORDER BY date ASC
      `, [slug]);

      res.json({
        success: true,
        slug,
        stats: {
          scansToday: parseInt(stats.scans_today),
          scansThisWeek: parseInt(stats.scans_week),
          scansThisMonth: parseInt(stats.scans_month),
          scansAllTime: parseInt(stats.scans_all_time),
          uniqueVisitors: parseInt(stats.unique_visitors)
        },
        dailyScans: dailyResult.rows.map(row => ({
          date: row.date,
          scans: parseInt(row.scans)
        }))
      });
    } catch (error) {
      console.error('❌ QR analytics profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get profile analytics'
      });
    }
  });

  return router;
}

export default createQRAnalyticsRoutes;
