# Notification System - Developer Guide

## Quick Start

### Adding Notifications to Your Code

#### 1. Import the Messaging Service
```typescript
import { messagingService } from '../services/messagingService';
```

#### 2. Fetch Notifications
```typescript
// Get all notifications (limit 20)
const notifications = await messagingService.getNotifications({ limit: 20 });

// Get unread notifications only
const unreadNotifications = await messagingService.getNotifications({
  limit: 20,
  unreadOnly: true
});

// Get unread count
const count = await messagingService.getUnreadNotificationCount();
```

#### 3. Listen for Real-Time Notifications
```typescript
import { useEffect } from 'react';

useEffect(() => {
  messagingService.connect();

  const unsubscribe = messagingService.onNotification((notification) => {
    console.log('New notification received:', notification);
    // Update your UI here
  });

  return () => {
    unsubscribe();
  };
}, []);
```

#### 4. Mark Notifications as Read
```typescript
// Mark all as read
await messagingService.markAllNotificationsRead();
```

## Creating Notifications (Backend)

### Method 1: Direct Database Insert
```typescript
import pg from 'pg';

const pool = new pg.Pool({
  // your connection config
});

// Create notification
await pool.query(
  `INSERT INTO team_notifications (user_id, type, message_id, conversation_id, title, body, data)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   RETURNING *`,
  [
    userId,
    'system', // or 'mention', 'direct_message', 'shared_content'
    messageId, // optional
    conversationId, // optional
    'Notification Title',
    'Notification body text',
    JSON.stringify({ custom: 'data' })
  ]
);
```

### Method 2: Via Database Trigger
Mention notifications are created automatically via trigger:
```sql
-- When a message_mention is inserted, notification is created automatically
INSERT INTO message_mentions (message_id, mentioned_user_id)
VALUES ($1, $2);
-- Notification created via trigger!
```

### Method 3: Via Messaging API
```typescript
// Send a message with mentions
await messagingService.sendMessage(conversationId, {
  type: 'text',
  text: 'Hey @john, check this out!',
  mentioned_users: [johnUserId]
});
// Notifications created automatically!
```

## Emitting Real-Time Notifications

### From Backend (Express Route)
```typescript
import { getPresenceService } from '../services/presenceService';

// After creating notification in database
const notificationResult = await pool.query(
  'INSERT INTO team_notifications (...) RETURNING *',
  [...]
);

const notification = notificationResult.rows[0];

// Emit to user via WebSocket
const presenceService = getPresenceService();
if (presenceService) {
  presenceService.emitNotification(userId, notification);
}
```

## Notification Types Reference

### Type: 'mention'
**When**: User is @mentioned in a message
**Title**: "{Sender} mentioned you"
**Body**: "in {Conversation Name}"
**Icon**: Red @ symbol
**Created by**: Database trigger on `message_mentions` insert

### Type: 'direct_message'
**When**: Direct message sent to user
**Title**: Sender's name
**Body**: Message preview (first 100 chars)
**Icon**: Blue message square
**Created by**: Messaging routes on direct conversation message

### Type: 'shared_content'
**When**: AI content shared with user
**Title**: "{Sender} shared content"
**Body**: "Shared a Susan AI conversation" or "Shared a generated email"
**Icon**: Purple share icon
**Created by**: Custom implementation (add as needed)

### Type: 'system'
**When**: Admin or system event
**Title**: Custom
**Body**: Custom
**Icon**: Orange alert circle
**Created by**: Custom implementation

## Database Schema Reference

```sql
CREATE TABLE team_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (
    type IN ('mention', 'direct_message', 'shared_content', 'system')
  ),
  message_id UUID REFERENCES team_messages(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB, -- Additional payload
  is_read BOOLEAN DEFAULT FALSE,
  is_pushed BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_team_notifications_user ON team_notifications(user_id, created_at DESC);
CREATE INDEX idx_team_notifications_unread ON team_notifications(user_id, is_read) WHERE is_read = FALSE;
```

## API Endpoints Reference

### GET /api/messages/notifications
**Purpose**: Fetch user's notifications
**Headers**: `x-user-email: user@example.com`
**Query Params**:
- `limit` (number, optional, default: 50)
- `unread_only` (boolean, optional, default: false)

**Response**:
```json
{
  "success": true,
  "notifications": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "type": "mention",
      "message_id": "uuid",
      "conversation_id": "uuid",
      "title": "John mentioned you",
      "body": "in Sales Team",
      "data": { "sender_id": "uuid" },
      "is_read": false,
      "read_at": null,
      "created_at": "2025-01-28T12:00:00Z"
    }
  ],
  "unread_count": 5
}
```

### POST /api/messages/notifications/mark-all-read
**Purpose**: Mark all notifications as read
**Headers**: `x-user-email: user@example.com`

**Response**:
```json
{
  "success": true
}
```

## WebSocket Events Reference

### Client → Server Events
```typescript
// Connect (automatic when messagingService.connect() called)
socket.connect();

// Heartbeat (automatic every 15s)
socket.emit('presence:heartbeat');
```

### Server → Client Events
```typescript
// New notification
socket.on('notification:new', (notification) => {
  console.log('New notification:', notification);
});

// Message notification (for badge updates)
socket.on('message:notification', (data) => {
  console.log('Message notification:', data);
  // { conversationId, messageId, senderId }
});
```

