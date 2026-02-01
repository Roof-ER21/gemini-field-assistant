# Leaderboard Goals Management - Architecture Diagram

## System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        ADMIN PANEL UI                          │
│                  (AdminPanel.tsx - Settings Tab)               │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         │ imports & uses
                         ▼
┌────────────────────────────────────────────────────────────────┐
│           LEADERBOARD GOALS SECTION COMPONENT                  │
│              (LeaderboardGoalsSection.tsx)                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  1. Goal Setting Interface                                │ │
│  │     - Sales rep dropdown                                  │ │
│  │     - Monthly signup goal input                          │ │
│  │     - Yearly revenue goal input                          │ │
│  │     - Save/Update/Cancel buttons                         │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  2. Bulk Goal Management Table                           │ │
│  │     - Current month goals list                           │ │
│  │     - Status indicators (Goal Set/Not Set/Deadline)      │ │
│  │     - Edit/Delete actions                                │ │
│  │     - Export button                                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  3. Progress Summary                                      │ │
│  │     - Cards showing actual vs goal                       │ │
│  │     - Percentage calculations                            │ │
│  │     - Color-coded by performance                         │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         │ calls API functions
                         ▼
┌────────────────────────────────────────────────────────────────┐
│                    API INTEGRATION LAYER                       │
│                    (AdminPanel.tsx functions)                  │
│                                                                 │
│  fetchSalesReps()        GET  /api/admin/goals/reps           │
│  fetchAllGoals()         GET  /api/admin/goals                │
│  fetchGoalProgress()     GET  /api/admin/goals/progress       │
│  handleSaveGoal()        POST /api/admin/goals                │
│                          PUT  /api/admin/goals/:id            │
│  handleDeleteGoal()      DELETE /api/admin/goals/:id          │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         │ HTTP requests
                         ▼
┌────────────────────────────────────────────────────────────────┐
│                      BACKEND API ROUTES                        │
│                  (admin-goals-sample.ts - TO BE IMPLEMENTED)   │
│                                                                 │
│  GET    /api/admin/goals/reps       ─┐                        │
│  GET    /api/admin/goals             │ Authentication         │
│  GET    /api/admin/goals/progress    ├─ (requireAdmin)        │
│  POST   /api/admin/goals             │                        │
│  PUT    /api/admin/goals/:goalId     │                        │
│  DELETE /api/admin/goals/:goalId    ─┘                        │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         │ SQL queries
                         ▼
┌────────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER                             │
│                    (PostgreSQL)                                │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  TABLE: leaderboard_goals                                │ │
│  │                                                           │ │
│  │  - id (SERIAL PRIMARY KEY)                               │ │
│  │  - sales_rep_id (INTEGER)                                │ │
│  │  - monthly_signup_goal (INTEGER)                         │ │
│  │  - yearly_revenue_goal (DECIMAL)                         │ │
│  │  - month (VARCHAR - YYYY-MM)                             │ │
│  │  - created_at (TIMESTAMP)                                │ │
│  │  - updated_at (TIMESTAMP)                                │ │
│  │  - created_by_user_id (UUID)                             │ │
│  │                                                           │ │
│  │  UNIQUE: (sales_rep_id, month)                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  INDEXES                                                  │ │
│  │  - idx_leaderboard_goals_month                           │ │
│  │  - idx_leaderboard_goals_rep                             │ │
│  │  - idx_leaderboard_goals_rep_month                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  RELATED TABLES (existing)                               │ │
│  │  - sales_reps (for rep info)                             │ │
│  │  - leaderboard (for actual signup data)                  │ │
│  │  - users (for created_by reference)                      │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Creating a Goal

```
User Action (UI)
    │
    ▼
LeaderboardGoalsSection
    │ (form validation)
    ▼
handleSaveGoal()
    │ (prepare payload)
    ▼
POST /api/admin/goals
    │ (authentication check)
    ▼
Backend Route Handler
    │ (validate data)
    ▼
SQL INSERT
    │
    ▼
leaderboard_goals table
    │ (UNIQUE constraint check)
    ▼
Return goal object
    │
    ▼
Update UI state
    │
    ▼
Show success toast
    │
    ▼
Refresh goals list
```

### Fetching Progress

```
Component Mount
    │
    ▼
fetchGoalProgress()
    │
    ▼
GET /api/admin/goals/progress
    │
    ▼
Backend Route Handler
    │
    ▼
Query 1: Get goals
    │
    ▼
Query 2: Get actual signups
    │
    ▼
Combine & calculate %
    │
    ▼
Return progress array
    │
    ▼
Update UI state
    │
    ▼
Render progress cards
```

## State Management

```
AdminPanel.tsx (Parent Component)
├── State Variables
│   ├── salesReps: Array<Rep>
│   ├── selectedRepForGoal: string
│   ├── monthlySignupGoal: string
│   ├── yearlyRevenueGoal: string
│   ├── goalsLoading: boolean
│   ├── allGoals: Array<Goal>
│   ├── goalProgress: Array<Progress>
│   └── editingGoalId: number | null
│
├── Functions (passed as props)
│   ├── fetchSalesReps()
│   ├── fetchAllGoals()
│   ├── fetchGoalProgress()
│   ├── handleSaveGoal()
│   ├── handleDeleteGoal()
│   ├── setSelectedRepForGoal()
│   ├── setMonthlySignupGoal()
│   ├── setYearlyRevenueGoal()
│   └── setEditingGoalId()
│
└── Child Component
    └── LeaderboardGoalsSection
        ├── Uses all state via props
        └── Uses all functions via props
```

