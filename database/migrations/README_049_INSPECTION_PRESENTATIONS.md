# Migration 049: Inspection Presentations System

## Overview

This migration creates a comprehensive system for managing roof inspections, AI-powered photo analysis, and customer-facing presentations. The system is designed to streamline the workflow from field inspection to customer proposal.

## Database Schema

### Entity Relationship Diagram

```
users ─────┐
           │
           ├──> jobs ──────┬──> inspections ──────┬──> inspection_photos
           │               │                       │
           │               │                       └──> presentations ──┬──> presentation_shares
           │               │                                            │
           │               └────────────────────────────────────────────┘
           │
           └──────────────────────────────────────────────────────────────> presentation_views
```

## Tables

### 1. `inspections`

Stores roof inspection data linked to jobs.

**Key Features:**
- Links to existing `jobs` table
- Comprehensive property and roof details
- Weather conditions at time of inspection
- Damage assessment and recommendations
- Cost estimates
- Insurance claim support information

**Important Columns:**
- `inspection_status`: Lifecycle tracking (scheduled → in_progress → completed/cancelled)
- `weather_conditions`: JSONB storing temperature, wind, precipitation
- `overall_condition`: Quick assessment (excellent/good/fair/poor)
- `recommended_action`: What should be done (repair/partial_replacement/full_replacement)
- `insurance_claimable`: Boolean flag for insurance support

**Example Data:**
```sql
INSERT INTO inspections (
    job_id, user_id, property_address, property_city, property_state,
    inspection_date, inspector_name, roof_type, roof_age,
    overall_condition, recommended_action, estimated_cost
) VALUES (
    'job-uuid', 'user-uuid', '123 Main St', 'Richmond', 'VA',
    NOW(), 'John Inspector', 'asphalt_shingle', 15,
    'fair', 'partial_replacement', 8500.00
);
```

---

### 2. `inspection_photos`

Photos from inspections with AI analysis results.

**Key Features:**
- AI-powered damage detection
- Multiple damage categories per photo
- Severity ratings
- GPS coordinates
- Annotations for marking damage areas
- Ordering for presentation layout

**Important Columns:**
- `ai_analysis`: Text description from AI (Gemini Vision, etc.)
- `damage_categories`: Array of damage types (hail_damage, wind_damage, etc.)
- `damage_severity`: Enum (minor/moderate/severe/critical)
- `annotations`: JSONB array for bounding boxes and labels
- `photo_order`: Integer for ordering in presentations

**Damage Categories:**
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

**Example Data:**
```sql
INSERT INTO inspection_photos (
    inspection_id, user_id, photo_url,
    ai_analysis, damage_detected, damage_categories, damage_severity,
    roof_section, photo_order
) VALUES (
    'inspection-uuid', 'user-uuid', 'https://storage.../photo1.jpg',
    'Multiple hail impacts detected on shingles. Approximately 15-20 hits per square visible.',
    true, ARRAY['hail_damage']::damage_category[], 'moderate',
    'front', 1
);
```

---

### 3. `presentations`

Generated presentations from inspections for customer delivery.

**Key Features:**
- Auto-generated from inspections
- Shareable via unique token URL
- Optional password protection
- PDF export capability
- Real-time analytics tracking
- Customer and property info (denormalized for fast access)

**Important Columns:**
- `slides`: JSONB array of slide objects with content and layout
- `share_token`: Unique token for public URL (e.g., `/present/abc123xyz`)
- `presentation_status`: Lifecycle (draft → generated → sent → viewed → signed)
- `theme`: Visual theme (professional/modern/classic)
- `total_views`: Updated automatically via trigger
- `password_protected`: Boolean flag for secure sharing

**Example Data:**
```sql
-- Use helper function to create presentation
SELECT create_presentation_from_inspection(
    'inspection-uuid',
    'Roof Inspection Report - 123 Main St'
);
```

---

### 4. `presentation_shares`

Tracks how presentations are shared with recipients.

**Key Features:**
- Multiple share methods (email, SMS, link, QR code)
- Email tracking (sent, opened)
- SMS tracking (sent, delivery status)
- View count per recipient
- Custom messages

**Important Columns:**
- `share_method`: How it was shared (email/sms/link/qr_code)
- `email_sent`/`email_opened`: Email engagement tracking
- `sms_message_sid`: Twilio message ID for SMS tracking
- `view_count`: How many times this recipient viewed it
- `first_viewed_at`/`last_viewed_at`: Engagement timestamps

