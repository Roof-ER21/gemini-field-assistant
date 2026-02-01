# Rep Goals API Documentation

## Overview

The Rep Goals System provides monthly sales goal tracking with bonus management and deadline enforcement. Goals must be set by the 6th of each month to be eligible for bonuses.

## Database Schema

### Tables

#### `rep_goals`
- `id` - Serial primary key
- `sales_rep_id` - Foreign key to sales_reps table
- `month` - Month (1-12)
- `year` - Year (2024-2100)
- `goal_amount` - Target amount (signups or revenue)
- `goal_type` - 'signups' or 'revenue'
- `current_progress` - Current achievement amount
- `progress_percentage` - Auto-calculated (current_progress / goal_amount * 100)
- `bonus_eligible` - Boolean, can earn bonus
- `bonus_triggered` - Boolean, bonus has been awarded
- `bonus_triggered_at` - Timestamp when bonus triggered
- `deadline_met` - Boolean, goal set by 6th of month
- `notes` - Optional admin notes
- `created_by` - Admin email who created the goal
- `created_at` - Timestamp
- `updated_at` - Timestamp

#### `rep_goal_bonus_history`
- Tracks when bonuses are triggered
- Historical record of achievements

### Business Rules

1. **Deadline Enforcement**: Goals must be set by the 6th of the month to be eligible for bonuses
2. **Unique Constraint**: One goal per rep, per month, per year, per goal type
3. **Auto Progress Sync**: Progress syncs from sales_reps table (monthly_signups, monthly_revenue)
4. **Bonus Eligibility**: Must achieve >= 100% and meet deadline
5. **One-Time Bonus**: Each goal can only trigger a bonus once

---

## Admin Endpoints

### 1. List All Goals

**GET** `/api/admin/goals`

Get all rep goals with optional filters.

**Query Parameters:**
- `month` - Filter by month (1-12)
- `year` - Filter by year
- `repId` - Filter by sales rep ID
- `goalType` - Filter by goal type ('signups' or 'revenue')

**Authentication:** Admin only (x-user-email header)

**Response:**
```json
{
  "goals": [
    {
      "id": 1,
      "sales_rep_id": 5,
      "month": 12,
      "year": 2025,
      "goal_amount": "15.00",
      "goal_type": "signups",
      "current_progress": "12.00",
      "progress_percentage": "80.00",
      "bonus_eligible": true,
      "bonus_triggered": false,
      "deadline_met": true,
      "rep_name": "John Doe",
      "rep_email": "john@example.com",
      "rep_team": "Team Alpha",
      "monthly_signups": "12.0",
      "monthly_revenue": "45000.00",
      "created_at": "2025-12-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

**Example:**
```bash
curl -H "x-user-email: admin@example.com" \
  "http://localhost:8080/api/admin/goals?month=12&year=2025"
