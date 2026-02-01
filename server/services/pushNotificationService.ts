/**
 * Push Notification Service
 *
 * Handles Firebase Cloud Messaging (FCM) for push notifications.
 * Supports iOS, Android, and Web push notifications.
 *
 * Features:
 * - Send notifications to individual users
 * - Send notifications to teams/groups
 * - Storm alerts when storms hit territories
 * - Impact alerts when customer properties are affected
 * - Token management (register, remove, validate)
 * - Notification preferences and quiet hours
 */

import { Pool } from 'pg';
// Note: Firebase Admin SDK needs to be installed: npm install firebase-admin

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface PushToken {
  id: string;
  userId: string;
  deviceToken: string;
  deviceType: 'ios' | 'android' | 'web';
  deviceName?: string;
  isActive: boolean;
  notificationsEnabled: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  allNotificationsEnabled: boolean;
  stormAlertsEnabled: boolean;
  impactAlertsEnabled: boolean;
  teamMentionAlerts: boolean;
  teamMessageAlerts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;
}

export class PushNotificationService {
  private firebaseApp: any = null;
  private messaging: any = null;

  constructor(private pool: Pool) {}

  /**
   * Initialize Firebase Admin SDK
   * Call this once at app startup with your service account credentials
   */
  async initializeFirebase(serviceAccountPath?: string): Promise<boolean> {
    try {
      // Dynamic import to avoid issues if firebase-admin not installed
      const admin = await import('firebase-admin');

      if (admin.apps.length === 0) {
        if (serviceAccountPath) {
          const serviceAccount = require(serviceAccountPath);
          this.firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
          this.firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        } else {
          // Use default credentials (for Google Cloud environments)
          this.firebaseApp = admin.initializeApp();
        }
      } else {
        this.firebaseApp = admin.apps[0];
      }

      this.messaging = admin.messaging();
      console.log('✅ Firebase Admin SDK initialized for push notifications');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Firebase:', error);
      return false;
    }
  }

  /**
   * Register a device token for a user
   */
  async registerToken(
    userId: string,
    deviceToken: string,
    deviceType: 'ios' | 'android' | 'web',
    deviceName?: string,
    deviceModel?: string
  ): Promise<PushToken | null> {
    try {
      const result = await this.pool.query(
        `INSERT INTO push_tokens (
          user_id, device_token, device_type, device_name, device_model, is_active
        ) VALUES ($1, $2, $3, $4, $5, TRUE)
        ON CONFLICT (user_id, device_token)
        DO UPDATE SET
          device_type = EXCLUDED.device_type,
          device_name = EXCLUDED.device_name,
          device_model = EXCLUDED.device_model,
          is_active = TRUE,
          updated_at = NOW()
        RETURNING *`,
        [userId, deviceToken, deviceType, deviceName || null, deviceModel || null]
      );

      return this.rowToToken(result.rows[0]);
    } catch (error) {
      console.error('Error registering push token:', error);
      return null;
    }
  }

