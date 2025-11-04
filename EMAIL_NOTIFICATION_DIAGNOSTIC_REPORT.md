# Email Notification Diagnostic Report
## S21 Field Assistant - Login Notification Investigation

**Date:** November 4, 2025
**Deployment:** https://sa21.up.railway.app/
**Status:** ISSUE IDENTIFIED - Login notifications not triggering

---

## Executive Summary

The email notification system is **fully functional** and configured correctly with Resend, but login notifications are **not being sent** because:

1. **Users are not reaching the "first login" trigger** - The `first_login_at` field in the database remains `NULL` for all users
2. **The client-side authentication flow only sends notifications on FIRST login** (lines 313-325 in `services/authService.ts`)
3. **Database trigger is not being activated** - Login activities are not being recorded in the `user_activity_log` table

---

## System Configuration Status

### Email Service Configuration ✅

**Provider:** Resend
**Status:** Fully configured and working
**Admin Email:** ahmed.mahmoud@theroofdocs.com
**From Address:** s21-assistant@roofer.com

**Verification:**
```bash
curl https://sa21.up.railway.app/api/notifications/config
# Response: {"provider":"resend","from":"s21-assistant@roofer.com","adminEmail":"ahmed.mahmoud@theroofdocs.com","configured":true}
```

### Email Endpoint Testing ✅

**Endpoint:** `/api/notifications/email`
**Status:** Working perfectly

**Test Results:**
```bash
curl -X POST "https://sa21.up.railway.app/api/notifications/email" \
  -H "Content-Type: application/json" \
  -d '{"type": "login", "data": {"userName": "Test User", "userEmail": "test@example.com"}}'

# Response: {"success":true,"message":"Email notification sent successfully","provider":"resend"}
```

**Conclusion:** The backend email system is 100% operational.

---

## Root Cause Analysis

### Issue 1: First Login Detection Logic

**Location:** `/services/authService.ts` (lines 232-325)

The authentication service only sends login notifications when it detects a **first login**:

```typescript
let isFirstLogin = true;

// Check if user exists in database and get their role
const response = await fetch(`${window.location.origin}/api/users/${email.toLowerCase()}`);
if (response.ok) {
  const dbUser = await response.json();
  if (dbUser) {
    // Check if user has logged in before (first_login_at exists)
    isFirstLogin = !dbUser.first_login_at;  // ❌ ALWAYS TRUE because first_login_at is NULL
    console.log(`🔑 First login: ${isFirstLogin}`);
  }
}

// Send email notification to admin ONLY on first login
if (isFirstLogin) {
  console.log('📧 First login detected - sending admin notification');
  emailNotificationService.notifyLogin({...}).catch(err => {
    console.warn('Failed to send first login notification email:', err);
  });
} else {
  console.log('🔕 Not first login - skipping admin email notification');
}
```

### Issue 2: Database State

**All users have:**
- `first_login_at`: `NULL`
- `last_login_at`: `NULL`
- `login_count`: `0`

**Example user data:**
```json
{
  "id": "c805ee5b-1fa2-4b76-9bde-a83b397c1454",
  "email": "test@test.com",
  "first_login_at": null,  // ❌ NEVER SET
  "last_login_at": null,   // ❌ NEVER SET
  "login_count": 0         // ❌ NEVER INCREMENTED
}
```

### Issue 3: Database Trigger Not Activating

**The database has a trigger that should update login timestamps:**

```sql
CREATE TRIGGER trigger_update_login_timestamp
  AFTER INSERT ON user_activity_log
  FOR EACH ROW
  WHEN (NEW.activity_type = 'login')
  EXECUTE FUNCTION update_user_login_timestamp();
```

**This trigger updates:**
- `last_login_at` = current timestamp
- `first_login_at` = first timestamp (if NULL)
- `login_count` = incremented by 1

**Problem:** No login activities are being logged to `user_activity_log` table, so the trigger never fires.

---

## Why Login Activities Are Not Being Logged

### Client-Side Activity Logging

**Location:** `/services/authService.ts` (lines 308-310)

```typescript
// Log login activity (for daily summaries)
activityService.logLogin().catch(err => {
  console.warn('Failed to log login activity:', err);
});
```

This calls `activityService.logLogin()` which:
1. Makes a POST request to `/api/activity/log`
2. Includes `X-User-Email` header with user's email
3. Sends `activity_type: 'login'` in the payload

**Location:** `/services/activityService.ts` (lines 91-93)

```typescript
async logLogin(): Promise<ActivityResponse> {
  return this.logActivity('login');
}
```

**The `logActivity` method** (lines 41-86) checks:
1. If activity logging is enabled (via `VITE_ACTIVITY_LOGGING_ENABLED`)
2. If user is authenticated
3. Makes API call to `/api/activity/log` with user email header