## File Structure

```
/Users/a21/gemini-field-assistant/
│
├── components/
│   ├── AdminPanel.tsx (modified)
│   │   ├── Imports LeaderboardGoalsSection
│   │   ├── Manages all state
│   │   ├── Provides API functions
│   │   └── Renders section in Settings tab
│   │
│   └── LeaderboardGoalsSection.tsx (new)
│       ├── Receives props from parent
│       ├── Renders UI sections
│       ├── Handles user interactions
│       └── Calls parent functions
│
├── server/
│   ├── migrations/
│   │   └── 007_leaderboard_goals.sql (new)
│   │       ├── CREATE TABLE
│   │       ├── CREATE INDEXES
│   │       └── CREATE TRIGGER
│   │
│   └── routes/
│       └── admin-goals-sample.ts (new, sample)
│           ├── GET /reps
│           ├── GET /goals
│           ├── GET /progress
│           ├── POST /goals
│           ├── PUT /goals/:id
│           └── DELETE /goals/:id
│
└── Documentation/
    ├── LEADERBOARD_GOALS_IMPLEMENTATION.md
    ├── GOALS_FEATURE_SUMMARY.md
    ├── IMPLEMENTATION_COMPLETE.md
    └── ARCHITECTURE_DIAGRAM.md (this file)
```

## Component Hierarchy

```
App
└── AdminPanel
    └── Settings Tab (activeTab === 'settings')
        ├── User Actions Section
        ├── Feature Toggles Section
        ├── Leaderboard Settings Section
        ├── ▶ LeaderboardGoalsSection ◀ (NEW)
        │   ├── Deadline Warning Banner
        │   ├── Goal Setting Form
        │   ├── Goals Table
        │   └── Progress Summary Cards
        ├── Susan AI Settings Section
        └── Territory & Canvassing Settings Section
```

## API Request/Response Flow

### Example: Create Goal

```
Frontend                    Backend                     Database
   │                           │                            │
   │ POST /api/admin/goals     │                            │
   │ {                         │                            │
   │   salesRepId: 1,          │                            │
   │   monthlySignupGoal: 10,  │                            │
   │   yearlyRevenueGoal: 250k │                            │
   │ }                         │                            │
   ├──────────────────────────>│                            │
   │                           │                            │
   │                           │ Validate request           │
   │                           │ Check admin auth           │
   │                           │                            │
   │                           │ INSERT INTO ...            │
   │                           ├───────────────────────────>│
   │                           │                            │
   │                           │                            │ Check UNIQUE
   │                           │                            │ constraint
   │                           │                            │
   │                           │ Return new row             │
   │                           │<───────────────────────────┤
   │                           │                            │
   │                           │ Fetch rep name             │
   │                           ├───────────────────────────>│
   │                           │<───────────────────────────┤
   │                           │                            │
   │ 201 Created               │                            │
   │ { goal: {...} }           │                            │
   │<──────────────────────────┤                            │
   │                           │                            │
   │ Update local state        │                            │
   │ Show success toast        │                            │
   │ Refresh goals list        │                            │
   │                           │                            │
```

## Security & Authentication Flow

```
User Request
    │
    ▼
Frontend sends request
with x-user-email header
    │
    ▼
Backend receives request
    │
    ▼
requireAdmin middleware
    │
    ├── Check user exists
    ├── Check user role === 'admin'
    └── Reject if not admin
    │
    ▼
Route handler executes
    │
    ▼
Database query
    │
    ▼
Return response
```

## Validation Layers

```
Layer 1: Frontend UI
├── Required field validation
├── Positive number validation
├── Button disabled if invalid
└── Visual feedback

Layer 2: Frontend Function
├── Check all fields present
├── Display toast if invalid
└── Don't call API if invalid

Layer 3: Backend Route
├── Validate request body
├── Check data types
├── Verify positive numbers
└── Return 400 if invalid

Layer 4: Database
├── CHECK constraints
├── UNIQUE constraints
├── Foreign key constraints
└── Return error if violated
```

## Error Handling Flow

```
Error Occurs
    │
    ▼
Caught in try/catch
    │
    ▼
Log to console
    │
    ▼
Display toast notification
    │
    ├── Success (green)
    ├── Error (red)
    └── Info (blue)
    │
    ▼
Reset loading state
    │
    ▼
User can retry
```

## Technology Stack

```
Frontend
├── React 18+
├── TypeScript
├── Vite (build tool)
├── Lucide React (icons)
└── Custom Toast system

Backend (to be implemented)
├── Node.js
├── Express
├── TypeScript
└── PostgreSQL client

Database
├── PostgreSQL
├── Migrations
├── Indexes
└── Triggers
```

## Deployment Checklist

- [ ] Frontend: ✅ Already deployed (part of AdminPanel)
- [ ] Migration: Run `007_leaderboard_goals.sql`
- [ ] Backend: Implement API routes
- [ ] Testing: Verify all endpoints
- [ ] Monitoring: Add logging
- [ ] Documentation: Team training
- [ ] Production: Deploy to Railway

---

**Diagram Version:** 1.0
**Last Updated:** February 1, 2026
**Author:** Claude Code
