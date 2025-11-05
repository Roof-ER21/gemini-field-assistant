/**
 * Activity Logging Service
 * Logs user activities to backend for tracking and analytics
 */
import { authService } from './authService';
// Use relative URL for production, localhost for development
const API_BASE_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : `${window.location.origin}/api`);
class ActivityService {
    static instance;
    enabled = true;
    constructor() {
        // Check if activity logging is enabled (can be controlled via env var)
        this.enabled = import.meta.env.VITE_ACTIVITY_LOGGING_ENABLED !== 'false';
    }
    static getInstance() {
        if (!ActivityService.instance) {
            ActivityService.instance = new ActivityService();
        }
        return ActivityService.instance;
    }
    /**
     * Log activity to backend
     */
    async logActivity(type, data) {
        if (!this.enabled) {
            console.log('[Activity] Logging disabled');
            return { success: true, message: 'Logging disabled' };
        }
        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            console.warn('[Activity] No authenticated user, skipping activity log');
            return { success: false, error: 'Not authenticated' };
        }
        try {
            const payload = {
                activity_type: type,
                activity_data: data,
                timestamp: new Date().toISOString()
            };
            const response = await fetch(`${API_BASE_URL}/activity/log`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Email': currentUser.email
                },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (response.ok) {
                console.log(`[Activity] Logged: ${type}`, data);
                return result;
            }
            else {
                console.warn(`[Activity] Failed to log ${type}:`, result.error);
                return result;
            }
        }
        catch (error) {
            console.error('[Activity] Error logging activity:', error);
            // Don't throw - activity logging should not break app
            return {
                success: false,
                error: error.message
            };
        }
    }
    /**
     * Log user login
     */
    async logLogin() {
        return this.logActivity('login');
    }
    /**
     * Log chat message sent
     */
    async logChatMessage(messageLength) {
        return this.logActivity('chat', { message_length: messageLength });
    }
    /**
     * Log document analysis
     */
    async logDocumentAnalysis(documentType, documentCount = 1) {
        return this.logActivity('document_analysis', {
            document_type: documentType,
            document_count: documentCount
        });
    }
    /**
     * Log email generated
     */
    async logEmailGenerated(recipient, template) {
        return this.logActivity('email_generated', {
            recipient,
            template
        });
    }
    /**
     * Log transcription created
     */
    async logTranscription(duration, meetingType) {
        return this.logActivity('transcription', {
            duration_seconds: duration,
            meeting_type: meetingType
        });
    }
    /**
     * Enable/disable activity logging
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`[Activity] Logging ${enabled ? 'enabled' : 'disabled'}`);
    }
    /**
     * Check if activity logging is enabled
     */
    isEnabled() {
        return this.enabled;
    }
}
// Export singleton instance
export const activityService = ActivityService.getInstance();
