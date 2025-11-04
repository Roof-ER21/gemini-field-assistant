# Email Notification System - Setup Guide

## Overview

The S21 Field AI Assistant includes a comprehensive email notification system that alerts administrators about:
- **User logins** - Notifies when users successfully log in to the system
- **Chat interactions** - Sends notifications when users send messages in the chat

The system supports multiple email providers and works seamlessly with your existing infrastructure.

---

## Features

### Login Notifications
When a user logs in, the admin receives an email containing:
- User name and email address
- Login timestamp with timezone
- IP address (optional)
- User agent/browser information (optional)

### Chat Interaction Notifications
When a user sends a chat message, the admin receives an email containing:
- User name and email address
- Full message content (truncated if > 500 characters)
- Timestamp with timezone
- Session ID (for tracking conversations)
- State context (VA, MD, or PA) if selected
- Beautiful HTML formatting with mobile-responsive design

---

## Supported Email Providers

### 1. SendGrid (Recommended for Production)
- **Best for**: Production deployments, high-volume emails
- **Pricing**: Free tier available (100 emails/day)
- **Setup**: Simple API key configuration
- **Deliverability**: Excellent (industry-leading)

### 2. Resend
- **Best for**: Modern applications, developer-friendly API
- **Pricing**: Free tier available (100 emails/day)
- **Setup**: Simple API key configuration
- **Deliverability**: Excellent

### 3. Nodemailer (Gmail/SMTP)
- **Best for**: Small deployments, existing SMTP infrastructure
- **Pricing**: Free with Gmail
- **Setup**: Requires SMTP credentials
- **Deliverability**: Good (depends on SMTP provider)

### 4. Console Mode (Development)
- **Best for**: Local development and testing
- **No configuration required**
- Emails are logged to the console instead of being sent
- Automatically activated if no email provider is configured

---

## Installation & Setup

### Step 1: Install Email Provider Package (Optional)

Choose one email provider and install its package:

#### For SendGrid:
```bash
npm install @sendgrid/mail
```

#### For Resend:
```bash
npm install resend
```

#### For Nodemailer (Gmail/SMTP):
```bash
npm install nodemailer
```

**Note**: If no email package is installed, the system will automatically use Console Mode for development.

---

### Step 2: Configure Environment Variables

Edit your `.env.local` file and add the following configurations:

#### Required for All Providers:
```env
# Admin email address (receives all notifications)
EMAIL_ADMIN_ADDRESS=admin@yourcompany.com

# From address (sender email)
EMAIL_FROM_ADDRESS=s21-assistant@yourcompany.com
```

#### Option A: SendGrid Configuration
```env
SENDGRID_API_KEY=SG.your_sendgrid_api_key_here
```

