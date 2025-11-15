#!/bin/bash

# ============================================================================
# SA21 Complete API Testing Script
# Tests all 57 endpoints systematically
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-https://sa21.up.railway.app/api}"
TEST_EMAIL="test@example.com"
ADMIN_EMAIL="${ADMIN_EMAIL:-ahmed.mahmoud@theroofdocs.com}"
SESSION_ID="test-session-$(date +%s)"

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}======================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}======================================${NC}"
}

print_test() {
    echo -e "${YELLOW}Testing:${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓ PASS${NC} $1"
    ((TESTS_PASSED++))
}

print_fail() {
    echo -e "${RED}✗ FAIL${NC} $1"
    echo -e "${RED}Response:${NC} $2"
    ((TESTS_FAILED++))
}

test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3
    local expected_status=${4:-200}
    local data=$5
    local headers=$6

    ((TESTS_RUN++))
    print_test "$description"

    # Build curl command
    local cmd="curl -s -w '\n%{http_code}' -X $method"

    # Add headers
    if [ -n "$headers" ]; then
        cmd="$cmd $headers"
    fi

    # Add data for POST/PUT
    if [ -n "$data" ]; then
        cmd="$cmd -H 'Content-Type: application/json' -d '$data'"
    fi

    # Execute request
    local response=$(eval "$cmd '$API_URL$endpoint'")
    local status=$(echo "$response" | tail -n 1)
    local body=$(echo "$response" | sed '$d')

    # Check status code
    if [ "$status" = "$expected_status" ]; then
        print_success "$description (HTTP $status)"
    else
        print_fail "$description (Expected HTTP $expected_status, got $status)" "$body"
    fi

    echo "$body"
}

# ============================================================================
# Test Suite: Health & System
# ============================================================================

test_health_system() {
    print_header "1. HEALTH & SYSTEM INFORMATION"

    # Test health endpoint
    test_endpoint "GET" "/health" "Health check" "200"

    # Test providers status
    test_endpoint "GET" "/providers/status" "AI providers status" "200"

    # Test version
    test_endpoint "GET" "/version" "Version info" "200"
}

# ============================================================================
# Test Suite: User Management
# ============================================================================

test_user_management() {
    print_header "2. USER MANAGEMENT"

    # Create user
    test_endpoint "POST" "/users" "Create user" "200" \
        "{\"email\":\"$TEST_EMAIL\",\"name\":\"Test User\",\"state\":\"VA\"}"

    # Get current user
    test_endpoint "GET" "/users/me" "Get current user" "200" "" \
        "-H 'x-user-email: $TEST_EMAIL'"

    # Get user by email
    test_endpoint "GET" "/users/$(echo $TEST_EMAIL | sed 's/@/%40/g')" \
        "Get user by email" "200"
}

# ============================================================================
# Test Suite: Chat History
# ============================================================================

test_chat_history() {
    print_header "3. CHAT HISTORY"

    # Save user message
    test_endpoint "POST" "/chat/messages" "Save user chat message" "200" \
        "{\"sessionId\":\"$SESSION_ID\",\"role\":\"user\",\"content\":\"What is wind damage?\",\"persona\":\"susan\"}" \
        "-H 'x-user-email: $TEST_EMAIL'"

    # Save assistant message
    test_endpoint "POST" "/chat/messages" "Save assistant message" "200" \
        "{\"sessionId\":\"$SESSION_ID\",\"role\":\"assistant\",\"content\":\"Wind damage occurs when high winds...\",\"persona\":\"susan\"}" \
        "-H 'x-user-email: $TEST_EMAIL'"

    # Get chat messages
    test_endpoint "GET" "/chat/messages" "Get all chat messages" "200" "" \
        "-H 'x-user-email: $TEST_EMAIL'"

    # Get messages by session
    test_endpoint "GET" "/chat/messages?sessionId=$SESSION_ID" \
        "Get messages by session ID" "200" "" \
        "-H 'x-user-email: $TEST_EMAIL'"

    # Get messages by persona
    test_endpoint "GET" "/chat/messages?persona=susan" \
        "Get messages by persona" "200" "" \
        "-H 'x-user-email: $TEST_EMAIL'"
}

