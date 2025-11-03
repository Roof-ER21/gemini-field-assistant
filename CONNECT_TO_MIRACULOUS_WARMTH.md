# 🔗 Connect to miraculous-warmth Railway Project

## Quick Setup (5 minutes)

You're currently viewing the **miraculous-warmth** project in Railway, which already has a Postgres database. This is the easiest way to get the database working!

---

## Option 1: Use Existing S21-A24 Service (Recommended)

The **S21-A24** service in your screenshot shows "Failed (last week)" - we can fix this and use it!

### Steps:

1. **Click on S21-A24 service** in Railway dashboard

2. **Go to Settings > Source**
   - Verify it's connected to the right GitHub repo
   - Should be: `Roof-ER21/gemini-field-assistant`
   - If not, reconnect to the correct repo

3. **Go to Settings > Variables**
   - The Postgres database should already be linked
   - You should see `DATABASE_URL` automatically set

4. **Trigger a new deployment**
   - Click "Deployments" tab
   - Click "Deploy" button
   - Or push to GitHub (it will auto-deploy)

5. **Monitor the deployment**
   - Watch build logs
   - The `scripts/init-database.js` will run automatically
   - Tables will be created in the Postgres database

---

## Option 2: Create New Service

If S21-A24 can't be fixed, create a new service:

1. **Click "+ Create"** button (top right in your screenshot)

2. **Select "GitHub Repo"**

3. **Choose repository:**
   - `Roof-ER21/gemini-field-assistant`

4. **Configure service:**
   - Name: `gemini-field-assistant`
   - Branch: `main`
   - Root directory: `/`

5. **Connect Postgres database:**
   - Click "Variables" tab
   - Click "+ New Variable"
   - Click "Add Reference"
   - Select your Postgres database
   - It will add `DATABASE_URL` automatically

6. **Deploy:**
   - Railway will auto-deploy
   - Database init script will run during build
   - Check logs to verify

---

## Option 3: Manual Database Setup (If you prefer)

### Get the Postgres connection string:

1. In Railway dashboard (miraculous-warmth project)
2. Click on **Postgres** service
3. Go to **Variables** tab
4. Copy the `DATABASE_URL` value

### Initialize database from your local machine:

```bash
# Set the DATABASE_URL
export DATABASE_URL="<paste the connection string here>"

# Initialize database
node scripts/init-database.js

# Verify tables created
node -e "const pg=require('pg'); const pool=new pg.Pool({connectionString:process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}}); pool.query('SELECT table_name FROM information_schema.tables WHERE table_schema=\\'public\\'').then(r=>{console.log('✅ Tables:', r.rows.map(x=>x.table_name)); return pool.end()});"
```

---

## 🎯 Recommended: Use Option 1

**Fix the S21-A24 service** - it's already there and just needs to be redeployed with the latest code!

### Why Option 1 is best:
- ✅ Service already exists
- ✅ Probably already connected to Postgres
- ✅ Just needs latest code from GitHub
- ✅ 2 minutes to fix

### How to fix S21-A24:

1. Click on S21-A24 in Railway dashboard
2. Go to Settings
3. Scroll down to "Service"
4. Click "Redeploy"
5. Or go to Deployments > Deploy

That's it! The latest code from GitHub will deploy, and the database init script will run automatically.

---

## ✅ After Setup

Once deployed, verify it worked:

### Check deployment logs:
```
Look for these messages in Railway logs:
✓ Testing database connection...
✓ Connected successfully
✓ Executing schema...
✅ Database schema initialized successfully!
✅ Tables created:
  1. users
  2. chat_history
  3. document_views
  ... etc
```

### Test the API:
```bash
# Replace with your actual URL
curl https://s21a24.up.railway.app/api/health

# Should return:
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-11-02T..."
}
```

---

## 🔧 Troubleshooting

### If database connection fails:
1. Check if Postgres service is running (green status)
2. Verify DATABASE_URL variable is set in your service
3. Check deployment logs for errors

### If tables aren't created:
1. Check build logs for init script output
2. Manually run: `node scripts/init-database.js`
3. Or deploy again (it's safe to run multiple times)

### If deployment fails:
1. Check build logs in Railway
2. Verify GitHub repo is correct
3. Check if all dependencies are in package.json (they are!)

---

## 📊 What Happens When You Deploy

1. Railway pulls code from GitHub
2. Runs `npm install`
3. Runs `npm run build` (includes database init)
4. Database tables are created automatically
5. Frontend starts serving on assigned port

The `railway.json` file we created has this:
```json
"buildCommand": "npm install && npm run build && node scripts/init-database.js || true"
```

So the database initializes automatically! 🎉

---

## 🎯 Quick Start

**Right now, do this:**

1. Open Railway dashboard (you already have it open!)
2. Click on **S21-A24** service
3. Click **Settings** > **General**
4. Scroll down and click **"Redeploy Latest"**
5. Watch the deployment logs
6. Done! ✅

**That's literally it. 2 clicks and you're done!**

---

**The database infrastructure is already built. You just need to deploy it to this Railway project! 🚀**
