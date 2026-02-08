# Inspection Presentations Schema Diagram

## Complete Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         INSPECTION PRESENTATIONS SYSTEM                       │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│     users       │
│─────────────────│
│ id (PK)        │◄─────────────────────────────────────┐
│ email          │                                       │
│ name           │                                       │
│ role           │                                       │
│ state          │                                       │
└─────────────────┘                                      │
        │                                                │
        │ 1:N                                            │
        │                                                │
        ▼                                                │
┌─────────────────┐                                     │
│     jobs        │                                     │
│─────────────────│                                     │
│ id (PK)        │◄─────────────────┐                   │
│ job_number     │                  │                   │
│ user_id (FK)   │                  │                   │
│ title          │                  │                   │
│ status         │                  │                   │
│ customer (JSON)│                  │                   │
│ property (JSON)│                  │                   │
└─────────────────┘                 │                   │
        │                           │                   │
        │ 1:N                       │                   │
        │                           │                   │
        ▼                           │                   │
┌─────────────────────────────────┐ │                   │
│        inspections              │ │                   │
│─────────────────────────────────│ │                   │
│ id (PK)                        │ │                   │
│ job_id (FK) ───────────────────┘ │                   │
│ user_id (FK) ────────────────────┼───────────────────┘
│ property_address                │ │
│ property_city                   │ │
│ property_state                  │ │
│ inspection_date                 │ │
│ inspector_name                  │ │
│ inspection_status ◄─────────────┼─┼─── ENUM: scheduled, in_progress,
│ roof_type                       │ │                  completed, cancelled
│ roof_age                        │ │
│ overall_condition               │ │
│ recommended_action              │ │
│ estimated_cost                  │ │
│ insurance_claimable             │ │
│ weather_conditions (JSON)       │ │
│ measurements (JSON)             │ │
└─────────────────────────────────┘ │
        │                           │
        │ 1:N                       │
        ├───────────────────────────┼─────────┐
        │                           │         │
        ▼                           │         ▼
┌─────────────────────────────────┐ │ ┌─────────────────────────────────┐
│      inspection_photos          │ │ │       presentations             │
│─────────────────────────────────│ │ │─────────────────────────────────│
│ id (PK)                        │ │ │ id (PK)                        │
│ inspection_id (FK) ─────────────┘ │ │ inspection_id (FK) ─────────────┘
│ user_id (FK) ──────────────────────┼─┤ job_id (FK) ─────────────────────┐
│ photo_url                       │ │ │ user_id (FK) ─────────────────┐  │
│ photo_order                     │ │ │ title                         │  │
│ ai_analysis                     │ │ │ presentation_status ◄─────────┼──┼── ENUM: draft, generated,
│ ai_provider                     │ │ │ slides (JSON)                 │  │           sent, viewed, signed
│ ai_confidence                   │ │ │ slide_count                   │  │
│ damage_detected                 │ │ │ theme                         │  │
│ damage_categories[] ◄───────────┼─┼─┤ share_url                     │  │
│ damage_severity ◄───────────────┼─┼─┤ share_token (UNIQUE)          │  │
│ roof_section                    │ │ │ password_protected            │  │
│ gps_latitude                    │ │ │ customer_name                 │  │
│ gps_longitude                   │ │ │ property_address              │  │
│ annotations (JSON)              │ │ │ estimated_cost                │  │
│ caption                         │ │ │ total_views ◄────────────────────┼── Updated by trigger
└─────────────────────────────────┘ │ │ unique_viewers ◄─────────────────┼── Updated by trigger
                                    │ │ last_viewed_at ◄─────────────────┼── Updated by trigger
damage_category ENUM: ─────────────┘ │ pdf_url                       │  │
  - hail_damage                      │ sent_at                       │  │
  - wind_damage                      │ signed_at                     │  │
  - wear_and_tear                    └─────────────────────────────────┘  │
  - leak                                     │                            │
  - missing_shingles                         │ 1:N                        │
  - flashing_damage                          │                            │
  - gutter_damage                            ▼                            │
  - soffit_fascia                    ┌─────────────────────────────────┐ │
  - chimney                          │    presentation_shares          │ │
  - ventilation                      │─────────────────────────────────│ │
  - other                            │ id (PK)                        │ │
                                     │ presentation_id (FK) ───────────┘ │
