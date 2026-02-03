# Twilio SMS Alert System

Complete SMS notification system for storm alerts using Twilio.

## Features

- **SMS Storm Alerts**: Automated SMS notifications when properties are impacted by storms
- **Rate Limiting**: Max 1 SMS per phone number per hour for same property
- **Batch Alerts**: Send multiple alerts efficiently with rate limiting
- **Eastern Timezone**: All timestamps in Eastern timezone
- **Database Logging**: Complete audit trail of all SMS notifications
- **User Preferences**: Users can enable/disable SMS and set phone number
- **Statistics**: Track SMS delivery rates and user engagement

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

### Get Twilio Credentials

1. Sign up at [Twilio](https://www.twilio.com)
2. Get a phone number (trial or paid)
3. Find your Account SID and Auth Token in the console
4. Add credentials to `.env` file

## Database Schema

### Users Table Updates

```sql
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN sms_alerts_enabled BOOLEAN DEFAULT false;
```

### SMS Notifications Table

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

### Impact Alerts Updates

```sql
ALTER TABLE impact_alerts ADD COLUMN sms_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE impact_alerts ADD COLUMN sms_sent_at TIMESTAMPTZ;
ALTER TABLE impact_alerts ADD COLUMN sms_message_sid VARCHAR(100);
```

## API Endpoints

### Check SMS Status

```bash
GET /api/alerts/sms-status
```

**Response:**
```json
{
  "configured": true,
  "fromNumber": "+15551234567",
  "hasCredentials": true,
  "hasDatabase": true,
  "message": "Twilio SMS service is configured and ready"
}
```

### Send Test SMS (Admin Only)

```bash
POST /api/alerts/test-sms
Content-Type: application/json
X-User-Email: admin@example.com

{
  "phoneNumber": "+15551234567"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Test SMS sent successfully",
  "messageSid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

### Send Storm Notification

```bash
POST /api/alerts/storm-notification
Content-Type: application/json
X-User-Email: user@example.com

{
  "phoneNumber": "+15551234567",
  "propertyAddress": "123 Main St, Boston, MA",
  "propertyId": "property-uuid",
  "eventType": "hail",
  "hailSize": 1.5,
  "windSpeed": null,
  "date": "Jan 15, 2025"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Storm alert sent successfully",
  "messageSid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Rate Limited Response (429):**
```json
{
  "success": false,
  "error": "Rate limit: Already sent SMS for this property in the last hour"
}
```

### Send Batch Notifications (Admin Only)

```bash
POST /api/alerts/batch-storm-notifications
Content-Type: application/json
X-User-Email: admin@example.com

{
  "alerts": [
    {
      "userId": "user-uuid-1",
      "phoneNumber": "+15551234567",
      "propertyAddress": "123 Main St, Boston, MA",
      "propertyId": "property-uuid-1",
      "eventType": "hail",
      "hailSize": 1.5
    },
    {
      "userId": "user-uuid-2",
      "phoneNumber": "+15559876543",
      "propertyAddress": "456 Oak Ave, Cambridge, MA",
      "propertyId": "property-uuid-2",
      "eventType": "wind",
      "windSpeed": 65
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "total": 2,
  "sent": 2,
  "failed": 0,
  "skipped": 0,
  "results": [
    {
      "phoneNumber": "+15551234567",
      "propertyAddress": "123 Main St, Boston, MA",
      "success": true,
      "messageSid": "SMxxx1"
    },
    {
      "phoneNumber": "+15559876543",
      "propertyAddress": "456 Oak Ave, Cambridge, MA",
      "success": true,
      "messageSid": "SMxxx2"
    }
  ]
}
```

### Get User SMS Statistics

```bash
GET /api/alerts/sms-stats?daysBack=30
X-User-Email: user@example.com
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalSent": 15,
    "totalDelivered": 14,
    "totalFailed": 1,
    "lastSentAt": "2025-01-15T14:30:00Z"
  },
  "daysBack": 30
}
```

### Get Recent Notifications (Admin Only)

```bash
GET /api/alerts/recent-notifications?limit=50
X-User-Email: admin@example.com
```

**Response:**
```json
{
  "success": true,
  "notifications": [
    {
      "id": "notification-uuid",
      "user_id": "user-uuid",
      "user_name": "John Doe",
      "user_email": "john@example.com",
      "phone_number": "+15551234567",
      "message_body": "🌩️ STORM ALERT - SA21...",
      "status": "delivered",
      "message_sid": "SMxxx",
      "sent_at": "2025-01-15T14:30:00Z",
      "delivered_at": "2025-01-15T14:30:05Z",
      "alert_type": "hail",
      "alert_severity": "high",
      "customer_name": "Jane Smith",
      "property_address": "123 Main St, Boston, MA"
    }
  ],
  "count": 1
}
```

## Message Format

SMS messages follow this format:

```
🌩️ STORM ALERT - SA21
Hail detected near 123 Main St, Boston, MA
Size: 1.5" | Date: Jan 15, 2025
View details in app
```

For different event types:
- **Hail**: `Size: 1.5" | Date: Jan 15, 2025`
- **Wind**: `Wind: 65 mph | Date: Jan 15, 2025`
- **Tornado**: `Tornado activity | Date: Jan 15, 2025`

## Automatic Integration

### Impact Alert Creation

When a new impact alert is created via `ImpactedAssetService.createImpactAlerts()`, the system automatically:

1. Checks if user has `sms_alerts_enabled = true`
2. Checks if user has a valid `phone_number`
3. Applies rate limiting (1 SMS/hour per property)
4. Sends SMS via Twilio
5. Updates `impact_alerts` table with SMS status
6. Logs to `sms_notifications` table

### Example Flow

```typescript
import { createImpactedAssetService } from './services/impactedAssetService';

const service = createImpactedAssetService(pool);

// This will automatically send SMS to users with SMS enabled
const alerts = await service.createImpactAlerts({
  stormLatitude: 42.3601,
  stormLongitude: -71.0589,
  stormEventId: 'storm-123',
  eventType: 'hail',
  stormDate: '2025-01-15',
  hailSize: 1.5
});

console.log(`Created ${alerts.length} alerts`);
// SMS notifications sent automatically for enabled users
```

## Rate Limiting

- **Limit**: 1 SMS per phone number per hour for same property
- **Scope**: Per phone number + property ID combination
- **Purpose**: Prevent alert fatigue and reduce costs
- **Bypass**: Different properties can trigger alerts immediately

### Rate Limit Logic

```typescript
// First alert to property A
await twilioService.sendStormAlert({
  phoneNumber: '+15551234567',
  propertyId: 'property-A',
  // ... other params
});
// ✅ Sent

// Second alert to property A within 1 hour
await twilioService.sendStormAlert({
  phoneNumber: '+15551234567',
  propertyId: 'property-A',
  // ... other params
});
// ❌ Rate limited

// Alert to property B (different property)
await twilioService.sendStormAlert({
  phoneNumber: '+15551234567',
  propertyId: 'property-B',
  // ... other params
});
// ✅ Sent (different property)
```

## User Configuration

Users can configure SMS preferences in their profile:

```sql
UPDATE users
SET
  phone_number = '+15551234567',
  sms_alerts_enabled = true
WHERE id = 'user-uuid';
```

### Phone Number Format

- **Accepted**: `(555) 123-4567`, `555-123-4567`, `5551234567`, `+15551234567`
- **Stored**: E.164 format (`+15551234567`)
- **Validation**: Automatic cleaning and formatting

## Testing

### Run Test Suite

```bash
# Set test phone number (will receive real SMS)
export TEST_PHONE_NUMBER="+15551234567"

# Run tests
npm run test-twilio
```

### Manual Testing

```bash
# 1. Check status
curl http://localhost:3001/api/alerts/sms-status

# 2. Send test SMS (admin only)
curl -X POST http://localhost:3001/api/alerts/test-sms \
  -H "Content-Type: application/json" \
  -H "X-User-Email: admin@roofer.com" \
  -d '{"phoneNumber": "+15551234567"}'

# 3. Send storm notification
curl -X POST http://localhost:3001/api/alerts/storm-notification \
  -H "Content-Type: application/json" \
  -H "X-User-Email: user@roofer.com" \
  -d '{
    "phoneNumber": "+15551234567",
    "propertyAddress": "123 Main St, Boston, MA",
    "propertyId": "test-property-1",
    "eventType": "hail",
    "hailSize": 1.5
  }'
```

## Monitoring

### Database Queries

```sql
-- Recent SMS notifications
SELECT * FROM recent_sms_notifications LIMIT 10;

-- SMS stats for a user
SELECT * FROM get_user_sms_stats('user-uuid', 30);

-- Failed SMS in last 24 hours
SELECT *
FROM sms_notifications
WHERE status IN ('failed', 'undelivered')
AND created_at > NOW() - INTERVAL '24 hours';

-- SMS delivery rate
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM sms_notifications
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY status;
```

### Twilio Dashboard

Monitor in Twilio Console:
- Message logs
- Delivery status
- Error codes
- Usage and billing

## Cost Optimization

### Twilio Pricing (as of 2025)

- **Outbound SMS (US)**: $0.0079 per message
- **Inbound SMS (US)**: $0.0079 per message
- **Phone Number**: ~$1.15/month

### Cost Reduction Strategies

1. **Rate Limiting**: Prevents duplicate alerts (implemented)
2. **User Preferences**: Only send to opted-in users
3. **Batch Processing**: Send alerts in batches with delays
4. **Alert Thresholds**: Only send for high-severity alerts
5. **Geographic Filtering**: Only alert properties within radius

### Example Monthly Cost

- 1000 properties monitored
- 10 storm events per month
- 50 properties impacted per storm
- 500 SMS sent per month
- **Cost**: 500 × $0.0079 = **$3.95/month**

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Twilio service not configured` | Missing credentials | Set `TWILIO_*` env vars |
| `Invalid phone number format` | Bad phone number | Use E.164 format |
| `Rate limit: Already sent...` | Too many SMS to same property | Wait 1 hour or different property |
| `21211 - Invalid 'To' number` | Phone number not valid | Check number format |
| `21608 - Unverified number` | Trial account limitation | Verify number or upgrade |

### Handling Failures

All SMS failures are logged but don't break impact alert creation:

```typescript
try {
  await sendSMSNotification(...);
} catch (error) {
  console.error('[SMS] Error:', error);
  // Impact alert still created successfully
}
```

## Security

### Best Practices

1. **Admin-Only Operations**: Batch sends and tests require admin role
2. **User Validation**: Email header required for all requests
3. **Phone Number Privacy**: Store in encrypted column if needed
4. **Rate Limiting**: Prevents SMS bombing
5. **Audit Trail**: All SMS logged with user/alert tracking

### Sensitive Data

- ✅ Twilio credentials in environment variables (never committed)
- ✅ Phone numbers validated and cleaned before storage
- ✅ SMS logs include full message for audit trail
- ⚠️ Consider encrypting `phone_number` column for GDPR compliance

## Troubleshooting

### SMS Not Sending

1. Check Twilio status:
   ```bash
   curl http://localhost:3001/api/alerts/sms-status
   ```

2. Verify environment variables:
   ```bash
   echo $TWILIO_ACCOUNT_SID
   echo $TWILIO_AUTH_TOKEN
   echo $TWILIO_PHONE_NUMBER
   ```

3. Check user settings:
   ```sql
   SELECT phone_number, sms_alerts_enabled
   FROM users
   WHERE email = 'user@example.com';
   ```

4. Check logs:
   ```sql
   SELECT *
   FROM sms_notifications
   WHERE user_id = 'user-uuid'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

### Rate Limiting Issues

```sql
-- Check recent SMS for property
SELECT *
FROM sms_notifications
WHERE phone_number = '+15551234567'
AND message_body LIKE '%property-id%'
AND sent_at > NOW() - INTERVAL '1 hour';
```

## Future Enhancements

- [ ] SMS delivery webhooks (Twilio callbacks)
- [ ] Two-way SMS (user replies)
- [ ] SMS templates with variables
- [ ] Scheduled SMS (send at specific time)
- [ ] International SMS support
- [ ] MMS support (images of storm damage)
- [ ] SMS analytics dashboard
- [ ] A/B testing for message formats

## Support

- **Twilio Docs**: https://www.twilio.com/docs/sms
- **API Reference**: https://www.twilio.com/docs/sms/api
- **Status Page**: https://status.twilio.com
- **Support**: https://support.twilio.com

---

**Last Updated**: February 3, 2025
**Version**: 1.0.0
