/**
 * GET /api/lead-analytics/overview
 * Combined scans + fills + shares dashboard for the admin panel.
 *
 * Each section returns the same time-bucketed shape (today / week / month / all)
 * so the UI can render a uniform grid. Per-rep + daily series let the admin
 * spot conversion gaps (e.g. lots of scans, zero fills → bad form, or one rep
 * pulling 80% of fills → he's the leverage point).
 */
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

export function createLeadAnalyticsRoutes(pool: Pool): Router {
  const router = Router();

  async function isAdminUser(email: string | undefined): Promise<boolean> {
    if (!email) return false;
    try {
      const r = await pool.query(
        `SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email],
      );
      return r.rows[0]?.role === 'admin';
    } catch {
      return false;
    }
  }

  /**
   * GET /api/lead-analytics/overview
   * Returns top-line counts, conversion rate, per-rep breakdown, and daily series.
   * Window param `?days=30` controls the time-series + per-rep window (default 30).
   */
  router.get('/overview', async (req: Request, res: Response) => {
    try {
      const userEmail = req.headers['x-user-email'] as string;
      if (!(await isAdminUser(userEmail))) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }

      const days = Math.max(1, Math.min(365, parseInt(String(req.query.days || '30'), 10) || 30));

      // ── Top-line counts (scans / fills / shares × today/week/month/all) ──
      const counts = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM qr_scans WHERE scanned_at > NOW() - INTERVAL '1 day')::int as scans_today,
          (SELECT COUNT(*) FROM qr_scans WHERE scanned_at > NOW() - INTERVAL '7 days')::int as scans_week,
          (SELECT COUNT(*) FROM qr_scans WHERE scanned_at > NOW() - INTERVAL '30 days')::int as scans_month,
          (SELECT COUNT(*) FROM qr_scans)::int as scans_all,

          (SELECT COUNT(*) FROM profile_leads WHERE created_at > NOW() - INTERVAL '1 day')::int as fills_today,
          (SELECT COUNT(*) FROM profile_leads WHERE created_at > NOW() - INTERVAL '7 days')::int as fills_week,
          (SELECT COUNT(*) FROM profile_leads WHERE created_at > NOW() - INTERVAL '30 days')::int as fills_month,
          (SELECT COUNT(*) FROM profile_leads)::int as fills_all,

          (SELECT COUNT(*) FROM profile_shares WHERE shared_at > NOW() - INTERVAL '1 day')::int as shares_today,
          (SELECT COUNT(*) FROM profile_shares WHERE shared_at > NOW() - INTERVAL '7 days')::int as shares_week,
          (SELECT COUNT(*) FROM profile_shares WHERE shared_at > NOW() - INTERVAL '30 days')::int as shares_month,
          (SELECT COUNT(*) FROM profile_shares)::int as shares_all
      `);
      const c = counts.rows[0];

      // ── Per-rep breakdown over the requested window ──
      // Left-join all three streams against the active profile list so reps
      // with zero activity still show up in the table.
      const byRep = await pool.query(
        `
        SELECT
          p.slug,
          p.name,
          COALESCE(s.cnt, 0)::int as scans,
          COALESCE(l.cnt, 0)::int as fills,
          COALESCE(sh.cnt, 0)::int as shares,
          CASE
            WHEN COALESCE(s.cnt, 0) > 0
              THEN ROUND(COALESCE(l.cnt, 0)::numeric * 100 / s.cnt, 1)
            ELSE NULL
          END as conversion_pct
        FROM employee_profiles p
        LEFT JOIN (
          SELECT profile_slug, COUNT(*) as cnt FROM qr_scans
          WHERE scanned_at > NOW() - INTERVAL '${days} days'
          GROUP BY profile_slug
        ) s ON s.profile_slug = p.slug
        LEFT JOIN (
          SELECT profile_id, COUNT(*) as cnt FROM profile_leads
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND profile_id IS NOT NULL
          GROUP BY profile_id
        ) l ON l.profile_id = p.id
        LEFT JOIN (
          SELECT profile_slug, COUNT(*) as cnt FROM profile_shares
          WHERE shared_at > NOW() - INTERVAL '${days} days'
          GROUP BY profile_slug
        ) sh ON sh.profile_slug = p.slug
        WHERE p.is_active = true
        ORDER BY (COALESCE(l.cnt, 0) + COALESCE(s.cnt, 0)) DESC, p.name ASC
        `,
      );

      // ── Daily time-series for chart (window) ──
      const daily = await pool.query(
        `
        WITH days AS (
          SELECT generate_series(
            DATE_TRUNC('day', NOW() - INTERVAL '${days - 1} days'),
            DATE_TRUNC('day', NOW()),
            '1 day'::interval
          )::date AS day
        )
        SELECT
          d.day::text as date,
          COALESCE(s.cnt, 0)::int as scans,
          COALESCE(l.cnt, 0)::int as fills,
          COALESCE(sh.cnt, 0)::int as shares
        FROM days d
        LEFT JOIN (
          SELECT DATE_TRUNC('day', scanned_at)::date as day, COUNT(*) as cnt
          FROM qr_scans WHERE scanned_at > NOW() - INTERVAL '${days} days'
          GROUP BY 1
        ) s ON s.day = d.day
        LEFT JOIN (
          SELECT DATE_TRUNC('day', created_at)::date as day, COUNT(*) as cnt
          FROM profile_leads WHERE created_at > NOW() - INTERVAL '${days} days'
          GROUP BY 1
        ) l ON l.day = d.day
        LEFT JOIN (
          SELECT DATE_TRUNC('day', shared_at)::date as day, COUNT(*) as cnt
          FROM profile_shares WHERE shared_at > NOW() - INTERVAL '${days} days'
          GROUP BY 1
        ) sh ON sh.day = d.day
        ORDER BY d.day ASC
        `,
      );

      // ── Lead source breakdown (where do fills come from?) ──
      const bySource = await pool.query(
        `
        SELECT source, COUNT(*)::int as cnt
        FROM profile_leads
        WHERE created_at > NOW() - INTERVAL '${days} days'
          AND source IS NOT NULL
        GROUP BY source
        ORDER BY cnt DESC
        `,
      );

      // ── How-did-you-hear breakdown (acquisition channel) ──
      const byHow = await pool.query(
        `
        SELECT how_did_hear as channel, COUNT(*)::int as cnt
        FROM profile_leads
        WHERE created_at > NOW() - INTERVAL '${days} days'
          AND how_did_hear IS NOT NULL
        GROUP BY how_did_hear
        ORDER BY cnt DESC
        `,
      );

      const conversion = (scans: number, fills: number) =>
        scans > 0 ? Math.round((fills / scans) * 1000) / 10 : null;

      res.json({
        success: true,
        windowDays: days,
        scans:  { today: c.scans_today,  week: c.scans_week,  month: c.scans_month,  all: c.scans_all },
        fills:  { today: c.fills_today,  week: c.fills_week,  month: c.fills_month,  all: c.fills_all },
        shares: { today: c.shares_today, week: c.shares_week, month: c.shares_month, all: c.shares_all },
        conversion: {
          week: conversion(c.scans_week, c.fills_week),
          month: conversion(c.scans_month, c.fills_month),
          allTime: conversion(c.scans_all, c.fills_all),
        },
        byRep: byRep.rows,
        daily: daily.rows,
        bySource: bySource.rows,
        byHow: byHow.rows,
      });
    } catch (error) {
      console.error('❌ Lead analytics overview error:', error);
      res.status(500).json({ success: false, error: 'Failed to load analytics' });
    }
  });

  return router;
}
