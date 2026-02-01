# Rep Goals System - Quick Start Guide

## Installation

### 1. Apply Database Migration
```bash
cd /Users/a21/gemini-field-assistant
psql $DATABASE_URL -f database/migrations/043_rep_goals.sql
```

Verify tables were created:
```bash
psql $DATABASE_URL -c "\dt rep_goal*"
```

Expected output:
```
 rep_goals
 rep_goal_bonus_history
```

### 2. Restart Server
```bash
cd /Users/a21/gemini-field-assistant
npm run server:dev
```

### 3. Test Endpoints
```bash
./scripts/test-rep-goals-api.sh
```

---

## Common Admin Operations

### Set Goals for All Reps (Beginning of Month)
```bash
# Get list of reps
curl -H "x-user-email: a21@outlook.com" \
  http://localhost:8080/api/admin/users-basic

# For each rep, create goal
curl -X POST \
  -H "x-user-email: a21@outlook.com" \
  -H "Content-Type: application/json" \
  -d '{
    "salesRepId": 1,
    "month": 1,
    "year": 2026,
    "goalAmount": 15,
    "goalType": "signups"
  }' \
  http://localhost:8080/api/admin/goals
```

### Check Current Month Progress
```bash
curl -H "x-user-email: a21@outlook.com" \
  "http://localhost:8080/api/admin/goals/progress?month=$(date +%-m)&year=$(date +%Y)"
```

### Find Reps Behind on Goals
```bash
curl -H "x-user-email: a21@outlook.com" \
  "http://localhost:8080/api/admin/goals/progress" | \
  jq '.progress[] | select(.status == "behind" or .status == "critical")'
```

### Trigger Bonuses at End of Month
```bash
# Get all achieved goals
curl -H "x-user-email: a21@outlook.com" \
  "http://localhost:8080/api/admin/goals/progress" | \
  jq '.progress[] | select(.status == "achieved" and .bonus_triggered == false and .bonus_eligible == true)'

# Trigger bonus for specific goal
curl -X POST \
  -H "x-user-email: a21@outlook.com" \
  -H "Content-Type: application/json" \
  -d '{"goalId": 1, "bonusTier": 3, "notes": "Great job!"}' \
  http://localhost:8080/api/admin/goals/bonus/trigger
```

### Update a Goal
```bash
curl -X PUT \
  -H "x-user-email: a21@outlook.com" \
  -H "Content-Type: application/json" \
  -d '{"goalAmount": 18, "notes": "Increased target"}' \
  http://localhost:8080/api/admin/goals/1
```

### Delete a Goal
```bash
curl -X DELETE \
  -H "x-user-email: a21@outlook.com" \
  http://localhost:8080/api/admin/goals/1
```

---

## Rep Operations

### Check My Current Goal
```bash
curl -H "x-user-email: john@example.com" \
  http://localhost:8080/api/rep/goals | \
  jq '.currentGoal'
```

### Check My Progress with Trend
```bash
curl -H "x-user-email: john@example.com" \
  http://localhost:8080/api/rep/goals/progress
```

### See My Achievement Streak
```bash
curl -H "x-user-email: john@example.com" \
  http://localhost:8080/api/rep/goals/progress | \
  jq '.statistics.currentStreak'
```

---

## Database Queries

### Check All Goals for Current Month
```sql
SELECT
  sr.name,
  rg.goal_amount,
  rg.current_progress,
  rg.progress_percentage,
  rg.bonus_eligible,
  rg.deadline_met
FROM rep_goals rg
JOIN sales_reps sr ON rg.sales_rep_id = sr.id
WHERE rg.month = EXTRACT(MONTH FROM CURRENT_DATE)
  AND rg.year = EXTRACT(YEAR FROM CURRENT_DATE)
ORDER BY rg.progress_percentage DESC;
```

### Find Reps Who Achieved Goals
```sql
SELECT
  sr.name,
  rg.month,
  rg.year,
  rg.progress_percentage,
  rg.bonus_triggered
FROM rep_goals rg
JOIN sales_reps sr ON rg.sales_rep_id = sr.id
WHERE rg.progress_percentage >= 100
  AND rg.bonus_eligible = true
ORDER BY rg.year DESC, rg.month DESC;
```

### Get Bonus History
```sql
SELECT
  sr.name,
  bh.month,
  bh.year,
  bh.progress_percentage,
  bh.bonus_tier,
  bh.triggered_at,
  bh.triggered_by
FROM rep_goal_bonus_history bh
JOIN sales_reps sr ON bh.sales_rep_id = sr.id
ORDER BY bh.triggered_at DESC;
```

### Manually Update Progress (if needed)
```sql
-- Sync progress from sales_reps table
UPDATE rep_goals rg
SET current_progress = CASE
  WHEN rg.goal_type = 'signups' THEN sr.monthly_signups
  WHEN rg.goal_type = 'revenue' THEN sr.monthly_revenue
  ELSE 0
END
FROM sales_reps sr
WHERE rg.sales_rep_id = sr.id;
```

### Find Goals Set After Deadline
```sql
SELECT
  sr.name,
  rg.month,
  rg.year,
  rg.deadline_met,
  rg.created_at
FROM rep_goals rg
JOIN sales_reps sr ON rg.sales_rep_id = sr.id
WHERE rg.deadline_met = false
ORDER BY rg.created_at DESC;
```

---

## Frontend Integration Example

