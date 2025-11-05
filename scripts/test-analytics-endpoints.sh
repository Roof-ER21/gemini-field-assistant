#!/bin/bash

# Analytics Endpoints Test Script
# This script tests all 11 analytics endpoints
# Usage: ./scripts/test-analytics-endpoints.sh [base_url]

BASE_URL="${1:-http://localhost:3001}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@roofer.com}"
TEST_EMAIL="${TEST_EMAIL:-test@roofer.com}"

echo "======================================"
echo "Analytics Endpoints Test"
echo "======================================"
echo "Base URL: $BASE_URL"
echo "Admin Email: $ADMIN_EMAIL"
echo "Test Email: $TEST_EMAIL"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Helper function to test endpoint
test_endpoint() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local email="$4"
  local data="$5"

  echo -n "Testing: $name... "

  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" -H "x-user-email: $email" "$BASE_URL$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -H "x-user-email: $email" -d "$data" "$BASE_URL$endpoint")
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo -e "${GREEN}PASSED${NC} (HTTP $http_code)"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${RED}FAILED${NC} (HTTP $http_code)"
    echo "Response: $body"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

echo "======================================"
echo "1. Activity Tracking Endpoints"
echo "======================================"
echo ""

# Test 1: Start Live Susan Session
test_endpoint \
  "Start Live Susan Session" \
  "POST" \
  "/api/activity/live-susan" \
  "$TEST_EMAIL" \
  '{"action":"start"}'

# Capture session_id for end test
SESSION_ID=$(curl -s -X POST -H "Content-Type: application/json" -H "x-user-email: $TEST_EMAIL" -d '{"action":"start"}' "$BASE_URL/api/activity/live-susan" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)

if [ -n "$SESSION_ID" ]; then
  # Test 2: End Live Susan Session
  test_endpoint \
    "End Live Susan Session" \
    "POST" \
    "/api/activity/live-susan" \
    "$TEST_EMAIL" \
    "{\"action\":\"end\",\"session_id\":\"$SESSION_ID\",\"message_count\":10,\"double_tap_stops\":2}"
fi

# Test 3: Log Transcription
test_endpoint \
  "Log Transcription" \
  "POST" \
  "/api/activity/transcription" \
  "$TEST_EMAIL" \
  '{"audio_duration_seconds":30,"transcription_text":"Test transcription text","word_count":15,"provider":"Gemini"}'

# Test 4: Log Document Upload
test_endpoint \
  "Log Document Upload" \
  "POST" \
  "/api/activity/document-upload" \
  "$TEST_EMAIL" \
  '{"file_name":"test.pdf","file_type":"pdf","file_size_bytes":1024000,"analysis_performed":true,"analysis_type":"roof_damage","analysis_result":"Test analysis result"}'

echo ""
echo "======================================"
echo "2. Admin Analytics Endpoints"
echo "======================================"
echo ""

# Test 5: Analytics Overview
test_endpoint \
  "Analytics Overview" \
  "GET" \
  "/api/admin/analytics/overview" \
  "$ADMIN_EMAIL" \
  ""

# Test 6: User Activity Breakdown (All Time)
test_endpoint \
  "User Activity (All Time)" \
  "GET" \
  "/api/admin/analytics/user-activity?timeRange=all" \
  "$ADMIN_EMAIL" \
  ""

# Test 7: User Activity Breakdown (Week)
test_endpoint \
  "User Activity (Week)" \
  "GET" \
  "/api/admin/analytics/user-activity?timeRange=week" \
  "$ADMIN_EMAIL" \
  ""

# Test 8: Feature Usage Over Time
test_endpoint \
  "Feature Usage Over Time" \
  "GET" \
  "/api/admin/analytics/feature-usage?timeRange=week" \
  "$ADMIN_EMAIL" \
  ""

# Test 9: Knowledge Base Analytics
test_endpoint \
  "Knowledge Base Analytics" \
  "GET" \
  "/api/admin/analytics/knowledge-base" \
  "$ADMIN_EMAIL" \
  ""

# Test 10: Per-User Analytics Table
test_endpoint \
  "Per-User Analytics Table" \
  "GET" \
  "/api/admin/analytics/per-user" \
  "$ADMIN_EMAIL" \
  ""

echo ""
echo "======================================"
echo "3. Concerning Chats Endpoints"
echo "======================================"
echo ""

# Test 11: Get Concerning Chats (All)
test_endpoint \
  "Get Concerning Chats (All)" \
  "GET" \
  "/api/admin/concerning-chats?severity=all" \
  "$ADMIN_EMAIL" \
  ""

# Test 12: Get Concerning Chats (Critical)
test_endpoint \
  "Get Concerning Chats (Critical)" \
  "GET" \
  "/api/admin/concerning-chats?severity=critical" \
  "$ADMIN_EMAIL" \
  ""

# Test 13: Trigger Manual Scan
test_endpoint \
  "Trigger Manual Scan" \
  "POST" \
  "/api/admin/concerning-chats/scan" \
  "$ADMIN_EMAIL" \
  ""

# Test 14: Mark Chat as Reviewed (only if there are concerning chats)
FIRST_CONCERNING_CHAT=$(curl -s -H "x-user-email: $ADMIN_EMAIL" "$BASE_URL/api/admin/concerning-chats?severity=all" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$FIRST_CONCERNING_CHAT" ]; then
  test_endpoint \
    "Mark Chat as Reviewed" \
    "PATCH" \
    "/api/admin/concerning-chats/$FIRST_CONCERNING_CHAT/review" \
    "$ADMIN_EMAIL" \
    '{"review_notes":"Test review - automated test"}'
else
  echo -e "${YELLOW}SKIPPED${NC}: Mark Chat as Reviewed (no concerning chats found)"
fi

echo ""
echo "======================================"
echo "4. Authorization Tests"
echo "======================================"
echo ""

# Test 15: Non-admin tries to access admin endpoint (should fail)
echo -n "Testing: Non-admin access to admin endpoint (should fail)... "
response=$(curl -s -w "\n%{http_code}" -H "x-user-email: $TEST_EMAIL" "$BASE_URL/api/admin/analytics/overview")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "403" ]; then
  echo -e "${GREEN}PASSED${NC} (HTTP $http_code - Correctly forbidden)"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}FAILED${NC} (HTTP $http_code - Should be 403)"
  FAILED=$((FAILED + 1))
fi

echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "Total Tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo "======================================"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed. Please review the errors above.${NC}"
  exit 1
fi
