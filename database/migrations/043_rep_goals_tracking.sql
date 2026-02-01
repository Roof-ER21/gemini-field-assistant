-- ==========================================================================
-- Migration 043: Rep Goals Tracking System
-- Comprehensive goal management for sales reps (signups, revenue, bonuses)
-- ==========================================================================

-- ==========================================================================
-- 1. REP MONTHLY GOALS
-- Tracks signup and revenue goals set monthly (must be set by 6th)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS rep_monthly_goals (
    id SERIAL PRIMARY KEY,
    sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,

    -- Time period
    goal_month INTEGER NOT NULL CHECK (goal_month BETWEEN 1 AND 12),
    goal_year INTEGER NOT NULL CHECK (goal_year >= 2024),

    -- Signup goals
    signup_goal INTEGER NOT NULL DEFAULT 15,
    signups_actual DECIMAL(6,1) DEFAULT 0,
    signup_progress_percent DECIMAL(5,2) DEFAULT 0,

    -- Revenue goals
    revenue_goal DECIMAL(15,2) DEFAULT 0,
    revenue_actual DECIMAL(15,2) DEFAULT 0,
    revenue_progress_percent DECIMAL(5,2) DEFAULT 0,

    -- Bonus tracking
    bonus_tier_goal INTEGER DEFAULT 0 CHECK (bonus_tier_goal BETWEEN 0 AND 6),
    bonus_tier_actual INTEGER DEFAULT 0 CHECK (bonus_tier_actual BETWEEN 0 AND 6),
    bonus_triggered BOOLEAN DEFAULT false,
    bonus_amount DECIMAL(10,2) DEFAULT 0,

    -- Goal setting compliance (must be set by midnight of the 6th)
    set_by_deadline BOOLEAN DEFAULT false,
    goal_set_at TIMESTAMPTZ,
    goal_set_by UUID REFERENCES users(id),
    deadline TIMESTAMPTZ NOT NULL, -- Midnight of the 6th of the month

    -- Completion tracking
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'missed', 'archived')),
    completed_at TIMESTAMPTZ,

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one goal per rep per month
    UNIQUE(sales_rep_id, goal_year, goal_month)
);

-- ==========================================================================
-- 2. REP YEARLY GOALS
-- Annual targets with monthly breakdown tracking
-- ==========================================================================

CREATE TABLE IF NOT EXISTS rep_yearly_goals (
    id SERIAL PRIMARY KEY,
    sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,

    -- Time period
    goal_year INTEGER NOT NULL CHECK (goal_year >= 2024),

    -- Signup goals
    yearly_signup_goal INTEGER NOT NULL DEFAULT 180,
    yearly_signups_actual DECIMAL(8,1) DEFAULT 0,
    yearly_signup_progress_percent DECIMAL(5,2) DEFAULT 0,

    -- Revenue goals
    yearly_revenue_goal DECIMAL(15,2) DEFAULT 0,
    yearly_revenue_actual DECIMAL(15,2) DEFAULT 0,
    yearly_revenue_progress_percent DECIMAL(5,2) DEFAULT 0,

    -- Monthly breakdown (average expected per month)
    monthly_signup_target INTEGER GENERATED ALWAYS AS (yearly_signup_goal / 12) STORED,
    monthly_revenue_target DECIMAL(15,2) GENERATED ALWAYS AS (yearly_revenue_goal / 12) STORED,

    -- Completion tracking
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'missed', 'archived')),
    completed_at TIMESTAMPTZ,

    -- Metadata
    notes TEXT,
    goal_set_at TIMESTAMPTZ DEFAULT NOW(),
    goal_set_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One goal per rep per year
    UNIQUE(sales_rep_id, goal_year)
);

-- ==========================================================================
-- 3. GOAL PROGRESS SNAPSHOTS
-- Daily/weekly snapshots of goal progress for trend analysis
-- ==========================================================================