damage_severity ENUM:                │ user_id (FK) ──────────────────────┘
  - minor                            │ recipient_name                  │
  - moderate                         │ recipient_email                 │
  - severe                           │ share_method ◄──────────────────┼── ENUM: email, sms,
  - critical                         │ share_message                   │           link, qr_code
                                     │ email_sent                      │
                                     │ email_sent_at                   │
                                     │ email_opened                    │
                                     │ sms_message_sid                 │
                                     │ view_count ◄────────────────────┼── Updated by trigger
                                     │ first_viewed_at ◄───────────────┼── Updated by trigger
                                     │ last_viewed_at ◄────────────────┼── Updated by trigger
                                     └─────────────────────────────────┘
                                             │
                                             │ 1:N (optional)
                                             │
                                             ▼
                                     ┌─────────────────────────────────┐
                                     │    presentation_views           │
                                     │─────────────────────────────────│
                                     │ id (PK)                        │
                                     │ presentation_id (FK) ───────────┼───┐
                                     │ presentation_share_id (FK) ─────┘   │
                                     │ viewer_ip                       │   │
                                     │ viewer_user_agent               │   │
                                     │ viewer_device                   │   │
                                     │ viewer_browser                  │   │
                                     │ session_id                      │   │
                                     │ view_duration (seconds)         │   │
                                     │ slides_viewed (JSON)            │   │
                                     │ completed_presentation          │   │
                                     │ downloaded_pdf                  │   │
                                     │ clicked_contact                 │   │
                                     │ utm_source                      │   │
                                     │ utm_campaign                    │   │
                                     │ started_at                      │   │
                                     └─────────────────────────────────┘   │
                                             │                             │
                                             └─────────────────────────────┘
                                                   Triggers update on INSERT
```

## Cascade Deletion Behavior

```
DELETE users
    └─► CASCADE → inspections, presentations, presentation_shares

DELETE jobs
    └─► CASCADE → inspections, presentations

DELETE inspections
    └─► CASCADE → inspection_photos, presentations

DELETE presentations
    └─► CASCADE → presentation_shares, presentation_views

DELETE presentation_shares
    └─► SET NULL → presentation_views.presentation_share_id
```

## Key Indexes

### Performance Indexes

```
inspections:
  - PRIMARY KEY (id)
  - idx_inspections_job_id (job_id)
  - idx_inspections_user_id (user_id)
  - idx_inspections_status (inspection_status)
  - idx_inspections_date (inspection_date DESC)

inspection_photos:
  - PRIMARY KEY (id)
  - idx_inspection_photos_inspection_id (inspection_id)
  - idx_inspection_photos_order (inspection_id, photo_order)
  - idx_inspection_photos_damage (damage_detected, damage_severity) WHERE damage_detected
  - idx_inspection_photos_damage_categories GIN(damage_categories)

presentations:
  - PRIMARY KEY (id)
  - idx_presentations_inspection_id (inspection_id)
  - idx_presentations_job_id (job_id)
  - idx_presentations_share_token (share_token) UNIQUE
  - idx_presentations_status (presentation_status)

presentation_shares:
  - PRIMARY KEY (id)
  - idx_presentation_shares_presentation_id (presentation_id)
  - idx_presentation_shares_recipient_email (recipient_email)
  - idx_presentation_shares_email_opened (email_opened, email_opened_at DESC) WHERE opened

presentation_views:
  - PRIMARY KEY (id)
  - idx_presentation_views_presentation_id (presentation_id)
  - idx_presentation_views_session_id (session_id)
  - idx_presentation_views_completed (completed_presentation, created_at DESC) WHERE completed
```

## Data Flow

### 1. Inspection Creation Flow

```
User creates job
    ↓
User schedules inspection
    ↓
CREATE inspections (status = 'scheduled')
    ↓
User goes to site (status = 'in_progress')
    ↓
User captures photos
    ↓
FOR EACH photo:
    ├─► Upload to storage
    ├─► Send to AI for analysis
    └─► CREATE inspection_photos with AI results
    ↓
