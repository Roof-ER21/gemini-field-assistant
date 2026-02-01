# Goals Tracking Deployment Checklist

## Pre-Deployment

### 1. Database Backup
- [ ] Backup production database
  ```bash
  pg_dump -h <host> -U <user> -d <database> > backup_$(date +%Y%m%d_%H%M%S).sql
  ```

### 2. Review Migration
- [ ] Read `043_rep_goals_tracking.sql` thoroughly
- [ ] Verify foreign key relationships
- [ ] Check constraint logic
- [ ] Review trigger functions

### 3. Testing in Development
- [ ] Apply migration to dev database
  ```bash
  psql -h localhost -U postgres -d gemini_field_dev < database/migrations/043_rep_goals_tracking.sql
  ```
- [ ] Verify all tables created
  ```sql
  \dt rep_*
  \dt goal_*
  ```
- [ ] Check views exist
  ```sql
  \dv v_current_month_goals
  \dv v_yearly_goals_summary
  \dv v_goals_needing_setup
  ```
- [ ] Test triggers
  ```sql
  -- Test auto-calculate progress
  INSERT INTO rep_monthly_goals (sales_rep_id, goal_month, goal_year, signup_goal, deadline)
  VALUES (1, 2, 2026, 20, '2026-02-06 23:59:59');

  UPDATE rep_monthly_goals SET signups_actual = 10 WHERE sales_rep_id = 1;

  SELECT signup_progress_percent FROM rep_monthly_goals WHERE sales_rep_id = 1;
  -- Expected: 50.00
  ```

---

## Deployment Steps

### 1. Apply Migration
- [ ] Connect to production database
  ```bash
  psql -h <prod-host> -U <prod-user> -d gemini_field_prod
  ```
- [ ] Run migration
  ```bash
  \i /path/to/database/migrations/043_rep_goals_tracking.sql
  ```
- [ ] Verify success messages
  ```
  ✅ Migration 043: Rep Goals Tracking System
  ```

### 2. Verify Tables
- [ ] Check all tables created
  ```sql
  SELECT tablename FROM pg_tables
  WHERE tablename LIKE 'rep_%' OR tablename LIKE 'goal_%'
  ORDER BY tablename;
  ```
  Expected:
  - `goal_achievements`
  - `goal_deadline_reminders`
  - `goal_progress_snapshots`
  - `rep_monthly_goals`
  - `rep_yearly_goals`

### 3. Verify Views
- [ ] Check views created
  ```sql
  SELECT viewname FROM pg_views
  WHERE viewname LIKE 'v_%goal%'
  ORDER BY viewname;
  ```
  Expected:
  - `v_current_month_goals`
  - `v_yearly_goals_summary`
  - `v_goals_needing_setup`

### 4. Verify Indexes
- [ ] Check indexes created
  ```sql
  SELECT indexname FROM pg_indexes
  WHERE tablename LIKE 'rep_%' OR tablename LIKE 'goal_%'
  ORDER BY indexname;
  ```
  Should see indexes for:
  - Foreign keys (sales_rep_id)
  - Date lookups (goal_year, goal_month, snapshot_date)
  - Status filters (sent, acknowledged, status)

### 5. Verify Triggers
- [ ] Check triggers created
  ```sql
  SELECT trigger_name, event_object_table
  FROM information_schema.triggers
  WHERE trigger_name LIKE '%goal%'
  ORDER BY event_object_table;
  ```
  Expected:
  - `trigger_monthly_goals_updated_at`
  - `trigger_yearly_goals_updated_at`
  - `trigger_calculate_monthly_progress`
  - `trigger_calculate_yearly_progress`

### 6. Verify Seed Data
- [ ] Check yearly goals created
  ```sql
  SELECT COUNT(*) FROM rep_yearly_goals
  WHERE goal_year = EXTRACT(YEAR FROM CURRENT_DATE);
  ```
  Should match number of active sales reps

- [ ] Check monthly goals created
  ```sql
  SELECT COUNT(*) FROM rep_monthly_goals
  WHERE goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
    AND goal_year = EXTRACT(YEAR FROM CURRENT_DATE);
  ```
  Should match number of active sales reps

---

## Post-Deployment Configuration

### 1. Update Existing Goals (Optional)
- [ ] Set realistic monthly goals for current month
  ```sql
  UPDATE rep_monthly_goals
  SET
    signup_goal = 20,
    revenue_goal = 50000,
    bonus_tier_goal = 3,
    goal_set_at = NOW(),
    set_by_deadline = true
  WHERE goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
    AND goal_year = EXTRACT(YEAR FROM CURRENT_DATE)
    AND sales_rep_id IN (SELECT id FROM sales_reps WHERE is_active = true);
  ```

