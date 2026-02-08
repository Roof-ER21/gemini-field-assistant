# Quick Start: Photo Persistence Fix

## Problem
Photos uploaded during roof inspection are lost when page refreshes or user returns later.

## What Was Done

### ✅ 1. Backend API Updates
**File**: `server/routes/inspectionPresentationRoutes.ts`

Added two new endpoints:
- `PATCH /api/inspections/:id` - Update inspection (link to job, change status)
- `PATCH /api/inspections/:id/photos/:photoId` - Update photo metadata and AI analysis

### ✅ 2. Service Layer
**File**: `services/inspectionPresentationService.ts` (NEW)

Created helper functions:
- `createInspectionWithPhotos()` - Creates inspection + saves all photos to DB
- `createPresentation()` - Saves presentation to DB with photo references
- `sharePresentation()` - Generates public share link
- `loadPresentationByToken()` - Loads presentation for public viewing
- `loadInspectionWithPhotos()` - Loads inspection with all photos

### ✅ 3. Database Schema
**File**: `database/migrations/051_enhance_inspections_presentations.sql`

Already exists with:
- `inspections` table with `user_id`, `job_id`, `photo_count` fields
- `inspection_photos` table with `photo_data` (base64), `ai_analysis` (JSONB)
- `presentations` table with `slides` (JSONB), `share_token`, `is_public`
- Triggers to auto-increment photo counts

## What You Need to Do

### Step 1: Run Database Migration (If Not Done)

```bash
# Connect to Railway database
railway run psql $DATABASE_URL -f database/migrations/051_enhance_inspections_presentations.sql
```

Or manually run the SQL in your PostgreSQL admin tool.

### Step 2: Update Frontend Component

**File to edit**: `components/inspection/NewInspectionFlow.tsx`

#### 2a. Add Import (top of file, around line 14)

```typescript
import {
  createInspectionWithPhotos,
  createPresentation
} from '../../services/inspectionPresentationService';
```

#### 2b. Update Interface (around line 50)

Add `photoId` field to `PresentationSlide`:

```typescript
interface PresentationSlide {
  id: string;
  type: 'cover' | 'rep_profile' | 'photo' | 'summary' | 'recommendations' | 'cta';
  title: string;
  content?: string;
  photo?: string;
  photoBase64?: string;
  photoId?: string; // ← ADD THIS LINE
  analysis?: PhotoAnalysis;
  order: number;
}
```

#### 2c. Replace generatePresentation() Function (around line 309)

Find this line:
```typescript
const generatePresentation = async () => {
```

Replace the ENTIRE function with this new version:

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

    const parsedAddress = parseAddress(homeownerInfo.address);

    // STEP 1: Create Inspection and Save Photos to Database
    setGenerationStatus('Saving inspection and photos to database...');
    const { inspectionId, photoIds } = await createInspectionWithPhotos(
      userEmail,
      homeownerInfo,
      completedPhotos
    );

    console.log('[Inspection] Saved to database:', { inspectionId, photoCount: photoIds.length });

    // STEP 2: Create Job
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

    // STEP 3: Link Inspection to Job
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

    // STEP 4: Generate AI Summary Note
    setGenerationStatus('Generating AI summary...');
    const summaryText = generateAISummary(completedPhotos);

    const summaryNote: JobNote = {
      id: `note-${Date.now()}`,
      text: summaryText,
      createdAt: new Date().toISOString(),
      author: 'Susan AI',
      type: 'inspection'
    };

    await jobService.updateJob(job.id, {
      notes: [summaryNote, ...(job.notes || [])]
    });

    // STEP 5: Build Slides
    setGenerationStatus('Building presentation slides...');
    const slides: PresentationSlide[] = [];
    let order = 0;

    if (userProfile) {
      slides.push({
        id: `slide-rep-${Date.now()}`,
        type: 'rep_profile',
        title: 'Your Roofing Professional',
        content: JSON.stringify(userProfile),
        order: order++
      });
    }

    slides.push({
      id: `slide-cover-${Date.now()}`,
      type: 'cover',
      title: 'Roof Inspection Report',
      content: homeownerInfo.address || 'Property Inspection',
      order: order++
    });

    // Photo Slides - WITH DATABASE PHOTO IDs
    for (let i = 0; i < completedPhotos.length; i++) {
      const photo = completedPhotos[i];
      const photoId = photoIds[i];

      slides.push({
        id: `slide-photo-${photoId || photo.id}`,
        type: 'photo',
        title: photo.analysis?.damageType || 'Inspection Finding',
        photo: photo.preview,
        photoBase64: photo.base64,
        photoId: photoId, // ← DATABASE PHOTO ID
        analysis: photo.analysis,
        order: order++
      });
    }

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

    // STEP 6: Save Presentation to Database
    setGenerationStatus('Saving presentation...');
    const { presentationId } = await createPresentation(
      userEmail,
      inspectionId,
      slides,
      homeownerInfo
    );

    console.log('[Presentation] Created:', { presentationId, inspectionId, jobId: job.id });

    setGenerationStatus('Ready to present!');

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

