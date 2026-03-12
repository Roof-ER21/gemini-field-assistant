/**
 * Lead Generation Routes
 * API endpoints for universal lead intake, storm zone management,
 * referral codes, and lead gen dashboard analytics.
 *
 * Public routes  — no auth required (landing pages, QR door drops, etc.)
 * Private routes — require x-user-email header (admin or profile owner)
 */
import { Router } from 'express';
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createLeadGenRoutes(pool) {
    const router = Router();
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    /** Check whether the given email belongs to an admin user. */
    async function isAdminUser(email) {
        if (!email)
            return false;
        try {
            const result = await pool.query('SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
            return result.rows[0]?.role === 'admin';
        }
        catch {
            return false;
        }
    }
    /** Return the employee_profiles.id linked to the given email, or null. */
    async function getUserProfileId(email) {
        try {
            const result = await pool.query(`SELECT ep.id FROM employee_profiles ep
         JOIN users u ON u.id = ep.user_id
         WHERE LOWER(u.email) = LOWER($1)
         LIMIT 1`, [email]);
            return result.rows[0]?.id || null;
        }
        catch {
            return null;
        }
    }
    /**
     * Calculate a 0-100 lead score.
     * Returns the numeric score and the factor breakdown for storage.
     */
    async function calculateLeadScore(params) {
        const { homeownerPhone, homeownerEmail, address, serviceType, preferredDate, source, zipCode, } = params;
        let score = 0;
        const factors = {
            hasPhone: !!homeownerPhone,
            hasEmail: !!homeownerEmail,
            hasAddress: !!address,
            highValueService: serviceType === 'storm_damage' || serviceType === 'roof_replacement',
            hasPreferredDate: !!preferredDate,
            stormSource: source === 'storm' || source === 'storm_landing',
            referralSource: source === 'referral',
            activeStormZip: false,
        };
        if (factors.hasPhone)
            score += 15;
        if (factors.hasEmail)
            score += 10;
        if (factors.hasAddress)
            score += 10;
        if (factors.highValueService)
            score += 20;
        if (factors.hasPreferredDate)
            score += 15;
        if (factors.stormSource)
            score += 15;
        if (factors.referralSource)
            score += 10;
        // Check active storm zone for this zip (+15)
        if (zipCode) {
            try {
                const stormResult = await pool.query(`SELECT id FROM storm_zones
           WHERE zip_code = $1
             AND is_active = true
             AND event_date >= NOW() - INTERVAL '90 days'
           LIMIT 1`, [zipCode]);
                if (stormResult.rows.length > 0) {
                    factors.activeStormZip = true;
                    score += 15;
                }
            }
            catch {
                // Non-fatal — storm_zones table may not exist yet
            }
        }
        return { score: Math.min(score, 100), scoreFactors: factors };
    }
    /** Fire-and-forget Telegram notification for a new lead. */
    function notifyTelegram(params) {
        const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID)
            return;
        const { homeownerName, homeownerPhone, zipCode, serviceType, source, referralCode, score } = params;
        const scoreEmoji = score >= 70 ? '🔥' : score >= 40 ? '⚡' : '📋';
        const msg = `${scoreEmoji} New Lead (Score: ${score}/100)\n` +
            `Name: ${homeownerName}\n` +
            (homeownerPhone ? `Phone: ${homeownerPhone}\n` : '') +
            (zipCode ? `ZIP: ${zipCode}\n` : '') +
            `Service: ${serviceType || 'Not specified'}\n` +
            `Source: ${source}\n` +
            (referralCode ? `Referral: ${referralCode}\n` : '');
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'HTML' }),
        }).catch(() => { });
    }
    // =========================================================================
    // PUBLIC ROUTES
    // =========================================================================
    /**
     * POST /api/leads/intake
     * Universal lead intake — accepts submissions from all lead-gen surfaces.
     */
    router.post('/intake', async (req, res) => {
        try {
            const { homeownerName, homeownerEmail, homeownerPhone, address, zipCode, serviceType, preferredDate, preferredTime, message, source = 'profile', referralCode, profileId, utmSource, utmMedium, utmCampaign, } = req.body;
            // --- Validation -------------------------------------------------------
            if (!homeownerName || !homeownerName.trim()) {
                return res.status(400).json({
                    success: false,
                    error: 'homeownerName is required',
                });
            }
            if (homeownerEmail) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(homeownerEmail)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid email address',
                    });
                }
            }
            const validSources = [
                'profile', 'storm', 'storm_landing', 'claim_quiz', 'claim_help',
                'referral', 'qr_door', 'cold_email', 'social_reddit', 'social_scanner',
                'reengagement', 'appointment_ai',
            ];
            const resolvedSource = validSources.includes(source)
                ? source
                : 'profile';
            // --- Score ------------------------------------------------------------
            const { score, scoreFactors } = await calculateLeadScore({
                homeownerPhone,
                homeownerEmail,
                address,
                serviceType,
                preferredDate,
                source: resolvedSource,
                referralCode,
                zipCode,
            });
            // --- Insert lead ------------------------------------------------------
            const insertResult = await pool.query(`INSERT INTO profile_leads (
          profile_id,
          homeowner_name,
          homeowner_email,
          homeowner_phone,
          address,
          zip_code,
          service_type,
          preferred_date,
          preferred_time,
          message,
          source,
          referral_code,
          lead_score,
          score_factors,
          utm_source,
          utm_medium,
          utm_campaign,
          status,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17,
          'new', NOW(), NOW()
        )
        RETURNING id`, [
                profileId || null,
                homeownerName.trim(),
                homeownerEmail || null,
                homeownerPhone || null,
                address || null,
                zipCode || null,
                serviceType || null,
                preferredDate || null,
                preferredTime || null,
                message || null,
                resolvedSource,
                referralCode || null,
                score,
                JSON.stringify(scoreFactors),
                utmSource || null,
                utmMedium || null,
                utmCampaign || null,
            ]);
            const leadId = insertResult.rows[0].id;
            // --- Increment referral counter (fire-and-forget) ---------------------
            if (referralCode) {
                pool.query(`UPDATE referral_codes
           SET total_referrals = total_referrals + 1,
               updated_at = NOW()
           WHERE UPPER(code) = UPPER($1)`, [referralCode]).catch((err) => {
                    console.error('❌ Lead gen: referral counter update failed:', err);
                });
            }
            // --- Telegram notification (fire-and-forget) --------------------------
            notifyTelegram({
                homeownerName: homeownerName.trim(),
                homeownerPhone,
                zipCode,
                serviceType,
                source: resolvedSource,
                referralCode,
                score,
            });
            return res.status(201).json({ success: true, leadId, score });
        }
        catch (error) {
            console.error('❌ Lead intake error:', error);
            return res.status(500).json({ success: false, error: 'Failed to submit lead' });
        }
    });
    /**
     * GET /api/leads/storm-zones
     * List all active storm zones (public — needed by landing pages).
     */
    router.get('/storm-zones', async (req, res) => {
        try {
            const result = await pool.query(`SELECT * FROM storm_zones
         WHERE is_active = true
         ORDER BY event_date DESC`);
            return res.json({ success: true, stormZones: result.rows });
        }
        catch (error) {
            console.error('❌ List storm zones error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch storm zones' });
        }
    });
    /**
     * GET /api/leads/storm-zone/:zip
     * Get the most recent active storm event for a given zip code.
     * Returns null data when no matching zone exists.
     */
    router.get('/storm-zone/:zip', async (req, res) => {
        try {
            const { zip } = req.params;
            const result = await pool.query(`SELECT * FROM storm_zones
         WHERE zip_code = $1
           AND is_active = true
         ORDER BY event_date DESC
         LIMIT 1`, [zip]);
            const zone = result.rows[0] || null;
            return res.json({ success: true, stormZone: zone });
        }
        catch (error) {
            console.error('❌ Get storm zone error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch storm zone' });
        }
    });
    /**
     * POST /api/leads/validate-referral
     * Check whether a referral code is active and return the rep's name.
     */
    router.post('/validate-referral', async (req, res) => {
        try {
            const { code } = req.body;
            if (!code || !code.trim()) {
                return res.status(400).json({ success: false, error: 'code is required' });
            }
            const result = await pool.query(`SELECT rc.code, ep.name as rep_name
         FROM referral_codes rc
         LEFT JOIN employee_profiles ep ON ep.id = rc.profile_id
         WHERE UPPER(rc.code) = UPPER($1)
           AND rc.is_active = true
         LIMIT 1`, [code.trim()]);
            if (result.rows.length === 0) {
                return res.json({ valid: false });
            }
            return res.json({ valid: true, repName: result.rows[0].rep_name || undefined });
        }
        catch (error) {
            console.error('❌ Validate referral error:', error);
            return res.status(500).json({ success: false, error: 'Failed to validate referral code' });
        }
    });
    // =========================================================================
    // AUTHENTICATED ROUTES  (require x-user-email header)
    // =========================================================================
    /**
     * GET /api/leads/dashboard
     * Lead gen stats — admin sees all, rep sees their own profile's leads.
     */
    router.get('/dashboard', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail) {
                return res.status(401).json({ success: false, error: 'Authentication required' });
            }
            const isAdmin = await isAdminUser(userEmail);
            const profileId = !isAdmin ? await getUserProfileId(userEmail) : null;
            if (!isAdmin && !profileId) {
                return res.status(403).json({ success: false, error: 'No profile linked to your account' });
            }
            const profileFilter = !isAdmin ? `AND pl.profile_id = '${profileId}'` : '';
            // Leads by source
            const bySourceResult = await pool.query(`SELECT
           source,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'converted') as converted
         FROM profile_leads pl
         WHERE 1=1 ${profileFilter}
         GROUP BY source
         ORDER BY total DESC`);
            // Lead score distribution buckets
            const scoreDistResult = await pool.query(`SELECT
           CASE
             WHEN lead_score >= 70 THEN 'hot'
             WHEN lead_score >= 40 THEN 'warm'
             ELSE 'cold'
           END as bucket,
           COUNT(*) as count
         FROM profile_leads pl
         WHERE 1=1 ${profileFilter}
         GROUP BY bucket`);
            // Top zip codes by lead volume
            const topZipsResult = await pool.query(`SELECT
           zip_code,
           COUNT(*) as lead_count
         FROM profile_leads pl
         WHERE zip_code IS NOT NULL ${profileFilter}
         GROUP BY zip_code
         ORDER BY lead_count DESC
         LIMIT 10`);
            // Recent leads (last 10)
            const recentResult = await pool.query(`SELECT
           pl.id,
           pl.homeowner_name,
           pl.homeowner_phone,
           pl.zip_code,
           pl.service_type,
           pl.source,
           pl.lead_score,
           pl.status,
           pl.created_at,
           ep.name as profile_name
         FROM profile_leads pl
         LEFT JOIN employee_profiles ep ON ep.id = pl.profile_id
         WHERE 1=1 ${profileFilter}
         ORDER BY pl.created_at DESC
         LIMIT 10`);
            // Totals
            const totalsResult = await pool.query(`SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'converted') as converted,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as this_month,
           ROUND(AVG(lead_score)) as avg_score
         FROM profile_leads pl
         WHERE 1=1 ${profileFilter}`);
            const totals = totalsResult.rows[0];
            const total = parseInt(totals.total);
            const converted = parseInt(totals.converted);
            return res.json({
                success: true,
                summary: {
                    total,
                    converted,
                    conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
                    thisWeek: parseInt(totals.this_week),
                    thisMonth: parseInt(totals.this_month),
                    avgScore: parseInt(totals.avg_score) || 0,
                },
                bySource: bySourceResult.rows,
                scoreDistribution: scoreDistResult.rows,
                topZipCodes: topZipsResult.rows,
                recentLeads: recentResult.rows,
            });
        }
        catch (error) {
            console.error('❌ Lead dashboard error:', error);
            return res.status(500).json({ success: false, error: 'Failed to load dashboard' });
        }
    });
    /**
     * POST /api/leads/storm-zones
     * Create a new storm zone (admin only).
     */
    router.post('/storm-zones', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!await isAdminUser(userEmail)) {
                return res.status(403).json({ success: false, error: 'Admin access required' });
            }
            const { zipCode, city, state, eventType, eventDate, severity, hailSize, windSpeed, source, notes, } = req.body;
            if (!zipCode || !zipCode.trim()) {
                return res.status(400).json({ success: false, error: 'zipCode is required' });
            }
            const result = await pool.query(`INSERT INTO storm_zones (
          zip_code, city, state, event_type, event_date,
          severity, hail_size, wind_speed, source, notes,
          is_active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          true, NOW(), NOW()
        )
        RETURNING *`, [
                zipCode.trim(),
                city || null,
                state || null,
                eventType || null,
                eventDate || null,
                severity || null,
                hailSize ?? null,
                windSpeed ?? null,
                source || null,
                notes || null,
            ]);
            return res.status(201).json({ success: true, stormZone: result.rows[0] });
        }
        catch (error) {
            console.error('❌ Create storm zone error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create storm zone' });
        }
    });
    /**
     * PUT /api/leads/storm-zones/:id
     * Update a storm zone (admin only).
     */
    router.put('/storm-zones/:id', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            if (!await isAdminUser(userEmail)) {
                return res.status(403).json({ success: false, error: 'Admin access required' });
            }
            const { isActive, city, state, eventType, eventDate, severity, hailSize, windSpeed, source, notes, } = req.body;
            const existing = await pool.query('SELECT id FROM storm_zones WHERE id = $1', [id]);
            if (existing.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Storm zone not found' });
            }
            const result = await pool.query(`UPDATE storm_zones SET
          is_active  = COALESCE($1, is_active),
          city       = COALESCE($2, city),
          state      = COALESCE($3, state),
          event_type = COALESCE($4, event_type),
          event_date = COALESCE($5, event_date),
          severity   = COALESCE($6, severity),
          hail_size  = COALESCE($7, hail_size),
          wind_speed = COALESCE($8, wind_speed),
          source     = COALESCE($9, source),
          notes      = COALESCE($10, notes),
          updated_at = NOW()
        WHERE id = $11
        RETURNING *`, [
                isActive ?? null,
                city || null,
                state || null,
                eventType || null,
                eventDate || null,
                severity || null,
                hailSize ?? null,
                windSpeed ?? null,
                source || null,
                notes || null,
                id,
            ]);
            return res.json({ success: true, stormZone: result.rows[0] });
        }
        catch (error) {
            console.error('❌ Update storm zone error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update storm zone' });
        }
    });
    /**
     * DELETE /api/leads/storm-zones/:id
     * Soft-delete a storm zone by deactivating it (admin only).
     */
    router.delete('/storm-zones/:id', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            const { id } = req.params;
            if (!await isAdminUser(userEmail)) {
                return res.status(403).json({ success: false, error: 'Admin access required' });
            }
            const result = await pool.query(`UPDATE storm_zones
         SET is_active = false, updated_at = NOW()
         WHERE id = $1
         RETURNING id`, [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Storm zone not found' });
            }
            return res.json({ success: true, message: 'Storm zone deactivated' });
        }
        catch (error) {
            console.error('❌ Deactivate storm zone error:', error);
            return res.status(500).json({ success: false, error: 'Failed to deactivate storm zone' });
        }
    });
    /**
     * POST /api/leads/referral-codes
     * Create a referral code (admin or profile owner).
     * Code is auto-generated from the customer's last name + 4 random digits,
     * e.g. SMITH7284. Uniqueness is retried up to 5 times.
     */
    router.post('/referral-codes', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail) {
                return res.status(401).json({ success: false, error: 'Authentication required' });
            }
            const isAdmin = await isAdminUser(userEmail);
            const profileId = !isAdmin ? await getUserProfileId(userEmail) : null;
            if (!isAdmin && !profileId) {
                return res.status(403).json({ success: false, error: 'No profile linked to your account' });
            }
            const { customerName, customerEmail, customerPhone, profileId: bodyProfileId, rewardType, rewardAmount, } = req.body;
            if (!customerName || !customerName.trim()) {
                return res.status(400).json({ success: false, error: 'customerName is required' });
            }
            // Determine which profile the code belongs to
            const resolvedProfileId = isAdmin ? (bodyProfileId || null) : profileId;
            // Generate unique referral code: LASTNAME + 4 digits
            const nameParts = customerName.trim().toUpperCase().split(/\s+/);
            const lastName = (nameParts[nameParts.length - 1] || 'REF').replace(/[^A-Z]/g, '');
            const basePrefix = lastName.slice(0, 8) || 'REF';
            let code = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                const digits = Math.floor(1000 + Math.random() * 9000).toString();
                const candidate = `${basePrefix}${digits}`;
                const exists = await pool.query('SELECT id FROM referral_codes WHERE UPPER(code) = $1', [candidate]);
                if (exists.rows.length === 0) {
                    code = candidate;
                    break;
                }
            }
            if (!code) {
                return res.status(500).json({ success: false, error: 'Could not generate unique referral code — please try again' });
            }
            const result = await pool.query(`INSERT INTO referral_codes (
          code, customer_name, customer_email, customer_phone,
          profile_id, reward_type, reward_amount,
          total_referrals, is_active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 0, true, NOW(), NOW()
        )
        RETURNING *`, [
                code,
                customerName.trim(),
                customerEmail || null,
                customerPhone || null,
                resolvedProfileId,
                rewardType || null,
                rewardAmount ?? null,
            ]);
            return res.status(201).json({ success: true, referralCode: result.rows[0] });
        }
        catch (error) {
            console.error('❌ Create referral code error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create referral code' });
        }
    });
    /**
     * GET /api/leads/referral-codes
     * List referral codes.
     * Admin: all codes.  Rep: only codes tied to their profile.
     */
    router.get('/referral-codes', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail) {
                return res.status(401).json({ success: false, error: 'Authentication required' });
            }
            const isAdmin = await isAdminUser(userEmail);
            const profileId = !isAdmin ? await getUserProfileId(userEmail) : null;
            if (!isAdmin && !profileId) {
                return res.status(403).json({ success: false, error: 'No profile linked to your account' });
            }
            let query = `
        SELECT
          rc.*,
          ep.name as rep_name,
          ep.slug as rep_slug
        FROM referral_codes rc
        LEFT JOIN employee_profiles ep ON ep.id = rc.profile_id
        WHERE 1=1
      `;
            const params = [];
            if (!isAdmin) {
                params.push(profileId);
                query += ` AND rc.profile_id = $${params.length}`;
            }
            query += ' ORDER BY rc.created_at DESC';
            const result = await pool.query(query, params);
            return res.json({ success: true, referralCodes: result.rows });
        }
        catch (error) {
            console.error('❌ List referral codes error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch referral codes' });
        }
    });
    return router;
}
export default createLeadGenRoutes;
