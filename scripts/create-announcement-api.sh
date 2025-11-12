#!/bin/bash

# Script to create Baby Malik announcement via API
# Usage: ./scripts/create-announcement-api.sh

# Get today's date in YYYY-MM-DD format
TODAY=$(date +%Y-%m-%d)

# Set start time to 11:11 AM Eastern Time
START_TIME="${TODAY}T11:11:00-05:00"

echo "Creating Baby Malik announcement for: $START_TIME"

# API endpoint (update if needed)
API_URL="${VITE_API_URL:-http://localhost:3001}"

# Create the announcement
curl -X POST "${API_URL}/api/admin/announcements" \
  -H "Content-Type: application/json" \
  -H "x-user-email: ${EMAIL_ADMIN_ADDRESS}" \
  -d "{
    \"title\": \"🎉 Welcome Baby Malik! 🎉\",
    \"message\": \"Congratulations on the arrival of baby Malik to the world! This is a special moment worth celebrating. 💙\",
    \"type\": \"celebration\",
    \"start_time\": \"${START_TIME}\"
  }"

echo ""
echo "✅ Announcement created! It will appear at 11:11 AM ET for all logged-in users."
