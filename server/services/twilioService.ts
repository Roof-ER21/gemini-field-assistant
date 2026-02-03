/**
 * Twilio Service
 *
 * Handles SMS notifications for impacted assets and other alerts.
 *
 * Environment Variables Required:
 * - TWILIO_ACCOUNT_SID: Your Twilio Account SID
 * - TWILIO_AUTH_TOKEN: Your Twilio Auth Token
 * - TWILIO_PHONE_NUMBER: Your Twilio phone number (the "from" number)
 */

import twilio from 'twilio';

export interface SMSParams {
  to: string;
  message: string;
}

export interface StormAlertParams {
  phoneNumber: string;
  propertyAddress: string;
  eventType: string;
  hailSize?: number;
  windSpeed?: number;
  date: string;
}

export interface SMSResponse {
  success: boolean;
  messageSid?: string;
  error?: string;
}

export class TwilioService {
  private client: twilio.Twilio | null = null;
  private fromNumber: string | null = null;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Twilio client if credentials exist
   */
  private initialize(): void {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || null;

    if (accountSid && authToken && this.fromNumber) {
      try {
        this.client = twilio(accountSid, authToken);
        console.log('[Twilio] Service initialized successfully');
      } catch (error) {
        console.error('[Twilio] Failed to initialize:', error);
        this.client = null;
      }
    } else {
      console.warn('[Twilio] Service not configured - missing credentials');
    }
  }

  /**
   * Check if Twilio is configured and ready to use
   */
  isConfigured(): boolean {
    return this.client !== null && this.fromNumber !== null;
  }

  /**
   * Send a basic SMS message
   */
  async sendSMS(to: string, message: string): Promise<SMSResponse> {
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
      const result = await this.client!.messages.create({
        body: message,
        from: this.fromNumber!,
        to: cleanPhone
      });

      console.log(`[Twilio] SMS sent successfully to ${cleanPhone} - SID: ${result.sid}`);

      return {
        success: true,
        messageSid: result.sid
      };
    } catch (error: any) {
      console.error('[Twilio] Failed to send SMS:', error);
      return {
        success: false,
        error: error.message || 'Failed to send SMS'
      };
    }
  }

  /**
   * Send a storm alert SMS
   */
  async sendStormAlert(params: StormAlertParams): Promise<SMSResponse> {
    const message = this.formatStormAlertMessage(params);
    return this.sendSMS(params.phoneNumber, message);
  }

  /**
   * Send a test SMS to verify configuration
   */
  async sendTestSMS(to: string): Promise<SMSResponse> {
    const message = '🏠 SA21 Field Assistant - SMS alerts are configured and working! You will receive storm alerts for your monitored properties.';
    return this.sendSMS(to, message);
  }

  /**
   * Format storm alert message for SMS
   */
  private formatStormAlertMessage(params: StormAlertParams): string {
    let message = `🏠 Storm Alert - ${params.propertyAddress}\n`;

    // Add event type and details
    if (params.eventType === 'hail' && params.hailSize) {
      message += `${params.hailSize}" hail detected on ${params.date}\n`;
    } else if (params.eventType === 'wind' && params.windSpeed) {
      message += `${params.windSpeed} mph winds detected on ${params.date}\n`;
    } else if (params.eventType === 'tornado') {
      message += `Tornado activity detected on ${params.date}\n`;
    } else {
      message += `${params.eventType} event detected on ${params.date}\n`;
    }

    message += 'Check SA21 for details.';

    return message;
  }

  /**
   * Clean and validate phone number
   * Ensures E.164 format (+1XXXXXXXXXX for US numbers)
   */
  private cleanPhoneNumber(phone: string): string | null {
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
  validatePhoneNumber(phone: string): boolean {
    return this.cleanPhoneNumber(phone) !== null;
  }

  /**
   * Get service status information
   */
  getStatus(): {
    configured: boolean;
    fromNumber: string | null;
    hasCredentials: boolean;
  } {
    return {
      configured: this.isConfigured(),
      fromNumber: this.fromNumber,
      hasCredentials: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
    };
  }
}

/**
 * Singleton instance
 */
export const twilioService = new TwilioService();

/**
 * Export for testing
 */
export const createTwilioService = (): TwilioService => {
  return new TwilioService();
};
