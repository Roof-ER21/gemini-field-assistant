# Rep Goals System - Implementation Summary

## Overview

I've implemented a complete Rep Goals System for the Gemini Field Assistant with monthly sales goal tracking, bonus management, and deadline enforcement (goals must be set by 6th of month).

---

## Files Created/Modified

### 1. Database Migration
**File:** `/Users/a21/gemini-field-assistant/database/migrations/043_rep_goals.sql`

Creates two tables:
- `rep_goals` - Monthly goals with auto-calculated progress
- `rep_goal_bonus_history` - Historical record of bonuses

Features:
- Automatic deadline checking (6th of month)
- Auto-calculated progress percentage
- Unique constraint (one goal per rep/month/year/type)
- Foreign key to `sales_reps` table

### 2. API Endpoints
**File:** `/Users/a21/gemini-field-assistant/server/index.ts` (modified)

Added 9 new endpoints after line 3278:

#### Admin Endpoints (require admin role)
1. **GET /api/admin/goals** - List all goals with filters
2. **POST /api/admin/goals** - Create/update goal (upsert)
3. **GET /api/admin/goals/:repId** - Get specific rep's goals
4. **PUT /api/admin/goals/:goalId** - Update goal
5. **DELETE /api/admin/goals/:goalId** - Delete goal
6. **GET /api/admin/goals/progress** - Leaderboard with status
7. **POST /api/admin/goals/bonus/trigger** - Trigger bonus

#### Rep Self-Service Endpoints
8. **GET /api/rep/goals** - Get current user's goals
9. **GET /api/rep/goals/progress** - Get progress with trend data

### 3. Documentation
**File:** `/Users/a21/gemini-field-assistant/server/docs/REP_GOALS_API.md`

Complete API documentation including:
- Endpoint specifications
- Request/response examples
- Business rules
- Integration guide
- Error handling
- Frontend integration examples

### 4. TypeScript Types
**File:** `/Users/a21/gemini-field-assistant/src/types/repGoals.ts`

TypeScript interfaces and helper functions:
- All API request/response types
- Helper functions for formatting
- Status calculation utilities
- Date/month helpers

### 5. Test Script
**File:** `/Users/a21/gemini-field-assistant/scripts/test-rep-goals-api.sh`

Bash script to test all endpoints:
- Creates test goals
- Tests filters and queries
- Validates error handling
- Tests rep self-service endpoints

---

## API Endpoints Summary

### Admin Endpoints

```typescript
// List all goals (with optional filters)
GET /api/admin/goals?month=12&year=2025&repId=5&goalType=signups

// Create or update goal
POST /api/admin/goals
{
  "salesRepId": 5,
  "month": 1,
  "year": 2026,
  "goalAmount": 15,
  "goalType": "signups",
  "notes": "Q1 target"
}

// Get specific rep's goals
GET /api/admin/goals/5

// Update goal
PUT /api/admin/goals/1
{
  "goalAmount": 18,
  "bonusEligible": true
}

// Delete goal
DELETE /api/admin/goals/1

// Get leaderboard with progress
GET /api/admin/goals/progress?month=12&year=2025

// Trigger bonus
POST /api/admin/goals/bonus/trigger
{
  "goalId": 1,
  "bonusTier": 3,
  "notes": "Exceeded by 20%"
}
```

### Rep Endpoints

```typescript
// Get my goals
GET /api/rep/goals

// Get my progress with trend
GET /api/rep/goals/progress
```

---

## Database Schema

