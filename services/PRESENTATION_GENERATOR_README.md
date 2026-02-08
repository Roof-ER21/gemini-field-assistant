# Presentation Generator Service

**Location:** `/Users/a21/gemini-field-assistant/services/presentationGeneratorService.ts`

Automatically converts inspection photos and damage assessments into professional, insurance-focused presentations for homeowner meetings.

---

## What It Does

Takes an array of `DamageAssessment` objects (from `imageAnalysisService`) and automatically generates a complete, multi-slide presentation with:

1. **Intro Slide** - Property info, inspection date, rep contact
2. **Damage Slides** - One per damaged area, with photo and analysis
3. **Comparison Slide** - Damaged vs undamaged areas (optional)
4. **Summary Slide** - Overall severity score and claim viability
5. **Insurance Slide** - Key arguments for adjuster meeting
6. **Recommendations Slide** - Next steps and action items
7. **Contact Slide** - Rep contact info and follow-up plan

Each slide includes:
- Professional titles and subtitles
- Bullet-point content for display
- **Talking points** for the rep to use during presentation
- **Insurance notes** for claim documentation
- Metadata for filtering and sorting

---

## Quick Start

```typescript
import { generatePresentation } from './services/presentationGeneratorService';
import { analyzeRoofImage } from './services/imageAnalysisService';

// Step 1: Analyze photos
const assessments = await analyzeBatchImages(photos);

// Step 2: Generate presentation
const presentation = await generatePresentation(assessments, {
  propertyAddress: '123 Main St, Richmond, VA 23220',
  repName: 'John Smith',
  repContact: '(804) 555-1234',
  inspectionDate: new Date(),
  includeComparison: true,
  includeTalkingPoints: true,
  focusInsurance: true,
});

// Step 3: Use the presentation
console.log(presentation.summary.severityScore); // 0-100
console.log(presentation.summary.claimViability); // strong/moderate/weak/none
console.log(presentation.slides.length); // Number of slides
```

---

## API Reference

### `generatePresentation(assessments, options)`

Generates a complete presentation from damage assessments.

**Parameters:**
- `assessments: DamageAssessment[]` - Array of analyzed photos
- `options: PresentationOptions` - Configuration

**Returns:** `Promise<Presentation>`

---

### `PresentationOptions`

```typescript
interface PresentationOptions {
  propertyAddress: string;           // Required
  repName: string;                   // Required
  repContact: string;                // Required (phone/email)
  inspectionDate?: Date;             // Optional, defaults to now
  includeComparison?: boolean;       // Include comparison slide
  includeTalkingPoints?: boolean;    // Include talking points
  focusInsurance?: boolean;          // Focus on insurance arguments
}
```

---

### `Presentation` Object

```typescript
interface Presentation {
  id: string;
  title: string;
  propertyAddress: string;
  inspectionDate: Date;
  repName: string;
  repContact: string;
  slides: PresentationSlide[];
  summary: {
    totalPhotos: number;
    damageDetected: number;
    severityScore: number;           // 0-100
    claimViability: 'strong' | 'moderate' | 'weak' | 'none';
    urgency: 'low' | 'medium' | 'high' | 'urgent';
    estimatedScope: string;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

---

### `PresentationSlide` Object

```typescript
interface PresentationSlide {
  id: string;
  type: SlideType;                   // INTRO, DAMAGE, SUMMARY, etc.
  order: number;
  title: string;
  subtitle?: string;
  content: string[];                 // Bullet points for display
  imageUrl?: string;                 // Photo (for DAMAGE slides)
  imageName?: string;
  talkingPoints: string[];           // What the rep should say
  insuranceNotes?: string[];         // Insurance-specific points
  metadata?: {
    damageType?: string[];
    severity?: string;
    claimViability?: string;
    urgency?: string;
  };
}
```

---

## Slide Types

| Type | Purpose | Count |
|------|---------|-------|
| `INTRO` | Property overview, rep info | 1 |
| `DAMAGE` | One per damaged area with photo | 1-N |
| `COMPARISON` | Damaged vs undamaged areas | 0-1 |
| `SUMMARY` | Overall assessment, severity score | 1 |
| `INSURANCE` | Key insurance arguments | 1 |
| `RECOMMENDATIONS` | Next steps, action items | 1 |
| `CONTACT` | Rep contact, follow-up plan | 1 |

**Total Slides:** 5-10 typically (depends on number of damaged areas)

---

## Features

### 1. Automatic Slide Generation
- Analyzes all damage assessments
- Creates damage slides only for detected damage
- Orders slides logically
- Generates professional titles

### 2. Severity Scoring
- Calculates overall severity (0-100)
  - 0-20: Minimal
  - 20-40: Minor
  - 40-60: Moderate
  - 60-80: Severe
  - 80-100: Critical

### 3. Claim Viability Assessment
- Aggregates individual assessments
- Determines overall claim strength
- Provides insurance-focused talking points

### 4. Talking Points
- Auto-generated for each slide
- Insurance-focused language
- Rep can use verbatim during presentation

### 5. LocalStorage Integration
- Automatically saves presentations
- Keeps last 20 presentations
- Retrieve by ID
- Update and delete support

---

## Helper Functions

### `getSavedPresentations()`
Returns all saved presentations from localStorage.

```typescript
const presentations = getSavedPresentations();
console.log(presentations.length);
```

### `getPresentationById(id)`
Retrieve a specific presentation.

```typescript
const presentation = getPresentationById('pres_123456');
```

### `deletePresentation(id)`
Delete a presentation.

```typescript
deletePresentation('pres_123456');
```

### `updatePresentation(presentation)`
Update an existing presentation.

```typescript
presentation.summary.severityScore = 85;
updatePresentation(presentation);
```

### `exportPresentationAsMarkdown(presentation)`
Export presentation as markdown for email/documentation.

```typescript
const markdown = exportPresentationAsMarkdown(presentation);
console.log(markdown);
```

---

## Integration with Gemini Field Assistant

### Workflow

1. **Rep uploads photos** → `imageAnalysisService.analyzeRoofImage()`
2. **AI analyzes damage** → Returns `DamageAssessment[]`
3. **Generate presentation** → `generatePresentation(assessments, options)`
4. **Present to homeowner** → Display slides with talking points
5. **Export & send** → Email markdown summary

### UI Integration

```typescript
// In a React component
import { generatePresentation, getSavedPresentations } from './services/presentationGeneratorService';