**Example Data:**
```sql
INSERT INTO presentation_shares (
    presentation_id, user_id, recipient_name, recipient_email,
    share_method, share_message
) VALUES (
    'presentation-uuid', 'user-uuid', 'John Homeowner', 'john@example.com',
    'email', 'Here is your roof inspection report. Please review and let me know if you have questions.'
);
```

---

### 5. `presentation_views`

Detailed analytics for presentation views and interactions.

**Key Features:**
- Session tracking
- Device and browser detection
- Geographic data
- Slide-by-slide tracking
- Interaction events (PDF download, contact clicks, etc.)
- UTM campaign tracking

**Important Columns:**
- `session_id`: Track individual viewing sessions
- `viewer_device`/`viewer_browser`/`viewer_os`: Device detection
- `slides_viewed`: JSONB array of slide numbers viewed
- `completed_presentation`: Boolean flag if viewed all slides
- `downloaded_pdf`/`clicked_contact`/`clicked_financing`: Interaction flags
- `utm_source`/`utm_medium`/`utm_campaign`: Marketing attribution

**Example Data:**
```sql
INSERT INTO presentation_views (
    presentation_id, presentation_share_id, session_id,
    viewer_device, viewer_browser, slides_viewed, total_slides_viewed,
    completed_presentation, view_duration
) VALUES (
    'presentation-uuid', 'share-uuid', 'session-abc123',
    'mobile', 'Safari', '[1,2,3,4,5,6,7,8]'::jsonb, 8,
    true, 245
);
```

## Indexes

### Performance Optimization Strategy

**1. Foreign Key Indexes**
- All foreign keys have indexes for JOIN performance
- Cascading deletes optimized

**2. Status Indexes**
- Filter indexes on status columns (inspection_status, presentation_status)
- Partial indexes for common filters (damage_detected = true)

**3. Time-Series Indexes**
- All created_at columns indexed DESC for recent-first queries
- inspection_date indexed for scheduling queries

**4. Specialized Indexes**
- GIN index on damage_categories array for array searching
- Partial indexes on email_opened and completed_presentation for analytics

**5. Unique Indexes**
- share_token (unique, sparse) for fast URL lookups

## Triggers

### Automatic Timestamp Updates

**`update_inspection_timestamp()`**
- Updates `updated_at` on every update
- Automatically sets `completed_at` when status changes to 'completed'

**`update_presentation_timestamp()`**
- Updates `updated_at` on every update
- Sets `sent_at` when status changes to 'sent'
- Sets `signed_at` when status changes to 'signed'

### Real-Time Analytics

**`update_presentation_analytics()`**
- Fires on every presentation view insert
- Updates `total_views` and `last_viewed_at` on presentations table
- Updates `view_count` on presentation_shares table
- Ensures analytics are always up-to-date without batch jobs

## Helper Functions

### 1. `generate_share_token()`

Generates cryptographically secure unique tokens for sharing.

```sql
-- Returns: '3a7f9c2b1e5d8f4a6c9e2b7d4f1a8c5e'
SELECT generate_share_token();
```

**Features:**
- Uses `gen_random_bytes(16)` for security
- Checks for collisions (very unlikely but handled)
- Returns 32-character hex string

---

### 2. `create_presentation_from_inspection()`

Creates a new presentation from an existing inspection.

```sql
-- Create presentation
SELECT create_presentation_from_inspection(
    'inspection-uuid',
    'Custom Title (optional)'
);
```

**What it does:**
1. Fetches inspection and job details
2. Denormalizes customer and property data
3. Counts photos for slide estimation
4. Generates unique share token
5. Creates presentation in 'draft' status
6. Returns presentation ID

---

### 3. `get_presentation_analytics()`

Retrieves comprehensive analytics for a presentation.

```sql
SELECT * FROM get_presentation_analytics('presentation-uuid');
```

**Returns:**
- `total_views`: Total view count
- `unique_sessions`: Unique viewing sessions
- `completed_views`: Views where all slides were seen
- `avg_duration`: Average view duration in seconds
- `pdf_downloads`: Number of PDF downloads
- `contact_clicks`: Contact button clicks
- `last_viewed`: Most recent view timestamp
- `device_breakdown`: JSONB with desktop/mobile/tablet counts

## Views

### 1. `inspection_summary`

Aggregates inspection data with photo and presentation counts.

```sql
SELECT * FROM inspection_summary
WHERE user_id = 'user-uuid'
ORDER BY inspection_date DESC;
```

