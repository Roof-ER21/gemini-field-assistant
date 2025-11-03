#!/bin/bash

# ============================================================================
# Diagnose RAG Documents Table on Railway
# ============================================================================
# This script inspects the rag_documents table to understand the constraint issue
# ============================================================================

echo "🔍 Diagnosing RAG Documents Table on Railway..."
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install it first:"
    echo "   npm install -g @railway/cli"
    exit 1
fi

echo "📍 Railway Project:"
railway status
echo ""

echo "🔍 Running diagnostics..."
echo ""

railway run psql $DATABASE_URL << 'EOSQL'
-- Check if rag_documents table exists
\echo '=== TABLE EXISTENCE ==='
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables
                     WHERE table_schema = 'public' AND table_name = 'rag_documents')
        THEN '✅ rag_documents table EXISTS'
        ELSE '❌ rag_documents table DOES NOT EXIST'
    END AS table_status;

\echo ''
\echo '=== TABLE STRUCTURE ==='
\d rag_documents

\echo ''
\echo '=== CONSTRAINTS ==='
SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE t.relname = 'rag_documents'
ORDER BY contype, conname;

\echo ''
\echo '=== DOCUMENT TYPES IN TABLE ==='
SELECT
    type,
    COUNT(*) as count,
    MIN(created_at) as first_added,
    MAX(created_at) as last_added
FROM rag_documents
GROUP BY type
ORDER BY count DESC;

\echo ''
\echo '=== TOTAL DOCUMENTS ==='
SELECT COUNT(*) as total_documents FROM rag_documents;

\echo ''
\echo '=== RECENT DOCUMENTS (Last 5) ==='
SELECT
    id,
    document_name,
    type,
    document_category,
    LENGTH(content) as content_length,
    created_at
FROM rag_documents
ORDER BY created_at DESC
LIMIT 5;

\echo ''
\echo '=== DOCUMENT CATEGORIES ==='
SELECT
    document_category,
    COUNT(*) as count
FROM rag_documents
GROUP BY document_category
ORDER BY count DESC;

\echo ''
\echo '=== INDEXES ==='
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'rag_documents'
ORDER BY indexname;

\echo ''
\echo '=== TABLE SIZE ==='
SELECT
    pg_size_pretty(pg_total_relation_size('rag_documents')) as total_size,
    pg_size_pretty(pg_relation_size('rag_documents')) as table_size,
    pg_size_pretty(pg_total_relation_size('rag_documents') - pg_relation_size('rag_documents')) as indexes_size;

\echo ''
\echo '✅ Diagnostics complete!'
EOSQL

echo ""
echo "📊 Diagnosis complete!"
echo ""
echo "💡 Next steps based on findings:"
echo "   - If constraint is restrictive: Run ./scripts/fix-railway-rag-constraint.sh"
echo "   - If table doesn't exist: Run node scripts/init-database.js"
echo "   - If document types unexpected: Review embedding generation code"
