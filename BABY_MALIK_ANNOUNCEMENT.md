# Baby Malik Announcement System

## Overview
A special one-time toast notification system to celebrate the arrival of baby Malik! 🎉

## Features
- Toast notification appears at exactly 11:11 AM Eastern Time
- Shows for all logged-in users
- Users can dismiss it (won't reappear after dismissal)
- Beautiful gradient celebration design with emoji
- Persists until manually dismissed

## How to Trigger the Announcement

### Option 1: Using the Node.js Script
```bash
node scripts/create-baby-malik-announcement.js
```

### Option 2: Using the Shell Script (via API)
```bash
./scripts/create-announcement-api.sh
```

### Option 3: Manual API Call
```bash
curl -X POST "https://your-api-url.com/api/admin/announcements" \
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
