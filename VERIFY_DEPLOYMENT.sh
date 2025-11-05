#!/bin/bash

echo "🔍 S21 ROOFER Deployment Verification"
echo "======================================"
echo ""

echo "1️⃣  Checking production JavaScript hash..."
PROD_JS=$(curl -s https://sa21.up.railway.app/index.html | grep -o 'index-[a-zA-Z0-9_-]*\.js' | head -1)
echo "   Production: $PROD_JS"
echo ""

echo "2️⃣  Checking local build hash..."
LOCAL_JS=$(ls dist/assets/index-*.js 2>/dev/null | grep -o 'index-[a-zA-Z0-9_-]*\.js' | head -1)
echo "   Local build: $LOCAL_JS"
echo ""

if [ "$PROD_JS" == "$LOCAL_JS" ]; then
  echo "   ✅ MATCH - Railway deployed latest build!"
else
  echo "   ❌ MISMATCH - Railway has old build, wait for rebuild"
fi
echo ""

echo "3️⃣  Checking API health..."
curl -s https://sa21.up.railway.app/api/health | jq .
echo ""

echo "4️⃣  Checking email configuration..."
curl -s https://sa21.up.railway.app/api/notifications/config | jq .
echo ""

echo "5️⃣  Checking cron jobs..."
curl -s https://sa21.up.railway.app/api/admin/cron-status | jq .
echo ""

echo "6️⃣  Checking recent users..."
curl -s "https://sa21.up.railway.app/api/admin/users" \
  -H "X-User-Email: ahmed.mahmoud@theroofdocs.com" | jq '.[:3]'
echo ""

echo "======================================"
echo "✅ Verification complete!"
echo ""
echo "Next steps:"
echo "1. If hashes don't match, wait 2-3 minutes and run again"
echo "2. After match, have users hard refresh browser (Cmd+Shift+R)"
echo "3. Check admin panel for new conversations"
echo "4. Check email for login notifications"