### 2. Set Yearly Revenue Goals
- [ ] Update yearly revenue goals (migration sets to 0 by default)
  ```sql
  UPDATE rep_yearly_goals
  SET yearly_revenue_goal = 600000 -- Adjust per rep
  WHERE goal_year = EXTRACT(YEAR FROM CURRENT_DATE);
  ```

### 3. Create Initial Snapshots
- [ ] Run manual snapshot creation
  ```sql
  INSERT INTO goal_progress_snapshots (
    sales_rep_id, snapshot_type, monthly_goal_id,
    signups_to_date, signup_goal, signup_progress_percent,
    revenue_to_date, revenue_goal, revenue_progress_percent,
    bonus_tier, days_remaining, on_pace, pace_indicator
  )
  SELECT
    rmg.sales_rep_id, 'ad_hoc', rmg.id,
    rmg.signups_actual, rmg.signup_goal, rmg.signup_progress_percent,
    rmg.revenue_actual, rmg.revenue_goal, rmg.revenue_progress_percent,
    rmg.bonus_tier_actual,
    EXTRACT(DAY FROM ((DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month') - CURRENT_DATE))::INTEGER,
    CASE WHEN rmg.signup_progress_percent >= 50 THEN true ELSE false END,
    CASE
      WHEN rmg.signup_progress_percent >= 100 THEN 'ahead'
      WHEN rmg.signup_progress_percent >= 50 THEN 'on_track'
      WHEN rmg.signup_progress_percent >= 25 THEN 'behind'
      ELSE 'critical'
    END
  FROM rep_monthly_goals rmg
  WHERE rmg.goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
    AND rmg.goal_year = EXTRACT(YEAR FROM CURRENT_DATE);
  ```

---

## Backend Integration

### 1. Install Dependencies
- [ ] Install node-cron for scheduled jobs
  ```bash
  npm install node-cron @types/node-cron
  ```

### 2. Add API Routes
- [ ] Create `server/routes/goals.ts` (see GOALS_API_IMPLEMENTATION.md)
- [ ] Register routes in `server/index.ts`
  ```typescript
  import goalsRouter from './routes/goals';
  app.use('/api/goals', goalsRouter);
  ```

### 3. Add Scheduled Jobs
- [ ] Create `server/jobs/goalsJobs.ts` (see GOALS_API_IMPLEMENTATION.md)
- [ ] Initialize jobs in `server/index.ts`
  ```typescript
  import { initializeGoalsJobs } from './jobs/goalsJobs';
  initializeGoalsJobs();
  ```

### 4. Test API Endpoints
- [ ] Test GET /api/goals/monthly/current
  ```bash
  curl -H "Authorization: Bearer <token>" http://localhost:5000/api/goals/monthly/current
  ```
- [ ] Test POST /api/goals/monthly/set
  ```bash
  curl -X POST -H "Authorization: Bearer <token>" \
       -H "Content-Type: application/json" \
       -d '{"signup_goal": 20, "revenue_goal": 50000}' \
       http://localhost:5000/api/goals/monthly/set
  ```
- [ ] Test GET /api/goals/yearly/current
- [ ] Test GET /api/goals/history
- [ ] Test GET /api/goals/pending-deadlines

---

## Frontend Integration

### 1. Create Hooks
- [ ] Create `client/src/hooks/useGoals.ts` (see GOALS_API_IMPLEMENTATION.md)
  - `useCurrentMonthGoal()`
  - `useYearlyGoal()`
  - `useSetMonthlyGoal()`

### 2. Create Components
- [ ] Monthly Goal Card component
- [ ] Yearly Goal Progress component
- [ ] Goal Setting Form component
- [ ] Achievement History component
- [ ] Admin Compliance Dashboard

### 3. Add to Navigation
- [ ] Add "Goals" section to sidebar/menu
- [ ] Add to rep dashboard
- [ ] Add admin section for compliance tracking

### 4. Test UI
- [ ] View current month goal
- [ ] Set new monthly goal
- [ ] View yearly progress
- [ ] View achievement history
- [ ] Admin: View all reps' goals
- [ ] Admin: View compliance report

---

## Monitoring & Alerts

### 1. Database Monitoring
- [ ] Set up monitoring for:
  - Table sizes (goal tables growing appropriately)
  - Query performance (check slow query log)
  - Index usage (ensure indexes being used)

### 2. Scheduled Job Monitoring
- [ ] Verify daily snapshot job runs
  ```sql
  SELECT COUNT(*), snapshot_date
  FROM goal_progress_snapshots
  WHERE snapshot_type = 'daily'
  GROUP BY snapshot_date
  ORDER BY snapshot_date DESC
  LIMIT 30;
  ```
  Should see one entry per day per active monthly goal

