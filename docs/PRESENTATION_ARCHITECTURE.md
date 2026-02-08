# Presentation System Architecture

## System Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRESENTATION SYSTEM                              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 1. CREATION PHASE (Authenticated Users)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Inspector → Inspection Panel → Photos Uploaded → AI Analysis           │
│                                        ↓                                 │
│                              Gemini Vision API                           │
│                                        ↓                                 │
│                            AI Insights Generated                         │
│                                        ↓                                 │
│                          Inspection Completed                            │
│                                        ↓                                 │
│                   "Generate Presentation" Button                         │
│                                        ↓                                 │
│                      POST /api/presentations                             │
│                                        ↓                                 │
│              Presentation Record Created (with slides)                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 2. SHARING PHASE (Authenticated Users)                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Inspector → "Share Presentation" Button                                │
│                         ↓                                                │
│           POST /api/presentations/:id/share                              │
│                         ↓                                                │
│              Share Token Generated (random 20+ chars)                    │
│              Presentation marked as is_public: true                      │
│                         ↓                                                │
│              Share URL Returned                                          │
│              Example: /present/abc123xyz789                              │
│                         ↓                                                │
│         Copy link, send via email/SMS/etc                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 3. VIEWING PHASE (Public Access - No Auth Required)                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Homeowner/Client clicks link → /present/:token                         │
│                                     ↓                                    │
│                    present.html loads                                    │
│                         ↓                                                │
│           PresentationViewer.tsx mounts                                  │
│                         ↓                                                │
│           GET /api/present/:token                                        │
│                         ↓                                                │
│         Server validates token & is_public                               │
│         Increments view_count                                            │
│                         ↓                                                │
│         Returns presentation with slides                                 │
│                         ↓                                                │
│    PresentationViewer converts API format                                │
│          to InspectionPresenterV2 format                                 │
│                         ↓                                                │
│      InspectionPresenterV2 renders presentation                          │
│                         ↓                                                │
│    ┌─────────────────────────────────────┐                              │
│    │  VIEWER SEES:                       │                              │
│    │  - Professional slide show          │                              │
│    │  - Photo analysis with AI insights  │                              │
│    │  - Navigation controls              │                              │
│    │  - Progress bar                     │                              │
│    │  - Susan AI sidebar                 │                              │
│    └─────────────────────────────────────┘                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 4. SUSAN AI INTERACTION (During Viewing)                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Viewer → Clicks "Ask Susan AI" or types question                       │
│                         ↓                                                │
│            POST /api/susan/chat                                          │
│       (with slide context, question)                                     │
│                         ↓                                                │
│      Server routes to Gemini API with context:                           │
│      - Current slide details                                             │
│      - Damage type, severity                                             │
│      - Insurance relevance                                               │
│      - Property address                                                  │
│      - Recent conversation history                                       │
│                         ↓                                                │
│         Gemini generates insurance-focused                               │
│         response as "Susan" persona                                      │
│                         ↓                                                │
│     Response returned to SusanAISidebar                                  │
│                         ↓                                                │
│       Viewer sees helpful answer                                         │
│                                                                          │
│   ┌──────────────────────────────────────┐                              │
│   │  SUSAN AI CAPABILITIES:              │                              │
│   │  - Explain findings in plain English │                              │
│   │  - Insurance coverage guidance       │                              │
│   │  - Urgency assessment                │                              │
│   │  - Next steps recommendations        │                              │
│   │  - Claim process explanation         │                              │
│   │  - Context-aware responses           │                              │
│   └──────────────────────────────────────┘                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        COMPONENT HIERARCHY                               │
└─────────────────────────────────────────────────────────────────────────┘

present.html (Entry Point)
    ↓
PresentationViewer.tsx (Container)
    ├── Data Fetching (GET /api/present/:token)
    ├── Format Conversion (API → Presenter format)
    └── Render InspectionPresenterV2
            ↓
    InspectionPresenterV2.tsx (Main Presenter)
        ├── Header
        │   ├── Close button (hidden in public view)
        │   ├── Progress bar
        │   ├── Auto-play toggle
        │   ├── Sidebar toggle
        │   ├── Fullscreen toggle
        │   └── Share button (hidden in public view)
        │
        ├── Main Content Area
        │   ├── Slide Content (dynamic based on type)
        │   │   ├── Cover Slide
        │   │   ├── Rep Profile Slide
        │   │   ├── Photo Analysis Slide
        │   │   ├── Summary Slide
        │   │   ├── Recommendations Slide
        │   │   └── CTA Slide
        │   │
        │   ├── Navigation Arrows (left/right)
        │   └── Keyboard Event Handlers
        │
        ├── Bottom Navigation
        │   └── Slide Thumbnails (clickable)
        │
        └── SusanAISidebar (Conditional)
            ├── Header (Susan profile)
            ├── Context Display (current slide info)
            ├── Message History
            ├── Quick Action Buttons
            ├── Input Field
            └── AI Integration (POST /api/susan/chat)
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA TRANSFORMATION                             │
└─────────────────────────────────────────────────────────────────────────┘

