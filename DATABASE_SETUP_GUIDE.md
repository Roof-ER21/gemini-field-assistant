# 🗄️ PostgreSQL Database Setup Guide

## Overview

This guide walks you through setting up PostgreSQL on Railway for the Susan 21 Field AI application.

**What's been done:**
- ✅ PostgreSQL database already provisioned on Railway
- ✅ Database schema created (`database/schema.sql`)
- ✅ Backend API server created (`server/index.ts`)
- ✅ Database service created (`services/databaseService.ts`)

**What needs to be done:**
1. Initialize database tables
2. Test database connection
3. Deploy backend API server
4. Migrate from localStorage to PostgreSQL (gradual)

---

## Step 1: Initialize Database Schema

The database is already running on Railway. Now we need to create the tables.

### Option A: Using Railway CLI (Recommended)

```bash
# From project root
cd ~/Desktop/S21-A24/gemini-field-assistant

# Initialize database schema
npm run db:init:railway
```

This will create:
- `users` table
- `chat_history` table
- `document_views` table
- `document_favorites` table
- `email_generation_log` table
- `image_analysis_log` table
- `user_preferences` table
- `search_analytics` table
- Views for analytics
- Indexes for performance

### Option B: Manual SQL Execution

If the above doesn't work:

```bash
# Copy the schema file content
cat database/schema.sql | pbcopy

# Connect to Railway database
railway run psql $DATABASE_URL

# Paste and execute the schema
# (paste from clipboard)

# Verify tables were created
\dt

# Exit
\q
```

---

## Step 2: Verify Database Setup

Check that everything was created successfully:

```bash
# Check tables
railway run psql $DATABASE_URL -c "\dt"

# Check the test user
railway run psql $DATABASE_URL -c "SELECT * FROM users;"

# Check views
railway run psql $DATABASE_URL -c "\dv"
```

Expected output:
- 8 tables (users, chat_history, document_views, etc.)
- 2 views (user_activity_summary, popular_documents)
- 1 test user (test@roofer.com)

---

## Step 3: Install Backend Dependencies

```bash
npm install
```

This will install:
- `express` - Backend server
- `pg` - PostgreSQL client
- `cors` - Cross-origin support
- `tsx` - TypeScript execution

---

## Step 4: Test Backend API Locally (Optional)

For local testing, you can run the backend:

```bash
# Start the backend server
npm run server:dev
```

Then test endpoints:

```bash
# Health check
curl http://localhost:3001/api/health

# Get current user
curl http://localhost:3001/api/users/me

# Get analytics
curl http://localhost:3001/api/analytics/summary
```

---

## Step 5: Deploy Backend to Railway

### Option A: Update railway.json for Backend Server

The current `railway.json` deploys the frontend. We need to also deploy the backend.

Create a new service on Railway for the backend:

```bash
# In Railway dashboard:
# 1. Click "+ New Service"
# 2. Select "Empty Service"
# 3. Name it "Susan 21 API"
# 4. Link it to the same repository
```

### Option B: Combined Deployment (Simpler)

Modify the existing deployment to serve both frontend and API:

Update `railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "node server/index.js & npm run preview -- --host 0.0.0.0 --port ${PORT:-4173}",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## Step 6: Environment Variables

The following are already set on Railway:

- ✅ `DATABASE_URL` - PostgreSQL connection string
- ✅ `POSTGRES_URL` - Same as DATABASE_URL
- ✅ All AI API keys (GEMINI_API_KEY, GROQ_API_KEY, etc.)

Add one more:

```bash
railway vars set VITE_API_URL=https://s21.up.railway.app/api
```

---

## Step 7: Enable Database in Frontend

The `databaseService.ts` currently uses localStorage as a fallback. Once the backend is deployed:

1. Update `services/databaseService.ts`:

```typescript
// Change this line:
private useLocalStorage: boolean = true;

