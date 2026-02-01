-- Migration 007: Leaderboard Goals Management
-- Description: Create table for tracking monthly/yearly goals for sales reps
-- Author: Claude Code
-- Date: 2026-02-01

-- Create leaderboard_goals table
CREATE TABLE IF NOT EXISTS leaderboard_goals (
  id SERIAL PRIMARY KEY,
  sales_rep_id INTEGER NOT NULL,
  monthly_signup_goal INTEGER NOT NULL CHECK (monthly_signup_goal > 0),
  yearly_revenue_goal DECIMAL(12, 2) NOT NULL CHECK (yearly_revenue_goal > 0),
  month VARCHAR(7) NOT NULL, -- Format: YYYY-MM (e.g., '2026-02')
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Ensure one goal per rep per month
  CONSTRAINT unique_rep_month UNIQUE(sales_rep_id, month)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_leaderboard_goals_month ON leaderboard_goals(month);
CREATE INDEX IF NOT EXISTS idx_leaderboard_goals_rep ON leaderboard_goals(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_goals_rep_month ON leaderboard_goals(sales_rep_id, month);

-- Add trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_leaderboard_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leaderboard_goals_updated_at
  BEFORE UPDATE ON leaderboard_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_leaderboard_goals_updated_at();

-- Add comments for documentation
COMMENT ON TABLE leaderboard_goals IS 'Monthly and yearly performance goals for sales reps';
COMMENT ON COLUMN leaderboard_goals.sales_rep_id IS 'Foreign key to sales_reps table (from leaderboard)';
COMMENT ON COLUMN leaderboard_goals.monthly_signup_goal IS 'Target number of signups for the month';
COMMENT ON COLUMN leaderboard_goals.yearly_revenue_goal IS 'Target revenue for the year in USD';
COMMENT ON COLUMN leaderboard_goals.month IS 'Target month in YYYY-MM format';
COMMENT ON COLUMN leaderboard_goals.created_by_user_id IS 'Admin user who created the goal';
