#!/bin/bash

# Test Document Loading Implementation
# This script verifies that document loading is working correctly

echo "🧪 Testing Document Loading Implementation"
echo "=========================================="
echo ""

BASE_URL="http://localhost:5174/extracted_content"

# Test 1: Check if server is running
echo "Test 1: Checking if Vite server is running..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5174 | grep -q "200"; then
    echo "✅ Server is running on port 5174"
else
    echo "❌ Server is not running. Start with: npm run dev"
    exit 1
fi
echo ""

# Test 2: Test loading a branding document
echo "Test 2: Loading RESIDENTIAL_BRAND_GUIDELINES.md..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/RESIDENTIAL_BRAND_GUIDELINES.md")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Branding document accessible (HTTP $HTTP_CODE)"
else
    echo "❌ Failed to load branding document (HTTP $HTTP_CODE)"
fi
echo ""

# Test 3: Test loading a sales script
echo "Test 3: Loading Initial Pitch Script..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/Sales%20Rep%20Resources%202/Sales%20Scripts%20/Initial%20Pitch%20Script.md")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Sales script accessible (HTTP $HTTP_CODE)"
else
    echo "❌ Failed to load sales script (HTTP $HTTP_CODE)"
fi
echo ""

# Test 4: Test loading an email template
echo "Test 4: Loading Post AM Email Template..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/Sales%20Rep%20Resources%202/Email%20Templates/Post%20AM%20Email%20Template.md")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Email template accessible (HTTP $HTTP_CODE)"
else
    echo "❌ Failed to load email template (HTTP $HTTP_CODE)"
fi
echo ""

# Test 5: Count available markdown files
echo "Test 5: Counting available documents..."
FILE_COUNT=$(find /Users/a21/Desktop/gemini-field-assistant/public/extracted_content -name "*.md" -type f | wc -l | tr -d ' ')
echo "✅ Found $FILE_COUNT markdown files"
echo ""

# Test 6: Verify content is not placeholder
echo "Test 6: Verifying real content (not placeholder)..."
CONTENT=$(curl -s "$BASE_URL/RESIDENTIAL_BRAND_GUIDELINES.md" | head -5)
if echo "$CONTENT" | grep -q "RESIDENTIAL_BRAND_GUIDELINES"; then
    echo "✅ Real content detected (not placeholder)"
else
    echo "❌ Content appears to be placeholder"
fi
echo ""

# Test 7: Test error handling (404)
echo "Test 7: Testing error handling with non-existent file..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/nonexistent-file.md")
if [ "$HTTP_CODE" = "404" ]; then
    echo "✅ 404 error handling works correctly"
else
    echo "⚠️  Expected 404, got HTTP $HTTP_CODE"
fi
echo ""

echo "=========================================="
echo "🎉 All tests completed!"
echo ""
echo "To test in the browser:"
echo "1. Open http://localhost:5174"
echo "2. Navigate to Knowledge Base"
echo "3. Click any document to view content"
echo ""
echo "Example documents to try:"
echo "  - Initial Pitch Script (Sales Scripts)"
echo "  - Post AM Email Template (Email Templates)"
echo "  - RESIDENTIAL_BRAND_GUIDELINES (Branding)"
echo "  - Training Manual (Training)"
