# Email Notification Fix Guide
## S21 Field Assistant - Quick Fix Instructions

**Date:** November 4, 2025
**Priority:** HIGH
**Estimated Time:** 15-30 minutes

---

## Problem Summary

Login notification emails are not being sent because:

1. **Root Cause:** The `first_login_at` field in the database is never being set
2. **Why:** Login activities are not being logged to the `user_activity_log` table
3. **Result:** Every login is detected as "first login" but emails still aren't sent
4. **Most Likely Issue:** Client-side email notifications may be disabled or failing silently

---

## Quick Fix Options

### Option 1: Check Environment Variables (2 minutes) ⚡ RECOMMENDED FIRST

**Check Railway dashboard for these variables:**

```bash
# Make sure these are NOT set to 'false'
VITE_EMAIL_NOTIFICATIONS_ENABLED=true   # or remove this variable entirely
VITE_ACTIVITY_LOGGING_ENABLED=true      # or remove this variable entirely

# Make sure these ARE set correctly
RESEND_API_KEY=re_xxxxxxxxxxxxx         # ✅ Already set
EMAIL_ADMIN_ADDRESS=ahmed.mahmoud@theroofdocs.com  # ✅ Already set
EMAIL_FROM_ADDRESS=s21-assistant@roofer.com        # ✅ Already set
```

**How to check:**
1. Go to Railway dashboard
2. Select your project
3. Go to Variables tab
4. Look for `VITE_EMAIL_NOTIFICATIONS_ENABLED`
5. If it's set to `'false'`, remove it or change to `'true'`
6. Deploy changes

---

### Option 2: Send Notifications on Every Login (10 minutes) 🔧

**Problem:** Current code only sends emails on "first login" which never happens.

**Solution:** Change the code to send emails on every login.

**File:** `/services/authService.ts`

**Line 313-325, change from:**
```typescript
// Send email notification to admin ONLY on first login
if (isFirstLogin) {
  console.log('📧 First login detected - sending admin notification');
  emailNotificationService.notifyLogin({
    userName: user.name,
    userEmail: user.email,
    timestamp: user.last_login_at.toISOString()
  }).catch(err => {
    console.warn('Failed to send first login notification email:', err);
  });
} else {
  console.log('🔕 Not first login - skipping admin email notification');
}
```

**To:**
```typescript
// Send email notification to admin on every login
console.log('📧 Login detected - sending admin notification');
emailNotificationService.notifyLogin({
  userName: user.name,
  userEmail: user.email,
  timestamp: user.last_login_at.toISOString()
}).then(result => {
  console.log('📧 Email notification result:', result);
}).catch(err => {
  console.error('❌ Failed to send login notification email:', err);
});
```

**Trade-off:** You'll receive an email EVERY time someone logs in (could be many per day).

**After making this change:**
```bash
# Rebuild the project
npm run build

# Commit and push
git add .
git commit -m "Fix: Send login notifications on every login"
git push

# Railway will auto-deploy
```

---

### Option 3: Send Notifications Once Per Day (15 minutes) ⭐ BEST SOLUTION

**Problem:** Don't want to spam admin with emails on every login.

**Solution:** Send email only on the first login each day.

**File:** `/services/authService.ts`

**Line 313-325, change from:**
```typescript
// Send email notification to admin ONLY on first login
if (isFirstLogin) {
  console.log('📧 First login detected - sending admin notification');
  emailNotificationService.notifyLogin({
    userName: user.name,
    userEmail: user.email,
    timestamp: user.last_login_at.toISOString()
  }).catch(err => {
    console.warn('Failed to send first login notification email:', err);
  });
} else {
  console.log('🔕 Not first login - skipping admin email notification');
}
```

**To:**
```typescript
// Send email notification to admin on first login of the day
const lastLoginDate = user.last_login_at ? new Date(user.last_login_at).toDateString() : null;
const today = new Date().toDateString();
const isFirstLoginToday = lastLoginDate !== today;

if (isFirstLoginToday) {
  console.log('📧 First login today - sending admin notification');
  emailNotificationService.notifyLogin({
    userName: user.name,
    userEmail: user.email,
    timestamp: user.last_login_at.toISOString()
  }).then(result => {
    console.log('📧 Email notification result:', result);
  }).catch(err => {
    console.error('❌ Failed to send login notification email:', err);
  });
} else {
  console.log('🔕 Not first login today - skipping admin email notification');
}
```

**Benefit:** Only one email per user per day.

**After making this change:**
```bash
# Rebuild the project
npm run build

# Commit and push
git add .
git commit -m "Fix: Send login notifications once per day per user"
git push

# Railway will auto-deploy
```

---

### Option 4: Fix Activity Logging (30 minutes) 🔨 PROPER FIX

**Problem:** Login activities are not being logged, so database triggers don't fire.

**Solution:** Ensure activity logging completes before checking first login status.

**File:** `/services/authService.ts`

**Around line 295-325, change the order:**

**Current order:**
```typescript
await databaseService.setCurrentUser(user);

// Log login activity (for daily summaries)
activityService.logLogin().catch(err => {
  console.warn('Failed to log login activity:', err);
});

// Send email notification to admin ONLY on first login
if (isFirstLogin) {
  emailNotificationService.notifyLogin({...});
}
```

