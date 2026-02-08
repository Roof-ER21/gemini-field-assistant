# Inspection Presentation API Documentation

Complete API for managing roof inspections, photos, AI analysis, and presentation generation in the Gemini Field Assistant.

## Overview

The Inspection Presentation API provides endpoints for:
1. Creating and managing roof inspections
2. Uploading and storing inspection photos (base64)
3. Running AI analysis on photos using Gemini Vision
4. Generating professional presentations from inspections
5. Sharing presentations with customers via public links

## Base URL

```
http://localhost:5000/api
```

## Authentication

All endpoints except `/api/present/:token` require authentication via `x-user-email` header:

```
x-user-email: user@example.com
```

---

## Endpoints

### 1. Create Inspection

**POST** `/api/inspections`

Create a new roof inspection.

**Request Body:**
```json
{
  "job_id": "optional-uuid",
  "property_address": "123 Main St, Baltimore, MD 21201",
  "customer_name": "John Doe",
  "inspection_date": "2024-02-08T10:00:00Z",
  "inspector_notes": "Initial inspection notes",
  "weather_conditions": "Sunny, 65F",
  "roof_type": "Asphalt Shingle",
  "roof_age": 15
}
```

**Required Fields:**
- `property_address` (string)
- `customer_name` (string)

**Response:**
```json
{
  "inspection": {
    "id": "uuid",
    "user_id": "uuid",
    "job_id": "uuid or null",
    "property_address": "123 Main St, Baltimore, MD 21201",
    "customer_name": "John Doe",
    "inspection_date": "2024-02-08T10:00:00Z",
    "inspector_notes": "Initial inspection notes",
    "weather_conditions": "Sunny, 65F",
    "roof_type": "Asphalt Shingle",
    "roof_age": 15,
    "status": "draft",
    "photo_count": 0,
    "analyzed_photo_count": 0,
    "created_at": "2024-02-08T10:00:00Z",
    "updated_at": "2024-02-08T10:00:00Z"
  }
}
```

**Status Codes:**
- `201` - Created
- `400` - Validation error
- `401` - Unauthorized
- `404` - User not found

---

### 2. Get Inspection

**GET** `/api/inspections/:id`

Get inspection details.

**Response:**
```json
{
  "inspection": {
    "id": "uuid",
    "user_id": "uuid",
    "property_address": "123 Main St",
    "customer_name": "John Doe",
    "status": "completed",
    "photo_count": 5,
    "analyzed_photo_count": 5,
    ...
  }
}
```

**Status Codes:**
- `200` - OK
- `401` - Unauthorized
- `403` - Access denied
- `404` - Not found

---

### 3. Upload Photo

**POST** `/api/inspections/:id/photos`

Upload a photo to an inspection (accepts base64 encoded images).

**Request Body:**
```json
{
  "photo_data": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "file_name": "roof_damage_1.jpg",
  "file_size": 524288,
  "mime_type": "image/jpeg",
  "category": "damage",
  "notes": "Visible wind damage on north-facing slope"
}
```

**Photo Categories:**
- `damage` - Damage photos
- `overview` - Full roof overview
- `detail` - Close-up detail shots
- `measurements` - Measurement photos
- `other` - Other photos

**Required Fields:**
- `photo_data` (string, base64)

**Response:**
```json
{
  "photo": {
    "id": "uuid",
    "inspection_id": "uuid",
    "photo_data": "base64...",
    "file_name": "roof_damage_1.jpg",
    "file_size": 524288,
    "mime_type": "image/jpeg",
    "category": "damage",
    "notes": "Visible wind damage",
    "ai_analysis": null,
    "analyzed_at": null,
    "created_at": "2024-02-08T10:00:00Z"
  }
}
```

**Status Codes:**
- `201` - Created
- `400` - Validation error
- `401` - Unauthorized
- `403` - Access denied
- `404` - Inspection not found

**Notes:**
- Photo count is automatically incremented
- Inspection status changes from `draft` to `in_progress` on first photo upload

---

### 4. List Photos

**GET** `/api/inspections/:id/photos`

Get all photos for an inspection.

**Response:**
```json
{
  "photos": [
    {
      "id": "uuid",
      "inspection_id": "uuid",
      "file_name": "roof_damage_1.jpg",
      "file_size": 524288,
      "mime_type": "image/jpeg",
      "category": "damage",
      "notes": "Visible wind damage",
      "ai_analysis": {
        "damageDetected": true,
        "damageType": ["wind", "impact"],
        "severity": "moderate",
        ...
      },
      "analyzed_at": "2024-02-08T10:05:00Z",
      "created_at": "2024-02-08T10:00:00Z",
      "photo_data": "base64..."
    }
  ]
}
```

**Status Codes:**
- `200` - OK
- `401` - Unauthorized
- `403` - Access denied
- `404` - Inspection not found

---

### 5. Analyze Photos

**POST** `/api/inspections/:id/analyze`

