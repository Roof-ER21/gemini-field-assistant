# Twilio SMS Alert System - Implementation Summary

## Overview

Comprehensive SMS notification system for storm alerts using Twilio. Automatically sends SMS notifications to users when their monitored properties are impacted by storms.

## What Was Created

### 1. Enhanced Twilio Service (`/server/services/twilioService.ts`)

**New Features:**
- ✅ Database pool integration for rate limiting and logging
- ✅ Batch alert sending with sequential processing
- ✅ Rate limiting: max 1 SMS per phone/property per hour
- ✅ Eastern timezone for all date formatting
- ✅ Comprehensive SMS logging to database
- ✅ User statistics tracking
- ✅ Phone number validation and E.164 formatting

**Key Methods:**
```typescript
// Send single SMS with logging
sendSMS(to: string, message: string, userId?: string, impactAlertId?: string)

// Send formatted storm alert with rate limiting
sendStormAlert(params: StormAlertParams)

// Send batch alerts to multiple users
sendBatchAlerts(alerts: StormAlert[])

// Get user SMS statistics
getUserStats(userId: string, daysBack: number)

// Check service status
getStatus()
```

**Message Format:**
```
🌩️ STORM ALERT - SA21
Hail detected near 123 Main St, Boston, MA
Size: 1.5" | Date: Jan 15, 2025
View details in app
```

### 2. Alert Routes (`/server/routes/alertRoutes.ts`)

