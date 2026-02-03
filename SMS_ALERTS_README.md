# SMS Alerts for Impacted Assets

## Overview

The SMS Alerts feature enables real-time text message notifications when storms impact monitored customer properties. This provides instant awareness for sales reps to reach out proactively to past customers who may need roofing services.

## Features

- **Instant SMS Notifications**: Receive text messages when storms hit monitored properties
- **User-Configurable**: Each user can set their own phone number and enable/disable alerts
- **Smart Formatting**: Messages include property address, storm type, severity, and date
- **Test Functionality**: Send test SMS to verify configuration
- **Complete Tracking**: All SMS notifications are logged with delivery status
- **Integration**: Works alongside push notifications and email alerts

## Setup Instructions

### 1. Get Twilio Credentials

1. Sign up for a Twilio account at https://www.twilio.com/try-twilio
2. Get a phone number from the Twilio Console
3. Find your Account SID and Auth Token in the Console Dashboard

### 2. Configure Environment Variables

Add these to your `.env` file or Railway environment variables:

```env
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

**Important**: The phone number must be in E.164 format (e.g., +15551234567)

### 3. Run Database Migration

**Locally:**
```bash
npm run db:migrate:sms
```

**On Railway:**
```bash
npm run db:migrate:sms:railway
```

This creates:
- `phone_number` and `sms_alerts_enabled` columns in `users` table
- `sms_sent`, `sms_sent_at`, `sms_message_sid` columns in `impact_alerts` table
- `sms_notifications` table for tracking all SMS messages
- Helper functions for logging and status updates

### 4. Verify Installation

Check that Twilio is configured:

```bash
curl https://your-app.railway.app/api/sms/status
```

Should return:
```json
{
  "configured": true,
  "fromNumber": "+15551234567",
  "hasCredentials": true
}
```

## User Guide

### Setting Up SMS Alerts

1. Open the **Impacted Assets** panel in the app
2. Click the **Settings** tab
3. Enter your phone number (include country code, e.g., +1 555-123-4567)
4. Click **Save**
5. Toggle **SMS Alerts** to **Enabled**
6. Click **Send Test SMS** to verify it works

### How SMS Alerts Work

1. **Add Properties**: Add customer properties to monitor in the "Properties" tab
2. **Configure Notifications**: Set alert preferences for each property (hail, wind, tornado)
3. **Automatic Detection**: When storms are detected near monitored properties, alerts are created
4. **Instant SMS**: If SMS alerts are enabled, you receive a text message immediately
5. **Follow Up**: Use the "Alerts" tab to track which properties need follow-up

### SMS Message Format

```
🏠 Storm Alert - 123 Main St, Dallas, TX
1.5" hail detected on 02/02/2026
Check SA21 for details.
```

## API Endpoints

### User Phone Number Management

#### Save Phone Number
```http
POST /api/users/phone
Content-Type: application/json
x-user-email: user@example.com

{
  "phoneNumber": "+15551234567"
}
```

#### Enable/Disable SMS Alerts
```http
PUT /api/users/sms-alerts
Content-Type: application/json
x-user-email: user@example.com

{
  "enabled": true
}
```

#### Send Test SMS
```http
POST /api/users/test-sms
x-user-email: user@example.com
```

#### Check SMS Service Status
```http
GET /api/sms/status
```

## Backend Architecture

### TwilioService (`server/services/twilioService.ts`)

Main service class that handles all SMS operations:

```typescript
class TwilioService {
  isConfigured(): boolean
  sendSMS(to: string, message: string): Promise<SMSResponse>
  sendStormAlert(params: StormAlertParams): Promise<SMSResponse>
  sendTestSMS(to: string): Promise<SMSResponse>
  validatePhoneNumber(phone: string): boolean
}
```

**Key Features:**
- Automatic phone number formatting to E.164
- Graceful degradation if Twilio isn't configured
- Error handling and logging
- Message templating for storm alerts

### Database Schema

#### Users Table (Extended)
```sql
ALTER TABLE users
ADD COLUMN phone_number VARCHAR(20),
ADD COLUMN sms_alerts_enabled BOOLEAN DEFAULT false;
```

#### Impact Alerts Table (Extended)
```sql
ALTER TABLE impact_alerts
ADD COLUMN sms_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN sms_sent_at TIMESTAMPTZ,
ADD COLUMN sms_message_sid VARCHAR(100);
```

#### SMS Notifications Table (New)
```sql
CREATE TABLE sms_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    impact_alert_id UUID REFERENCES impact_alerts(id),
    phone_number VARCHAR(20) NOT NULL,
    message_body TEXT NOT NULL,
    message_sid VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Alert Flow