Run AI analysis on all unanalyzed photos using Gemini Vision API.

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "message": "Successfully analyzed 5 photos",
  "analyzed_count": 5
}
```

**AI Analysis Structure:**
```json
{
  "damageDetected": true,
  "damageType": ["wind", "hail"],
  "severity": "moderate",
  "affectedArea": "North slope, approximately 200 sq ft",
  "estimatedSize": "200 sq ft or 15% of total roof area",
  "claimViability": "strong",
  "policyLanguage": "The covered peril of wind has caused shingle damage requiring replacement",
  "insuranceArguments": [
    "Shingles are discontinued per manufacturer - IRC R908.3 requires matching",
    "Wind damage visible across multiple sections",
    "Safety hazard due to exposed underlayment"
  ],
  "recommendations": [
    "Document shingle manufacturer and model",
    "Photograph all affected areas",
    "Get weather report from date of storm"
  ],
  "followUpQuestions": [
    "What year was the roof installed?",
    "Do you have the shingle wrapper?",
    "When did the storm occur?"
  ],
  "urgency": "high",
  "confidence": 85,
  "detailedAnalysis": "Detailed insurance-focused analysis..."
}
```

**Status Codes:**
- `200` - OK
- `401` - Unauthorized
- `403` - Access denied
- `404` - Inspection not found
- `500` - Gemini API error

**Notes:**
- Only analyzes photos that haven't been analyzed yet
- Updates `analyzed_photo_count` automatically
- Changes inspection status to `completed`
- Analysis is stored in `ai_analysis` JSONB field

---

### 6. Generate Presentation

**POST** `/api/presentations`

Generate a professional presentation from an inspection.

**Request Body:**
```json
{
  "inspection_id": "uuid",
  "title": "Roof Inspection Report - John Doe",
  "presentation_type": "insurance",
  "branding": {
    "logo_url": "https://example.com/logo.png",
    "company_name": "Roof-ER",
    "contact_info": "555-1234 | info@roofer.com"
  }
}
```

**Presentation Types:**
- `standard` - Standard presentation
- `insurance` - Insurance-focused presentation
- `detailed` - Detailed technical presentation

**Required Fields:**
- `inspection_id` (uuid)

**Response:**
```json
{
  "presentation": {
    "id": "uuid",
    "inspection_id": "uuid",
    "user_id": "uuid",
    "title": "Roof Inspection Report - John Doe",
    "customer_name": "John Doe",
    "property_address": "123 Main St",
    "presentation_type": "insurance",
    "slides": [
      {
        "id": "slide-1",
        "slide_number": 1,
        "slide_type": "cover",
        "title": "Roof Inspection Report - John Doe",
        "content": "Property: 123 Main St\nInspection Date: 2/8/2024",
        "layout": "text-only"
      },
      {
        "id": "slide-2",
        "slide_number": 2,
        "slide_type": "photo",
        "title": "Photo Damage",
        "content": "Visible wind damage",
        "photo_id": "uuid",
        "photo_url": "data:image/jpeg;base64,...",
        "ai_insights": { ... },
        "layout": "split"
      },
      ...
    ],
    "branding": {
      "logo_url": "https://example.com/logo.png",
      "company_name": "Roof-ER",
      "contact_info": "555-1234"
    },
    "share_token": null,
    "is_public": false,
    "view_count": 0,
    "status": "draft",
    "created_at": "2024-02-08T10:10:00Z",
    "updated_at": "2024-02-08T10:10:00Z"
  }
}
```

**Slide Types:**
- `cover` - Cover slide
- `photo` - Photo slide
- `analysis` - AI analysis slide
- `summary` - Summary slide
- `recommendations` - Recommendations slide
- `contact` - Contact information slide

**Slide Layouts:**
- `full-image` - Full-screen image
- `split` - Image + text split
- `grid` - Grid layout
- `text-only` - Text only

**Status Codes:**
- `201` - Created
- `400` - Validation error
- `401` - Unauthorized
- `403` - Access denied
- `404` - Inspection not found

---

### 7. Get Presentation

**GET** `/api/presentations/:id`

Get presentation with all slides.

**Response:**
```json
{
  "presentation": {
    "id": "uuid",
    "inspection_id": "uuid",
    "title": "Roof Inspection Report",
    "slides": [...],
    "branding": {...},
    ...
  }
}
```

**Status Codes:**
- `200` - OK
- `401` - Unauthorized
- `403` - Access denied
- `404` - Not found

---

### 8. Update Presentation

**PUT** `/api/presentations/:id`

Update presentation details or slides.

**Request Body:**
```json
{
  "title": "Updated Title",
  "presentation_type": "detailed",
  "slides": [...],
  "branding": {...},
  "status": "ready"
}
```

**Response:**
```json
{
  "presentation": {
    "id": "uuid",
    "title": "Updated Title",
    "status": "ready",
    ...
  }
}
```

**Status Codes:**
- `200` - OK
- `401` - Unauthorized
- `403` - Access denied
- `404` - Not found

---

### 9. Share Presentation

**POST** `/api/presentations/:id/share`

Generate a public share link for the presentation.

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "share_url": "https://example.com/api/present/abc123xyz456",
  "share_token": "abc123xyz456"
}
```

**Status Codes:**
- `200` - OK
- `401` - Unauthorized
- `403` - Access denied
- `404` - Not found

