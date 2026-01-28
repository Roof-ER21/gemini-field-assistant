# Notification System Implementation

## Overview

The notification system has been fully implemented for the Gemini Field Assistant app. Users can now receive real-time notifications for:
- Direct messages
- @Mentions in conversations
- Shared AI content (Susan chats and emails)
- System notifications

## Components Created

### 1. NotificationBell Component
**Location**: `/Users/a21/gemini-field-assistant/components/NotificationBell.tsx`

**Features**:
- Bell icon with animated unread badge
- Real-time notification count updates
- Click to open notifications panel
- Auto-refresh every 60 seconds
- WebSocket-based real-time updates

**Integration**:
- Added to Sidebar (desktop)
- Added to MobileHeader (mobile)

### 2. NotificationsPanel Component
**Location**: `/Users/a21/gemini-field-assistant/components/NotificationsPanel.tsx`

**Features**:
- Dropdown panel displaying list of notifications
- Different icons for notification types:
  - 🔔 Direct Message (blue)
  - @ Mention (red)
  - 📤 Shared Content (purple)
  - ⚠️ System (orange)
- Mark all as read button
- Refresh button
- Unread count badge
- Time ago formatting (e.g., "5m ago", "2h ago")
- Visual distinction for unread notifications

## Backend Implementation

### Database Schema
**Migration**: `008_messaging_and_presence.sql`

**Tables**:
1. `team_notifications` - Stores all notifications
   - `id` - UUID primary key
   - `user_id` - Recipient user ID
   - `type` - 'mention', 'direct_message', 'shared_content', 'system'
   - `message_id` - Reference to source message
   - `conversation_id` - Reference to conversation
   - `title` - Notification title
   - `body` - Notification body text
   - `data` - JSONB for additional payload
   - `is_read` - Boolean read status
   - `read_at` - Timestamp when marked read
   - `created_at` - Creation timestamp

**Triggers**:
- `create_mention_notifications()` - Automatically creates notifications when @mentions are inserted

### API Endpoints

#### GET /api/messages/notifications
**Purpose**: Get user's notifications
**Query Params**:
- `limit` (optional, default: 50) - Number of notifications to return
- `unread_only` (optional, boolean) - Filter to unread only

**Response**:
```json
{
  "success": true,
  "notifications": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "type": "mention",
      "title": "John mentioned you",
      "body": "in Team Discussion",
      "is_read": false,
      "created_at": "2025-01-28T12:00:00Z"
    }
  ],
  "unread_count": 5
}
```

#### POST /api/messages/notifications/mark-all-read
**Purpose**: Mark all notifications as read
**Response**:
```json
{
  "success": true
}
```

### WebSocket Events

#### Server → Client Events

**notification:new**
Emitted when a new notification is created
```javascript
socket.on('notification:new', (notification) => {
  // notification object contains full notification data
});
```

**message:notification**
Emitted when a new message arrives (for badge updates)
```javascript
socket.on('message:notification', (data) => {
  // data: { conversationId, messageId, senderId }
});
```

### Services

#### MessagingService Updates
**Location**: `/Users/a21/gemini-field-assistant/services/messagingService.ts`

**New Methods**:
- `getNotifications(options?)` - Fetch notifications
- `getUnreadNotificationCount()` - Get count of unread notifications
- `markAllNotificationsRead()` - Mark all as read
- `onNotification(callback)` - Subscribe to real-time notification events

**Example Usage**:
```typescript
import { messagingService } from '../services/messagingService';

// Fetch notifications
const notifications = await messagingService.getNotifications({ limit: 20 });

// Get unread count
const unreadCount = await messagingService.getUnreadNotificationCount();

// Listen for real-time notifications
const unsubscribe = messagingService.onNotification((notification) => {
  console.log('New notification:', notification);
});

// Mark all as read
await messagingService.markAllNotificationsRead();
```

#### PresenceService Updates
**Location**: `/Users/a21/gemini-field-assistant/server/services/presenceService.ts`

**New Method**:
- `emitNotification(userId, notification)` - Send notification to specific user via WebSocket

## Notification Types

### 1. Direct Messages
**Trigger**: When a message is sent in a direct (1-on-1) conversation
**Notification**:
- Title: Sender's name
- Body: Message preview (first 100 chars)
- Type: `direct_message`

### 2. @Mentions
**Trigger**: When a user is mentioned using @username in any message
**Notification**:
- Title: "{Sender} mentioned you"
- Body: "in {Conversation Name}"
- Type: `mention`
- Created automatically via database trigger

### 3. Shared Content
**Trigger**: When AI content (Susan chat or email) is shared
**Notification**:
- Title: "{Sender} shared content"
- Body: "Shared a Susan AI conversation" or "Shared a generated email"
- Type: `shared_content`

### 4. System Notifications
**Trigger**: Admin or system events
**Type**: `system`

