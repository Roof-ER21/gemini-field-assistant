# 🚀 SA21 Railway Environment Variables - COMPLETE SETUP

## CRITICAL: Set These in Railway Dashboard

**Location**: Railway Dashboard → sa21 service → Variables tab

---

## ✅ REQUIRED Environment Variables (Set These Now)

### Frontend AI Provider Keys (VITE_* prefix required for build-time injection)

```bash
# Google Gemini (PRIMARY - Get from https://aistudio.google.com/apikey)
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# Groq (FASTEST - Get from https://console.groq.com/keys)
VITE_GROQ_API_KEY=your_groq_api_key_here

# Together AI (FALLBACK - Get from https://api.together.xyz/settings/api-keys)
VITE_TOGETHER_API_KEY=your_together_api_key_here

# Hugging Face (OPTIONAL - Get from https://huggingface.co/settings/tokens)
VITE_HF_API_KEY=your_hf_token_here
```

### Backend Configuration

```bash
# Admin Email (receives notifications)
EMAIL_ADMIN_ADDRESS=ahmed.mahmoud@theroofdocs.com

# Email From Address
EMAIL_FROM_ADDRESS=s21-assistant@roofer.com

# Resend API Key (Email Service)
RESEND_API_KEY=re_6GVYbR5u_Cky9agmkxFdBBcqhEa15egME

# Admin Email (Client-side hint for UI)
VITE_ADMIN_EMAIL=ahmed.mahmoud@theroofdocs.com

# Frontend API URL (Production)
VITE_API_URL=https://sa21.up.railway.app/api
```

### Database Configuration (Auto-Set by Railway)

```bash
# These are automatically set by Railway when you link PostgreSQL service
# DO NOT manually set these - Railway handles it automatically:
# - DATABASE_URL
# - POSTGRES_URL
```

---

## 📋 Quick Setup Checklist

### Step 1: Get API Keys

1. **Gemini** (Recommended - Free tier)
   - Go to: https://aistudio.google.com/apikey
   - Click "Create API Key"
   - Copy key → Set as `VITE_GEMINI_API_KEY`

2. **Groq** (Fastest - Free tier)
   - Go to: https://console.groq.com/keys
   - Create account
   - Generate API key
   - Copy key → Set as `VITE_GROQ_API_KEY`

3. **Together AI** (Optional backup)
   - Go to: https://api.together.xyz/settings/api-keys
   - Sign up (Get $25 free credit)
   - Create API key
   - Copy key → Set as `VITE_TOGETHER_API_KEY`

### Step 2: Set Variables in Railway

1. Go to Railway Dashboard: https://railway.app/dashboard
2. Select the **sa21** service (or **gemini-field-assistant**)
3. Click **Variables** tab
4. Click **+ New Variable** for each key above
5. Paste the values

### Step 3: Redeploy

After setting all variables:
1. Click **Deployments** tab
2. Click **⋮** (three dots) on latest deployment
3. Click **Redeploy**
4. Wait 2-3 minutes for rebuild

---

## 🧪 Verification Steps

### After Deployment, Test These Endpoints:

```bash
# 1. Check API Health
curl https://sa21.up.railway.app/api/health
# Should return: {"status":"healthy","database":"connected","timestamp":"..."}

# 2. Check AI Providers
curl https://sa21.up.railway.app/api/providers/status
# Should return: {"groq":true,"together":true,"gemini":true,"anyConfigured":true}
#                (NOT all false like currently)

# 3. Check Version
curl https://sa21.up.railway.app/api/version
# Should return latest commit hash

# 4. Test Frontend
# Visit: https://sa21.up.railway.app
# Login with any email
# Try chatting with Susan
# Verify AI responses work
```

---

## ⚠️ Current Issues (Before Setting Variables)

Based on testing, here's what's broken:

1. ❌ **AI Providers**: All showing `false` (no API keys set)
   ```json
   {"groq":false,"together":false,"huggingface":false,"gemini":false,"anyConfigured":false}
   ```

2. ❌ **Chat Won't Work**: Frontend can't make AI requests without provider keys

3. ⚠️ **Email Notifications**: Resend key exists but may need verification

---

## ✅ What's Already Working

1. ✅ Frontend deployed and loading
2. ✅ Backend API running
3. ✅ Database connected
4. ✅ Health endpoint responding
5. ✅ Version endpoint responding

---

## 🔐 Security Notes

- **NEVER commit real API keys** to Git
- **VITE_* keys are exposed** to browser (OK for AI providers)
- **Backend keys (RESEND_API_KEY, DATABASE_URL)** stay server-side
- **Use Railway's encrypted storage** for all secrets

---

## 📊 Expected Costs (Monthly)

With proper API keys set:

| Service | Free Tier | Paid Tier | Notes |
|---------|-----------|-----------|-------|
| **Gemini** | 15 RPM | $0.10/1M tokens | Best for multimodal |
| **Groq** | Generous | $0.59/1M tokens | Fastest inference |
| **Together AI** | $25 credit | $0.20/1M tokens | Good balance |
| **Resend** | 100 emails/day | $20/month | 10k emails |
| **Railway** | $5 credit | $20-50/month | Hosting + DB |

**Estimated Total**: $0-100/month depending on usage

---

## 🚨 PRIORITY ACTIONS

### Do This RIGHT NOW:

1. **Get Gemini API Key** (Takes 2 minutes)
   - https://aistudio.google.com/apikey
   - Set as `VITE_GEMINI_API_KEY` in Railway

2. **Get Groq API Key** (Takes 5 minutes)
   - https://console.groq.com/keys
   - Set as `VITE_GROQ_API_KEY` in Railway

3. **Set Admin Email**
   - `EMAIL_ADMIN_ADDRESS=ahmed.mahmoud@theroofdocs.com`
   - `VITE_ADMIN_EMAIL=ahmed.mahmoud@theroofdocs.com`

4. **Set Frontend API URL**
   - `VITE_API_URL=https://sa21.up.railway.app/api`

5. **Redeploy**
   - Trigger manual redeploy in Railway
   - Wait for build to complete

### Then Test:

```bash
# Should show AI providers configured
curl https://sa21.up.railway.app/api/providers/status
```

---

## 📝 Next Steps After Environment Variables Are Set

Once variables are set and deployment is successful:

1. ✅ **Run Database Migrations**
   - Creates all 11 tables
   - Seeds insurance companies
   - Sets up admin user

2. ✅ **Test All Features**
   - Login flow
   - Chat with Susan/Agnes
   - Admin panel access
   - Email notifications
   - Document analysis

3. ✅ **Security Hardening**
   - Add rate limiting
   - Add helmet.js
   - Audit logging

4. ✅ **Performance Optimization**
   - Code splitting
   - Lazy loading
   - Caching

---

**Last Updated**: November 15, 2025
**Status**: WAITING FOR ENV VARS TO BE SET IN RAILWAY
**Next Action**: User must set environment variables in Railway dashboard