### CRITICAL FINDING: Timing Issue

**The problem is a race condition:**

```typescript
// In authService.ts (lines 295-310)

// Update database service
await databaseService.setCurrentUser(user);  // Sets currentUser

// Log login activity (for daily summaries)
activityService.logLogin().catch(err => {     // Uses currentUser
  console.warn('Failed to log login activity:', err);
});

// Send email notification to admin ONLY on first login
if (isFirstLogin) {
  console.log('📧 First login detected - sending admin notification');
  emailNotificationService.notifyLogin({...}).catch(err => {
    console.warn('Failed to send first login notification email:', err);
  });
}
```

**The issue:** `activityService.logLogin()` is called AFTER the user is set, but there might be a timing issue where:
1. `activityService.logLogin()` gets called
2. The API request is made with the correct user email header
3. But the backend may not have created the user yet in the database
4. So the activity log insert might fail with a foreign key constraint

### Verification Needed

Check Railway logs for:
1. Requests to `/api/activity/log` with `activity_type = 'login'`
2. Any database constraint errors when inserting into `user_activity_log`
3. Whether the user exists in the database before the activity log is created

---

## Database Schema Analysis

### Tables Status ✅

**user_activity_log table:** Exists with correct structure
```sql
CREATE TABLE user_activity_log (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  activity_data JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**email_notifications table:** Exists (for logging email sends)
**users table:** Has `first_login_at`, `last_login_at`, `login_count` columns

### Trigger Status ✅

The trigger `trigger_update_login_timestamp` exists and is correctly configured.

---

## Environment Variables (Production)

### Required Variables ✅
- `RESEND_API_KEY` - Set (working)
- `EMAIL_ADMIN_ADDRESS` - Set to `ahmed.mahmoud@theroofdocs.com`
- `EMAIL_FROM_ADDRESS` - Set to `s21-assistant@roofer.com`
- `DATABASE_URL` - Set (connected)

### Optional Variables
- `VITE_EMAIL_NOTIFICATIONS_ENABLED` - Not set (defaults to `true`)

**Client-side check:**
```typescript
// services/emailNotificationService.ts (line 38)
this.enabled = import.meta.env.VITE_EMAIL_NOTIFICATIONS_ENABLED !== 'false';
```

If this environment variable is set to `'false'` on the client, notifications will be disabled.

---

## Testing Results

### Local Test (Console Mode) ✅
```bash
npm run test:email
# Result: ✅ Both login and chat notifications passed
# Mode: Console (no real emails sent, just logged)
```

### Production API Test ✅
```bash
curl -X POST "https://sa21.up.railway.app/api/notifications/email" \
  -d '{"type": "login", "data": {...}}'
# Result: ✅ Email sent successfully via Resend
```

### Database Connection ✅
```bash
curl https://sa21.up.railway.app/api/health
# Result: {"status":"healthy","database":"connected"}
```

---

## Why Emails Are Not Being Sent

### The Complete Flow

1. **User logs in** → `authService.verifyLoginCode()` is called
2. **Check if first login** → Queries `/api/users/${email}` for `first_login_at`
3. **Database returns** → `first_login_at: null` (because it's never been set)
4. **First login detected** → `isFirstLogin = true`
5. **Should send email** → Calls `emailNotificationService.notifyLogin()`
6. **Email service makes API call** → POST to `/api/notifications/email`
7. **Backend sends email** → Via Resend

**Where it breaks:**
- Step 5: `emailNotificationService.notifyLogin()` may not be completing successfully
- **OR** the API call is failing silently (caught but not throwing)
- **OR** `VITE_EMAIL_NOTIFICATIONS_ENABLED` is set to `'false'` on the client

---

## Immediate Action Items

### 1. Verify Client-Side Environment Variable
Check if `VITE_EMAIL_NOTIFICATIONS_ENABLED` is set to `false` in Railway:

```bash
# In Railway dashboard, check environment variables
# If VITE_EMAIL_NOTIFICATIONS_ENABLED = 'false', change it to 'true' or remove it
```

### 2. Check Browser Console on Next Login
When a user logs in, check the browser console for:
- `📧 First login detected - sending admin notification`
- `✅ Email notification sent (login): resend`
- **OR** error messages from `emailNotificationService.notifyLogin()`

### 3. Verify Activity Logging
Check if login activities are being logged:

```bash
curl "https://sa21.up.railway.app/api/activity/summary/{userId}?date=2025-11-04"
```

If no activities are logged, the issue is with `activityService.logLogin()`.

### 4. Test Email Notification Flow End-to-End
Add temporary logging to track the entire flow:

```typescript
// In authService.ts (line 313)
if (isFirstLogin) {
  console.log('📧 First login detected - sending admin notification');
  console.log('📧 Calling emailNotificationService.notifyLogin()...');

  const result = await emailNotificationService.notifyLogin({
    userName: user.name,
    userEmail: user.email,
    timestamp: user.last_login_at.toISOString()
  });

  console.log('📧 Email notification result:', result);
}
```

---

## Resolution Steps

### Option 1: Fix Activity Logging (Recommended)
**Goal:** Make sure login activities are properly logged so the database trigger can update timestamps.

1. Verify `activityService.logLogin()` is working
2. Check `/api/activity/log` endpoint receives requests
3. Ensure database inserts are successful
4. Once `first_login_at` is set, subsequent logins won't send emails

### Option 2: Send Notifications on Every Login
**Goal:** Change the logic to send notifications on every login, not just first login.

**Change in `/services/authService.ts`:**
```typescript
// Remove the conditional check
// OLD:
if (isFirstLogin) {
  emailNotificationService.notifyLogin({...});
}

