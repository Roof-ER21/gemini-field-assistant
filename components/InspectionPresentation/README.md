# Inspection Presentation Components

Complete React component suite for creating AI-powered roof inspection presentations in Gemini Field Assistant.

## Components

### 1. InspectionUploader
Multi-photo upload with drag & drop, real-time AI analysis, and progress tracking.

**Features:**
- Drag & drop or click to browse
- Multi-photo upload (max 20 by default)
- Real-time AI analysis with Gemini
- Upload progress tracking
- Photo preview grid
- Severity badges
- Status indicators (uploading, analyzing, complete, error)

**Props:**
```typescript
interface InspectionUploaderProps {
  onPhotosAnalyzed?: (photos: UploadedPhoto[]) => void;
  maxPhotos?: number; // default: 20
}
```

**Usage:**
```tsx
import InspectionUploader from './components/InspectionUploader';

<InspectionUploader
  onPhotosAnalyzed={(photos) => console.log('Analyzed:', photos)}
  maxPhotos={20}
/>
```

---

### 2. PhotoAnalysisCard
Displays analyzed inspection photo with damage details, severity, and recommendations.

**Features:**
- Photo preview with severity badge
- Insurance relevance indicator
- Expandable detailed analysis
- Damage type, location, and description
- Estimated repair costs
- Urgency indicators
- Recommendations list
- Quick stats summary

**Props:**
```typescript
interface PhotoAnalysisCardProps {
  photo: string; // URL or base64
  analysis: PhotoAnalysis;
  photoNumber: number;
  onEdit?: (analysis: PhotoAnalysis) => void;
}
```

**Usage:**
```tsx
import PhotoAnalysisCard from './components/PhotoAnalysisCard';

<PhotoAnalysisCard
  photo={photoUrl}
  analysis={aiAnalysis}
  photoNumber={1}
/>
```

---

### 3. PresentationGenerator
Build and customize presentation slides with drag-to-reorder and inline editing.

**Features:**
- Auto-generate slides from analyzed photos
- Customizable presentation metadata (title, inspector, address)
- Drag-to-reorder slides
- Inline slide editing
- Add/delete custom slides
- Preview mode
- Slide type indicators (title, photo, summary, recommendations)

**Props:**
```typescript
interface PresentationGeneratorProps {
  photos: Array<{ id: string; preview: string; analysis?: PhotoAnalysis }>;
  onGenerate?: (slides: PresentationSlide[]) => void;
  onPreview?: (slides: PresentationSlide[]) => void;
}
```

**Usage:**
```tsx
import PresentationGenerator from './components/PresentationGenerator';

<PresentationGenerator
  photos={analyzedPhotos}
  onGenerate={(slides) => console.log('Generated:', slides)}
  onPreview={(slides) => console.log('Preview:', slides)}
/>
```

---

### 4. InspectionPresenter
Full-screen presentation mode with keyboard navigation and Susan AI integration.

**Features:**
- Full-screen presentation view
- Keyboard navigation (arrows, F for fullscreen, Esc to exit)
- Slide counter and progress dots
- Auto-hiding controls (3s timeout)
- Beautiful slide animations
- Multiple slide types:
  - Title slide with metadata
  - Photo slides with split-screen analysis
  - Summary slide with statistics
  - Recommendations slide with grid layout
- Download and share buttons
- Susan AI chat overlay

**Props:**
```typescript
interface InspectionPresenterProps {
  slides: PresentationSlide[];
  onClose: () => void;
  propertyAddress?: string;
  inspectorName?: string;
}
```

**Keyboard Shortcuts:**
- `→` or `Space` - Next slide
- `←` - Previous slide
- `F` - Toggle fullscreen
- `Esc` - Exit presentation
- `Home` - First slide
- `End` - Last slide

**Usage:**
```tsx
import InspectionPresenter from './components/InspectionPresenter';

<InspectionPresenter
  slides={slides}
  onClose={() => console.log('Presentation closed')}
  propertyAddress="123 Main St"
  inspectorName="John Doe"
/>
```

---

### 5. SusanChatWidget
Context-aware AI assistant that explains damage during presentations.

**Features:**
- Floating chat bubble
- Expandable chat interface
- Context-aware responses based on current slide
- Quick action buttons
- Real-time typing indicators
- Message history
- Expand/collapse and minimize
- Auto-scrolling messages

**Smart Responses:**
- Repair cost estimates
- Insurance coverage guidance
- Urgency assessment
- Damage cause explanations
- Next steps and recommendations
- General roofing expertise

**Props:**
```typescript
interface SusanChatWidgetProps {
  currentSlide?: PresentationSlide;
  slideNumber?: number;
  totalSlides?: number;
}
```

**Usage:**
```tsx
import SusanChatWidget from './components/SusanChatWidget';

<SusanChatWidget
  currentSlide={slides[currentIndex]}
  slideNumber={currentIndex + 1}
  totalSlides={slides.length}
/>
```

---

## Complete Workflow Example

### Option 1: Use the Complete Panel

```tsx
import InspectionPresentationPanel from './components/InspectionPresentationPanel';

function App() {
  return <InspectionPresentationPanel />;
}
```