**Endpoints:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/alerts/sms-status` | Any | Check Twilio configuration status |
| `POST` | `/api/alerts/test-sms` | Admin | Send test SMS to verify setup |
| `POST` | `/api/alerts/storm-notification` | User | Send single storm alert |
| `POST` | `/api/alerts/batch-storm-notifications` | Admin | Send multiple alerts in batch |
| `GET` | `/api/alerts/sms-stats` | User | Get SMS statistics for current user |
| `GET` | `/api/alerts/recent-notifications` | Admin | View recent SMS notifications |

### 3. Database Integration (Migration 047)

**Already Exists:** `/database/migrations/047_sms_alerts.sql`

**Schema Updates:**

**Users Table:**
- `phone_number VARCHAR(20)` - User phone number (E.164 format)
- `sms_alerts_enabled BOOLEAN DEFAULT false` - SMS opt-in flag

**Impact Alerts Table:**
- `sms_sent BOOLEAN DEFAULT FALSE` - Whether SMS was sent
- `sms_sent_at TIMESTAMPTZ` - When SMS was sent
- `sms_message_sid VARCHAR(100)` - Twilio message SID

**New Table: `sms_notifications`**
```sql
CREATE TABLE sms_notifications (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    impact_alert_id UUID REFERENCES impact_alerts(id),
    phone_number VARCHAR(20) NOT NULL,
    message_body TEXT NOT NULL,
    message_sid VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Database Functions:**
- `log_sms_notification()` - Log SMS to notifications table
- `update_sms_status()` - Update SMS delivery status
- `get_user_sms_stats()` - Get user SMS statistics

**View:**
- `recent_sms_notifications` - Last 7 days of SMS with user/alert details

### 4. Automatic Integration (`/server/services/impactedAssetService.ts`)

**Enhanced:** `createImpactAlerts()` method now automatically:
1. Checks if user has SMS enabled (`sms_alerts_enabled = true`)
2. Validates user has phone number configured
3. Applies rate limiting (1 SMS/hour per property)
4. Sends SMS via Twilio
5. Updates impact alert with SMS status
6. Logs notification to database

**New Method:**
```typescript
private async sendSMSNotification(
  alertId: string,
  userId: string,
  propertyId: string,
  details: { propertyAddress, eventType, hailSize, windSpeed, stormDate }
)
```

### 5. Server Configuration (`/server/index.ts`)

**Changes:**
- ✅ Imported `alertRoutes`
- ✅ Initialized `twilioService.setPool(pool)` after database connection
- ✅ Registered routes: `app.use('/api/alerts', alertRoutes)`

### 6. Environment Configuration (`.env`)

**Added:**
```bash
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

### 7. Testing & Documentation

**Test Suite:** `/server/services/test-twilio-service.ts`
- Service status checking
- Phone number validation
- Storm alert formatting
- Rate limiting verification
- Batch alert processing
- User statistics
- Eastern timezone formatting

**Documentation:** `/docs/TWILIO_SMS_ALERTS.md`
- Complete API reference
- Configuration guide
- Usage examples
- Troubleshooting guide
- Cost optimization strategies

## Configuration Steps

### 1. Set Up Twilio Account

```bash
# Sign up at https://www.twilio.com
# Get a phone number (trial or paid)
# Copy credentials to .env:

TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

### 2. Run Database Migration

```bash
# Migration 047 should already exist
# If not run, execute:
psql $DATABASE_URL -f database/migrations/047_sms_alerts.sql
```

### 3. Enable SMS for Users

```sql
-- Update user profile to enable SMS
UPDATE users
SET
  phone_number = '+15551234567',
  sms_alerts_enabled = true
WHERE email = 'user@example.com';
```

### 4. Test the System

```bash
# Set test phone number
export TEST_PHONE_NUMBER="+15551234567"

# Run test suite
npx tsx server/services/test-twilio-service.ts

# Or test via API
curl -X POST http://localhost:3001/api/alerts/test-sms \
  -H "Content-Type: application/json" \
  -H "X-User-Email: admin@roofer.com" \
  -d '{"phoneNumber": "+15551234567"}'
```

## Usage Examples

### Automatic Storm Alerts

When impact alerts are created, SMS is sent automatically:

```typescript
import { createImpactedAssetService } from './services/impactedAssetService';

const service = createImpactedAssetService(pool);

// Create impact alerts for storm
const alerts = await service.createImpactAlerts({
  stormLatitude: 42.3601,
  stormLongitude: -71.0589,
  stormEventId: 'storm-123',
  eventType: 'hail',
  stormDate: '2025-01-15',
  hailSize: 1.5
});

// SMS automatically sent to users with:
// - sms_alerts_enabled = true
// - Valid phone_number
// - Not rate limited
```

### Manual Storm Alert

```bash
curl -X POST http://localhost:3001/api/alerts/storm-notification \
  -H "Content-Type: application/json" \
  -H "X-User-Email: user@example.com" \
  -d '{
    "phoneNumber": "+15551234567",
    "propertyAddress": "123 Main St, Boston, MA",
    "propertyId": "property-uuid",
    "eventType": "hail",
    "hailSize": 1.5,
    "date": "Jan 15, 2025"
  }'
```

### Batch Alerts (Admin)

```bash
curl -X POST http://localhost:3001/api/alerts/batch-storm-notifications \
  -H "Content-Type: application/json" \
  -H "X-User-Email: admin@roofer.com" \
  -d '{
    "alerts": [
      {
        "userId": "user-1",
        "phoneNumber": "+15551234567",
        "propertyAddress": "123 Main St, Boston, MA",
        "propertyId": "prop-1",
        "eventType": "hail",
        "hailSize": 1.5
      },
      {
        "userId": "user-2",
        "phoneNumber": "+15559876543",
        "propertyAddress": "456 Oak Ave, Cambridge, MA",
        "propertyId": "prop-2",
        "eventType": "wind",
        "windSpeed": 65
      }
    ]
  }'
```

## Rate Limiting

**Strategy:** Max 1 SMS per phone number per hour for same property

**Implementation:**
- Queries `sms_notifications` table for recent SMS to phone/property
- Checks if any sent within last hour
- Returns error if rate limited
- Allows different properties to trigger immediately

**Example:**
```typescript
// Property A - First alert: ✅ Sent
await twilioService.sendStormAlert({
  phoneNumber: '+15551234567',
  propertyId: 'property-A',
  ...
});

// Property A - Second alert (< 1 hour): ❌ Rate limited
await twilioService.sendStormAlert({
  phoneNumber: '+15551234567',
  propertyId: 'property-A',
  ...
});

// Property B - Different property: ✅ Sent
await twilioService.sendStormAlert({
  phoneNumber: '+15551234567',
  propertyId: 'property-B',
  ...
});
```

## Eastern Timezone

All timestamps use Eastern timezone:

```typescript
// Format: "Jan 15, 2025"
const options: Intl.DateTimeFormatOptions = {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric'
};
const easternDate = new Date().toLocaleDateString('en-US', options);
```

## Monitoring

### Check Service Status

```bash
curl http://localhost:3001/api/alerts/sms-status
```

### View User Statistics

```bash
curl http://localhost:3001/api/alerts/sms-stats?daysBack=30 \
  -H "X-User-Email: user@example.com"
```

### Database Queries

```sql
-- Recent SMS notifications
SELECT * FROM recent_sms_notifications LIMIT 10;

-- User SMS stats
SELECT * FROM get_user_sms_stats('user-uuid', 30);

-- Failed SMS in last 24 hours
SELECT *
FROM sms_notifications
WHERE status IN ('failed', 'undelivered')
AND created_at > NOW() - INTERVAL '24 hours';

-- Delivery rate
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM sms_notifications
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY status;
```

## Cost Estimation

**Twilio Pricing (US):**
- Outbound SMS: $0.0079 per message
- Phone Number: ~$1.15/month

**Example Monthly Cost:**
- 1000 properties monitored
- 10 storm events/month
- 50 properties impacted/storm
- 500 SMS/month
- **Total: $3.95/month + $1.15 phone = $5.10/month**

## Security Features

- ✅ Admin-only endpoints for batch operations and testing
- ✅ User email validation required for all requests
- ✅ Phone number validation and sanitization
- ✅ Rate limiting prevents SMS bombing
- ✅ Complete audit trail in database
- ✅ Twilio credentials in environment variables only

## Files Modified

1. `/server/services/twilioService.ts` - Enhanced with batch, rate limiting, logging
2. `/server/routes/alertRoutes.ts` - **NEW** - Alert API endpoints
3. `/server/services/impactedAssetService.ts` - Auto SMS on alert creation
4. `/server/index.ts` - Route registration and service initialization
5. `/.env` - Added Twilio configuration placeholders
6. `/server/services/test-twilio-service.ts` - **NEW** - Test suite
7. `/docs/TWILIO_SMS_ALERTS.md` - **NEW** - Complete documentation

## Files Using Database Migration

- `/database/migrations/047_sms_alerts.sql` - Already exists

## Testing Checklist

- [ ] Set Twilio credentials in `.env`
- [ ] Run migration 047 if not already run
- [ ] Configure test phone number: `export TEST_PHONE_NUMBER="+15551234567"`
- [ ] Run test suite: `npx tsx server/services/test-twilio-service.ts`
- [ ] Test SMS status endpoint: `GET /api/alerts/sms-status`
- [ ] Test sending test SMS: `POST /api/alerts/test-sms` (admin)
- [ ] Test storm notification: `POST /api/alerts/storm-notification`
- [ ] Verify rate limiting works
- [ ] Check database logs in `sms_notifications`
- [ ] Verify Eastern timezone in messages

## Next Steps

1. **Configure Twilio Account**
   - Sign up at twilio.com
   - Get phone number
   - Add credentials to `.env`

2. **Enable SMS for Users**
   - Add phone numbers to user profiles
   - Enable SMS alerts flag
   - Test with real users

3. **Monitor Performance**
   - Check Twilio console for delivery rates
   - Monitor database for failed SMS
   - Track user engagement

4. **Optional Enhancements**
   - Set up Twilio webhooks for delivery status
   - Add SMS templates with variables
   - Implement two-way SMS (user replies)
   - Add MMS support for damage photos
   - Create SMS analytics dashboard

## Support

- **Twilio Docs**: https://www.twilio.com/docs/sms
- **Migration 047**: `/database/migrations/047_sms_alerts.sql`
- **Full Docs**: `/docs/TWILIO_SMS_ALERTS.md`
- **Test Suite**: `/server/services/test-twilio-service.ts`

---

**Implementation Complete** ✅
**All timestamps in Eastern timezone** ✅
**Rate limiting implemented** ✅
**Database migration exists** ✅
**Auto-integration with impact alerts** ✅

---

**Date**: February 3, 2026
**Developer**: Senior Backend Developer (Claude Agent)
**Project**: Gemini Field Assistant - SMS Storm Alert System
