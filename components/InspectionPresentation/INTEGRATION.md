# Integration Guide - Inspection Presentation

How to integrate the Inspection Presentation feature into Gemini Field Assistant.

## Quick Start (5 minutes)

### Step 1: Add to Sidebar Navigation

Edit `/Users/a21/gemini-field-assistant/components/Sidebar.tsx`

```tsx
import { Presentation } from 'lucide-react'; // Add to imports

// Add to navigation items array
const navigationItems = [
  // ... existing items
  {
    id: 'inspection-presentation',
    label: 'Inspection Presentation',
    icon: Presentation,
    description: 'Create AI-powered inspection presentations'
  },
  // ... rest of items
];
```

### Step 2: Add to Main App Router

Edit your main app component (likely `App.tsx` or `AdminPanel.tsx`)

```tsx
import InspectionPresentationPanel from './components/InspectionPresentationPanel';

// In your panel/tab switching logic
{activePanel === 'inspection-presentation' && (
  <InspectionPresentationPanel />
)}
```

### Step 3: Test It Out

```bash
cd /Users/a21/gemini-field-assistant
npm run dev
```

Navigate to the new "Inspection Presentation" panel and upload photos!

---

## Full Integration Example

### Option 1: As a Full Panel (Recommended)

```tsx
// App.tsx or AdminPanel.tsx
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import InspectionPresentationPanel from './components/InspectionPresentationPanel';

function App() {
  const [activePanel, setActivePanel] = useState('home');

  return (
    <div className="flex h-screen">
      <Sidebar
        activePanel={activePanel}
        onPanelChange={setActivePanel}
      />
      <main className="flex-1">
        {activePanel === 'home' && <HomePage />}
        {activePanel === 'chat' && <ChatPanel />}
        {activePanel === 'inspection-presentation' && (
          <InspectionPresentationPanel />
        )}
      </main>
    </div>
  );
}
```

### Option 2: As a Modal/Popup

```tsx
import React, { useState } from 'react';
import { Button } from './components/ui/button';
import InspectionPresenter from './components/InspectionPresenter';
import { generatePresentation } from './utils/inspectionHelpers';

function SomeComponent() {
  const [showPresentation, setShowPresentation] = useState(false);
  const [slides, setSlides] = useState([]);

  const handleCreatePresentation = async () => {
    const generatedSlides = await generatePresentation(photos);
    setSlides(generatedSlides);
    setShowPresentation(true);
  };

  return (
    <>
      <Button onClick={handleCreatePresentation}>
        Create Presentation
      </Button>

      {showPresentation && (
        <InspectionPresenter
          slides={slides}
          onClose={() => setShowPresentation(false)}
          propertyAddress="123 Main St"
          inspectorName="John Doe"
        />
      )}
    </>
  );
}
```

### Option 3: Integrate into Existing Image Panel

Edit `/Users/a21/gemini-field-assistant/components/ImageAnalysisPanel.tsx`

```tsx
import { useState } from 'react';
import { Button } from './ui/button';
import InspectionPresenter from './InspectionPresenter';

// Add to existing ImageAnalysisPanel component
function ImageAnalysisPanel() {
  const [showPresentation, setShowPresentation] = useState(false);
  const [presentationSlides, setPresentationSlides] = useState([]);

  // ... existing image analysis code

  const createPresentation = () => {
    // Convert analyzed images to presentation slides
    const slides = analyzedImages.map((img, idx) => ({
      id: `slide-${idx}`,
      type: 'photo',
      photo: img.url,
      analysis: img.analysis,
      title: `Finding #${idx + 1}`,
      order: idx
    }));

    setPresentationSlides(slides);
    setShowPresentation(true);
  };

  return (
    <>
      {/* Existing image analysis UI */}
      <Button onClick={createPresentation}>
        Create Presentation from Images
      </Button>

      {showPresentation && (
        <InspectionPresenter
          slides={presentationSlides}
          onClose={() => setShowPresentation(false)}
        />
      )}
    </>
  );
}
```

---

## Database Integration (Optional)

To save presentations to the database:

### 1. Create Database Migration

```sql
-- Add to your migrations
CREATE TABLE IF NOT EXISTS inspection_presentations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  property_address TEXT,
  inspector_name TEXT,
  slides JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_presentations_user ON inspection_presentations(user_id);
CREATE INDEX idx_presentations_created ON inspection_presentations(created_at DESC);
```

### 2. Create Server Endpoint

```typescript
// server/routes/presentations.ts
import express from 'express';
import { pool } from '../db';

const router = express.Router();