User completes assessment
    ↓
UPDATE inspections (status = 'completed')
    ↓
TRIGGER sets completed_at timestamp
```

### 2. Presentation Generation Flow

```
Inspection completed
    ↓
CALL create_presentation_from_inspection(inspection_id)
    ↓
Function fetches:
    ├─► Inspection details
    ├─► Job customer/property data
    ├─► Photo count
    └─► Damage summary
    ↓
CREATE presentations
    ├─► status = 'draft'
    ├─► share_token = generate_share_token()
    └─► slides = generated slide JSON
    ↓
User reviews and edits slides
    ↓
UPDATE presentations (status = 'generated')
```

### 3. Sharing Flow

```
User clicks "Share Presentation"
    ↓
SELECT recipient (email, SMS, or link)
    ↓
CREATE presentation_shares
    ├─► share_method = 'email' | 'sms' | 'link'
    └─► store recipient details
    ↓
IF email:
    ├─► Send email with share_url
    ├─► UPDATE email_sent = true
    └─► Track opens via tracking pixel
ELSE IF sms:
    ├─► Send SMS via Twilio
    ├─► UPDATE sms_sent = true
    └─► Store message_sid
ELSE:
    └─► Generate QR code or copy link
    ↓
UPDATE presentations (status = 'sent', sent_at = NOW())
```

### 4. View Tracking Flow

```
Customer clicks share link
    ↓
App loads presentation by share_token
    ↓
Generate unique session_id
    ↓
CREATE presentation_views
    ├─► session_id = unique ID
    ├─► started_at = NOW()
    └─► viewer device/browser detection
    ↓
TRIGGER update_presentation_analytics() fires
    ├─► UPDATE presentations SET total_views++
    ├─► UPDATE presentations SET last_viewed_at
    └─► UPDATE presentation_shares SET view_count++
    ↓
Customer interacts with presentation
    ├─► Track slides_viewed[] array
    ├─► Track clicked_contact
    ├─► Track downloaded_pdf
    └─► Calculate view_duration
    ↓
UPDATE presentation_views on session end
    ├─► view_duration = ended_at - started_at
    ├─► completed_presentation = viewed all slides
    └─► ended_at = NOW()
```

## JSONB Column Structures

### inspections.weather_conditions

```json
{
  "temperature": 72,
  "temperature_unit": "F",
  "conditions": "partly_cloudy",
  "wind_speed": 12,
  "wind_direction": "NW",
  "precipitation": "none",
  "visibility": "good"
}
```

### inspections.measurements

```json
{
  "total_sqft": 2400,
  "ridges": [
    {"section": "main", "length_ft": 45},
    {"section": "garage", "length_ft": 20}
  ],
  "valleys": [
    {"section": "front", "length_ft": 30}
  ],
  "eaves": [
    {"section": "all", "length_ft": 180}
  ]
}
```

### inspections.materials_needed

```json
[
  {
    "material": "architectural_shingles",
    "quantity": 25,
    "unit": "squares",
    "color": "weathered_wood",
    "notes": "Tamko Heritage 30yr"
  },
  {
    "material": "underlayment",
    "quantity": 25,
    "unit": "squares",
    "notes": "Synthetic underlayment"
  },
  {
    "material": "ridge_cap",
    "quantity": 65,
    "unit": "linear_feet"
  }
]
```

### inspection_photos.annotations

```json
[
  {
    "type": "rectangle",
    "x": 100,
    "y": 150,
    "width": 200,
    "height": 180,
    "label": "Hail impacts",
    "color": "#FF0000",
    "stroke_width": 3
  },
  {
    "type": "arrow",
    "x1": 300,
    "y1": 200,
    "x2": 350,
    "y2": 250,
    "label": "Missing shingle",
    "color": "#FFFF00"
  }
]
```

### presentations.slides

```json
[
  {
    "id": 1,
    "type": "cover",
    "title": "Roof Inspection Report",
    "subtitle": "123 Main St, Richmond, VA",
    "background_image": "https://storage.../cover.jpg"
  },
  {
    "id": 2,
    "type": "property_details",
    "content": {
      "address": "123 Main St",
      "roof_type": "Asphalt Shingle",
      "roof_age": 15,
      "condition": "Fair"
    }
  },
  {
    "id": 3,
    "type": "damage_photo",
    "photo_id": "photo-uuid",
    "caption": "Hail damage detected on front slope",
    "severity": "moderate"
  },
  {
    "id": 4,
    "type": "recommendations",
    "content": {
      "action": "Full Replacement",
      "urgency": "Within 30 days",
      "estimated_cost": "$12,500"
    }
  },
  {
    "id": 5,
    "type": "contact",
    "content": {
      "company": "Roof-ER 21",
      "phone": "804-555-0100",
      "email": "info@roofer21.com"
    }
  }
]
```

### presentations.financing_options

```json
[
  {
    "provider": "GreenSky",
    "name": "12 Months Same as Cash",
    "term_months": 12,
    "apr": 0,
    "monthly_payment": 1042,
    "deferred_interest": true
  },
  {
    "provider": "GreenSky",
    "name": "60 Month Fixed",
    "term_months": 60,
    "apr": 6.99,
    "monthly_payment": 245,
    "deferred_interest": false
  }
]
```

### presentation_views.slides_viewed

```json
[1, 2, 3, 4, 5, 6, 7, 8]
```

## Typical Query Patterns

### Get inspection with all photos

```sql
SELECT
    i.*,
    json_agg(
        json_build_object(
            'id', ip.id,
            'url', ip.photo_url,
            'order', ip.photo_order,
            'damage_detected', ip.damage_detected,
            'ai_analysis', ip.ai_analysis
        )
        ORDER BY ip.photo_order
    ) as photos