**Notes:**
- Generates a unique share token if one doesn't exist
- Sets `is_public` to `true`
- Changes status to `shared`
- Token can be used in public viewer endpoint

---

### 10. Public Presentation Viewer

**GET** `/api/present/:token`

**No authentication required** - Public endpoint for viewing shared presentations.

**Response:**
```json
{
  "presentation": {
    "id": "uuid",
    "title": "Roof Inspection Report",
    "customer_name": "John Doe",
    "property_address": "123 Main St",
    "slides": [...],
    "branding": {...},
    "view_count": 42,
    ...
  }
}
```

**Status Codes:**
- `200` - OK
- `404` - Not found or not public

**Notes:**
- Automatically increments `view_count`
- Only returns presentations where `is_public` is `true`
- No user authentication required

---

## Database Schema

### inspections table
```sql
CREATE TABLE inspections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  job_id UUID REFERENCES jobs(id),
  property_address TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  inspection_date TIMESTAMPTZ DEFAULT NOW(),
  inspector_notes TEXT,
  weather_conditions TEXT,
  roof_type TEXT,
  roof_age INTEGER,
  status TEXT CHECK (status IN ('draft', 'in_progress', 'completed', 'presented')),
  photo_count INTEGER DEFAULT 0,
  analyzed_photo_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### inspection_photos table
```sql
CREATE TABLE inspection_photos (
  id UUID PRIMARY KEY,
  inspection_id UUID REFERENCES inspections(id),
  photo_data TEXT, -- base64
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  category TEXT CHECK (category IN ('damage', 'overview', 'detail', 'measurements', 'other')),
  notes TEXT,
  ai_analysis JSONB,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### presentations table
```sql
CREATE TABLE presentations (
  id UUID PRIMARY KEY,
  inspection_id UUID REFERENCES inspections(id),
  user_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  customer_name TEXT,
  property_address TEXT,
  presentation_type TEXT CHECK (presentation_type IN ('standard', 'insurance', 'detailed')),
  slides JSONB,
  branding JSONB,
  share_token TEXT UNIQUE,
  is_public BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  status TEXT CHECK (status IN ('draft', 'ready', 'shared')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Example Workflow

### Complete Inspection to Presentation Flow

```javascript
// 1. Create inspection
const inspection = await fetch('/api/inspections', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-email': 'contractor@example.com'
  },
  body: JSON.stringify({
    property_address: '123 Main St, Baltimore, MD',
    customer_name: 'John Doe',
    roof_type: 'Asphalt Shingle',
    roof_age: 15
  })
});
const { inspection: { id: inspectionId } } = await inspection.json();

// 2. Upload photos
for (const photo of photos) {
  await fetch(`/api/inspections/${inspectionId}/photos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': 'contractor@example.com'
    },
    body: JSON.stringify({
      photo_data: photo.base64,
      file_name: photo.name,
      category: 'damage',
      notes: 'Visible damage'
    })
  });
}

// 3. Analyze photos with AI
await fetch(`/api/inspections/${inspectionId}/analyze`, {
  method: 'POST',
  headers: {
    'x-user-email': 'contractor@example.com'
  }
});

// 4. Generate presentation
const presentation = await fetch('/api/presentations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-email': 'contractor@example.com'
  },
  body: JSON.stringify({
    inspection_id: inspectionId,
    title: 'Roof Inspection Report - John Doe',
    presentation_type: 'insurance',
    branding: {
      company_name: 'Roof-ER',
      contact_info: '555-1234'
    }
  })
});
const { presentation: { id: presentationId } } = await presentation.json();

// 5. Share with customer
const share = await fetch(`/api/presentations/${presentationId}/share`, {
  method: 'POST',
  headers: {
    'x-user-email': 'contractor@example.com'
  }
});
const { share_url } = await share.json();

// 6. Customer views (no auth needed)
// Send share_url to customer
// Customer visits: https://example.com/api/present/abc123xyz456
```

---

## Error Handling

All endpoints return standard error responses:

```json
{
  "error": "Error message description"
}
```

Common error scenarios:
- Missing authentication: `401 Unauthorized`
- Access denied: `403 Forbidden`
- Resource not found: `404 Not Found`
- Validation error: `400 Bad Request`
- Server error: `500 Internal Server Error`

---

## Migration

Run the database migration to create/update tables:

```bash
psql $DATABASE_URL -f database/migrations/051_enhance_inspections_presentations.sql
```

---

## Configuration

Ensure `GEMINI_API_KEY` is set in environment variables:

```bash
export GEMINI_API_KEY=your_gemini_api_key
```

---

## Rate Limiting

API endpoints are subject to standard rate limiting (configured in server/index.ts).

---

## Future Enhancements

Potential future features:
- PDF export of presentations
- Email delivery of presentations
- Webhook notifications for analysis completion
- Batch photo upload
- Video support
- Custom slide templates
- Presentation analytics (time spent per slide)
- Customer feedback/comments on presentations

---

## Support

For issues or questions, contact the development team or refer to the main Gemini Field Assistant documentation.
