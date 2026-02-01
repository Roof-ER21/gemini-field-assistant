# Dashboard Redesign - Deployment Guide

## Pre-Deployment Checklist

### Files Created/Modified

#### New Files ✨
1. `/Users/a21/gemini-field-assistant/server/routes/repGoalsRoutes.ts` - New API routes
2. `/Users/a21/gemini-field-assistant/components/HomePageRedesigned.tsx` - New dashboard
3. `/Users/a21/gemini-field-assistant/database/migrations/041_add_revenue_goals.sql` - Database migration
4. `/Users/a21/gemini-field-assistant/run-migration-041.js` - Migration runner
5. `/Users/a21/gemini-field-assistant/DASHBOARD_REDESIGN.md` - Documentation
6. `/Users/a21/gemini-field-assistant/DASHBOARD_PREVIEW.md` - Visual preview
7. `/Users/a21/gemini-field-assistant/DEPLOYMENT_GUIDE.md` - This file

#### Modified Files 📝
1. `/Users/a21/gemini-field-assistant/server/index.ts` - Registered new routes
2. `/Users/a21/gemini-field-assistant/App.tsx` - Uses new HomePage component
3. `/Users/a21/gemini-field-assistant/package.json` - Added migration scripts

## Deployment Steps

### Option 1: Local Development

```bash
cd /Users/a21/gemini-field-assistant

# 1. Run the database migration
npm run db:migrate:revenue-goals

# 2. Start the development server
npm run dev

# 3. In a separate terminal, start the backend
npm run server:dev

# 4. Open browser to http://localhost:5173
```

### Option 2: Production (Railway)

```bash
cd /Users/a21/gemini-field-assistant

# 1. Run the database migration on Railway
npm run db:migrate:revenue-goals:railway

# 2. Commit and push to trigger Railway deployment
git add .
git commit -m "Add sales rep dashboard with goal tracking and analytics

- New dashboard with circular progress indicators
- Monthly/yearly goal tracking
- Performance trend charts (last 6 months)
- Leaderboard integration
- Smart status detection (ahead/on-track/behind)
- API endpoints for rep goals and progress
- Database migration for revenue goal columns
- Fully responsive design with Recharts visualizations"

git push origin main

# Railway will automatically deploy
```

## Post-Deployment Verification

### 1. Database Migration Check

```bash
# Connect to your database and verify columns exist
psql $DATABASE_URL -c "
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'sales_reps'
AND column_name IN ('monthly_revenue_goal', 'yearly_revenue_goal')
ORDER BY column_name;
"
```

Expected output:
```
     column_name      |   data_type   | column_default
----------------------+---------------+----------------
 monthly_revenue_goal | numeric       | 0
 yearly_revenue_goal  | numeric       | 0
```

### 2. API Endpoint Test

```bash
# Test the goals endpoint (replace with actual user email)
curl -H "x-user-email: rep@example.com" \
  https://your-app.railway.app/api/rep/goals

# Test the progress endpoint
curl -H "x-user-email: rep@example.com" \
  https://your-app.railway.app/api/rep/goals/progress
```

### 3. Frontend Verification

1. Log in to the app
2. Navigate to Home (should be default)
3. Verify you see:
   - Hero section with status badge
   - Monthly Signups circular progress card
   - Yearly Revenue progress bar card
   - Performance Trends chart (if data exists)
   - Performance Stats cards
   - Quick Actions buttons

### 4. Check Browser Console

Open DevTools Console and verify:
- No TypeScript/React errors
- API calls successful (200 responses)
- Charts render without errors

## Rollback Plan

If issues occur, rollback is simple:

### Rollback Frontend Only
```bash
# Revert App.tsx to use old HomePage
cd /Users/a21/gemini-field-assistant

git checkout HEAD~1 App.tsx
git commit -m "Rollback: Revert to old HomePage"
git push origin main
```

### Keep Old HomePage Available
The original `/Users/a21/gemini-field-assistant/components/HomePage.tsx` is still in the codebase and can be quickly swapped back:

```typescript
// In App.tsx, change:
import HomePage from './components/HomePageRedesigned';

// Back to:
import HomePage from './components/HomePage';
```

## Troubleshooting

### Issue: "Rep not found" error

**Cause:** User not synced from Google Sheets yet

**Solution:**
1. Check if user exists in `sales_reps` table
2. Trigger Google Sheets sync (if admin):
   ```bash
   curl -X POST -H "x-user-email: admin@example.com" \
     https://your-app.railway.app/api/leaderboard/sync
   ```

### Issue: Charts not rendering

**Cause:** Missing historical data or recharts not loaded

**Solution:**
1. Verify data exists in `sales_rep_monthly_metrics` table
2. Check browser console for recharts errors
3. Ensure `recharts@2.15.4` is installed in dependencies

### Issue: Progress shows 0%

**Cause:** Goals not set or current values are 0

