# Migration 043: Rep Goals Tracking System

## Overview

Comprehensive goal management system for sales representatives tracking monthly signups, yearly revenue, bonus tiers, and goal-setting compliance.

## Database Schema

### Tables Created

#### 1. `rep_monthly_goals`
Monthly goals that must be set by midnight of the 6th of each month.

**Key Columns:**
- `sales_rep_id` - Link to sales_reps table
- `goal_month`, `goal_year` - Time period
- `signup_goal`, `signups_actual` - Signup tracking
- `revenue_goal`, `revenue_actual` - Revenue tracking
- `bonus_tier_goal`, `bonus_tier_actual` - Bonus tier (0-6)
- `set_by_deadline` - Compliance flag (set by 6th?)
- `deadline` - Midnight of the 6th of the month
- `status` - 'active', 'completed', 'missed', 'archived'

**Unique Constraint:** One goal per rep per month

#### 2. `rep_yearly_goals`
Annual revenue and signup targets.

**Key Columns:**
- `sales_rep_id` - Link to sales_reps table
- `goal_year` - Year
- `yearly_signup_goal`, `yearly_signups_actual` - Annual signup tracking
- `yearly_revenue_goal`, `yearly_revenue_actual` - Annual revenue tracking
- `monthly_signup_target` - Auto-calculated (yearly_goal / 12)
- `monthly_revenue_target` - Auto-calculated (yearly_goal / 12)
- `status` - 'active', 'completed', 'missed', 'archived'

**Unique Constraint:** One goal per rep per year

#### 3. `goal_progress_snapshots`
Daily/weekly snapshots for trend analysis.

**Key Columns:**
- `sales_rep_id` - Link to sales_reps table
- `snapshot_date`, `snapshot_type` - When and what kind of snapshot
- `monthly_goal_id` - Link to monthly goal
- `signups_to_date`, `revenue_to_date` - Current progress
- `on_pace` - Boolean indicator
- `pace_indicator` - 'ahead', 'on_track', 'behind', 'critical'

#### 4. `goal_achievements`
Historical record of completed goals.

**Key Columns:**
- `sales_rep_id` - Link to sales_reps table
- `monthly_goal_id`, `yearly_goal_id` - Links to goal records
- `achievement_type` - Type of achievement
  - 'monthly_signup_goal'
  - 'monthly_revenue_goal'
  - 'yearly_signup_goal'
  - 'yearly_revenue_goal'
  - 'bonus_tier_unlocked'
  - 'streak_milestone'
  - 'perfect_month'
- `achievement_date` - When achieved
- `bonus_amount` - Bonus earned
- `recognized` - Has this been acknowledged?

#### 5. `goal_deadline_reminders`
Tracks deadline reminders and compliance.

**Key Columns:**
- `sales_rep_id` - Link to sales_reps table
- `reminder_type` - Type of reminder
  - 'goal_deadline_3days'
  - 'goal_deadline_1day'
  - 'goal_deadline_day'
  - 'goal_overdue'
- `target_month`, `target_year` - Which month's goals
- `deadline` - When the goal must be set
- `sent`, `acknowledged` - Tracking status

---

## Views Created

### `v_current_month_goals`
Shows current month's goals and progress for all active reps.

**Columns:**
- Rep information (id, name, email, team)
- Goal details (signup_goal, revenue_goal, etc.)
- Progress percentages
- `health_status` - 'completed', 'on_track', 'needs_attention', 'critical'
- `days_until_deadline` - Days remaining to set goal

**Usage:**
```sql
-- See all reps' current month progress
SELECT * FROM v_current_month_goals
ORDER BY signup_progress_percent DESC;

-- See reps who need attention
SELECT * FROM v_current_month_goals
WHERE health_status IN ('needs_attention', 'critical');
```

### `v_yearly_goals_summary`
Annual goal progress for all active reps.

