/**
 * Check-In Notification Service
 *
 * Handles push notifications when team members check in.
 * Supports proximity-based filtering and user preferences.
 */
import { createPushNotificationService } from './pushNotificationService.js';
import { calculateDistanceMiles, formatDistance } from '../utils/geoUtils.js';
export class CheckinNotificationService {
    pool;
    pushService;
    constructor(pool) {
        this.pool = pool;
        this.pushService = createPushNotificationService(pool);
    }
    /**
     * Send check-in notifications to team members
     *
     * @param checkinData - Data about the check-in
     * @returns Map of user IDs to notification results
     */
    async notifyTeamOfCheckin(checkinData) {
        console.log(`📍 Processing check-in notification for user ${checkinData.userId}`);
        // Get all users who should be notified
        const usersToNotify = await this.getUsersToNotify(checkinData.userId, checkinData.checkInLat, checkinData.checkInLng);
        console.log(`👥 Found ${usersToNotify.length} users to notify`);
        const results = new Map();
        for (const user of usersToNotify) {
            try {
                // Calculate distance if user has location
                let distanceInfo = '';
                if (user.lastKnownLat && user.lastKnownLng) {
                    const distance = calculateDistanceMiles(user.lastKnownLat, user.lastKnownLng, checkinData.checkInLat, checkinData.checkInLng);
                    distanceInfo = ` (${formatDistance(distance)} away)`;
                }
                // Build notification
                const title = `📍 ${checkinData.userName} checked in`;
                let body = `${checkinData.userName} is now in the field${distanceInfo}`;
                if (checkinData.note) {
                    body += ` - ${checkinData.note}`;
                }
                // Send notification
                const notificationResults = await this.pushService.sendToUser(user.id, {
                    title,
                    body,
                    data: {
                        type: 'checkin',
                        checkinId: checkinData.checkinId,
                        userId: checkinData.userId,
                        userName: checkinData.userName,
                        latitude: checkinData.checkInLat.toString(),
                        longitude: checkinData.checkInLng.toString(),
                        timestamp: new Date().toISOString()
                    }
                }, 'checkin_alert');
                results.set(user.id, notificationResults);
                console.log(`✅ Sent check-in notification to ${user.name} (${user.email})`);
            }
            catch (error) {
                console.error(`❌ Failed to send notification to ${user.name}:`, error);
                results.set(user.id, {
                    success: false,
                    error: error.message
                });
            }
        }
        return results;
    }
    /**
     * Get list of users who should be notified about the check-in
     * Excludes the user who checked in and respects notification preferences
     *
     * @param checkinUserId - ID of user who checked in
     * @param checkInLat - Check-in latitude
     * @param checkInLng - Check-in longitude
     * @returns List of users to notify
     */
    async getUsersToNotify(checkinUserId, checkInLat, checkInLng) {
        // Get all users with their preferences and last known locations
        // Last known location comes from their most recent check-in
        const result = await this.pool.query(`
      WITH user_last_location AS (
        SELECT DISTINCT ON (user_id)
          user_id,
          check_in_lat,
          check_in_lng
        FROM territory_checkins
        WHERE check_in_lat IS NOT NULL
          AND check_in_lng IS NOT NULL
        ORDER BY user_id, check_in_time DESC
      )
      SELECT
        u.id,
        u.name,
        u.email,
        ull.check_in_lat as last_known_lat,
        ull.check_in_lng as last_known_lng,
        COALESCE(np.checkin_alerts_enabled, TRUE) as checkin_alerts_enabled,
        np.checkin_proximity_miles,
        COALESCE(np.all_notifications_enabled, TRUE) as all_notifications_enabled
      FROM users u
      LEFT JOIN user_last_location ull ON u.id = ull.user_id
      LEFT JOIN notification_preferences np ON u.id = np.user_id
      WHERE u.id != $1
        AND u.role IN ('sales_rep', 'team_lead', 'manager')
      `, [checkinUserId]);
        // Filter users based on preferences and proximity
        const usersToNotify = [];
        for (const row of result.rows) {
            // Check if user has notifications enabled
            if (!row.all_notifications_enabled || !row.checkin_alerts_enabled) {
                console.log(`⏭️  Skipping ${row.name} - notifications disabled`);
                continue;
            }
            // Check proximity if user has a preference set
            if (row.checkin_proximity_miles) {
                // Only notify if user has a last known location
                if (!row.last_known_lat || !row.last_known_lng) {
                    console.log(`⏭️  Skipping ${row.name} - no location data for proximity check`);
                    continue;
                }
                const distance = calculateDistanceMiles(row.last_known_lat, row.last_known_lng, checkInLat, checkInLng);
                if (distance > row.checkin_proximity_miles) {
                    console.log(`⏭️  Skipping ${row.name} - outside proximity range (${distance.toFixed(1)} mi > ${row.checkin_proximity_miles} mi)`);
                    continue;
                }
            }
            // User should be notified
            usersToNotify.push({
                id: row.id,
                name: row.name,
                email: row.email,
                lastKnownLat: row.last_known_lat,
                lastKnownLng: row.last_known_lng
            });
        }
        return usersToNotify;
    }
    /**
     * Update user's notification preferences for check-ins
     *
     * @param userId - User ID
     * @param enabled - Enable/disable check-in notifications
     * @param proximityMiles - Optional proximity filter (miles)
     * @returns Success status
     */
    async updateCheckinPreferences(userId, enabled, proximityMiles) {
        try {
            await this.pool.query(`
        INSERT INTO notification_preferences (user_id, checkin_alerts_enabled, checkin_proximity_miles)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id)
        DO UPDATE SET
          checkin_alerts_enabled = $2,
          checkin_proximity_miles = $3,
          updated_at = NOW()
        `, [userId, enabled, proximityMiles || null]);
            console.log(`✅ Updated check-in notification preferences for user ${userId}`);
            return true;
        }
        catch (error) {
            console.error('❌ Error updating check-in preferences:', error);
            return false;
        }
    }
    /**
     * Get check-in notification preferences for a user
     *
     * @param userId - User ID
     * @returns Notification preferences
     */
    async getCheckinPreferences(userId) {
        try {
            const result = await this.pool.query(`
        SELECT
          COALESCE(checkin_alerts_enabled, TRUE) as enabled,
          checkin_proximity_miles as proximity_miles
        FROM notification_preferences
        WHERE user_id = $1
        `, [userId]);
            if (result.rows.length === 0) {
                return { enabled: true }; // Default: enabled with no proximity filter
            }
            return {
                enabled: result.rows[0].enabled,
                proximityMiles: result.rows[0].proximity_miles || undefined
            };
        }
        catch (error) {
            console.error('❌ Error getting check-in preferences:', error);
            return { enabled: true }; // Default on error
        }
    }
}
/**
 * Create a check-in notification service instance
 */
export const createCheckinNotificationService = (pool) => {
    return new CheckinNotificationService(pool);
};
