# Goals Tracking Schema Diagram

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GOALS TRACKING SYSTEM                           │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│   users              │
│──────────────────────│
│ id (UUID) PK         │──┐
│ email                │  │
│ name                 │  │
│ role                 │  │
└──────────────────────┘  │
                          │
                          │  references
                          │  (goal_set_by)
                          │
┌──────────────────────┐  │         ┌───────────────────────────┐
│   sales_reps         │  │         │  rep_monthly_goals        │
│──────────────────────│  │         │───────────────────────────│
│ id (INT) PK          │──┼────────>│ id (INT) PK               │
│ name                 │  │    ┌───>│ sales_rep_id (FK) ────────┼──┐
│ email                │  │    │    │ goal_month (1-12)         │  │
│ team                 │  │    │    │ goal_year (2024+)         │  │
│ title                │  │    │    │                           │  │
│ monthly_signup_goal  │  │    │    │ signup_goal               │  │
│ yearly_signup_goal   │  │    │    │ signups_actual            │  │
│ goal_progress        │  │    │    │ signup_progress_percent   │  │
│ current_bonus_tier   │  │    │    │                           │  │
│ is_active            │  │    │    │ revenue_goal              │  │
└──────────────────────┘  │    │    │ revenue_actual            │  │
         │                │    │    │ revenue_progress_percent  │  │
         │                │    │    │                           │  │
         │                │    │    │ bonus_tier_goal (0-6)     │  │
         │                │    │    │ bonus_tier_actual (0-6)   │  │
         │                │    │    │ bonus_triggered           │  │
         │                │    │    │ bonus_amount              │  │
         │                │    │    │                           │  │
         │                │    │    │ set_by_deadline           │  │
         │                │    │    │ goal_set_at               │  │
         │                └────┼────│ goal_set_by (FK) ─────────┼──┘
         │                     │    │ deadline (6th midnight)   │
         │                     │    │                           │
         │                     │    │ status (active/completed) │
         │                     │    │ completed_at              │
         │                     │    │                           │
         │                     │    │ UNIQUE(sales_rep_id,      │
         │                     │    │        goal_year,         │
         │                     │    │        goal_month)        │
         │                     │    └───────────────────────────┘
         │                     │              │
         │                     │              │ references
         │                     │              │ (monthly_goal_id)
         │                     │              │
         │                     │              ▼
         │                     │    ┌───────────────────────────┐
         │                     │    │  goal_progress_snapshots  │
         │                     │    │───────────────────────────│
         │                     └───>│ id (INT) PK               │
         │                          │ sales_rep_id (FK)         │
         │                          │ snapshot_date (DATE)      │
         │                          │ snapshot_type             │
         │                          │   (daily/weekly/monthly)  │
         │                          │ monthly_goal_id (FK)      │
         │                          │                           │
         │                          │ signups_to_date           │
         │                          │ signup_goal               │
         │                          │ signup_progress_percent   │
         │                          │                           │
         │                          │ revenue_to_date           │
         │                          │ revenue_goal              │
         │                          │ revenue_progress_percent  │
         │                          │                           │
         │                          │ bonus_tier                │
         │                          │ days_remaining            │
         │                          │ on_pace (BOOL)            │
         │                          │ pace_indicator            │
         │                          │   (ahead/on_track/        │
         │                          │    behind/critical)       │
         │                          └───────────────────────────┘
         │
         │
         │                          ┌───────────────────────────┐
         │                          │  rep_yearly_goals         │
         │                          │───────────────────────────│
         │                     ┌───>│ id (INT) PK               │
         │                     │    │ sales_rep_id (FK) ────────┼──┐
         │                     │    │ goal_year (2024+)         │  │
         │                     │    │                           │  │
         │                     │    │ yearly_signup_goal        │  │
         │                     │    │ yearly_signups_actual     │  │
         │                     │    │ yearly_signup_progress_%  │  │
         │                     │    │                           │  │
         │                     │    │ yearly_revenue_goal       │  │
         │                     │    │ yearly_revenue_actual     │  │
         │                     │    │ yearly_revenue_progress_% │  │
         │                     │    │                           │  │
         │                     │    │ monthly_signup_target     │  │
         │                     │    │   (GENERATED: yearly/12)  │  │
         │                     │    │ monthly_revenue_target    │  │
         │                     │    │   (GENERATED: yearly/12)  │  │
         │                     │    │                           │  │
         │                     │    │ status (active/completed) │  │
         │                     │    │ completed_at              │  │
         │                     └────│ goal_set_by (FK) ─────────┼──┘
         │                          │                           │
         │                          │ UNIQUE(sales_rep_id,      │
         │                          │        goal_year)         │
         │                          └───────────────────────────┘
         │                                    │
         │                                    │ references
         │                                    │ (yearly_goal_id)
         │                                    │
         │                                    ▼
         │                          ┌───────────────────────────┐
         │                          │  goal_achievements        │
         │                          │───────────────────────────│
         │                     ┌───>│ id (INT) PK               │
         │                     │    │ sales_rep_id (FK)         │
         │                     │    │ monthly_goal_id (FK)      │
         │                     │    │ yearly_goal_id (FK)       │
         │                     │    │                           │
         │                     │    │ achievement_type          │
         │                     │    │   (monthly_signup_goal/   │
         │                     │    │    monthly_revenue_goal/  │
         │                     │    │    yearly_signup_goal/    │
         │                     │    │    yearly_revenue_goal/   │
         │                     │    │    bonus_tier_unlocked/   │
         │                     │    │    streak_milestone/      │
         │                     │    │    perfect_month)         │
         │                     │    │                           │
         │                     │    │ achievement_date          │
         │                     │    │ achievement_month         │
         │                     │    │ achievement_year          │
         │                     │    │                           │
         │                     │    │ goal_value                │
         │                     │    │ actual_value              │
         │                     │    │ percent_achieved          │
         │                     │    │                           │
         │                     │    │ bonus_amount              │
         │                     │    │ bonus_tier                │
         │                     │    │                           │
         │                     │    │ recognized (BOOL)         │
         │                     │    │ recognition_type          │
         │                     │    └───────────────────────────┘
         │
         │
         │                          ┌───────────────────────────┐
         │                          │  goal_deadline_reminders  │
         │                          │───────────────────────────│
         └─────────────────────────>│ id (INT) PK               │
                                    │ sales_rep_id (FK)         │
                                    │                           │
                                    │ reminder_type             │
                                    │   (goal_deadline_3days/   │
                                    │    goal_deadline_1day/    │
                                    │    goal_deadline_day/     │
                                    │    goal_overdue)          │
                                    │                           │
                                    │ target_month (1-12)       │
                                    │ target_year (2024+)       │
                                    │ deadline                  │
                                    │                           │
                                    │ sent (BOOL)               │
                                    │ sent_at                   │
                                    │ acknowledged (BOOL)       │
                                    │ acknowledged_at           │
                                    └───────────────────────────┘