- [ ] Verify monthly goal creation job runs
  ```sql
  SELECT goal_month, goal_year, COUNT(*)
  FROM rep_monthly_goals
  GROUP BY goal_year, goal_month
  ORDER BY goal_year DESC, goal_month DESC;
  ```

### 3. Deadline Compliance
- [ ] Monitor overdue goals
  ```sql
  SELECT * FROM v_goals_needing_setup
  WHERE deadline_status = 'overdue';
  ```
- [ ] Set up alerts for:
  - Goals not set by 5th of month
  - Goals overdue
  - Reps consistently missing deadlines

---

## Data Integrity Checks

### 1. Foreign Key Validation
- [ ] Verify all foreign keys working
  ```sql
  -- Try to insert invalid sales_rep_id (should fail)
  INSERT INTO rep_monthly_goals (sales_rep_id, goal_month, goal_year, signup_goal, deadline)
  VALUES (99999, 2, 2026, 20, '2026-02-06 23:59:59');
  -- Expected: ERROR: violates foreign key constraint
  ```

### 2. Constraint Validation
- [ ] Test month constraint (1-12)
  ```sql
  -- Try invalid month (should fail)
  INSERT INTO rep_monthly_goals (sales_rep_id, goal_month, goal_year, signup_goal, deadline)
  VALUES (1, 13, 2026, 20, '2026-02-06 23:59:59');
  -- Expected: ERROR: violates check constraint
  ```

- [ ] Test bonus tier constraint (0-6)
  ```sql
  -- Try invalid tier (should fail)
  UPDATE rep_monthly_goals SET bonus_tier_goal = 10 WHERE id = 1;
  -- Expected: ERROR: violates check constraint
  ```

### 3. Unique Constraint Validation
- [ ] Test duplicate monthly goal (should fail)
  ```sql
  INSERT INTO rep_monthly_goals (sales_rep_id, goal_month, goal_year, signup_goal, deadline)
  VALUES (1, 2, 2026, 20, '2026-02-06 23:59:59');
  -- Second time with same rep/month/year
  INSERT INTO rep_monthly_goals (sales_rep_id, goal_month, goal_year, signup_goal, deadline)
  VALUES (1, 2, 2026, 25, '2026-02-06 23:59:59');
  -- Expected: ERROR: duplicate key violates unique constraint
  ```

---

## Performance Testing

### 1. Query Performance
- [ ] Test current month goals query (should be <50ms)
  ```sql
  EXPLAIN ANALYZE SELECT * FROM v_current_month_goals;
  ```

- [ ] Test progress snapshots query (should be <100ms)
  ```sql
  EXPLAIN ANALYZE
  SELECT * FROM goal_progress_snapshots
  WHERE sales_rep_id = 1
  ORDER BY snapshot_date DESC
  LIMIT 30;
  ```

### 2. Index Usage
- [ ] Verify indexes being used
  ```sql
  EXPLAIN ANALYZE
  SELECT * FROM rep_monthly_goals
  WHERE sales_rep_id = 1
    AND goal_year = 2026
    AND goal_month = 2;
  ```
  Should show: `Index Scan using idx_monthly_goals_rep_period`

### 3. Bulk Operations
- [ ] Test bulk snapshot creation (all reps)
  - Time the daily snapshot job
  - Should complete in <5 seconds for 100 reps

---

## Security Checks

### 1. Permission Validation
- [ ] Non-admins can only see their own goals
  ```sql
  -- Create test user without admin role
  -- Try to access another rep's goals
  -- Should be filtered by sales_rep_id
  ```

- [ ] Admins can see all goals
  ```sql
  -- Admin query should return all reps
  SELECT COUNT(*) FROM v_current_month_goals;
  ```

### 2. SQL Injection Prevention
- [ ] All API endpoints use parameterized queries
- [ ] No string concatenation in SQL
- [ ] Test with malicious input
  ```bash
  curl -X POST -H "Authorization: Bearer <token>" \
       -H "Content-Type: application/json" \
       -d '{"signup_goal": "20; DROP TABLE rep_monthly_goals;"}' \
       http://localhost:5000/api/goals/monthly/set
  # Should fail validation, not execute SQL
  ```

---

## Documentation

### 1. Update README
- [ ] Add Goals Tracking section to main README
- [ ] Link to migration documentation
- [ ] Add API endpoint documentation

### 2. User Guide
- [ ] Create user guide for reps
  - How to set monthly goals
  - Understanding deadline compliance
  - Viewing progress and achievements

### 3. Admin Guide
- [ ] Create admin guide
  - Monitoring goal compliance
  - Setting goals for reps
  - Understanding reports

