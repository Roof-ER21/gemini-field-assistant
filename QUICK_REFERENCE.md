# S21 Field Assistant - Quick Reference Card

## 🔥 Critical Files to Modify

### Phase 1: Email Notifications
```
✏️ services/authService.ts          (add recordLogin function, update 2 login methods)
✏️ components/ChatPanel.tsx          (remove emailNotificationService.notifyChat call)
✏️ server/services/dailySummaryService.ts  (NEW FILE - copy from implementation plan)
✏️ server/index.ts                   (add 4 new endpoints - lines after 580)
✏️ database/migrations/001_add_activity_tracking.sql  (NEW FILE - create tables)
```

### Phase 2: Session Persistence
```
✏️ services/authService.ts          (lines 89, 273, 361, 69 - change expiry values)
✏️ components/LoginPage.tsx          (lines 444, 449 - update UI text)
```

### Phase 3: Login Verification
```
✏️ server/index.ts                   (add verification email endpoint)
✏️ server/services/emailService.ts   (add sendEmail method + template)
✏️ services/authService.ts           (lines 133-146 - update sendVerificationCode)
✏️ components/LoginPage.tsx          (lines 36-40, 168-169, 355-372 - remove code display)
```

---

## 📝 Code Snippets - Copy & Paste Ready

### Add to authService.ts (after line 498)
```typescript
/**
 * Record user login and check if first login today
 */
private async recordLogin(userId: string, email: string): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const lastLoginKey = `last_login_date_${email}`;
    const lastLoginDate = localStorage.getItem(lastLoginKey);
    const isFirstLoginToday = lastLoginDate !== today;
    
    localStorage.setItem(lastLoginKey, today);
    
    await fetch(`${window.location.origin}/api/users/activity/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-email': email
      },
      body: JSON.stringify({
        userId,
        email,
        isFirstLoginToday,
        timestamp: new Date().toISOString()
      })
    });
    
    return isFirstLoginToday;
  } catch (error) {
    console.error('Error recording login:', error);
    return true;
  }
}
```

### Replace in authService.ts (lines 298-305)
```typescript
// BEFORE:
emailNotificationService.notifyLogin({
  userName: user.name,
  userEmail: user.email,
  timestamp: user.last_login_at.toISOString()
}).catch(err => {
  console.warn('Failed to send login notification email:', err);
});

// AFTER:
const isFirstLoginToday = await this.recordLogin(user.id, user.email);
if (isFirstLoginToday) {
  emailNotificationService.notifyLogin({
    userName: user.name,
    userEmail: user.email,
    timestamp: user.last_login_at.toISOString()
  }).catch(err => {
    console.warn('Failed to send login notification email:', err);
  });
}
```

### Remove from ChatPanel.tsx (lines 236-259)
```typescript
// DELETE THIS ENTIRE BLOCK:
emailNotificationService.notifyChat({
  userName: currentUser.name,
  userEmail: currentUser.email,
  message: originalQuery,
  timestamp: new Date().toISOString(),
  sessionId: currentSessionId,
  state: selectedState || undefined
}).catch(err => {
  console.warn('Failed to send chat notification email:', err);
});

// KEEP ONLY:
databaseService.saveChatMessage({
  message_id: userMessage.id,
  sender: 'user',
  content: originalQuery,
  state: selectedState || undefined,
  session_id: currentSessionId,
});
```

---

## 🗄️ Database Migration SQL

### Create file: database/migrations/001_add_activity_tracking.sql
```sql
BEGIN;

CREATE TABLE IF NOT EXISTS user_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    activity_data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT
);

CREATE INDEX idx_activity_log_user_id ON user_activity_log(user_id);
CREATE INDEX idx_activity_log_timestamp ON user_activity_log(timestamp DESC);
CREATE INDEX idx_activity_log_type ON user_activity_log(activity_type);
CREATE INDEX idx_activity_log_date ON user_activity_log(DATE(timestamp));

CREATE TABLE IF NOT EXISTS email_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_email VARCHAR(255) NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'sent',
    email_data JSONB
);

CREATE INDEX idx_email_notifications_recipient ON email_notifications(recipient_email);
CREATE INDEX idx_email_notifications_type ON email_notifications(notification_type);
CREATE INDEX idx_email_notifications_sent_at ON email_notifications(sent_at DESC);

