# Photo Persistence Fix for Inspection Presentations

## Problem
Photos uploaded during inspection are only stored in React state (memory). When the page refreshes or user returns later, photos are gone because they were never saved to the database.

## Solution Overview
Modify `NewInspectionFlow.tsx` to:
1. Create an Inspection record when generating presentation
2. Save each photo to `inspection_photos` table with base64 data and AI analysis
3. Link the Job to the Inspection via `job_id`
4. Store presentation in database with references to saved photos

## Files Modified

### 1. Server Routes (`server/routes/inspectionPresentationRoutes.ts`)
✅ COMPLETED - Added PATCH endpoints:
- `PATCH /api/inspections/:id` - Update inspection (add job_id, change status)
- `PATCH /api/inspections/:id/photos/:photoId` - Update photo (add AI analysis)

### 2. New Service (`services/inspectionPresentationService.ts`)
✅ COMPLETED - Created helper functions:
- `createInspectionWithPhotos()` - Creates inspection and saves photos
- `createPresentation()` - Saves presentation to database
- `sharePresentation()` - Generates public share link
- `loadPresentationByToken()` - Loads presentation with photos for public view
- `loadInspectionWithPhotos()` - Loads inspection with all photos

### 3. Frontend Component (`components/inspection/NewInspectionFlow.tsx`)
⏳ NEEDS MODIFICATION - Replace `generatePresentation()` function

## Implementation Steps

### Step 1: Import the new service

Add to imports at top of `NewInspectionFlow.tsx`:

```typescript
import {
  createInspectionWithPhotos,
  createPresentation,
  sharePresentation
} from '../../services/inspectionPresentationService';
```

### Step 2: Replace the `generatePresentation()` function

Replace the existing `generatePresentation` function (around line 309) with this enhanced version:

```typescript
const generatePresentation = async () => {
  if (completedCount === 0) return;

  setIsGenerating(true);
  const completedPhotos = photos.filter(p => p.status === 'complete');

  try {
    const user = authService.getCurrentUser();
    const userEmail = user?.email || 'unknown';

    const hasCriticalDamage = completedPhotos.some(
      p => p.analysis?.severity === 'critical' || p.analysis?.severity === 'severe'
    );

    // Parse the address into components
    const parsedAddress = parseAddress(homeownerInfo.address);

    // Step 1: Create Inspection and Save Photos to Database
    setGenerationStatus('Creating inspection and saving photos...');
    const { inspectionId, photoIds } = await createInspectionWithPhotos(
      userEmail,
      homeownerInfo,
      completedPhotos
    );

    // Step 2: Create Job
    setGenerationStatus('Creating job record...');
    const jobData: Partial<Job> = {
      title: `Roof Inspection - ${parsedAddress.address || 'New Property'}`,
      status: 'inspection_complete',
      priority: hasCriticalDamage ? 'urgent' : 'medium',
      leadSource: 'canvassing',
      customer: {
        name: homeownerInfo.name || 'Homeowner',
        phone: homeownerInfo.phone || undefined
      },
      property: {
        address: parsedAddress.address,
        city: parsedAddress.city,
        state: parsedAddress.state,
        zip: parsedAddress.zip
      },
      notes: [],
      attachments: [],
      actions: []
    };

    const job = await jobService.createJob(userEmail, jobData);

    // Step 3: Link Inspection to Job
    await fetch(`/api/inspections/${inspectionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': userEmail
      },
      body: JSON.stringify({
        job_id: job.id,
        status: 'completed'
      })
    });

    // Step 4: Generate AI Summary Note
    setGenerationStatus('Generating AI summary...');
    const summaryText = generateAISummary(completedPhotos);

    const summaryNote: JobNote = {
      id: `note-${Date.now()}`,
      text: summaryText,
      createdAt: new Date().toISOString(),
      author: 'Susan AI',
      type: 'inspection'
    };

    // Add note to job
    await jobService.updateJob(job.id, {
      notes: [summaryNote, ...(job.notes || [])]
    });

    // Step 5: Build Slides (with photo IDs from database)
    setGenerationStatus('Building presentation slides...');
    const slides: PresentationSlide[] = [];
    let order = 0;

    // Rep Profile Slide (first)
    if (userProfile) {
      slides.push({
        id: `slide-rep-${Date.now()}`,
        type: 'rep_profile',
        title: 'Your Roofing Professional',
        content: JSON.stringify(userProfile),
        order: order++
      });
    }

    // Cover Slide
    slides.push({
      id: `slide-cover-${Date.now()}`,
      type: 'cover',
      title: 'Roof Inspection Report',
      content: homeownerInfo.address || 'Property Inspection',
      order: order++
    });

    // Photo Slides - Now with database photo IDs
    for (let i = 0; i < completedPhotos.length; i++) {
      const photo = completedPhotos[i];
      const photoId = photoIds[i]; // Database ID

      slides.push({
        id: `slide-photo-${photoId || photo.id}`,
        type: 'photo',
        title: photo.analysis?.damageType || 'Inspection Finding',
        photo: photo.preview,
        photoBase64: photo.base64,
        photoId: photoId, // Store database photo ID
        analysis: photo.analysis,
        order: order++
      });
    }

    // Summary Slide
    slides.push({
      id: `slide-summary-${Date.now()}`,
      type: 'summary',
      title: 'Inspection Summary',
      content: JSON.stringify({
        totalFindings: completedPhotos.length,
        criticalIssues: criticalCount,
        insuranceRelevant: insuranceCount,
        overallAssessment: hasCriticalDamage
          ? 'Immediate attention recommended'
          : 'Standard maintenance items found'
      }),
      order: order++
    });

    // Recommendations Slide
    const allRecommendations = completedPhotos
      .flatMap(p => p.analysis?.recommendations || [])
      .filter((rec, idx, arr) => arr.indexOf(rec) === idx)
      .slice(0, 5);

    slides.push({
      id: `slide-recs-${Date.now()}`,
      type: 'recommendations',
      title: 'Recommended Next Steps',
      content: JSON.stringify(allRecommendations),
      order: order++
    });

    // Call-to-Action Slide
    slides.push({
      id: `slide-cta-${Date.now()}`,
      type: 'cta',
      title: 'Protect Your Home',
      content: JSON.stringify({
        message: insuranceCount > 0
          ? `We found ${insuranceCount} insurance-relevant items. Let's file a claim to protect your investment.`
          : 'Schedule a full inspection to ensure your roof is protected.',
        nextSteps: [
          'Schedule comprehensive inspection',
          'Review insurance coverage',
          'Get free estimate'
        ]
      }),
      order: order++
    });

    // Step 6: Save Presentation to Database
    setGenerationStatus('Saving presentation...');
    const { presentationId, shareToken } = await createPresentation(
      userEmail,
      inspectionId,
      slides,
      homeownerInfo
    );

    setGenerationStatus('Ready to present!');

    // Store inspectionId and presentationId for later use
    console.log('[Inspection] Created:', {
      inspectionId,
      presentationId,
      jobId: job.id,
      photoCount: photoIds.length
    });

    // Callback with slides and job ID
    if (onPresentationReady) {
      onPresentationReady(slides, job.id);
    }

  } catch (error) {
    console.error('Error generating presentation:', error);
    setGenerationStatus(`Error: ${error.message || 'Failed to generate presentation'}`);
    alert(`Error: ${error.message || 'Failed to generate presentation'}`);
  } finally {
    setIsGenerating(false);
  }
};
```

### Step 3: Update PresentationSlide interface

Add `photoId` field to the `PresentationSlide` interface (around line 50):

```typescript
interface PresentationSlide {
  id: string;
  type: 'cover' | 'rep_profile' | 'photo' | 'summary' | 'recommendations' | 'cta';
  title: string;
  content?: string;
  photo?: string;
  photoBase64?: string;
  photoId?: string; // Database photo ID - ADD THIS LINE
  analysis?: PhotoAnalysis;
  order: number;
}
```

## Testing

### Test 1: Photo Upload and Persistence
1. Open the app and start a new inspection
2. Upload 5-10 roof photos
3. Wait for AI analysis to complete
4. Click "Generate Presentation"
5. Verify status messages show:
   - "Creating inspection and saving photos..."
   - "Creating job record..."
   - "Generating AI summary..."
   - "Building presentation slides..."
   - "Saving presentation..."
   - "Ready to present!"

### Test 2: Check Database
After generating a presentation, verify in database:

```sql
-- Check inspection was created
SELECT * FROM inspections ORDER BY created_at DESC LIMIT 1;

