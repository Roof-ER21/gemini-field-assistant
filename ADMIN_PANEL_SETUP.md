# Admin Panel - Quick Setup Summary

## Files Created/Modified

### New Files Created:
1. **/Users/a21/Desktop/S21-A24/gemini-field-assistant/components/AdminPanel.tsx**
   - Main admin panel component with user list, conversations, and message viewer
   - Includes search, filtering, and export functionality
   - Access control for admin-only viewing

2. **/Users/a21/Desktop/S21-A24/gemini-field-assistant/scripts/set-user-admin.js**
   - Script to promote users to admin role
   - Usage: `npm run admin:set-admin <email>`

3. **/Users/a21/Desktop/S21-A24/gemini-field-assistant/scripts/list-users.js**
   - Script to list all users with their details
   - Usage: `npm run admin:list-users`

4. **/Users/a21/Desktop/S21-A24/gemini-field-assistant/ADMIN_PANEL_GUIDE.md**
   - Comprehensive guide for using the admin panel
   - Includes troubleshooting, best practices, and API documentation

### Modified Files:
1. **/Users/a21/Desktop/S21-A24/gemini-field-assistant/server/index.ts**
   - Added admin API endpoints:
     - `GET /api/admin/users` - List all users with stats
     - `GET /api/admin/conversations?userId={id}` - Get user conversations
     - `GET /api/admin/conversations/:sessionId?userId={id}` - Get conversation messages
     - `PATCH /api/admin/users/:userId/role` - Update user role

2. **/Users/a21/Desktop/S21-A24/gemini-field-assistant/components/Sidebar.tsx**
   - Added admin role check
   - Added "Admin Panel" navigation item (visible only to admins)
   - Imports authService to check user role

3. **/Users/a21/Desktop/S21-A24/gemini-field-assistant/App.tsx**
   - Added 'admin' to PanelType
   - Imported AdminPanel component
   - Added admin route in renderPanel switch
   - Added 'Admin Panel' to pageTitles

4. **/Users/a21/Desktop/S21-A24/gemini-field-assistant/package.json**
   - Added npm scripts for admin management:
     - `admin:list-users` - List users locally
     - `admin:list-users:railway` - List users on Railway
     - `admin:set-admin` - Set admin locally
     - `admin:set-admin:railway` - Set admin on Railway

## Database Schema

The admin panel uses existing tables:
- **users** - User accounts and roles
- **chat_history** - All chat messages with session grouping

No database changes needed - all tables already exist.

## How to Mark a User as Admin

### Quick Method (Recommended):

```bash
# 1. List all users first
npm run admin:list-users

# 2. Promote a user to admin
npm run admin:set-admin user@example.com
```

### For Railway Production:

```bash
# 1. List all users
npm run admin:list-users:railway

# 2. Promote a user to admin
npm run admin:set-admin:railway user@example.com
```

### Manual Database Method:

```sql
UPDATE users
SET role = 'admin', updated_at = CURRENT_TIMESTAMP
WHERE email = 'user@example.com';
```

## How to Access the Admin Panel

1. **Log in** with an admin account
   - User must have `role = 'admin'` in database
   - You may need to log out and back in after promotion

2. **Look for "Admin Panel"** in the sidebar
   - Only visible to users with admin role
   - Has a shield icon
   - Located at the bottom of the navigation items

3. **Click to open**
   - Panel opens with three-column layout
   - Left: User list
   - Middle: Conversations
   - Right: Messages

## Features Overview

### User List (Left Panel)
- Search by name or email
- Filter by role (admin, manager, sales_rep)
- Filter by date range
- Shows total messages per user
- Click user to view their conversations

### Conversations (Middle Panel)
- Shows all conversations for selected user
- Sorted by date (newest first)
- Shows message count per conversation
- Shows conversation preview
- Click to view full conversation

### Messages (Right Panel)
- Full conversation history
- User messages on right (blue)
- Bot messages on left (dark)
- Shows timestamps and AI provider
- Export button to download conversation

## Testing the Admin Panel

1. **Create a test user**:
   ```bash
   # Log into the app with a test email
   # Example: test@example.com
   ```

2. **Promote to admin**:
   ```bash
   npm run admin:set-admin test@example.com
   ```

3. **Log out and back in**:
   - Close browser or clear localStorage
   - Log in again with test@example.com

4. **Verify access**:
   - Check if "Admin Panel" appears in sidebar
   - Click it to open the panel
   - You should see list of all users

5. **Test features**:
   - Search for users
   - Filter by role
   - Click on a user with conversations
   - View conversation messages
   - Export a conversation

## Available Roles

The system supports three roles:
- **sales_rep** - Standard user (default)
- **manager** - Manager level (future use)
- **admin** - Full admin access (can access Admin Panel)

## Security Notes

### Current Implementation:
- Frontend role check in AdminPanel component
- Shows "Access Denied" for non-admins
- Admin navigation only visible to admins

### Production Recommendations:
1. Add authentication middleware to API endpoints
2. Implement JWT token verification
3. Add rate limiting on admin endpoints
4. Log all admin actions
5. Add IP whitelisting for admin access

## Troubleshooting

### "Admin Panel" not showing in sidebar
- Check user role: `npm run admin:list-users`
- Log out and log back in
- Clear browser cache/localStorage

### "Access Denied" message
- User role is not 'admin'
- Run: `npm run admin:set-admin <email>`
- Log out and back in

### No conversations showing
- User hasn't used chat feature yet
- Check chat_history table has records
- Verify session_id is not null

### Export not working
- Check browser download settings
- Disable pop-up blocker
- Verify messages exist in conversation

## Next Steps

1. **Promote your first admin**:
   ```bash
   npm run admin:list-users
   npm run admin:set-admin your@email.com
   ```

2. **Test the panel**:
   - Log in as admin
   - Navigate to Admin Panel
   - Browse users and conversations

3. **Review the guide**:
   - Read ADMIN_PANEL_GUIDE.md for full documentation
   - Understand security considerations
   - Plan for production enhancements

## Support

For detailed information, see:
- **ADMIN_PANEL_GUIDE.md** - Comprehensive guide
- **Database schema** - /database/schema.sql
- **API endpoints** - /server/index.ts (lines 477-600)

---

**Setup completed**: November 3, 2025
**Ready to use**: Yes
**Database changes**: None (uses existing tables)
