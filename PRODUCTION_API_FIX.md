# Production API URL Fix - CORS Issue Resolved

## Problem
The frontend was hardcoded to connect to `http://localhost:3001` even when running in production on Railway, causing CORS errors:

```
Access to fetch at 'http://localhost:3001/api/health' from origin 'https://sa21.up.railway.app' has been blocked by CORS policy
```

## Root Cause
- API URL was defined in multiple service files with inconsistent logic
- Build-time environment variables were baking `localhost:3001` into production builds
- No centralized configuration for API URL detection

## Solution Implemented

### 1. Created Centralized Configuration Service
**File:** `/services/config.ts`

- Centralized API URL detection logic
- Runtime environment detection (NOT build-time)
- Works automatically for any deployment (Railway, Vercel, localhost, etc.)

**Logic:**
```typescript
export function getApiBaseUrl(): string {
  // ALWAYS do runtime detection first
  const isLocalhost = window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1';

  if (isLocalhost) {
    return 'http://localhost:3001/api';
  }

  // Production: use same origin (works for Railway, Vercel, etc.)
  return `${window.location.origin}/api`;
}
```

### 2. Updated All Service Files
Updated three service files to use centralized config:

1. **`/services/databaseService.ts`**
   - Removed duplicate API URL logic
   - Now imports `getApiBaseUrl()` from config

2. **`/services/activityService.ts`**
   - Removed inline API URL detection
   - Now imports `API_BASE_URL` from config

3. **`/services/emailNotificationService.ts`**
   - Removed inline API URL detection
   - Now imports `API_BASE_URL` from config

## How It Works

### Development (localhost)
```
Hostname: localhost or 127.0.0.1
API URL: http://localhost:3001/api
```

### Production (Railway)
```
Hostname: sa21.up.railway.app
Origin: https://sa21.up.railway.app
API URL: https://sa21.up.railway.app/api
```

The detection happens **at runtime** in the browser, so the same build works everywhere!

## Testing

### Local Testing
1. Build: `npm run build`
2. Preview: `npm run preview`
3. Open: `http://localhost:4173`
4. Check console: Should see `[Config] 🔧 Development mode detected`

### Production Testing
1. Deploy to Railway
2. Open: `https://sa21.up.railway.app`
3. Check console: Should see `[Config] 🚀 Production mode detected`
4. Check API URL: Should be `https://sa21.up.railway.app/api`

## Benefits

✅ **Auto-detection** - No manual configuration needed
✅ **DRY Principle** - Single source of truth for API URL
✅ **Runtime Detection** - Same build works in dev and prod
✅ **Platform Agnostic** - Works on Railway, Vercel, Netlify, etc.
✅ **Debug Logging** - Console shows detected environment
✅ **Type Safety** - Full TypeScript support

## Files Changed

1. **NEW:** `services/config.ts` - Centralized configuration
2. **UPDATED:** `services/databaseService.ts` - Now uses config
3. **UPDATED:** `services/activityService.ts` - Now uses config
4. **UPDATED:** `services/emailNotificationService.ts` - Now uses config

## Deployment Notes

### Railway Environment Variables
**DO NOT** set `VITE_API_URL` in Railway environment variables!

The runtime detection will automatically use the correct URL:
- Frontend URL: `https://sa21.up.railway.app`
- API URL: `https://sa21.up.railway.app/api`

### Required Railway Setup
The backend must be configured to:
1. Listen on the `PORT` environment variable (Railway provides this)
2. Serve the frontend static files from `/dist`
3. Handle API routes at `/api/*`

This is already configured in your `server/index.ts`.

## Console Output Examples

### Development
```
[Config] 🔧 Development mode detected
[Config] API URL: http://localhost:3001/api
[DB] Checking connection to: http://localhost:3001/api/health
```

### Production
```
[Config] 🚀 Production mode detected
[Config] Origin: https://sa21.up.railway.app
[Config] Hostname: sa21.up.railway.app
[Config] Protocol: https:
[Config] API URL: https://sa21.up.railway.app/api
[DB] Checking connection to: https://sa21.up.railway.app/api/health
```

## Verification

After deploying to Railway, verify the fix:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Refresh the page
4. Look for `[Config]` messages
5. Verify API URL matches your Railway domain

## Next Steps

1. Commit these changes
2. Push to GitHub
3. Railway will auto-deploy
4. Test on production URL
5. Verify CORS error is gone

---

**Fix Date:** November 5, 2025
**Fixed By:** Claude Code (Frontend Developer)
**Status:** ✅ Ready for Production