**Columns:**
- Rep information
- Yearly goals and actuals
- Progress percentages
- Monthly targets (auto-calculated)
- `months_remaining` - Months left in year

**Usage:**
```sql
-- See yearly progress
SELECT * FROM v_yearly_goals_summary
ORDER BY yearly_signup_progress_percent DESC;

-- Calculate if on pace
SELECT
    rep_name,
    yearly_signup_goal,
    yearly_signups_actual,
    monthly_signup_target * current_month as expected_by_now,
    CASE
        WHEN yearly_signups_actual >= (monthly_signup_target * current_month) THEN 'On Pace'
        ELSE 'Behind Pace'
    END as pace_status
FROM v_yearly_goals_summary;
```

### `v_goals_needing_setup`
Shows reps who haven't set their monthly goals yet.

**Columns:**
- Rep information
- Current month/year
- `deadline_status` - 'not_set', 'pending', 'overdue', 'complete'
- `days_until_deadline` - Days until 6th of month deadline

**Usage:**
```sql
-- Find overdue goal settings
SELECT * FROM v_goals_needing_setup
WHERE deadline_status = 'overdue';

-- Find goals due soon
SELECT * FROM v_goals_needing_setup
WHERE deadline_status = 'pending'
AND days_until_deadline <= 3;
```

---

## Triggers

### 1. Auto-Update Timestamps
- `trigger_monthly_goals_updated_at` - Updates `updated_at` on rep_monthly_goals
- `trigger_yearly_goals_updated_at` - Updates `updated_at` on rep_yearly_goals

### 2. Auto-Calculate Progress
- `trigger_calculate_monthly_progress` - Calculates progress percentages for monthly goals
  - Updates `signup_progress_percent`
  - Updates `revenue_progress_percent`
  - Auto-sets `status = 'completed'` when both reach 100%

- `trigger_calculate_yearly_progress` - Calculates progress percentages for yearly goals
  - Updates `yearly_signup_progress_percent`
  - Updates `yearly_revenue_progress_percent`
  - Auto-sets `status = 'completed'` when both reach 100%

---

## Seed Data

The migration automatically:

1. **Creates yearly goals** for all active reps for the current year
   - Uses existing `yearly_signup_goal` from sales_reps table
   - Sets `revenue_goal` to 0 (to be set manually)

2. **Creates monthly goal templates** for current month
   - Uses existing `monthly_signup_goal` from sales_reps table
   - Sets deadline to midnight of the 6th of current month
   - Initializes with `set_by_deadline = false`

---

## Usage Examples

### Setting Monthly Goals

```sql
-- Set monthly goals for a rep (by admin or rep themselves)
UPDATE rep_monthly_goals
SET
    signup_goal = 20,
    revenue_goal = 50000,
    bonus_tier_goal = 3,
    goal_set_at = NOW(),
    goal_set_by = '123e4567-e89b-12d3-a456-426614174000', -- user UUID
    set_by_deadline = CASE
        WHEN NOW() <= deadline THEN true
        ELSE false
    END
WHERE sales_rep_id = 1
    AND goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
    AND goal_year = EXTRACT(YEAR FROM CURRENT_DATE);
```

### Updating Progress

```sql
-- Update actual signups (triggers auto-calculate progress)
UPDATE rep_monthly_goals
SET signups_actual = 15
WHERE sales_rep_id = 1
    AND goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
    AND goal_year = EXTRACT(YEAR FROM CURRENT_DATE);

-- Update actual revenue
UPDATE rep_monthly_goals
SET revenue_actual = 45000
WHERE sales_rep_id = 1
    AND goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
    AND goal_year = EXTRACT(YEAR FROM CURRENT_DATE);
```

### Creating Progress Snapshots

