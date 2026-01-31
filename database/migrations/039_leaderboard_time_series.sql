-- ==========================================================================
-- Migration 039: Leaderboard time-series metrics
-- Stores monthly + yearly totals for signups and estimates
-- ==========================================================================

CREATE TABLE IF NOT EXISTS sales_rep_monthly_metrics (
    sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    signups DECIMAL(10,2) DEFAULT 0,
    estimates DECIMAL(15,2) DEFAULT 0,
    revenue DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (sales_rep_id, year, month)
);

CREATE TABLE IF NOT EXISTS sales_rep_yearly_metrics (
    sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    signups DECIMAL(10,2) DEFAULT 0,
    estimates DECIMAL(15,2) DEFAULT 0,
    revenue DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (sales_rep_id, year)
);

CREATE INDEX IF NOT EXISTS idx_sales_rep_monthly_year ON sales_rep_monthly_metrics(year, month);
CREATE INDEX IF NOT EXISTS idx_sales_rep_yearly_year ON sales_rep_yearly_metrics(year);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 039: Leaderboard time-series metrics tables created!';
    RAISE NOTICE '📊 Tables: sales_rep_monthly_metrics, sales_rep_yearly_metrics';
END $$;
