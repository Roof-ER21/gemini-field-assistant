#!/bin/bash

# ============================================================================
# Apply Performance Optimization Migration (007)
# ============================================================================
# This script applies the performance indexes migration to your database
# ============================================================================

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Gemini Field Assistant - Performance Migration${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL environment variable is not set${NC}"
    echo ""
    echo "Please set DATABASE_URL with your PostgreSQL connection string:"
    echo "  export DATABASE_URL='postgresql://user:password@host:port/database'"
    echo ""
    exit 1
fi

# Extract database name for display
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
echo -e "${YELLOW}Target Database:${NC} $DB_NAME"
echo ""

# Show what will be created
echo -e "${YELLOW}This migration will add the following indexes:${NC}"
echo "  ✓ chat_history performance indexes (2)"
echo "  ✓ email_generation_log indexes (1)"
echo "  ✓ concerning_chats indexes (2)"
echo "  ✓ users table optimization (2)"
echo "  ✓ budget_alerts indexes (2)"
echo "  ✓ api_usage_log indexes (2, if table exists)"
echo "  ✓ document_views indexes (1, if table exists)"
echo ""

# Ask for confirmation
read -p "Continue with migration? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Migration cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}Applying migration...${NC}"
echo ""

# Apply the migration
if psql "$DATABASE_URL" -f "$(dirname "$0")/migrations/007_performance_indexes.sql"; then
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}✓ Migration completed successfully!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Monitor index usage with pg_stat_user_indexes"
    echo "  2. Run ANALYZE on tables to update query planner statistics"
    echo "  3. Check application performance improvements"
    echo ""
    echo -e "${BLUE}To verify indexes:${NC}"
    echo "  psql \$DATABASE_URL -c \"SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%' ORDER BY tablename;\""
    echo ""
else
    echo ""
    echo -e "${RED}================================================${NC}"
    echo -e "${RED}✗ Migration failed!${NC}"
    echo -e "${RED}================================================${NC}"
    echo ""
    echo "Please check the error messages above."
    echo ""
    exit 1
fi
