#!/bin/bash
# ============================================================
# Production API Endpoint Tester
# Tests all critical endpoints on your Railway deployment
# Usage: ./scripts/test-production-endpoints.sh https://your-app.railway.app
# ============================================================

if [ -z "$1" ]; then
  echo "❌ Error: Please provide your Railway app URL"
  echo ""
  echo "Usage:"
  echo "  ./scripts/test-production-endpoints.sh https://your-app.railway.app"
  echo ""
  exit 1
fi

APP_URL="$1"
TEST_EMAIL="test@roofer.com"

echo "🧪 Testing Production API Endpoints"
echo "====================================="
echo "App URL: $APP_URL"
echo ""

# Test 1: Announcements API
echo "1️⃣  Testing: GET /api/announcements/active"
RESPONSE=$(curl -s -w "\n%{http_code}" "$APP_URL/api/announcements/active")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✅ Status: 200 OK"
  if echo "$BODY" | grep -q "Baby Malik"; then
    echo "  ✅ Baby Malik announcement found!"
  else
    echo "  ⚠️  No Baby Malik announcement (yet)"
  fi
else
  echo "  ❌ Status: $HTTP_CODE"
  echo "  Response: $BODY"
fi
echo ""

# Test 2: Root endpoint
echo "2️⃣  Testing: GET /"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/")
if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✅ Status: 200 OK - App is running"
else
  echo "  ❌ Status: $HTTP_CODE - App may not be deployed"
fi
echo ""

# Test 3: Chat messages (with auth)
echo "3️⃣  Testing: GET /api/chat/messages (with auth)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "x-user-email: $TEST_EMAIL" \
  "$APP_URL/api/chat/messages")
if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✅ Status: 200 OK - Chat API working"
else
  echo "  ⚠️  Status: $HTTP_CODE"
fi
echo ""

# Test 4: Activity log endpoint
echo "4️⃣  Testing: POST /api/activity/log (with auth)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-email: $TEST_EMAIL" \
  -d '{"activity_type":"test","activity_data":{"test":true}}' \
  "$APP_URL/api/activity/log")
if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✅ Status: 200 OK - Activity logging working"
else
  echo "  ⚠️  Status: $HTTP_CODE"
fi
echo ""

# Test 5: Email logs endpoint
echo "5️⃣  Testing: GET /api/emails/log (with auth)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "x-user-email: $TEST_EMAIL" \
  "$APP_URL/api/emails/log")
if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✅ Status: 200 OK - Email logs accessible"
else
  echo "  ⚠️  Status: $HTTP_CODE"
fi
echo ""

# Summary
echo "====================================="
echo "📊 Test Summary"
echo ""
echo "Check the results above:"
echo "  ✅ = Working correctly"
echo "  ⚠️  = May need configuration"
echo "  ❌ = Not working - check Railway logs"
echo ""
echo "Next steps:"
echo "  1. If announcements working, login to see Baby Malik toast"
echo "  2. If any ❌ errors, check Railway logs: railway logs"
echo "  3. Verify environment variables in Railway dashboard"
echo ""