```

---

### 2. Create or Update Goal

**POST** `/api/admin/goals`

Create a new goal or update existing one (upsert).

**Authentication:** Admin only

**Request Body:**
```json
{
  "salesRepId": 5,
  "month": 1,
  "year": 2026,
  "goalAmount": 15,
  "goalType": "signups",
  "notes": "Q1 push campaign"
}
```

**Response:**
```json
{
  "goal": {
    "id": 2,
    "sales_rep_id": 5,
    "month": 1,
    "year": 2026,
    "goal_amount": "15.00",
    "goal_type": "signups",
    "current_progress": "0.00",
    "progress_percentage": "0.00",
    "bonus_eligible": true,
    "bonus_triggered": false,
    "deadline_met": true,
    "created_by": "admin@example.com"
  },
  "message": "Goal set successfully"
}
```

**Warning Messages:**
- If set after 6th: `"Warning: Goal set after deadline (6th of month)"`
- `deadline_met` will be `false` if set after deadline

**Validation:**
- `salesRepId`, `month`, `year`, `goalAmount` are required
- `month` must be 1-12
- `year` must be 2024-2100
- `goalAmount` must be > 0
- `goalType` must be 'signups' or 'revenue'
- Sales rep must exist

---

### 3. Get Specific Rep's Goals

**GET** `/api/admin/goals/:repId`

Get all goals and bonus history for a specific rep.

**Authentication:** Admin only

**Response:**
```json
{
  "rep": {
    "id": 5,
    "name": "John Doe",
    "email": "john@example.com",
    "team": "Team Alpha",
    "monthly_signups": "12.0",
    "monthly_revenue": "45000.00"
  },
  "goals": [...],
  "currentGoal": {
    "id": 1,
    "goal_amount": "15.00",
    "current_progress": "12.00",
    "progress_percentage": "80.00"
  },
  "bonusHistory": [
    {
      "id": 1,
      "month": 11,
      "year": 2025,
      "goal_amount": "15.00",
      "final_progress": "16.00",
      "progress_percentage": "106.67",
      "triggered_at": "2025-11-30T00:00:00Z",
      "triggered_by": "admin@example.com"
    }
  ],
  "total": 12
}
```

---

### 4. Update Goal

**PUT** `/api/admin/goals/:goalId`

Update specific fields of a goal.

**Authentication:** Admin only

**Request Body:**
```json
{
  "goalAmount": 18,
  "bonusEligible": true,
  "notes": "Updated target"
}
```

**Response:**
```json
{
  "goal": {
    "id": 1,
    "goal_amount": "18.00",
    "bonus_eligible": true,
    "notes": "Updated target",
    "updated_at": "2025-12-05T12:00:00Z"
  }
}
```

---

### 5. Delete Goal

**DELETE** `/api/admin/goals/:goalId`

Delete a goal permanently.

**Authentication:** Admin only

**Response:**
```json
{
  "success": true,
  "message": "Goal deleted successfully",
  "deletedGoal": {
    "id": 1,
    "sales_rep_id": 5,
    "month": 12,
    "year": 2025
  }
}
```

---

### 6. Get Goal Progress (Leaderboard)

**GET** `/api/admin/goals/progress`

Get goal progress for all active reps with status categorization.

**Query Parameters:**
- `month` - Target month (defaults to current month)
- `year` - Target year (defaults to current year)

**Authentication:** Admin only

**Response:**
```json
{
  "month": 12,
  "year": 2025,
  "progress": [
    {
      "sales_rep_id": 5,
      "rep_name": "John Doe",
      "rep_email": "john@example.com",
      "team": "Team Alpha",
      "current_signups": "16.0",
      "current_revenue": "55000.00",
      "goal_id": 1,
      "goal_amount": "15.00",
      "goal_type": "signups",
      "current_progress": "16.00",
      "progress_percentage": "106.67",
      "bonus_eligible": true,
      "bonus_triggered": false,
      "deadline_met": true,
      "status": "achieved"
    }
  ],
  "total": 25,
  "summary": {
    "achieved": 8,
    "onTrack": 10,
    "behind": 5,
    "critical": 2,
    "noGoal": 0
  }
}
```

**Status Categories:**
- `achieved` - >= 100% progress
- `on_track` - 75-99% progress
- `behind` - 50-74% progress
- `critical` - < 50% progress

---

### 7. Trigger Bonus

**POST** `/api/admin/goals/bonus/trigger`

Manually trigger a bonus for a rep who achieved their goal.

**Authentication:** Admin only

**Request Body:**
```json
{
  "goalId": 1,
  "bonusTier": 3,
  "notes": "Exceeded goal by 20%"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bonus triggered successfully",
  "goal": {
    "id": 1,
    "salesRepId": 5,
    "month": 12,
    "year": 2025,
    "progressPercentage": "120.00"
  }
}
```

**Validation:**
- Goal must exist
- Goal must be `bonus_eligible = true`
- Goal must not already have `bonus_triggered = true`
- Progress must be >= 100%

**Error Responses:**
- 400 - Goal not eligible, already triggered, or not achieved
- 404 - Goal not found

---

## Rep Endpoints (Self-Service)

### 8. Get Current User's Goals

**GET** `/api/rep/goals`

Get all goals for the current logged-in rep.

**Authentication:** Rep user (x-user-email header)

**Response:**
```json
{
  "goals": [
    {
      "id": 1,
      "month": 12,
      "year": 2025,
      "goal_amount": "15.00",
      "current_progress": "12.00",
      "progress_percentage": "80.00",
      "bonus_eligible": true,
      "bonus_triggered": false,
      "deadline_met": true
    }
  ],
  "currentGoal": {
    "id": 1,
    "goal_amount": "15.00",
    "current_progress": "12.00",
    "progress_percentage": "80.00"
  },
  "total": 12
}
```

**Error:**
- 404 - Rep profile not found (email not linked to sales_reps)

---

### 9. Get Progress with Trend Data

**GET** `/api/rep/goals/progress`

Get current progress with 12-month trend analysis and statistics.

**Authentication:** Rep user

**Response:**
```json
{
  "rep": {
    "id": 5,
    "name": "John Doe",
    "email": "john@example.com",
    "team": "Team Alpha",
    "monthlySignups": "12.0",
    "monthlyRevenue": "45000.00"
  },
  "currentGoal": {
    "id": 1,
    "goal_amount": "15.00",
    "current_progress": "12.00",
    "progress_percentage": "80.00"
  },
  "trend": [
    {
      "month": 1,
      "year": 2025,
      "goal_amount": "15.00",
      "current_progress": "16.00",
      "progress_percentage": "106.67",
      "bonus_triggered": true
    },
    // ... 11 more months
  ],
  "statistics": {
    "totalGoals": 12,
    "achieved": 8,
    "bonuses": 7,
    "averageProgress": 95.33,
    "currentStreak": 3
  }
}
```

**Statistics:**
- `totalGoals` - Total goals in last 12 months
- `achieved` - Goals with >= 100% progress
- `bonuses` - Goals where bonus was triggered
- `averageProgress` - Mean progress percentage
- `currentStreak` - Consecutive months achieving >= 100%

---

## Integration with Sales Leaderboard

The rep goals system integrates with the existing `sales_reps` table:

### Auto-Sync Progress

Progress is automatically synced from:
- `sales_reps.monthly_signups` → `rep_goals.current_progress` (for goal_type='signups')
- `sales_reps.monthly_revenue` → `rep_goals.current_progress` (for goal_type='revenue')

### Sync Function

```sql
-- Manually sync progress for a goal
SELECT sync_goal_progress(goal_id);
```

Or via API after updating sales_reps data:
```typescript
await syncGoalProgress(goalId);
```

---

## Usage Examples

### Admin: Set Monthly Goals for All Reps

```typescript
const reps = await fetch('/api/admin/users').then(r => r.json());

