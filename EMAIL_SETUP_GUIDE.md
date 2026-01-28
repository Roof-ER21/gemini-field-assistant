# Email Setup Guide - Gemini Field Assistant

## Problem Identified

**Verification code emails are not being sent** because no email provider is configured.

The application currently runs in "console mode" where verification codes are only logged to the server console instead of being emailed to users.

## Server Log Evidence

```
🔍 Detecting email provider...
   SENDGRID_API_KEY: ❌ NOT SET
   RESEND_API_KEY: ❌ NOT SET
   SMTP_HOST: ❌ NOT SET
⚠️  No email provider configured. Emails will be logged to console.
📧 Email service in console mode (development)
```

## Solution: Configure Resend Email Service

### Step 1: Get Resend API Key

1. Go to [https://resend.com/](https://resend.com/)
2. Sign up for a free account (includes 3,000 emails/month, 100/day)
3. Verify your domain or use Resend's testing domain
4. Create an API key in the dashboard
5. Copy the API key (starts with `re_...`)

### Step 2: Add API Key to Environment

Edit `/Users/a21/gemini-field-assistant/.env.local`:

```bash
# Email Provider (Resend)
RESEND_API_KEY=re_your_actual_api_key_here

# Email Configuration
EMAIL_FROM_ADDRESS=s21-assistant@roofer.com
EMAIL_ADMIN_ADDRESS=admin@roofer.com
```

### Step 3: Restart the Server

```bash
# Kill the running server
pkill -f "tsx watch server/index.ts"

# Start it again
cd /Users/a21/gemini-field-assistant
npm run server:dev
```

### Step 4: Verify Configuration

Check server logs on startup - you should see:

```
🔍 Detecting email provider...
   RESEND_API_KEY: ✅ SET
✅ Email service initialized with Resend
```

## Alternative Email Providers

### Option 1: SendGrid (Production-Ready)

```bash
# Get API key from: https://sendgrid.com/
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM_ADDRESS=s21-assistant@roofer.com
```

### Option 2: Gmail SMTP (Simple Setup)

```bash
# Use Gmail app-specific password
# Guide: https://support.google.com/accounts/answer/185833
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-digit-app-password
EMAIL_FROM_ADDRESS=your-email@gmail.com
```

## Testing Email Delivery

### Method 1: Try Login Again

1. Navigate to the login page
2. Enter email: `careers@theroofdocs.com`
3. Enter name and click "Continue"
4. Check email inbox for verification code

### Method 2: Check Server Logs

Watch the server console when someone requests a code:

```bash
npm run server:dev
```

You should see:
```
📤 Sending email via Resend API...
   From: s21-assistant@roofer.com
   To: careers@theroofdocs.com
   Subject: 🔐 Your Susan AI-21 Verification Code: 123456
✅ Email sent via Resend successfully!
```

## Verification Code Flow

```
┌─────────────────────────────────────────────────────────────┐
│  User enters email → Frontend calls API                     │
│  ↓                                                           │
│  Backend generates 6-digit code                             │
│  ↓                                                           │
│  Email service detects provider (Resend/SendGrid/SMTP)      │
│  ↓                                                           │
│  Email sent via provider API                                │
│  ↓                                                           │
│  User receives email with code                              │
│  ↓                                                           │
│  User enters code → Verification succeeds → Login          │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting

### Issue: Still logging to console

**Cause**: Environment variable not loaded or server not restarted

**Fix**:
```bash
# 1. Check .env.local has RESEND_API_KEY
cat .env.local | grep RESEND_API_KEY

# 2. Kill all node processes
pkill -9 node

# 3. Restart server
npm run server:dev
```

### Issue: "Failed to send verification email"

**Cause**: Invalid API key or rate limit exceeded

**Fix**:
1. Verify API key is correct in Resend dashboard
2. Check Resend daily limit (100 emails/day on free tier)
3. Look at server logs for specific error message

### Issue: Email goes to spam

**Cause**: Sending from unverified domain

**Fix**:
1. Verify your domain in Resend settings
2. Add SPF and DKIM records to DNS
3. Use a real domain email address for `EMAIL_FROM_ADDRESS`

## Email Templates

The system sends two types of emails:

### 1. Verification Code Email (User)
- **Subject**: `🔐 Your Susan AI-21 Verification Code: [CODE]`
- **Content**: 6-digit code with 10-minute expiration
- **Sent to**: User's email address

### 2. Login Notification Email (Admin)
- **Subject**: `🔐 New User Login - [Name]`
- **Content**: User details, timestamp, IP, user agent
- **Sent to**: `EMAIL_ADMIN_ADDRESS` (admin@roofer.com)

## Security Considerations

1. **API Keys**: Never commit real API keys to git
2. **Rate Limiting**: Backend limits 3 code requests per 15 minutes per IP
3. **Code Expiration**: Verification codes expire after 10 minutes
4. **One-Time Use**: Codes are deleted after successful verification

## Cost Estimates

### Resend (Recommended)
- **Free Tier**: 3,000 emails/month, 100/day
- **Pro**: $20/month for 50,000 emails
- **Best for**: Startups, small businesses

### SendGrid
- **Free Tier**: 100 emails/day forever
- **Essentials**: $19.95/month for 50,000 emails
- **Best for**: Enterprise, high volume

### Gmail SMTP
- **Free**: Up to 500 emails/day per account
- **Best for**: Development, testing, small teams

## Current Status

- ✅ Email service code implemented
- ✅ Resend package installed (`resend@6.4.0`)
- ✅ Email templates designed and tested
- ✅ Rate limiting configured
- ❌ **RESEND_API_KEY not configured** (THIS IS THE ISSUE)
- ❌ Emails only logging to console

## Next Steps

1. **URGENT**: Add `RESEND_API_KEY` to `.env.local`
2. Restart the server
3. Test login with `careers@theroofdocs.com`
4. Verify email delivery
5. Consider domain verification for production

## Support

- **Resend Docs**: https://resend.com/docs
- **SendGrid Docs**: https://docs.sendgrid.com/
- **Nodemailer Docs**: https://nodemailer.com/

---

**Last Updated**: January 28, 2026
**Issue Reporter**: careers@theroofdocs.com (login attempt failed)
**Root Cause**: Missing RESEND_API_KEY in environment configuration