```sql
-- Create daily snapshot for all active monthly goals
INSERT INTO goal_progress_snapshots (
    sales_rep_id,
    snapshot_type,
    monthly_goal_id,
    signups_to_date,
    signup_goal,
    signup_progress_percent,
    revenue_to_date,
    revenue_goal,
    revenue_progress_percent,
    bonus_tier,
    days_remaining,
    on_pace,
    pace_indicator
)
SELECT
    rmg.sales_rep_id,
    'daily',
    rmg.id,
    rmg.signups_actual,
    rmg.signup_goal,
    rmg.signup_progress_percent,
    rmg.revenue_actual,
    rmg.revenue_goal,
    rmg.revenue_progress_percent,
    rmg.bonus_tier_actual,
    EXTRACT(DAY FROM (
        (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month') - CURRENT_DATE
    ))::INTEGER,
    CASE
        WHEN rmg.signup_progress_percent >= (
            (EXTRACT(DAY FROM CURRENT_DATE)::DECIMAL /
             EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'))::DECIMAL) * 100
        ) THEN true
        ELSE false
    END,
    CASE
        WHEN rmg.signup_progress_percent >= 100 THEN 'ahead'
        WHEN rmg.signup_progress_percent >= (EXTRACT(DAY FROM CURRENT_DATE)::DECIMAL / 30 * 100) THEN 'on_track'
        WHEN rmg.signup_progress_percent >= 50 THEN 'behind'
        ELSE 'critical'
    END
FROM rep_monthly_goals rmg
WHERE rmg.goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
    AND rmg.goal_year = EXTRACT(YEAR FROM CURRENT_DATE)
    AND rmg.status = 'active';
```

### Recording Achievements

```sql
-- Record monthly goal achievement
INSERT INTO goal_achievements (
    sales_rep_id,
    monthly_goal_id,
    achievement_type,
    achievement_date,
    achievement_month,
    achievement_year,
    goal_value,
    actual_value,
    percent_achieved,
    bonus_amount,
    bonus_tier
)
SELECT
    rmg.sales_rep_id,
    rmg.id,
    'monthly_signup_goal',
    CURRENT_DATE,
    rmg.goal_month,
    rmg.goal_year,
    rmg.signup_goal,
    rmg.signups_actual,
    rmg.signup_progress_percent,
    rmg.bonus_amount,
    rmg.bonus_tier_actual
FROM rep_monthly_goals rmg
WHERE rmg.status = 'completed'
    AND NOT EXISTS (
        SELECT 1 FROM goal_achievements ga
        WHERE ga.monthly_goal_id = rmg.id
            AND ga.achievement_type = 'monthly_signup_goal'
    );
```

### Creating Deadline Reminders

```sql
-- Create reminders for next month's goals (run on 1st of month)
WITH next_month AS (
    SELECT
        (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month') as month_start,
        EXTRACT(MONTH FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'))::INTEGER as month,
        EXTRACT(YEAR FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'))::INTEGER as year
)
INSERT INTO goal_deadline_reminders (
    sales_rep_id,
    reminder_type,
    target_month,
    target_year,
    deadline
)
SELECT
    sr.id,
    reminder_type,
    nm.month,
    nm.year,
    CASE reminder_type
        WHEN 'goal_deadline_3days' THEN nm.month_start + INTERVAL '2 days 12 hours'
        WHEN 'goal_deadline_1day' THEN nm.month_start + INTERVAL '4 days 12 hours'
        WHEN 'goal_deadline_day' THEN nm.month_start + INTERVAL '5 days 12 hours'
    END as deadline
FROM sales_reps sr
CROSS JOIN next_month nm
CROSS JOIN (
    VALUES ('goal_deadline_3days'), ('goal_deadline_1day'), ('goal_deadline_day')
) AS reminder_types(reminder_type)
WHERE sr.is_active = true;
```

---

## Integration Points

### With Existing Tables

1. **sales_reps** - Foreign key relationship
   - Existing columns: `monthly_signup_goal`, `yearly_signup_goal`, `goal_progress`
   - Can be used as defaults when creating new goals

