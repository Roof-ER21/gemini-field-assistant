# Twilio SMS Alerts - Quick Reference

## Setup (3 Steps)

### 1. Configure Twilio
```bash
# Add to .env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

### 2. Enable for User
```sql
UPDATE users
SET phone_number = '+15551234567',
    sms_alerts_enabled = true
WHERE email = 'user@example.com';
```

### 3. Test
```bash
curl -X POST http://localhost:3001/api/alerts/test-sms \
  -H "Content-Type: application/json" \
  -H "X-User-Email: admin@roofer.com" \
  -d '{"phoneNumber": "+15551234567"}'
```

## API Endpoints

### Check Status
```bash
GET /api/alerts/sms-status
```

### Send Test SMS (Admin)
```bash
POST /api/alerts/test-sms
Body: { "phoneNumber": "+15551234567" }
```

### Send Storm Alert
```bash
POST /api/alerts/storm-notification
Body: {
  "phoneNumber": "+15551234567",
  "propertyAddress": "123 Main St, Boston, MA",
  "propertyId": "property-uuid",
  "eventType": "hail",
  "hailSize": 1.5
}
```

### Get Stats
```bash
GET /api/alerts/sms-stats?daysBack=30
```

## Message Format

```
🌩️ STORM ALERT - SA21
Hail detected near 123 Main St, Boston, MA
Size: 1.5" | Date: Jan 15, 2025
View details in app
```

## Rate Limiting

- **1 SMS per phone/property per hour**
- Different properties can alert immediately
- Returns 429 status when rate limited

## Monitoring

### Recent SMS
```sql
SELECT * FROM recent_sms_notifications LIMIT 10;
```

### User Stats
```sql
SELECT * FROM get_user_sms_stats('user-uuid', 30);
```

### Failed SMS
```sql
SELECT * FROM sms_notifications
WHERE status IN ('failed', 'undelivered')
AND created_at > NOW() - INTERVAL '24 hours';
```

## Cost

- **$0.0079 per SMS** (US)
- **$1.15/month** (phone number)
- Example: 500 SMS/month = **$5.10/month**

## Files

- Service: `/server/services/twilioService.ts`
- Routes: `/server/routes/alertRoutes.ts`
- Integration: `/server/services/impactedAssetService.ts`
- Migration: `/database/migrations/047_sms_alerts.sql`
- Tests: `/server/services/test-twilio-service.ts`
- Docs: `/docs/TWILIO_SMS_ALERTS.md`

## Troubleshooting

### Not sending?
1. Check status: `GET /api/alerts/sms-status`
2. Verify `.env` has credentials
3. Check user has `sms_alerts_enabled = true`
4. Check user has valid `phone_number`

### Rate limited?
```sql
-- Check recent SMS for property
SELECT * FROM sms_notifications
WHERE phone_number = '+15551234567'
AND message_body LIKE '%property-id%'
AND sent_at > NOW() - INTERVAL '1 hour';
```

## Features

✅ Auto-send on impact alert creation
✅ Rate limiting (1/hour/property)
✅ Eastern timezone
✅ Database logging
✅ User statistics
✅ Batch sending
✅ Phone validation
✅ Admin controls

---

**Quick Start**: Set `.env` → Enable user SMS → Send test → Done! 🚀