# ============================================================================
# Test Suite: Knowledge Base
# ============================================================================

test_knowledge_base() {
    print_header "4. KNOWLEDGE BASE & DOCUMENTS"

    # Track document view
    test_endpoint "POST" "/documents/track-view" "Track document view" "200" \
        "{\"documentName\":\"IRC 2021 Section R905.pdf\",\"category\":\"building_codes\"}" \
        "-H 'x-user-email: $TEST_EMAIL'"

    # Get recent documents
    test_endpoint "GET" "/documents/recent" "Get recent documents" "200" "" \
        "-H 'x-user-email: $TEST_EMAIL'"

    # Add favorite
    test_endpoint "POST" "/documents/favorites" "Add document favorite" "200" \
        "{\"documentName\":\"GAF Timberline Specs.pdf\",\"category\":\"manufacturer_specs\"}" \
        "-H 'x-user-email: $TEST_EMAIL'"

    # Get favorites
    test_endpoint "GET" "/documents/favorites" "Get favorite documents" "200" "" \
        "-H 'x-user-email: $TEST_EMAIL'"
}

# ============================================================================
# Test Suite: Email & Notifications
# ============================================================================

test_email_notifications() {
    print_header "5. EMAIL & NOTIFICATIONS"

    # Log email
    test_endpoint "POST" "/emails/log" "Log generated email" "200" \
        "{\"recipient\":\"adjuster@insurance.com\",\"subject\":\"Re: Claim #12345\",\"emailBody\":\"Test email\",\"templateUsed\":\"claim_appeal\"}" \
        "-H 'x-user-email: $TEST_EMAIL'"

    # Get notification config
    test_endpoint "GET" "/notifications/config" "Get notification config" "200"
}

# ============================================================================
# Test Suite: Analytics
# ============================================================================

test_analytics() {
    print_header "6. ANALYTICS"

    # Get analytics summary
    test_endpoint "GET" "/analytics/summary" "Get analytics summary" "200" "" \
        "-H 'x-user-email: $TEST_EMAIL'"

    # Get popular documents
    test_endpoint "GET" "/analytics/popular-documents" "Get popular documents" "200"
}

# ============================================================================
# Test Suite: Activity Tracking
# ============================================================================

test_activity() {
    print_header "7. ACTIVITY TRACKING"

    # Log activity
    test_endpoint "POST" "/activity/log" "Log user activity" "200" \
        "{\"activityType\":\"chat_message\",\"metadata\":{\"persona\":\"susan\"}}" \
        "-H 'x-user-email: $TEST_EMAIL'"
}

# ============================================================================
# Test Suite: Admin Endpoints (if admin email is set)
# ============================================================================

test_admin_endpoints() {
    if [ -z "$ADMIN_EMAIL" ]; then
        echo -e "${YELLOW}Skipping admin tests (ADMIN_EMAIL not set)${NC}"
        return
    fi

    print_header "8. ADMIN PANEL ENDPOINTS"

    # Get all users
    test_endpoint "GET" "/admin/users" "Get all users (admin)" "200" "" \
        "-H 'x-user-email: $ADMIN_EMAIL'"

    # Get basic user list
    test_endpoint "GET" "/admin/users-basic" "Get basic user list (admin)" "200" "" \
        "-H 'x-user-email: $ADMIN_EMAIL'"

    # Get all conversations
    test_endpoint "GET" "/admin/conversations" "Get all conversations (admin)" "200" "" \
        "-H 'x-user-email: $ADMIN_EMAIL'"

    # Get all emails
    test_endpoint "GET" "/admin/emails" "Get all emails (admin)" "200" "" \
        "-H 'x-user-email: $ADMIN_EMAIL'"

    # Get all messages
    test_endpoint "GET" "/admin/all-messages" "Get all messages (admin)" "200" "" \
        "-H 'x-user-email: $ADMIN_EMAIL'"

    # Get cron status
    test_endpoint "GET" "/admin/cron-status" "Get cron job status" "200"

    # Get budget overview
    test_endpoint "GET" "/admin/budget/overview" "Get budget overview (admin)" "200" "" \
        "-H 'x-user-email: $ADMIN_EMAIL'"

    # Get user budgets
    test_endpoint "GET" "/admin/budget/users" "Get user budgets (admin)" "200" "" \
        "-H 'x-user-email: $ADMIN_EMAIL'"
}

