-- ==========================================================================
-- Migration 041: Add Revenue Goals to Sales Reps
-- Adds monthly and yearly revenue goal tracking columns
-- ==========================================================================

-- Add revenue goal columns
ALTER TABLE sales_reps
ADD COLUMN IF NOT EXISTS monthly_revenue_goal DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS yearly_revenue_goal DECIMAL(15,2) DEFAULT 0;

-- Update default values for existing reps (optional - adjust as needed)
UPDATE sales_reps
SET
  monthly_revenue_goal = 50000,
  yearly_revenue_goal = 600000
WHERE monthly_revenue_goal = 0 AND yearly_revenue_goal = 0;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 041: Revenue goal columns added!';
    RAISE NOTICE '📊 Columns: monthly_revenue_goal, yearly_revenue_goal';
END $$;