## Component Reference

### NotificationBell
**Location**: `/Users/a21/gemini-field-assistant/components/NotificationBell.tsx`

**Usage**:
```tsx
import NotificationBell from './NotificationBell';

function MyHeader() {
  return (
    <header>
      <NotificationBell />
    </header>
  );
}
```

**Props**: None (self-contained)

### NotificationsPanel
**Location**: `/Users/a21/gemini-field-assistant/components/NotificationsPanel.tsx`

**Usage**:
```tsx
import NotificationsPanel from './NotificationsPanel';

function MyComponent() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  return (
    <NotificationsPanel
      notifications={notifications}
      loading={loading}
      unreadCount={unreadCount}
      onClose={() => {}}
      onMarkAllRead={() => {}}
      onRefresh={() => {}}
    />
  );
}
```

**Props**:
- `notifications` (Notification[]) - Array of notification objects
- `loading` (boolean) - Loading state
- `unreadCount` (number) - Count of unread notifications
- `onClose` (function) - Called when close button clicked
- `onMarkAllRead` (function) - Called when mark all read clicked
- `onRefresh` (function) - Called when refresh button clicked

## Testing

### Unit Test Example
```typescript
import { messagingService } from '../services/messagingService';

describe('Notifications', () => {
  it('fetches notifications', async () => {
    const notifications = await messagingService.getNotifications();
    expect(notifications).toBeInstanceOf(Array);
  });

  it('gets unread count', async () => {
    const count = await messagingService.getUnreadNotificationCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('marks all as read', async () => {
    const success = await messagingService.markAllNotificationsRead();
    expect(success).toBe(true);
  });
});
```

### Integration Test Example
```bash
# Test notification endpoints
curl -X GET "http://localhost:3001/api/messages/notifications?limit=10" \
  -H "x-user-email: test@example.com"

# Mark all as read
curl -X POST "http://localhost:3001/api/messages/notifications/mark-all-read" \
  -H "x-user-email: test@example.com"
```

## Debugging

### Enable WebSocket Debugging
```typescript
// In browser console
localStorage.debug = 'socket.io-client:*';
location.reload();
```

### Check Notification Creation
```sql
-- Check recent notifications
SELECT * FROM team_notifications
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 10;

-- Check unread count
SELECT COUNT(*) FROM team_notifications
WHERE user_id = 'YOUR_USER_ID'
AND is_read = false;
```

### Check WebSocket Connection
```typescript
// In browser console
console.log(messagingService.getConnectionStatus());
// Should return: true
```

## Common Issues & Solutions

### Issue: Notifications not appearing
**Solution**:
1. Check WebSocket connection: `messagingService.getConnectionStatus()`
2. Verify user is logged in: `authService.getCurrentUser()`
3. Check browser console for errors
4. Verify notification was created in database

### Issue: Badge not updating
**Solution**:
1. Ensure `onNotification` listener is registered
2. Check WebSocket events in Network tab
3. Verify `emitNotification` is called on backend
4. Check for JavaScript errors

### Issue: Mark as read not working
**Solution**:
1. Verify user authentication header
2. Check API response for errors
3. Verify database permissions
4. Check for transaction rollbacks

## Best Practices

### 1. Always Use Transactions
```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // Create message
  // Create notification
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

### 2. Don't Notify Self
```typescript
if (mentionedUserId === currentUserId) {
  continue; // Skip self-mention
}
```

### 3. Emit WebSocket After Database
```typescript
// 1. Create notification in database
const notification = await createNotification();

// 2. Then emit via WebSocket
presenceService.emitNotification(userId, notification);
```

### 4. Handle Multiple Devices
```typescript
// PresenceService automatically handles multiple connections
// Just emit once - it will reach all user's devices
presenceService.emitNotification(userId, notification);
```

### 5. Validate User IDs
```typescript
// Always validate user IDs exist before creating notifications
const userExists = await pool.query(
  'SELECT id FROM users WHERE id = $1',
  [userId]
);

if (userExists.rows.length === 0) {
  throw new Error('User not found');
}
```

## Performance Tips

1. **Use Indexes**: Notifications table has indexes on `user_id`, `is_read`
2. **Limit Results**: Always use `LIMIT` in queries
3. **Paginate**: Implement pagination for large notification lists
4. **Clean Old Notifications**: Consider archiving notifications older than 30 days
5. **Optimize WebSocket**: Only emit to active connections

## Security Considerations

1. **Authentication**: Always verify user authentication
2. **Authorization**: Users can only see their own notifications
3. **SQL Injection**: Use parameterized queries
4. **XSS Prevention**: Sanitize notification content
5. **Rate Limiting**: Consider rate limiting notification creation

---

**Need Help?**
- Check: `/Users/a21/gemini-field-assistant/NOTIFICATION_SYSTEM_IMPLEMENTATION.md`
- Flow Diagram: `/Users/a21/gemini-field-assistant/NOTIFICATION_FLOW_DIAGRAM.md`
- User Guide: `/Users/a21/gemini-field-assistant/NOTIFICATIONS_USER_GUIDE.md`
