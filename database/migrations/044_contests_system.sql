-- ==========================================================================
-- Migration 044: Sales Contests System
-- Enables company-wide and team-based sales competitions
-- ==========================================================================

-- Main contests table
CREATE TABLE IF NOT EXISTS contests (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    contest_type VARCHAR(50) NOT NULL CHECK (contest_type IN ('company_wide', 'team_based', 'individual')),
    metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('signups', 'revenue', 'both')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_monthly BOOLEAN DEFAULT false,
    prize_description TEXT,
    rules TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Contest participants table (for team assignments not based on existing teams)
CREATE TABLE IF NOT EXISTS contest_participants (
    id SERIAL PRIMARY KEY,
    contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
    team_name VARCHAR(255), -- Custom team name for this contest (optional)
    is_team_leader BOOLEAN DEFAULT false,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(contest_id, sales_rep_id)
);

-- Contest standings table (cached leaderboard)
CREATE TABLE IF NOT EXISTS contest_standings (
    id SERIAL PRIMARY KEY,
    contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    sales_rep_id INTEGER REFERENCES sales_reps(id) ON DELETE CASCADE,
    team_name VARCHAR(255), -- For team-based contests
    signups_count INTEGER DEFAULT 0,
    revenue_amount DECIMAL(15,2) DEFAULT 0.00,
    rank INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(contest_id, sales_rep_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contests_active ON contests(is_active);
CREATE INDEX IF NOT EXISTS idx_contests_dates ON contests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_contests_type ON contests(contest_type);
CREATE INDEX IF NOT EXISTS idx_contests_created_by ON contests(created_by);

CREATE INDEX IF NOT EXISTS idx_contest_participants_contest ON contest_participants(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_participants_rep ON contest_participants(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_contest_participants_team ON contest_participants(contest_id, team_name);

CREATE INDEX IF NOT EXISTS idx_contest_standings_contest ON contest_standings(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_standings_rank ON contest_standings(contest_id, rank);
CREATE INDEX IF NOT EXISTS idx_contest_standings_team ON contest_standings(contest_id, team_name);

-- Trigger to update updated_at on contests
CREATE OR REPLACE FUNCTION update_contests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contests_updated_at ON contests;
CREATE TRIGGER trigger_contests_updated_at
    BEFORE UPDATE ON contests
    FOR EACH ROW
    EXECUTE FUNCTION update_contests_updated_at();

-- Function to refresh contest standings
CREATE OR REPLACE FUNCTION refresh_contest_standings(contest_id_param INTEGER)
RETURNS void AS $$
DECLARE
    v_contest RECORD;
    v_start_date DATE;
    v_end_date DATE;
    v_contest_type VARCHAR(50);
    v_metric_type VARCHAR(50);
BEGIN
    -- Get contest details
    SELECT start_date, end_date, contest_type, metric_type
    INTO v_start_date, v_end_date, v_contest_type, v_metric_type
    FROM contests
    WHERE id = contest_id_param;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contest % not found', contest_id_param;
    END IF;

    -- Clear existing standings
    DELETE FROM contest_standings WHERE contest_id = contest_id_param;

    -- Calculate standings based on contest type
    IF v_contest_type = 'company_wide' THEN
        -- Company-wide: all sales reps
        INSERT INTO contest_standings (contest_id, sales_rep_id, team_name, signups_count, revenue_amount)
        SELECT
            contest_id_param,
            sr.id,
            NULL,
            COALESCE(COUNT(DISTINCT CASE
                WHEN v_metric_type IN ('signups', 'both')
                THEN rg.id
            END), 0) as signups_count,
            COALESCE(SUM(CASE
                WHEN v_metric_type IN ('revenue', 'both')
                THEN rg.revenue
                ELSE 0
            END), 0) as revenue_amount
        FROM sales_reps sr
        LEFT JOIN rep_goals rg ON sr.id = rg.sales_rep_id
            AND rg.tracked_date >= v_start_date
            AND rg.tracked_date <= v_end_date
        WHERE sr.is_active = true
        GROUP BY sr.id;

    ELSIF v_contest_type = 'team_based' THEN
        -- Team-based: aggregate by custom team name or existing team
        INSERT INTO contest_standings (contest_id, sales_rep_id, team_name, signups_count, revenue_amount)
        SELECT
            contest_id_param,
            NULL,
            COALESCE(cp.team_name, t.name, 'No Team') as team_name,
            COALESCE(COUNT(DISTINCT CASE
                WHEN v_metric_type IN ('signups', 'both')
                THEN rg.id
            END), 0) as signups_count,
            COALESCE(SUM(CASE
                WHEN v_metric_type IN ('revenue', 'both')
                THEN rg.revenue
                ELSE 0
            END), 0) as revenue_amount
        FROM contest_participants cp
        JOIN sales_reps sr ON cp.sales_rep_id = sr.id
        LEFT JOIN teams t ON sr.team_id = t.id
        LEFT JOIN rep_goals rg ON sr.id = rg.sales_rep_id
            AND rg.tracked_date >= v_start_date
            AND rg.tracked_date <= v_end_date
        WHERE cp.contest_id = contest_id_param
        GROUP BY COALESCE(cp.team_name, t.name, 'No Team');

    ELSE -- 'individual'
        -- Individual: only contest participants
        INSERT INTO contest_standings (contest_id, sales_rep_id, team_name, signups_count, revenue_amount)
        SELECT
            contest_id_param,
            sr.id,
            NULL,
            COALESCE(COUNT(DISTINCT CASE
                WHEN v_metric_type IN ('signups', 'both')
                THEN rg.id
            END), 0) as signups_count,
            COALESCE(SUM(CASE
                WHEN v_metric_type IN ('revenue', 'both')
                THEN rg.revenue
                ELSE 0
            END), 0) as revenue_amount
        FROM contest_participants cp
        JOIN sales_reps sr ON cp.sales_rep_id = sr.id
        LEFT JOIN rep_goals rg ON sr.id = rg.sales_rep_id
            AND rg.tracked_date >= v_start_date
            AND rg.tracked_date <= v_end_date
        WHERE cp.contest_id = contest_id_param
        GROUP BY sr.id;
    END IF;

    -- Update ranks based on metric type
    UPDATE contest_standings cs
    SET rank = subquery.rank
    FROM (
        SELECT
            id,
            CASE
                WHEN v_metric_type = 'signups' THEN
                    RANK() OVER (ORDER BY signups_count DESC, revenue_amount DESC)
                WHEN v_metric_type = 'revenue' THEN
                    RANK() OVER (ORDER BY revenue_amount DESC, signups_count DESC)
                ELSE -- 'both'
                    RANK() OVER (ORDER BY signups_count + revenue_amount DESC)
            END as rank
        FROM contest_standings
        WHERE contest_id = contest_id_param
    ) subquery
    WHERE cs.id = subquery.id;

    -- Update standings timestamp
    UPDATE contest_standings
    SET updated_at = NOW()
    WHERE contest_id = contest_id_param;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    RAISE NOTICE '=== Migration 044: Sales Contests System ===';
    RAISE NOTICE 'Tables: contests, contest_participants, contest_standings';
    RAISE NOTICE 'Function: refresh_contest_standings()';
    RAISE NOTICE 'Purpose: Enable sales competitions and leaderboards';
END $$;