**Solution:**
1. Set default goals in database:
   ```sql
   UPDATE sales_reps
   SET monthly_signup_goal = 15,
       yearly_signup_goal = 180,
       monthly_revenue_goal = 50000,
       yearly_revenue_goal = 600000
   WHERE email = 'rep@example.com';
   ```

### Issue: TypeScript build errors

**Cause:** Type mismatches or missing imports

**Solution:**
```bash
# Rebuild TypeScript server
npm run server:build

# Check for errors and fix
```

## Performance Monitoring

### Database Query Performance

Monitor these queries (should be < 100ms):
```sql
-- Goals query
SELECT monthly_signup_goal, yearly_signup_goal,
       monthly_revenue_goal, yearly_revenue_goal
FROM sales_reps
WHERE LOWER(email) = LOWER($1)
LIMIT 1;

-- Progress query
SELECT id, name, monthly_signups, monthly_revenue,
       yearly_signups, yearly_revenue,
       monthly_signup_goal, yearly_signup_goal,
       monthly_revenue_goal, yearly_revenue_goal,
       goal_progress
FROM sales_reps
WHERE LOWER(email) = LOWER($1)
LIMIT 1;

-- History query (limited to 6 months)
SELECT year, month, total_signups, total_revenue
FROM sales_rep_monthly_metrics
WHERE sales_rep_id = $1
ORDER BY year DESC, month DESC
LIMIT 6;
```

### Frontend Bundle Size

Check bundle impact:
```bash
npm run build

# Check dist/assets for bundle sizes
ls -lh dist/assets/*.js

# Ensure HomePageRedesigned.tsx doesn't significantly increase bundle
# Recharts is already in dependencies, so no new bundle added
```

## Configuration Options

### Customize Default Goals

Edit migration file before running:
```sql
-- In database/migrations/041_add_revenue_goals.sql
UPDATE sales_reps
SET
  monthly_revenue_goal = 50000,  -- Change this
  yearly_revenue_goal = 600000   -- Change this
WHERE monthly_revenue_goal = 0 AND yearly_revenue_goal = 0;
```

### Customize Chart Colors

Edit component file:
```typescript
// In components/HomePageRedesigned.tsx

// Line 292: Change bar colors
<Cell
  key={`cell-${index}`}
  fill={entry.signups >= entry.goal ? '#10b981' : '#dc2626'}
  //    ^ Green if met goal       ^ Red if below goal
/>

// Line 299: Change goal line color
<Line
  stroke="#8b5cf6"  // Purple goal line
  //     ^ Change this
/>
```

### Customize Status Thresholds

Edit the status calculation:
```typescript
// In server/routes/repGoalsRoutes.ts, line 133

const getStatus = (progress: number, daysRemaining: number, totalDays: number) => {
  const expectedProgress = ((totalDays - daysRemaining) / totalDays) * 100;
  if (progress >= 100) return 'completed';
  if (progress >= expectedProgress + 10) return 'ahead';      // ±10% threshold
  if (progress >= expectedProgress - 10) return 'on-track';
  return 'behind';
};
```

## Support & Maintenance

### Logs to Monitor

**Backend API Logs:**
```
✅ Rep goals fetch successful: user@example.com
✅ Rep goals progress calculated: 12/15 (80%)
❌ Rep goals fetch error: User not found
```

**Database Logs:**
```
✅ Migration 041: Revenue goal columns added!
📊 Columns: monthly_revenue_goal, yearly_revenue_goal
```

### Regular Maintenance

1. **Weekly**: Check API response times
2. **Monthly**: Verify Google Sheets sync is working
3. **Quarterly**: Review and update default goal values
4. **Yearly**: Archive old monthly metrics data

## Success Metrics

Track these to measure dashboard effectiveness:

1. **User Engagement**
   - Time spent on home dashboard
   - Click-through rate on quick actions
   - Return visits to dashboard

2. **Performance Impact**
   - Sales rep goal completion rate before/after
   - Number of reps checking dashboard daily
   - Correlation between dashboard usage and performance

3. **Technical Metrics**
   - API response time < 100ms
   - Page load time < 2s
   - Error rate < 0.1%

## Next Steps

After successful deployment:

1. **Gather Feedback**
   - Survey sales reps on dashboard usefulness
   - Monitor feature usage analytics
   - Collect improvement suggestions

2. **Iterate**
   - Add requested features (see Future Enhancements in DASHBOARD_REDESIGN.md)
   - Optimize based on usage patterns
   - Enhance visualizations

3. **Expand**
   - Team-level dashboards
   - Manager dashboards with team analytics
   - Mobile app integration (already Capacitor-ready)

---

**Deployment Contact:** Support team
**Emergency Rollback:** See "Rollback Plan" section above
**Documentation:** DASHBOARD_REDESIGN.md, DASHBOARD_PREVIEW.md

Last Updated: February 1, 2026
