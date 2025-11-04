# Admin Panel Guide

## Overview

The Admin Panel provides a comprehensive interface for administrators to monitor and review all user conversations within the S21 Field AI system. This powerful tool enables admins to:

- View all users and their activity statistics
- Browse conversations organized by user and date
- Read full conversation histories
- Export conversations for record-keeping
- Filter and search through users and conversations

## Features

### 1. User Management
- **User List**: View all users with their roles, states, and message counts
- **Activity Stats**: See total messages and last active time for each user
- **Search**: Filter users by name or email
- **Role Filter**: Filter by role (admin, manager, sales_rep)
- **Date Range**: Filter users by last active date

### 2. Conversation Tracking
- **Conversation List**: View all conversations for a selected user
- **Chronological Order**: Conversations sorted by date (newest first)
- **Message Preview**: See the first message of each conversation
- **Message Count**: View how many messages are in each conversation
- **Timestamps**: See when conversations started and last updated

### 3. Message Viewer
- **Full Conversation**: Read complete conversation histories
- **Message Details**: View sender, content, timestamps, and AI provider used
- **Visual Distinction**: User messages and bot responses are clearly differentiated
- **Export Function**: Download conversations as text files

### 4. Advanced Filtering
- **Search Users**: Find users by name or email
- **Filter by Role**: View only admins, managers, or sales reps
- **Date Range**: Filter by last active date
- **Real-time Stats**: See filtered user counts

## Access Requirements

### Admin Role Required
Only users with the `admin` role can access the Admin Panel. The panel:
- Automatically checks user permissions
- Shows "Access Denied" message for non-admin users
- Only displays the "Admin Panel" navigation item to admin users

## How to Mark a User as Admin

### Method 1: Using NPM Scripts (Recommended)

#### Local Development:
```bash
# List all users first
npm run admin:list-users

# Promote a user to admin
npm run admin:set-admin user@example.com
```

#### Railway Production:
```bash
# List all users
npm run admin:list-users:railway

# Promote a user to admin
npm run admin:set-admin:railway user@example.com
```

### Method 2: Direct Script Execution

#### Local:
```bash
node scripts/list-users.js
node scripts/set-user-admin.js user@example.com
```

#### Railway:
```bash
railway run node scripts/list-users.js
railway run node scripts/set-user-admin.js user@example.com
```

### Method 3: Direct Database Update

Connect to your PostgreSQL database and run:

```sql
-- Update a specific user to admin
UPDATE users
SET role = 'admin', updated_at = CURRENT_TIMESTAMP
WHERE email = 'user@example.com';

-- Verify the change
SELECT email, name, role FROM users WHERE email = 'user@example.com';
```

### Method 4: Using Railway CLI

```bash
# Connect to Railway database
railway connect postgres

# Run SQL command
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
```

## Accessing the Admin Panel

### Step 1: Log In
- Log in with an account that has admin privileges
- The system will load your user profile on authentication

### Step 2: Navigate to Admin Panel
- Look for the "Admin Panel" item in the sidebar (visible only to admins)
- Click on it to open the admin interface
- The panel has a shield icon for easy identification

### Step 3: Browse Users
- The left panel shows all users in the system
- Use search and filters to find specific users
- Click on a user to view their conversations

### Step 4: View Conversations
- The middle panel displays all conversations for the selected user
- Conversations are sorted by date (newest first)
- Click on a conversation to view full message history

### Step 5: Read Messages
- The right panel shows the complete conversation
- Messages are displayed chronologically
- User messages appear on the right, bot messages on the left
- Each message shows timestamp and AI provider used

### Step 6: Export (Optional)
- Click the "Export" button to download a conversation
- The conversation is saved as a text file with timestamps
- File format: `conversation-[session-id]-[date].txt`

