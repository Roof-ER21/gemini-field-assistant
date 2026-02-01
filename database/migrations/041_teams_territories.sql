-- ==========================================================================
-- Migration 041: Teams and Territories from Neon DB
-- Syncs team structure from RoofTrack Neon database
-- ==========================================================================

-- Teams table (synced from Neon sales.teams)
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    neon_id INTEGER UNIQUE,  -- ID from Neon database for sync
    name TEXT NOT NULL UNIQUE,
    leader_id INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Territories table (synced from Neon sales.territories)
-- Note: There's an existing territories table (migration 025) with UUID primary key
-- This creates a simpler version for team/territory assignment
CREATE TABLE IF NOT EXISTS team_territories (
    id SERIAL PRIMARY KEY,
    neon_id INTEGER UNIQUE,  -- ID from Neon database for sync
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add team_id and territory_id to sales_reps if not exists
ALTER TABLE sales_reps ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE sales_reps ADD COLUMN IF NOT EXISTS territory_id INTEGER REFERENCES team_territories(id) ON DELETE SET NULL;

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_teams_leader ON teams(leader_id);
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
CREATE INDEX IF NOT EXISTS idx_team_territories_name ON team_territories(name);
CREATE INDEX IF NOT EXISTS idx_sales_reps_team ON sales_reps(team_id);
CREATE INDEX IF NOT EXISTS idx_sales_reps_territory ON sales_reps(territory_id);

-- Trigger to update updated_at on teams
CREATE OR REPLACE FUNCTION update_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_teams_updated_at ON teams;
CREATE TRIGGER trigger_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_teams_updated_at();

-- Trigger to update updated_at on team_territories
DROP TRIGGER IF EXISTS trigger_team_territories_updated_at ON team_territories;
CREATE TRIGGER trigger_team_territories_updated_at
    BEFORE UPDATE ON team_territories
    FOR EACH ROW
    EXECUTE FUNCTION update_teams_updated_at();

DO $$
BEGIN
    RAISE NOTICE '=== Migration 041: Teams and Territories ===';
    RAISE NOTICE 'Tables: teams, team_territories';
    RAISE NOTICE 'Columns added to sales_reps: team_id, territory_id';
    RAISE NOTICE 'Purpose: Sync team structure from Neon RoofTrack database';
END $$;
