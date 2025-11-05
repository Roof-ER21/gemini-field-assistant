-- ============================================================================
-- Migration 004: Fix RAG Analytics and Add Insurance Companies Table
-- ============================================================================
-- Created: 2025-11-05
-- Purpose: Fix missing rag_analytics table and add insurance_companies table
-- ============================================================================

-- ============================================================================
-- RAG ANALYTICS TABLE
-- ============================================================================
-- Tracks RAG (Retrieval-Augmented Generation) queries and performance
CREATE TABLE IF NOT EXISTS rag_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    query_text TEXT NOT NULL,
    query_embedding VECTOR(1536), -- OpenAI/Gemini embedding dimension
    num_results INTEGER DEFAULT 0,
    avg_relevance_score FLOAT,
    response_time_ms INTEGER,
    sources_used JSONB,
    state VARCHAR(2), -- VA, MD, PA
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_rag_analytics_user_id ON rag_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_rag_analytics_created_at ON rag_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_analytics_state ON rag_analytics(state);

-- ============================================================================
-- INSURANCE COMPANIES TABLE
-- ============================================================================
-- Master list of insurance companies for dropdown selections
CREATE TABLE IF NOT EXISTS insurance_companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100), -- e.g., 'homeowners', 'commercial', 'auto'
    state_availability VARCHAR(10)[], -- Array of states: {'VA', 'MD', 'PA'}
    phone VARCHAR(20),
    website VARCHAR(255),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast name lookups
CREATE INDEX IF NOT EXISTS idx_insurance_companies_name ON insurance_companies(name);
CREATE INDEX IF NOT EXISTS idx_insurance_companies_category ON insurance_companies(category);
CREATE INDEX IF NOT EXISTS idx_insurance_companies_active ON insurance_companies(is_active);

-- ============================================================================
-- SEED INSURANCE COMPANIES DATA
-- ============================================================================
-- Insert common insurance companies (VA, MD, PA focus)
INSERT INTO insurance_companies (name, category, state_availability) VALUES
    ('State Farm', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('Allstate', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('Liberty Mutual', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('USAA', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('Nationwide', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('Farmers Insurance', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('Progressive', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('Travelers', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('American Family', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('GEICO', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('Chubb', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('The Hartford', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('Amica Mutual', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('Erie Insurance', 'homeowners', ARRAY['PA', 'MD', 'VA']),
    ('Auto-Owners Insurance', 'homeowners', ARRAY['PA']),
    ('Safeco', 'homeowners', ARRAY['VA', 'MD', 'PA']),
    ('MetLife', 'homeowners', ARRAY['VA', 'MD', 'PA'])
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Migration 004 completed successfully';
    RAISE NOTICE 'Created/Updated tables: rag_analytics, insurance_companies';
    RAISE NOTICE 'Seeded % insurance companies', (SELECT COUNT(*) FROM insurance_companies);
END $$;
