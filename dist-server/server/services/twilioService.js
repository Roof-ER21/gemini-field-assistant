/**
 * Twilio Service
 *
 * Handles SMS notifications for impacted assets and other alerts.
 * All timestamps use Eastern timezone.
 * Includes rate limiting: max 1 SMS per phone number per hour for same property.
 *
 * Environment Variables Required:
 * - TWILIO_ACCOUNT_SID: Your Twilio Account SID
 * - TWILIO_AUTH_TOKEN: Your Twilio Auth Token
 * - TWILIO_PHONE_NUMBER: Your Twilio phone number (the "from" number)
 */
import twilio from 'twilio';
export class TwilioService {
    client = null;
    fromNumber = null;
    pool = null;
    constructor(pool) {
        if (pool) {
            this.pool = pool;
        }
        this.initialize();
    }
    /**
     * Set database pool for rate limiting and logging
     */
    setPool(pool) {
        this.pool = pool;
    }
    /**
     * Initialize Twilio client if credentials exist
     */
    initialize() {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER || null;
        if (accountSid && authToken && this.fromNumber) {
            try {
                this.client = twilio(accountSid, authToken);
                console.log('[Twilio] Service initialized successfully');
            }
            catch (error) {
                console.error('[Twilio] Failed to initialize:', error);
                this.client = null;
            }
        }
        else {
            console.warn('[Twilio] Service not configured - missing credentials');
        }
    }
    /**
     * Check if Twilio is configured and ready to use
     */
    isConfigured() {
        return this.client !== null && this.fromNumber !== null;
    }
    /**
     * Send a basic SMS message
     */
    async sendSMS(to, message, userId, impactAlertId) {
        if (!this.isConfigured()) {
            console.error('[Twilio] Cannot send SMS - service not configured');
            return {
                success: false,
                error: 'Twilio service not configured'
            };
        }
        // Validate phone number format
        const cleanPhone = this.cleanPhoneNumber(to);
        if (!cleanPhone) {
            return {
                success: false,
                error: 'Invalid phone number format'
            };
        }
        try {
            const result = await this.client.messages.create({
                body: message,
                from: this.fromNumber,
                to: cleanPhone
            });
            console.log(`[Twilio] SMS sent successfully to ${cleanPhone} - SID: ${result.sid}`);
            // Log to database if pool is available
            if (this.pool && userId) {
                await this.logSMSNotification(userId, cleanPhone, message, result.sid, impactAlertId);
            }
            return {
                success: true,
                messageSid: result.sid
            };
        }
        catch (error) {
            console.error('[Twilio] Failed to send SMS:', error);
            // Log failure to database if pool is available
            if (this.pool && userId) {
                await this.logSMSNotification(userId, cleanPhone, message, null, impactAlertId, error.message);
            }
            return {
                success: false,
                error: error.message || 'Failed to send SMS'
            };
        }
    }
    /**
     * Send a storm alert SMS with rate limiting
     * Max 1 SMS per phone number per hour for same property
     */
    async sendStormAlert(params) {
        // Check rate limit if pool is available and propertyId is provided
        if (this.pool && params.propertyId && params.phoneNumber) {
            const isRateLimited = await this.checkRateLimit(params.phoneNumber, params.propertyId);
            if (isRateLimited) {
                console.log(`[Twilio] Rate limited: ${params.phoneNumber} for property ${params.propertyId}`);
                return {
                    success: false,
                    error: 'Rate limit: Already sent SMS for this property in the last hour'
                };
            }
        }
        const message = this.formatStormAlertMessage(params);
        return this.sendSMS(params.phoneNumber, message, params.userId, params.impactAlertId);
    }
    /**
     * Send a test SMS to verify configuration
     */
    async sendTestSMS(to) {
        const message = '🏠 SA21 Field Assistant - SMS alerts are configured and working! You will receive storm alerts for your monitored properties.';
        return this.sendSMS(to, message);
    }
    /**
     * Send batch storm alerts to multiple users
     * Respects rate limiting and processes alerts in sequence
     */
    async sendBatchAlerts(alerts) {
        const result = {
            total: alerts.length,
            sent: 0,
            failed: 0,
            skipped: 0,
            results: []
        };
        for (const alert of alerts) {
            const response = await this.sendStormAlert({
                phoneNumber: alert.phoneNumber,
                propertyAddress: alert.propertyAddress,
                propertyId: alert.propertyId,
                eventType: alert.eventType,
                hailSize: alert.hailSize,
                windSpeed: alert.windSpeed,
                userId: alert.userId,
                impactAlertId: alert.impactAlertId
            });
            result.results.push({
                phoneNumber: alert.phoneNumber,
                propertyAddress: alert.propertyAddress,
                success: response.success,
                messageSid: response.messageSid,
                error: response.error
            });
            if (response.success) {
                result.sent++;
            }
            else if (response.error?.includes('Rate limit')) {
                result.skipped++;
            }
            else {
                result.failed++;
            }
            // Small delay to avoid Twilio rate limits (max 1 msg/sec for trial accounts)
            await new Promise(resolve => setTimeout(resolve, 1100));
        }
        console.log(`[Twilio] Batch complete: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`);
        return result;
    }
    /**
     * Format storm alert message for SMS
     * Format: 🌩️ STORM ALERT - SA21
     */
    formatStormAlertMessage(params) {
        // Get current date in Eastern timezone if not provided
        const date = params.date || this.getEasternDate();
        let message = `🌩️ STORM ALERT - SA21\n`;
        message += `Hail detected near ${params.propertyAddress}\n`;
        // Add event details
        if (params.eventType === 'hail' && params.hailSize) {
            message += `Size: ${params.hailSize}" | Date: ${date}\n`;
        }
        else if (params.eventType === 'wind' && params.windSpeed) {
            message += `Wind: ${params.windSpeed} mph | Date: ${date}\n`;
        }
        else if (params.eventType === 'tornado') {
            message += `Tornado activity | Date: ${date}\n`;
        }
        else {
            message += `Event: ${params.eventType} | Date: ${date}\n`;
        }
        message += 'View details in app';
        return message;
    }
    /**
     * Clean and validate phone number
     * Ensures E.164 format (+1XXXXXXXXXX for US numbers)
     */
    cleanPhoneNumber(phone) {
        // Remove all non-digit characters
        const digits = phone.replace(/\D/g, '');
        // Check if it's a valid US number (10 digits)
        if (digits.length === 10) {
            return `+1${digits}`;
        }
        // Check if it already has country code
        if (digits.length === 11 && digits.startsWith('1')) {
            return `+${digits}`;
        }
        // Check if it's already in E.164 format
        if (phone.startsWith('+') && digits.length === 11) {
            return phone;
        }
        // Invalid format
        console.warn(`[Twilio] Invalid phone number format: ${phone}`);
        return null;
    }
    /**
     * Validate phone number format without sending
     */
    validatePhoneNumber(phone) {
        return this.cleanPhoneNumber(phone) !== null;
    }
    /**
     * Get service status information
     */
    getStatus() {
        return {
            configured: this.isConfigured(),
            fromNumber: this.fromNumber,
            hasCredentials: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
            hasDatabase: this.pool !== null
        };
    }
    /**
     * Check rate limit for phone/property combination
     * Returns true if rate limited (SMS sent in last hour)
     */
    async checkRateLimit(phoneNumber, propertyId) {
        if (!this.pool) {
            return false; // No rate limiting without database
        }
        try {
            const result = await this.pool.query(`SELECT id FROM sms_notifications
         WHERE phone_number = $1
         AND message_body LIKE $2
         AND sent_at > NOW() - INTERVAL '1 hour'
         AND status = 'sent'
         LIMIT 1`, [phoneNumber, `%${propertyId}%`]);
            return result.rows.length > 0;
        }
        catch (error) {
            console.error('[Twilio] Rate limit check error:', error);
            return false; // Allow sending on error
        }
    }
    /**
     * Log SMS notification to database
     */
    async logSMSNotification(userId, phoneNumber, messageBody, messageSid, impactAlertId, errorMessage) {
        if (!this.pool) {
            return;
        }
        try {
            await this.pool.query(`INSERT INTO sms_notifications (
          user_id,
          impact_alert_id,
          phone_number,
          message_body,
          message_sid,
          status,
          error_message,
          sent_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`, [
                userId,
                impactAlertId || null,
                phoneNumber,
                messageBody,
                messageSid,
                messageSid ? 'sent' : 'failed',
                errorMessage || null,
                messageSid ? new Date().toISOString() : null
            ]);
        }
        catch (error) {
            console.error('[Twilio] Failed to log SMS notification:', error);
        }
    }
    /**
     * Get current date formatted in Eastern timezone
     * Format: Jan 15, 2025
     */
    getEasternDate() {
        const options = {
            timeZone: 'America/New_York',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        };
        return new Date().toLocaleDateString('en-US', options);
    }
    /**
     * Get SMS statistics for a user
     */
    async getUserStats(userId, daysBack = 30) {
        if (!this.pool) {
            return {
                totalSent: 0,
                totalDelivered: 0,
                totalFailed: 0,
                lastSentAt: null
            };
        }
        try {
            const result = await this.pool.query(`SELECT * FROM get_user_sms_stats($1, $2)`, [userId, daysBack]);
            const stats = result.rows[0];
            return {
                totalSent: stats.total_sent || 0,
                totalDelivered: stats.total_delivered || 0,
                totalFailed: stats.total_failed || 0,
                lastSentAt: stats.last_sent_at
            };
        }
        catch (error) {
            console.error('[Twilio] Failed to get user stats:', error);
            return {
                totalSent: 0,
                totalDelivered: 0,
                totalFailed: 0,
                lastSentAt: null
            };
        }
    }
}
/**
 * Singleton instance (pool will be set after server initializes)
 */
export const twilioService = new TwilioService();
/**
 * Export for testing and initialization
 */
export const createTwilioService = (pool) => {
    return new TwilioService(pool);
};
