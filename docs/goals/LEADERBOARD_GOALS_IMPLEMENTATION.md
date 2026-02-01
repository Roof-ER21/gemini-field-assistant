# Leaderboard Goals Management - Implementation Summary

## Overview
Added comprehensive Leaderboard Goals Management functionality to the Admin Settings tab in AdminPanel.tsx.

## Files Modified

### 1. `/components/AdminPanel.tsx`
**Changes:**
- Added import for `LeaderboardGoalsSection` component
- Added state variables for goals management (lines after existing state):
  ```typescript
  const [salesReps, setSalesReps] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [selectedRepForGoal, setSelectedRepForGoal] = useState<string>('');
  const [monthlySignupGoal, setMonthlySignupGoal] = useState<string>('');
  const [yearlyRevenueGoal, setYearlyRevenueGoal] = useState<string>('');
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [allGoals, setAllGoals] = useState<Array<any>>([]);
  const [goalProgress, setGoalProgress] = useState<Array<any>>([]);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  ```

- Added goal management functions (after `handleLeaderboardSync`):
  - `fetchSalesReps()` - Fetches available sales reps
  - `fetchAllGoals()` - Fetches all goals for current month
  - `fetchGoalProgress()` - Fetches progress data for goals
  - `handleSaveGoal()` - Creates or updates a goal
  - `handleDeleteGoal(goalId)` - Deletes a goal

- Added `<LeaderboardGoalsSection />` component in Settings tab (between Leaderboard Settings and Susan AI Settings sections)

### 2. `/components/LeaderboardGoalsSection.tsx` (NEW FILE)
**Purpose:** Standalone component for managing leaderboard goals

**Features:**
1. **Goal Setting Interface**
   - Dropdown to select sales rep
   - Input for monthly signup goal (number)
   - Input for yearly revenue goal (currency)
   - Deadline warning (shows if past 6th of month)
   - Save/Update button with validation

2. **Bulk Goal Management Table**
   - Shows all reps and their current month goals
   - Columns: Rep Name, Monthly Goal, Yearly Goal, Status, Actions
   - Status indicators:
     - "Goal Set" (green) - Goal has been set
     - "Not Set" (yellow) - No goal set yet
     - "Deadline Passed" (red) - Past 6th of month, no goal
   - Inline edit and delete actions
   - Export capability (button present, needs implementation)

3. **Goal Progress Summary**
   - Card-based display showing progress for each rep
   - Shows actual vs goal with percentage
   - Color-coded: green if >= 80%, orange if < 80%

**Props Interface:**
```typescript
interface LeaderboardGoalsSectionProps {
  salesReps: Array<{ id: number; name: string; email: string }>;
  selectedRepForGoal: string;
  setSelectedRepForGoal: (value: string) => void;
  monthlySignupGoal: string;
  setMonthlySignupGoal: (value: string) => void;
  yearlyRevenueGoal: string;
  setYearlyRevenueGoal: (value: string) => void;
  goalsLoading: boolean;
  allGoals: Array<any>;
  goalProgress: Array<any>;
  editingGoalId: number | null;
  setEditingGoalId: (value: number | null) => void;
  handleSaveGoal: () => void;
  handleDeleteGoal: (goalId: number) => void;
  fetchSalesReps: () => void;
  fetchAllGoals: () => void;
  fetchGoalProgress: () => void;
}
```

## Required Backend API Endpoints

### 1. GET `/api/admin/goals/reps`
**Purpose:** Fetch all sales reps eligible for goal setting

**Request Headers:**
```
x-user-email: admin@example.com (optional, for auth)
```

**Response:**
```json
{
  "reps": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com"
    },
    {
      "id": 2,
      "name": "Jane Smith",
      "email": "jane@example.com"
    }
  ]
}
```

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 500: Server error

---

### 2. GET `/api/admin/goals`
**Purpose:** Fetch all goals for the current month

**Request Headers:**
```
x-user-email: admin@example.com (optional, for auth)
```

**Query Parameters:**
- `month` (optional): YYYY-MM format (defaults to current month)
- `year` (optional): YYYY format (defaults to current year)

**Response:**
```json
{
  "goals": [
    {
      "id": 1,
      "repId": 1,
      "repName": "John Doe",
      "monthlySignupGoal": 10,
      "yearlyRevenueGoal": 250000,
      "month": "2026-02",
      "createdAt": "2026-02-01T10:00:00Z",
      "updatedAt": "2026-02-01T10:00:00Z"
    },
    {
      "id": 2,
      "repId": 2,
      "repName": "Jane Smith",
      "monthlySignupGoal": 15,
      "yearlyRevenueGoal": 300000,
      "month": "2026-02",
      "createdAt": "2026-02-01T10:00:00Z",
      "updatedAt": "2026-02-01T10:00:00Z"
    }
  ]
}
```

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 500: Server error

---

### 3. GET `/api/admin/goals/progress`
**Purpose:** Fetch progress data for all goals in current month

**Request Headers:**
```
x-user-email: admin@example.com (optional, for auth)
```

**Query Parameters:**
- `month` (optional): YYYY-MM format (defaults to current month)

**Response:**
```json
{
  "progress": [
    {
      "repId": 1,
      "repName": "John Doe",
      "goal": 10,
      "actual": 8,
      "percentage": 80.0
    },
    {
      "repId": 2,
      "repName": "Jane Smith",
      "goal": 15,
      "actual": 12,
      "percentage": 80.0
    }
  ]
}
```

**Notes:**
- `actual` should come from leaderboard data (signups for the month)
- `percentage` = (actual / goal) * 100

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 500: Server error

