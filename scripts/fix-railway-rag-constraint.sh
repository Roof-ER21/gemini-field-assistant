#!/bin/bash

# ============================================================================
# Fix RAG Documents Constraint on Railway PostgreSQL
# ============================================================================
# This script fixes the "rag_documents_type_check" constraint violation error
# Run this to apply the fix to your Railway database
# ============================================================================

echo "🔧 Fixing RAG Documents Constraint on Railway..."
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install it first:"
    echo "   npm install -g @railway/cli"
    exit 1
fi

# Check if we're linked to a Railway project
if ! railway status &> /dev/null; then
    echo "❌ Not linked to a Railway project. Please run:"
    echo "   railway link"
    exit 1
fi

echo "📍 Railway Project:"
railway status
echo ""

# Apply the fix
echo "🔧 Applying database fix..."
echo ""

railway run psql $DATABASE_URL << 'EOSQL'
-- Show current constraint (if exists)
\echo '📋 Current rag_documents constraint (if exists):'
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE t.relname = 'rag_documents'
AND conname = 'rag_documents_type_check';

\echo ''
\echo '🔨 Dropping old constraint...'
ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_type_check;

\echo '✅ Adding corrected constraint...'
ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_type_check
    CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text'));

\echo ''
\echo '✅ New constraint:'
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE t.relname = 'rag_documents'
AND conname = 'rag_documents_type_check';

\echo ''
\echo '📊 Current document types in table:'
SELECT type, COUNT(*) as count
FROM rag_documents
GROUP BY type;

\echo ''
\echo '✅ Fix applied successfully!'
EOSQL

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ RAG documents constraint fixed successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Test embedding generation"
    echo "   2. Verify no more constraint errors in logs"
    echo "   3. Re-run any failed embedding jobs"
else
    echo ""
    echo "❌ Error applying fix. Check the error messages above."
    echo ""
    echo "💡 Manual fix option:"
    echo "   1. Connect: railway run psql \$DATABASE_URL"
    echo "   2. Run: ALTER TABLE rag_documents DROP CONSTRAINT rag_documents_type_check;"
    echo "   3. Run: ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_type_check CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text'));"
fi
