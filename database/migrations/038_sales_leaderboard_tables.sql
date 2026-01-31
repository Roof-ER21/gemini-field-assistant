-- ==========================================================================
-- Migration 038: Sales Leaderboard Tables (Google Sheets Integration)
-- Creates local tables to replace RoofTrack dependency
-- ==========================================================================

-- Sales Representatives (synced from Google Sheets)
CREATE TABLE IF NOT EXISTS sales_reps (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    team TEXT,
    title TEXT,
    avatar TEXT,
    monthly_revenue DECIMAL(15,2) DEFAULT 0,
    yearly_revenue DECIMAL(15,2) DEFAULT 0,
    revenue_2025 DECIMAL(15,2) DEFAULT 0,
    revenue_2026 DECIMAL(15,2) DEFAULT 0,
    all_time_revenue DECIMAL(15,2) DEFAULT 0,
    monthly_signups DECIMAL(6,1) DEFAULT 0,
    yearly_signups DECIMAL(8,1) DEFAULT 0,
    goal_progress DECIMAL(5,2) DEFAULT 0,
    monthly_signup_goal INTEGER DEFAULT 15,
    yearly_signup_goal INTEGER DEFAULT 180,
    current_bonus_tier INTEGER DEFAULT 0, -- 0-6
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gamification: Player profiles
CREATE TABLE IF NOT EXISTS player_profiles (
    id SERIAL PRIMARY KEY,
    sales_rep_id INTEGER UNIQUE REFERENCES sales_reps(id) ON DELETE CASCADE,
    display_alias TEXT,
    player_level INTEGER DEFAULT 1, -- 1-21 (Agent 21)
    total_career_points INTEGER DEFAULT 0,
    season_points INTEGER DEFAULT 0,
    monthly_points INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historical rankings
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id SERIAL PRIMARY KEY,
    sales_rep_id INTEGER REFERENCES sales_reps(id) ON DELETE CASCADE,
    snapshot_date DATE DEFAULT CURRENT_DATE,
    rank INTEGER,
    points INTEGER,
    monthly_signups DECIMAL(6,1),
    season_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync tracking
CREATE TABLE IF NOT EXISTS sheets_sync_log (
    id SERIAL PRIMARY KEY,
    sync_type TEXT, -- 'signups', 'revenue', 'full'
    records_synced INTEGER,
    records_created INTEGER,
    records_updated INTEGER,
    records_deleted INTEGER,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_reps_email ON sales_reps(email);
CREATE INDEX IF NOT EXISTS idx_sales_reps_active ON sales_reps(is_active);
CREATE INDEX IF NOT EXISTS idx_player_profiles_rep ON player_profiles(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_rep ON leaderboard_snapshots(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_date ON leaderboard_snapshots(snapshot_date DESC);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 038: Sales leaderboard tables created!';
    RAISE NOTICE '📊 Tables: sales_reps, player_profiles, leaderboard_snapshots, sheets_sync_log';
END $$;