---

### 4. POST `/api/admin/goals`
**Purpose:** Create a new goal for a sales rep

**Request Headers:**
```
Content-Type: application/json
x-user-email: admin@example.com (optional, for auth)
```

**Request Body:**
```json
{
  "salesRepId": 1,
  "monthlySignupGoal": 10,
  "yearlyRevenueGoal": 250000
}
```

**Validation:**
- `salesRepId` (required): Must be a valid sales rep ID
- `monthlySignupGoal` (required): Must be a positive integer
- `yearlyRevenueGoal` (required): Must be a positive number
- Month defaults to current month
- Should prevent duplicate goals for same rep + month

**Response:**
```json
{
  "success": true,
  "goal": {
    "id": 1,
    "repId": 1,
    "repName": "John Doe",
    "monthlySignupGoal": 10,
    "yearlyRevenueGoal": 250000,
    "month": "2026-02",
    "createdAt": "2026-02-01T10:00:00Z",
    "updatedAt": "2026-02-01T10:00:00Z"
  }
}
```

**Status Codes:**
- 201: Created successfully
- 400: Bad request (validation error)
- 401: Unauthorized
- 409: Conflict (duplicate goal for rep + month)
- 500: Server error

---

### 5. PUT `/api/admin/goals/:goalId`
**Purpose:** Update an existing goal

**Request Headers:**
```
Content-Type: application/json
x-user-email: admin@example.com (optional, for auth)
```

**URL Parameters:**
- `goalId`: The ID of the goal to update

**Request Body:**
```json
{
  "salesRepId": 1,
  "monthlySignupGoal": 12,
  "yearlyRevenueGoal": 275000
}
```

**Validation:**
- Same as POST validation
- Goal must exist
- Cannot change the month of an existing goal

**Response:**
```json
{
  "success": true,
  "goal": {
    "id": 1,
    "repId": 1,
    "repName": "John Doe",
    "monthlySignupGoal": 12,
    "yearlyRevenueGoal": 275000,
    "month": "2026-02",
    "createdAt": "2026-02-01T10:00:00Z",
    "updatedAt": "2026-02-01T12:30:00Z"
  }
}
```

**Status Codes:**
- 200: Updated successfully
- 400: Bad request (validation error)
- 401: Unauthorized
- 404: Goal not found
- 500: Server error

---

### 6. DELETE `/api/admin/goals/:goalId`
**Purpose:** Delete a goal

**Request Headers:**
```
x-user-email: admin@example.com (optional, for auth)
```

**URL Parameters:**
- `goalId`: The ID of the goal to delete

**Response:**
```json
{
  "success": true,
  "message": "Goal deleted successfully"
}
```

**Status Codes:**
- 200: Deleted successfully
- 401: Unauthorized
- 404: Goal not found
- 500: Server error

---

## Database Schema Suggestion

```sql
CREATE TABLE leaderboard_goals (
  id SERIAL PRIMARY KEY,
  sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
  monthly_signup_goal INTEGER NOT NULL CHECK (monthly_signup_goal > 0),
  yearly_revenue_goal DECIMAL(12, 2) NOT NULL CHECK (yearly_revenue_goal > 0),
  month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by_user_id UUID REFERENCES users(id),

  -- Ensure one goal per rep per month
  UNIQUE(sales_rep_id, month)
);

-- Index for faster queries
CREATE INDEX idx_leaderboard_goals_month ON leaderboard_goals(month);
CREATE INDEX idx_leaderboard_goals_rep ON leaderboard_goals(sales_rep_id);
```

## Business Logic Notes

1. **Deadline Warning:**
   - Goals should be set by the 6th of each month
   - UI shows warning if current date > 6th and no goal exists for current month
   - This is a soft deadline (warning only, not enforced)

2. **Goal Progress Calculation:**
   - Progress is calculated from actual leaderboard data
   - `actual` = number of signups from leaderboard for the month
   - `percentage` = (actual / monthly_signup_goal) * 100
   - Status: Green if >= 80%, Orange if < 80%

3. **Future Features (Not Yet Implemented):**
   - Bonus tier configuration (UI exists but not wired up)
   - Trigger bonus button (mentioned in requirements)
   - Goal history view (mentioned in requirements)
   - Export functionality (button exists but not wired up)

## Testing Checklist

- [ ] Can fetch sales reps list
- [ ] Can create a new goal
- [ ] Can update an existing goal
- [ ] Can delete a goal
- [ ] Goal validation works (required fields, positive numbers)
- [ ] Deadline warning appears after 6th of month
- [ ] Progress calculation is accurate
- [ ] Status indicators show correct colors
- [ ] Edit mode pre-fills form correctly
- [ ] Cancel button clears edit mode
- [ ] Cannot create duplicate goals for same rep + month
- [ ] Admin authentication is checked

## UI/UX Features

- Responsive grid layouts
- Color-coded status indicators
- Deadline warning banner
- Inline editing in table
- Loading states during API calls
- Toast notifications for success/error
- Validation feedback
- Current month display
- Progress percentage display
- Edit/Delete action buttons

## Color Scheme (matches existing AdminPanel design)

- Background: `#0a0a0a`, `#111111`
- Borders: `#262626`
- Text Primary: `#ffffff`
- Text Secondary: `#a1a1aa`, `#71717a`
- Success: `#10b981`, `#059669`, `#34d399`
- Warning: `#fb923c`, `#fdba74`
- Danger: `#dc2626`, `#7c2d12`, `#ea580c`
- Info: `#3b82f6`
- Purple: `#8b5cf6`