## User Interface

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│  Header: Admin Panel                           [Export]     │
├───────────────┬──────────────────┬────────────────────────── │
│               │                  │                           │
│  User List    │  Conversations   │  Messages                 │
│               │                  │                           │
│  - Search     │  Session 1       │  [User] Hello...          │
│  - Filters    │  Session 2       │  [AI] How can I help?     │
│  - User 1     │  Session 3       │  [User] I need...         │
│  - User 2     │                  │  [AI] Sure, let me...     │
│  - User 3     │                  │                           │
│               │                  │                           │
└───────────────┴──────────────────┴───────────────────────────┘
```

### Color Coding
- **User Messages**: Blue background (`var(--user-bg)`)
- **Bot Messages**: Dark background (`var(--bg-card)`)
- **Admin Badge**: Red background (`var(--roof-red)`)
- **Active Selection**: Elevated background (`var(--bg-elevated)`)

### Icons
- **Users Panel**: Users icon
- **Conversations Panel**: MessageSquare icon
- **Messages**: User avatar (U) or AI avatar (AI)
- **Timestamps**: Clock icon
- **Export**: Download icon
- **Refresh**: RefreshCw icon

## Database Tables Used

The admin panel queries the following tables:

### 1. users
```sql
- id (UUID)
- email (VARCHAR)
- name (VARCHAR)
- role (VARCHAR) -- sales_rep, manager, admin
- state (VARCHAR)
- created_at (TIMESTAMP)
- last_login_at (TIMESTAMP)
```

### 2. chat_history
```sql
- id (UUID)
- user_id (UUID, references users)
- message_id (VARCHAR)
- sender (VARCHAR) -- 'user' or 'bot'
- content (TEXT)
- state (VARCHAR)
- provider (VARCHAR)
- sources (JSONB)
- created_at (TIMESTAMP)
- session_id (UUID)
```

## API Endpoints

### GET /api/admin/users
Returns all users with conversation statistics.

**Response:**
```json
[
  {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "sales_rep",
    "state": "MD",
    "total_messages": 42,
    "last_active": "2025-11-03T12:00:00Z"
  }
]
```

### GET /api/admin/conversations?userId={uuid}
Returns all conversations for a specific user.

**Response:**
```json
[
  {
    "session_id": "uuid",
    "message_count": 10,
    "first_message_at": "2025-11-03T10:00:00Z",
    "last_message_at": "2025-11-03T11:00:00Z",
    "preview": "Hello, I need help with..."
  }
]
```

### GET /api/admin/conversations/{sessionId}?userId={uuid}
Returns all messages in a specific conversation.

**Response:**
```json
[
  {
    "id": "uuid",
    "message_id": "msg-123",
    "sender": "user",
    "content": "Hello, I need help",
    "state": "MD",
    "provider": "gemini",
    "sources": null,
    "created_at": "2025-11-03T10:00:00Z"
  }
]
```

### PATCH /api/admin/users/{userId}/role
Updates a user's role (admin only).

**Request Body:**
```json
{
  "role": "admin"
}
```

## Security Considerations

### Frontend Protection
- Admin Panel component checks user role before rendering
- "Access Denied" message shown to non-admin users
- Admin navigation item only visible to admin users

### Backend Protection
- All admin endpoints should have authentication middleware (to be added in production)
- Role verification on each request
- User ID validation to prevent unauthorized access

### Recommended Production Enhancements
1. Add JWT-based authentication middleware
2. Implement rate limiting on admin endpoints
3. Add audit logging for admin actions
4. Implement IP whitelisting for admin access
5. Add two-factor authentication for admin accounts

## Troubleshooting

### Admin Panel Not Visible
1. Verify user has admin role:
   ```bash
   npm run admin:list-users
   ```
2. Log out and log back in to refresh user session
3. Check browser console for errors
4. Clear localStorage and log in again

### Cannot See Conversations
1. Verify user has chat_history records in database
2. Check that session_id is not null in chat_history
3. Verify database connection in server logs
4. Check API endpoint responses in Network tab

### Export Not Working
1. Check browser's download settings
2. Verify pop-up blocker settings
3. Ensure conversation has messages
4. Check browser console for JavaScript errors

### Permission Errors
1. Verify database user has SELECT permissions
2. Check server error logs for SQL errors
3. Verify API endpoints are accessible
4. Check CORS settings if accessing from different domain

## Best Practices

### For Admins
1. **Regular Monitoring**: Review user conversations periodically
2. **Privacy**: Only access conversations when necessary
3. **Export Wisely**: Only export conversations needed for support or compliance
4. **User Privacy**: Treat all conversation data as confidential
5. **Role Management**: Only promote trusted users to admin

### For Developers
1. **Add Auth Middleware**: Implement proper authentication in production
2. **Audit Logging**: Log all admin actions for accountability
3. **Rate Limiting**: Prevent abuse of admin endpoints
4. **Data Encryption**: Encrypt exported conversation files
5. **Regular Backups**: Ensure conversation data is backed up

## Future Enhancements

Potential features for future versions:

1. **Advanced Search**: Full-text search across all conversations
2. **Analytics Dashboard**: Visualize user activity and engagement metrics
3. **Bulk Export**: Export multiple conversations at once
4. **User Insights**: Show detailed analytics per user
5. **Conversation Tagging**: Add tags/labels to conversations
6. **Notes**: Add admin notes to users or conversations
7. **Activity Timeline**: Visual timeline of user interactions
8. **Real-time Updates**: Auto-refresh when new messages arrive
9. **Message Filtering**: Filter messages by date, provider, or content
10. **User Suspension**: Ability to deactivate user accounts

## Support

For issues or questions:
- Check this guide first
- Review server logs for errors
- Check database connection
- Contact system administrator

---

**Last Updated**: November 3, 2025
**Version**: 1.0.0
