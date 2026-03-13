/**
 * Lead Generation Routes
 * API endpoints for universal lead intake, storm zone management,
 * referral codes, and lead gen dashboard analytics.
 *
 * Public routes  — no auth required (landing pages, QR door drops, etc.)
 * Private routes — require x-user-email header (admin or profile owner)
 */
import { Router } from 'express';
import { emailService } from '../services/emailService.js';
import { LeadSmsService } from '../services/leadSmsService.js';
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createLeadGenRoutes(pool) {
    const router = Router();
    const leadSmsService = new LeadSmsService(pool);
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
                'reengagement', 'appointment_ai', 'phone_call',
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
            // --- Sanitize preferredDate (may be "Monday" not a real date) ----------
            let safeDate = null;
            let dateNote = '';
            if (preferredDate) {
                const parsed = new Date(preferredDate);
                if (!isNaN(parsed.getTime())) {
                    safeDate = preferredDate;
                }
                else {
                    // Not a valid date — store in message instead
                    dateNote = ` | Preferred: ${preferredDate}${preferredTime ? ' at ' + preferredTime : ''}`;
                }
            }
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
                safeDate,
                preferredTime || null,
                (message || '') + dateNote || null,
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
            // --- SMS follow-up sequence (fire-and-forget) -------------------------
            if (homeownerPhone) {
                leadSmsService.enqueueSequence({
                    leadId,
                    homeownerName: homeownerName.trim(),
                    homeownerPhone,
                    serviceType: serviceType || undefined,
                    zipCode: zipCode || undefined,
                }).catch((err) => {
                    console.error('❌ SMS sequence enqueue failed:', err);
                });
            }
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
    // =========================================================================
    // TWILIO WEBHOOKS (no auth — Twilio POST callbacks)
    // =========================================================================
    /**
     * POST /api/leads/sms-webhook
     * Receives inbound SMS to the Susan Twilio number.
     * Creates a lead from the text message and auto-replies.
     */
    router.post('/sms-webhook', async (req, res) => {
        try {
            const { From, Body, FromCity, FromState, FromZip } = req.body;
            console.log(`[SMS] Inbound from ${From}: ${Body}`);
            // Insert as a lead
            if (From) {
                await pool.query(`INSERT INTO profile_leads (
            homeowner_name, homeowner_phone, zip_code,
            message, source, lead_score, score_factors,
            status, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, 'sms_inbound', 60,
            $5, 'new', NOW(), NOW()
          )`, [
                    `SMS from ${FromCity || 'Unknown'}, ${FromState || ''}`.trim(),
                    From,
                    FromZip || null,
                    Body || null,
                    JSON.stringify({ hasPhone: true, smsInbound: true }),
                ]);
            }
            // Telegram notification
            notifyTelegram({
                homeownerName: `SMS Lead from ${From}`,
                homeownerPhone: From,
                zipCode: FromZip,
                source: 'sms_inbound',
                score: 60,
            });
            // Respond with TwiML
            res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks for reaching out to The Roof Docs! We offer free roof inspections in VA, MD, and PA. A team member will call you shortly. For immediate help, call us at (571) 520-8507.</Message>
</Response>`);
        }
        catch (error) {
            console.error('❌ SMS webhook error:', error);
            res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks for contacting The Roof Docs! We'll be in touch soon.</Message></Response>`);
        }
    });
    /**
     * POST /api/leads/call-status
     * Receives Twilio call status callbacks (completed, no-answer, busy, etc.)
     * Logs call outcomes for analytics.
     */
    router.post('/call-status', async (req, res) => {
        try {
            const { CallSid, CallStatus, From, To, Duration, CallDuration } = req.body;
            console.log(`[Call Status] ${CallSid}: ${CallStatus} from ${From} (${Duration || CallDuration || 0}s)`);
            // Log missed calls as leads
            if (CallStatus === 'no-answer' || CallStatus === 'busy') {
                await pool.query(`INSERT INTO profile_leads (
            homeowner_name, homeowner_phone,
            message, source, lead_score, score_factors,
            status, created_at, updated_at
          ) VALUES (
            $1, $2, $3, 'missed_call', 50,
            $4, 'new', NOW(), NOW()
          )`, [
                    `Missed call (${CallStatus})`,
                    From,
                    `Call status: ${CallStatus}`,
                    JSON.stringify({ hasPhone: true, missedCall: true }),
                ]);
                notifyTelegram({
                    homeownerName: `Missed Call (${CallStatus})`,
                    homeownerPhone: From,
                    source: 'missed_call',
                    score: 50,
                });
            }
            res.status(200).send('OK');
        }
        catch (error) {
            console.error('❌ Call status webhook error:', error);
            res.status(200).send('OK');
        }
    });
    // =========================================================================
    // ELEVENLABS POST-CALL WEBHOOK
    // =========================================================================
    /**
     * POST /api/leads/elevenlabs-webhook
     * Receives post-conversation data from ElevenLabs after every Susan call.
     * Parses transcript, extracts lead info, saves to DB, sends email + Telegram.
     */
    router.post('/elevenlabs-webhook', async (req, res) => {
        try {
            const payload = req.body;
            // ElevenLabs wraps conversation data under "data" for post_call_transcription
            const convData = payload.data || payload;
            const conversationId = convData.conversation_id || 'unknown';
            const agentId = convData.agent_id || 'unknown';
            const transcript = convData.transcript || [];
            const metadata = convData.metadata || {};
            const analysis = convData.analysis || {};
            const dataCollection = analysis.data_collection_results || {};
            const callSuccessful = analysis.call_successful || 'unknown';
            const transcriptSummary = analysis.transcript_summary || '';
            console.log(`\n📞 [ElevenLabs Webhook] Type: ${payload.type || 'direct'}, Conversation: ${conversationId}`);
            console.log(`   Status: ${convData.status}, Success: ${callSuccessful}`);
            console.log(`   Transcript lines: ${transcript.length}`);
            // Build full transcript text
            const fullTranscript = transcript
                .map((t) => `${t.role === 'agent' ? 'Susan' : 'Caller'}: ${t.message}`)
                .join('\n');
            // --- Extract data from structured fields (if ElevenLabs data collection configured) ---
            let callerName = dataCollection.caller_name?.value || '';
            let callerPhone = dataCollection.phone_number?.value || dataCollection.caller_phone?.value || '';
            let callerAddress = dataCollection.address?.value || dataCollection.property_address?.value || '';
            let appointmentDate = dataCollection.appointment_date?.value || dataCollection.preferred_date?.value || '';
            let appointmentTime = dataCollection.appointment_time?.value || dataCollection.preferred_time?.value || '';
            let damageType = dataCollection.damage_type?.value || dataCollection.service_type?.value || '';
            let callerEmail = dataCollection.email?.value || dataCollection.caller_email?.value || '';
            let zipCode = dataCollection.zip_code?.value || '';
            // --- Fallback: extract from transcript text if structured data missing ---
            if (!callerName || !callerPhone || !callerAddress) {
                const parsed = parseTranscriptForLeadData(fullTranscript);
                callerName = callerName || parsed.name;
                callerPhone = callerPhone || parsed.phone;
                callerAddress = callerAddress || parsed.address;
                appointmentDate = appointmentDate || parsed.date;
                appointmentTime = appointmentTime || parsed.time;
                damageType = damageType || parsed.damageType;
                zipCode = zipCode || parsed.zipCode;
            }
            // --- Calculate call duration ---
            const callDurationSecs = metadata.call_duration_secs
                || (transcript.length > 0
                    ? Math.max(...transcript.map((t) => t.time_in_call_secs || 0))
                    : 0);
            const callDurationFormatted = callDurationSecs > 0
                ? `${Math.floor(callDurationSecs / 60)}m ${Math.round(callDurationSecs % 60)}s`
                : 'unknown';
            // --- Build appointment summary ---
            const hasAppointment = !!(appointmentDate || appointmentTime);
            const appointmentSummary = hasAppointment
                ? `${appointmentDate || 'TBD'} at ${appointmentTime || 'TBD'}`
                : 'No appointment scheduled';
            // --- Save to profile_leads ---
            const leadMessage = [
                `Phone call via Susan AI`,
                hasAppointment ? `Appointment: ${appointmentSummary}` : null,
                damageType ? `Damage: ${damageType}` : null,
                `Duration: ${callDurationFormatted}`,
                `Call status: ${callSuccessful}`,
            ].filter(Boolean).join(' | ');
            const { score, scoreFactors } = await calculateLeadScore({
                homeownerPhone: callerPhone || undefined,
                homeownerEmail: callerEmail || undefined,
                address: callerAddress || undefined,
                serviceType: damageType || 'Roof Inspection',
                preferredDate: appointmentDate || undefined,
                source: 'phone_call',
                zipCode: zipCode || undefined,
            });
            // Boost score for phone calls (they called us = high intent)
            const boostedScore = Math.min(score + 20, 100);
            // Sanitize appointmentDate (may be "Monday" not a valid date)
            let safeAppointmentDate = null;
            if (appointmentDate) {
                const parsed = new Date(appointmentDate);
                if (!isNaN(parsed.getTime())) {
                    safeAppointmentDate = appointmentDate;
                }
                // Non-date values already captured in appointmentSummary/leadMessage
            }
            const insertResult = await pool.query(`INSERT INTO profile_leads (
          homeowner_name, homeowner_email, homeowner_phone,
          address, zip_code, service_type,
          preferred_date, preferred_time,
          message, source, lead_score, score_factors,
          status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          'phone_call', $10, $11,
          'new', NOW(), NOW()
        )
        RETURNING id`, [
                callerName || 'Phone Caller',
                callerEmail || null,
                callerPhone || null,
                callerAddress || null,
                zipCode || null,
                damageType || 'Roof Inspection',
                safeAppointmentDate,
                appointmentTime || null,
                leadMessage,
                boostedScore,
                JSON.stringify({ ...scoreFactors, phoneCall: true, hasAppointment }),
            ]);
            const leadId = insertResult.rows[0].id;
            console.log(`   ✅ Lead saved: #${leadId} (score: ${boostedScore})`);
            // --- Send Telegram notification ---
            notifyTelegram({
                homeownerName: callerName || 'Phone Caller',
                homeownerPhone: callerPhone,
                zipCode,
                serviceType: damageType || 'Roof Inspection',
                source: 'phone_call',
                score: boostedScore,
            });
            // --- Send email notification to admin ---
            const adminEmail = process.env.EMAIL_ADMIN_ADDRESS || 'ahmed.mahmoud@theroofdocs.com';
            const emailTemplate = generateCallLeadEmail({
                callerName: callerName || 'Unknown',
                callerPhone: callerPhone || 'Not provided',
                callerEmail: callerEmail || '',
                callerAddress: callerAddress || 'Not provided',
                appointmentDate,
                appointmentTime,
                appointmentSummary,
                hasAppointment,
                damageType: damageType || 'Not specified',
                callDuration: callDurationFormatted,
                callSuccessful,
                leadScore: boostedScore,
                leadId,
                conversationId,
                transcript: fullTranscript,
            });
            emailService.sendCustomEmail(adminEmail, emailTemplate).catch((err) => {
                console.error('❌ Failed to send call lead email:', err);
            });
            res.status(200).json({ success: true, leadId });
        }
        catch (error) {
            console.error('❌ ElevenLabs webhook error:', error);
            // Always return 200 so ElevenLabs doesn't retry
            res.status(200).json({ success: false, error: 'Processing failed' });
        }
    });
    // =========================================================================
    // SMS FOLLOW-UP ENDPOINTS
    // =========================================================================
    /**
     * POST /api/leads/sms-followups/process
     * Cron endpoint — process pending Day 3/Day 7 follow-ups.
     * Should be called every 15 minutes by a cron job or Railway cron.
     */
    router.post('/sms-followups/process', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            // Allow unauthenticated calls from cron (internal) or admin
            const isCron = req.headers['x-cron-secret'] === process.env.CRON_SECRET;
            if (!isCron && !(userEmail && await isAdminUser(userEmail))) {
                return res.status(403).json({ success: false, error: 'Admin or cron access required' });
            }
            const stats = await leadSmsService.processPendingFollowups();
            return res.json({ success: true, ...stats });
        }
        catch (error) {
            console.error('❌ SMS follow-up processing error:', error);
            return res.status(500).json({ success: false, error: 'Processing failed' });
        }
    });
    /**
     * POST /api/leads/sms-followups/opt-out
     * Twilio webhook for incoming STOP messages.
     * Configure this URL in Twilio console → Phone Number → Messaging → Webhook.
     */
    router.post('/sms-followups/opt-out', async (req, res) => {
        try {
            const { From, Body } = req.body;
            if (!From) {
                return res.status(400).send('<Response></Response>');
            }
            const bodyLower = (Body || '').toLowerCase().trim();
            if (['stop', 'unsubscribe', 'cancel', 'quit', 'end'].includes(bodyLower)) {
                await leadSmsService.handleOptOut(From);
                console.log(`[SMS] Opt-out processed for ${From}`);
            }
            // Return TwiML empty response
            res.type('text/xml');
            return res.send('<Response></Response>');
        }
        catch (error) {
            console.error('❌ SMS opt-out webhook error:', error);
            res.type('text/xml');
            return res.send('<Response></Response>');
        }
    });
    /**
     * GET /api/leads/sms-followups/stats
     * Admin endpoint — SMS follow-up stats for dashboard.
     */
    router.get('/sms-followups/stats', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail || !(await isAdminUser(userEmail))) {
                return res.status(403).json({ success: false, error: 'Admin access required' });
            }
            const stats = await leadSmsService.getStats();
            return res.json({ success: true, ...stats });
        }
        catch (error) {
            console.error('❌ SMS stats error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
        }
    });
    return router;
}
// =============================================================================
// HELPERS — Transcript parsing & email template
// =============================================================================
/** Extract lead data from a call transcript using pattern matching. */
function parseTranscriptForLeadData(transcript) {
    const result = { name: '', phone: '', address: '', date: '', time: '', damageType: '', zipCode: '' };
    // Phone number patterns
    const phoneMatch = transcript.match(/(?:phone|number|reach|call|contact).*?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i) || transcript.match(/(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
    if (phoneMatch)
        result.phone = phoneMatch[1];
    // Name — look for "my name is X" or "this is X" or "I'm X"
    const nameMatch = transcript.match(/(?:my name is|this is|i'm|i am|name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch)
        result.name = nameMatch[1].trim();
    // Address — look for street number + street name patterns
    const addressMatch = transcript.match(/(\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Blvd|Boulevard|Ln|Lane|Ct|Court|Way|Place|Pl|Circle|Cir|Pike|Highway|Hwy)[.,]?\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)?(?:[.,]?\s*(?:VA|MD|PA|Virginia|Maryland|Pennsylvania))?\s*(?:\d{5})?)/i);
    if (addressMatch)
        result.address = addressMatch[1].trim();
    // ZIP code
    const zipMatch = transcript.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (zipMatch)
        result.zipCode = zipMatch[1];
    // Date — look for "Monday", "Tuesday", specific dates, "tomorrow", etc.
    const dateMatch = transcript.match(/(?:appointment|schedule|come out|inspection|visit).*?((?:this |next )?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|tomorrow|today)/i) || transcript.match(/((?:this |next )?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))/i);
    if (dateMatch)
        result.date = dateMatch[1].trim();
    // Time
    const timeMatch = transcript.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.))/i) || transcript.match(/(?:at|around|about)\s+(\d{1,2}(?::\d{2})?)\s*(?:o'clock)?/i);
    if (timeMatch)
        result.time = timeMatch[1].trim();
    // Damage type
    const damageKeywords = ['hail', 'wind', 'storm', 'leak', 'leaking', 'missing shingles', 'water damage', 'tree', 'fallen tree', 'ice dam', 'gutter', 'flashing'];
    const lowerTranscript = transcript.toLowerCase();
    for (const keyword of damageKeywords) {
        if (lowerTranscript.includes(keyword)) {
            result.damageType = keyword.charAt(0).toUpperCase() + keyword.slice(1) + ' damage';
            break;
        }
    }
    return result;
}
/** Generate a formatted email template for a phone call lead. */
function generateCallLeadEmail(data) {
    const { callerName, callerPhone, callerEmail, callerAddress, appointmentSummary, hasAppointment, damageType, callDuration, callSuccessful, leadScore, leadId, conversationId, transcript, } = data;
    const scoreEmoji = leadScore >= 70 ? '🔥' : leadScore >= 40 ? '⚡' : '📋';
    const appointmentBadge = hasAppointment
        ? '<span style="display:inline-block;padding:4px 12px;background:#22c55e;color:white;border-radius:12px;font-size:12px;font-weight:600;">APPOINTMENT SET</span>'
        : '<span style="display:inline-block;padding:4px 12px;background:#f59e0b;color:white;border-radius:12px;font-size:12px;font-weight:600;">NO APPOINTMENT</span>';
    const truncatedTranscript = transcript.length > 2000
        ? transcript.substring(0, 2000) + '\n\n... (truncated)'
        : transcript;
    const subject = `📞 ${hasAppointment ? 'APPOINTMENT SET' : 'New Call Lead'} — ${callerName} ${scoreEmoji} Score: ${leadScore}`;
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susan Call Lead</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 600; }
        .header .subtitle { margin-top: 8px; font-size: 14px; opacity: 0.9; }
        .content { padding: 25px 20px; }
        .section { margin-bottom: 20px; }
        .section-title { font-size: 14px; font-weight: 600; color: #ef4444; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; border-bottom: 2px solid #fecaca; padding-bottom: 5px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .info-row { margin: 6px 0; }
        .label { font-weight: 600; color: #555; font-size: 13px; }
        .value { color: #333; font-size: 14px; }
        .appointment-box { background: ${hasAppointment ? '#f0fdf4' : '#fffbeb'}; border: 2px solid ${hasAppointment ? '#22c55e' : '#f59e0b'}; padding: 15px; border-radius: 8px; text-align: center; margin: 15px 0; }
        .appointment-box .big { font-size: 20px; font-weight: bold; color: ${hasAppointment ? '#15803d' : '#92400e'}; }
        .score-bar { background: #f3f4f6; border-radius: 20px; height: 24px; position: relative; margin: 10px 0; overflow: hidden; }
        .score-fill { height: 100%; border-radius: 20px; background: ${leadScore >= 70 ? '#22c55e' : leadScore >= 40 ? '#f59e0b' : '#6b7280'}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; }
        .transcript-box { background: #f8f9fa; border: 1px solid #e5e7eb; padding: 15px; margin: 15px 0; border-radius: 8px; white-space: pre-wrap; word-break: break-word; font-family: 'Courier New', monospace; font-size: 12px; max-height: 400px; overflow-y: auto; line-height: 1.8; }
        .footer { background: #f8f9fa; padding: 15px 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📞 Susan AI — Call Lead</h1>
          <div class="subtitle">The Roof Docs • ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' })}</div>
        </div>
        <div class="content">

          <div class="appointment-box">
            ${appointmentBadge}
            <div class="big" style="margin-top:8px;">${appointmentSummary}</div>
            ${callerAddress ? `<div style="margin-top:5px;color:#555;">${callerAddress}</div>` : ''}
          </div>

          <div class="section">
            <div class="section-title">Caller Info</div>
            <div class="info-row"><span class="label">Name:</span> <span class="value">${callerName}</span></div>
            <div class="info-row"><span class="label">Phone:</span> <span class="value">${callerPhone}</span></div>
            ${callerEmail ? `<div class="info-row"><span class="label">Email:</span> <span class="value">${callerEmail}</span></div>` : ''}
            <div class="info-row"><span class="label">Address:</span> <span class="value">${callerAddress || 'Not provided'}</span></div>
            <div class="info-row"><span class="label">Damage:</span> <span class="value">${damageType}</span></div>
          </div>

          <div class="section">
            <div class="section-title">Call Details</div>
            <div class="info-row"><span class="label">Duration:</span> <span class="value">${callDuration}</span></div>
            <div class="info-row"><span class="label">Outcome:</span> <span class="value">${callSuccessful}</span></div>
            <div class="info-row"><span class="label">Lead ID:</span> <span class="value">#${leadId}</span></div>
            <div class="info-row">
              <span class="label">Score:</span>
              <div class="score-bar"><div class="score-fill" style="width:${leadScore}%">${leadScore}/100</div></div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Full Transcript</div>
            <div class="transcript-box">${truncatedTranscript.replace(/\n/g, '<br>')}</div>
          </div>

        </div>
        <div class="footer">
          Susan AI • The Roof Docs • Lead #${leadId} • Conv: ${conversationId.substring(0, 8)}
        </div>
      </div>
    </body>
    </html>
  `;
    const text = `
📞 SUSAN AI — CALL LEAD
${'='.repeat(50)}

${hasAppointment ? '✅ APPOINTMENT SET' : '⚠️ NO APPOINTMENT'}
${appointmentSummary}
${callerAddress ? `Location: ${callerAddress}` : ''}

CALLER INFO
Name: ${callerName}
Phone: ${callerPhone}
${callerEmail ? `Email: ${callerEmail}` : ''}
Address: ${callerAddress || 'Not provided'}
Damage: ${damageType}

CALL DETAILS
Duration: ${callDuration}
Outcome: ${callSuccessful}
Lead Score: ${leadScore}/100
Lead ID: #${leadId}

TRANSCRIPT
${'-'.repeat(50)}
${truncatedTranscript}
${'-'.repeat(50)}

Susan AI • The Roof Docs
  `.trim();
    return { subject, html, text };
}
export default createLeadGenRoutes;
