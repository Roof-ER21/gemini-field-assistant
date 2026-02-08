# Presentation System Integration Guide

**Location:** `/Users/a21/gemini-field-assistant/services/`

This document explains how the two presentation services work together to create a complete presentation workflow.

---

## Overview

### Two Complementary Services

1. **`presentationService.ts`** (Database CRUD)
   - Stores presentations in PostgreSQL
   - Handles viewer tracking
   - Multi-user access control
   - Persistent storage

2. **`presentationGeneratorService.ts`** (Auto-Generation)
   - Automatically generates presentations from damage assessments
   - AI-powered slide creation
   - Insurance-focused talking points
   - LocalStorage for quick access

---

## Complete Workflow

### Step 1: Field Inspection
Rep uploads photos during inspection.

```typescript
import { analyzeRoofImage } from './services/imageAnalysisService';

// Analyze photos
const assessment1 = await analyzeRoofImage(photo1);
const assessment2 = await analyzeRoofImage(photo2);
const assessment3 = await analyzeRoofImage(photo3);

const assessments = [assessment1, assessment2, assessment3];
```

### Step 2: Auto-Generate Presentation
Use `presentationGeneratorService` to create the presentation structure.

```typescript
import { generatePresentation } from './services/presentationGeneratorService';

// Auto-generate presentation
const generatedPresentation = await generatePresentation(assessments, {
  propertyAddress: '123 Main St, Richmond, VA 23220',
  repName: 'John Smith',
  repContact: '(804) 555-1234',
  inspectionDate: new Date(),
  includeComparison: true,
  includeTalkingPoints: true,
  focusInsurance: true,
});

// Result:
// - 7-10 slides automatically created
// - Talking points for each slide
// - Severity score calculated
// - Claim viability assessed
```

### Step 3: Save to Database
Use `presentationService` to save the generated presentation to PostgreSQL.

```typescript
import { PresentationService } from './services/presentationService';

const presService = new PresentationService(pool);

// Create presentation in database
const dbPresentation = await presService.createPresentation({
  contractorId: userData.id,
  inspectionId: jobData.id,
  title: generatedPresentation.title,
  description: `Severity: ${generatedPresentation.summary.severityScore}/100, ${generatedPresentation.summary.claimViability} claim`,
  coverImage: assessments[0]?.imageUrl,
  isActive: true,
});

// Save each slide to database
for (const slide of generatedPresentation.slides) {
  await presService.createSlide({
    presentationId: dbPresentation.id,
    slideType: mapSlideType(slide.type), // Convert to DB format
    title: slide.title,
    content: {
      subtitle: slide.subtitle,
      content: slide.content,
      imageUrl: slide.imageUrl,
      imageName: slide.imageName,
      talkingPoints: slide.talkingPoints,
      insuranceNotes: slide.insuranceNotes,
      metadata: slide.metadata,
    },
    slideOrder: slide.order,
  });
}
```

### Step 4: Present to Homeowner
Display the presentation in the UI.

```typescript
// Fetch from database
const presentation = await presService.getPresentationById(presentationId);
const slides = await presService.getSlidesByPresentation(presentationId);

// Track viewer session
const viewerSession = await presService.createViewerSession(
  presentationId,
  request.ip,
  request.headers['user-agent']
);

// Display slides
// (Your presentation viewer component)
```

### Step 5: Track Engagement
Monitor homeowner viewing behavior.

```typescript
// Update viewer progress
await presService.updateViewerSession(
  viewerSession.id,
  currentSlideIndex + 1,
  currentSlideIndex === slides.length - 1 // completed
);

// Get analytics
const sessions = await presService.getViewerSessions(presentationId);
console.log(`Total views: ${sessions.length}`);
console.log(`Completed: ${sessions.filter(s => s.completed).length}`);
```

---

## Slide Type Mapping

The generator uses different slide types than the database. Map them:

```typescript
function mapSlideType(generatorType: SlideType): 'cover' | 'damage_overview' | 'photo_detail' | 'recommendations' | 'contact' {
  switch (generatorType) {
    case 'INTRO':
      return 'cover';
    case 'DAMAGE':
      return 'photo_detail';
    case 'COMPARISON':
    case 'SUMMARY':
      return 'damage_overview';
    case 'INSURANCE':
    case 'RECOMMENDATIONS':
      return 'recommendations';
    case 'CONTACT':
      return 'contact';
    default:
      return 'damage_overview';
  }
}
```

---

## Storage Strategy

### LocalStorage (Generator)
- **Purpose:** Quick access during field work
- **Retention:** Last 20 presentations
- **Use case:** Offline access, draft presentations

