# Automated Email Cron Jobs - Setup Guide

## 📧 Cron Schedule Overview

Your S21 Field Assistant now sends automated daily summary emails **4 times per day**:

| Time | Schedule | Description |
|------|----------|-------------|
| **5:00 AM** | `0 5 * * *` | Morning summary |
| **12:00 PM** | `0 12 * * *` | Midday summary |
| **7:00 PM** | `0 19 * * *` | Evening summary |
| **11:00 PM** | `0 23 * * *` | Night summary |

**Timezone:** America/New_York (Eastern Time)

---

## 🚀 How It Works

### Automatic Startup
The cron service starts automatically when the server boots:

```typescript
// server/index.ts
app.listen(PORT, () => {
  cronService.startAll(); // ← Cron jobs start here
});
```

### What Gets Sent
Each cron job calls:
```typescript
dailySummaryService.sendAllDailySummaries()
```

This:
1. Finds all users with activity today
2. Aggregates their stats (chats, documents, emails, etc.)
3. Generates beautiful HTML email
4. Sends via configured email provider (SendGrid/Resend/SMTP)
5. Logs to `email_notifications` table

---

## 🔧 Admin Endpoints

### Check Cron Status
```bash
curl https://sa21.up.railway.app/api/admin/cron-status
```

**Response:**
```json
{
  "success": true,
  "total": 4,
  "running": 4,
  "schedules": [
    { "time": "5:00 AM", "description": "Morning Summary" },
    { "time": "12:00 PM", "description": "Midday Summary" },
    { "time": "7:00 PM", "description": "Evening Summary" },
    { "time": "11:00 PM", "description": "Night Summary" }
  ],
  "timezone": "America/New_York"
}
```

### Manual Trigger (Testing)
```bash
curl -X POST https://sa21.up.railway.app/api/admin/trigger-cron-manual
```

This immediately sends summary emails to all active users (bypasses schedule).

---

## ⚙️ Configuration

### Change Timezone
Edit `server/services/cronService.ts`:

```typescript
const job5am = cron.schedule('0 5 * * *', async () => {
  // ...
}, {
  timezone: "America/Los_Angeles" // ← Change here
});
```

**Common Timezones:**
- `America/New_York` - Eastern Time
- `America/Chicago` - Central Time
- `America/Denver` - Mountain Time
- `America/Los_Angeles` - Pacific Time
- `UTC` - Coordinated Universal Time

### Change Schedule Times
Edit the cron patterns in `server/services/cronService.ts`:

```typescript
// Format: minute hour day month dayOfWeek
'0 5 * * *'   // 5:00 AM daily
'0 12 * * *'  // 12:00 PM daily
'0 19 * * *'  // 7:00 PM daily
'0 23 * * *'  // 11:00 PM daily
```

**Examples:**
- `0 8 * * *` - 8:00 AM daily
- `30 14 * * *` - 2:30 PM daily
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1` - 9 AM every Monday

---

## 📊 Monitoring

### View Logs
Railway automatically logs cron execution:

```
⏰ [5:00 AM] Running morning summary emails...
✅ [5:00 AM] Morning summaries sent: { emailsSent: 5, errors: 0 }
```

### Check Email Notifications Table
```sql
SELECT * FROM email_notifications
WHERE notification_type = 'daily_summary'
ORDER BY sent_at DESC
LIMIT 10;
```

### Activity Summary for User
```bash
curl "https://sa21.up.railway.app/api/activity/summary/USER_ID"
```

---

## 🐛 Troubleshooting

### Cron Jobs Not Running
1. Check server logs for startup errors
2. Verify `node-cron` is installed: `npm list node-cron`
3. Check cron status endpoint: `/api/admin/cron-status`

### Emails Not Sending
1. Verify email provider configured (SendGrid/Resend/SMTP)
2. Check environment variables:
   - `SENDGRID_API_KEY` or
   - `RESEND_API_KEY` or
   - `SMTP_*` credentials
3. Check `email_notifications` table for errors:
   ```sql
   SELECT * FROM email_notifications WHERE success = false;
   ```

### Wrong Timezone
1. Update `timezone` in all 4 cron.schedule() calls
2. Rebuild and redeploy:
   ```bash
   npm run server:build
   git add .
   git commit -m "fix: Update cron timezone"
   git push
   ```

---

## 🔄 Deployment

### Railway Deployment
Railway automatically:
1. Detects git push
2. Runs `npm install` (installs node-cron)
3. Runs `npm run server:build` (compiles TypeScript)
4. Restarts server
5. Cron jobs start on server boot

### Manual Deployment
```bash
# Build backend
npm run server:build

# Commit and push
git add .
git commit -m "Update cron configuration"
git push

# Railway will auto-deploy
```

---

## 📝 Email Provider Setup

### Option 1: SendGrid (Recommended)
1. Sign up: https://sendgrid.com/
2. Get API key
3. Add to Railway environment:
   ```
   SENDGRID_API_KEY=your_key_here
   EMAIL_FROM_ADDRESS=noreply@yourdomain.com
   EMAIL_ADMIN_ADDRESS=admin@yourdomain.com
   ```

### Option 2: Resend
1. Sign up: https://resend.com/
2. Get API key
3. Add to Railway environment:
   ```
   RESEND_API_KEY=your_key_here
   EMAIL_FROM_ADDRESS=noreply@yourdomain.com
   EMAIL_ADMIN_ADDRESS=admin@yourdomain.com
   ```

### Option 3: Gmail/SMTP
1. Enable 2FA on Gmail
2. Create app-specific password
3. Add to Railway environment:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   EMAIL_FROM_ADDRESS=your-email@gmail.com
   EMAIL_ADMIN_ADDRESS=admin@yourdomain.com
   ```

---

## ✅ Verification Checklist

- [ ] Cron service code deployed
- [ ] `node-cron` package installed
- [ ] Server restarted on Railway
- [ ] Cron status endpoint returns 4 jobs
- [ ] Email provider configured
- [ ] Test manual trigger successful
- [ ] Received test email
- [ ] Activity tracking working
- [ ] Database migration complete

---

## 📚 Files Modified

```
server/services/cronService.ts       ← NEW: Cron job service
server/index.ts                      ← Updated: Import & start cron
package.json                         ← Updated: Added node-cron
dist-server/services/cronService.js  ← Built: Compiled JS
```

---

## 🎯 Next Steps

1. **Verify deployment**: Check `/api/admin/cron-status`
2. **Test manually**: Trigger `/api/admin/trigger-cron-manual`
3. **Configure email**: Set up SendGrid/Resend/SMTP
4. **Monitor logs**: Watch for cron execution at scheduled times
5. **Check emails**: Verify summaries arrive as expected

---

**Your automated email system is ready! 🚀**

Users will now receive activity summaries 4 times daily without any manual intervention.