CREATE TABLE IF NOT EXISTS goal_progress_snapshots (
    id SERIAL PRIMARY KEY,
    sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,

    -- Time period
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    snapshot_type VARCHAR(20) NOT NULL CHECK (snapshot_type IN ('daily', 'weekly', 'monthly', 'ad_hoc')),

    -- Monthly goal reference
    monthly_goal_id INTEGER REFERENCES rep_monthly_goals(id) ON DELETE CASCADE,

    -- Snapshot data
    signups_to_date DECIMAL(6,1) DEFAULT 0,
    signup_goal INTEGER,
    signup_progress_percent DECIMAL(5,2),

    revenue_to_date DECIMAL(15,2) DEFAULT 0,
    revenue_goal DECIMAL(15,2),
    revenue_progress_percent DECIMAL(5,2),

    bonus_tier INTEGER DEFAULT 0,
    days_remaining INTEGER,

    -- Trend indicators
    on_pace BOOLEAN DEFAULT false,
    pace_indicator VARCHAR(20), -- 'ahead', 'on_track', 'behind', 'critical'

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================================
-- 4. GOAL ACHIEVEMENTS
-- Historical record of completed goals and achievements
-- ==========================================================================

CREATE TABLE IF NOT EXISTS goal_achievements (
    id SERIAL PRIMARY KEY,
    sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,

    -- Goal reference
    monthly_goal_id INTEGER REFERENCES rep_monthly_goals(id) ON DELETE SET NULL,
    yearly_goal_id INTEGER REFERENCES rep_yearly_goals(id) ON DELETE SET NULL,

    -- Achievement details
    achievement_type VARCHAR(30) NOT NULL CHECK (achievement_type IN (
        'monthly_signup_goal',
        'monthly_revenue_goal',
        'yearly_signup_goal',
        'yearly_revenue_goal',
        'bonus_tier_unlocked',
        'streak_milestone',
        'perfect_month'
    )),

    -- Time period
    achievement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    achievement_month INTEGER,
    achievement_year INTEGER NOT NULL,

    -- Achievement metrics
    goal_value DECIMAL(15,2),
    actual_value DECIMAL(15,2),
    percent_achieved DECIMAL(5,2),

    -- Bonus information
    bonus_amount DECIMAL(10,2),
    bonus_tier INTEGER,

    -- Recognition
    recognized BOOLEAN DEFAULT false,
    recognition_type VARCHAR(50), -- 'badge', 'notification', 'leaderboard_highlight', etc.

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================================
-- 5. GOAL DEADLINE REMINDERS
-- Track reminders for goal-setting deadlines
-- ==========================================================================

CREATE TABLE IF NOT EXISTS goal_deadline_reminders (
    id SERIAL PRIMARY KEY,
    sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,

    -- Reminder details
    reminder_type VARCHAR(30) NOT NULL CHECK (reminder_type IN (
        'goal_deadline_3days',
        'goal_deadline_1day',
        'goal_deadline_day',
        'goal_overdue'
    )),

    -- Time period
    target_month INTEGER NOT NULL CHECK (target_month BETWEEN 1 AND 12),
    target_year INTEGER NOT NULL CHECK (target_year >= 2024),
    deadline TIMESTAMPTZ NOT NULL,

    -- Reminder status
    sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMPTZ,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================================
-- INDEXES
-- ==========================================================================

-- rep_monthly_goals indexes
CREATE INDEX IF NOT EXISTS idx_monthly_goals_rep ON rep_monthly_goals(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_period ON rep_monthly_goals(goal_year, goal_month);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_status ON rep_monthly_goals(status);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_deadline ON rep_monthly_goals(deadline);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_rep_period ON rep_monthly_goals(sales_rep_id, goal_year, goal_month);

-- rep_yearly_goals indexes
CREATE INDEX IF NOT EXISTS idx_yearly_goals_rep ON rep_yearly_goals(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_yearly_goals_year ON rep_yearly_goals(goal_year);
CREATE INDEX IF NOT EXISTS idx_yearly_goals_status ON rep_yearly_goals(status);
CREATE INDEX IF NOT EXISTS idx_yearly_goals_rep_year ON rep_yearly_goals(sales_rep_id, goal_year);

-- goal_progress_snapshots indexes
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_rep ON goal_progress_snapshots(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_date ON goal_progress_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_type ON goal_progress_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_monthly_goal ON goal_progress_snapshots(monthly_goal_id);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_rep_date ON goal_progress_snapshots(sales_rep_id, snapshot_date DESC);

-- goal_achievements indexes
CREATE INDEX IF NOT EXISTS idx_achievements_rep ON goal_achievements(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_achievements_date ON goal_achievements(achievement_date DESC);
CREATE INDEX IF NOT EXISTS idx_achievements_type ON goal_achievements(achievement_type);
CREATE INDEX IF NOT EXISTS idx_achievements_year ON goal_achievements(achievement_year);
CREATE INDEX IF NOT EXISTS idx_achievements_rep_year ON goal_achievements(sales_rep_id, achievement_year);
CREATE INDEX IF NOT EXISTS idx_achievements_recognized ON goal_achievements(recognized) WHERE recognized = false;

-- goal_deadline_reminders indexes
CREATE INDEX IF NOT EXISTS idx_deadline_reminders_rep ON goal_deadline_reminders(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_deadline_reminders_deadline ON goal_deadline_reminders(deadline);
CREATE INDEX IF NOT EXISTS idx_deadline_reminders_sent ON goal_deadline_reminders(sent) WHERE sent = false;
CREATE INDEX IF NOT EXISTS idx_deadline_reminders_period ON goal_deadline_reminders(target_year, target_month);

-- ==========================================================================
-- TRIGGERS
-- ==========================================================================

-- Auto-update updated_at for rep_monthly_goals
CREATE OR REPLACE FUNCTION update_monthly_goals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_monthly_goals_updated_at ON rep_monthly_goals;
CREATE TRIGGER trigger_monthly_goals_updated_at
    BEFORE UPDATE ON rep_monthly_goals
    FOR EACH ROW
    EXECUTE FUNCTION update_monthly_goals_timestamp();

-- Auto-update updated_at for rep_yearly_goals
DROP TRIGGER IF EXISTS trigger_yearly_goals_updated_at ON rep_yearly_goals;
CREATE TRIGGER trigger_yearly_goals_updated_at
    BEFORE UPDATE ON rep_yearly_goals
    FOR EACH ROW
    EXECUTE FUNCTION update_monthly_goals_timestamp();

-- Auto-calculate progress percentages for monthly goals
CREATE OR REPLACE FUNCTION calculate_monthly_goal_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate signup progress
    IF NEW.signup_goal > 0 THEN
        NEW.signup_progress_percent = (NEW.signups_actual / NEW.signup_goal) * 100;
    END IF;

    -- Calculate revenue progress
    IF NEW.revenue_goal > 0 THEN
        NEW.revenue_progress_percent = (NEW.revenue_actual / NEW.revenue_goal) * 100;
    END IF;

    -- Check if goal completed
    IF NEW.signup_progress_percent >= 100 AND NEW.revenue_progress_percent >= 100 THEN
        NEW.status = 'completed';
        IF NEW.completed_at IS NULL THEN
            NEW.completed_at = NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_monthly_progress ON rep_monthly_goals;
CREATE TRIGGER trigger_calculate_monthly_progress
    BEFORE INSERT OR UPDATE ON rep_monthly_goals
    FOR EACH ROW
    EXECUTE FUNCTION calculate_monthly_goal_progress();

-- Auto-calculate progress percentages for yearly goals
CREATE OR REPLACE FUNCTION calculate_yearly_goal_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate signup progress
    IF NEW.yearly_signup_goal > 0 THEN
        NEW.yearly_signup_progress_percent = (NEW.yearly_signups_actual / NEW.yearly_signup_goal) * 100;
    END IF;

    -- Calculate revenue progress
    IF NEW.yearly_revenue_goal > 0 THEN
        NEW.yearly_revenue_progress_percent = (NEW.yearly_revenue_actual / NEW.yearly_revenue_goal) * 100;
    END IF;

    -- Check if goal completed
    IF NEW.yearly_signup_progress_percent >= 100 AND NEW.yearly_revenue_progress_percent >= 100 THEN
        NEW.status = 'completed';
        IF NEW.completed_at IS NULL THEN
            NEW.completed_at = NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_yearly_progress ON rep_yearly_goals;
CREATE TRIGGER trigger_calculate_yearly_progress
    BEFORE INSERT OR UPDATE ON rep_yearly_goals
    FOR EACH ROW
    EXECUTE FUNCTION calculate_yearly_goal_progress();

-- ==========================================================================
-- HELPER VIEWS
-- ==========================================================================

-- Current month goals with progress for all active reps
CREATE OR REPLACE VIEW v_current_month_goals AS
SELECT
    sr.id as sales_rep_id,
    sr.name as rep_name,
    sr.email,
    sr.team,
    rmg.id as goal_id,
    rmg.goal_month,
    rmg.goal_year,
    rmg.signup_goal,
    rmg.signups_actual,
    rmg.signup_progress_percent,
    rmg.revenue_goal,
    rmg.revenue_actual,
    rmg.revenue_progress_percent,
    rmg.bonus_tier_goal,
    rmg.bonus_tier_actual,
    rmg.bonus_triggered,
    rmg.set_by_deadline,
    rmg.deadline,
    rmg.status,
    CASE
        WHEN rmg.signup_progress_percent >= 100 THEN 'completed'
        WHEN rmg.signup_progress_percent >= 75 THEN 'on_track'
        WHEN rmg.signup_progress_percent >= 50 THEN 'needs_attention'
        ELSE 'critical'
    END as health_status,
    EXTRACT(DAY FROM (rmg.deadline - NOW())) as days_until_deadline
FROM sales_reps sr
LEFT JOIN rep_monthly_goals rmg ON sr.id = rmg.sales_rep_id
    AND rmg.goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
    AND rmg.goal_year = EXTRACT(YEAR FROM CURRENT_DATE)
WHERE sr.is_active = true
ORDER BY rmg.signup_progress_percent DESC;

-- Yearly goals summary
CREATE OR REPLACE VIEW v_yearly_goals_summary AS
SELECT
    sr.id as sales_rep_id,
    sr.name as rep_name,
    sr.email,
    sr.team,
    ryg.id as goal_id,
    ryg.goal_year,
    ryg.yearly_signup_goal,
    ryg.yearly_signups_actual,
    ryg.yearly_signup_progress_percent,
    ryg.yearly_revenue_goal,
    ryg.yearly_revenue_actual,
    ryg.yearly_revenue_progress_percent,
    ryg.monthly_signup_target,
    ryg.monthly_revenue_target,
    ryg.status,
    EXTRACT(MONTH FROM CURRENT_DATE) as current_month,
    12 - EXTRACT(MONTH FROM CURRENT_DATE) as months_remaining
FROM sales_reps sr
LEFT JOIN rep_yearly_goals ryg ON sr.id = ryg.sales_rep_id
    AND ryg.goal_year = EXTRACT(YEAR FROM CURRENT_DATE)
WHERE sr.is_active = true
ORDER BY ryg.yearly_signup_progress_percent DESC;

-- Goals needing to be set (approaching deadline)
CREATE OR REPLACE VIEW v_goals_needing_setup AS
SELECT
    sr.id as sales_rep_id,
    sr.name as rep_name,
    sr.email,
    EXTRACT(MONTH FROM CURRENT_DATE) as current_month,
    EXTRACT(YEAR FROM CURRENT_DATE) as current_year,
    rmg.id as existing_goal_id,
    rmg.set_by_deadline,
    rmg.deadline,
    CASE
        WHEN rmg.id IS NULL THEN 'not_set'
        WHEN rmg.set_by_deadline = false AND NOW() < rmg.deadline THEN 'pending'
        WHEN rmg.set_by_deadline = false AND NOW() >= rmg.deadline THEN 'overdue'
        ELSE 'complete'
    END as deadline_status,
    EXTRACT(DAY FROM (rmg.deadline - NOW())) as days_until_deadline
FROM sales_reps sr
LEFT JOIN rep_monthly_goals rmg ON sr.id = rmg.sales_rep_id
    AND rmg.goal_month = EXTRACT(MONTH FROM CURRENT_DATE)
    AND rmg.goal_year = EXTRACT(YEAR FROM CURRENT_DATE)
WHERE sr.is_active = true
    AND (rmg.id IS NULL OR rmg.set_by_deadline = false)
ORDER BY days_until_deadline ASC NULLS FIRST;

-- ==========================================================================
-- SEED DATA FOR CURRENT YEAR
-- ==========================================================================

-- Create yearly goals for all active reps for current year (if not exists)
INSERT INTO rep_yearly_goals (sales_rep_id, goal_year, yearly_signup_goal, yearly_revenue_goal)
SELECT
    id,
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    yearly_signup_goal,
    0 -- Revenue goal to be set manually
FROM sales_reps
WHERE is_active = true
ON CONFLICT (sales_rep_id, goal_year) DO NOTHING;

-- Create monthly goal template for current month (if not exists)
INSERT INTO rep_monthly_goals (
    sales_rep_id,
    goal_month,
    goal_year,
    signup_goal,
    deadline
)
SELECT
    id,
    EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER,
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    monthly_signup_goal,
    -- Deadline is midnight of the 6th of current month
    DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '5 days 23 hours 59 minutes'
FROM sales_reps
WHERE is_active = true
ON CONFLICT (sales_rep_id, goal_year, goal_month) DO NOTHING;

-- ==========================================================================
-- NOTIFICATION
-- ==========================================================================

DO $$
BEGIN
    RAISE NOTICE '=== Migration 043: Rep Goals Tracking System ===';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - rep_monthly_goals (monthly signup/revenue goals)';
    RAISE NOTICE '  - rep_yearly_goals (annual targets)';
    RAISE NOTICE '  - goal_progress_snapshots (trend tracking)';
    RAISE NOTICE '  - goal_achievements (historical records)';
    RAISE NOTICE '  - goal_deadline_reminders (deadline notifications)';
    RAISE NOTICE '';
    RAISE NOTICE 'Views created:';
    RAISE NOTICE '  - v_current_month_goals (current month progress)';
    RAISE NOTICE '  - v_yearly_goals_summary (annual progress)';
    RAISE NOTICE '  - v_goals_needing_setup (pending deadlines)';
    RAISE NOTICE '';
    RAISE NOTICE 'Features:';
    RAISE NOTICE '  ✅ Monthly signup goals (must be set by 6th)';
    RAISE NOTICE '  ✅ Yearly revenue goals with monthly breakdown';
    RAISE NOTICE '  ✅ Automatic progress calculation';
    RAISE NOTICE '  ✅ Bonus tier tracking';
    RAISE NOTICE '  ✅ Achievement history';
    RAISE NOTICE '  ✅ Deadline compliance tracking';
END $$;
