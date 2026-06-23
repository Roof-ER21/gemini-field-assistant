/**
 * QR Analytics Routes
 * API endpoints for QR scan tracking and analytics
 */

import { Router, Request, Response } from 'express';
import type { Pool } from 'pg';
import { canManageQR } from '../lib/permissions.js';

export function createQRAnalyticsRoutes(pool: Pool) {
  const router = Router();

  // Helper: Check if user can manage QR (admin or marketing role).
  async function canManageQRUser(email?: string): Promise<boolean> {
    return canManageQR(pool, email);
  }

  /**
   * GET /api/qr-analytics/summary
   * Get QR scan summary stats
   */
  router.get('/summary', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await canManageQRUser(userEmail)) {
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

      if (!await canManageQRUser(userEmail)) {
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

      if (!await canManageQRUser(userEmail)) {
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

      if (!await canManageQRUser(userEmail)) {
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

      if (!await canManageQRUser(userEmail)) {
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
      const isAdmin = await canManageQRUser(userEmail);

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

  /**
   * GET /api/qr-analytics/attribution
   * "Who filled out what for who" — per-rep setup attribution plus a per-staff
   * rollup. Admin / marketing only.
   */
  router.get('/attribution', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;

      if (!await canManageQRUser(userEmail)) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      // Per-rep: who created it, who last edited it, how much content was added,
      // and how many scans the page has pulled.
      const perProfile = await pool.query(`
        SELECT
          ep.slug,
          ep.name,
          ep.role_type,
          ep.is_active,
          ep.is_claimed,
          ep.image_url,
          ep.created_by_email,
          ep.created_at,
          ep.updated_by_email,
          ep.updated_at,
          COALESCE(v.video_count, 0)  AS video_count,
          COALESCE(r.review_count, 0) AS review_count,
          COALESCE(s.scan_count, 0)   AS scan_count,
          (ep.image_url IS NOT NULL)  AS has_photo
        FROM employee_profiles ep
        LEFT JOIN (SELECT profile_id, COUNT(*) AS video_count  FROM profile_videos  GROUP BY profile_id) v ON v.profile_id = ep.id
        LEFT JOIN (SELECT profile_id, COUNT(*) AS review_count FROM profile_reviews WHERE profile_id IS NOT NULL GROUP BY profile_id) r ON r.profile_id = ep.id
        LEFT JOIN (SELECT profile_slug, COUNT(*) AS scan_count FROM qr_scans GROUP BY profile_slug) s ON s.profile_slug = ep.slug
        ORDER BY COALESCE(ep.updated_at, ep.created_at) DESC NULLS LAST
      `);

      // Per-staff rollup: how many pages each admin/marketing person set up, and
      // how many videos / reviews they added across all reps.
      const staff = await pool.query(`
        SELECT
          email,
          SUM(profiles_created) AS profiles_created,
          SUM(profiles_edited)  AS profiles_edited,
          SUM(videos_added)     AS videos_added,
          SUM(reviews_added)    AS reviews_added
        FROM (
          SELECT created_by_email AS email, COUNT(*) AS profiles_created, 0 AS profiles_edited, 0 AS videos_added, 0 AS reviews_added
            FROM employee_profiles WHERE created_by_email IS NOT NULL GROUP BY created_by_email
          UNION ALL
          SELECT updated_by_email, 0, COUNT(*), 0, 0
            FROM employee_profiles WHERE updated_by_email IS NOT NULL GROUP BY updated_by_email
          UNION ALL
          SELECT added_by_email, 0, 0, COUNT(*), 0
            FROM profile_videos WHERE added_by_email IS NOT NULL GROUP BY added_by_email
          UNION ALL
          SELECT added_by_email, 0, 0, 0, COUNT(*)
            FROM profile_reviews WHERE added_by_email IS NOT NULL GROUP BY added_by_email
        ) t
        GROUP BY email
        ORDER BY profiles_created DESC, profiles_edited DESC
      `);

      res.json({
        success: true,
        profiles: perProfile.rows.map(row => ({
          slug: row.slug,
          name: row.name,
          roleType: row.role_type,
          isActive: row.is_active,
          isClaimed: row.is_claimed,
          imageUrl: row.image_url,
          hasPhoto: row.has_photo,
          createdByEmail: row.created_by_email,
          createdAt: row.created_at,
          updatedByEmail: row.updated_by_email,
          updatedAt: row.updated_at,
          videoCount: parseInt(row.video_count),
          reviewCount: parseInt(row.review_count),
          scanCount: parseInt(row.scan_count)
        })),
        staff: staff.rows.map(row => ({
          email: row.email,
          profilesCreated: parseInt(row.profiles_created),
          profilesEdited: parseInt(row.profiles_edited),
          videosAdded: parseInt(row.videos_added),
          reviewsAdded: parseInt(row.reviews_added)
        }))
      });
    } catch (error) {
      console.error('❌ QR analytics attribution error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get attribution'
      });
    }
  });

  return router;
}

export default createQRAnalyticsRoutes;