**Getting a SendGrid API Key:**
1. Sign up at [https://sendgrid.com/](https://sendgrid.com/)
2. Navigate to Settings → API Keys
3. Create a new API key with "Mail Send" permissions
4. Copy the API key and paste it in your `.env.local`

#### Option B: Resend Configuration
```env
RESEND_API_KEY=re_your_resend_api_key_here
```

**Getting a Resend API Key:**
1. Sign up at [https://resend.com/](https://resend.com/)
2. Navigate to API Keys
3. Create a new API key
4. Copy the API key and paste it in your `.env.local`

#### Option C: Nodemailer (Gmail) Configuration
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
```

**Getting a Gmail App-Specific Password:**
1. Enable 2-Factor Authentication on your Google Account
2. Visit [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Select "Mail" and your device
4. Generate password and copy it
5. Use this password (not your regular Gmail password) in `SMTP_PASS`

#### Option D: Custom SMTP Server
```env
SMTP_HOST=mail.yourcompany.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
```

---

### Step 3: Optional Client-Side Configuration

You can disable email notifications on the client side (useful for testing):

```env
# Add to .env.local (defaults to true if not set)
VITE_EMAIL_NOTIFICATIONS_ENABLED=false
```

---

## Testing the Email System

### Method 1: Check Email Configuration
Start your server and check the console output:

```bash
npm run server:dev
```

You should see one of:
```
✅ Email service initialized with SendGrid
✅ Email service initialized with Resend
✅ Email service initialized with Nodemailer
📧 Email service in console mode (development)
```

### Method 2: Test with Console Mode (No Email Provider)
If you haven't configured an email provider, the system automatically uses Console Mode:

1. Start the application
2. Log in with any email
3. Send a chat message
4. Check your server console for formatted email notifications

Example console output:
```
================================================================================
📧 EMAIL NOTIFICATION (CONSOLE MODE - DEV ONLY)
================================================================================
To: admin@roofer.com
From: s21-assistant@roofer.com
Subject: 🔐 New User Login - John Doe
--------------------------------------------------------------------------------
TEXT CONTENT:
--------------------------------------------------------------------------------
🔐 USER LOGIN NOTIFICATION

User Name: John Doe
Email: john@example.com
Login Time: Monday, November 3, 2025, 2:30:45 PM EST

This is an automated notification from the S21 Field AI Assistant system.
================================================================================
```

### Method 3: Test with API Endpoint
You can test the email API directly using curl or Postman:

#### Test Login Notification:
```bash
curl -X POST http://localhost:3001/api/notifications/email \
  -H "Content-Type: application/json" \
  -d '{
    "type": "login",
    "data": {
      "userName": "Test User",
      "userEmail": "test@example.com",
      "timestamp": "2025-11-03T14:30:00Z"
    }
  }'
```

#### Test Chat Notification:
```bash
curl -X POST http://localhost:3001/api/notifications/email \
  -H "Content-Type: application/json" \
  -d '{
    "type": "chat",
    "data": {
      "userName": "Test User",
      "userEmail": "test@example.com",
      "message": "How do I install a GAF Timberline HDZ roof?",
      "timestamp": "2025-11-03T14:30:00Z",
      "sessionId": "session-123",
      "state": "MD"
    }
  }'
```

#### Check Email Configuration:
```bash
curl http://localhost:3001/api/notifications/config
```

Expected response:
```json
{
  "provider": "console",
  "from": "s21-assistant@roofer.com",
  "adminEmail": "admin@roofer.com",
  "configured": false
}
```

---

## Email Templates

### Login Notification Email

**Subject**: 🔐 New User Login - [User Name]

**Content** (HTML formatted with mobile-responsive design):
- Gradient header with lock icon
- User information box:
  - User Name
  - Email Address
  - Login Time (formatted with timezone)
  - IP Address (if available)
  - User Agent/Browser (if available)
- Professional footer with branding

### Chat Interaction Email

**Subject**: 💬 Chat Interaction - [User Name]

**Content** (HTML formatted with mobile-responsive design):
- Gradient header with chat icon
- User information box:
  - User Name
  - Email Address
  - Timestamp (formatted with timezone)
  - State Context (VA/MD/PA badge if selected)
  - Session ID
- Message content box:
  - Full message text (monospace font)
  - Truncation notice if message > 500 characters
- Professional footer with branding

---

## Architecture

### Backend Components

#### 1. Email Service (`server/services/emailService.ts`)
- Singleton service managing email operations
- Auto-detects email provider from environment variables
- Generates HTML and plain-text email templates
- Handles all three email providers + console mode
- Error handling and fallback to console logging

#### 2. API Endpoints (`server/index.ts`)
- `POST /api/notifications/email` - Send email notifications
- `GET /api/notifications/config` - Get email service configuration

### Frontend Components

#### 1. Email Notification Service (`services/emailNotificationService.ts`)
- Client-side service for sending notifications to backend
- Methods:
  - `notifyLogin(payload)` - Send login notification
  - `notifyChat(payload)` - Send chat notification
  - `getConfig()` - Fetch backend email configuration

#### 2. Auth Service Integration (`services/authService.ts`)
- Sends login notification after successful authentication
- Works with both `verifyLoginCode()` and `quickLogin()` methods
- Non-blocking (doesn't fail login if email fails)

#### 3. Chat Panel Integration (`components/ChatPanel.tsx`)
- Sends chat notification when user sends a message
- Includes session ID and state context
- Non-blocking (doesn't fail chat if email fails)

---

## Security Best Practices

### 1. API Keys
- **Never commit API keys to version control**
- Store in `.env.local` (which is gitignored)
- Use environment variables in production (Railway, Heroku, etc.)

### 2. Gmail App Passwords
- **Never use your regular Gmail password**
- Always use app-specific passwords
- Enable 2-Factor Authentication first

### 3. SMTP Security
- Use TLS/SSL when available
- Don't store credentials in code
- Use secure=true for port 465, false for port 587

### 4. Rate Limiting
Free tiers typically allow:
- SendGrid: 100 emails/day
- Resend: 100 emails/day
- Gmail: 500 emails/day

Consider implementing rate limiting if you expect high traffic.

---

## Troubleshooting

### Issue: Emails not being sent

**Check 1**: Verify environment variables are set correctly
```bash
# On server startup, check console output
# Should show: ✅ Email service initialized with [provider]
```

**Check 2**: Verify API key is valid
```bash
# Test with API endpoint
curl http://localhost:3001/api/notifications/config
```

**Check 3**: Check server console for error messages
```bash
# Look for:
# ❌ Error sending email: [error message]
```

### Issue: Emails go to spam

**Solution 1**: Configure SPF and DKIM records (SendGrid/Resend)
- Follow provider's domain authentication guide

**Solution 2**: Use a verified sender email
- Verify your domain with the email provider
- Use a professional email address

### Issue: Gmail blocks sending

**Solution**: Use an app-specific password
- Regular Gmail passwords don't work with SMTP
- See "Getting a Gmail App-Specific Password" above

### Issue: Console mode is being used instead of email provider

**Check**: Make sure you installed the email provider package
```bash
# For SendGrid
npm install @sendgrid/mail