// Save presentation
router.post('/api/presentations', async (req, res) => {
  const { propertyAddress, inspectorName, slides } = req.body;
  const userId = req.user.id; // from auth middleware

  const result = await pool.query(
    `INSERT INTO inspection_presentations
     (id, user_id, property_address, inspector_name, slides)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      `pres_${Date.now()}`,
      userId,
      propertyAddress,
      inspectorName,
      JSON.stringify(slides)
    ]
  );

  res.json(result.rows[0]);
});

// Get user's presentations
router.get('/api/presentations', async (req, res) => {
  const userId = req.user.id;

  const result = await pool.query(
    `SELECT * FROM inspection_presentations
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  res.json(result.rows);
});

// Get single presentation
router.get('/api/presentations/:id', async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `SELECT * FROM inspection_presentations
     WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Presentation not found' });
  }

  res.json(result.rows[0]);
});

export default router;
```

### 3. Create Service

```typescript
// services/presentationService.ts
export const presentationService = {
  async savePresentation(data: {
    propertyAddress: string;
    inspectorName: string;
    slides: PresentationSlide[];
  }) {
    const response = await fetch('/api/presentations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  },

  async getMyPresentations() {
    const response = await fetch('/api/presentations');
    return response.json();
  },

  async getPresentation(id: string) {
    const response = await fetch(`/api/presentations/${id}`);
    return response.json();
  }
};
```

### 4. Add Save Button to Generator

```tsx
// In PresentationGenerator.tsx
import { presentationService } from '../services/presentationService';

const handleSave = async () => {
  await presentationService.savePresentation({
    propertyAddress,
    inspectorName,
    slides
  });
  alert('Presentation saved!');
};

// Add button in UI
<Button onClick={handleSave}>
  <Save className="w-4 h-4 mr-2" />
  Save Presentation
</Button>
```

---

## API Key Configuration

Ensure Gemini API key is configured:

```bash
# Railway
railway variables set GEMINI_API_KEY=your_api_key_here

# Local .env
echo "GEMINI_API_KEY=your_api_key_here" >> .env
```

---

## Mobile Optimization

For mobile field use, add responsive breakpoints:

```tsx
// InspectionPresentationPanel.tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Responsive step indicators */}
</div>
```

The components are already mobile-friendly, but you may want to:

1. **Add touch gestures** for presentation navigation
2. **Optimize photo upload** for mobile cameras
3. **Add offline support** with service workers
4. **Cache analyzed photos** in localStorage

---

## Performance Optimization

### 1. Lazy Load Components

```tsx
import { lazy, Suspense } from 'react';

const InspectionPresentationPanel = lazy(() =>
  import('./components/InspectionPresentationPanel')
);

// In render
<Suspense fallback={<LoadingSpinner />}>
  <InspectionPresentationPanel />
</Suspense>
```

### 2. Image Compression

```typescript
// Before uploading to AI
const compressImage = async (file: File): Promise<File> => {
  // Use browser canvas to compress
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();

  return new Promise((resolve) => {
    img.onload = () => {
      // Resize to max 1920x1080
      const maxWidth = 1920;
      const maxHeight = 1080;
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        resolve(new File([blob!], file.name, { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.8);
    };

    img.src = URL.createObjectURL(file);
  });
};
```

---

## Testing

### Manual Testing Checklist

- [ ] Upload single photo
- [ ] Upload multiple photos (5+)
- [ ] Drag and drop photos
- [ ] Photo analysis completes
- [ ] View analysis cards
- [ ] Generate presentation
- [ ] Reorder slides
- [ ] Edit slide content
- [ ] Preview presentation
- [ ] Full presentation mode
- [ ] Keyboard navigation works
- [ ] Fullscreen mode works
- [ ] Susan chat responds
- [ ] Mobile responsive
- [ ] Works offline (cached data)

### Test Data

```typescript
// Mock analyzed photo for testing
const mockPhoto = {
  id: 'test-1',
  preview: 'data:image/jpeg;base64,...',
  analysis: {
    damageType: 'Hail damage',
    severity: 'severe',
    location: 'South-facing slope',
    description: 'Multiple impact points visible across shingle surface...',
    recommendations: [
      'Immediate temporary repairs to prevent water intrusion',
      'Full roof replacement recommended',
      'Document all damage for insurance claim'
    ],
    insuranceRelevant: true,
    estimatedRepairCost: '$8,000 - $12,000',
    urgency: 'high'
  }
};
```

---

## Production Deployment

### Railway Deployment

```bash
cd /Users/a21/gemini-field-assistant

# Ensure all files are committed
git add .
git commit -m "Add inspection presentation feature"

# Push to Railway
git push origin main

# Railway auto-deploys
```

### Environment Variables Checklist

- [x] GEMINI_API_KEY
- [x] DATABASE_URL
- [x] NODE_ENV=production

---

## Support & Troubleshooting

**Common Issues:**

1. **Photos not analyzing**: Check Gemini API key and quota
2. **Slow upload**: Implement image compression
3. **Presentation not fullscreen**: Browser security restrictions
4. **Mobile camera issues**: Check HTTPS requirement

**Debug Mode:**

```tsx
// Enable console logging
const DEBUG = true;

if (DEBUG) {
  console.log('Photo uploaded:', photo);
  console.log('AI analysis:', analysis);
  console.log('Slides generated:', slides);
}
```

---

## Next Steps

1. ✅ Add to sidebar navigation
2. ✅ Test photo upload and analysis
3. ✅ Create first presentation
4. [ ] Add database persistence
5. [ ] Enable PDF export
6. [ ] Add email sharing
7. [ ] Create presentation templates
8. [ ] Add team collaboration

---

**Ready to go!** The components are production-ready and follow all Gemini Field Assistant patterns.

For questions or issues, check the main README.md or component source code.
