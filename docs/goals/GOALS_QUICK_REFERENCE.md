# Goals Tracking Quick Reference Card

## 🎯 Tables at a Glance

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `rep_monthly_goals` | Monthly signup/revenue goals | `sales_rep_id`, `goal_month`, `goal_year`, `signup_goal`, `deadline` |
| `rep_yearly_goals` | Annual targets | `sales_rep_id`, `goal_year`, `yearly_signup_goal`, `yearly_revenue_goal` |
| `goal_progress_snapshots` | Daily/weekly tracking | `sales_rep_id`, `snapshot_date`, `snapshot_type`, `pace_indicator` |
| `goal_achievements` | Historical records | `sales_rep_id`, `achievement_type`, `achievement_date` |
| `goal_deadline_reminders` | Deadline notifications | `sales_rep_id`, `reminder_type`, `deadline`, `sent` |

---

## 📊 Quick Views

```sql
-- Current month progress for all reps
SELECT * FROM v_current_month_goals;

-- Yearly goals summary
SELECT * FROM v_yearly_goals_summary;

-- Goals needing to be set
SELECT * FROM v_goals_needing_setup WHERE deadline_status = 'overdue';
```

---

## 🔥 Common Queries

### Get Current Month Goal for Rep

```sql
SELECT * FROM v_current_month_goals WHERE sales_rep_id = :rep_id;
```

### Set Monthly Goal

```sql
INSERT INTO rep_monthly_goals (
  sales_rep_id, goal_month, goal_year, signup_goal, revenue_goal,
  bonus_tier_goal, deadline, goal_set_at, goal_set_by, set_by_deadline
)
VALUES (
  :rep_id,
  EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER,
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  :signup_goal,
  :revenue_goal,
  :bonus_tier_goal,
  DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '5 days 23 hours 59 minutes',
  NOW(),
  :user_id,
  NOW() <= (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '5 days 23 hours 59 minutes')
)
ON CONFLICT (sales_rep_id, goal_year, goal_month)
DO UPDATE SET
  signup_goal = EXCLUDED.signup_goal,
  revenue_goal = EXCLUDED.revenue_goal,
  bonus_tier_goal = EXCLUDED.bonus_tier_goal,
  goal_set_at = NOW(),
  set_by_deadline = EXCLUDED.set_by_deadline;
```

### Update Progress

```sql
UPDATE rep_monthly_goals
SET
  signups_actual = :signups,
  revenue_actual = :revenue,
  bonus_tier_actual = :bonus_tier
WHERE sales_rep_id = :rep_id
  AND goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
  AND goal_year = EXTRACT(YEAR FROM CURRENT_DATE);
```

### Check if On Pace

```sql
SELECT
  rep_name,
  signups_actual,
  signup_goal,
  (EXTRACT(DAY FROM CURRENT_DATE)::DECIMAL / 30 * signup_goal) as expected_by_today,
  CASE
    WHEN signups_actual >= (EXTRACT(DAY FROM CURRENT_DATE)::DECIMAL / 30 * signup_goal)
    THEN 'On Pace'
    ELSE 'Behind Pace'
  END as pace_status
FROM v_current_month_goals
WHERE sales_rep_id = :rep_id;
```

### Get Achievement History

```sql
SELECT * FROM goal_achievements
WHERE sales_rep_id = :rep_id
ORDER BY achievement_date DESC
LIMIT 20;
```

### Find Overdue Goals

```sql
SELECT * FROM v_goals_needing_setup
WHERE deadline_status = 'overdue';
```

---

## 🚀 API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/goals/monthly/current` | Current month goal | Rep/Admin |
| GET | `/api/goals/yearly/current` | Current year goal | Rep/Admin |
| GET | `/api/goals/history` | Achievement history | Rep/Admin |
| GET | `/api/goals/pending-deadlines` | Pending goal setups | Rep/Admin |
| GET | `/api/goals/progress/:month/:year` | Progress snapshots | Rep/Admin |
| POST | `/api/goals/monthly/set` | Set monthly goal | Rep/Admin |
| POST | `/api/goals/yearly/set` | Set yearly goal | Rep/Admin |
| PUT | `/api/goals/monthly/progress` | Update progress | Rep/Admin |
| GET | `/api/goals/admin/all-monthly` | All monthly goals | Admin only |
| GET | `/api/goals/admin/compliance` | Compliance report | Admin only |

---

## ⚡ React Hooks

```typescript
import { useCurrentMonthGoal, useYearlyGoal, useSetMonthlyGoal } from '@/hooks/useGoals';

// In component
const { goal, loading, error, refetch } = useCurrentMonthGoal();
const { goal: yearlyGoal } = useYearlyGoal();
const { setMonthlyGoal, loading: setting } = useSetMonthlyGoal();

// Set goal
await setMonthlyGoal({
  signup_goal: 20,
  revenue_goal: 50000,
  bonus_tier_goal: 3
});
```