**Includes:**
- All inspection columns
- `photo_count`: Total photos
- `damage_photo_count`: Photos with damage detected
- `presentation_count`: Presentations created from this inspection

---

### 2. `presentation_analytics`

Comprehensive analytics for all presentations.

```sql
SELECT * FROM presentation_analytics
WHERE presentation_status = 'sent'
ORDER BY last_viewed_at DESC;
```

**Includes:**
- All presentation columns
- `share_count`: Times shared
- `detailed_view_count`: Total views
- `unique_session_count`: Unique sessions
- `completed_view_count`: Full completions
- `avg_view_duration_seconds`: Average time spent

## Usage Examples

### Complete Workflow

```sql
-- 1. Create inspection
INSERT INTO inspections (
    job_id, user_id, property_address, property_city, property_state,
    inspection_date, inspector_name, inspection_status
) VALUES (
    'job-uuid', 'user-uuid', '123 Main St', 'Richmond', 'VA',
    '2025-02-10 10:00:00-05', 'John Inspector', 'in_progress'
)
RETURNING id;

-- 2. Add photos with AI analysis
INSERT INTO inspection_photos (
    inspection_id, user_id, photo_url, photo_order,
    ai_analysis, damage_detected, damage_categories, damage_severity
) VALUES
    ('inspection-uuid', 'user-uuid', 'https://.../photo1.jpg', 1,
     'Severe hail damage detected', true, ARRAY['hail_damage']::damage_category[], 'severe'),
    ('inspection-uuid', 'user-uuid', 'https://.../photo2.jpg', 2,
     'Wind-lifted shingles on ridge', true, ARRAY['wind_damage']::damage_category[], 'moderate');

-- 3. Mark inspection complete
UPDATE inspections
SET inspection_status = 'completed',
    overall_condition = 'fair',
    recommended_action = 'full_replacement',
    estimated_cost = 12500.00
WHERE id = 'inspection-uuid';

-- 4. Create presentation
SELECT create_presentation_from_inspection('inspection-uuid');

-- 5. Share presentation
INSERT INTO presentation_shares (
    presentation_id, user_id, recipient_email, share_method
) VALUES (
    'presentation-uuid', 'user-uuid', 'customer@example.com', 'email'
);

-- 6. Track when customer views it
INSERT INTO presentation_views (
    presentation_id, presentation_share_id, session_id,
    viewer_device, slides_viewed, completed_presentation
) VALUES (
    'presentation-uuid', 'share-uuid', 'session-123',
    'mobile', '[1,2,3,4,5,6,7,8]'::jsonb, true
);

-- 7. Get analytics
SELECT * FROM get_presentation_analytics('presentation-uuid');
```

### Query Examples

```sql
-- Find all inspections needing presentations
SELECT i.*, COUNT(p.id) as presentation_count
FROM inspections i
LEFT JOIN presentations p ON i.id = p.inspection_id
WHERE i.inspection_status = 'completed'
GROUP BY i.id
HAVING COUNT(p.id) = 0;

-- Find presentations with high engagement
SELECT *
FROM presentation_analytics
WHERE completed_view_count > 3
  AND avg_view_duration_seconds > 120
ORDER BY last_viewed_at DESC;

-- Find inspections with severe damage
SELECT i.*, COUNT(ip.id) as severe_damage_photos
FROM inspections i
JOIN inspection_photos ip ON i.id = ip.inspection_id
WHERE ip.damage_severity = 'severe'
  OR ip.damage_severity = 'critical'
GROUP BY i.id
ORDER BY COUNT(ip.id) DESC;

-- Customer engagement by share method
SELECT
    share_method,
    COUNT(*) as share_count,
    SUM(view_count) as total_views,
    AVG(view_count) as avg_views_per_share,
    COUNT(*) FILTER (WHERE email_opened = true) as emails_opened
FROM presentation_shares
GROUP BY share_method;
```

## Integration Points

### Existing Tables

**Jobs Table (`jobs`)**
- Inspections link to jobs via `job_id`
- Customer and property data flows from jobs to inspections
- Presentations inherit job data

**Users Table (`users`)**
- All inspections, photos, and presentations belong to users
- Tracks who created what
- Enables user-level analytics

**Image Analysis Log (`image_analysis_log`)**
- Can reference inspection photos for AI tracking
- Use `linked_image_analysis_ids` JSONB array in jobs table

### New Features Enabled

1. **Mobile Inspection Capture**
   - Upload photos from field
   - Real-time AI analysis
   - GPS tagging