# For Resend
npm install resend

# For Nodemailer
npm install nodemailer
```

---

## Production Deployment

### Railway / Heroku / Vercel

1. Add environment variables to your hosting platform
2. Use the dashboard/CLI to set:
   ```
   EMAIL_ADMIN_ADDRESS=admin@yourcompany.com
   EMAIL_FROM_ADDRESS=s21-assistant@yourcompany.com
   SENDGRID_API_KEY=your_key_here  # or RESEND_API_KEY or SMTP_*
   ```

### Docker

Add to your `docker-compose.yml`:
```yaml
environment:
  - EMAIL_ADMIN_ADDRESS=admin@yourcompany.com
  - EMAIL_FROM_ADDRESS=s21-assistant@yourcompany.com
  - SENDGRID_API_KEY=${SENDGRID_API_KEY}
```

---

## Advanced Configuration

### Disable Email Notifications

#### Server-side (all notifications):
Don't set any email provider environment variables. System will use console mode.

#### Client-side (UI only):
```env
VITE_EMAIL_NOTIFICATIONS_ENABLED=false
```

#### Programmatically:
```typescript
import { emailNotificationService } from './services/emailNotificationService';

// Disable
emailNotificationService.setEnabled(false);

// Enable
emailNotificationService.setEnabled(true);

// Check status
if (emailNotificationService.isEnabled()) {
  console.log('Notifications enabled');
}
```

### Custom Email Templates

Edit `server/services/emailService.ts`:
- `generateLoginNotificationTemplate()` - Customize login emails
- `generateChatNotificationTemplate()` - Customize chat emails

---

## Files Created/Modified

### New Files:
1. `/server/services/emailService.ts` - Email service implementation
2. `/services/emailNotificationService.ts` - Client-side notification service
3. `/EMAIL_NOTIFICATIONS_README.md` - This documentation

### Modified Files:
1. `/server/index.ts` - Added email API endpoints
2. `/services/authService.ts` - Integrated login notifications
3. `/components/ChatPanel.tsx` - Integrated chat notifications
4. `/.env.example` - Added email configuration examples

---

## Support & Resources

### Email Provider Documentation:
- **SendGrid**: [https://docs.sendgrid.com/](https://docs.sendgrid.com/)
- **Resend**: [https://resend.com/docs](https://resend.com/docs)
- **Nodemailer**: [https://nodemailer.com/](https://nodemailer.com/)

### Gmail SMTP Guide:
- [https://support.google.com/mail/answer/7126229](https://support.google.com/mail/answer/7126229)

### App Passwords:
- [https://support.google.com/accounts/answer/185833](https://support.google.com/accounts/answer/185833)

---

## License

This email notification system is part of the S21 Field AI Assistant and follows the same license as the main project.

---

**Last Updated**: November 3, 2025
**Version**: 1.0.0
**Maintainer**: S21 Development Team
