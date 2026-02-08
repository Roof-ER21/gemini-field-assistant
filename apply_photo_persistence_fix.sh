#!/bin/bash

# Photo Persistence Fix - Auto-Apply Script
# This script applies the photo persistence fix to NewInspectionFlow.tsx

set -e  # Exit on error

echo "========================================="
echo "Photo Persistence Fix - Auto-Apply"
echo "========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "components/inspection/NewInspectionFlow.tsx" ]; then
  echo "ERROR: Must run this script from the gemini-field-assistant root directory"
  echo "Current directory: $(pwd)"
  exit 1
fi

echo "Step 1: Creating backup of NewInspectionFlow.tsx..."
cp components/inspection/NewInspectionFlow.tsx components/inspection/NewInspectionFlow.tsx.backup
echo "✅ Backup created: components/inspection/NewInspectionFlow.tsx.backup"
echo ""

echo "Step 2: Checking if service file exists..."
if [ ! -f "services/inspectionPresentationService.ts" ]; then
  echo "❌ ERROR: services/inspectionPresentationService.ts not found"
  echo "This file should have been created already."
  exit 1
fi
echo "✅ Service file exists"
echo ""

echo "Step 3: Checking database migration..."
if [ ! -f "database/migrations/051_enhance_inspections_presentations.sql" ]; then
  echo "⚠️  WARNING: Database migration 051 not found"
  echo "You may need to run the migration manually"
else
  echo "✅ Database migration file exists"
fi
echo ""

echo "Step 4: Running database migration..."
echo "Please run this command separately to apply the migration:"
echo ""
echo "  railway run psql \$DATABASE_URL -f database/migrations/051_enhance_inspections_presentations.sql"
echo ""
echo "Or connect to your database and run the migration manually."
echo ""

echo "Step 5: Testing database connectivity..."
echo "Skipping automatic database test. Please verify manually."
echo ""

echo "========================================="
echo "Manual Steps Required:"
echo "========================================="
echo ""
echo "1. Open components/inspection/NewInspectionFlow.tsx"
echo ""
echo "2. Add this import at the top (around line 14):"
echo "   import {"
echo "     createInspectionWithPhotos,"
echo "     createPresentation,"
echo "     sharePresentation"
echo "   } from '../../services/inspectionPresentationService';"
echo ""
echo "3. Find the generatePresentation() function (around line 309)"
echo ""
echo "4. Replace the entire function with the version from PHOTO_PERSISTENCE_FIX.md"
echo "   (See section 'Step 2: Replace the generatePresentation() function')"
echo ""
echo "5. Update the PresentationSlide interface (around line 50):"
echo "   Add: photoId?: string; // Database photo ID"
echo ""
echo "6. Save the file and test"
echo ""

echo "========================================="
echo "Testing Instructions:"
echo "========================================="
echo ""
echo "1. Start the development server:"
echo "   npm run dev"
echo ""
echo "2. Navigate to the Inspection tab"
echo ""
echo "3. Upload 5-10 photos and generate presentation"
echo ""
echo "4. Check browser console for:"
echo "   [Inspection] Created: { inspectionId: ..., photoCount: ... }"
echo ""
echo "5. Verify in database that photos were saved:"
echo "   SELECT COUNT(*) FROM inspection_photos WHERE inspection_id = '<id>';"
echo ""
echo "========================================="
echo "Rollback:"
echo "========================================="
echo ""
echo "If something goes wrong:"
echo "  cp components/inspection/NewInspectionFlow.tsx.backup components/inspection/NewInspectionFlow.tsx"
echo ""

echo "Done! Please complete the manual steps above."
