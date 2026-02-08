# Inspection Presentation API Reference

Complete API documentation for the inspection and presentation endpoints in Gemini Field Assistant.

## 🔑 Authentication

All endpoints require authentication via Bearer token in the Authorization header, except public viewer endpoints.

```
Authorization: Bearer <your-jwt-token>
```

## 📊 Base URL

```
Development: http://localhost:8080/api
Production: https://your-domain.com/api
```

---

## Inspection Endpoints

### 1. Create Inspection

Create a new roof inspection record.

**Endpoint:** `POST /api/inspections`

**Request Body:**
```json
{
  "job_id": "uuid",                    // Required: Link to existing job
  "property_address": "string",        // Required
  "property_city": "string",           // Required
  "property_state": "string",          // Required (2 chars)
  "property_zip": "string",            // Optional
  "property_type": "residential",      // Optional: residential | commercial | multi-family
  "inspection_date": "2024-02-08T10:00:00Z", // Required: ISO 8601
  "inspector_name": "string",          // Required
  "weather_conditions": "clear",       // Optional
  "roof_type": "asphalt shingle",      // Optional
  "roof_age": 15,                      // Optional: years
  "inspector_notes": "string"          // Optional
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "inspection": {
    "id": "uuid",
    "job_id": "uuid",
    "user_id": "uuid",
    "property_address": "string",
    "inspection_status": "scheduled",
    "created_at": "2024-02-08T10:00:00Z",
    ...
  }
}
```

---

### 2. Get Inspection Details

Retrieve a specific inspection with all photos and analysis.

**Endpoint:** `GET /api/inspections/:id`

**Response:** `200 OK`
```json
{
  "inspection": {
    "id": "uuid",
    "property_address": "string",
    "inspection_status": "completed",
    "photo_count": 15,
    "analyzed_photo_count": 12,
    ...
  },
  "photos": [
    {
      "id": "uuid",
      "photo_url": "/uploads/...",
      "category": "damage",
      "damage_severity": "moderate",
      "ai_analysis": {
        "damage_detected": true,
        "confidence": 0.85,
        "categories": ["hail_damage"],
        ...
      }
    }
  ]
}
```

---

### 3. Upload Inspection Photos

Add photos to an existing inspection. Supports multiple files.

**Endpoint:** `POST /api/inspections/:id/photos`

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `photos[]` - Array of image files (max 20)
- `category` - Optional: damage | overview | detail | measurements | other
- `notes` - Optional: Text description

**Request (multipart/form-data):**
```
photos[]: <binary file data>
photos[]: <binary file data>
category: damage
notes: Hail damage on north side of roof
```

**Response:** `201 Created`
```json
{
  "success": true,
  "uploaded": 2,
  "photos": [
    {
      "id": "uuid",
      "photo_url": "/uploads/inspections/1234567890.jpg",
      "file_name": "roof_damage_1.jpg",
      "file_size": 245678,
      "mime_type": "image/jpeg",
      "category": "damage"
    }
  ]
}
```

---

### 4. Get Inspection Photos

Retrieve all photos for a specific inspection.

**Endpoint:** `GET /api/inspections/:id/photos`

**Query Parameters:**
- `category` (optional) - Filter by photo category
- `analyzed` (optional) - true | false - Filter by AI analysis status

**Response:** `200 OK`
```json
{
  "photos": [
    {
      "id": "uuid",
      "photo_url": "/uploads/...",
      "photo_data": "base64...",  // Base64 encoded image
      "category": "damage",
      "damage_severity": "moderate",
      "ai_analysis": { ... },
      "analyzed_at": "2024-02-08T11:00:00Z"
    }
  ]
}
```

---

### 5. Analyze Inspection Photos with AI

Run Google Gemini AI analysis on inspection photos.

**Endpoint:** `POST /api/inspections/:id/analyze`

**Request Body:**
```json
{
  "photo_ids": ["uuid1", "uuid2"],  // Optional: specific photos, or all if omitted
  "analysis_type": "comprehensive"  // Optional: quick | standard | comprehensive
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "analyzed": 5,
  "results": [
    {
      "photo_id": "uuid",
      "damage_detected": true,
      "categories": ["hail_damage", "missing_shingles"],
      "severity": "moderate",
      "confidence": 0.87,
      "recommendations": [
        "Replace damaged shingles in marked area",
        "Check underlayment for water damage"
      ],
      "estimated_repair_cost": "$1,200 - $1,800"
    }
  ]
}
```

---

## Presentation Endpoints

### 6. Create Presentation

Generate a presentation from an inspection.

**Endpoint:** `POST /api/inspections/presentations`

**Request Body:**
```json
{
  "inspection_id": "uuid",           // Required
  "title": "Roof Damage Assessment", // Required
  "description": "string",           // Optional
  "template": "standard",            // Optional: standard | detailed | executive
  "include_photos": true,            // Optional: default true
  "include_ai_analysis": true,       // Optional: default true
  "branding": {                      // Optional
    "company_name": "RoofER21",
    "company_logo": "https://...",
    "contact_email": "contact@roofer21.com",
    "contact_phone": "(555) 123-4567"
  }
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "presentation": {
    "id": "uuid",
    "inspection_id": "uuid",
    "title": "Roof Damage Assessment",
    "status": "generated",
    "share_token": "abc123xyz",
    "public_url": "/api/inspections/present/abc123xyz",
    "created_at": "2024-02-08T12:00:00Z"
  }
}
```