1. **Storm Detection**: Storm monitoring service detects new storm event
2. **Impact Check**: Check which customer properties are within alert radius
3. **Create Alerts**: Generate impact alerts for affected properties
4. **Send Notifications**: For each alert:
   - Check if user has SMS enabled
   - Verify phone number exists
   - Send SMS via Twilio
   - Log notification in database
   - Mark alert as SMS sent

## Frontend Components

### ImpactedAssetsPanel Settings Tab

Located in `components/ImpactedAssetsPanel.tsx`

**Features:**
- Phone number input with validation
- SMS alerts toggle switch
- Test SMS button
- Twilio configuration status indicator
- Usage instructions

**State Management:**
```typescript
const [phoneNumber, setPhoneNumber] = useState('');
const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(false);
const [smsStatus, setSmsStatus] = useState<{ configured: boolean } | null>(null);
```

## Troubleshooting

### SMS Not Sending

1. **Check Twilio Configuration:**
   ```bash
   curl https://your-app.railway.app/api/sms/status
   ```

2. **Verify Environment Variables:**
   - Check Railway dashboard for TWILIO_* variables
   - Ensure values don't have extra spaces or quotes

3. **Check Twilio Console:**
   - Log into https://console.twilio.com/
   - Check "Monitor > Logs > Messaging" for errors
   - Verify phone number is active

4. **Test Phone Number Format:**
   - Must include country code (+1 for US)
   - Remove any special characters except +
   - Example: +15551234567 (correct), (555) 123-4567 (incorrect)

### Common Errors

**"Twilio service not configured"**
- Environment variables not set or invalid
- Restart server after adding credentials

**"Invalid phone number format"**
- Phone must be 10 digits (US) or E.164 format
- Include country code with +

**"SMS service not available"**
- Admin hasn't configured Twilio credentials
- Contact system administrator

## Cost Estimates

Twilio SMS pricing (as of 2025):
- US/Canada: $0.0079 per message
- International: Varies by country

**Example costs:**
- 100 alerts/month: ~$0.79
- 1,000 alerts/month: ~$7.90
- 10,000 alerts/month: ~$79

Twilio offers a free trial with $15 credit to get started.

## Security Considerations

1. **Phone Number Storage**: Phone numbers are stored securely in PostgreSQL
2. **Environment Variables**: Twilio credentials stored as environment variables (not in code)
3. **User Consent**: Users must explicitly enable SMS alerts
4. **Opt-Out**: Users can disable SMS alerts anytime
5. **Rate Limiting**: Consider adding rate limits to prevent SMS spam

## Future Enhancements

Potential improvements:
- [ ] SMS delivery status webhooks from Twilio
- [ ] User-customizable message templates
- [ ] SMS reply handling (two-way messaging)
- [ ] Bulk SMS for territory-wide alerts
- [ ] SMS scheduling (don't send during night hours)
- [ ] Analytics dashboard for SMS metrics
- [ ] Integration with other SMS providers (SNS, MessageBird)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Twilio logs in the Console
3. Check application logs for error messages
4. Verify database migration completed successfully

## Testing Checklist

Before going live:

- [ ] Twilio credentials configured
- [ ] Database migration completed
- [ ] Test SMS sends successfully
- [ ] Phone number saves correctly
- [ ] Toggle enable/disable works
- [ ] SMS sent when storm alert created
- [ ] SMS notification logged in database
- [ ] Settings UI displays status correctly
- [ ] Error messages display properly
- [ ] Production phone number added to Twilio

## License

Part of the Gemini Field Assistant application.