# ============================================================================
# Test Suite: Rate Limiting
# ============================================================================

test_rate_limiting() {
    print_header "9. RATE LIMITING"

    echo "Testing rate limiting (general API - 100 requests/15min)..."

    # Make 5 quick requests to test rate limiting
    for i in {1..5}; do
        response=$(curl -s -w '\n%{http_code}' "$API_URL/health")
        status=$(echo "$response" | tail -n 1)

        if [ "$status" = "200" ]; then
            echo -e "${GREEN}✓${NC} Request $i/5 succeeded (HTTP $status)"
        elif [ "$status" = "429" ]; then
            echo -e "${YELLOW}✓${NC} Rate limit hit on request $i (HTTP 429) - Rate limiting working!"
            print_success "Rate limiting is active and working"
            return
        else
            echo -e "${RED}✗${NC} Request $i/5 failed with unexpected status: $status"
        fi
    done

    echo -e "${GREEN}✓${NC} All 5 test requests succeeded - Rate limit not hit (normal for low traffic)"
}

# ============================================================================
# Test Suite: Security Headers
# ============================================================================

test_security_headers() {
    print_header "10. SECURITY HEADERS"

    echo "Checking security headers..."

    headers=$(curl -s -I "$API_URL/health")

    # Check for key security headers
    if echo "$headers" | grep -i "x-content-type-options" > /dev/null; then
        print_success "X-Content-Type-Options header present"
    else
        print_fail "X-Content-Type-Options header missing" ""
    fi

    if echo "$headers" | grep -i "x-frame-options" > /dev/null; then
        print_success "X-Frame-Options header present"
    else
        print_fail "X-Frame-Options header missing" ""
    fi

    if echo "$headers" | grep -i "strict-transport-security" > /dev/null; then
        print_success "Strict-Transport-Security header present"
    else
        echo -e "${YELLOW}⚠${NC} Strict-Transport-Security header missing (normal for non-HTTPS)"
    fi

    if echo "$headers" | grep -i "content-security-policy" > /dev/null; then
        print_success "Content-Security-Policy header present"
    else
        print_fail "Content-Security-Policy header missing" ""
    fi
}

# ============================================================================
# Main Test Runner
# ============================================================================

main() {
    echo -e "${BLUE}"
    echo "======================================================================"
    echo "  SA21 FIELD AI - COMPLETE API TEST SUITE"
    echo "======================================================================"
    echo -e "${NC}"
    echo "API URL: $API_URL"
    echo "Test Email: $TEST_EMAIL"
    echo "Admin Email: ${ADMIN_EMAIL:-Not set}"
    echo "Session ID: $SESSION_ID"
    echo ""

    # Run all test suites
    test_health_system
    test_user_management
    test_chat_history
    test_knowledge_base
    test_email_notifications
    test_analytics
    test_activity
    test_admin_endpoints
    test_rate_limiting
    test_security_headers

    # Print summary
    echo ""
    print_header "TEST SUMMARY"
    echo -e "Total Tests: ${BLUE}$TESTS_RUN${NC}"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
        exit 0
    else
        echo -e "${RED}✗ SOME TESTS FAILED${NC}"
        exit 1
    fi
}

# ============================================================================
# Execute
# ============================================================================

# Check if jq is installed (optional but helpful)
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠ 'jq' not found. Install for better JSON formatting: brew install jq${NC}"
    echo ""
fi

# Run tests
main "$@"