This provides the complete 4-step workflow:
1. Upload photos
2. Review AI analysis
3. Customize presentation
4. Present with Susan AI

---

### Option 2: Build Custom Workflow

```tsx
import React, { useState } from 'react';
import {
  InspectionUploader,
  PhotoAnalysisCard,
  PresentationGenerator,
  InspectionPresenter
} from './components/InspectionPresentation';

function CustomInspectionApp() {
  const [photos, setPhotos] = useState([]);
  const [slides, setSlides] = useState([]);
  const [presenting, setPresenting] = useState(false);

  return (
    <div>
      {/* Step 1: Upload */}
      <InspectionUploader
        onPhotosAnalyzed={setPhotos}
      />

      {/* Step 2: Review */}
      {photos.map((photo, idx) => (
        <PhotoAnalysisCard
          key={photo.id}
          photo={photo.preview}
          analysis={photo.analysis}
          photoNumber={idx + 1}
        />
      ))}

      {/* Step 3: Build */}
      <PresentationGenerator
        photos={photos}
        onGenerate={(slides) => {
          setSlides(slides);
          setPresenting(true);
        }}
      />

      {/* Step 4: Present */}
      {presenting && (
        <InspectionPresenter
          slides={slides}
          onClose={() => setPresenting(false)}
          propertyAddress="123 Main St"
          inspectorName="John Doe"
        />
      )}
    </div>
  );
}
```

---

## Data Structures

### PhotoAnalysis
```typescript
interface PhotoAnalysis {
  damageType: string;
  severity: 'minor' | 'moderate' | 'severe' | 'critical';
  location: string;
  description: string;
  recommendations: string[];
  insuranceRelevant: boolean;
  estimatedRepairCost?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}
```

### PresentationSlide
```typescript
interface PresentationSlide {
  id: string;
  type: 'title' | 'photo' | 'summary' | 'recommendations';
  photo?: string;
  analysis?: PhotoAnalysis;
  title?: string;
  content?: string;
  order: number;
}
```

---

## Styling

All components use the existing Gemini Field Assistant design system:
- Tailwind CSS utility classes
- Red/black color scheme (#e94560)
- Glass morphism effects
- Responsive design
- Dark theme optimized
- Smooth animations

---

## AI Integration

Uses existing `geminiService.ts`:

```typescript
import { analyzeImage } from '../services/geminiService';

const analysis = await analyzeImage(
  base64Image,
  'image/jpeg',
  'Analyze this roof damage...'
);
```

The AI provides structured JSON responses with:
- Damage type classification
- Severity assessment
- Location identification
- Detailed descriptions
- Repair recommendations
- Insurance relevance
- Cost estimates
- Urgency ratings

---

## File Locations

```
/Users/a21/gemini-field-assistant/components/
├── InspectionUploader.tsx          # Photo upload & AI analysis
├── PhotoAnalysisCard.tsx           # Analysis display card
├── PresentationGenerator.tsx       # Slide builder
├── InspectionPresenter.tsx         # Full-screen presenter
├── SusanChatWidget.tsx             # AI chat assistant
├── InspectionPresentationPanel.tsx # Complete workflow panel
└── InspectionPresentation/
    ├── index.ts                    # Export aggregator
    └── README.md                   # This file
```

---

## Dependencies

All dependencies already installed in package.json:
- React 19.2.0
- Lucide React (icons)
- Tailwind CSS
- @google/genai (Gemini AI)
- Existing UI components (Button, Card, etc.)

---

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

**Features:**
- Fullscreen API
- File API (drag & drop)
- Canvas API (future PDF generation)
- Modern ES6+ JavaScript

---

## Future Enhancements

- [ ] PDF export with jsPDF
- [ ] Email presentation directly to clients
- [ ] Save presentations to database
- [ ] Presentation templates
- [ ] Voice narration
- [ ] Annotation tools
- [ ] Compare before/after photos
- [ ] Multi-property presentations
- [ ] Team collaboration
- [ ] Analytics (view counts, engagement)

---

## Tips

1. **Photo Quality**: Use high-resolution photos for best AI analysis
2. **Naming**: Use descriptive file names for better organization
3. **Batch Upload**: Upload all photos at once for faster processing
4. **Review Before Presenting**: Always review AI analysis for accuracy
5. **Susan AI**: Ask specific questions for best responses
6. **Keyboard Navigation**: Use keyboard shortcuts for smooth presentations
7. **Fullscreen**: Press F for immersive presentation mode
8. **Mobile**: Works great on tablets for field presentations

---

## Troubleshooting

**Issue**: Photos not uploading
- Check file size (should be < 10MB)
- Verify image format (JPG, PNG, HEIC)
- Check browser console for errors

**Issue**: AI analysis fails
- Verify Gemini API key is configured
- Check network connection
- Review API quota limits

**Issue**: Presentation won't enter fullscreen
- Some browsers require user gesture
- Check browser permissions
- Try clicking fullscreen button instead of F key

---

## License

Part of Gemini Field Assistant - Roof-ER21 Projects

---

**Built with:**
- React 19 + TypeScript
- Google Gemini AI
- Tailwind CSS
- Lucide Icons
- Love for roofing professionals