### PostgreSQL (Service)
- **Purpose:** Permanent storage, multi-user access
- **Retention:** Indefinite (until deleted)
- **Use case:** Production presentations, viewer tracking

### Recommended Flow
1. Generate presentation → Save to LocalStorage
2. Review and edit → Keep in LocalStorage
3. Finalize → Save to PostgreSQL
4. Share with homeowner → Track in PostgreSQL

---

## Complete Integration Example

```typescript
import { analyzeRoofImage } from './services/imageAnalysisService';
import { generatePresentation, exportPresentationAsMarkdown } from './services/presentationGeneratorService';
import { PresentationService } from './services/presentationService';

async function completeWorkflow(
  photos: File[],
  propertyAddress: string,
  repName: string,
  repContact: string,
  jobData: any,
  userData: any,
  pool: any
) {
  // 1. ANALYZE PHOTOS
  const assessments = [];
  for (const photo of photos) {
    const assessment = await analyzeRoofImage(photo);
    assessments.push(assessment);
  }

  // 2. AUTO-GENERATE PRESENTATION
  const presentation = await generatePresentation(assessments, {
    propertyAddress,
    repName,
    repContact,
    inspectionDate: new Date(),
    includeComparison: true,
    includeTalkingPoints: true,
    focusInsurance: true,
  });

  // 3. SAVE TO DATABASE
  const presService = new PresentationService(pool);
  const dbPresentation = await presService.createPresentation({
    contractorId: userData.id,
    inspectionId: jobData.id,
    title: presentation.title,
    description: `Severity: ${presentation.summary.severityScore}/100`,
    coverImage: assessments.find(a => a.analysis.damageDetected)?.imageUrl,
    isActive: true,
  });

  // 4. SAVE SLIDES
  for (const slide of presentation.slides) {
    await presService.createSlide({
      presentationId: dbPresentation.id,
      slideType: mapSlideType(slide.type),
      title: slide.title,
      content: {
        subtitle: slide.subtitle,
        content: slide.content,
        imageUrl: slide.imageUrl,
        imageName: slide.imageName,
        talkingPoints: slide.talkingPoints,
        insuranceNotes: slide.insuranceNotes,
        metadata: slide.metadata,
      },
      slideOrder: slide.order,
    });
  }

  // 5. EXPORT MARKDOWN (for email)
  const markdown = exportPresentationAsMarkdown(presentation);

  // 6. SEND EMAIL TO HOMEOWNER
  // (Your email service here)

  return {
    presentationId: dbPresentation.id,
    slides: presentation.slides.length,
    severityScore: presentation.summary.severityScore,
    claimViability: presentation.summary.claimViability,
    markdown,
  };
}

function mapSlideType(generatorType: string): 'cover' | 'damage_overview' | 'photo_detail' | 'recommendations' | 'contact' {
  switch (generatorType) {
    case 'INTRO': return 'cover';
    case 'DAMAGE': return 'photo_detail';
    case 'COMPARISON':
    case 'SUMMARY': return 'damage_overview';
    case 'INSURANCE':
    case 'RECOMMENDATIONS': return 'recommendations';
    case 'CONTACT': return 'contact';
    default: return 'damage_overview';
  }
}
```

---

## API Endpoints Example

```typescript
// POST /api/presentations/generate
app.post('/api/presentations/generate', async (req, res) => {
  const { assessmentIds, propertyAddress, repName, repContact } = req.body;

  // Fetch assessments from database
  const assessments = await getAssessmentsByIds(assessmentIds);

  // Generate presentation
  const presentation = await generatePresentation(assessments, {
    propertyAddress,
    repName,
    repContact,
    includeComparison: true,
    focusInsurance: true,
  });

  // Save to database
  const presService = new PresentationService(pool);
  const dbPresentation = await presService.createPresentation({
    contractorId: req.user.id,
    title: presentation.title,
    description: `Auto-generated from ${assessments.length} photos`,
    isActive: true,
  });

  // Save slides
  for (const slide of presentation.slides) {
    await presService.createSlide({
      presentationId: dbPresentation.id,
      slideType: mapSlideType(slide.type),
      title: slide.title,
      content: slide,
      slideOrder: slide.order,
    });
  }

  res.json({ presentationId: dbPresentation.id });
});

// GET /api/presentations/:id
app.get('/api/presentations/:id', async (req, res) => {
  const presService = new PresentationService(pool);
  const presentation = await presService.getPresentationById(req.params.id);
  const slides = await presService.getSlidesByPresentation(req.params.id);

  res.json({ presentation, slides });
});

// POST /api/presentations/:id/view
app.post('/api/presentations/:id/view', async (req, res) => {
  const presService = new PresentationService(pool);
  const session = await presService.createViewerSession(
    req.params.id,
    req.ip,
    req.headers['user-agent']
  );

  res.json({ sessionId: session.id });
});

// PUT /api/presentations/sessions/:id
app.put('/api/presentations/sessions/:id', async (req, res) => {
  const { slidesViewed, completed } = req.body;
  const presService = new PresentationService(pool);
  const session = await presService.updateViewerSession(
    req.params.id,
    slidesViewed,
    completed
  );

  res.json(session);
});
```

