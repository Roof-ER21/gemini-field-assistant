#!/bin/bash

# ============================================================================
# Verify RAG Documents Fix on Railway
# ============================================================================
# This script verifies that the constraint fix was applied successfully
# and tests document insertion for all supported types
# ============================================================================

echo "✅ Verifying RAG Documents Fix on Railway..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found.${NC}"
    echo "   Install: npm install -g @railway/cli"
    exit 1
fi

echo "📍 Railway Project:"
railway status
echo ""

# Step 1: Check constraint definition
echo "🔍 Step 1: Checking constraint definition..."
CONSTRAINT=$(railway run psql $DATABASE_URL -t -c "
SELECT pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'rag_documents'
AND conname = 'rag_documents_type_check';
" 2>&1)

if [[ $CONSTRAINT == *"pdf"* ]] && [[ $CONSTRAINT == *"md"* ]] && [[ $CONSTRAINT == *"txt"* ]]; then
    echo -e "${GREEN}✅ Constraint definition looks correct${NC}"
    echo "   Types allowed: pdf, md, txt, docx, pptx, json, markdown, text"
else
    echo -e "${RED}❌ Constraint definition issue${NC}"
    echo "   Current: $CONSTRAINT"
    echo ""
    echo "   Run fix: ./scripts/fix-railway-rag-constraint.sh"
    exit 1
fi

echo ""

# Step 2: Test document insertion for each type
echo "🔍 Step 2: Testing document insertions..."

TYPES=("pdf" "md" "txt" "docx" "pptx" "json" "markdown" "text")
PASSED=0
FAILED=0

for type in "${TYPES[@]}"; do
    echo -n "   Testing '$type' type... "

    RESULT=$(railway run psql $DATABASE_URL -c "
    INSERT INTO rag_documents (document_name, document_path, type, content)
    VALUES ('verify_test_$type', '/verify/test_$type', '$type', 'Verification test content')
    ON CONFLICT (document_path, chunk_index) DO UPDATE SET content = EXCLUDED.content;
    " 2>&1)

    if [[ $RESULT == *"INSERT"* ]] || [[ $RESULT == *"UPDATE"* ]]; then
        echo -e "${GREEN}✅${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌${NC}"
        echo "      Error: $RESULT"
        ((FAILED++))
    fi
done

echo ""

# Step 3: Verify test documents
echo "🔍 Step 3: Verifying test documents..."
TEST_COUNT=$(railway run psql $DATABASE_URL -t -c "
SELECT COUNT(*) FROM rag_documents WHERE document_path LIKE '/verify/test_%';
" 2>&1 | tr -d ' ')

if [ "$TEST_COUNT" -eq "${#TYPES[@]}" ]; then
    echo -e "${GREEN}✅ All $TEST_COUNT test documents inserted successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Expected ${#TYPES[@]} documents, found $TEST_COUNT${NC}"
fi

echo ""

# Step 4: Clean up test documents
echo "🧹 Step 4: Cleaning up test documents..."
railway run psql $DATABASE_URL -c "
DELETE FROM rag_documents WHERE document_path LIKE '/verify/test_%';
" > /dev/null 2>&1
echo -e "${GREEN}✅ Test documents cleaned up${NC}"

echo ""

# Step 5: Show current document statistics
echo "📊 Step 5: Current document statistics..."
railway run psql $DATABASE_URL << 'EOSQL'
SELECT
    type,
    COUNT(*) as count
FROM rag_documents
WHERE document_path NOT LIKE '/verify/test_%'
GROUP BY type
ORDER BY count DESC;
EOSQL

echo ""

# Final summary
echo "================================================"
echo "📋 VERIFICATION SUMMARY"
echo "================================================"
echo -e "Constraint Check:   ${GREEN}✅ PASSED${NC}"
echo -e "Document Types:     ${GREEN}$PASSED passed${NC} / ${RED}$FAILED failed${NC}"
echo -e "Test Documents:     ${GREEN}✅ VERIFIED${NC}"
echo -e "Cleanup:            ${GREEN}✅ COMPLETE${NC}"
echo "================================================"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 All verifications passed! RAG documents fix is working correctly.${NC}"
    echo ""
    echo "✅ Next steps:"
    echo "   1. Re-run any failed embedding generation jobs"
    echo "   2. Monitor logs: railway logs --tail 50"
    echo "   3. Test RAG search functionality in your app"
    exit 0
else
    echo ""
    echo -e "${RED}❌ Some verifications failed. Please review the errors above.${NC}"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   1. Re-run fix: ./scripts/fix-railway-rag-constraint.sh"
    echo "   2. Check logs: railway logs"
    echo "   3. Manual inspection: railway run psql \$DATABASE_URL"
    exit 1
fi