---

## 🤖 Trigger Behavior

### Auto-Calculate Progress (rep_monthly_goals)

```
BEFORE INSERT OR UPDATE:
  - signup_progress_percent = (signups_actual / signup_goal) * 100
  - revenue_progress_percent = (revenue_actual / revenue_goal) * 100
  - If both >= 100%: status = 'completed', completed_at = NOW()
```

### Auto-Calculate Progress (rep_yearly_goals)

```
BEFORE INSERT OR UPDATE:
  - yearly_signup_progress_percent = (yearly_signups_actual / yearly_signup_goal) * 100
  - yearly_revenue_progress_percent = (yearly_revenue_actual / yearly_revenue_goal) * 100
  - If both >= 100%: status = 'completed', completed_at = NOW()
```

---

## 📅 Important Dates

| Event | Date | Description |
|-------|------|-------------|
| **Goal Deadline** | 6th at midnight | Monthly goals must be set by this time |
| **Monthly Rollover** | 1st at 1 AM | New monthly goals created automatically |
| **Daily Snapshot** | Every day at midnight | Progress snapshots created |
| **Reminder: 3 Days** | 3rd of month | First deadline reminder |
| **Reminder: 1 Day** | 5th of month | Second deadline reminder |
| **Reminder: Deadline Day** | 6th of month | Final deadline reminder |

---

## 🎮 Status Values

### Monthly Goal Status
- `active` - Currently tracking
- `completed` - Both signup and revenue goals met
- `missed` - Month ended without completion
- `archived` - Historical record

### Deadline Status (from view)
- `not_set` - No goal record exists
- `pending` - Goal exists but not set by deadline yet (before 6th)
- `overdue` - Past deadline and not set
- `complete` - Goal set by deadline

### Health Status (from view)
- `completed` - 100%+ progress
- `on_track` - 75-99% progress
- `needs_attention` - 50-74% progress
- `critical` - Below 50% progress

### Pace Indicator
- `ahead` - Exceeding expected pace
- `on_track` - Meeting expected pace
- `behind` - Below expected pace
- `critical` - Significantly behind

---

## 💰 Bonus Tiers

Tiers: **0-6** (configurable per business rules)

Example structure:
```
Tier 0: Base (0-14 signups)
Tier 1: Bronze (15-19 signups)
Tier 2: Silver (20-24 signups)
Tier 3: Gold (25-29 signups)
Tier 4: Platinum (30-39 signups)
Tier 5: Diamond (40-49 signups)
Tier 6: Elite (50+ signups)
```

---

## 🔍 Performance Tips

### Use Indexes
```sql
-- Monthly goal by rep and period (fastest lookup)
WHERE sales_rep_id = ? AND goal_year = ? AND goal_month = ?
-- Uses: idx_monthly_goals_rep_period

-- Progress snapshots for rep (trend charts)
WHERE sales_rep_id = ? ORDER BY snapshot_date DESC
-- Uses: idx_progress_snapshots_rep_date

-- Unsent reminders
WHERE sent = false
-- Uses: idx_deadline_reminders_sent (partial index)
```

### Use Views
```sql
-- Instead of complex JOIN
SELECT * FROM v_current_month_goals WHERE sales_rep_id = ?;

-- Instead of calculating deadline status
SELECT * FROM v_goals_needing_setup WHERE deadline_status = 'overdue';
```

---

## 🐛 Debugging

### Check Trigger Execution

```sql
-- Insert test goal
INSERT INTO rep_monthly_goals (sales_rep_id, goal_month, goal_year, signup_goal, deadline)
VALUES (1, 2, 2026, 20, '2026-02-06 23:59:59');

-- Update progress (should auto-calculate)
UPDATE rep_monthly_goals SET signups_actual = 10 WHERE id = LAST_INSERT_ID;

-- Verify auto-calculation
SELECT signup_progress_percent FROM rep_monthly_goals WHERE id = LAST_INSERT_ID;
-- Expected: 50.00
```

### Check View Data

```sql
-- If view returns no data
SELECT COUNT(*) FROM sales_reps WHERE is_active = true;
-- Should have active reps

SELECT COUNT(*) FROM rep_monthly_goals
WHERE goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
  AND goal_year = EXTRACT(YEAR FROM CURRENT_DATE);
-- Should match number of active reps
```

### Check Foreign Keys