API Response Format (from /api/present/:token):
{
  presentation: {
    id: string
    inspection_id: string
    customer_name: string
    property_address: string
    slides: [
      {
        id: string
        slide_type: 'cover' | 'photo' | 'analysis' | 'summary' | ...
        title: string
        content: string
        photo_url?: string (base64 data URL)
        ai_insights?: {
          damageDetected: boolean
          damageType: string[]
          severity: string
          affectedArea: string
          insuranceArguments: string[]
          recommendations: string[]
          ...
        }
      }
    ]
  }
}

                        ↓ (convertSlidesToPresenterFormat)

InspectionPresenterV2 Format:
{
  slides: [
    {
      id: string
      type: 'cover' | 'rep_profile' | 'photo' | 'summary' | ...
      title: string
      content?: string
      photoBase64?: string
      analysis?: {
        damageType: string
        severity: 'minor' | 'moderate' | 'severe' | 'critical'
        location: string
        description: string
        recommendations: string[]
        insuranceRelevant: boolean
        urgency: 'low' | 'medium' | 'high' | 'critical'
      }
      order: number
    }
  ]
  propertyAddress: string
  homeownerName: string
  jobId: string
}
```

## Database Schema (Relevant Tables)

```sql
-- Inspections
CREATE TABLE inspections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  property_address TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  inspection_date TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'draft',
  photo_count INTEGER DEFAULT 0,
  analyzed_photo_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inspection Photos
CREATE TABLE inspection_photos (
  id UUID PRIMARY KEY,
  inspection_id UUID NOT NULL REFERENCES inspections(id),
  photo_data TEXT,  -- base64 encoded
  category TEXT DEFAULT 'other',
  ai_analysis JSONB,  -- AI insights stored here
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Presentations
CREATE TABLE presentations (
  id UUID PRIMARY KEY,
  inspection_id UUID NOT NULL REFERENCES inspections(id),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  property_address TEXT NOT NULL,
  presentation_type TEXT DEFAULT 'standard',
  slides JSONB DEFAULT '[]'::jsonb,  -- Full slide data
  branding JSONB,
  share_token TEXT UNIQUE,  -- For public sharing
  is_public BOOLEAN DEFAULT false,  -- Must be true for /present/:token
  view_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_inspections_user_id ON inspections(user_id);
CREATE INDEX idx_inspection_photos_inspection_id ON inspection_photos(inspection_id);
CREATE INDEX idx_presentations_inspection_id ON presentations(inspection_id);
CREATE INDEX idx_presentations_share_token ON presentations(share_token) WHERE share_token IS NOT NULL;
```

## Security Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SECURITY LAYERS                                 │
└─────────────────────────────────────────────────────────────────────────┘

Layer 1: Authentication (Creation/Editing)
    ├── User must be logged in
    ├── x-user-email header required
    ├── User must own the inspection
    └── Admin users can access all

Layer 2: Authorization (Sharing)
    ├── Only owner can generate share token
    ├── Must explicitly mark as is_public: true
    └── Share token is long random string (20+ chars)

Layer 3: Public Access (Viewing)
    ├── No authentication required
    ├── Token validation server-side
    ├── Must have valid share_token
    ├── Must be marked is_public: true
    ├── View count incremented automatically
    └── Anonymous analytics tracking

Layer 4: Data Protection
    ├── No PII in analytics logs
    ├── Photos are base64 (not external URLs)
    ├── Susan AI responses don't log sensitive data
    └── Rate limiting on AI requests (10/hour per user during creation)
```

## Performance Considerations

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PERFORMANCE OPTIMIZATIONS                         │
└─────────────────────────────────────────────────────────────────────────┘

Frontend:
  ├── Vite code-splitting (separate present.js bundle)
  ├── React component memoization
  ├── Lazy loading of InspectionPresenterV2
  ├── CSS optimizations (Tailwind purge)
  └── Gzip compression enabled

Backend:
  ├── Database indexes on share_token
  ├── JSONB for efficient slide storage
  ├── Connection pooling (PostgreSQL)
  ├── Rate limiting on expensive operations
  └── Caching of AI responses (future enhancement)

Media:
  ├── Photos stored as base64 (no external requests)
  ├── Image quality optimization (during upload)
  ├── Lazy loading of slide images
  └── Progressive loading of thumbnails

AI:
  ├── Fallback responses when API unavailable
  ├── Context trimming (last 6 messages)
  ├── Response caching (future enhancement)
  └── Streaming responses (future enhancement)
```

## Monitoring & Analytics

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     TRACKABLE METRICS                                    │
└─────────────────────────────────────────────────────────────────────────┘

Presentation Level:
  ├── View count (automatic increment)
  ├── Unique viewers (via analytics API)
  ├── Average view duration
  ├── Slide completion rate
  └── Susan AI engagement rate

Slide Level:
  ├── Time spent per slide
  ├── Skip rate
  ├── Re-visit rate
  └── Susan AI questions per slide

Susan AI:
  ├── Total questions asked
  ├── Response time
  ├── Fallback vs API responses
  ├── Quick action usage
  └── Most common question types

System Health:
  ├── API response times
  ├── Error rates
  ├── Susan AI availability
  └── Database query performance
```

---

**Architecture Version:** 2.0
**Last Updated:** February 8, 2025
**Status:** Production Ready
