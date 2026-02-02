#!/bin/bash

# Test script for check-in notifications
# Usage: ./test-checkin-notifications.sh

set -e

API_URL="http://localhost:3000"
USER1_EMAIL="user1@example.com"
USER2_EMAIL="user2@example.com"

echo "🧪 Testing Check-In Notifications"
echo "=================================="
echo ""

# Test 1: Register push tokens
echo "1️⃣  Registering push tokens..."
curl -s -X POST "${API_URL}/api/push/register" \
  -H "x-user-email: ${USER1_EMAIL}" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceToken": "test-token-user1",
    "deviceType": "web",
    "deviceName": "Test Browser User 1"
  }' | jq '.'

curl -s -X POST "${API_URL}/api/push/register" \
  -H "x-user-email: ${USER2_EMAIL}" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceToken": "test-token-user2",
    "deviceType": "web",
    "deviceName": "Test Browser User 2"
  }' | jq '.'

echo ""

# Test 2: Get default preferences
echo "2️⃣  Getting default notification preferences..."
curl -s "${API_URL}/api/push/preferences" \
  -H "x-user-email: ${USER1_EMAIL}" | jq '.preferences'

echo ""

# Test 3: Update preferences with proximity filter
echo "3️⃣  Setting proximity filter to 10 miles..."
curl -s -X PUT "${API_URL}/api/push/preferences" \
  -H "x-user-email: ${USER1_EMAIL}" \
  -H "Content-Type: application/json" \
  -d '{
    "checkinAlertsEnabled": true,
    "checkinProximityMiles": 10
  }' | jq '.'

echo ""

# Test 4: Check in as User 2 (should trigger notification to User 1)
echo "4️⃣  User 2 checking in (should notify User 1)..."
curl -s -X POST "${API_URL}/api/checkin" \
  -H "x-user-email: ${USER2_EMAIL}" \
  -H "Content-Type: application/json" \
  -d '{
    "location_lat": 40.7128,
    "location_lng": -74.0060,
    "notes": "Testing check-in notifications - morning canvass"
  }' | jq '.'

echo ""

# Test 5: Check active check-ins
echo "5️⃣  Viewing active check-ins..."
curl -s "${API_URL}/api/checkins/active" \
  -H "x-user-email: ${USER1_EMAIL}" | jq '.checkIns[] | {user_name, checkin_time, location_lat, location_lng, notes}'

echo ""

# Test 6: Disable check-in notifications
echo "6️⃣  Disabling check-in notifications for User 1..."
curl -s -X PUT "${API_URL}/api/push/preferences" \
  -H "x-user-email: ${USER1_EMAIL}" \
  -H "Content-Type: application/json" \
  -d '{
    "checkinAlertsEnabled": false
  }' | jq '.'

echo ""

# Test 7: Check out User 2
echo "7️⃣  User 2 checking out..."
curl -s -X POST "${API_URL}/api/checkout" \
  -H "x-user-email: ${USER2_EMAIL}" \
  -H "Content-Type: application/json" \
  -d '{
    "doors_knocked": 25,
    "contacts_made": 10,
    "leads_generated": 3,
    "appointments_set": 1
  }' | jq '.'

echo ""

# Test 8: Re-enable notifications
echo "8️⃣  Re-enabling check-in notifications for User 1..."
curl -s -X PUT "${API_URL}/api/push/preferences" \
  -H "x-user-email: ${USER1_EMAIL}" \
  -H "Content-Type: application/json" \
  -d '{
    "checkinAlertsEnabled": true,
    "checkinProximityMiles": null
  }' | jq '.'

echo ""

echo "✅ Tests complete!"
echo ""
echo "📊 To view notification logs, run:"
echo "   psql -d your_database -c \"SELECT * FROM push_notification_log WHERE notification_type = 'checkin_alert' ORDER BY created_at DESC LIMIT 10;\""
echo ""
echo "🔍 To verify preferences, run:"
echo "   psql -d your_database -c \"SELECT u.email, np.checkin_alerts_enabled, np.checkin_proximity_miles FROM users u LEFT JOIN notification_preferences np ON u.id = np.user_id;\""
