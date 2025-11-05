#!/bin/bash

# ==============================================================================
# Email Notification Fix - Test Script
# ==============================================================================
# This script tests the email notification system fixes
# Run this after applying the fixes to verify everything works
# ==============================================================================

set -e

echo "=========================================="
echo "Email Notification System - Test Suite"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="http://localhost:3001/api"

# ==============================================================================
# Test 1: Check Server Health
# ==============================================================================
echo -e "${BLUE}[TEST 1]${NC} Checking server health..."
HEALTH_RESPONSE=$(curl -s "$API_URL/health" || echo "ERROR")

if [[ "$HEALTH_RESPONSE" == *"healthy"* ]]; then
  echo -e "${GREEN}✅ Server is running${NC}"
else
  echo -e "${RED}❌ Server is not running or not responding${NC}"
  echo "Please start the server with: npm run server"
  exit 1
fi
echo ""

# ==============================================================================
# Test 2: Check Email Configuration
# ==============================================================================
echo -e "${BLUE}[TEST 2]${NC} Checking email configuration..."
CONFIG_RESPONSE=$(curl -s "$API_URL/notifications/config")

echo "$CONFIG_RESPONSE" | grep -q '"provider"' && echo -e "${GREEN}✅ Email service is configured${NC}" || echo -e "${RED}❌ Email service configuration failed${NC}"

PROVIDER=$(echo "$CONFIG_RESPONSE" | grep -o '"provider":"[^"]*"' | cut -d'"' -f4)
FROM=$(echo "$CONFIG_RESPONSE" | grep -o '"from":"[^"]*"' | cut -d'"' -f4)
ADMIN=$(echo "$CONFIG_RESPONSE" | grep -o '"adminEmail":"[^"]*"' | cut -d'"' -f4)
CONFIGURED=$(echo "$CONFIG_RESPONSE" | grep -o '"configured":[^,}]*' | cut -d':' -f2)

echo "  Provider: $PROVIDER"
echo "  From: $FROM"
echo "  Admin Email: $ADMIN"
echo "  Configured: $CONFIGURED"

if [[ "$PROVIDER" == "console" ]]; then
  echo -e "${YELLOW}⚠️  WARNING: Email provider is 'console' (development mode)${NC}"
  echo "   Emails will be logged to console, not actually sent"
  echo "   To fix: Add RESEND_API_KEY to .env.local"
elif [[ "$PROVIDER" == "resend" ]]; then
  echo -e "${GREEN}✅ Resend is configured${NC}"
else
  echo -e "${YELLOW}⚠️  Provider: $PROVIDER${NC}"
fi
echo ""

# ==============================================================================
# Test 3: Check Cron Service Status
# ==============================================================================
echo -e "${BLUE}[TEST 3]${NC} Checking cron service status..."
CRON_RESPONSE=$(curl -s "$API_URL/cron/status" || echo "ERROR")

