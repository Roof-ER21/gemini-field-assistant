/**
 * Activity Logging Service
 * Logs user activities to backend for tracking and analytics
 */

import { authService } from './authService';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface ActivityData {
  activity_type: string;
  activity_data?: any;
  timestamp?: string;
}

interface ActivityResponse {
  success: boolean;
  message?: string;
  error?: string;
}

class ActivityService {
  private static instance: ActivityService;
  private enabled: boolean = true;

  private constructor() {
    // Check if activity logging is enabled (can be controlled via env var)
    this.enabled = import.meta.env.VITE_ACTIVITY_LOGGING_ENABLED !== 'false';
  }

  static getInstance(): ActivityService {
    if (!ActivityService.instance) {
      ActivityService.instance = new ActivityService();
    }
    return ActivityService.instance;
  }

  /**
   * Log activity to backend
   */
  async logActivity(type: string, data?: any): Promise<ActivityResponse> {
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
      const payload: ActivityData = {
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
      } else {
        console.warn(`[Activity] Failed to log ${type}:`, result.error);
        return result;
      }
    } catch (error) {
      console.error('[Activity] Error logging activity:', error);
      // Don't throw - activity logging should not break app
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Log user login
   */
  async logLogin(): Promise<ActivityResponse> {
    return this.logActivity('login');
  }

  /**
   * Log chat message sent
   */
  async logChatMessage(messageLength: number): Promise<ActivityResponse> {
    return this.logActivity('chat', { message_length: messageLength });
  }

  /**
   * Log document analysis
   */
  async logDocumentAnalysis(documentType: string, documentCount: number = 1): Promise<ActivityResponse> {
    return this.logActivity('document_analysis', {
      document_type: documentType,
      document_count: documentCount
    });
  }

  /**
   * Log email generated
   */
  async logEmailGenerated(recipient: string, template?: string): Promise<ActivityResponse> {
    return this.logActivity('email_generated', {
      recipient,
      template
    });
  }

  /**
   * Log transcription created
   */
  async logTranscription(duration: number, meetingType?: string): Promise<ActivityResponse> {
    return this.logActivity('transcription', {
      duration_seconds: duration,
      meeting_type: meetingType
    });
  }

  /**
   * Enable/disable activity logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[Activity] Logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if activity logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Export singleton instance
export const activityService = ActivityService.getInstance();

// Export types
export type {
  ActivityData,
  ActivityResponse
};