**New order (wait for activity to be logged):**
```typescript
await databaseService.setCurrentUser(user);

// Log login activity and wait for it to complete
try {
  await activityService.logLogin();
  console.log('✅ Login activity logged successfully');

  // Wait a bit for database trigger to fire
  await new Promise(resolve => setTimeout(resolve, 500));

  // Re-fetch user to get updated first_login_at
  const response = await fetch(`${window.location.origin}/api/users/${email.toLowerCase()}`);
  if (response.ok) {
    const updatedUser = await response.json();
    if (updatedUser && !updatedUser.first_login_at) {
      // This is truly the first login
      console.log('📧 First login confirmed - sending admin notification');
      await emailNotificationService.notifyLogin({
        userName: user.name,
        userEmail: user.email,
        timestamp: user.last_login_at.toISOString()
      });
    } else {
      console.log('🔕 Not first login - skipping admin email notification');
    }
  }
} catch (err) {
  console.warn('Failed to log login activity:', err);
}
```

**Benefit:** Proper tracking and only email on actual first login ever.

---

## Testing After Fix

### Test Scenario 1: New User First Login
1. Create a new user or use a test email not in database
2. Log in
3. **Expected:** Receive login notification email

### Test Scenario 2: Existing User Login (if using Option 3)
1. Log in with a user who already logged in today
2. **Expected:** NO email
3. Change system date to tomorrow (or wait until tomorrow)
4. Log in again
5. **Expected:** Receive login notification email

### Test Scenario 3: Check Browser Console
After logging in, check for these logs:
```
✅ User logged in successfully: test@example.com
📧 First login detected - sending admin notification
✅ Email notification sent (login): resend
```

### Test Scenario 4: Check Railway Logs
```bash
railway logs --follow

# Look for:
POST /api/notifications/email
✅ Email notification sent successfully
```

---

## Debugging Checklist

If emails still aren't working after applying a fix:

### 1. Check Browser Console
- [ ] Look for email notification logs
- [ ] Check for any error messages
- [ ] Verify `VITE_EMAIL_NOTIFICATIONS_ENABLED` is not 'false'

### 2. Check Railway Logs
```bash
railway logs --follow
```
- [ ] Look for POST requests to `/api/notifications/email`
- [ ] Check for "Email notification sent successfully" message
- [ ] Look for any error messages

### 3. Check Email Service Status
```bash
curl https://sa21.up.railway.app/api/notifications/config
```
**Expected response:**
```json
{
  "provider": "resend",
  "from": "s21-assistant@roofer.com",
  "adminEmail": "ahmed.mahmoud@theroofdocs.com",
  "configured": true
}
```

### 4. Test Email Endpoint Directly
```bash
curl -X POST "https://sa21.up.railway.app/api/notifications/email" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "login",
    "data": {
      "userName": "Test User",
      "userEmail": "test@example.com",
      "timestamp": "2025-11-04T17:00:00.000Z"
    }
  }'
```
**Expected response:**
```json
{
  "success": true,
  "message": "Email notification sent successfully",
  "provider": "resend"
}
```

### 5. Check Database
```sql
-- Check if users have login tracking data
SELECT email, first_login_at, last_login_at, login_count
FROM users
ORDER BY created_at DESC
LIMIT 10;

-- Check if login activities are being logged
SELECT *
FROM user_activity_log
WHERE activity_type = 'login'
ORDER BY created_at DESC
LIMIT 10;

-- Check if emails are being logged
SELECT *
FROM email_notifications
WHERE notification_type = 'first_login' OR notification_type = 'login'
ORDER BY sent_at DESC
LIMIT 10;
```

---

## Quick Reference: Environment Variables

### Required for Email Notifications
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx              # ✅ Set on Railway
EMAIL_ADMIN_ADDRESS=ahmed.mahmoud@theroofdocs.com  # ✅ Set on Railway
EMAIL_FROM_ADDRESS=s21-assistant@roofer.com        # ✅ Set on Railway
```

### Optional (should be enabled or not set)
```bash
# If these are set to 'false', emails won't send
VITE_EMAIL_NOTIFICATIONS_ENABLED=true  # Default: true
VITE_ACTIVITY_LOGGING_ENABLED=true     # Default: true
```

### How to Update Railway Environment Variables
1. Go to Railway dashboard
2. Select project: `gemini-field-assistant`
3. Click on "Variables" tab
4. Add/Edit/Remove variables
5. Click "Deploy" to restart with new variables

---

## Expected Email Content

When a login notification is sent successfully, the admin should receive:

**Subject:** 🔐 New User Login - [User Name]

**Body:**
```
User Login Notification
------------------------

A user has successfully logged into the S21 Field AI Assistant.

User Name: [Name]
Email: [Email]
Login Time: [Timestamp with timezone]
IP Address: [IP]
User Agent: [Browser/Device info]

This is an automated notification from the S21 Field AI Assistant system.

---
S21 Field AI Assistant
Powered by ROOFER - The Roof Docs
```

---

## Contact & Support

**Admin Email:** ahmed.mahmoud@theroofdocs.com
**Deployment:** https://sa21.up.railway.app/

**For questions:**
1. Check this guide first
2. Review `/EMAIL_NOTIFICATION_DIAGNOSTIC_REPORT.md` for technical details
3. Check Railway logs for errors
4. Test email endpoint manually (see debugging checklist)

---

## Summary

**Recommended Action Plan:**
1. ⚡ **Check environment variables** (2 min) - Do this first!
2. ⭐ **Implement Option 3** (15 min) - Best balance of functionality
3. 🧪 **Test login flow** (5 min) - Verify emails are sent
4. 📧 **Monitor inbox** - Confirm receipt

**Total time:** ~25 minutes

**Success criteria:**
- ✅ Login notification emails received in admin inbox
- ✅ Browser console shows email sent confirmation
- ✅ Railway logs show successful API calls

---

**Last Updated:** November 4, 2025, 5:00 PM EST