### rep_goals Table
```sql
CREATE TABLE rep_goals (
    id SERIAL PRIMARY KEY,
    sales_rep_id INTEGER REFERENCES sales_reps(id),
    month INTEGER CHECK (month >= 1 AND month <= 12),
    year INTEGER CHECK (year >= 2024),
    goal_amount DECIMAL(15,2) NOT NULL,
    goal_type TEXT DEFAULT 'signups', -- 'signups' or 'revenue'
    current_progress DECIMAL(15,2) DEFAULT 0,
    progress_percentage DECIMAL(5,2) GENERATED, -- Auto-calculated
    bonus_eligible BOOLEAN DEFAULT true,
    bonus_triggered BOOLEAN DEFAULT false,
    bonus_triggered_at TIMESTAMPTZ,
    deadline_met BOOLEAN DEFAULT true, -- False if set after 6th
    notes TEXT,
    created_by TEXT, -- Admin email
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sales_rep_id, month, year, goal_type)
);
```

### rep_goal_bonus_history Table
```sql
CREATE TABLE rep_goal_bonus_history (
    id SERIAL PRIMARY KEY,
    rep_goal_id INTEGER REFERENCES rep_goals(id),
    sales_rep_id INTEGER REFERENCES sales_reps(id),
    month INTEGER,
    year INTEGER,
    goal_amount DECIMAL(15,2),
    final_progress DECIMAL(15,2),
    progress_percentage DECIMAL(5,2),
    bonus_tier INTEGER,
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    triggered_by TEXT,
    notes TEXT
);
```

---

## Key Features

### 1. Deadline Enforcement
- Goals must be set by **6th of the month** to be bonus-eligible
- `deadline_met` flag automatically set on creation
- Warning message returned if set after deadline

### 2. Progress Tracking
- Auto-synced from `sales_reps.monthly_signups` or `monthly_revenue`
- Progress percentage auto-calculated (stored as generated column)
- Helper function `syncGoalProgress()` updates from sales data

### 3. Status Categories
Goals categorized for leaderboard:
- **achieved** - >= 100% progress
- **on_track** - 75-99% progress
- **behind** - 50-74% progress
- **critical** - < 50% progress

### 4. Bonus Management
- One-time bonus trigger per goal
- Requires >= 100% progress
- Creates entry in bonus history
- Transaction-safe (rollback on failure)

### 5. Trend Analysis
Reps can see:
- Last 12 months of goals
- Achievement statistics
- Current streak count
- Average progress percentage

---

## Integration with Existing System

### Connects to sales_reps Table
```typescript
// Progress auto-synced from:
sales_reps.monthly_signups → rep_goals.current_progress (for goal_type='signups')
sales_reps.monthly_revenue → rep_goals.current_progress (for goal_type='revenue')
```

### Uses Existing Auth Pattern
```typescript
const requestingEmail = getRequestEmail(req);
const adminCheck = await isAdmin(requestingEmail);
if (!adminCheck) {
  return res.status(403).json({ error: 'Admin access required' });
}
```

### Follows Code Patterns
- Uses `pool.query()` for database operations
- Consistent error handling
- Request logging
- Transaction safety for critical operations

---

## Usage Examples

### Admin: Set Monthly Goals
```typescript
// Set goals for all reps for January 2026
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

### Admin: Check Progress Leaderboard
```typescript
const response = await fetch('/api/admin/goals/progress?month=12&year=2025', {
  headers: { 'x-user-email': 'admin@example.com' }
});

const { progress, summary } = await response.json();

console.log(`Achieved: ${summary.achieved}`);
console.log(`On Track: ${summary.onTrack}`);
console.log(`Behind: ${summary.behind}`);
console.log(`Critical: ${summary.critical}`);
```

### Admin: Trigger End-of-Month Bonuses
```typescript
const { progress } = await fetch('/api/admin/goals/progress')
  .then(r => r.json());

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
      bonusTier: calculateTier(rep.progress_percentage)
    })
  });
}
```

### Rep: Check Personal Progress
```typescript
const { currentGoal, statistics } = await fetch('/api/rep/goals/progress', {
  headers: { 'x-user-email': 'john@example.com' }
}).then(r => r.json());

console.log(`Progress: ${currentGoal.progress_percentage}%`);
console.log(`Streak: ${statistics.currentStreak} months`);
console.log(`Average: ${statistics.averageProgress}%`);
```

---

## Testing

### Apply Migration
```bash
cd /Users/a21/gemini-field-assistant