### Step 3: Test It

1. **Start dev server**:
   ```bash
   npm run dev
   ```

2. **Upload photos**:
   - Navigate to Inspection tab
   - Upload 5-10 roof photos
   - Wait for AI analysis

3. **Generate presentation**:
   - Click "Generate Presentation"
   - Watch status messages

4. **Check browser console**:
   ```
   [Inspection] Saved to database: { inspectionId: "...", photoCount: 10 }
   [Presentation] Created: { presentationId: "...", inspectionId: "...", jobId: "..." }
   ```

5. **Verify in database**:
   ```sql
   SELECT * FROM inspections ORDER BY created_at DESC LIMIT 1;
   SELECT COUNT(*) FROM inspection_photos WHERE inspection_id = '<id>';
   SELECT * FROM presentations ORDER BY created_at DESC LIMIT 1;
   ```

6. **Test persistence**:
   - Refresh the page
   - Navigate to Jobs tab
   - Open the created job
   - Photos should be accessible (loaded from DB)

### Step 4: Test Share Link

1. Generate a presentation
2. Get the job ID from browser console
3. In database, find the presentation:
   ```sql
   SELECT * FROM presentations WHERE inspection_id IN (
     SELECT id FROM inspections WHERE job_id = '<job-id>'
   );
   ```
4. Share the presentation:
   ```bash
   curl -X POST http://localhost:4000/api/presentations/<presentation-id>/share \
     -H "x-user-email: your-email@example.com"
   ```
5. Copy the returned `share_url`
6. Open in incognito window
7. Photos should load from database

## Troubleshooting

### Photos not saving
- Check browser console for errors
- Verify API endpoint `/api/inspections` works
- Check database connection
- Verify migration ran successfully

### Database errors
```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('inspections', 'inspection_photos', 'presentations');

-- Check if columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'inspection_photos'
AND column_name IN ('photo_data', 'ai_analysis');
```

### Import errors
- Make sure `services/inspectionPresentationService.ts` exists
- Check file path is correct
- Restart TypeScript server in VS Code

## Rollback

If something goes wrong:

```bash
# Restore backup
cp components/inspection/NewInspectionFlow.tsx.backup \
   components/inspection/NewInspectionFlow.tsx
```

## Files Changed

1. ✅ `server/routes/inspectionPresentationRoutes.ts` - PATCH endpoints added
2. ✅ `services/inspectionPresentationService.ts` - NEW service file
3. ⏳ `components/inspection/NewInspectionFlow.tsx` - **YOU NEED TO EDIT THIS**

## Next Steps After Fix

- [ ] Test with real data
- [ ] Deploy to production (Railway)
- [ ] Monitor database size growth
- [ ] Consider migrating to S3 for photo storage (optional)
- [ ] Add photo thumbnails for faster loading (optional)