// To:
private useLocalStorage: boolean = false;
```

2. Or enable it automatically by checking the API endpoint:

```typescript
private async checkDatabaseConnection(): Promise<void> {
  try {
    const response = await fetch(`${this.apiBaseUrl}/health`);
    if (response.ok) {
      this.useLocalStorage = false;
      console.log('✅ Database connection established');
    }
  } catch (error) {
    console.log('📦 Using localStorage as database fallback');
    this.useLocalStorage = true;
  }
}
```

---

## Database Schema Overview

### Tables

**users**
- Stores user accounts
- Fields: email, name, role, state (VA/MD/PA)

**chat_history**
- All chat conversations
- Linked to users, includes sources and AI provider

**document_views**
- Tracks document views
- Counts views, time spent per document

**document_favorites**
- User bookmarks
- Can add personal notes

**email_generation_log**
- All generated emails
- Tracks templates used, recipients

**image_analysis_log**
- Image analysis requests
- Stores results and AI provider used

**user_preferences**
- User settings
- State preference, AI provider, theme

**search_analytics**
- Search queries
- Helps improve knowledge base

### Views (Analytics)

**user_activity_summary**
- Aggregated user stats
- Total messages, documents viewed, emails sent

**popular_documents**
- Most viewed documents
- Unique viewers, total views, avg time

---

## Migration Strategy

The app will gradually migrate from localStorage to PostgreSQL:

### Phase 1: Dual Write (Current)
- ✅ Write to localStorage (primary)
- ⏳ Also write to PostgreSQL (background)
- ✅ Read from localStorage

### Phase 2: Dual Read
- ✅ Write to both
- ⏳ Read from PostgreSQL first, fallback to localStorage
- ⏳ Migrate existing localStorage data

### Phase 3: PostgreSQL Only
- ✅ Write to PostgreSQL only
- ✅ Read from PostgreSQL
- ✅ Clear localStorage

---

## Monitoring & Analytics

Once deployed, you can access analytics:

### User Dashboard
```bash
curl https://s21.up.railway.app/api/analytics/summary
```

### Popular Documents
```bash
curl https://s21.up.railway.app/api/analytics/popular-documents
```

### Recent Activity
```bash
curl https://s21.up.railway.app/api/chat/messages?limit=10
```

---

## Backup & Maintenance

### Backup Database

```bash
# Create backup
railway run pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore from backup
railway run psql $DATABASE_URL < backup-20250102.sql
```

### View Database Size

```bash
railway run psql $DATABASE_URL -c "
SELECT
  pg_size_pretty(pg_database_size(current_database())) as db_size;
"
```

### Clean Up Old Data

```bash
# Delete chat history older than 90 days
railway run psql $DATABASE_URL -c "
DELETE FROM chat_history
WHERE created_at < NOW() - INTERVAL '90 days';
"
```

---

## Troubleshooting

### Can't connect to database

```bash
# Test connection
railway run psql $DATABASE_URL -c "SELECT 1"

# Check environment variables
railway variables | grep DATABASE
```

### Tables not created

```bash
# Re-run schema
npm run db:init:railway

# Check for errors
railway logs
```

### API not responding

```bash
# Check if backend is running
curl https://s21.up.railway.app/api/health

# Check Railway logs
railway logs --service "Susan 21"
```

---

## Next Steps

1. ✅ Run `npm run db:init:railway` to create tables
2. ⏳ Test with `railway run psql $DATABASE_URL -c "\dt"`
3. ⏳ Deploy backend (update railway.json or create new service)
4. ⏳ Test API endpoints
5. ⏳ Enable database in frontend (set useLocalStorage = false)
6. ⏳ Monitor and verify data is being saved
7. ⏳ Migrate existing localStorage data

---

## Support

For issues:
1. Check Railway logs: `railway logs`
2. Test database connection: `railway run psql $DATABASE_URL -c "SELECT 1"`
3. Verify environment variables: `railway variables`
4. Check API health: `curl https://s21.up.railway.app/api/health`

---

**Database is ready! Just run the initialization command and deploy. 🚀**