for (const rep of reps) {
  await fetch('/api/admin/goals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': 'admin@example.com'
    },
    body: JSON.stringify({
      salesRepId: rep.sales_rep_id,
      month: 1,
      year: 2026,
      goalAmount: 15,
      goalType: 'signups'
    })
  });
}
```

### Admin: Check Who's Behind on Goals

```typescript
const response = await fetch('/api/admin/goals/progress?month=12&year=2025', {
  headers: { 'x-user-email': 'admin@example.com' }
});

const { progress, summary } = await response.json();

const behind = progress.filter(p =>
  p.status === 'behind' || p.status === 'critical'
);

console.log(`${behind.length} reps need attention`);
```

### Rep: Check Personal Progress

```typescript
const response = await fetch('/api/rep/goals/progress', {
  headers: { 'x-user-email': 'john@example.com' }
});

const { currentGoal, statistics } = await response.json();

console.log(`Current Progress: ${currentGoal.progress_percentage}%`);
console.log(`Streak: ${statistics.currentStreak} months`);
```

### Admin: Trigger End-of-Month Bonuses

```typescript
const response = await fetch('/api/admin/goals/progress', {
  headers: { 'x-user-email': 'admin@example.com' }
});

const { progress } = await response.json();

// Filter reps who achieved goals but haven't been paid
const eligible = progress.filter(p =>
  p.status === 'achieved' &&
  p.bonus_eligible &&
  !p.bonus_triggered &&
  p.deadline_met
);

