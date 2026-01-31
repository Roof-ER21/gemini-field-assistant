-- ==========================================================================
-- Migration 040: User to Sales Rep Manual Mapping
-- Allows admins to manually associate Gemini users with sales reps
-- ==========================================================================

-- Manual mapping table for users who don't have matching emails
CREATE TABLE IF NOT EXISTS user_sales_rep_mapping (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id),
    UNIQUE(sales_rep_id)
);

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_user_sales_rep_mapping_user ON user_sales_rep_mapping(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sales_rep_mapping_sales_rep ON user_sales_rep_mapping(sales_rep_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_sales_rep_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_sales_rep_mapping_updated_at ON user_sales_rep_mapping;
CREATE TRIGGER trigger_user_sales_rep_mapping_updated_at
    BEFORE UPDATE ON user_sales_rep_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_user_sales_rep_mapping_updated_at();

DO $$
BEGIN
    RAISE NOTICE '=== Migration 040: User Sales Rep Mapping ===';
    RAISE NOTICE 'Table: user_sales_rep_mapping';
    RAISE NOTICE 'Purpose: Manual admin mapping of users to sales reps';
END $$;
