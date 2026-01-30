#!/bin/bash
# Safe deployment script for Gemini Field Assistant
# Ensures TypeScript is compiled before pushing

set -e

echo "🚀 Starting safe deployment..."

# 1. Rebuild dist-server
echo "📦 Building server from TypeScript..."
npm run server:build

# 2. Check for uncommitted changes
if ! git diff --quiet dist-server/; then
    echo "📝 Staging dist-server changes..."
    git add dist-server/
    git commit -m "build: Rebuild dist-server for deployment

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
fi

# 3. Push to trigger Railway deployment
echo "🚂 Pushing to Railway..."
git push origin main

# 4. Wait for deployment
echo "⏳ Waiting for deployment (60s)..."
sleep 60

# 5. Health check
echo "🏥 Running health check..."
HEALTH=$(curl -s https://sa21.up.railway.app/api/health)
if echo "$HEALTH" | grep -q '"status":"healthy"'; then
    echo "✅ Deployment successful! App is healthy."
    echo "$HEALTH"
else
    echo "❌ Health check failed!"
    echo "$HEALTH"
    exit 1
fi
