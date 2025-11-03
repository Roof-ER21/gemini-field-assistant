-- ============================================================================
-- FIX RAG DOCUMENTS CONSTRAINT ERROR
-- ============================================================================
-- This script fixes the "rag_documents_type_check" constraint violation error
-- Run this on Railway PostgreSQL database
-- ============================================================================

-- First, check if the table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public'
               AND table_name = 'rag_documents') THEN
        RAISE NOTICE 'rag_documents table exists, fixing constraint...';

        -- Drop the existing constraint
        ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_type_check;
        RAISE NOTICE 'Dropped existing constraint';

        -- Add the corrected constraint with all valid document types
        ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_type_check
            CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text'));
        RAISE NOTICE 'Added corrected constraint with extended type list';

    ELSE
        RAISE NOTICE 'rag_documents table does not exist, creating it...';

        -- Enable required extensions
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        -- Create the rag_documents table with proper schema
        CREATE TABLE rag_documents (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            document_name VARCHAR(500) NOT NULL,
            document_path VARCHAR(1000) NOT NULL,
            document_category VARCHAR(100),
            type VARCHAR(20) NOT NULL CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text')),
            content TEXT NOT NULL,
            content_hash VARCHAR(64), -- SHA-256 hash for deduplication
            chunk_index INTEGER DEFAULT 0, -- For splitting large documents
            metadata JSONB, -- Flexible metadata storage
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(document_path, chunk_index)
        );

        -- Create indexes
        CREATE INDEX idx_rag_documents_path ON rag_documents(document_path);
        CREATE INDEX idx_rag_documents_category ON rag_documents(document_category);
        CREATE INDEX idx_rag_documents_hash ON rag_documents(content_hash);
        CREATE INDEX idx_rag_documents_type ON rag_documents(type);
        CREATE INDEX idx_rag_documents_created_at ON rag_documents(created_at DESC);

        -- Add trigger for updated_at (assumes update_updated_at_column function exists)
        DO $trigger$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
                CREATE TRIGGER update_rag_documents_updated_at
                    BEFORE UPDATE ON rag_documents
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
            END IF;
        END $trigger$;

        RAISE NOTICE 'Created rag_documents table with proper schema';
    END IF;
END $$;

-- Verify the fix
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE t.relname = 'rag_documents'
AND conname = 'rag_documents_type_check';

-- Show table structure
\d rag_documents

-- Show count of documents (if any)
SELECT type, COUNT(*) as count
FROM rag_documents
GROUP BY type;