  /**
   * Remove/deactivate a device token
   */
  async removeToken(userId: string, deviceToken: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `UPDATE push_tokens
        SET is_active = FALSE, updated_at = NOW()
        WHERE user_id = $1 AND device_token = $2`,
        [userId, deviceToken]
      );

      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error removing push token:', error);
      return false;
    }
  }

  /**
   * Get all active tokens for a user
   */
  async getUserTokens(userId: string): Promise<PushToken[]> {
    const result = await this.pool.query(
      `SELECT * FROM push_tokens
      WHERE user_id = $1 AND is_active = TRUE AND notifications_enabled = TRUE`,
      [userId]
    );

    return result.rows.map(this.rowToToken);
  }

  /**
   * Send notification to a specific user (all their devices)
   */
  async sendToUser(
    userId: string,
    notification: PushNotification,
    notificationType: string = 'general'
  ): Promise<NotificationResult[]> {
    if (!this.messaging) {
      console.warn('Firebase not initialized. Notification not sent.');
      return [{ success: false, error: 'Firebase not initialized' }];
    }

    // Check if user should receive notifications
    const shouldSend = await this.shouldSendNotification(userId, notificationType);
    if (!shouldSend) {
      return [{ success: false, error: 'User has disabled notifications or is in quiet hours' }];
    }

    const tokens = await this.getUserTokens(userId);
    if (tokens.length === 0) {
      return [{ success: false, error: 'No active push tokens for user' }];
    }

    const results: NotificationResult[] = [];

    for (const token of tokens) {
      const result = await this.sendToToken(token, notification, notificationType);
      results.push(result);
    }

    return results;
  }

  /**
   * Send notification to a single token
   */
  private async sendToToken(
    token: PushToken,
    notification: PushNotification,
    notificationType: string
  ): Promise<NotificationResult> {
    if (!this.messaging) {
      return { success: false, error: 'Firebase not initialized' };
    }

    try {
      const message: any = {
        token: token.deviceToken,
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: notification.data || {}
      };

      // Platform-specific configuration
      if (token.deviceType === 'ios') {
        message.apns = {
          payload: {
            aps: {
              badge: 1,
              sound: 'default',
              alert: {
                title: notification.title,
                body: notification.body
              }
            }
          }
        };
      } else if (token.deviceType === 'android') {
        message.android = {
          priority: 'high',
          notification: {
            channelId: 'default',
            icon: 'ic_notification',
            color: '#3B82F6'
          }
        };
      }

      const response = await this.messaging.send(message);

      // Log the notification
      await this.logNotification(
        token.userId,
        token.id,
        token.deviceToken,
        notification,
        notificationType,
        'sent',
        response
      );

      return { success: true, messageId: response };
    } catch (error: any) {
      console.error('Error sending push notification:', error);

      // If token is invalid, mark it as inactive
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        await this.removeToken(token.userId, token.deviceToken);
      }

      await this.logNotification(
        token.userId,
        token.id,
        token.deviceToken,
        notification,
        notificationType,
        'failed',
        undefined,
        error.message
      );

      return { success: false, error: error.message };
    }
  }

  /**
   * Send storm alert to users in affected area
   */
  async sendStormAlert(
    userIds: string[],
    stormData: {
      latitude: number;
      longitude: number;
      city: string;
      state: string;
      eventType: string;
      hailSize?: number;
      windSpeed?: number;
    },
    stormEventId?: string
  ): Promise<Map<string, NotificationResult[]>> {
    const notification: PushNotification = {
      title: `🌧️ ${stormData.eventType === 'hail' ? 'Hail' : stormData.eventType === 'tornado' ? 'Tornado' : 'Storm'} Alert`,
      body: this.buildStormAlertBody(stormData),
      data: {
        type: 'storm_alert',
        latitude: stormData.latitude.toString(),
        longitude: stormData.longitude.toString(),
        city: stormData.city,
        state: stormData.state,
        eventType: stormData.eventType,
        ...(stormEventId && { stormEventId })
      }
    };

    const results = new Map<string, NotificationResult[]>();

    for (const userId of userIds) {
      const userResults = await this.sendToUser(userId, notification, 'storm_alert');
      results.set(userId, userResults);
    }

    return results;
  }

  /**
   * Send impact alert when a customer's property is affected
   */
  async sendImpactAlert(
    userId: string,
    impactData: {
      customerName: string;
      address: string;
      eventType: string;
      distanceMiles: number;
      hailSize?: number;
    },
    alertId?: string
  ): Promise<NotificationResult[]> {
    const notification: PushNotification = {
      title: '⚠️ Customer Property Impacted',
      body: `${impactData.customerName} at ${impactData.address} may be affected by recent ${impactData.eventType}. Storm was ${impactData.distanceMiles.toFixed(1)} miles away.`,
      data: {
        type: 'impact_alert',
        customerName: impactData.customerName,
        address: impactData.address,
        eventType: impactData.eventType,
        distanceMiles: impactData.distanceMiles.toString(),
        ...(alertId && { alertId })
      }
    };

    return this.sendToUser(userId, notification, 'impact_alert');
  }

  /**
   * Send team mention notification
   */
  async sendMentionNotification(
    userId: string,
    mentionerName: string,
    context: string,
    postId?: string
  ): Promise<NotificationResult[]> {
    const notification: PushNotification = {
      title: '🔔 You were mentioned',
      body: `${mentionerName} mentioned you: "${context.substring(0, 100)}${context.length > 100 ? '...' : ''}"`,
      data: {
        type: 'team_mention',
        mentionerName,
        ...(postId && { postId })
      }
    };

    return this.sendToUser(userId, notification, 'team_mention');
  }

  /**
   * Check if user should receive notification (preferences + quiet hours)
   */
  private async shouldSendNotification(
    userId: string,
    notificationType: string
  ): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM notification_preferences WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        // No preferences set, allow notification
        return true;
      }

      const prefs = result.rows[0];

      // Check if all notifications disabled
      if (!prefs.all_notifications_enabled) {
        return false;
      }

      // Check specific notification type
      switch (notificationType) {
        case 'storm_alert':
          if (!prefs.storm_alerts_enabled) return false;
          break;
        case 'impact_alert':
          if (!prefs.impact_alerts_enabled) return false;
          break;
        case 'team_mention':
          if (!prefs.team_mention_alerts) return false;
          break;
        case 'message':
          if (!prefs.team_message_alerts) return false;
          break;
        case 'checkin_alert':
          if (prefs.checkin_alerts_enabled === false) return false;
          break;
      }

      // Check quiet hours
      if (prefs.quiet_hours_enabled && prefs.quiet_hours_start && prefs.quiet_hours_end) {
        const now = new Date();
        const timezone = prefs.timezone || 'America/New_York';

        // Get current time in user's timezone
        const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const currentHour = userTime.getHours();
        const currentMinute = userTime.getMinutes();
        const currentTime = currentHour * 60 + currentMinute;

        const [startHour, startMinute] = prefs.quiet_hours_start.split(':').map(Number);
        const [endHour, endMinute] = prefs.quiet_hours_end.split(':').map(Number);
        const startTime = startHour * 60 + startMinute;
        const endTime = endHour * 60 + endMinute;

        // Handle overnight quiet hours (e.g., 22:00 to 07:00)
        if (startTime > endTime) {
          if (currentTime >= startTime || currentTime <= endTime) {
            return false;
          }
        } else {
          if (currentTime >= startTime && currentTime <= endTime) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking notification preferences:', error);
      return true; // Allow by default on error
    }
  }

  /**
   * Log notification to database
   */
  private async logNotification(
    userId: string,
    pushTokenId: string | null,
    deviceToken: string,
    notification: PushNotification,
    notificationType: string,
    status: 'pending' | 'sent' | 'failed',
    fcmMessageId?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO push_notification_log (
          user_id, push_token_id, device_token, notification_type,
          title, body, data, status, sent_at, fcm_message_id, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId,
          pushTokenId,
          deviceToken,
          notificationType,
          notification.title,
          notification.body,
          notification.data ? JSON.stringify(notification.data) : null,
          status,
          status === 'sent' ? new Date() : null,
          fcmMessageId || null,
          errorMessage || null
        ]
      );
    } catch (error) {
      console.error('Error logging notification:', error);
    }
  }

  /**
   * Build storm alert body text
   */
  private buildStormAlertBody(stormData: {
    city: string;
    state: string;
    eventType: string;
    hailSize?: number;
    windSpeed?: number;
  }): string {
    let body = `${stormData.eventType.charAt(0).toUpperCase() + stormData.eventType.slice(1)} detected in ${stormData.city}, ${stormData.state}`;

    if (stormData.eventType === 'hail' && stormData.hailSize) {
      body += ` (${stormData.hailSize}" hail)`;
    } else if (stormData.windSpeed) {
      body += ` (${stormData.windSpeed} mph winds)`;
    }

    return body;
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(daysBack: number = 30): Promise<{
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    byType: Record<string, number>;
  }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        notification_type,
        COUNT(*) as type_count
      FROM push_notification_log
      WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY notification_type`,
      [daysBack]
    );

    const byType: Record<string, number> = {};
    let totalSent = 0;
    let totalDelivered = 0;
    let totalFailed = 0;

    for (const row of result.rows) {
      byType[row.notification_type] = parseInt(row.type_count);
      totalSent += parseInt(row.sent);
      totalDelivered += parseInt(row.delivered);
      totalFailed += parseInt(row.failed);
    }

    return { totalSent, totalDelivered, totalFailed, byType };
  }

  /**
   * Convert database row to PushToken object
   */
  private rowToToken(row: any): PushToken {
    return {
      id: row.id,
      userId: row.user_id,
      deviceToken: row.device_token,
      deviceType: row.device_type,
      deviceName: row.device_name || undefined,
      isActive: row.is_active,
      notificationsEnabled: row.notifications_enabled,
      createdAt: row.created_at
    };
  }
}

/**
 * Create a push notification service instance
 */
export const createPushNotificationService = (pool: Pool): PushNotificationService => {
  return new PushNotificationService(pool);
};