2. **users** - For tracking who sets goals
   - `goal_set_by` references users table
   - Admin features can use this for audit trail

3. **leaderboard_snapshots** - Can correlate with goal progress
   - Compare actual performance against goals
   - Identify high performers vs goal achievers

### Recommended Scheduled Jobs

1. **Daily Snapshot Job** (runs at midnight)
   - Create daily progress snapshots for all active monthly goals
   - Update `on_pace` and `pace_indicator` fields

2. **Monthly Goal Creation** (runs on 1st of month)
   - Create new monthly goal records for all active reps
   - Set deadline to 6th of month at midnight
   - Create deadline reminders

3. **Deadline Reminder Job** (runs multiple times daily)
   - Check for unsent reminders where deadline is approaching
   - Send notifications to reps who haven't set goals
   - Mark overdue goals

4. **Achievement Detection** (runs daily)
   - Check for newly completed goals
   - Create achievement records
   - Trigger recognition/notifications

5. **Monthly Rollup** (runs on last day of month)
   - Update yearly goals with monthly actuals
   - Archive completed monthly goals
   - Generate monthly reports

---

## API Endpoint Suggestions

### GET Endpoints

```
GET /api/goals/monthly/current
  - Returns current month goals for logged-in rep
  - Uses v_current_month_goals view

GET /api/goals/yearly/current
  - Returns current year goals for logged-in rep
  - Uses v_yearly_goals_summary view

GET /api/goals/history/:repId
  - Returns goal achievement history
  - Queries goal_achievements table

GET /api/goals/pending-deadlines
  - Returns goals needing to be set
  - Uses v_goals_needing_setup view
  - Admin only or filtered by rep

GET /api/goals/progress/:repId/:month/:year
  - Returns progress snapshots for specific month
  - Queries goal_progress_snapshots table
```

### POST Endpoints

```
POST /api/goals/monthly/set
  Body: { signup_goal, revenue_goal, bonus_tier_goal }
  - Sets monthly goals for current rep
  - Validates deadline compliance
  - Updates set_by_deadline flag

POST /api/goals/yearly/set
  Body: { yearly_signup_goal, yearly_revenue_goal }
  - Sets yearly goals for current rep or admin sets for others
  - Creates or updates rep_yearly_goals record

POST /api/goals/snapshot
  Body: { rep_id, snapshot_type }
  - Manually create progress snapshot
  - For ad_hoc tracking
```

### PUT Endpoints

```
PUT /api/goals/monthly/progress
  Body: { signups_actual, revenue_actual, bonus_tier_actual }
  - Updates current month progress
  - Triggers auto-calculation of percentages
  - Synced with sheets_sync_log

PUT /api/goals/acknowledge-reminder/:reminderId
  - Mark deadline reminder as acknowledged
  - Sets acknowledged = true and acknowledged_at timestamp
```

---

## Dashboard Components

### Rep Dashboard Widgets

1. **Current Month Goal Card**
   - Progress bars for signups and revenue
   - Bonus tier indicator
   - Days remaining in month
   - "On Pace" indicator

2. **Yearly Goal Progress**
   - Annual targets vs actuals
   - Month-by-month breakdown
   - Projected year-end based on current pace

3. **Goal Setting Alert**
   - Shows if current month goal not set
   - Countdown to 6th of month deadline
   - Quick-set form

4. **Achievement History**
   - List of completed goals
   - Badges/recognition
   - Streak indicators

### Admin Dashboard

1. **Goals Compliance Overview**
   - List of reps who haven't set goals
   - Overdue goal settings
   - Deadline countdown

2. **Team Goals Summary**
   - Aggregate team progress
   - Top performers vs goal
   - Struggling reps needing support

3. **Achievement Feed**
   - Recent goal completions
   - Bonus tier unlocks
   - Perfect months

---

## Bonus Tier Integration

