#!/bin/bash

# Test script for Rep Goals API endpoints
# Usage: ./test-rep-goals-api.sh [BASE_URL]

BASE_URL="${1:-http://localhost:8080}"
ADMIN_EMAIL="${ADMIN_EMAIL:-a21@outlook.com}"
REP_EMAIL="${REP_EMAIL:-test-rep@example.com}"

echo "🎯 Testing Rep Goals API"
echo "========================"
echo "Base URL: $BASE_URL"
echo "Admin Email: $ADMIN_EMAIL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test endpoint
test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local email="${5:-$ADMIN_EMAIL}"

    echo -n "Testing: $name... "

    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "x-user-email: $email" \
            -H "Content-Type: application/json" \
            "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "x-user-email: $email" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo "$body" | jq -C '.' 2>/dev/null || echo "$body"
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo "$body" | jq -C '.' 2>/dev/null || echo "$body"
    fi
    echo ""
}

# 1. Test listing all goals (empty initially)
test_endpoint "List all goals" "GET" "/api/admin/goals"

# 2. Test creating a goal
CURRENT_MONTH=$(date +%-m)
CURRENT_YEAR=$(date +%Y)
test_endpoint "Create goal for rep 1" "POST" "/api/admin/goals" '{
  "salesRepId": 1,
  "month": '"$CURRENT_MONTH"',
  "year": '"$CURRENT_YEAR"',
  "goalAmount": 15,
  "goalType": "signups",
  "notes": "Test goal from script"
}'

# 3. Test creating goal with revenue type
test_endpoint "Create revenue goal for rep 1" "POST" "/api/admin/goals" '{
  "salesRepId": 1,
  "month": '"$CURRENT_MONTH"',
  "year": '"$CURRENT_YEAR"',
  "goalAmount": 50000,
  "goalType": "revenue",
  "notes": "Revenue target"
}'

# 4. Test creating goal after deadline (for next month)
NEXT_MONTH=$(( (CURRENT_MONTH % 12) + 1 ))
NEXT_YEAR=$CURRENT_YEAR
if [ "$NEXT_MONTH" -eq 1 ]; then
    NEXT_YEAR=$((CURRENT_YEAR + 1))
fi

test_endpoint "Create goal for next month" "POST" "/api/admin/goals" '{
  "salesRepId": 1,
  "month": '"$NEXT_MONTH"',
  "year": '"$NEXT_YEAR"',
  "goalAmount": 20,
  "goalType": "signups"
}'

# 5. Test listing goals with filters
test_endpoint "List goals for current month" "GET" "/api/admin/goals?month=$CURRENT_MONTH&year=$CURRENT_YEAR"

# 6. Test listing goals for specific rep
test_endpoint "Get goals for rep 1" "GET" "/api/admin/goals/1"

# 7. Test updating a goal (assuming goal ID 1 exists)
test_endpoint "Update goal 1" "PUT" "/api/admin/goals/1" '{
  "goalAmount": 18,
  "notes": "Updated target to 18"
}'

# 8. Test goal progress leaderboard
test_endpoint "Get goal progress (leaderboard)" "GET" "/api/admin/goals/progress?month=$CURRENT_MONTH&year=$CURRENT_YEAR"

# 9. Test bonus trigger (should fail if not achieved)
test_endpoint "Trigger bonus (should fail - not achieved)" "POST" "/api/admin/goals/bonus/trigger" '{
  "goalId": 1,
  "notes": "Test bonus trigger"
}'

# 10. Test rep self-service endpoints (will fail if rep email not in sales_reps)
echo -e "${YELLOW}Testing rep self-service endpoints (may fail if rep not found)${NC}"
test_endpoint "Rep: Get my goals" "GET" "/api/rep/goals" "" "$REP_EMAIL"
test_endpoint "Rep: Get my progress" "GET" "/api/rep/goals/progress" "" "$REP_EMAIL"

# 11. Test validation errors
echo -e "${YELLOW}Testing validation errors (should fail with 400)${NC}"
test_endpoint "Create goal with invalid month" "POST" "/api/admin/goals" '{
  "salesRepId": 1,
  "month": 13,
  "year": '"$CURRENT_YEAR"',
  "goalAmount": 15,
  "goalType": "signups"
}'

test_endpoint "Create goal with negative amount" "POST" "/api/admin/goals" '{
  "salesRepId": 1,
  "month": '"$CURRENT_MONTH"',
  "year": '"$CURRENT_YEAR"',
  "goalAmount": -5,
  "goalType": "signups"
}'

test_endpoint "Create goal with invalid type" "POST" "/api/admin/goals" '{
  "salesRepId": 1,
  "month": '"$CURRENT_MONTH"',
  "year": '"$CURRENT_YEAR"',
  "goalAmount": 15,
  "goalType": "invalid_type"
}'

# 12. Test deleting a goal
# Uncomment to test deletion
# test_endpoint "Delete goal 1" "DELETE" "/api/admin/goals/1"

# Summary
echo ""
echo "========================"
echo "Test Summary"
echo "========================"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo "Total: $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
