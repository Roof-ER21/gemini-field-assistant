# Email Notification System - Quick Start Guide

## What Was Fixed?

1. **First-Login Detection Bug** - Now correctly detects when users log in for the first time
2. **Environment Configuration** - Clear documentation added for email setup
3. **Verified All Services** - Email service, cron service, and daily summaries all working

---

## To Enable Real Email Sending (Production)

### Step 1: Get Resend API Key

1. Go to https://resend.com/
2. Sign up for free account
3. Go to "API Keys" section
4. Click "Create API Key"
5. Copy the key (starts with `re_`)

### Step 2: Update Configuration

Edit `.env.local` file:

```bash
# Find this line:
RESEND_API_KEY=your_resend_api_key_here

# Replace with your actual key:
RESEND_API_KEY=re_your_actual_key_here
```

### Step 3: Verify Email Addresses

Make sure these are correct in `.env.local`:

```bash
EMAIL_FROM_ADDRESS=noreply@theroofdocs.com
EMAIL_ADMIN_ADDRESS=ahmed.mahmoud@theroofdocs.com
```

**Important:** With Resend free tier, you may need to:
- Verify your domain `theroofdocs.com` in Resend dashboard
- OR use a verified email address
- OR temporarily use `onboarding@resend.dev` for testing

### Step 4: Restart Server

```bash
npm run server
```

---

## Current Status (Without API Key)

When `RESEND_API_KEY` is not set or invalid:

- ✅ System works normally
- ✅ Email notifications are triggered
- ✅ Emails are logged to console
- ❌ Emails are NOT actually sent to recipients

**Console Output Example:**
```
================================================================================
📧 EMAIL NOTIFICATION (CONSOLE MODE - DEV ONLY)
================================================================================
To: ahmed.mahmoud@theroofdocs.com
From: s21-assistant@roofer.com
Subject: 🔐 New User Login - Ahmed Mahmoud
--------------------------------------------------------------------------------
[Full email content shown here]
================================================================================
```

---

## Testing Your Setup

### Quick Test

Run the automated test script:

```bash
./test-email-fix.sh
```

This will test:
- ✅ Server health
- ✅ Email configuration
- ✅ Cron service status
- ✅ First-login detection
- ✅ Email sending
- ✅ Manual cron trigger

### Manual Tests

#### Test 1: Check Email Config

```bash
curl http://localhost:3001/api/notifications/config
```

**Expected Output (with API key):**
```json
{
  "provider": "resend",
  "from": "noreply@theroofdocs.com",
  "adminEmail": "ahmed.mahmoud@theroofdocs.com",
  "configured": true
}
```

**Expected Output (without API key):**
```json
{
  "provider": "console",
  "from": "s21-assistant@roofer.com",
  "adminEmail": "ahmed.mahmoud@theroofdocs.com",
  "configured": false
}
```

#### Test 2: Send Test Login Email

```bash
curl -X POST http://localhost:3001/api/notifications/email \
  -H "Content-Type: application/json" \
  -d '{
    "type": "login",
    "data": {
      "userName": "Test User",
      "userEmail": "test@example.com"
    }
  }'
```

**Expected Output:**
```json
{
  "success": true,
  "message": "Email notification sent successfully",
  "provider": "resend"
}
```

Check admin inbox for the email!

#### Test 3: Trigger Daily Summary

```bash
curl -X POST http://localhost:3001/api/cron/trigger
```

**Expected Output:**
```json
{
  "success": true,
  "message": "Daily summary job triggered manually",
  "result": {
    "sent": 1,
    "failed": 0,
    "skipped": 0
  }
}
```

---

## What Emails Will Be Sent?

### 1. Login Notifications

**When:** User logs in for the FIRST time
**To:** Admin (ahmed.mahmoud@theroofdocs.com)
**Subject:** 🔐 New User Login - [User Name]
**Content:** User details, timestamp, IP address, user agent

### 2. Daily Summary Emails

**When:** 4 times per day (5 AM, 12 PM, 7 PM, 11 PM EST)
**To:** Each active user
**Subject:** 📊 Daily Summary - [User Name] ([Date])
**Content:**
- Total activities
- Chat message count
- Documents viewed
- Emails generated
- Top documents
- Recent chat previews
- Time range (first/last activity)

---

## Troubleshooting

### Problem: First-login emails not being sent

**Solution:**
1. Clear user's first_login_at in database:
   ```sql
   UPDATE users SET first_login_at = NULL WHERE email = 'user@example.com';
   ```
2. Log in again
3. Check console for:
   - "🎉 First login detected for existing user"
   - "📧 First login detected - sending admin notification"

### Problem: Daily summaries not sending

**Solution:**
1. Check cron status:
   ```bash
   curl http://localhost:3001/api/cron/status
   ```
2. Manually trigger to test:
   ```bash
   curl -X POST http://localhost:3001/api/cron/trigger
   ```
3. Make sure users have activity in database today

### Problem: Emails go to spam

**Solution:**
1. Verify sending domain in Resend dashboard
2. Add SPF/DKIM/DMARC DNS records
3. Use verified sender email
4. Start with Resend test domain for testing

### Problem: "Provider: console" instead of "resend"

**Solution:**
1. Check `.env.local` has `RESEND_API_KEY=re_...`
2. Make sure key is valid (not placeholder)
3. Restart server after adding key
4. Check server console for "✅ Email service initialized with Resend"

---

## File Locations

| File | Purpose |
|------|---------|
| `/Users/a21/Desktop/S21-A24/gemini-field-assistant/.env.local` | Email configuration |
| `/Users/a21/Desktop/S21-A24/gemini-field-assistant/server/services/emailService.ts` | Email sending logic |
| `/Users/a21/Desktop/S21-A24/gemini-field-assistant/server/services/cronService.ts` | Cron job scheduler |
| `/Users/a21/Desktop/S21-A24/gemini-field-assistant/server/services/dailySummaryService.ts` | Daily email generation |
| `/Users/a21/Desktop/S21-A24/gemini-field-assistant/server/index.ts` | API endpoints |

---

## Database Queries

### Check email history

```sql
SELECT * FROM email_notifications
ORDER BY sent_at DESC
LIMIT 10;
```

### Check users' first login status

```sql
SELECT email, first_login_at, created_at
FROM users
ORDER BY created_at DESC;
```

### Clear first_login_at for testing

```sql
UPDATE users
SET first_login_at = NULL
WHERE email = 'ahmed.mahmoud@theroofdocs.com';
```

### Check today's activity

```sql
SELECT u.email, COUNT(*) as activity_count
FROM user_activity_log ual
JOIN users u ON u.id = ual.user_id
WHERE DATE(ual.created_at) = CURRENT_DATE
GROUP BY u.email;
```

---

## Support

For questions or issues:
1. Check server console logs
2. Review `EMAIL_NOTIFICATION_FIX_REPORT.md` for detailed architecture
3. Run `./test-email-fix.sh` to diagnose issues
4. Check Resend dashboard for email delivery status

---

**Last Updated:** 2025-11-04
**Status:** ✅ Fixed and Ready for Production
