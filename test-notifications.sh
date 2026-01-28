#!/bin/bash

# Test Notifications System
# This script tests the notification endpoints and WebSocket functionality

set -e

API_URL="${VITE_API_URL:-http://localhost:3001}"
USER_EMAIL="${1:-test@example.com}"

echo "========================================="
echo "Testing Notification System"
echo "========================================="
echo "API URL: $API_URL"
echo "User Email: $USER_EMAIL"
echo ""

# Test 1: Get notifications
echo "Test 1: Fetching notifications..."
curl -s -X GET "$API_URL/api/messages/notifications?limit=10" \
  -H "x-user-email: $USER_EMAIL" \
  -H "Content-Type: application/json" | jq .

echo ""

# Test 2: Get unread notification count
echo "Test 2: Fetching unread count..."
curl -s -X GET "$API_URL/api/messages/notifications?unread_only=true&limit=1" \
  -H "x-user-email: $USER_EMAIL" \
  -H "Content-Type: application/json" | jq '.unread_count'

echo ""

# Test 3: Mark all as read
echo "Test 3: Marking all notifications as read..."
curl -s -X POST "$API_URL/api/messages/notifications/mark-all-read" \
  -H "x-user-email: $USER_EMAIL" \
  -H "Content-Type: application/json" | jq .

echo ""

# Test 4: Verify all marked as read
echo "Test 4: Verifying unread count is 0..."
curl -s -X GET "$API_URL/api/messages/notifications?unread_only=true&limit=1" \
  -H "x-user-email: $USER_EMAIL" \
  -H "Content-Type: application/json" | jq '.unread_count'

echo ""
echo "========================================="
echo "✅ Notification tests complete!"
echo "========================================="
