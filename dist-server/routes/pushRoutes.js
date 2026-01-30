/**
 * Push Notification API Routes
 *
 * Endpoints for managing push notification tokens, preferences, and sending notifications.
 * Supports iOS, Android, and Web push via Firebase Cloud Messaging.
 */
import { Router } from 'express';
import { createPushNotificationService } from '../services/pushNotificationService.js';
const router = Router();
// Get pool from app
const getPool = (req) => {
    return req.app.get('pool');
};
// Get user ID from email header
const getUserIdFromEmail = async (pool, email) => {
    const result = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return result.rows[0]?.id || null;
};
/**
 * POST /api/push/register
 * Register a device token for push notifications
 *
 * Body:
 * {
 *   deviceToken: string;
 *   deviceType: 'ios' | 'android' | 'web';
 *   deviceName?: string;
 *   deviceModel?: string;
 * }
 */
router.post('/register', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { deviceToken, deviceType, deviceName, deviceModel } = req.body;
        // Validate required fields
        if (!deviceToken || !deviceType) {
            return res.status(400).json({ error: 'deviceToken and deviceType are required' });
        }
        const validDeviceTypes = ['ios', 'android', 'web'];
        if (!validDeviceTypes.includes(deviceType)) {
            return res.status(400).json({
                error: `deviceType must be one of: ${validDeviceTypes.join(', ')}`
            });
        }
        const service = createPushNotificationService(pool);
        const token = await service.registerToken(userId, deviceToken, deviceType, deviceName, deviceModel);
        if (!token) {
            return res.status(500).json({ error: 'Failed to register device token' });
        }
        console.log(`✅ Registered push token for user ${userId} (${deviceType})`);
        res.json({
            success: true,
            token
        });
    }
    catch (error) {
        console.error('❌ Error registering push token:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * DELETE /api/push/token
 * Remove a device token
 *
 * Body:
 * {
 *   deviceToken: string;
 * }
 */
router.delete('/token', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { deviceToken } = req.body;
        if (!deviceToken) {
            return res.status(400).json({ error: 'deviceToken is required' });
        }
        const service = createPushNotificationService(pool);
        const removed = await service.removeToken(userId, deviceToken);
        if (!removed) {
            return res.status(404).json({ error: 'Device token not found' });
        }
        console.log(`✅ Removed push token for user ${userId}`);
        res.json({
            success: true,
            message: 'Device token removed'
        });
    }
    catch (error) {
        console.error('❌ Error removing push token:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/push/preferences
 * Get notification preferences for the user
 */
router.get('/preferences', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const result = await pool.query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
        if (result.rows.length === 0) {
            // Return default preferences
            return res.json({
                success: true,
                preferences: {
                    allNotificationsEnabled: true,
                    stormAlertsEnabled: true,
                    impactAlertsEnabled: true,
                    teamMentionAlerts: true,
                    teamMessageAlerts: true,
                    quietHoursEnabled: false,
                    quietHoursStart: '22:00',
                    quietHoursEnd: '07:00',
                    timezone: 'America/New_York'
                }
            });
        }
        const prefs = result.rows[0];
        res.json({
            success: true,
            preferences: {
                allNotificationsEnabled: prefs.all_notifications_enabled,
                stormAlertsEnabled: prefs.storm_alerts_enabled,
                impactAlertsEnabled: prefs.impact_alerts_enabled,
                teamMentionAlerts: prefs.team_mention_alerts,
                teamMessageAlerts: prefs.team_message_alerts,
                quietHoursEnabled: prefs.quiet_hours_enabled,
                quietHoursStart: prefs.quiet_hours_start,
                quietHoursEnd: prefs.quiet_hours_end,
                timezone: prefs.timezone
            }
        });
    }
    catch (error) {
        console.error('❌ Error getting preferences:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * PUT /api/push/preferences
 * Update notification preferences
 *
 * Body:
 * {
 *   allNotificationsEnabled?: boolean;
 *   stormAlertsEnabled?: boolean;
 *   impactAlertsEnabled?: boolean;
 *   teamMentionAlerts?: boolean;
 *   teamMessageAlerts?: boolean;
 *   quietHoursEnabled?: boolean;
 *   quietHoursStart?: string;
 *   quietHoursEnd?: string;
 *   timezone?: string;
 * }
 */
router.put('/preferences', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { allNotificationsEnabled, stormAlertsEnabled, impactAlertsEnabled, teamMentionAlerts, teamMessageAlerts, quietHoursEnabled, quietHoursStart, quietHoursEnd, timezone } = req.body;
        // Build dynamic update query
        const updateFields = [];
        const values = [];
        let paramIndex = 1;
        const fieldMap = {
            allNotificationsEnabled: 'all_notifications_enabled',
            stormAlertsEnabled: 'storm_alerts_enabled',
            impactAlertsEnabled: 'impact_alerts_enabled',
            teamMentionAlerts: 'team_mention_alerts',
            teamMessageAlerts: 'team_message_alerts',
            quietHoursEnabled: 'quiet_hours_enabled',
            quietHoursStart: 'quiet_hours_start',
            quietHoursEnd: 'quiet_hours_end',
            timezone: 'timezone'
        };
        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (key in req.body) {
                updateFields.push(`${dbField} = $${paramIndex}`);
                values.push(req.body[key]);
                paramIndex++;
            }
        }
        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No preferences to update' });
        }
        values.push(userId);
        // Upsert preferences
        const result = await pool.query(`INSERT INTO notification_preferences (user_id, ${Object.values(fieldMap).filter((_, i) => i < updateFields.length).join(', ')})
      VALUES ($${paramIndex}, ${values.slice(0, -1).map((_, i) => `$${i + 1}`).join(', ')})
      ON CONFLICT (user_id)
      DO UPDATE SET ${updateFields.join(', ')}, updated_at = NOW()
      RETURNING *`, values);
        console.log(`✅ Updated notification preferences for user ${userId}`);
        res.json({
            success: true,
            message: 'Preferences updated'
        });
    }
    catch (error) {
        console.error('❌ Error updating preferences:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * POST /api/push/test
 * Send a test notification
 *
 * Body:
 * {
 *   title?: string;
 *   body?: string;
 * }
 */
router.post('/test', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { title = 'Test Notification', body = 'This is a test notification from Gemini Field Assistant' } = req.body;
        const service = createPushNotificationService(pool);
        const results = await service.sendToUser(userId, {
            title,
            body,
            data: {
                type: 'test',
                timestamp: new Date().toISOString()
            }
        }, 'general');
        console.log(`✅ Sent test notification to user ${userId}`);
        res.json({
            success: true,
            results
        });
    }
    catch (error) {
        console.error('❌ Error sending test notification:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/push/stats
 * Get notification statistics
 *
 * Query params:
 * - daysBack?: number (default: 30)
 */
router.get('/stats', async (req, res) => {
    try {
        const pool = getPool(req);
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ error: 'User email required' });
        }
        const userId = await getUserIdFromEmail(pool, userEmail);
        if (!userId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { daysBack = '30' } = req.query;
        const service = createPushNotificationService(pool);
        const stats = await service.getNotificationStats(parseInt(daysBack));
        res.json({
            success: true,
            stats
        });
    }
    catch (error) {
        console.error('❌ Error getting notification stats:', error);
        res.status(500).json({ error: error.message });
    }
});
export default router;
