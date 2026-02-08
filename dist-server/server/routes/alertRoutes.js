/**
 * Alert Routes
 *
 * API endpoints for SMS storm alerts via Twilio.
 * Handles test SMS, status checks, and storm notifications.
 */
import { Router } from 'express';
import { twilioService } from '../services/twilioService.js';
const router = Router();
/**
 * Middleware to check if user is admin
 */
const requireAdmin = async (req, res, next) => {
    try {
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'No user email provided' });
        }
        const pool = req.app.get('pool');
        const result = await pool.query('SELECT role FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
        if (!result.rows[0] || result.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    }
    catch (error) {
        console.error('[Alert Routes] Admin check error:', error);
        return res.status(500).json({ error: 'Failed to verify admin access' });
    }
};
/**
 * Get user ID from email header
 */
const getUserIdFromEmail = async (pool, email) => {
    const result = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return result.rows[0]?.id || null;
};
/**
 * POST /api/alerts/test-sms
 * Send a test SMS to verify Twilio configuration
 * Admin only
 *
 * Body:
 * {
 *   phoneNumber: string  // Phone number to send test to
 * }
 */
router.post('/test-sms', requireAdmin, async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }
        // Validate phone number format
        if (!twilioService.validatePhoneNumber(phoneNumber)) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }
        // Send test SMS
        const result = await twilioService.sendTestSMS(phoneNumber);
        if (result.success) {
            return res.json({
                success: true,
                message: 'Test SMS sent successfully',
                messageSid: result.messageSid
            });
        }
        else {
            return res.status(500).json({
                success: false,
                error: result.error || 'Failed to send test SMS'
            });
        }
    }
    catch (error) {
        console.error('[Alert Routes] Test SMS error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/alerts/sms-status
 * Check Twilio service configuration status
 */
router.get('/sms-status', async (req, res) => {
    try {
        const status = twilioService.getStatus();
        return res.json({
            ...status,
            message: status.configured
                ? 'Twilio SMS service is configured and ready'
                : 'Twilio SMS service is not configured'
        });
    }
    catch (error) {
        console.error('[Alert Routes] Status check error:', error);
        return res.status(500).json({
            error: 'Failed to check Twilio status',
            details: error.message
        });
    }
});
/**
 * POST /api/alerts/storm-notification
 * Trigger a storm notification SMS
 *
 * Body:
 * {
 *   phoneNumber: string       // Recipient phone number
 *   propertyAddress: string   // Property address
 *   propertyId?: string       // Optional: for rate limiting
 *   eventType: string         // 'hail', 'wind', 'tornado', etc.
 *   hailSize?: number         // Hail size in inches
 *   windSpeed?: number        // Wind speed in mph
 *   date?: string             // Optional: event date (defaults to today in Eastern)
 * }
 */
router.post('/storm-notification', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'No user email provided' });
        }
        const pool = req.app.get('pool');
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { phoneNumber, propertyAddress, propertyId, eventType, hailSize, windSpeed, date } = req.body;
        // Validate required fields
        if (!phoneNumber || !propertyAddress || !eventType) {
            return res.status(400).json({
                error: 'Missing required fields: phoneNumber, propertyAddress, eventType'
            });
        }
        // Validate phone number format
        if (!twilioService.validatePhoneNumber(phoneNumber)) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }
        // Send storm alert
        const result = await twilioService.sendStormAlert({
            phoneNumber,
            propertyAddress,
            propertyId,
            eventType,
            hailSize,
            windSpeed,
            date,
            userId
        });
        if (result.success) {
            return res.json({
                success: true,
                message: 'Storm alert sent successfully',
                messageSid: result.messageSid
            });
        }
        else {
            // Return 429 for rate limiting
            if (result.error?.includes('Rate limit')) {
                return res.status(429).json({
                    success: false,
                    error: result.error
                });
            }
            return res.status(500).json({
                success: false,
                error: result.error || 'Failed to send storm alert'
            });
        }
    }
    catch (error) {
        console.error('[Alert Routes] Storm notification error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * POST /api/alerts/batch-storm-notifications
 * Send storm alerts to multiple recipients
 *
 * Body:
 * {
 *   alerts: Array<{
 *     userId: string
 *     phoneNumber: string
 *     propertyAddress: string
 *     propertyId?: string
 *     eventType: string
 *     hailSize?: number
 *     windSpeed?: number
 *     impactAlertId?: string
 *   }>
 * }
 */
router.post('/batch-storm-notifications', requireAdmin, async (req, res) => {
    try {
        const { alerts } = req.body;
        if (!Array.isArray(alerts) || alerts.length === 0) {
            return res.status(400).json({ error: 'alerts array is required and must not be empty' });
        }
        // Validate all alerts
        for (const alert of alerts) {
            if (!alert.phoneNumber || !alert.propertyAddress || !alert.eventType || !alert.userId) {
                return res.status(400).json({
                    error: 'Each alert must have userId, phoneNumber, propertyAddress, and eventType'
                });
            }
            if (!twilioService.validatePhoneNumber(alert.phoneNumber)) {
                return res.status(400).json({
                    error: `Invalid phone number format: ${alert.phoneNumber}`
                });
            }
        }
        // Send batch alerts
        const result = await twilioService.sendBatchAlerts(alerts);
        return res.json({
            success: true,
            ...result
        });
    }
    catch (error) {
        console.error('[Alert Routes] Batch notification error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/alerts/sms-stats
 * Get SMS statistics for current user
 *
 * Query params:
 * - daysBack: number (default: 30) - Number of days to look back
 */
router.get('/sms-stats', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'No user email provided' });
        }
        const pool = req.app.get('pool');
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const daysBack = parseInt(req.query.daysBack) || 30;
        const stats = await twilioService.getUserStats(userId, daysBack);
        return res.json({
            success: true,
            stats,
            daysBack
        });
    }
    catch (error) {
        console.error('[Alert Routes] Stats error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/alerts/recent-notifications
 * Get recent SMS notifications (admin only)
 *
 * Query params:
 * - limit: number (default: 50) - Max results to return
 */
router.get('/recent-notifications', requireAdmin, async (req, res) => {
    try {
        const pool = req.app.get('pool');
        const limit = parseInt(req.query.limit) || 50;
        const result = await pool.query(`SELECT * FROM recent_sms_notifications
       LIMIT $1`, [limit]);
        return res.json({
            success: true,
            notifications: result.rows,
            count: result.rows.length
        });
    }
    catch (error) {
        console.error('[Alert Routes] Recent notifications error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});
export default router;
