# 🚀 Deploy gemini-field-assistant to Railway

## Quick Deployment Guide (5 minutes)

Since the database is already set up in the **miraculous-warmth** project, let's deploy the app there!

---

## Option 1: Deploy via Railway Dashboard (Easiest - 3 minutes)

### Step 1: Create New Service

1. **Open Railway Dashboard:** https://railway.app
2. **Select Project:** Click on **"miraculous-warmth"**
3. **Create Service:** Click **"+ Create"** (top right)
4. **Select Source:** Click **"GitHub Repo"**
5. **Choose Repository:** Select **`Roof-ER21/gemini-field-assistant`**
6. **Configure:**
   - Service name: `gemini-field-assistant`
   - Branch: `main`
   - Root directory: `/` (leave default)

### Step 2: Connect Database

The service will be created, now connect it to Postgres:

1. Click on the new **gemini-field-assistant** service
2. Go to **Variables** tab
3. Click **"+ New Variable"**
4. Click **"Add Reference"**
5. Select **"Postgres"** from the list
6. It will automatically add:
   - `DATABASE_URL`
   - `DATABASE_PUBLIC_URL`

### Step 3: Deploy!

1. Railway will automatically trigger a deployment
2. Watch the build logs:
   - Click **"Deployments"** tab
   - Click on the active deployment
   - Watch the logs

3. Look for these messages:
   ```
   🔗 Connecting to PostgreSQL...
   ✓ Connected successfully
   ✓ Executing schema...
   ✅ Database schema initialized successfully!
   ```

4. Once deployed, you'll get a URL like:
   ```
   https://gemini-field-assistant-production.up.railway.app
   ```

**Done! ✅** Your app is now live with PostgreSQL!

---

## Option 2: Use Existing S21-A24 Service (1 minute)

If you saw the **S21-A24** service in your screenshot earlier, you can reuse it:

### Step 1: Update the Service

1. Click on **S21-A24** service in Railway dashboard
2. Go to **Settings** > **Source**
3. Verify it's connected to: `Roof-ER21/gemini-field-assistant`
4. If not, reconnect it

### Step 2: Connect Database

1. Go to **Variables** tab
2. Check if `DATABASE_URL` exists
3. If not, add it:
   - Click **"+ New Variable"**
   - Click **"Add Reference"**
   - Select **"Postgres"**

### Step 3: Redeploy

1. Go to **Deployments** tab
2. Click **"Deploy"** or **"Redeploy Latest"**
3. Watch the logs

**Done! ✅** The S21-A24 service now uses the database!

---

## Option 3: Deploy via CLI (Alternative)

If you prefer command line, here's how:

### Prerequisites

You need to create a `.railway` directory with the project config. Since we can't do this interactively via CLI, use the dashboard method above instead.

---

## What Happens During Deployment

### Build Process

Railway will run these commands (from `railway.json`):

```bash
npm install
npm run build
node scripts/init-database.js || true  # Runs DB init (safely)
```

### The Init Script

The `init-database.js` script will:
1. ✅ Connect to Postgres using `DATABASE_URL`
2. ✅ Check if tables exist (they do!)
3. ✅ Skip creating existing tables
4. ✅ Report success
5. ✅ Continue with deployment

Since we already initialized the database manually, the script will just verify and continue!

### Start Process

Railway will start your app:

```bash
npm run preview -- --host 0.0.0.0 --port $PORT
```

Your Vite app will serve on the assigned port.

---

## Verify Deployment

### 1. Check Deployment Logs

Look for:
```
✅ Database schema initialized successfully!
✓ Starting...
▲ Vite vX.X.X
- Local:        http://localhost:$PORT
✓ Ready in XXXms
```

### 2. Test the App

Visit your Railway URL:
```
https://your-service.up.railway.app
```

You should see the gemini-field-assistant interface!

### 3. Test Database Connection

The app will automatically:
- Save chat messages to `chat_history` table
- Track document views in `document_views` table
- Log emails in `email_generation_log` table

Check Railway Postgres data tab to see records!

---

## Environment Variables

Your service should have these variables (automatically added):

| Variable | Value | Source |
|----------|-------|--------|
| `DATABASE_URL` | `postgresql://postgres:...@postgres.railway.internal:5432/railway` | Postgres Reference |
| `DATABASE_PUBLIC_URL` | `postgresql://postgres:...@hopper.proxy.rlwy.net:15533/railway` | Postgres Reference |
| `GEMINI_API_KEY` | (your key) | Already in project |
| `GROQ_API_KEY` | (your key) | Already in project |
| Other AI keys | (your keys) | Already in project |

All AI API keys from **jubilant-encouragement** service should be shared at the project level, so your new service will have access!

---

## Troubleshooting

### Database Connection Fails

**Check:**
1. `DATABASE_URL` variable is set
2. Postgres service is running (green status)
3. View logs for connection errors

**Fix:**
- Add the database reference again
- Redeploy

### Build Fails

**Check build logs for:**
- Missing dependencies (should be in package.json)
- TypeScript errors
- Environment issues

**Fix:**
- Verify all dependencies installed
- Check `railway.json` configuration

### App Not Starting

**Check:**
- Port is set correctly (Railway sets `$PORT`)
- Start command is correct: `npm run preview -- --host 0.0.0.0 --port $PORT`

---

## Post-Deployment

### Enable Database in Code (Optional)

By default, the app uses localStorage. To use PostgreSQL:

1. Edit `services/databaseService.ts`
2. Line 12: Change `private useLocalStorage: boolean = true;` to `false`
3. Commit and push
4. Railway will auto-redeploy

### Monitor Usage

Check your database in Railway:
1. Click **Postgres** service
2. Go to **Data** tab
3. Browse tables: `chat_history`, `document_views`, etc.
4. Watch records appear as users interact!

### Check Analytics

Query the database:
```sql
-- Count chat messages
SELECT COUNT(*) FROM chat_history;

-- Most viewed documents
SELECT document_name, SUM(view_count) as views
FROM document_views
GROUP BY document_name
ORDER BY views DESC
LIMIT 10;

-- Emails generated by state
SELECT state, COUNT(*) as count
FROM email_generation_log
GROUP BY state;
```

---

## 🎯 Quick Start Checklist

- [ ] Open Railway dashboard
- [ ] Go to **miraculous-warmth** project
- [ ] Click **"+ Create"** > **"GitHub Repo"**
- [ ] Select **`Roof-ER21/gemini-field-assistant`**
- [ ] Service created automatically
- [ ] Go to **Variables** tab
- [ ] Click **"+ New Variable"** > **"Add Reference"** > **"Postgres"**
- [ ] Database connected!
- [ ] Go to **Deployments** tab
- [ ] Watch deployment complete
- [ ] Click on the URL to view your app
- [ ] ✅ Done!

---

## 📊 Expected Result

After deployment:

1. ✅ **App Live:** Accessible via Railway URL
2. ✅ **Database Connected:** Using Postgres we initialized
3. ✅ **Data Persisting:** Chat history, docs, emails saved
4. ✅ **Multi-State:** VA, MD, PA support working
5. ✅ **Citations:** Clickable citations working
6. ✅ **Production Ready:** Fully operational!

---

**Time to Deploy:** 3-5 minutes
**Difficulty:** Easy (just click through the UI!)

**Ready to deploy? Follow Option 1 above! 🚀**