---

## React Component Example

```typescript
import { useState, useEffect } from 'react';
import { generatePresentation } from '../services/presentationGeneratorService';
import { PresentationService } from '../services/presentationService';

function PresentationWorkflow({ assessments, jobData, userData }) {
  const [presentation, setPresentation] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      // Generate presentation
      const pres = await generatePresentation(assessments, {
        propertyAddress: jobData.property.address,
        repName: userData.name,
        repContact: userData.phone,
        includeComparison: true,
        focusInsurance: true,
      });

      setPresentation(pres);

      // Save to database
      const response = await fetch('/api/presentations/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presentation: pres,
          contractorId: userData.id,
          inspectionId: jobData.id,
        }),
      });

      const { presentationId } = await response.json();
      console.log('Saved to database:', presentationId);
    } catch (error) {
      console.error('Generation failed:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Generating presentation...</div>;
  if (!presentation) {
    return <button onClick={handleGenerate}>Generate Presentation</button>;
  }

  const slide = presentation.slides[currentSlide];

  return (
    <div className="presentation-viewer">
      <div className="slide">
        <h1>{slide.title}</h1>
        {slide.subtitle && <h2>{slide.subtitle}</h2>}
        {slide.imageUrl && <img src={slide.imageUrl} alt={slide.imageName} />}

        <div className="content">
          {slide.content.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        <div className="talking-points">
          <h3>Talking Points:</h3>
          <ul>
            {slide.talkingPoints.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="navigation">
        <button
          onClick={() => setCurrentSlide(s => s - 1)}
          disabled={currentSlide === 0}
        >
          Previous
        </button>
        <span>Slide {currentSlide + 1} of {presentation.slides.length}</span>
        <button
          onClick={() => setCurrentSlide(s => s + 1)}
          disabled={currentSlide === presentation.slides.length - 1}
        >
          Next
        </button>
      </div>

      <div className="summary">
        <p>Severity: {presentation.summary.severityScore}/100</p>
        <p>Claim Viability: {presentation.summary.claimViability}</p>
      </div>
    </div>
  );
}
```

---

## Database Schema

Ensure you have these tables:

```sql
-- Presentations table
CREATE TABLE presentations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES users(id),
  inspection_id UUID REFERENCES inspections(id),
  title TEXT NOT NULL,
  description TEXT,
  cover_image TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Slides table
CREATE TABLE presentation_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id UUID NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  slide_type TEXT NOT NULL CHECK (slide_type IN ('cover', 'damage_overview', 'photo_detail', 'recommendations', 'contact')),
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  slide_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Viewer sessions table
CREATE TABLE viewer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id UUID NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  viewer_ip TEXT,
  viewer_user_agent TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  last_viewed_at TIMESTAMP DEFAULT NOW(),
  slides_viewed INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE
);

-- Indexes
CREATE INDEX idx_presentations_contractor ON presentations(contractor_id);
CREATE INDEX idx_slides_presentation ON presentation_slides(presentation_id);
CREATE INDEX idx_viewer_sessions_presentation ON viewer_sessions(presentation_id);
```

---

## Key Differences

| Feature | presentationGeneratorService | presentationService |
|---------|------------------------------|---------------------|
| **Storage** | LocalStorage | PostgreSQL |
| **Purpose** | Auto-generation | CRUD operations |
| **Scope** | Single-user (rep) | Multi-user (team) |
| **Offline** | Yes | No |
| **Viewer Tracking** | No | Yes |
| **Talking Points** | Yes | Stored in content JSONB |
| **Severity Scoring** | Yes | Stored in description |
| **AI Integration** | Yes | No |

---

## Best Practices

1. **Generate locally first** (LocalStorage)
2. **Review and edit** before saving to database
3. **Save to database** when ready to share
4. **Track viewer engagement** with viewer_sessions
5. **Export to markdown** for email
6. **Keep database clean** - delete old presentations

---

## Summary

The two services work together perfectly:

1. **Generator** creates the presentation structure automatically
2. **Service** stores it permanently and tracks engagement
3. **Together** they provide a complete presentation workflow

Rep workflow:
1. Upload photos → Analyze
2. Generate presentation → Review
3. Save to database → Share
4. Track engagement → Follow up

---

**Created:** 2024-01-15
**Status:** Production Ready
