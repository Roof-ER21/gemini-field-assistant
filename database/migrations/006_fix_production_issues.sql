-- ============================================================================
-- Migration 006: Fix Production Issues
-- ============================================================================
-- Created: 2025-11-05
-- Purpose: Fix rag_documents type constraint and ensure rag_analytics has all columns
-- ============================================================================

-- ============================================================================
-- 1. FIX RAG_DOCUMENTS TYPE CONSTRAINT
-- ============================================================================
-- Add 'processed' to the allowed types for rag_documents

DO $$
BEGIN
    -- Check if rag_documents table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'rag_documents') THEN

        RAISE NOTICE 'Fixing rag_documents type constraint...';

        -- Drop the existing constraint
        ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_type_check;

        -- Add the corrected constraint with 'processed' type
        ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_type_check
            CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text', 'processed'));

        RAISE NOTICE '✓ rag_documents constraint updated to include processed type';
    ELSE
        RAISE NOTICE '⚠ rag_documents table does not exist, skipping constraint fix';
    END IF;
END $$;

-- ============================================================================
-- 2. ENSURE RAG_ANALYTICS TABLE EXISTS WITH CORRECT SCHEMA
-- ============================================================================
-- The rag_analytics table should have been created by migration 004,
-- but we'll ensure it exists with all required columns

DO $$
BEGIN
    -- Check if rag_analytics table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'rag_analytics') THEN

        RAISE NOTICE 'Creating rag_analytics table...';

        CREATE TABLE rag_analytics (
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

        -- Create indexes
        CREATE INDEX idx_rag_analytics_user_id ON rag_analytics(user_id);
        CREATE INDEX idx_rag_analytics_created_at ON rag_analytics(created_at DESC);
        CREATE INDEX idx_rag_analytics_state ON rag_analytics(state);

        RAISE NOTICE '✓ rag_analytics table created successfully';
    ELSE
        RAISE NOTICE 'rag_analytics table exists, checking for missing columns...';

        -- Ensure query_text column exists (this was the error in production)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'query_text') THEN

            RAISE NOTICE 'Adding missing query_text column...';
            ALTER TABLE rag_analytics ADD COLUMN query_text TEXT NOT NULL DEFAULT '';
            RAISE NOTICE '✓ query_text column added';
        END IF;

        -- Ensure other important columns exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'user_id') THEN
            ALTER TABLE rag_analytics ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
            RAISE NOTICE '✓ user_id column added';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'num_results') THEN
            ALTER TABLE rag_analytics ADD COLUMN num_results INTEGER DEFAULT 0;
            RAISE NOTICE '✓ num_results column added';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'response_time_ms') THEN
            ALTER TABLE rag_analytics ADD COLUMN response_time_ms INTEGER;
            RAISE NOTICE '✓ response_time_ms column added';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'sources_used') THEN
            ALTER TABLE rag_analytics ADD COLUMN sources_used JSONB;
            RAISE NOTICE '✓ sources_used column added';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'rag_analytics'
                       AND column_name = 'state') THEN
            ALTER TABLE rag_analytics ADD COLUMN state VARCHAR(2);
            RAISE NOTICE '✓ state column added';
        END IF;

        -- Ensure indexes exist
        CREATE INDEX IF NOT EXISTS idx_rag_analytics_user_id ON rag_analytics(user_id);
        CREATE INDEX IF NOT EXISTS idx_rag_analytics_created_at ON rag_analytics(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_rag_analytics_state ON rag_analytics(state);

        RAISE NOTICE '✓ rag_analytics table schema verified';
    END IF;
END $$;

-- ============================================================================
-- 3. VERIFICATION
-- ============================================================================

-- Verify rag_documents constraint
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'rag_documents'
AND conname = 'rag_documents_type_check';

-- Verify rag_analytics columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'rag_analytics'
ORDER BY ordinal_position;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 006 completed successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ rag_documents type constraint fixed';
    RAISE NOTICE '✓ rag_analytics table schema verified';
    RAISE NOTICE '========================================';
END $$;