```

---

## Key Relationships

### 1. sales_reps → rep_monthly_goals (One-to-Many)
- One rep can have many monthly goals (one per month)
- Unique constraint: `(sales_rep_id, goal_year, goal_month)`

### 2. sales_reps → rep_yearly_goals (One-to-Many)
- One rep can have many yearly goals (one per year)
- Unique constraint: `(sales_rep_id, goal_year)`

### 3. rep_monthly_goals → goal_progress_snapshots (One-to-Many)
- One monthly goal can have many snapshots (daily/weekly tracking)
- Snapshots track progress over time for trend analysis

### 4. sales_reps → goal_achievements (One-to-Many)
- One rep can have many achievements
- Achievements can reference either monthly_goal_id OR yearly_goal_id

### 5. sales_reps → goal_deadline_reminders (One-to-Many)
- One rep can have multiple reminders (3-day, 1-day, deadline day, overdue)

### 6. users → goals (Set By Relationship)
- Users (admins or reps) can set goals
- Tracked via `goal_set_by` foreign key
- Audit trail for who created/modified goals

---

## Data Flow

### Setting Monthly Goals

```
1. User/Admin creates or updates monthly goal
   ↓
2. System checks if before deadline (6th at midnight)
   ↓
3. Sets set_by_deadline flag accordingly
   ↓
4. Trigger calculates progress percentages
   ↓
5. If 100% complete, auto-sets status = 'completed'
```

### Progress Tracking

```
1. Daily snapshot job runs (midnight)
   ↓
2. Reads current progress from rep_monthly_goals
   ↓
3. Calculates pace indicators
   ↓
4. Inserts snapshot into goal_progress_snapshots
   ↓
5. Historical trend data available for charts
```

### Achievement Recording

```
1. Goal reaches 100% completion
   ↓
2. Trigger sets status = 'completed'
   ↓
3. Achievement detection job runs
   ↓
4. Creates record in goal_achievements
   ↓
5. Triggers recognition/notification
```

### Deadline Reminder Flow

```
1. 1st of month: Create reminders for all active reps
   ↓
2. Reminder job checks deadlines multiple times daily
   ↓
3. Sends notification if unsent and deadline approaching
   ↓
4. Marks reminder as sent
   ↓
5. Rep acknowledges reminder (optional)
```

---

## Views (Simplified Access)

### v_current_month_goals

```sql
SELECT
  sales_reps.*,
  rep_monthly_goals.*,
  health_status (calculated),
  days_until_deadline (calculated)
