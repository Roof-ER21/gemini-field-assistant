#!/bin/bash
# Trigger Baby Malik announcement immediately via Railway

echo "🎉 Triggering Baby Malik announcement NOW..."
echo ""

# Run the trigger script
railway run node scripts/trigger-baby-malik-now.js

echo ""
echo "✅ Done! The announcement should appear for all users within 30 seconds."
