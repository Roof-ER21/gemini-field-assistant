#!/bin/bash

# ============================================================================
# Run Migration 006: Fix Production Issues
# ============================================================================
# This script runs the migration to fix:
# 1. rag_documents type constraint (add 'processed' type)
# 2. rag_analytics missing query_text column
# ============================================================================

set -e

echo "========================================="
echo "Running Migration 006"
echo "========================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    echo "Please set it using: export DATABASE_URL='your_postgres_connection_string'"
    exit 1
fi

echo "✓ DATABASE_URL is set"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATION_FILE="$PROJECT_ROOT/database/migrations/006_fix_production_issues.sql"

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ ERROR: Migration file not found at: $MIGRATION_FILE"
    exit 1
fi

echo "✓ Found migration file"
echo ""

# Run the migration
echo "📝 Executing migration 006..."
echo ""

psql "$DATABASE_URL" -f "$MIGRATION_FILE"

echo ""
echo "========================================="
echo "Migration 006 completed!"
echo "========================================="
echo ""
echo "Summary:"
echo "✓ Fixed rag_documents type constraint"
echo "✓ Ensured rag_analytics has all required columns"
echo ""
echo "You can now redeploy your application."
echo "The errors should be resolved."