for (const rep of eligible) {
  await fetch('/api/admin/goals/bonus/trigger', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': 'admin@example.com'
    },
    body: JSON.stringify({
      goalId: rep.goal_id,
      bonusTier: calculateTier(rep.progress_percentage),
      notes: `Achieved ${rep.progress_percentage}% of monthly goal`
    })
  });
}
```

---

## Error Handling

All endpoints return consistent error formats:

**400 Bad Request:**
```json
{
  "error": "Missing required fields: salesRepId, month, year, goalAmount"
}
```

**403 Forbidden:**
```json
{
  "error": "Admin access required"
}
```

**404 Not Found:**
```json
{
  "error": "Sales rep not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Database connection failed"
}
```

---

## Database Migrations

### Apply Migration

```bash
psql $DATABASE_URL -f database/migrations/043_rep_goals.sql
```

### Verify Tables

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('rep_goals', 'rep_goal_bonus_history');
```

### Sample Data

```sql
-- Create a test goal
INSERT INTO rep_goals (sales_rep_id, month, year, goal_amount, goal_type)
VALUES (1, 1, 2026, 15, 'signups');

-- Check progress
SELECT
  sr.name,
  rg.goal_amount,
  rg.current_progress,
  rg.progress_percentage,
  rg.deadline_met
FROM rep_goals rg
JOIN sales_reps sr ON rg.sales_rep_id = sr.id;
```

---

## Frontend Integration

### Admin Dashboard Components

1. **Goals Overview Table** - List all goals with filters
2. **Progress Leaderboard** - Real-time progress tracking
3. **Goal Creator Modal** - Set monthly goals
4. **Bonus Trigger Button** - Award bonuses for achieved goals

### Rep Dashboard Components

1. **Personal Goal Card** - Current month progress
2. **Trend Chart** - 12-month progress visualization
3. **Statistics Panel** - Achievement stats and streak

### Example React Hook

```typescript
function useRepGoals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGoals() {
      const response = await fetch('/api/rep/goals/progress', {
        headers: { 'x-user-email': user.email }
      });
      const data = await response.json();
      setGoals(data);
      setLoading(false);
    }
    fetchGoals();
  }, [user.email]);

  return { goals, loading };
}
```

---

## Security Considerations

1. **Authentication Required** - All endpoints require x-user-email header
2. **Admin-Only Operations** - Goal creation/modification restricted to admins
3. **Rep Self-Service** - Reps can only view their own data
4. **SQL Injection Protection** - All queries use parameterized statements
5. **Input Validation** - All inputs validated before database operations
6. **Transaction Safety** - Bonus triggers use database transactions
7. **Audit Trail** - All actions logged with admin email and timestamp

---

## Performance Optimization

### Indexes

```sql
-- Already created in migration 043
CREATE INDEX idx_rep_goals_rep_id ON rep_goals(sales_rep_id);
CREATE INDEX idx_rep_goals_month_year ON rep_goals(month, year);
CREATE INDEX idx_rep_goals_deadline ON rep_goals(deadline_met);
CREATE INDEX idx_rep_goals_bonus ON rep_goals(bonus_eligible, bonus_triggered);
```

### Caching Recommendations

- Cache `/api/admin/goals/progress` for 5 minutes
- Cache `/api/rep/goals/progress` for 10 minutes
- Invalidate cache on goal updates

---

## Future Enhancements

- [ ] Automated bonus triggers on month-end
- [ ] Email notifications for goal milestones
- [ ] Team-wide goals (not just individual)
- [ ] Quarterly and yearly goal tracking
- [ ] Goal templates for bulk creation
- [ ] Progress history snapshots (daily/weekly)
- [ ] Custom bonus tier formulas
- [ ] Integration with payroll systems

---

**Last Updated:** December 2025
**Migration:** 043_rep_goals.sql
**API Version:** 1.0