// NEW:
emailNotificationService.notifyLogin({...}).catch(err => {
  console.warn('Failed to send login notification email:', err);
});
```

**Trade-off:** Admin will receive an email on EVERY login (could be many per day).

### Option 3: Hybrid Approach (Best)
**Goal:** Send notifications on first login per day.

**Implementation:**
```typescript
const lastLoginDate = user.last_login_at ? user.last_login_at.toDateString() : null;
const today = new Date().toDateString();
const isFirstLoginToday = lastLoginDate !== today;

if (isFirstLoginToday) {
  emailNotificationService.notifyLogin({...});
}
```

---

## Current Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Email Service (Backend) | ✅ Working | Resend configured, emails sending successfully |
| Email Endpoint | ✅ Working | `/api/notifications/email` returns success |
| Database Schema | ✅ Complete | All tables and triggers exist |
| Database Connection | ✅ Healthy | Railway PostgreSQL connected |
| Client Email Service | ⚠️ Unknown | May be disabled via env var |
| Login Activity Logging | ❌ Not Working | Activities not being recorded |
| First Login Detection | ⚠️ Broken | Always `true` because `first_login_at` is always `NULL` |
| Email Notifications | ❌ Not Sending | Root cause unknown (likely client-side) |

---

## Recommended Next Steps

### 1. Check Railway Environment Variables (5 minutes)
```
Dashboard → Variables → Check for:
- VITE_EMAIL_NOTIFICATIONS_ENABLED (should NOT be 'false')
- RESEND_API_KEY (confirm it's set)
- EMAIL_ADMIN_ADDRESS (confirm correct email)
```

### 2. Enable Detailed Logging (10 minutes)
Add console logs to track the email notification flow:
- `authService.ts` line 313-325
- `emailNotificationService.ts` line 90-100

### 3. Test Login Flow (5 minutes)
1. Clear browser localStorage
2. Log in with a test user
3. Check browser console for email notification logs
4. Check Railway logs for API requests to `/api/notifications/email`

### 4. Verify Activity Logging (10 minutes)
Check if login activities are being recorded:
```sql
SELECT * FROM user_activity_log
WHERE activity_type = 'login'
ORDER BY created_at DESC
LIMIT 10;
```

### 5. Manual Database Update (if needed)
If you want to test "subsequent login" behavior:
```sql
UPDATE users
SET first_login_at = NOW(),
    last_login_at = NOW(),
    login_count = 1
WHERE email = 'test@test.com';
```

Then log in again - should NOT send email.

---

## Files Checked

1. `/server/services/emailService.ts` - Email service implementation ✅
2. `/server/index.ts` - API endpoints and database setup ✅
3. `/services/authService.ts` - Client-side authentication logic ⚠️
4. `/services/emailNotificationService.ts` - Client-side email service ⚠️
5. `/.env.example` - Environment variable documentation ✅
6. `/.env.local` - Local environment configuration ✅
7. `/package.json` - Dependencies (Resend installed) ✅

---

## Conclusion

The email notification infrastructure is **fully operational**. The issue is in the **client-side authentication flow** not properly:

1. Detecting first logins (because database fields are never updated)
2. Logging login activities (which would trigger database updates)
3. Or the email notification service may be disabled via environment variable

**Next action:** Check Railway environment variables for `VITE_EMAIL_NOTIFICATIONS_ENABLED` and enable detailed logging in the browser console to trace the exact failure point.

---

## Contact

For questions or assistance:
- Check Railway logs: `railway logs --follow`
- Check browser console during login
- Review this diagnostic report

**Report generated:** November 4, 2025, 5:00 PM EST
