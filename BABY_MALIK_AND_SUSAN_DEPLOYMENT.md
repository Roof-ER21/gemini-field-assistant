# 🚀 Deployment Guide
## Baby Malik Announcement + Susan Chat Verification

This guide covers deploying the Baby Malik celebration announcement and verifying Susan (S21) chat is working.

---

## Part 1: Deploy Baby Malik Announcement 🎉

### ⚡ Quick Deploy (1 Command)

**On your local machine with Railway CLI:**

```bash
npm run announcement:trigger-now:railway
```

### 🗄️ Alternative: Railway Dashboard SQL

1. Go to **Railway Dashboard**
2. Open your **PostgreSQL** service
3. Click **Query** tab
4. Run this SQL:

```sql
-- Check if exists
SELECT id, title, start_time, is_active
FROM announcements
WHERE title LIKE '%Baby Malik%';

-- If exists, trigger NOW:
UPDATE announcements
SET start_time = NOW(), is_active = true
WHERE title LIKE '%Baby Malik%';

-- If doesn't exist, create:
INSERT INTO announcements (title, message, type, start_time, is_active)
VALUES (
  '🎉 Welcome Baby Malik! 🎉',
  'Congratulations on the arrival of baby Malik born 11/11/25! This is a special moment worth celebrating. 💙',
  'celebration',
  NOW(),
  true
);

-- Verify:
SELECT * FROM announcements WHERE title LIKE '%Baby Malik%';
```

### ✅ Verify Announcement is Live

```bash
curl https://your-app.railway.app/api/announcements/active
```

**Expected Response:**
```json
[
  {
    "id": "...",
    "title": "🎉 Welcome Baby Malik! 🎉",
    "message": "Congratulations on the arrival of baby Malik born 11/11/25! ...",
    "type": "celebration",
    "start_time": "2025-11-12T...",
    "is_active": true
  }
]
```

