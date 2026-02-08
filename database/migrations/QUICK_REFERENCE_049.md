# Quick Reference: Inspection Presentations

## 30-Second Overview

Migration 049 adds **Roof Inspections** with **AI Photo Analysis** and **Customer Presentations** with **Analytics Tracking**.

---

## Tables at a Glance

| Table | What It Stores | Key Columns |
|-------|----------------|-------------|
| `inspections` | Inspection data | job_id, inspection_status, estimated_cost |
| `inspection_photos` | Photos + AI analysis | photo_url, damage_detected, damage_severity |
| `presentations` | Generated presentations | share_token, slides (JSON), total_views |
| `presentation_shares` | Share tracking | share_method, email_opened, view_count |
| `presentation_views` | View analytics | session_id, view_duration, completed |

---

## Common Queries

### Create Inspection

```sql
INSERT INTO inspections (job_id, user_id, property_address, property_city, property_state, inspection_date, inspector_name)
VALUES ('job-id', 'user-id', '123 Main St', 'Richmond', 'VA', NOW(), 'John Smith')
RETURNING *;
```

### Add Photo with AI

```sql
INSERT INTO inspection_photos (inspection_id, user_id, photo_url, photo_order, ai_analysis, damage_detected, damage_categories, damage_severity)
VALUES ('inspection-id', 'user-id', 'https://...jpg', 1, 'Hail damage detected', true, ARRAY['hail_damage'], 'moderate')
RETURNING *;
```

### Complete Inspection

```sql
UPDATE inspections
SET inspection_status = 'completed',
    overall_condition = 'fair',
    recommended_action = 'full_replacement',
    estimated_cost = 12500
WHERE id = 'inspection-id'
RETURNING *;
```

### Create Presentation

```sql
SELECT create_presentation_from_inspection('inspection-id', 'Optional Title');
-- Returns: presentation-id
```

### Get Presentation by Token

```sql
SELECT * FROM presentations WHERE share_token = 'abc123xyz';
```

### Share Presentation

```sql
INSERT INTO presentation_shares (presentation_id, user_id, recipient_email, share_method)
VALUES ('presentation-id', 'user-id', 'customer@example.com', 'email')
RETURNING *;
```

### Track View

```sql
INSERT INTO presentation_views (presentation_id, session_id, viewer_device)
VALUES ('presentation-id', 'session-123', 'mobile')
RETURNING *;
```

### Get Analytics

```sql
SELECT * FROM get_presentation_analytics('presentation-id');
-- Returns: total_views, unique_sessions, avg_duration, device_breakdown, etc.
```

---

## TypeScript Types (Copy-Paste Ready)

```typescript
export interface Inspection {
  id: string;
  job_id: string;
  user_id: string;
  property_address: string;
  property_city: string;
  property_state: string;
  inspection_date: Date;
  inspector_name: string;
  inspection_status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  roof_type?: string;
  roof_age?: number;
  overall_condition?: string;
  recommended_action?: string;
  estimated_cost?: number;
  insurance_claimable: boolean;
}

export interface InspectionPhoto {
  id: string;
  inspection_id: string;
  photo_url: string;
  photo_order: number;
  ai_analysis?: string;
  damage_detected: boolean;
  damage_categories: string[];
  damage_severity?: 'minor' | 'moderate' | 'severe' | 'critical';
}

export interface Presentation {
  id: string;
  inspection_id: string;
  title: string;
  presentation_status: 'draft' | 'generated' | 'sent' | 'viewed' | 'signed';
  slides: any[];
  share_token: string;
  customer_name: string;
  property_address: string;
  estimated_cost?: number;
  total_views: number;
}

export interface PresentationShare {
  id: string;
  presentation_id: string;
  recipient_email: string;
  share_method: 'email' | 'sms' | 'link' | 'qr_code';
  email_opened: boolean;
  view_count: number;
}
```

---

## API Endpoints (Recommended)

```
POST   /api/inspections                      Create inspection
GET    /api/inspections/:id                  Get inspection with photos
PATCH  /api/inspections/:id                  Update inspection
POST   /api/inspections/:id/photos           Upload photo
POST   /api/inspections/:id/complete         Mark complete
POST   /api/inspections/:id/presentation     Generate presentation

GET    /api/presentations/:id                Get presentation
PATCH  /api/presentations/:id                Update presentation
POST   /api/presentations/:id/share          Share presentation
GET    /api/presentations/:id/analytics      Get analytics

GET    /api/present/:shareToken              Public view (no auth)
POST   /api/present/:shareToken/view         Track view event
```

---

## Helper Functions

```sql
-- Generate secure share token
SELECT generate_share_token();
-- Returns: '3a7f9c2b1e5d8f4a6c9e2b7d4f1a8c5e'

-- Create presentation from inspection
SELECT create_presentation_from_inspection('inspection-id', 'Optional Title');
-- Returns: presentation-id

-- Get comprehensive analytics
SELECT * FROM get_presentation_analytics('presentation-id');
-- Returns: total_views, unique_sessions, completed_views, avg_duration, pdf_downloads, contact_clicks, device_breakdown
```

---

## Views (Pre-Built Queries)

```sql
-- Inspection summary with counts
SELECT * FROM inspection_summary WHERE user_id = 'user-id';
-- Returns: inspection + photo_count + damage_photo_count + presentation_count

-- Presentation analytics
SELECT * FROM presentation_analytics WHERE presentation_status = 'sent';
-- Returns: presentation + share_count + view_count + completed_views + avg_duration
```

---

## Enums