---

### 7. Get Presentation Details

Retrieve a specific presentation (authenticated).

**Endpoint:** `GET /api/inspections/presentations/:id`

**Response:** `200 OK`
```json
{
  "presentation": {
    "id": "uuid",
    "title": "Roof Damage Assessment",
    "description": "Complete analysis of hail damage",
    "status": "sent",
    "share_token": "abc123xyz",
    "public_url": "/api/inspections/present/abc123xyz",
    "view_count": 5,
    "last_viewed_at": "2024-02-08T14:30:00Z",
    "created_at": "2024-02-08T12:00:00Z"
  },
  "inspection": { ... },
  "photos": [ ... ],
  "analysis_summary": {
    "total_photos": 15,
    "damage_detected": 12,
    "severity_breakdown": {
      "minor": 3,
      "moderate": 7,
      "severe": 2
    },
    "estimated_total_cost": "$5,000 - $8,000"
  }
}
```

---

### 8. Share Presentation

Share a presentation with a customer via email or SMS.

**Endpoint:** `POST /api/inspections/presentations/:id/share`

**Request Body:**
```json
{
  "recipient_email": "customer@example.com",  // Required if send_email: true
  "recipient_phone": "+15551234567",          // Optional: for SMS
  "recipient_name": "Jane Smith",             // Required
  "send_email": true,                         // Optional: default true
  "send_sms": false,                          // Optional: default false
  "message": "string",                        // Optional: custom message
  "expiration_days": 30                       // Optional: default 30
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "shared_with": "customer@example.com",
  "share_token": "abc123xyz",
  "public_url": "/api/inspections/present/abc123xyz",
  "expires_at": "2024-03-08T12:00:00Z",
  "email_sent": true,
  "sms_sent": false
}
```

---

### 9. View Public Presentation (No Auth Required)

Public endpoint for customers to view shared presentations.

**Endpoint:** `GET /api/inspections/present/:token`

**Authentication:** Not required (public access)

**Response:** `200 OK`
```json
{
  "presentation": {
    "title": "Roof Damage Assessment",
    "description": "Complete analysis of hail damage",
    "company": {
      "name": "RoofER21",
      "logo": "https://...",
      "contact": { ... }
    }
  },
  "property": {
    "address": "123 Main St",
    "city": "Richmond",
    "state": "VA"
  },
  "inspection_summary": {
    "date": "2024-02-08",
    "inspector": "John Doe",
    "weather": "Clear"
  },
  "photos": [
    {
      "url": "/uploads/...",
      "category": "damage",
      "severity": "moderate",
      "description": "Hail damage on north side"
    }
  ],
  "damage_summary": {
    "total_damage_areas": 12,
    "severity_breakdown": { ... },
    "recommendations": [ ... ],
    "estimated_cost": "$5,000 - $8,000"
  }
}
```

---

## Error Responses

All endpoints return consistent error responses:

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": [
    "property_address is required",
    "inspection_date must be a valid ISO 8601 date"
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Valid authentication token required"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found",
  "message": "Inspection with id 'uuid' not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

---

## Example cURL Commands

### Create Inspection
```bash
curl -X POST https://api.roofer21.com/api/inspections \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "property_address": "123 Main St",
    "property_city": "Richmond",
    "property_state": "VA",
    "inspection_date": "2024-02-08T10:00:00Z",
    "inspector_name": "John Doe"
  }'
```

### Upload Photos
```bash
curl -X POST https://api.roofer21.com/api/inspections/<id>/photos \
  -H "Authorization: Bearer <token>" \
  -F "photos=@/path/to/photo1.jpg" \
  -F "photos=@/path/to/photo2.jpg" \
  -F "category=damage" \
  -F "notes=Hail damage on north side"
```

### Analyze Photos
```bash
curl -X POST https://api.roofer21.com/api/inspections/<id>/analyze \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "analysis_type": "comprehensive"
  }'
```

### Create Presentation
```bash
curl -X POST https://api.roofer21.com/api/inspections/presentations \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "inspection_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Roof Damage Assessment",
    "description": "Complete analysis of hail damage"
  }'
```

### Share Presentation
```bash
curl -X POST https://api.roofer21.com/api/inspections/presentations/<id>/share \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_email": "customer@example.com",
    "recipient_name": "Jane Smith",
    "send_email": true
  }'
```

### View Public Presentation (No Auth)
```bash
curl https://api.roofer21.com/api/inspections/present/abc123xyz
```

---

## Rate Limits

- Authenticated requests: 100 requests/minute
- Photo uploads: 20 photos per request, 10MB max per file
- AI analysis: 50 requests/hour per user
- Public presentation views: 1000 requests/hour per presentation

---

## Supported File Types

### Photo Uploads
- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)

Maximum file size: 10MB per photo

---

## Webhook Events (Coming Soon)

Subscribe to webhook events for:
- `inspection.created`
- `inspection.photos.uploaded`
- `inspection.analysis.completed`
- `presentation.created`
- `presentation.shared`
- `presentation.viewed`

---

**Last Updated**: February 8, 2026
**API Version**: 1.0.0
**Status**: Production Ready