**User Experience:**
- All logged-in users see toast within 30 seconds
- Toast appears in top-right corner
- Beautiful gradient background (purple → pink → red)
- Users can dismiss (won't reappear)

---

## Part 2: Verify Susan (S21) Chat is Working 💬

### Test Susan Chat System

**Local test:**
```bash
npm run test:susan
```

**Railway test (checks production environment):**
```bash
npm run test:susan:railway
```

### Required Environment Variables

**Susan chat requires AT LEAST ONE AI provider configured:**

```bash
# Option 1: Google Gemini (Recommended - Free tier available)
VITE_GEMINI_API_KEY=your_gemini_api_key

# Option 2: Groq (Fast, affordable)
VITE_GROQ_API_KEY=your_groq_api_key

# Option 3: Together AI
VITE_TOGETHER_API_KEY=your_together_api_key

# Option 4: Hugging Face (Free tier)
VITE_HF_API_KEY=your_hf_api_key

# Option 5: Install Ollama locally (Free, runs on your machine)
# https://ollama.ai
```

### Configure AI Providers in Railway

1. Go to **Railway Dashboard**
2. Select your **Web Service**
3. Click **Variables** tab
4. Add at least one of these:
   - `VITE_GEMINI_API_KEY`
   - `VITE_GROQ_API_KEY`
   - `VITE_TOGETHER_API_KEY`
   - `VITE_HF_API_KEY`
5. Click **Deploy** (Railway will rebuild with new variables)

### Get API Keys

**Google Gemini (Recommended):**
1. Go to https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key
4. Free tier: 60 requests/minute

**Groq (Fast & Affordable):**
1. Go to https://console.groq.com/keys
2. Create account
3. Generate API key
4. Free tier available

**Together AI:**
1. Go to https://api.together.xyz/settings/api-keys
2. Create account
3. Generate API key

**Hugging Face:**
1. Go to https://huggingface.co/settings/tokens
2. Create "Read" token
3. Free tier available

### Verify Susan Chat is Working

**1. Check Environment Variables (Railway):**
```bash
railway run env | grep VITE
```

Should show at least one API key set.

**2. Test Live Panel (Voice Chat):**
1. Open your app: https://your-app.railway.app
2. Login with email
3. Click **"Live"** tab
4. Allow microphone access
5. Click red record button
6. Say "Hello Susan, are you working?"
7. Susan should respond with voice

**3. Test Text Chat:**
1. Use the chat interface
2. Type a message: "Test message - is Susan working?"
3. Susan (S21) should respond

**4. Check Browser Console:**
- Open DevTools (F12)
- Look for errors
- Should see: "✅ Susan chat initialized"

### Troubleshooting Susan Chat

**Problem: Susan not responding**
```bash
# Check Railway logs
railway logs

# Look for errors like:
# ❌ No AI providers configured
# ❌ API key invalid
```

**Problem: "API key not set" error**
- Check Railway Variables tab
- Ensure `VITE_` prefix is used
- Redeploy after adding variables

**Problem: Slow responses**
- Groq is fastest (< 2 seconds)
- Gemini is moderate (2-5 seconds)
- Try switching providers in multiProviderAI.ts

**Problem: "Ollama not available"**
- Ollama only works locally
- For Railway deployment, use cloud providers (Gemini, Groq, etc.)

---

## Part 3: Complete Deployment Checklist ✅

### Pre-Deployment

- [ ] Railway CLI installed locally
- [ ] Railway project linked (`railway link`)
- [ ] Database initialized (`npm run db:init:railway`)
- [ ] At least one AI provider API key ready

### Deploy Baby Malik Announcement

- [ ] Run `npm run announcement:trigger-now:railway`
  - OR use Railway Dashboard SQL
- [ ] Verify with: `curl https://your-app.railway.app/api/announcements/active`
- [ ] Check that `is_active = true` and `start_time` is in the past

### Configure Susan Chat

- [ ] Run `npm run test:susan:railway` to check status
- [ ] Add AI provider API key(s) to Railway Variables
  - [ ] `VITE_GEMINI_API_KEY` (recommended)
  - [ ] OR `VITE_GROQ_API_KEY`
  - [ ] OR `VITE_TOGETHER_API_KEY`
  - [ ] OR `VITE_HF_API_KEY`
- [ ] Deploy changes (Railway auto-deploys on variable change)
- [ ] Wait for deployment to complete (~2-3 minutes)

### Verify Everything is Working

- [ ] Test announcement:
  - [ ] Login to app
  - [ ] See Baby Malik toast appear in top-right
  - [ ] Toast has gradient background and 🎉 emoji
  - [ ] Can dismiss toast
- [ ] Test Susan chat:
  - [ ] Click "Live" tab
  - [ ] Test voice recording
  - [ ] Susan responds with voice
  - [ ] Check browser console for errors
- [ ] Test text chat:
  - [ ] Send message to Susan
  - [ ] Receive response
  - [ ] Chat history saves

### Post-Deployment Monitoring

- [ ] Check Railway logs: `railway logs`
- [ ] Monitor API endpoint: `/api/announcements/active`
- [ ] Ask team members if they see announcement
- [ ] Test Susan from different devices/browsers

---

## Part 4: Quick Reference Commands

```bash
# Test Susan chat
npm run test:susan:railway

# Deploy Baby Malik announcement
npm run announcement:trigger-now:railway

# Check Railway logs
railway logs

# Check Railway environment variables
railway run env | grep VITE

# Test database connection
npm run announcement:test:railway

# Check announcement status
curl https://your-app.railway.app/api/announcements/active
```

---

## Support & Troubleshooting

### Announcement Not Showing?

1. **Check API endpoint:**
   ```bash
   curl https://your-app.railway.app/api/announcements/active
   ```

2. **Clear localStorage:**
   - Browser DevTools → Console
   - Run: `localStorage.removeItem('dismissed_announcements')`
   - Reload page

3. **Check database:**
   ```sql
   SELECT * FROM announcements WHERE title LIKE '%Baby Malik%';
   ```

### Susan Chat Not Working?

1. **Run diagnostic:**
   ```bash
   npm run test:susan:railway
   ```

2. **Check Railway logs:**
   ```bash
   railway logs | grep -i "error\|fail\|api"
   ```

3. **Verify API keys:**
   - Railway Dashboard → Variables tab
   - Check keys are set with `VITE_` prefix
   - Keys should NOT be quoted

4. **Test locally first:**
   - Add API key to `.env` file
   - Run: `npm run dev`
   - Test Susan chat locally

---

## Success Criteria

✅ **Baby Malik Announcement:**
- API returns announcement when calling `/api/announcements/active`
- All logged-in users see toast notification
- Toast has correct message and styling
- Users can dismiss successfully

✅ **Susan (S21) Chat:**
- `npm run test:susan:railway` shows "✅ Susan chat is READY TO USE!"
- Live Panel voice chat responds
- Text chat responds with document citations
- No errors in browser console
- Chat history saves to database

---

## Timeline

- **Now**: Run deployment commands
- **1-2 minutes**: Baby Malik announcement goes live
- **2-5 minutes**: Railway redeploys with Susan chat API keys
- **Within 30 seconds of login**: Users see Baby Malik announcement
- **Immediately**: Susan chat available for use

---

## 🎉 You're All Set!

Both the Baby Malik announcement and Susan chat should now be live and working!

If you encounter any issues, check the troubleshooting sections above or run the test commands for diagnostics.
