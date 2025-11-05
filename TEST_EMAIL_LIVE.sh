#!/bin/bash

echo "🧪 S21 ROOFER - Live Email & Chat Test"
echo "=========================================="
echo ""

TIMESTAMP=$(date +%s)
TEST_EMAIL="live-test-${TIMESTAMP}@example.com"
TEST_NAME="Live Test User ${TIMESTAMP}"

echo "📧 Test User Details:"
echo "   Email: $TEST_EMAIL"
echo "   Name: $TEST_NAME"
echo ""

echo "1️⃣  Creating NEW user in database..."
CREATE_RESPONSE=$(curl -s -X POST https://sa21.up.railway.app/api/users \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"name\":\"$TEST_NAME\"}")

echo "$CREATE_RESPONSE" | jq '.'

IS_NEW=$(echo "$CREATE_RESPONSE" | jq -r '.isNew')
USER_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id')

echo ""
if [ "$IS_NEW" = "true" ]; then
  echo "   ✅ User is NEW (isNew: true)"
  echo "   ✅ Should trigger login email notification"
else
  echo "   ❌ User NOT new (isNew: false)"
  echo "   ❌ Will NOT trigger email"
fi
echo ""

echo "2️⃣  Testing email notification endpoint directly..."
EMAIL_RESPONSE=$(curl -s -X POST https://sa21.up.railway.app/api/notifications/email \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"login\",\"data\":{\"userName\":\"$TEST_NAME\",\"userEmail\":\"$TEST_EMAIL\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}")

echo "$EMAIL_RESPONSE" | jq '.'

EMAIL_SUCCESS=$(echo "$EMAIL_RESPONSE" | jq -r '.success')
EMAIL_PROVIDER=$(echo "$EMAIL_RESPONSE" | jq -r '.provider')

echo ""
if [ "$EMAIL_SUCCESS" = "true" ] && [ "$EMAIL_PROVIDER" = "resend" ]; then
  echo "   ✅ Email API returned success"
  echo "   ✅ Using Resend provider"
  echo "   📬 Check inbox: ahmed.mahmoud@theroofdocs.com"
else
  echo "   ❌ Email API failed or using wrong provider"
  echo "   Provider: $EMAIL_PROVIDER"
fi
echo ""

echo "3️⃣  Testing chat message save..."
CHAT_RESPONSE=$(curl -s -X POST https://sa21.up.railway.app/api/chat/messages \
  -H "Content-Type: application/json" \
  -H "X-User-Email: $TEST_EMAIL" \
  -d "{\"message_id\":\"test-msg-${TIMESTAMP}\",\"sender\":\"user\",\"message\":\"Test message from Claude\",\"response\":\"Test response\"}")

echo "$CHAT_RESPONSE" | jq '.'
echo ""

echo "4️⃣  Verifying chat message in database..."
sleep 2
CHATS=$(curl -s "https://sa21.up.railway.app/api/admin/conversations?userId=$USER_ID" \
  -H "X-User-Email: ahmed.mahmoud@theroofdocs.com")

CHAT_COUNT=$(echo "$CHATS" | jq '. | length')
echo "   Chat messages found: $CHAT_COUNT"
if [ "$CHAT_COUNT" -gt "0" ]; then
  echo "   ✅ Chat messages saved and retrievable"
  echo "$CHATS" | jq '.'
else
  echo "   ❌ No chat messages found in database"
fi
echo ""

echo "=========================================="
echo "✅ Test Complete!"
echo ""
echo "CHECKLIST:"
echo "[ ] Check email at ahmed.mahmoud@theroofdocs.com"
echo "[ ] Login to admin panel at https://sa21.up.railway.app/"
echo "[ ] Select user: $TEST_NAME"
echo "[ ] Verify you can see the test chat message"
echo ""
echo "If email didn't arrive:"
echo "1. Check spam folder"
echo "2. Check Resend dashboard for delivery logs"
echo "3. Verify RESEND_API_KEY is correct in Railway"
echo ""
