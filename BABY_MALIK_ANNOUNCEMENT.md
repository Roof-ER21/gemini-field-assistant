# Baby Malik Announcement System 🎉

## Overview
A special one-time toast notification system to celebrate the arrival of baby Malik! This system displays a beautiful celebration toast at exactly 11:11 AM Eastern Time for all logged-in users.

## Features
✨ Toast notification appears at exactly 11:11 AM Eastern Time
✨ Shows for all logged-in users automatically
✨ Users can dismiss it (won't reappear after dismissal)
✨ Beautiful gradient celebration design with confetti emoji
✨ Persists until manually dismissed
✨ Checks for new announcements every 30 seconds
✨ Works across all devices (desktop, tablet, mobile)

---

## 🚀 Quick Start (Railway Deployment)

### Step 1: Update Database Schema
The announcements table is already in `database/schema.sql`. If you haven't run the schema yet:

```bash
npm run db:init:railway
```

This creates all tables including the new `announcements` table.

### Step 2: Test the System
Verify everything is working:

```bash
npm run announcement:test:railway
```

This will:
- ✓ Test database connection
- ✓ Verify announcements table exists
- ✓ Check table schema
- ✓ Test creating/querying announcements
- ✓ Check if Baby Malik announcement exists

### Step 3: Create Baby Malik Announcement
Run the automated script:

```bash
npm run announcement:create:railway
```

This will:
- Create the announcement for today at 11:11 AM ET
- Set it to type "celebration"
- Make it active immediately
- Verify it was created successfully

### Step 4: Verify Live
Visit your app's API endpoint:
```
GET https://your-app.railway.app/api/announcements/active
```

You should see the Baby Malik announcement in the response.

---

## 📋 Manual Deployment Options

### Option 1: Using NPM Scripts (Recommended)
```bash
# Test the system
npm run announcement:test:railway

# Create announcement
npm run announcement:create:railway
```

### Option 2: Using Node.js Script Directly
```bash
railway run node scripts/create-baby-malik-announcement.js
```

### Option 3: Using Shell Script (via API)
```bash
./scripts/create-announcement-api.sh
```

### Option 4: Manual API Call
```bash
curl -X POST "https://your-app.railway.app/api/admin/announcements" \
  -H "Content-Type: application/json" \
  -H "x-user-email: your-admin-email@example.com" \
  -d '{
    "title": "🎉 Welcome Baby Malik! 🎉",
    "message": "Congratulations on the arrival of baby Malik to the world! This is a special moment worth celebrating. 💙",
    "type": "celebration",
    "start_time": "2025-11-12T11:11:00-05:00"
  }'
```

## Technical Details

### Database
- New `announcements` table stores all announcements
- Fields: title, message, type, start_time, end_time, is_active

### Backend API
- `GET /api/announcements/active` - Fetch active announcements
- `POST /api/admin/announcements` - Create new announcement (admin only)

### Frontend
- Toast component (`components/ui/toast.tsx`)
- Polls for announcements every 30 seconds
- Stores dismissed announcements in localStorage
- Displays at top-right of screen with dismiss button

### Time Settings
- Announcement is scheduled for 11:11 AM Eastern Time (America/New_York)
- Automatically appears for users who are logged in
- New users logging in after 11:11 will also see it (unless they dismissed it in a previous session)

## Customization
To create other announcements in the future, use the same API endpoint with different:
- `title`: The announcement title
- `message`: The announcement message
- `type`: One of: info, success, warning, error, celebration
- `start_time`: When to start showing (ISO 8601 format with timezone)
- `end_time`: (optional) When to stop showing

## Architecture
1. **Database**: PostgreSQL table stores announcements
2. **Backend**: Express.js API endpoints serve active announcements
3. **Frontend**: React app polls for announcements and displays toasts
4. **Storage**: localStorage tracks dismissed announcements per user device

---

## 🎯 What to Expect

### Before 11:11 AM ET
- Announcement is in database but not showing
- API will return it, but frontend filters it out based on start_time
- Users see no toast notification

### At Exactly 11:11 AM ET
- For users already logged in: Toast appears within 30 seconds (next poll cycle)
- For users logging in after 11:11: Toast appears immediately on login

### After 11:11 AM ET
- All new logins will see the toast
- Users who dismissed it won't see it again (localStorage tracking)
- Toast stays visible until user clicks dismiss button (X)

### User Experience
1. Beautiful gradient toast slides in from top-right
2. Shows confetti emoji 🎉 and celebration message
3. User can read at their own pace
4. User clicks X to dismiss
5. Dismissal is remembered (won't show again on that device/browser)

---

## 🐛 Troubleshooting

### Problem: "Announcements table does not exist"
**Solution:**
```bash
npm run db:init:railway
```
This runs the full schema including the announcements table.

### Problem: "Announcement already exists"
**Solution:** The script prevents duplicates. If you need to recreate it:
1. Connect to Railway database
2. Delete existing: `DELETE FROM announcements WHERE title LIKE '%Baby Malik%';`
3. Run create script again

### Problem: Toast not appearing
**Check:**
1. Is it past 11:11 AM ET? If not, wait or adjust start_time
2. Did user already dismiss it? Check localStorage: `dismissed_announcements`
3. Is backend running? Check: `/api/announcements/active`
4. Are there console errors? Check browser dev tools

### Problem: Time zone issues
The script automatically adjusts for DST:
- Standard Time (Nov-Mar): UTC-5
- Daylight Time (Mar-Nov): UTC-4

To manually set a different time, edit the `start_time` in the database.

### Clearing Dismissed Announcements (for testing)
In browser console:
```javascript
localStorage.removeItem('dismissed_announcements');
location.reload();
```

---

## 📱 Testing Locally

To test before 11:11 AM or on a different day:

### Option 1: Create Test Announcement (Immediate)
```sql
INSERT INTO announcements (title, message, type, start_time, is_active)
VALUES (
  '🎉 Test Announcement',
  'This is a test. It should appear immediately.',
  'celebration',
  NOW(),
  true
);
```

### Option 2: Adjust Start Time
```sql
UPDATE announcements
SET start_time = NOW()
WHERE title LIKE '%Baby Malik%';
```

### Option 3: Use Test Script
```bash
npm run announcement:test:railway
```

---

## 📊 Monitoring

### Check Announcement Status
```sql
SELECT id, title, start_time, is_active, created_at
FROM announcements
WHERE title LIKE '%Baby Malik%';
```

### Check All Active Announcements
```sql
SELECT id, title, type, start_time
FROM announcements
WHERE is_active = true
AND start_time <= NOW()
AND (end_time IS NULL OR end_time >= NOW());
```

### Deactivate Announcement
```sql
UPDATE announcements
SET is_active = false
WHERE title LIKE '%Baby Malik%';
```

---

## 🎨 Future Enhancements

This system can be extended for:
- ✅ System maintenance notifications
- ✅ New feature announcements
- ✅ Holiday greetings
- ✅ Important company updates
- ✅ Time-sensitive alerts

Just use the same API endpoint with different announcement types and schedules!

---

## 📞 Support

If you encounter issues:
1. Check this troubleshooting guide
2. Run the test script: `npm run announcement:test:railway`
3. Check Railway logs for backend errors
4. Check browser console for frontend errors

**Common Files:**
- Backend: `server/index.ts` (lines 793-863)
- Frontend: `App.tsx` (lines 104-149)
- Toast Component: `components/ui/toast.tsx`
- Database Schema: `database/schema.sql` (lines 290-308)
