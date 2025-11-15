# 🚨 RAILWAY DEPLOYMENT FIX
## Static Files Returning HTML (Cache Issue)

## Problem
Railway is serving an old cached version of `index.html` that references outdated asset files.

**Symptoms:**
```
Refused to apply style from '.../index-Sg4Yn-Lt.css' because its MIME type ('text/html') is not a supported stylesheet MIME type
Failed to load resource: index-nzSD1UlC.js 404
```

**Root Cause:** Railway cached old build artifacts and didn't update index.html

---

## IMMEDIATE FIX (3 Minutes)

### Option 1: Force Redeploy (Recommended)

**Railway Dashboard:**
1. Go to your Web Service
2. Click **"Deployments"** tab
3. Click **"Redeploy"** on the latest deployment
4. Wait 2-3 minutes for rebuild
5. Hard refresh browser: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)

### Option 2: Trigger New Deployment

**From your local machine:**
```bash
# Make a trivial change to force new deployment
git commit --allow-empty -m "chore: force Railway redeploy"
git push
```

Wait 2-3 minutes for Railway to rebuild.

### Option 3: Clear Railway Build Cache

**Railway Dashboard:**
1. Go to your Web Service
2. Click **"Settings"** tab
3. Scroll to **"Danger Zone"**
4. Click **"Clear Build Cache"**
5. Trigger new deployment (push commit or redeploy)

---

## VERIFICATION

After redeployment:

1. **Hard refresh your browser:** `Ctrl+Shift+R`
2. **Clear browser cache:**
   - Chrome: F12 → Network tab → Right-click → "Clear browser cache"
   - Or: Right-click reload button → "Empty Cache and Hard Reload"

3. **Check console - should see:**
   ```
   ✅ No CSS MIME type errors
   ✅ No 404 errors
   ✅ [Config] 🚀 Production mode detected
   ```

4. **Verify correct files loading:**
   - F12 → Network tab
   - Should see: `index-IK3R_v9K.js` (200 OK)
   - Should see: `index-DzdzvOmg.css` (200 OK)

---

## PREVENT FUTURE ISSUES

Add to `.railwayignore` (if doesn't exist):
```
# Railway ignore file
node_modules/
.git/
.env*
!.env.example
```

Ensure `dist/` and `dist-server/` are NOT in `.railwayignore` so they deploy.

---

## ALTERNATIVE: Check Railway Logs

**Railway Dashboard → Logs tab:**

Look for:
```
✅ dist directory found
✅ index.html found
✅ Static file serving configured for production
```

If you see:
```
⚠️  dist directory NOT found
```

Then the build didn't produce output. Check:
1. Railway is running `npm run build`
2. Build command in `package.json` is correct: `"build": "vite build && npm run server:build"`

---

## Quick Test

After redeploy, test with curl:
```bash
# Should return CSS content (not HTML):
curl -I https://sa21.up.railway.app/assets/index-DzdzvOmg.css

# Should show: Content-Type: text/css
```

If returns `text/html`, Railway still serving old version - try Option 3 (Clear Build Cache).

---

## Summary

**Issue:** Railway cached old index.html with wrong asset hashes
**Fix:** Force redeploy + hard refresh browser
**Prevention:** Ensure dist/ is included in deployments
**Time:** 3-5 minutes total