### inspection_status
- `scheduled`
- `in_progress`
- `completed`
- `cancelled`

### damage_category
- `hail_damage`
- `wind_damage`
- `wear_and_tear`
- `leak`
- `missing_shingles`
- `flashing_damage`
- `gutter_damage`
- `soffit_fascia`
- `chimney`
- `ventilation`
- `other`

### damage_severity
- `minor`
- `moderate`
- `severe`
- `critical`

### presentation_status
- `draft`
- `generated`
- `sent`
- `viewed`
- `signed`

---

## JSONB Structures

### inspections.weather_conditions

```json
{
  "temperature": 72,
  "temperature_unit": "F",
  "conditions": "partly_cloudy",
  "wind_speed": 12
}
```

### inspections.measurements

```json
{
  "total_sqft": 2400,
  "ridges": [{"section": "main", "length_ft": 45}],
  "valleys": [{"section": "front", "length_ft": 30}]
}
```

### presentations.slides

```json
[
  {
    "id": 1,
    "type": "cover",
    "title": "Roof Inspection Report",
    "subtitle": "123 Main St"
  },
  {
    "id": 2,
    "type": "damage_photo",
    "photo_id": "photo-uuid",
    "caption": "Hail damage detected"
  }
]
```

---

## Triggers (Automatic)

- ✅ Auto-update `updated_at` on all tables
- ✅ Set `completed_at` when status = 'completed'
- ✅ Set `sent_at` when status = 'sent'
- ✅ Increment `total_views` on new view
- ✅ Update `view_count` in shares

---

## Indexes (Performance)

All foreign keys indexed:
- `inspections.job_id`
- `inspections.user_id`
- `inspection_photos.inspection_id`
- `presentations.inspection_id`
- `presentations.share_token` (unique)
- `presentation_shares.presentation_id`
- `presentation_views.presentation_id`

Plus status, date, and array indexes.

---

## Migration Commands

### Apply

```bash
railway run psql $DATABASE_URL -f database/migrations/049_inspection_presentations.sql
```

### Verify

```sql
\dt inspections inspection_photos presentations presentation_shares presentation_views
\df generate_share_token create_presentation_from_inspection get_presentation_analytics
\dv inspection_summary presentation_analytics
```

### Rollback (WARNING: Deletes data!)

```sql
DROP TABLE IF EXISTS presentation_views CASCADE;
DROP TABLE IF EXISTS presentation_shares CASCADE;
DROP TABLE IF EXISTS presentations CASCADE;
DROP TABLE IF EXISTS inspection_photos CASCADE;
DROP TABLE IF EXISTS inspections CASCADE;
DROP TYPE IF EXISTS inspection_status CASCADE;
DROP TYPE IF EXISTS damage_category CASCADE;
DROP TYPE IF EXISTS damage_severity CASCADE;
DROP TYPE IF EXISTS presentation_status CASCADE;
```

---

## Workflow Example

```sql
-- 1. Create inspection
INSERT INTO inspections (job_id, user_id, property_address, property_city, property_state, inspection_date, inspector_name)
VALUES ('job-1', 'user-1', '123 Main St', 'Richmond', 'VA', NOW(), 'John')
RETURNING id;
-- Returns: inspection-1

-- 2. Add photo with AI
INSERT INTO inspection_photos (inspection_id, user_id, photo_url, photo_order, damage_detected, damage_severity)
VALUES ('inspection-1', 'user-1', 'https://.../photo1.jpg', 1, true, 'moderate')
RETURNING id;

-- 3. Complete inspection
UPDATE inspections SET inspection_status = 'completed', estimated_cost = 12500 WHERE id = 'inspection-1';

-- 4. Create presentation
SELECT create_presentation_from_inspection('inspection-1');
-- Returns: presentation-1

-- 5. Share via email
INSERT INTO presentation_shares (presentation_id, user_id, recipient_email, share_method)
VALUES ('presentation-1', 'user-1', 'customer@example.com', 'email')
RETURNING id;

-- 6. Customer views (auto-tracked)
INSERT INTO presentation_views (presentation_id, session_id, viewer_device)
VALUES ('presentation-1', 'session-123', 'mobile');

-- 7. Get analytics
SELECT * FROM get_presentation_analytics('presentation-1');
```

---

## AI Integration (Gemini Vision)

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

const result = await model.generateContent([
  'Analyze this roof photo for damage. Return JSON with: description, damage_detected, categories[], severity',
  { inlineData: { data: base64Image, mimeType: 'image/jpeg' } }
]);

const analysis = JSON.parse(result.response.text());
// { description: "...", damage_detected: true, categories: ["hail_damage"], severity: "moderate" }
```

---

## File Locations

```
/Users/a21/gemini-field-assistant/database/migrations/
├── 049_inspection_presentations.sql        (Main migration)
├── README_049_INSPECTION_PRESENTATIONS.md  (Full docs)
├── SCHEMA_DIAGRAM_049.md                   (Visual diagrams)
├── IMPLEMENTATION_GUIDE_049.md             (Developer guide)
├── SUMMARY_049.md                          (Overview)
└── QUICK_REFERENCE_049.md                  (This file)
```

---

## Support

- **Full Docs:** `README_049_INSPECTION_PRESENTATIONS.md`
- **Schema:** `SCHEMA_DIAGRAM_049.md`
- **Examples:** `IMPLEMENTATION_GUIDE_049.md`
- **Overview:** `SUMMARY_049.md`

---

**Last Updated:** February 8, 2025
**Migration:** 049
**Database:** PostgreSQL 14+
**Project:** Gemini Field Assistant