function PresentationGenerator() {
  const [assessments, setAssessments] = useState([]);
  const [presentation, setPresentation] = useState(null);

  async function handleGenerate() {
    const pres = await generatePresentation(assessments, {
      propertyAddress: jobData.property.address,
      repName: userData.name,
      repContact: userData.phone,
      includeComparison: true,
      focusInsurance: true,
    });
    setPresentation(pres);
  }

  return (
    <div>
      <button onClick={handleGenerate}>Generate Presentation</button>
      {presentation && (
        <PresentationViewer presentation={presentation} />
      )}
    </div>
  );
}
```

---

## Example Output

### Sample Presentation

**Property:** 123 Main St, Richmond, VA 23220
**Inspection Date:** 2024-01-15
**Inspector:** Susan Davis
**Severity Score:** 72/100 (Severe)
**Claim Viability:** Strong
**Urgency:** High
**Estimated Scope:** Significant repair or partial replacement

**Slides:**
1. **INTRO** - Roof Inspection Report
2. **DAMAGE** - Severe Wind Damage (South slope, 150 sq ft)
3. **DAMAGE** - Moderate Hail Damage (Ridge area, 80 sq ft)
4. **COMPARISON** - Damage Overview (2 of 4 areas damaged)
5. **SUMMARY** - Overall Damage Assessment (72/100 severity)
6. **INSURANCE** - Insurance Claim Documentation (5 key arguments)
7. **RECOMMENDATIONS** - Next Steps (4 immediate actions)
8. **CONTACT** - Thank You (Rep contact, follow-up plan)

---

## Talking Points Example

For a **DAMAGE** slide:
- "This area shows severe wind damage affecting approximately 150 sq ft"
- "The damage is concentrated on the south-facing slope"
- "This requires immediate attention to prevent further damage"
- "This damage has strong insurance claim viability"
- "The covered peril of wind has caused functional damage requiring replacement"

---

## Insurance Notes Example

From **INSURANCE** slide:
- "Wind-driven hail damage visible on multiple shingles - covered peril"
- "Granule loss and cracking indicate recent storm damage, not wear"
- "Matching this discontinued shingle requires full slope replacement per IRC R908.3"
- "Functional damage to ridge shingles documented with photos"
- "Shingles are brittle and won't seal - safety hazard"

---

## Storage

### LocalStorage Keys
- `roof_presentations` - Array of Presentation objects

### Data Retention
- Keeps last **20 presentations**
- Older presentations automatically pruned
- Use `exportPresentationAsMarkdown()` for long-term storage

---

## Best Practices

1. **Always include comparison slide** for multi-area inspections
2. **Enable focusInsurance** for insurance claims
3. **Use professional rep names** (not just "John")
4. **Provide full contact info** (phone AND email)
5. **Export to markdown** for email to homeowner
6. **Save presentation to job record** for future reference

---

## Advanced Usage

### Custom Slide Ordering

```typescript
// Presentations are ordered automatically, but you can reorder:
presentation.slides.sort((a, b) => a.order - b.order);
```

### Filter Slides by Type

```typescript
const damageSlides = presentation.slides.filter(s => s.type === 'DAMAGE');
const insuranceSlide = presentation.slides.find(s => s.type === 'INSURANCE');
```

### Calculate Custom Metrics

```typescript
const avgConfidence = assessments.reduce((sum, a) => sum + a.confidence, 0) / assessments.length;
const urgentAreas = assessments.filter(a => a.analysis.urgency === 'urgent').length;
```

---

## Error Handling

```typescript
try {
  const presentation = await generatePresentation(assessments, options);
} catch (error) {
  if (error.message === 'No damage assessments provided') {
    console.error('Need at least one assessment');
  } else {
    console.error('Presentation generation failed:', error);
  }
}
```

---

## Future Enhancements

Potential improvements:
- PDF export with photos
- Email integration (send directly to homeowner)
- Template customization (company branding)
- Slide reordering UI
- Speaker notes (separate from talking points)
- Video presentation mode (auto-advance slides)
- Integration with job management system
- Print-friendly CSS

---

## Dependencies

- `imageAnalysisService.ts` - For `DamageAssessment` type
- `geminiService.ts` - For AI text generation (future use)
- `localStorage` - For persistence

---

## Related Files

- `/services/imageAnalysisService.ts` - Photo analysis
- `/services/geminiService.ts` - AI utilities
- `/services/presentationGeneratorService.example.ts` - Usage examples
- `/types/job.ts` - Job data structures

---

**Created:** 2024-01-15
**Status:** Production Ready
**Maintainer:** Roof-ER21 Team
