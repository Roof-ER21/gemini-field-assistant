#!/bin/bash

# Test script for Inspection Presentation API
# Usage: ./test-inspection-api.sh

# Configuration
API_BASE="http://localhost:5000/api"
USER_EMAIL="ahmed@roof-er.com"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Inspection Presentation API Test ===${NC}\n"

# 1. Create Inspection
echo -e "${BLUE}1. Creating inspection...${NC}"
INSPECTION_RESPONSE=$(curl -s -X POST "$API_BASE/inspections" \
  -H "Content-Type: application/json" \
  -H "x-user-email: $USER_EMAIL" \
  -d '{
    "property_address": "123 Main St, Baltimore, MD 21201",
    "customer_name": "John Doe",
    "roof_type": "Asphalt Shingle",
    "roof_age": 15,
    "inspector_notes": "Initial inspection - visible wind damage",
    "weather_conditions": "Sunny, 65F"
  }')

INSPECTION_ID=$(echo $INSPECTION_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$INSPECTION_ID" ]; then
  echo -e "${RED}Failed to create inspection${NC}"
  echo $INSPECTION_RESPONSE
  exit 1
fi

echo -e "${GREEN}Created inspection: $INSPECTION_ID${NC}\n"

# 2. Upload Sample Photo (small base64 image)
echo -e "${BLUE}2. Uploading test photo...${NC}"

# Create a simple base64 test image (1x1 pixel)
SAMPLE_PHOTO="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

PHOTO_RESPONSE=$(curl -s -X POST "$API_BASE/inspections/$INSPECTION_ID/photos" \
  -H "Content-Type: application/json" \
  -H "x-user-email: $USER_EMAIL" \
  -d "{
    \"photo_data\": \"$SAMPLE_PHOTO\",
    \"file_name\": \"roof_damage_1.png\",
    \"file_size\": 100,
    \"mime_type\": \"image/png\",
    \"category\": \"damage\",
    \"notes\": \"Visible wind damage on north slope\"
  }")

PHOTO_ID=$(echo $PHOTO_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PHOTO_ID" ]; then
  echo -e "${RED}Failed to upload photo${NC}"
  echo $PHOTO_RESPONSE
  exit 1
fi

echo -e "${GREEN}Uploaded photo: $PHOTO_ID${NC}\n"

# 3. Get Inspection (verify photo count)
echo -e "${BLUE}3. Getting inspection details...${NC}"
curl -s -X GET "$API_BASE/inspections/$INSPECTION_ID" \
  -H "x-user-email: $USER_EMAIL" | jq '.inspection | {id, photo_count, status}'
echo -e "\n"

# 4. List Photos
echo -e "${BLUE}4. Listing photos...${NC}"
curl -s -X GET "$API_BASE/inspections/$INSPECTION_ID/photos" \
  -H "x-user-email: $USER_EMAIL" | jq '.photos | length'
echo -e "${GREEN}Photos listed successfully${NC}\n"

# 5. Run AI Analysis (will use Gemini API)
echo -e "${BLUE}5. Running AI analysis (this may take a moment)...${NC}"
ANALYSIS_RESPONSE=$(curl -s -X POST "$API_BASE/inspections/$INSPECTION_ID/analyze" \
  -H "x-user-email: $USER_EMAIL")

echo $ANALYSIS_RESPONSE | jq '.'
echo -e "\n"

# 6. Generate Presentation
echo -e "${BLUE}6. Generating presentation...${NC}"
PRESENTATION_RESPONSE=$(curl -s -X POST "$API_BASE/presentations" \
  -H "Content-Type: application/json" \
  -H "x-user-email: $USER_EMAIL" \
  -d "{
    \"inspection_id\": \"$INSPECTION_ID\",
    \"title\": \"Roof Inspection Report - John Doe\",
    \"presentation_type\": \"insurance\",
    \"branding\": {
      \"company_name\": \"Roof-ER\",
      \"contact_info\": \"555-1234 | info@roof-er.com\"
    }
  }")

PRESENTATION_ID=$(echo $PRESENTATION_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PRESENTATION_ID" ]; then
  echo -e "${RED}Failed to create presentation${NC}"
  echo $PRESENTATION_RESPONSE
  exit 1
fi

echo -e "${GREEN}Created presentation: $PRESENTATION_ID${NC}\n"

# 7. Get Presentation
echo -e "${BLUE}7. Getting presentation details...${NC}"
curl -s -X GET "$API_BASE/presentations/$PRESENTATION_ID" \
  -H "x-user-email: $USER_EMAIL" | jq '.presentation | {id, title, status, slides: (.slides | length)}'
echo -e "\n"

# 8. Update Presentation Status
echo -e "${BLUE}8. Updating presentation status to 'ready'...${NC}"
curl -s -X PUT "$API_BASE/presentations/$PRESENTATION_ID" \
  -H "Content-Type: application/json" \
  -H "x-user-email: $USER_EMAIL" \
  -d '{
    "status": "ready"
  }' | jq '.presentation | {id, status}'
echo -e "\n"

# 9. Share Presentation
echo -e "${BLUE}9. Sharing presentation (generating public link)...${NC}"
SHARE_RESPONSE=$(curl -s -X POST "$API_BASE/presentations/$PRESENTATION_ID/share" \
  -H "x-user-email: $USER_EMAIL")

SHARE_TOKEN=$(echo $SHARE_RESPONSE | grep -o '"share_token":"[^"]*"' | cut -d'"' -f4)

echo $SHARE_RESPONSE | jq '.'
echo -e "\n"

# 10. View Public Presentation (no auth)
echo -e "${BLUE}10. Viewing public presentation (no authentication)...${NC}"
curl -s -X GET "$API_BASE/present/$SHARE_TOKEN" | jq '.presentation | {id, title, view_count, slides: (.slides | length)}'
echo -e "\n"

# Summary
echo -e "${GREEN}=== Test Complete ===${NC}"
echo -e "Inspection ID: ${GREEN}$INSPECTION_ID${NC}"
echo -e "Presentation ID: ${GREEN}$PRESENTATION_ID${NC}"
echo -e "Share Token: ${GREEN}$SHARE_TOKEN${NC}"
echo -e "Public URL: ${GREEN}http://localhost:5000/api/present/$SHARE_TOKEN${NC}\n"

echo -e "${BLUE}You can now:${NC}"
echo "  - View inspection: curl -H 'x-user-email: $USER_EMAIL' $API_BASE/inspections/$INSPECTION_ID | jq"
echo "  - View presentation: curl -H 'x-user-email: $USER_EMAIL' $API_BASE/presentations/$PRESENTATION_ID | jq"
echo "  - View public (no auth): curl $API_BASE/present/$SHARE_TOKEN | jq"
echo ""