2. **Customer Portal**
   - View presentations via share token
   - No login required
   - Mobile-optimized

3. **Sales Analytics**
   - Track presentation performance
   - A/B test different themes
   - Measure engagement vs. close rate

4. **Insurance Claims Support**
   - Export data for claims
   - Photo evidence with AI analysis
   - Professional reports

## Migration Execution

### Apply Migration

```bash
# On Railway
railway run psql $DATABASE_URL -f database/migrations/049_inspection_presentations.sql

# Local development
psql $DATABASE_URL -f database/migrations/049_inspection_presentations.sql
```

### Verify Migration

```sql
-- Check tables created
SELECT tablename FROM pg_tables
WHERE tablename IN (
    'inspections',
    'inspection_photos',
    'presentations',
    'presentation_shares',
    'presentation_views'
);

-- Check indexes
SELECT indexname FROM pg_indexes
WHERE tablename IN (
    'inspections',
    'inspection_photos',
    'presentations',
    'presentation_shares',
    'presentation_views'
);

-- Check functions
SELECT proname FROM pg_proc
WHERE proname IN (
    'generate_share_token',
    'create_presentation_from_inspection',
    'get_presentation_analytics'
);

-- Check views
SELECT viewname FROM pg_views
WHERE viewname IN (
    'inspection_summary',
    'presentation_analytics'
);
```

## Performance Considerations

### Query Optimization

**Use covering indexes:**
```sql
-- Already created
CREATE INDEX idx_inspections_user_status ON inspections(user_id, inspection_status);
```

**Avoid N+1 queries:**
```sql
-- Bad: Fetches presentations one-by-one
SELECT * FROM presentations WHERE inspection_id = ?

-- Good: Fetch all at once with JOIN
SELECT i.*, json_agg(p.*) as presentations
FROM inspections i
LEFT JOIN presentations p ON i.id = p.inspection_id
WHERE i.user_id = 'user-uuid'
GROUP BY i.id;
```

### Pagination

```sql
-- Cursor-based pagination (preferred)
SELECT * FROM inspections
WHERE created_at < $last_seen_timestamp
ORDER BY created_at DESC
LIMIT 20;

-- Offset pagination (okay for small datasets)
SELECT * FROM inspections
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

### JSONB Queries

```sql
-- Query slides JSONB
SELECT * FROM presentations
WHERE slides @> '[{"type": "damage_photos"}]'::jsonb;

-- Query damage categories array
SELECT * FROM inspection_photos
WHERE 'hail_damage'::damage_category = ANY(damage_categories);
```

## Security Considerations

### Password-Protected Presentations

```sql
-- Create password-protected presentation
UPDATE presentations
SET password_protected = true,
    password_hash = crypt('customer-password', gen_salt('bf'))
WHERE id = 'presentation-uuid';

-- Verify password (in application code)
SELECT id FROM presentations
WHERE share_token = 'token'
  AND password_hash = crypt('input-password', password_hash);
```

### Access Control

- All tables link to `user_id` for row-level access control
- Use RLS (Row-Level Security) if needed:

```sql
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY inspections_user_policy ON inspections
    FOR ALL
    USING (user_id = current_setting('app.current_user_id')::uuid);
```

## Future Enhancements

### Possible Additions

1. **Version Control for Presentations**
   - Track presentation edits
   - A/B testing different versions

2. **Templates System**
   - Pre-built slide templates
   - Company branding presets

3. **E-Signature Integration**
   - DocuSign/HelloSign integration
   - Track signature status

4. **Advanced AI Features**
   - Damage cost estimation
   - Before/after comparisons
   - Predictive maintenance

5. **Collaboration**
   - Multi-user inspections
   - Comments/annotations from office team

## Troubleshooting

### Common Issues

**Presentation not updating analytics:**
- Check trigger is enabled: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_presentation_views_analytics';`
- Verify trigger function exists: `\df update_presentation_analytics`

**Share token collisions:**
- Very unlikely (2^128 possibilities)
- Function handles it automatically with retry loop

**Slow queries:**
- Run `EXPLAIN ANALYZE` on slow queries
- Check indexes are being used
- Consider materialized views for complex aggregations

## Support

For questions or issues:
- Check migration logs in Railway
- Review PostgreSQL logs for errors
- Test queries in development first

---

**Migration Created:** February 8, 2025
**Database Version:** PostgreSQL 14+
**Compatible With:** Gemini Field Assistant v2.x