## Real-Time Updates

The notification system uses WebSocket for real-time updates:

1. **User connects** → WebSocket connection established
2. **Message sent** → Notification created in database
3. **Notification emitted** → Via `presenceService.emitNotification()`
4. **Client receives** → Via `messagingService.onNotification()` listener
5. **UI updates** → Badge count increments, notification appears in list

## User Interface

### Desktop (Sidebar)
- Bell icon in top-right corner of sidebar
- Red badge with unread count
- Pulsing animation on new notifications
- Click opens dropdown panel

### Mobile (Header)
- Bell icon next to menu button
- Red badge with unread count
- Click opens dropdown panel
- Panel positioned below header

### Notifications Panel
- Maximum width: 360px
- Maximum height: 600px
- Scrollable list
- Header with title and unread count
- "Mark all as read" button when unread > 0
- Refresh button
- Close button
- Empty state message when no notifications

## Testing

### Manual Testing Steps

1. **Direct Message Notification**:
   ```
   - Login as User A
   - Open Team panel
   - Send message to User B
   - Login as User B (different browser/device)
   - Verify notification appears with bell badge
   - Click bell to view notification
   - Click "Mark all as read"
   - Verify badge disappears
   ```

2. **@Mention Notification**:
   ```
   - Login as User A
   - Create conversation with User B
   - Type message: "Hey @userb can you check this?"
   - Send message
   - Login as User B
   - Verify notification appears
   - Verify notification says "User A mentioned you"
   ```

3. **Real-Time Updates**:
   ```
   - Login as User A and User B (side by side)
   - Send message from User A to User B
   - Verify User B's bell badge updates immediately
   - No page refresh needed
   ```

### Database Query Testing

```sql
-- Check notifications table
SELECT * FROM team_notifications
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC;

-- Check unread count
SELECT COUNT(*) FROM team_notifications
WHERE user_id = 'YOUR_USER_ID'
AND is_read = false;

-- Check mentions
SELECT * FROM message_mentions
WHERE mentioned_user_id = 'YOUR_USER_ID';
```

## Future Enhancements

### Planned Features
1. **Notification Settings**:
   - Per-notification-type toggles
   - Mute specific conversations
   - Quiet hours
   - Email digest options

2. **Push Notifications** (Mobile):
   - Firebase Cloud Messaging integration
   - Background notifications when app closed
   - Sound/vibration settings

3. **Notification Actions**:
   - Click notification → Open conversation
   - Quick reply from notification
   - Archive/dismiss individual notifications

4. **Advanced Filtering**:
   - Filter by type
   - Search notifications
   - Notification history archive

### Code Locations for Future Work

**Notification Settings UI**:
- Add to `UserProfile.tsx` component
- Create `NotificationSettings.tsx` component

**Push Notifications**:
- Update `users` table with `push_token` column (already exists)
- Add Firebase Admin SDK to server
- Create push notification service

**Notification Actions**:
- Update `NotificationsPanel.tsx` to handle click events
- Add navigation to conversation on click

## Troubleshooting

### Notifications not appearing
1. Check WebSocket connection:
   ```javascript
   console.log(messagingService.getConnectionStatus());
   ```

2. Check database:
   ```sql
   SELECT * FROM team_notifications
   WHERE user_id = 'YOUR_USER_ID'
   ORDER BY created_at DESC LIMIT 10;
   ```

3. Check browser console for errors

### Badge count not updating
1. Verify WebSocket listeners are attached
2. Check `onNotification` callback is registered
3. Verify `emitNotification` is called on server

### Notifications not marked as read
1. Check API endpoint response
2. Verify user authentication
3. Check database permissions

## File Summary

### Frontend
- `components/NotificationBell.tsx` - Bell icon with badge
- `components/NotificationsPanel.tsx` - Notification dropdown
- `components/Sidebar.tsx` - Updated with bell
- `components/MobileHeader.tsx` - Updated with bell
- `services/messagingService.ts` - Notification API client

### Backend
- `server/routes/messagingRoutes.ts` - Notification endpoints
- `server/services/presenceService.ts` - WebSocket notification events
- `database/migrations/008_messaging_and_presence.sql` - Database schema

## Deployment Notes

1. Database migration is already applied
2. No environment variables needed
3. WebSocket is already configured
4. Frontend components are auto-imported
5. Real-time updates work out of the box

## Maintenance

### Regular Tasks
- Monitor notification delivery rate
- Check for orphaned notifications
- Optimize notification queries if slow
- Clean up old read notifications (optional)

### Performance Considerations
- Notifications are indexed by `user_id` and `is_read`
- Unread count query is optimized
- WebSocket events are targeted to specific users
- Polling is reduced to 60s with real-time updates

---

**Status**: ✅ Complete and Production Ready
**Last Updated**: January 28, 2026
**Version**: 1.0