# Connect to database and run migration
psql $DATABASE_URL -f database/migrations/043_rep_goals.sql
```

### Run Test Script
```bash
cd /Users/a21/gemini-field-assistant

# Test against localhost
./scripts/test-rep-goals-api.sh

# Test against production
./scripts/test-rep-goals-api.sh https://your-production-url.com
```

### Manual Testing
```bash
# List all goals
curl -H "x-user-email: a21@outlook.com" \
  http://localhost:8080/api/admin/goals

# Create a goal
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

# Check progress
curl -H "x-user-email: a21@outlook.com" \
  http://localhost:8080/api/admin/goals/progress
```

---

## Next Steps

### 1. Frontend Integration
Create React components:
- **Admin Goals Dashboard** - List and manage all goals
- **Progress Leaderboard** - Real-time progress tracking
- **Rep Goal Card** - Personal goal display
- **Trend Chart** - 12-month visualization

### 2. Automation
Add cron jobs:
- **Auto-sync progress** - Hourly from sales_reps table
- **Monthly reminders** - Email admins on 1st to set goals
- **End-of-month bonuses** - Auto-trigger for achieved goals

### 3. Notifications
Email notifications:
- Admin: "Goals not set for {month}" (sent on 5th)
- Rep: "You're {X}% to your goal!"
- Admin: "{Rep} achieved their goal!"

### 4. Analytics
Additional features:
- Team-wide goals (not just individual)
- Quarterly and yearly tracking
- Goal templates for bulk creation
- Historical comparison charts

---

## Error Handling

All endpoints include proper error handling:

```typescript
// 400 Bad Request
{
  "error": "Missing required fields: salesRepId, month, year, goalAmount"
}

// 403 Forbidden
{
  "error": "Admin access required"
}

// 404 Not Found
{
  "error": "Sales rep not found"
}

// 500 Internal Server Error
{
  "error": "Database connection failed"
}
```

---

## Security

- **Authentication Required** - All endpoints require `x-user-email` header
- **Admin-Only Operations** - Goal management restricted to admins
- **Rep Self-Service** - Reps can only view their own data
- **SQL Injection Protection** - Parameterized queries
- **Input Validation** - All inputs validated before database ops
- **Transaction Safety** - Bonus triggers use transactions
- **Audit Trail** - All actions logged with admin email

---

## Performance

### Indexes Created
```sql
CREATE INDEX idx_rep_goals_rep_id ON rep_goals(sales_rep_id);
CREATE INDEX idx_rep_goals_month_year ON rep_goals(month, year);
CREATE INDEX idx_rep_goals_deadline ON rep_goals(deadline_met);
CREATE INDEX idx_rep_goals_bonus ON rep_goals(bonus_eligible, bonus_triggered);
```

### Optimization Tips
- Cache `/api/admin/goals/progress` for 5 minutes
- Cache `/api/rep/goals/progress` for 10 minutes
- Use generated column for progress_percentage (no runtime calculation)

---

## Support

For questions or issues:

1. Read full documentation: `/Users/a21/gemini-field-assistant/server/docs/REP_GOALS_API.md`
2. Check TypeScript types: `/Users/a21/gemini-field-assistant/src/types/repGoals.ts`
3. Run test script: `/Users/a21/gemini-field-assistant/scripts/test-rep-goals-api.sh`
4. Review migration: `/Users/a21/gemini-field-assistant/database/migrations/043_rep_goals.sql`

---

**Implementation Status:** ✅ Complete and Ready for Testing

**Database Migration:** 043_rep_goals.sql
**API Endpoints:** 9 new routes added
**TypeScript Types:** Full type definitions
**Documentation:** Complete API docs
**Test Script:** Automated endpoint testing

---

**Last Updated:** December 2025
**Author:** Claude (Backend Developer)
