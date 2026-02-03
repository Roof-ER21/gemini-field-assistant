# SMS Alerts - Quick Start Guide

## 5-Minute Setup

### Step 1: Get Twilio Credentials (2 min)
1. Go to https://www.twilio.com/try-twilio
2. Sign up (free trial includes $15 credit)
3. Get a phone number
4. Copy these from Console Dashboard:
   - Account SID
   - Auth Token
   - Phone Number

### Step 2: Configure Environment (1 min)

**Local (.env file):**
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

**Railway (Environment Variables):**
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

### Step 3: Run Migration (1 min)

**Local:**
```bash
npm run db:migrate:sms
```

**Railway:**
```bash
npm run db:migrate:sms:railway
```

### Step 4: Restart Server (30 sec)

**Local:**
```bash
npm run server:dev
```

**Railway:**
- Will auto-restart after env var changes

### Step 5: Test (30 sec)

1. Open app → Impacted Assets → Settings tab
2. Enter your phone number: `+1 555-123-4567`
3. Click **Save**
4. Toggle **SMS Alerts** to **Enabled**
5. Click **Send Test SMS**
6. Check your phone!

---

## Quick Test Commands

### Check if SMS is configured
```bash
curl https://your-app.railway.app/api/sms/status
```

### Save phone number
```bash
curl -X POST http://localhost:3001/api/users/phone \
  -H "Content-Type: application/json" \
  -H "x-user-email: your@email.com" \
  -d '{"phoneNumber": "+15551234567"}'
```

### Enable SMS alerts
```bash
curl -X PUT http://localhost:3001/api/users/sms-alerts \
  -H "Content-Type: application/json" \
  -H "x-user-email: your@email.com" \
  -d '{"enabled": true}'
```

### Send test SMS
```bash
curl -X POST http://localhost:3001/api/users/test-sms \
  -H "x-user-email: your@email.com"
```

---

## Message Format

When a storm hits a monitored property, users receive:

```
🏠 Storm Alert - 123 Main St, Dallas, TX
1.5" hail detected on 02/02/2026
Check SA21 for details.
```

---

## Troubleshooting

### "Twilio service not configured"
→ Add environment variables and restart server

### "Invalid phone number format"
→ Use E.164 format: `+15551234567` (not `(555) 123-4567`)

### "No phone number configured"
→ Go to Settings tab and save your phone number

### SMS not received
→ Check Twilio Console logs: https://console.twilio.com/

---

## Cost

- **Free Trial**: $15 credit (~1,900 messages)
- **Per SMS**: $0.0079 (US/Canada)
- **100 alerts/month**: ~$0.79
- **1,000 alerts/month**: ~$7.90

---

## Files Modified

1. `server/services/twilioService.ts` - NEW
2. `database/migrations/047_sms_alerts.sql` - NEW
3. `server/index.ts` - Added endpoints
4. `server/routes/impactedAssetRoutes.ts` - Send SMS on alerts
5. `components/ImpactedAssetsPanel.tsx` - Settings UI
6. `package.json` - Added twilio dependency

---

## Production Checklist

- [ ] Add Twilio credentials to Railway
- [ ] Run migration: `npm run db:migrate:sms:railway`
- [ ] Verify status: `GET /api/sms/status`
- [ ] Test with your phone number
- [ ] Monitor Twilio Console
- [ ] Test end-to-end storm alert

---

## Support

- **Twilio Docs**: https://www.twilio.com/docs
- **Twilio Console**: https://console.twilio.com/
- **Implementation Details**: See `SMS_IMPLEMENTATION_SUMMARY.md`
- **Full Guide**: See `SMS_ALERTS_README.md`