Current bonus tiers (0-6) in sales_reps table:
- Track `bonus_tier_goal` in monthly goals
- Track `bonus_tier_actual` based on performance
- When tier unlocked, create achievement record
- Calculate `bonus_amount` based on tier rules

Example bonus calculation (update with actual rules):
```sql
UPDATE rep_monthly_goals
SET
    bonus_tier_actual = CASE
        WHEN signups_actual >= 50 THEN 6
        WHEN signups_actual >= 40 THEN 5
        WHEN signups_actual >= 30 THEN 4
        WHEN signups_actual >= 25 THEN 3
        WHEN signups_actual >= 20 THEN 2
        WHEN signups_actual >= 15 THEN 1
        ELSE 0
    END,
    bonus_triggered = CASE
        WHEN signups_actual >= bonus_tier_goal * 5 THEN true
        ELSE false
    END
WHERE goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
    AND goal_year = EXTRACT(YEAR FROM CURRENT_DATE);
```

---

## Migration Rollback

To rollback this migration:

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

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS goal_deadline_reminders;
DROP TABLE IF EXISTS goal_achievements;
DROP TABLE IF EXISTS goal_progress_snapshots;
DROP TABLE IF EXISTS rep_yearly_goals;
DROP TABLE IF EXISTS rep_monthly_goals;
```

---

## Testing

### Test Scenarios

1. **Create monthly goal before deadline**
   - Should set `set_by_deadline = true`

2. **Create monthly goal after deadline**
   - Should set `set_by_deadline = false`

3. **Update progress to 100%**
   - Should auto-set `status = 'completed'`
   - Should set `completed_at` timestamp

4. **Check progress calculation**
   - Update signups_actual to 10, signup_goal is 20
   - Should calculate 50% progress

5. **Yearly goal with monthly breakdown**
   - Set yearly_signup_goal to 240
   - Should calculate monthly_signup_target as 20

### Sample Test Queries

```sql
-- Test 1: Create and verify monthly goal
INSERT INTO rep_monthly_goals (sales_rep_id, goal_month, goal_year, signup_goal, deadline)
VALUES (1, 2, 2026, 20, '2026-02-06 23:59:59');

SELECT * FROM rep_monthly_goals WHERE sales_rep_id = 1 AND goal_month = 2;

-- Test 2: Update progress and verify auto-calculation
UPDATE rep_monthly_goals
SET signups_actual = 10
WHERE sales_rep_id = 1 AND goal_month = 2 AND goal_year = 2026;

SELECT signup_progress_percent FROM rep_monthly_goals
WHERE sales_rep_id = 1 AND goal_month = 2 AND goal_year = 2026;
-- Expected: 50.00

-- Test 3: Complete goal
UPDATE rep_monthly_goals
SET signups_actual = 20, revenue_actual = 50000, revenue_goal = 50000
WHERE sales_rep_id = 1 AND goal_month = 2 AND goal_year = 2026;

SELECT status, completed_at FROM rep_monthly_goals
WHERE sales_rep_id = 1 AND goal_month = 2 AND goal_year = 2026;
-- Expected: status = 'completed', completed_at = NOW()

-- Test 4: Check views
SELECT * FROM v_current_month_goals WHERE sales_rep_id = 1;
SELECT * FROM v_yearly_goals_summary WHERE sales_rep_id = 1;
SELECT * FROM v_goals_needing_setup WHERE sales_rep_id = 1;
```

---

## Notes

- **Deadline compliance** is critical: Goals must be set by midnight of the 6th
- **Auto-calculation** triggers keep progress percentages up to date
- **Views** provide easy access to common queries
- **Historical tracking** allows trend analysis and performance reviews
- **Bonus integration** links goals directly to compensation
- Consider adding **notification system** for deadline reminders
- Consider adding **admin override** functionality for special cases

---

**Migration File:** `043_rep_goals_tracking.sql`
**Created:** 2026-02-01
**Dependencies:** Migration 038 (sales_reps table)