COMMIT;
```

### Run migration:
```bash
railway run psql $DATABASE_URL -f database/migrations/001_add_activity_tracking.sql
```

---

## 🚀 Add to server/index.ts (after line 580)

### Endpoint 1: Track Login Activity
```typescript
app.post('/api/users/activity/login', async (req, res) => {
  try {
    const { userId, email, isFirstLoginToday, timestamp } = req.body;
    await pool.query(
      `INSERT INTO user_activity_log 
       (user_id, activity_type, activity_data, timestamp, ip_address, user_agent)
       VALUES ($1, 'login', $2, $3, $4, $5)`,
      [userId, JSON.stringify({ isFirstLoginToday, email }), timestamp, req.ip, req.get('user-agent')]
    );
    await pool.query(`UPDATE users SET last_login_at = $1 WHERE id = $2`, [timestamp, userId]);
    res.json({ success: true, isFirstLoginToday });
  } catch (error) {
    console.error('Error recording login:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});
```

### Endpoint 2: Get Activity Log
```typescript
app.get('/api/admin/activity-log', async (req, res) => {
  try {
    const { userId, date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT * FROM user_activity_log WHERE user_id = $1 AND DATE(timestamp) = $2 ORDER BY timestamp DESC`,
      [userId, targetDate]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching activity log:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});
```

### Endpoint 3: Get Online Users
```typescript
app.get('/api/admin/users-online', async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = await pool.query(
      `SELECT DISTINCT ON (u.id) u.id, u.name, u.email, u.role, ual.timestamp as last_activity
       FROM users u INNER JOIN user_activity_log ual ON u.id = ual.user_id
       WHERE ual.timestamp > $1 ORDER BY u.id, ual.timestamp DESC`,
      [fiveMinutesAgo]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching online users:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});
```

### Endpoint 4: Send Daily Summary
```typescript
app.post('/api/admin/send-daily-summary', async (req, res) => {
  try {
    const { date } = req.body;
    await dailySummaryService.sendDailySummaries(date);
    res.json({ success: true, message: 'Daily summaries sent' });
  } catch (error) {
    console.error('Error sending daily summaries:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});
```

### Don't forget to import at top of server/index.ts:
```typescript
import { dailySummaryService } from './services/dailySummaryService.js';
```

---

## ⏱️ Session Persistence Changes

### authService.ts - Line 89, 273, 361
```typescript
// CHANGE FROM:
const expiryDuration = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 0;

// CHANGE TO:
const expiryDuration = rememberMe ? 365 * 24 * 60 * 60 * 1000 : 0;
```

### authService.ts - Line 69
```typescript
// CHANGE FROM:
const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
if (authData.rememberMe && (authData.expiresAt - now) < sevenDaysInMs) {

// CHANGE TO:
const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
if (authData.rememberMe && (authData.expiresAt - now) < thirtyDaysInMs) {
```

### LoginPage.tsx - Line 444
```typescript
// CHANGE FROM:
Remember me for 30 days

// CHANGE TO:
Remember me for 1 year
```

### LoginPage.tsx - Line 449
```typescript
// CHANGE FROM:
Your session will be saved for 30 days

// CHANGE TO:
Your session will be saved for 1 year (auto-refreshes)
```

---

## 📧 Email Service - Add sendEmail Method

### Add to server/services/emailService.ts (make public)
```typescript
/**
 * Send email using the configured provider (PUBLIC METHOD)
 */
async sendEmail(to: string, template: EmailTemplate): Promise<boolean> {
  return this.sendEmail(to, template);
}
```

Actually, the sendEmail method is already private. Just add this public wrapper:
```typescript
/**
 * Public method to send emails
 */
async sendEmailTo(to: string, subject: string, html: string, text: string): Promise<boolean> {
  return this.sendEmail(to, { subject, html, text });
}
```

And update the export:
```typescript
export { emailService };
```

---

## ✅ Testing Commands

### Test Database Connection
```bash
railway run psql $DATABASE_URL -c "SELECT NOW();"
```

### Test Activity Log Insert
```bash
railway run psql $DATABASE_URL -c "SELECT COUNT(*) FROM user_activity_log;"
```

### Test Email Notifications
```bash
railway run psql $DATABASE_URL -c "SELECT * FROM email_notifications ORDER BY sent_at DESC LIMIT 5;"
```

### Manually Trigger Daily Summary
```bash
curl -X POST https://your-app.railway.app/api/admin/send-daily-summary \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-11-03"}'
```

---

## 🐛 Common Issues & Fixes

### Issue: "relation 'user_activity_log' does not exist"
**Fix:** Run database migration
```bash
railway run psql $DATABASE_URL -f database/migrations/001_add_activity_tracking.sql
```

### Issue: "recordLogin is not defined"
**Fix:** Add the recordLogin function to authService.ts (see code snippet above)

### Issue: "Cannot find module 'dailySummaryService'"
**Fix:** Create the file server/services/dailySummaryService.ts (copy from IMPLEMENTATION_PLAN.md section 2.1.D)

### Issue: Email not sending
**Fix:** Check environment variables are set:
```bash
railway variables list | grep EMAIL
```

### Issue: Token not persisting
**Fix:** Check localStorage in browser DevTools (F12 → Application → Local Storage → s21_auth_token)

---

## 📋 Pre-Deployment Checklist

- [ ] Database migration file created
- [ ] Database migration tested locally
- [ ] All code changes committed to git
- [ ] Environment variables configured (EMAIL_ADMIN_ADDRESS, etc.)
- [ ] Database backup created
- [ ] Rollback plan documented
- [ ] Testing checklist completed
- [ ] Code reviewed by team

---

## 🔄 Deployment Order

1. **Deploy database migration** (railway run psql...)
2. **Deploy backend code** (git push)
3. **Verify endpoints** (curl /api/health)
4. **Deploy frontend code** (automatic with backend)
5. **Test login flow** (verify email sent on first login only)
6. **Test chat** (verify no emails sent)
7. **Manually trigger daily summary** (curl endpoint)
8. **Monitor logs** for 24 hours

---

## 📞 Need Help?

- Full details: `IMPLEMENTATION_PLAN.md`
- Summary: `EXECUTIVE_SUMMARY.md`
- This file: `QUICK_REFERENCE.md`

---

**Last Updated:** 2025-11-04  
**Version:** 1.0