---

## Rollback Plan

### In Case of Issues

1. **Stop scheduled jobs**
   ```typescript
   // Comment out in server/index.ts
   // initializeGoalsJobs();
   ```

2. **Remove API routes** (if causing issues)
   ```typescript
   // Comment out in server/index.ts
   // app.use('/api/goals', goalsRouter);
   ```

3. **Rollback migration** (last resort)
   ```sql
   -- Drop views
   DROP VIEW IF EXISTS v_goals_needing_setup;
   DROP VIEW IF EXISTS v_yearly_goals_summary;
   DROP VIEW IF EXISTS v_current_month_goals;

   -- Drop triggers
   DROP TRIGGER IF EXISTS trigger_calculate_yearly_progress ON rep_yearly_goals;
   DROP TRIGGER IF EXISTS trigger_calculate_monthly_progress ON rep_monthly_goals;
   DROP TRIGGER IF EXISTS trigger_yearly_goals_updated_at ON rep_yearly_goals;
   DROP TRIGGER IF EXISTS trigger_monthly_goals_updated_at ON rep_monthly_goals;

   -- Drop functions
   DROP FUNCTION IF EXISTS calculate_yearly_goal_progress();
   DROP FUNCTION IF EXISTS calculate_monthly_goal_progress();
   DROP FUNCTION IF EXISTS update_monthly_goals_timestamp();

   -- Drop tables
   DROP TABLE IF EXISTS goal_deadline_reminders;
   DROP TABLE IF EXISTS goal_achievements;
   DROP TABLE IF EXISTS goal_progress_snapshots;
   DROP TABLE IF EXISTS rep_yearly_goals;
   DROP TABLE IF EXISTS rep_monthly_goals;
   ```

4. **Restore from backup**
   ```bash
   psql -h <host> -U <user> -d <database> < backup_YYYYMMDD_HHMMSS.sql
   ```

---

## Success Criteria

### ✅ Deployment Successful When:

- [ ] All 5 tables created successfully
- [ ] All 3 views working correctly
- [ ] All 4 triggers firing properly
- [ ] Seed data populated for all active reps
- [ ] API endpoints responding correctly
- [ ] Scheduled jobs running on schedule
- [ ] UI components displaying data
- [ ] No performance degradation
- [ ] No errors in application logs
- [ ] Admin can view compliance report
- [ ] Reps can set and view their goals

---

## Timeline Estimate

| Phase | Duration | Notes |
|-------|----------|-------|
| Pre-Deployment Testing | 2-4 hours | Dev environment testing |
| Migration Deployment | 15-30 min | Includes verification |
| Backend Integration | 2-4 hours | API routes + jobs |
| Frontend Integration | 4-6 hours | Components + hooks |
| Testing & QA | 2-3 hours | Full user flow testing |
| Monitoring Setup | 1-2 hours | Alerts + dashboards |
| **Total** | **12-20 hours** | Spread over 2-3 days |

---

## Support & Troubleshooting

### Common Issues

1. **Migration fails on foreign key**
   - Ensure sales_reps table exists
   - Ensure users table exists with UUID primary key

2. **Triggers not firing**
   - Check function definitions exist
   - Verify trigger attached to correct events

3. **Views return no data**
   - Check sales_reps has active reps
   - Verify seed data populated

4. **API returns 404 for rep**
   - Check user_sales_rep_mapping table
   - Verify email matching logic

5. **Scheduled jobs not running**
   - Check node-cron installed
   - Verify jobs initialized in server startup
   - Check server logs for errors

---

## Contacts

- **Database Issues**: Check migration files in `/database/migrations/`
- **API Issues**: See `GOALS_API_IMPLEMENTATION.md`
- **Schema Questions**: See `GOALS_SCHEMA_DIAGRAM.md`
- **General Questions**: See `README_043_REP_GOALS.md`

---

**Deployment Date**: _____________
**Deployed By**: _____________
**Production Database**: _____________
**Rollback Plan Reviewed**: [ ] Yes [ ] No
**Backup Created**: [ ] Yes [ ] No

---

## Post-Deployment Checklist

**Week 1:**
- [ ] Monitor daily snapshot creation
- [ ] Check for any errors in logs
- [ ] Verify reps setting goals before deadline
- [ ] Gather user feedback

**Week 2:**
- [ ] Review query performance
- [ ] Optimize slow queries if needed
- [ ] Check achievement records being created
- [ ] Monitor compliance metrics

**Month 1:**
- [ ] Analyze monthly rollover process
- [ ] Review goal completion rates
- [ ] Identify any needed improvements
- [ ] Plan for bonus tier integration enhancements
