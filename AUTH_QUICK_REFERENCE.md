# Authentication System - Quick Reference

## Quick Start

### For Development Testing

1. **Start the app**:
   ```bash
   npm run dev
   ```

2. **Quick Login** (bypass code):
   - Enter any email
   - Click "Show Quick Login (Dev)"
   - Click "Quick Login (Skip Code)"
   - Done!

3. **Full Login Flow**:
   - Enter email → Click "Continue"
   - Check browser console for code
   - Code is auto-filled (MVP convenience)
   - Click "Login"
   - Done!

---

## File Locations

| File | Path | Purpose |
|------|------|---------|
| Auth Service | `/services/authService.ts` | Authentication logic |
| Database Service | `/services/databaseService.ts` | Database operations |
| Login Page | `/components/LoginPage.tsx` | Login UI |
| User Profile | `/components/UserProfile.tsx` | Profile UI |
| Main App | `/App.tsx` | App integration |

---

## Key Functions

### authService

```typescript
// Check if logged in
authService.isAuthenticated()

// Get current user
const user = authService.getCurrentUser()

// Request login code
await authService.requestLoginCode('email@roofer.com')

// Verify code
await authService.verifyLoginCode('email@roofer.com', '123456', 'John')

// Quick login (dev)
await authService.quickLogin('email@roofer.com', 'John')

// Update profile
await authService.updateUserProfile({ name: 'New Name', state: 'VA' })

// Logout
authService.logout()
```

### databaseService

```typescript
// Get current user
const user = await databaseService.getCurrentUser()

// Update user
await databaseService.updateUser(userId, { name: 'New Name' })

// Get preferences
const prefs = await databaseService.getUserPreferences(userId)

// Update preferences
await databaseService.updateUserPreferences(userId, prefs)
```

---

## User Object Structure

```typescript
interface AuthUser {
  id: string                              // UUID
  email: string                           // user@roofer.com
  name: string                            // John Smith
  role: 'sales_rep' | 'manager' | 'admin' // User role
  state: 'VA' | 'MD' | 'PA' | null       // Primary state
  created_at: Date                        // Account creation
  last_login_at: Date                     // Last login time
}
```

---

## Session Management

| Feature | Duration | Storage |
|---------|----------|---------|
| Login session | 30 days | localStorage |
| Verification code | 10 minutes | sessionStorage |
| User data | Persistent | localStorage |

---

## Console Commands for Testing

Open browser console and run:

```javascript
// Check if authenticated
authService.isAuthenticated()

// Get current user
authService.getCurrentUser()

// Quick login
await authService.quickLogin('john@roofer.com', 'John Smith')

// Update profile
await authService.updateUserProfile({ state: 'VA' })

// Logout
authService.logout()
```

---

## Component Props

### LoginPage
```typescript
<LoginPage
  onLoginSuccess={() => void}
/>
```

### UserProfile
```typescript
<UserProfile
  onClose={() => void}
  onLogout={() => void}
/>
```

---

## Styling Variables

All components use these CSS variables:

```css
--roof-red: #c41e3a           /* Primary brand color */
--bg-primary: #0a0a0a         /* Main background */
--bg-elevated: #1a1a1a        /* Elevated surfaces */
--text-primary: #ffffff       /* Primary text */
--text-secondary: #e0e0e0     /* Secondary text */
--border-subtle: #2a2a2a      /* Subtle borders */
```

---

## Mobile Touch Targets

All interactive elements meet iOS guidelines:

- **Buttons**: 50px minimum height
- **Inputs**: 50px minimum height
- **Touch targets**: 44px minimum
- **Font size**: 16px+ (prevents zoom)

---

## Error Handling

Common error messages:

```
"Please enter a valid email address"
"Verification code expired. Please request a new one."
"Invalid verification code. Please try again."
"Failed to update profile. Please try again."
"An error occurred. Please try again."
```

---

## Production Checklist

Before deploying to production:

- [ ] Add email service (SendGrid/AWS SES)
- [ ] Create backend API endpoints
- [ ] Connect to PostgreSQL database
- [ ] Enable HTTPS only
- [ ] Add rate limiting
- [ ] Remove quick login feature
- [ ] Add monitoring/logging
- [ ] Test with real emails
- [ ] Security audit

---

## Common Tasks

### Add a new user manually
```javascript
await authService.quickLogin('newuser@roofer.com', 'New User')
```

### Reset authentication
```javascript
localStorage.clear()
sessionStorage.clear()
window.location.reload()
```

### Check all stored users (dev)
```javascript
JSON.parse(localStorage.getItem('s21_all_users') || '[]')
```

### Check current session
```javascript
localStorage.getItem('s21_session_id')
```

---

## Troubleshooting

### User not staying logged in
- Check browser localStorage is enabled
- Verify 30-day session hasn't expired
- Check console for errors

### Verification code not working
- Code expires after 10 minutes
- Check console for the code
- Try requesting a new code

### Profile not updating
- Check user is authenticated
- Verify updates are being saved
- Check localStorage for current_user

---

## Support

For issues or questions:
1. Check browser console for errors
2. Verify localStorage is enabled
3. Test in incognito mode
4. Clear cache and reload

---

## Build and Deploy

```bash
# Development
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

---

**Authentication system is ready to use!** 🎉
