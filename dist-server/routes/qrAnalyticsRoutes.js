/**
 * QR Analytics Routes
 * API endpoints for QR scan tracking and analytics
 */
import { Router } from 'express';
import { canManageQR } from '../lib/permissions.js';
import { syncCc24Statuses, CC24_STAGE_RANK } from '../services/cc24Sync.js';
export function createQRAnalyticsRoutes(pool) {
    const router = Router();
    // Helper: Check if user can manage QR (admin or marketing role).
    async function canManageQRUser(email) {
        return canManageQR(pool, email);
    }
    /**
     * GET /api/qr-analytics/summary
     * Get QR scan summary stats
     */
    router.get('/summary', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
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
        FROM qr_scans_human
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
        }
        catch (error) {
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
    router.get('/daily', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!await canManageQRUser(userEmail)) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }
            const days = parseInt(req.query.days) || 30;
            const result = await pool.query(`
        SELECT
          DATE(scanned_at) as date,
          COUNT(*) as scans,
          COUNT(DISTINCT ip_hash) as unique_visitors
        FROM qr_scans_human
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
        }
        catch (error) {
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
    router.get('/top-profiles', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!await canManageQRUser(userEmail)) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }
            const limit = parseInt(req.query.limit) || 10;
            const days = parseInt(req.query.days) || 30;
            const result = await pool.query(`
        SELECT
          qs.profile_slug,
          ep.name,
          ep.image_url,
          COUNT(*) as scan_count,
          COUNT(DISTINCT qs.ip_hash) as unique_visitors
        FROM qr_scans_human qs
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
        }
        catch (error) {
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
    router.get('/recent', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!await canManageQRUser(userEmail)) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }
            const limit = parseInt(req.query.limit) || 20;
            const result = await pool.query(`
        SELECT
          qs.id,
          qs.profile_slug,
          qs.scanned_at,
          qs.device_type,
          qs.source,
          ep.name as profile_name
        FROM qr_scans_human qs
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
        }
        catch (error) {
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
    router.get('/by-device', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!await canManageQRUser(userEmail)) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }
            const days = parseInt(req.query.days) || 30;
            const result = await pool.query(`
        SELECT
          COALESCE(device_type, 'unknown') as device_type,
          COUNT(*) as count
        FROM qr_scans_human
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
        }
        catch (error) {
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
    router.get('/profile/:slug', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
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
        FROM qr_scans_human
        WHERE profile_slug = $1
      `, [slug]);
            const stats = result.rows[0];
            // Get daily breakdown
            const dailyResult = await pool.query(`
        SELECT DATE(scanned_at) as date, COUNT(*) as scans
        FROM qr_scans_human
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
        }
        catch (error) {
            console.error('❌ QR analytics profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get profile analytics'
            });
        }
    });
    /**
     * GET /api/qr-analytics/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&slug=<rep>
     * One consolidated, fully-filterable payload for the admin Scan Analytics
     * dashboard: scans + signups (form-fill leads) summary, daily trend, per-rep
     * scorecard with setup attribution, device split, and recent scan/signup
     * feeds. All windows respect the from/to date range (ET) and the optional rep
     * slug filter. Admin / marketing only.
     *
     * Date math is ET (America/New_York) to match the app's display timezone, so
     * "today" lines up with what reps see. `($3 IS NULL OR col=$3)` makes the rep
     * filter a no-op when no slug is passed — no dynamic SQL.
     */
    router.get('/dashboard', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!await canManageQRUser(userEmail)) {
                return res.status(403).json({ success: false, error: 'Admin access required' });
            }
            // Lazy close-the-loop refresh — pull CC24 pipeline statuses for open leads
            // (throttled to 15 min, non-blocking) so the funnel's signed/approved/paid
            // numbers stay fresh without a separate cron.
            void syncCc24Statuses(pool).catch(() => { });
            const ET = 'America/New_York';
            const slug = req.query.slug?.trim() || null;
            const fromQ = req.query.from?.trim() || null;
            const toQ = req.query.to?.trim() || null;
            // Resolve bounds in ET (default = last 30 days). Returned as YYYY-MM-DD
            // text so there's no JS Date timezone drift round-tripping the params.
            const bd = await pool.query(`SELECT to_char(COALESCE($1::date, (now() AT TIME ZONE '${ET}')::date - 29), 'YYYY-MM-DD') AS from_d,
                to_char(COALESCE($2::date, (now() AT TIME ZONE '${ET}')::date),       'YYYY-MM-DD') AS to_d`, [fromQ, toQ]);
            let fromD = bd.rows[0].from_d;
            let toD = bd.rows[0].to_d;
            if (fromD > toD) {
                const t = fromD;
                fromD = toD;
                toD = t;
            } // tolerate reversed range
            // Cap span at 400 days so a giant custom range can't generate_series the DB to death.
            if ((Date.parse(toD) - Date.parse(fromD)) / 86400000 > 400) {
                fromD = new Date(Date.parse(toD) - 400 * 86400000).toISOString().slice(0, 10);
            }
            const p = [fromD, toD, slug];
            const [summaryR, dailyR, deviceR, recentScanR, recentSignupR, repsR, staffR, funnelR, channelR, sourceR, cc24R] = await Promise.all([
                // Summary: scans + unique + reps-scanned + signups, all in-range/slug
                pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM qr_scans_human qs
               WHERE (qs.scanned_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
                 AND ($3::text IS NULL OR qs.profile_slug = $3)) AS scans,
            (SELECT COUNT(DISTINCT qs.ip_hash)::int FROM qr_scans_human qs
               WHERE (qs.scanned_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
                 AND ($3::text IS NULL OR qs.profile_slug = $3)) AS unique_visitors,
            (SELECT COUNT(DISTINCT qs.profile_slug)::int FROM qr_scans_human qs
               WHERE (qs.scanned_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
                 AND ($3::text IS NULL OR qs.profile_slug = $3)) AS reps_scanned,
            (SELECT COUNT(*)::int FROM profile_leads pl LEFT JOIN employee_profiles ep ON ep.id = pl.profile_id
               WHERE (pl.created_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
                 AND ($3::text IS NULL OR ep.slug = $3)) AS signups
        `, p),
                // Daily trend (gap-filled): scans + unique + signups per ET day
                pool.query(`
          WITH days AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS d)
          SELECT to_char(d.d, 'YYYY-MM-DD') AS date,
                 COALESCE(sc.scans, 0)::int   AS scans,
                 COALESCE(sc.uniq, 0)::int    AS unique_visitors,
                 COALESCE(le.signups, 0)::int AS signups
          FROM days d
          LEFT JOIN (
            SELECT (scanned_at AT TIME ZONE '${ET}')::date AS dd, COUNT(*) AS scans, COUNT(DISTINCT ip_hash) AS uniq
            FROM qr_scans_human WHERE ($3::text IS NULL OR profile_slug = $3) GROUP BY 1
          ) sc ON sc.dd = d.d
          LEFT JOIN (
            SELECT (pl.created_at AT TIME ZONE '${ET}')::date AS dd, COUNT(*) AS signups
            FROM profile_leads pl LEFT JOIN employee_profiles ep ON ep.id = pl.profile_id
            WHERE ($3::text IS NULL OR ep.slug = $3) GROUP BY 1
          ) le ON le.dd = d.d
          ORDER BY d.d ASC
        `, p),
                // Device split (in-range/slug)
                pool.query(`
          SELECT COALESCE(device_type, 'unknown') AS device_type, COUNT(*)::int AS count
          FROM qr_scans_human
          WHERE (scanned_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
            AND ($3::text IS NULL OR profile_slug = $3)
          GROUP BY device_type ORDER BY count DESC
        `, p),
                // Recent scans (latest in-range/slug)
                pool.query(`
          SELECT qs.id, qs.profile_slug, qs.scanned_at, qs.device_type, qs.source, ep.name AS profile_name
          FROM qr_scans_human qs LEFT JOIN employee_profiles ep ON ep.slug = qs.profile_slug
          WHERE (qs.scanned_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
            AND ($3::text IS NULL OR qs.profile_slug = $3)
          ORDER BY qs.scanned_at DESC LIMIT 30
        `, p),
                // Recent signups (the people who filled out the form), latest in-range/slug
                pool.query(`
          SELECT pl.id, ep.slug AS profile_slug, ep.name AS profile_name,
                 pl.homeowner_name, pl.homeowner_email, pl.homeowner_phone,
                 pl.service_type, pl.status, pl.created_at, pl.source, pl.address
          FROM profile_leads pl LEFT JOIN employee_profiles ep ON ep.id = pl.profile_id
          WHERE (pl.created_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
            AND ($3::text IS NULL OR ep.slug = $3)
          ORDER BY pl.created_at DESC LIMIT 30
        `, p),
                // Per-rep scorecard: in-range scans + signups + lifetime content + setup attribution
                pool.query(`
          SELECT ep.slug, ep.name, ep.role_type, ep.is_active, ep.is_claimed, ep.image_url,
                 ep.created_by_email, ep.created_at, ep.updated_by_email, ep.updated_at,
                 (ep.image_url IS NOT NULL) AS has_photo,
                 COALESCE(v.c, 0)::int AS video_count,
                 COALESCE(r.c, 0)::int AS review_count,
                 COALESCE(s.scans, 0)::int AS scan_count,
                 COALESCE(s.uniq, 0)::int AS unique_visitors,
                 COALESCE(l.signups, 0)::int AS signup_count
          FROM employee_profiles ep
          LEFT JOIN (SELECT profile_id, COUNT(*) AS c FROM profile_videos GROUP BY 1) v ON v.profile_id = ep.id
          LEFT JOIN (SELECT profile_id, COUNT(*) AS c FROM profile_reviews WHERE profile_id IS NOT NULL GROUP BY 1) r ON r.profile_id = ep.id
          LEFT JOIN (
            SELECT profile_slug, COUNT(*) AS scans, COUNT(DISTINCT ip_hash) AS uniq FROM qr_scans_human
            WHERE (scanned_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date GROUP BY 1
          ) s ON s.profile_slug = ep.slug
          LEFT JOIN (
            SELECT ep2.slug, COUNT(*) AS signups FROM profile_leads pl JOIN employee_profiles ep2 ON ep2.id = pl.profile_id
            WHERE (pl.created_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date GROUP BY 1
          ) l ON l.slug = ep.slug
          WHERE ($3::text IS NULL OR ep.slug = $3)
          ORDER BY scan_count DESC, signup_count DESC, ep.name ASC
        `, p),
                // Per-staff setup rollup (lifetime — who built/curated rep pages)
                pool.query(`
          SELECT email,
                 SUM(profiles_created)::int AS profiles_created,
                 SUM(profiles_edited)::int  AS profiles_edited,
                 SUM(videos_added)::int     AS videos_added,
                 SUM(reviews_added)::int    AS reviews_added
          FROM (
            SELECT created_by_email AS email, COUNT(*) AS profiles_created, 0 AS profiles_edited, 0 AS videos_added, 0 AS reviews_added
              FROM employee_profiles WHERE created_by_email IS NOT NULL GROUP BY 1
            UNION ALL SELECT updated_by_email, 0, COUNT(*), 0, 0 FROM employee_profiles WHERE updated_by_email IS NOT NULL GROUP BY 1
            UNION ALL SELECT added_by_email, 0, 0, COUNT(*), 0 FROM profile_videos WHERE added_by_email IS NOT NULL GROUP BY 1
            UNION ALL SELECT added_by_email, 0, 0, 0, COUNT(*) FROM profile_reviews WHERE added_by_email IS NOT NULL GROUP BY 1
          ) t GROUP BY email ORDER BY profiles_created DESC, profiles_edited DESC
        `),
                // ── Funnel: scans → signups → booked (in-range/slug, ET). "booked" = a
                // homeowner who picked an inspection slot (preferred_date set). Note:
                // closed-won isn't tracked in sa21 — it lives in CC24; omit for now.
                pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM qr_scans_human qs
               WHERE (qs.scanned_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
                 AND ($3::text IS NULL OR qs.profile_slug = $3)) AS scans,
            (SELECT COUNT(*)::int FROM profile_leads pl LEFT JOIN employee_profiles ep ON ep.id = pl.profile_id
               WHERE (pl.created_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
                 AND ($3::text IS NULL OR ep.slug = $3)) AS signups,
            (SELECT COUNT(*)::int FROM profile_leads pl LEFT JOIN employee_profiles ep ON ep.id = pl.profile_id
               WHERE (pl.created_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
                 AND pl.preferred_date IS NOT NULL
                 AND ($3::text IS NULL OR ep.slug = $3)) AS booked
        `, p),
                // ── By channel: share-channel attribution from utm_medium (door/text/social/
                // facebook/instagram/qr…). signups + booked + conversion% (booked/signups).
                pool.query(`
          SELECT COALESCE(NULLIF(pl.utm_medium, ''), '(none)') AS channel,
                 COUNT(*)::int AS signups,
                 COUNT(*) FILTER (WHERE pl.preferred_date IS NOT NULL)::int AS booked
          FROM profile_leads pl LEFT JOIN employee_profiles ep ON ep.id = pl.profile_id
          WHERE (pl.created_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
            AND ($3::text IS NULL OR ep.slug = $3)
          GROUP BY 1
          ORDER BY signups DESC, channel ASC
        `, p),
                // ── By source family: split signups by origin so we can see where leads
                // come from.
                //   RoofCheck               = source LIKE 'roofcheck%' / '(RoofCheck)' service
                //   Company /inspection page= service_type = 'Free inspection (company page)'
                //   Rep page (V2)           = service_type = 'Free inspection (rep page)'
                //   QR / JotForm V1         = everything else
                pool.query(`
          SELECT
            CASE
              WHEN pl.source LIKE 'roofcheck%' OR pl.service_type LIKE '%RoofCheck%' THEN 'RoofCheck'
              WHEN pl.service_type = 'Free inspection (company page)' THEN 'Company /inspection page'
              WHEN pl.service_type = 'Free inspection (rep page)' THEN 'Rep page (V2 form)'
              ELSE 'QR / JotForm (V1)'
            END AS family,
            COUNT(*)::int AS signups,
            COUNT(*) FILTER (WHERE pl.preferred_date IS NOT NULL)::int AS booked
          FROM profile_leads pl LEFT JOIN employee_profiles ep ON ep.id = pl.profile_id
          WHERE (pl.created_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
            AND ($3::text IS NULL OR ep.slug = $3)
          GROUP BY 1
          ORDER BY signups DESC
        `, p),
                // ── CC24 milestones (close-the-loop): current pipeline status per lead,
                // synced from CC24. Bucketed in JS into the 3 commission "wins".
                pool.query(`
          SELECT pl.cc24_status AS status, COUNT(*)::int AS n
          FROM profile_leads pl LEFT JOIN employee_profiles ep ON ep.id = pl.profile_id
          WHERE (pl.created_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
            AND ($3::text IS NULL OR ep.slug = $3)
            AND pl.cc24_status IS NOT NULL
          GROUP BY 1
        `, p),
            ]);
            const s = summaryR.rows[0];
            const scans = s.scans ?? 0;
            const signups = s.signups ?? 0;
            res.json({
                success: true,
                range: { from: fromD, to: toD },
                slug,
                summary: {
                    scans,
                    signups,
                    uniqueVisitors: s.unique_visitors ?? 0,
                    repsScanned: s.reps_scanned ?? 0,
                    conversionRate: scans > 0 ? Math.round((signups / scans) * 1000) / 10 : 0, // % to 1 decimal
                },
                daily: dailyR.rows.map(r => ({
                    date: r.date, scans: r.scans, uniqueVisitors: r.unique_visitors, signups: r.signups,
                })),
                devices: deviceR.rows.map(r => ({ deviceType: r.device_type, count: r.count })),
                recentScans: recentScanR.rows.map(r => ({
                    id: r.id, profileSlug: r.profile_slug, profileName: r.profile_name || 'Unknown',
                    scannedAt: r.scanned_at, deviceType: r.device_type, source: r.source,
                })),
                recentSignups: recentSignupR.rows.map(r => ({
                    id: r.id, profileSlug: r.profile_slug || null, profileName: r.profile_name || null,
                    homeownerName: r.homeowner_name, homeownerEmail: r.homeowner_email, homeownerPhone: r.homeowner_phone,
                    serviceType: r.service_type, status: r.status, address: r.address, source: r.source, createdAt: r.created_at,
                })),
                reps: repsR.rows.map(r => ({
                    slug: r.slug, name: r.name, roleType: r.role_type, isActive: r.is_active, isClaimed: r.is_claimed,
                    imageUrl: r.image_url, hasPhoto: r.has_photo,
                    createdByEmail: r.created_by_email, createdAt: r.created_at,
                    updatedByEmail: r.updated_by_email, updatedAt: r.updated_at,
                    videoCount: r.video_count, reviewCount: r.review_count,
                    scanCount: r.scan_count, uniqueVisitors: r.unique_visitors, signupCount: r.signup_count,
                })),
                staff: staffR.rows.map(r => ({
                    email: r.email, profilesCreated: r.profiles_created, profilesEdited: r.profiles_edited,
                    videosAdded: r.videos_added, reviewsAdded: r.reviews_added,
                })),
                // Funnel scans → signups → booked → signed → approved → won (CC24 close-the-loop).
                funnel: (() => {
                    const f = funnelR.rows[0] || {};
                    // Bucket synced CC24 statuses into the 3 commission "wins" (cumulative — a
                    // paid lead also passed signed + approved). Win1=signed(rank≥7),
                    // Win2=approved(≥12), Win3=won/paid(≥16). lost/cancelled tracked aside.
                    let signed = 0, approved = 0, won = 0, lost = 0;
                    for (const r of cc24R.rows) {
                        const st = String(r.status || '').toLowerCase();
                        if (st === 'lost' || st === 'cancelled') {
                            lost += r.n;
                            continue;
                        }
                        const rank = CC24_STAGE_RANK[st] || 0;
                        if (rank >= 7)
                            signed += r.n;
                        if (rank >= 12)
                            approved += r.n;
                        if (rank >= 16)
                            won += r.n;
                    }
                    return { scans: f.scans ?? 0, signups: f.signups ?? 0, booked: f.booked ?? 0, signed, approved, won, lost };
                })(),
                // Share-channel conversion (utm_medium). conversionPct = booked / signups.
                byChannel: channelR.rows.map(r => ({
                    channel: r.channel,
                    signups: r.signups,
                    booked: r.booked,
                    conversionPct: r.signups > 0 ? Math.round((r.booked / r.signups) * 1000) / 10 : 0,
                })),
                // 3-way source family split (RoofCheck / Rep page V2 / QR-JotForm V1).
                bySource: sourceR.rows.map(r => ({
                    family: r.family,
                    signups: r.signups,
                    booked: r.booked,
                    conversionPct: r.signups > 0 ? Math.round((r.booked / r.signups) * 1000) / 10 : 0,
                })),
            });
        }
        catch (error) {
            console.error('❌ QR analytics dashboard error:', error);
            res.status(500).json({ success: false, error: 'Failed to get dashboard analytics' });
        }
    });
    /**
     * GET /api/qr-analytics/rep-readiness
     * Per-rep launch-readiness scorecard so marketing can chase missing pieces.
     * Active profiles only (is_active = true). For each rep:
     *   hasPhoto  = image_url present & non-empty
     *   hasVideo  = >=1 row in profile_videos
     *   hasBio    = bio present & non-empty
     *   hasLogin  = user_id present (claimed an account)
     *   hasGoogle = user_id present AND a live google_oauth_tokens row
     *               (revoked_at IS NULL AND access_token_encrypted <> 'pending')
     *   completenessPct = round(100 * (#true of {photo,video,bio,google}) / 4)
     *   fullyReady      = all 4 of {photo,video,bio,google} true
     * Admin / marketing only.
     */
    router.get('/rep-readiness', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!await canManageQRUser(userEmail)) {
                return res.status(403).json({ success: false, error: 'Admin access required' });
            }
            const result = await pool.query(`
        SELECT
          ep.name,
          ep.slug,
          (ep.image_url IS NOT NULL AND ep.image_url <> '')           AS has_photo,
          (v.c IS NOT NULL AND v.c > 0)                               AS has_video,
          (ep.bio IS NOT NULL AND btrim(ep.bio) <> '')               AS has_bio,
          (ep.user_id IS NOT NULL)                                   AS has_login,
          (ep.user_id IS NOT NULL AND g.user_id IS NOT NULL)         AS has_google
        FROM employee_profiles ep
        LEFT JOIN (
          SELECT profile_id, COUNT(*) AS c FROM profile_videos GROUP BY profile_id
        ) v ON v.profile_id = ep.id
        LEFT JOIN (
          SELECT DISTINCT user_id FROM google_oauth_tokens
          WHERE revoked_at IS NULL AND access_token_encrypted <> 'pending'
        ) g ON g.user_id = ep.user_id
        WHERE ep.is_active = TRUE
        ORDER BY ep.name ASC
      `);
            const reps = result.rows.map(r => {
                const hasPhoto = !!r.has_photo;
                const hasVideo = !!r.has_video;
                const hasBio = !!r.has_bio;
                const hasLogin = !!r.has_login;
                const hasGoogle = !!r.has_google;
                const trueCount = [hasPhoto, hasVideo, hasBio, hasGoogle].filter(Boolean).length;
                const completenessPct = Math.round((100 * trueCount) / 4);
                return {
                    name: r.name,
                    slug: r.slug,
                    hasPhoto, hasVideo, hasBio, hasGoogle, hasLogin,
                    completenessPct,
                    fullyReady: trueCount === 4,
                };
            });
            const summary = {
                total: reps.length,
                withPhoto: reps.filter(r => r.hasPhoto).length,
                withVideo: reps.filter(r => r.hasVideo).length,
                withBio: reps.filter(r => r.hasBio).length,
                googleConnected: reps.filter(r => r.hasGoogle).length,
                fullyReady: reps.filter(r => r.fullyReady).length,
            };
            res.json({ success: true, reps, summary });
        }
        catch (error) {
            console.error('❌ QR analytics rep-readiness error:', error);
            res.status(500).json({ success: false, error: 'Failed to get rep readiness' });
        }
    });
    // Manual CC24 sync trigger (admin) — force-pull pipeline statuses now, bypassing
    // the 15-min throttle. Used for testing + an on-demand "refresh" button.
    router.post('/sync-cc24', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!await canManageQRUser(userEmail)) {
                return res.status(403).json({ success: false, error: 'Admin access required' });
            }
            const result = await syncCc24Statuses(pool, { force: true });
            res.json({ success: true, ...result });
        }
        catch (error) {
            console.error('❌ CC24 sync error:', error);
            res.status(500).json({ success: false, error: 'CC24 sync failed' });
        }
    });
    return router;
}
export default createQRAnalyticsRoutes;