### React Hook for Rep Dashboard
```typescript
import { useState, useEffect } from 'react';
import { RepProgressResponse } from '../types/repGoals';

function useMyGoalProgress() {
  const [data, setData] = useState<RepProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProgress() {
      try {
        const response = await fetch('/api/rep/goals/progress', {
          headers: { 'x-user-email': userEmail }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchProgress();
  }, []);

  return { data, loading, error };
}

// Usage
function RepDashboard() {
  const { data, loading, error } = useMyGoalProgress();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  const { currentGoal, statistics } = data;

  return (
    <div>
      <h2>My Current Goal</h2>
      <p>Progress: {currentGoal.progress_percentage}%</p>
      <p>Current Streak: {statistics.currentStreak} months</p>
      <p>Average: {statistics.averageProgress}%</p>
    </div>
  );
}
```

### React Hook for Admin Leaderboard
```typescript
import { useState, useEffect } from 'react';
import { GoalProgressResponse } from '../types/repGoals';

function useGoalProgress(month?: number, year?: number) {
  const [data, setData] = useState<GoalProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProgress() {
      const params = new URLSearchParams();
      if (month) params.set('month', month.toString());
      if (year) params.set('year', year.toString());

      const response = await fetch(
        `/api/admin/goals/progress?${params}`,
        { headers: { 'x-user-email': 'admin@example.com' } }
      );

      const result = await response.json();
      setData(result);
      setLoading(false);
    }

    fetchProgress();
  }, [month, year]);

  return { data, loading };
}

// Usage
function AdminLeaderboard() {
  const { data, loading } = useGoalProgress();

  if (loading) return <div>Loading...</div>;

  const { progress, summary } = data;

  return (
    <div>
      <h2>Goal Progress Leaderboard</h2>
      <div>
        <span>Achieved: {summary.achieved}</span>
        <span>On Track: {summary.onTrack}</span>
        <span>Behind: {summary.behind}</span>
        <span>Critical: {summary.critical}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Rep</th>
            <th>Goal</th>
            <th>Progress</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {progress.map(p => (
            <tr key={p.sales_rep_id}>
              <td>{p.rep_name}</td>
              <td>{p.goal_amount}</td>
              <td>{p.progress_percentage}%</td>
              <td>{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Troubleshooting

### Error: "Sales rep not found"
```bash
# Check if rep exists in sales_reps table
psql $DATABASE_URL -c "SELECT id, name, email FROM sales_reps WHERE id = 1;"

# If not, create rep first or check user_sales_rep_mapping table
```

### Error: "Admin access required"
```bash
# Check if user is admin
psql $DATABASE_URL -c "SELECT email, role FROM users WHERE email = 'a21@outlook.com';"

# If not admin, promote user:
psql $DATABASE_URL -c "UPDATE users SET role = 'admin' WHERE email = 'a21@outlook.com';"
```

### Progress Not Updating
```bash
# Manually sync progress from sales_reps table
psql $DATABASE_URL -c "
UPDATE rep_goals rg
SET current_progress = CASE
  WHEN rg.goal_type = 'signups' THEN sr.monthly_signups
  WHEN rg.goal_type = 'revenue' THEN sr.monthly_revenue
  ELSE 0
END
FROM sales_reps sr
WHERE rg.sales_rep_id = sr.id;
"
```

### Deadline Not Being Enforced
```bash
# Check if goal was created today after 6th
psql $DATABASE_URL -c "
SELECT id, month, year, deadline_met, created_at
FROM rep_goals
WHERE DATE(created_at) = CURRENT_DATE;
"

# Trigger function runs on INSERT, not UPDATE
# Manually fix if needed:
psql $DATABASE_URL -c "
UPDATE rep_goals
SET deadline_met = false
WHERE month = EXTRACT(MONTH FROM CURRENT_DATE)
  AND year = EXTRACT(YEAR FROM CURRENT_DATE)
  AND EXTRACT(DAY FROM created_at) > 6;
"
```

---

## Production Checklist

Before deploying to production:

- [ ] Apply migration to production database
- [ ] Test all endpoints with production data
- [ ] Set up automated progress sync (cron job)
- [ ] Create admin dashboard frontend
- [ ] Create rep dashboard frontend
- [ ] Set up email notifications
- [ ] Document goal-setting process for admins
- [ ] Train admins on bonus trigger workflow
- [ ] Create monthly goal-setting reminder
- [ ] Set up monitoring for goal system

---

## Monthly Workflow

### Beginning of Month (by 6th)
1. Admin sets goals for all reps
2. System automatically marks `deadline_met = true`
3. Reps can view their goals via dashboard

### During Month
1. Progress auto-syncs from `sales_reps` table
2. Reps check progress via `/api/rep/goals/progress`
3. Admins monitor via `/api/admin/goals/progress`

### End of Month
1. Admin reviews achieved goals
2. Trigger bonuses for eligible reps
3. Review bonus history
4. Prepare for next month's goals

---

## Support

Need help? Check these resources:

1. Full API docs: `/Users/a21/gemini-field-assistant/server/docs/REP_GOALS_API.md`
2. TypeScript types: `/Users/a21/gemini-field-assistant/src/types/repGoals.ts`
3. Test script: `/Users/a21/gemini-field-assistant/scripts/test-rep-goals-api.sh`
4. Summary: `/Users/a21/gemini-field-assistant/REP_GOALS_SUMMARY.md`

---

**Last Updated:** December 2025