FROM sales_reps
LEFT JOIN rep_monthly_goals ON current month
WHERE is_active = true
```

### v_yearly_goals_summary

```sql
SELECT
  sales_reps.*,
  rep_yearly_goals.*,
  months_remaining (calculated)
FROM sales_reps
LEFT JOIN rep_yearly_goals ON current year
WHERE is_active = true
```

### v_goals_needing_setup

```sql
SELECT
  sales_reps.*,
  deadline_status (not_set/pending/overdue/complete),
  days_until_deadline
FROM sales_reps
LEFT JOIN rep_monthly_goals ON current month
WHERE goal not set or not set_by_deadline
```

---

## Indexes for Performance

### High-Traffic Queries

1. **Current month lookup** (most common)
   - `idx_monthly_goals_rep_period` on `(sales_rep_id, goal_year, goal_month)`

2. **Progress snapshots** (trend charts)
   - `idx_progress_snapshots_rep_date` on `(sales_rep_id, snapshot_date DESC)`

3. **Achievement history** (leaderboard integration)
   - `idx_achievements_rep_year` on `(sales_rep_id, achievement_year)`

4. **Pending deadlines** (admin dashboard)
   - `idx_monthly_goals_deadline` on `deadline`
   - `idx_deadline_reminders_sent` on `sent WHERE sent = false`

---

## Trigger Logic

### Auto-Calculate Monthly Progress

```sql
BEFORE INSERT OR UPDATE ON rep_monthly_goals
  ↓
Calculate signup_progress_percent = (actual / goal) * 100
Calculate revenue_progress_percent = (actual / goal) * 100
  ↓
If both >= 100%:
  - status = 'completed'
  - completed_at = NOW()
```

### Auto-Calculate Yearly Progress

```sql
BEFORE INSERT OR UPDATE ON rep_yearly_goals
  ↓
Calculate yearly_signup_progress_percent
Calculate yearly_revenue_progress_percent
  ↓
If both >= 100%:
  - status = 'completed'
  - completed_at = NOW()
```

---

## Stored/Generated Columns

### rep_yearly_goals

- `monthly_signup_target` = `yearly_signup_goal / 12` (GENERATED)
- `monthly_revenue_target` = `yearly_revenue_goal / 12` (GENERATED)

These are automatically calculated and always in sync.

---

## Sample Queries

### Get rep's current month status

```sql
SELECT * FROM v_current_month_goals
WHERE sales_rep_id = 1;
```

### Check if rep is on pace for yearly goal

```sql
SELECT
  rep_name,
  yearly_signups_actual,
  monthly_signup_target * current_month as expected_by_now,
  CASE
    WHEN yearly_signups_actual >= (monthly_signup_target * current_month)
    THEN 'On Pace'
    ELSE 'Behind Pace'
  END as pace_status
FROM v_yearly_goals_summary
WHERE sales_rep_id = 1;
```

### Find overdue goal setups

```sql
SELECT * FROM v_goals_needing_setup
WHERE deadline_status = 'overdue';
```

### Get achievement history

```sql
SELECT * FROM goal_achievements
WHERE sales_rep_id = 1
ORDER BY achievement_date DESC;
```

---

## Integration with Existing Tables

### sales_reps

Existing columns we leverage:
- `monthly_signup_goal` → Default for new monthly goals
- `yearly_signup_goal` → Default for new yearly goals
- `goal_progress` → Can sync with `signup_progress_percent`
- `current_bonus_tier` → Can sync with `bonus_tier_actual`

### leaderboard_snapshots

Can correlate with `goal_progress_snapshots`:
- Compare actual performance vs goals
- Identify high performers vs goal achievers
- Show "on pace" indicators on leaderboard

### sheets_sync_log

When syncing from Google Sheets:
- Update `signups_actual` in rep_monthly_goals
- Update `revenue_actual` in rep_monthly_goals
- Triggers auto-calculate progress percentages

---

## Summary

This schema provides:

1. ✅ **Flexible goal tracking** - Monthly and yearly targets
2. ✅ **Deadline compliance** - Must set by 6th of month
3. ✅ **Progress monitoring** - Real-time progress tracking
4. ✅ **Historical records** - Snapshots and achievements
5. ✅ **Bonus integration** - Links to compensation tiers
6. ✅ **Automated calculations** - Triggers keep data in sync
7. ✅ **Easy querying** - Views for common access patterns
8. ✅ **Admin oversight** - Compliance and reminder tracking

**Next Steps:**
- Implement API endpoints (see GOALS_API_IMPLEMENTATION.md)
- Create UI components for goal setting and tracking
- Set up scheduled jobs for snapshots and reminders
- Add notification system for deadline alerts
