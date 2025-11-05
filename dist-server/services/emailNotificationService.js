/**
 * Client-side Email Notification Service
 * Handles sending email notifications to the backend API
 */
// Use relative URL for production, localhost for development
const API_BASE_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : `${window.location.origin}/api`);
class EmailNotificationService {
    static instance;
    enabled = true;
    constructor() {
        // Check if email notifications are enabled (can be controlled via env var)
        this.enabled = import.meta.env.VITE_EMAIL_NOTIFICATIONS_ENABLED !== 'false';
    }
    static getInstance() {
        if (!EmailNotificationService.instance) {
            EmailNotificationService.instance = new EmailNotificationService();
        }
        return EmailNotificationService.instance;
    }
    /**
     * Send notification via API
     */
    async sendNotification(type, data) {
        if (!this.enabled) {
            console.log('📧 Email notifications disabled');
            return { success: true, message: 'Notifications disabled' };
        }
        try {
            const response = await fetch(`${API_BASE_URL}/notifications/email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type,
                    data
                })
            });
            const result = await response.json();
            if (response.ok) {
                console.log(`✅ Email notification sent (${type}):`, result.provider);
                return result;
            }
            else {
                console.warn(`⚠️  Email notification failed (${type}):`, result.error);
                return result;
            }
        }
        catch (error) {
            console.error('❌ Error sending email notification:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    /**
     * Send login notification to admin
     */
    async notifyLogin(payload) {
        const data = {
            userName: payload.userName,
            userEmail: payload.userEmail,
            timestamp: payload.timestamp || new Date().toISOString(),
            ipAddress: payload.ipAddress,
            userAgent: payload.userAgent || navigator.userAgent
        };
        return this.sendNotification('login', data);
    }
    /**
     * Send chat interaction notification to admin
     */
    async notifyChat(payload) {
        const data = {
            userName: payload.userName,
            userEmail: payload.userEmail,
            message: payload.message,
            timestamp: payload.timestamp || new Date().toISOString(),
            sessionId: payload.sessionId,
            state: payload.state
        };
        return this.sendNotification('chat', data);
    }
    /**
     * Get email service configuration from backend
     */
    async getConfig() {
        try {
            const response = await fetch(`${API_BASE_URL}/notifications/config`);
            if (response.ok) {
                return await response.json();
            }
            return null;
        }
        catch (error) {
            console.error('Error fetching email config:', error);
            return null;
        }
    }
    /**
     * Enable/disable email notifications
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`📧 Email notifications ${enabled ? 'enabled' : 'disabled'}`);
    }
    /**
     * Check if email notifications are enabled
     */
    isEnabled() {
        return this.enabled;
    }
}
// Export singleton instance
export const emailNotificationService = EmailNotificationService.getInstance();