if [[ "$CRON_RESPONSE" == *"running"* ]]; then
  echo -e "${GREEN}✅ Cron service is running${NC}"
  TOTAL=$(echo "$CRON_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
  RUNNING=$(echo "$CRON_RESPONSE" | grep -o '"running":[0-9]*' | cut -d':' -f2)
  echo "  Total jobs: $TOTAL"
  echo "  Running jobs: $RUNNING"
else
  echo -e "${RED}❌ Cron service status check failed${NC}"
fi
echo ""

# ==============================================================================
# Test 4: Test First-Login Detection (API Level)
# ==============================================================================
echo -e "${BLUE}[TEST 4]${NC} Testing first-login detection..."
echo "Creating test user to check isNew flag..."

TEST_EMAIL="test-first-login-$(date +%s)@test.com"
USER_RESPONSE=$(curl -s -X POST "$API_URL/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"name\":\"Test User\"}")

IS_NEW=$(echo "$USER_RESPONSE" | grep -o '"isNew":[^,}]*' | cut -d':' -f2)

if [[ "$IS_NEW" == "true" ]]; then
  echo -e "${GREEN}✅ First-login detection works for NEW users${NC}"
  echo "  isNew flag: true (correct)"
else
  echo -e "${RED}❌ First-login detection failed for NEW users${NC}"
  echo "  isNew flag: $IS_NEW (should be true)"
fi

# Test existing user (should return isNew: false after first creation)
echo "Testing existing user (second call)..."
USER_RESPONSE2=$(curl -s -X POST "$API_URL/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"name\":\"Test User\"}")

IS_NEW2=$(echo "$USER_RESPONSE2" | grep -o '"isNew":[^,}]*' | cut -d':' -f2)

if [[ "$IS_NEW2" == "false" ]]; then
  echo -e "${GREEN}✅ First-login detection works for EXISTING users${NC}"
  echo "  isNew flag: false (correct - not first login anymore)"
else
  echo -e "${RED}❌ First-login detection failed for EXISTING users${NC}"
  echo "  isNew flag: $IS_NEW2 (should be false)"
fi
echo ""

# ==============================================================================
# Test 5: Test Login Email Notification (End-to-End)
# ==============================================================================
echo -e "${BLUE}[TEST 5]${NC} Testing login email notification..."
echo "Sending login notification via API..."

EMAIL_RESPONSE=$(curl -s -X POST "$API_URL/notifications/email" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "login",
    "data": {
      "userName": "Test User",
      "userEmail": "test@example.com",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  }')

if echo "$EMAIL_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Login notification sent successfully${NC}"
  RESULT_PROVIDER=$(echo "$EMAIL_RESPONSE" | grep -o '"provider":"[^"]*"' | cut -d'"' -f4)
  echo "  Provider used: $RESULT_PROVIDER"

  if [[ "$RESULT_PROVIDER" == "console" ]]; then
    echo -e "${YELLOW}  ⚠️  Email logged to console (check server logs)${NC}"
  else
    echo -e "${GREEN}  ✅ Email sent via $RESULT_PROVIDER${NC}"
  fi
else
  echo -e "${RED}❌ Login notification failed${NC}"
  echo "Response: $EMAIL_RESPONSE"
fi
echo ""

# ==============================================================================
# Test 6: Manual Cron Trigger
# ==============================================================================
echo -e "${BLUE}[TEST 6]${NC} Testing manual cron trigger..."
echo "Triggering daily summary job manually..."

TRIGGER_RESPONSE=$(curl -s -X POST "$API_URL/cron/trigger" || echo "ERROR")

if echo "$TRIGGER_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Manual cron trigger successful${NC}"
  SENT=$(echo "$TRIGGER_RESPONSE" | grep -o '"sent":[0-9]*' | cut -d':' -f2)
  FAILED=$(echo "$TRIGGER_RESPONSE" | grep -o '"failed":[0-9]*' | cut -d':' -f2)
  SKIPPED=$(echo "$TRIGGER_RESPONSE" | grep -o '"skipped":[0-9]*' | cut -d':' -f2)
  echo "  Sent: $SENT"
  echo "  Failed: $FAILED"
  echo "  Skipped: $SKIPPED"
else
  echo -e "${RED}❌ Manual cron trigger failed${NC}"
  echo "Response: $TRIGGER_RESPONSE"
fi
echo ""

# ==============================================================================
# Summary
# ==============================================================================
echo "=========================================="
echo -e "${BLUE}Test Summary${NC}"
echo "=========================================="
echo ""

if [[ "$PROVIDER" == "resend" ]]; then
  echo -e "${GREEN}✅ Email system is fully configured with Resend${NC}"
  echo "   Emails will be sent to recipients"
elif [[ "$PROVIDER" == "console" ]]; then
  echo -e "${YELLOW}⚠️  Email system is in console mode (development)${NC}"
  echo "   Emails will be logged to console, not actually sent"
  echo ""
  echo "To enable actual email sending:"
  echo "1. Get a Resend API key from https://resend.com/"
  echo "2. Add to .env.local: RESEND_API_KEY=re_your_key_here"
  echo "3. Restart the server"
fi

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Check server console for detailed email logs"
echo "2. If using Resend, check admin inbox: $ADMIN"
echo "3. Verify domain in Resend dashboard for production use"
echo ""

echo "=========================================="
echo "Test script completed"
echo "=========================================="