FROM inspections i
LEFT JOIN inspection_photos ip ON i.id = ip.inspection_id
WHERE i.id = 'inspection-uuid'
GROUP BY i.id;
```

### Get presentation analytics

```sql
SELECT
    p.*,
    COUNT(DISTINCT pv.session_id) as unique_sessions,
    COUNT(*) FILTER (WHERE pv.completed_presentation) as completions,
    ROUND(AVG(pv.view_duration)) as avg_duration,
    json_build_object(
        'desktop', COUNT(*) FILTER (WHERE pv.viewer_device = 'desktop'),
        'mobile', COUNT(*) FILTER (WHERE pv.viewer_device = 'mobile'),
        'tablet', COUNT(*) FILTER (WHERE pv.viewer_device = 'tablet')
    ) as device_stats
FROM presentations p
LEFT JOIN presentation_views pv ON p.id = pv.presentation_id
WHERE p.id = 'presentation-uuid'
GROUP BY p.id;
```

### Find high-value leads

```sql
SELECT
    i.property_address,
    i.estimated_cost,
    p.presentation_status,
    p.total_views,
    COUNT(DISTINCT pv.id) FILTER (WHERE pv.completed_presentation) as completed_views,
    MAX(pv.created_at) as last_viewed
FROM inspections i
JOIN presentations p ON i.id = p.inspection_id
LEFT JOIN presentation_views pv ON p.id = pv.presentation_id
WHERE i.estimated_cost > 10000
  AND p.total_views > 2
GROUP BY i.id, p.id
ORDER BY p.total_views DESC, i.estimated_cost DESC;
```

## Storage Estimates

### Table Size Projections (1000 inspections)

```
inspections:          ~1MB   (1KB per row × 1000)
inspection_photos:    ~5MB   (500 bytes × 10 photos × 1000)
presentations:        ~3MB   (3KB per row × 1000)
presentation_shares:  ~2MB   (500 bytes × 4 shares × 1000)
presentation_views:   ~15MB  (500 bytes × 30 views × 1000)
───────────────────────────
TOTAL:                ~26MB for 1000 inspections
```

### Scaling Considerations

- Photos stored externally (S3, Cloudinary)
- Only metadata stored in database
- JSONB columns compressed by PostgreSQL
- Regular VACUUM recommended for JSONB updates
- Consider partitioning presentation_views by date for > 100k records

---

**Last Updated:** February 8, 2025
**Schema Version:** 049
**PostgreSQL Version:** 14+