-- Check photos were saved
SELECT id, file_name, file_size, category,
       ai_analysis IS NOT NULL as has_analysis
FROM inspection_photos
WHERE inspection_id = '<inspection_id>'
ORDER BY created_at;

-- Check presentation was created
SELECT * FROM presentations ORDER BY created_at DESC LIMIT 1;
```

### Test 3: Load Presentation Later
1. Refresh the page
2. Navigate to Jobs
3. Find the newly created job
4. Click to view it
5. Photos should load from database (not memory)

### Test 4: Share Link
1. Generate a presentation
2. Click the share button
3. Copy the share link
4. Open in incognito/private window
5. Photos should load from database

## Database Schema Requirements

Ensure these tables exist (should be created by migration 051):

```sql
-- inspections table with required fields
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id);
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS photo_count INTEGER DEFAULT 0;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS analyzed_photo_count INTEGER DEFAULT 0;

-- inspection_photos with required fields
ALTER TABLE inspection_photos ADD COLUMN IF NOT EXISTS photo_data TEXT;
ALTER TABLE inspection_photos ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
ALTER TABLE inspection_photos ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- presentations with required fields
ALTER TABLE presentations ADD COLUMN IF NOT EXISTS slides JSONB;
ALTER TABLE presentations ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
ALTER TABLE presentations ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
```

## Rollback Plan

If something goes wrong:
1. Revert `NewInspectionFlow.tsx` to previous version (git)
2. Photos will be in-memory only (old behavior)
3. Database tables won't be used

## Benefits After Fix

1. ✅ Photos persist across page refreshes
2. ✅ Reps can view job photos days/weeks later
3. ✅ Homeowners can access shared presentations anytime
4. ✅ Photos stored securely in database (base64)
5. ✅ AI analysis saved with each photo
6. ✅ Full presentation history
7. ✅ Can track which photos led to job conversions

## Next Steps (Optional Enhancements)

1. **Photo Optimization**: Convert base64 to actual file storage (S3, etc.)
2. **Thumbnail Generation**: Create smaller thumbnails for faster loading
3. **Photo Editing**: Allow reps to annotate photos
4. **Batch Operations**: Upload multiple inspections at once
5. **Analytics**: Track which photos convert best