```sql
-- Get rep_id from user
SELECT sr.id
FROM sales_reps sr
LEFT JOIN user_sales_rep_mapping usrm ON usrm.sales_rep_id = sr.id
WHERE sr.email = 'user@example.com' OR usrm.user_id = 'uuid-here';
```

---

## 🛠️ Maintenance

### Monthly Cleanup (run at end of month)

```sql
-- Archive completed goals older than 1 year
UPDATE rep_monthly_goals
SET status = 'archived'
WHERE status = 'completed'
  AND goal_year < EXTRACT(YEAR FROM CURRENT_DATE) - 1;

-- Clean up old snapshots (keep 90 days)
DELETE FROM goal_progress_snapshots
WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days';

-- Clean up old reminders (keep 6 months)
DELETE FROM goal_deadline_reminders
WHERE created_at < CURRENT_DATE - INTERVAL '6 months'
  AND sent = true
  AND acknowledged = true;
```

### Performance Check

```sql
-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'rep_%' OR tablename LIKE 'goal_%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check slow queries
EXPLAIN ANALYZE SELECT * FROM v_current_month_goals;
```

---

## 📝 Example Workflow

### Rep Setting Monthly Goal

```typescript
// 1. Fetch current goal
const { goal } = useCurrentMonthGoal();

// 2. Check if deadline passed
if (goal && new Date() > new Date(goal.deadline)) {
  alert('Warning: Setting goal after deadline');
}

// 3. Set goal
await setMonthlyGoal({
  signup_goal: 25,
  revenue_goal: 60000,
  bonus_tier_goal: 4
});

// 4. Refresh data
refetch();
```

### Admin Checking Compliance

```typescript
// 1. Get overdue goals
const response = await fetch('/api/goals/pending-deadlines');
const overdue = response.data.filter(g => g.deadline_status === 'overdue');

// 2. Send reminders
for (const goal of overdue) {
  await sendReminder(goal.sales_rep_id, goal.rep_name);
}
```

### System Updating Progress (Daily Job)

```typescript
// 1. Fetch latest signups from Google Sheets
const signups = await fetchFromSheets();

// 2. Update monthly goals
for (const rep of signups) {
  await pool.query(`
    UPDATE rep_monthly_goals
    SET signups_actual = $1, revenue_actual = $2
    WHERE sales_rep_id = $3
      AND goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
      AND goal_year = EXTRACT(YEAR FROM CURRENT_DATE)
  `, [rep.signups, rep.revenue, rep.id]);
}

// 3. Create snapshots (triggers auto-calculate progress)
await createDailySnapshots();
```

---

## 🎓 Tips & Tricks

### 1. Check if Rep Met Goal
```sql
SELECT status = 'completed' as met_goal
FROM rep_monthly_goals
WHERE sales_rep_id = :rep_id
  AND goal_month = :month
  AND goal_year = :year;
```

### 2. Get Top Performers vs Goal
```sql
SELECT rep_name, signup_progress_percent
FROM v_current_month_goals
WHERE signup_progress_percent >= 100
ORDER BY signup_progress_percent DESC;
```

### 3. Calculate Bonus Amount
```sql
SELECT
  rep_name,
  bonus_tier_actual,
  CASE bonus_tier_actual
    WHEN 6 THEN 5000
    WHEN 5 THEN 3000
    WHEN 4 THEN 2000
    WHEN 3 THEN 1000
    WHEN 2 THEN 500
    WHEN 1 THEN 250
    ELSE 0
  END as bonus_amount
FROM v_current_month_goals
WHERE bonus_tier_actual > 0;
```

### 4. Trend Analysis
```sql
-- Get last 30 days of progress
SELECT
  snapshot_date,
  signup_progress_percent,
  pace_indicator
FROM goal_progress_snapshots
WHERE sales_rep_id = :rep_id
  AND snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY snapshot_date ASC;
```

---

## 🔗 Related Documentation

- **Full README**: `README_043_REP_GOALS.md`
- **API Implementation**: `GOALS_API_IMPLEMENTATION.md`
- **Schema Diagram**: `GOALS_SCHEMA_DIAGRAM.md`
- **Deployment Checklist**: `GOALS_DEPLOYMENT_CHECKLIST.md`
- **Migration File**: `043_rep_goals_tracking.sql`

---

## 📞 Support

If you encounter issues:
1. Check migration was applied: `SELECT * FROM rep_monthly_goals LIMIT 1;`
2. Check triggers exist: `\df calculate_monthly_goal_progress`
3. Check views exist: `\dv v_current_month_goals`
4. Check indexes: `\di idx_monthly_goals_rep_period`

---

**Last Updated**: 2026-02-01
**Migration Version**: 043
**Dependencies**: Migration 038 (sales_reps table)
