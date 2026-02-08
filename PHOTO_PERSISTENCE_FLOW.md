# Photo Persistence Flow Diagram

## Current (Broken) Flow
```
User uploads photos
     ↓
Photos stored in React state (memory)
     ↓
AI analyzes photos → analysis stored in state
     ↓
User clicks "Generate Presentation"
     ↓
Creates Job in database
     ↓
Creates slides with inline base64 photos
     ↓
Presentation shown (photos still in memory)
     ↓
❌ User refreshes page → PHOTOS GONE
❌ User returns later → PHOTOS GONE
❌ Share link doesn't work → NO PHOTOS
```

## New (Fixed) Flow
```
User uploads photos
     ↓
Photos stored in React state (memory) + base64
     ↓
AI analyzes photos → analysis stored in state
     ↓
User clicks "Generate Presentation"
     ↓
┌─────────────────────────────────────────┐
│ 1. CREATE INSPECTION IN DATABASE        │
│    - property_address                    │
│    - customer_name                       │
│    - inspection_date                     │
│    - status: 'in_progress'               │
│    → Returns: inspectionId               │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ 2. SAVE PHOTOS TO DATABASE               │
│    For each photo:                       │
│    - photo_data (base64)                 │
│    - file_name, file_size, mime_type     │
│    - category (damage/detail)            │
│    - ai_analysis (JSON)                  │
│    - analyzed_at (timestamp)             │
│    → Returns: photoId[]                  │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ 3. CREATE JOB IN DATABASE                │
│    - title, status, priority             │
│    - customer info                       │
│    - property info                       │
│    → Returns: jobId                      │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ 4. LINK INSPECTION TO JOB                │
│    UPDATE inspections                    │
│    SET job_id = <jobId>                  │
│    WHERE id = <inspectionId>             │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ 5. CREATE PRESENTATION IN DATABASE       │
│    - inspection_id (linked)              │
│    - slides (JSON array with photoIds)   │
│    - customer_name, property_address     │
│    - presentation_type: 'insurance'      │
│    - status: 'ready'                     │
│    → Returns: presentationId             │
└─────────────────────────────────────────┘
     ↓
✅ Presentation shown (photos from database)
✅ User refreshes page → Photos reload from DB
✅ User returns later → Photos still available
✅ Share link works → Photos loaded by photoId
```

## Data Structure in Database

### inspections table
```sql
id                      | UUID (PK)
user_id                 | UUID (FK → users)
job_id                  | UUID (FK → jobs)
property_address        | TEXT
customer_name           | TEXT
inspection_date         | TIMESTAMPTZ
status                  | TEXT (draft/in_progress/completed)
photo_count             | INTEGER (auto-incremented by trigger)
analyzed_photo_count    | INTEGER (auto-incremented by trigger)
created_at              | TIMESTAMPTZ
updated_at              | TIMESTAMPTZ
```

### inspection_photos table
```sql
id                      | UUID (PK)
inspection_id           | UUID (FK → inspections)
user_id                 | UUID (FK → users)
photo_data              | TEXT (base64 encoded image)
file_name               | TEXT
file_size               | INTEGER
mime_type               | TEXT
category                | TEXT (damage/overview/detail/other)
notes                   | TEXT
ai_analysis             | JSONB
  ├─ damageType
  ├─ severity
  ├─ location
  ├─ description
  ├─ recommendations[]
  ├─ insuranceRelevant
  └─ urgency
analyzed_at             | TIMESTAMPTZ
created_at              | TIMESTAMPTZ
```

### presentations table
```sql
id                      | UUID (PK)
inspection_id           | UUID (FK → inspections)
user_id                 | UUID (FK → users)
title                   | TEXT
customer_name           | TEXT
property_address        | TEXT
presentation_type       | TEXT (standard/insurance/detailed)
slides                  | JSONB (array of slide objects)
  └─ Each slide:
     ├─ id
     ├─ type
     ├─ title
     ├─ content
     ├─ photoId          ← Database photo ID!
     └─ order
branding                | JSONB
share_token             | TEXT (unique, for public sharing)
is_public               | BOOLEAN
view_count              | INTEGER
status                  | TEXT (draft/ready/shared)
created_at              | TIMESTAMPTZ
updated_at              | TIMESTAMPTZ
```

## API Endpoints Used

### Creating Flow
```
POST   /api/inspections
POST   /api/inspections/:id/photos
PATCH  /api/inspections/:id
POST   /api/presentations
POST   /api/presentations/:id/share
```

### Loading Flow
```
GET    /api/inspections/:id
GET    /api/inspections/:id/photos
GET    /api/presentations/:id
GET    /api/present/:token (public - no auth)
```

## Share Link Flow

### When Rep Shares Presentation
```
Rep clicks "Share" button
     ↓
POST /api/presentations/:id/share
     ↓
Backend generates unique share_token
     ↓
Updates presentation:
  - share_token = 'abc123xyz456'
  - is_public = true
  - status = 'shared'
     ↓
Returns share URL:
  https://app.com/api/present/abc123xyz456
     ↓
Rep copies link and sends to homeowner
```

### When Homeowner Opens Link
```
Homeowner opens:
  https://app.com/api/present/abc123xyz456
     ↓
GET /api/present/:token (no auth required)
     ↓
Backend:
  - Looks up presentation by share_token
  - Checks is_public = true
  - Increments view_count
  - Returns presentation with slides
     ↓
Frontend:
  - Reads slides from presentation.slides
  - For each slide with photoId:
    - Fetches photo from database
    - Loads photo_data (base64)
    - Displays in presentation
     ↓
✅ Homeowner sees full presentation with all photos
```

## Database Triggers

### Auto-increment photo_count
```sql
CREATE TRIGGER trigger_update_photo_count
AFTER INSERT OR DELETE ON inspection_photos
FOR EACH ROW
EXECUTE FUNCTION update_inspection_photo_count();
```

### Auto-increment analyzed_photo_count
```sql
CREATE TRIGGER trigger_update_analyzed_count
AFTER UPDATE ON inspection_photos
FOR EACH ROW
EXECUTE FUNCTION update_analyzed_photo_count();
```

## Performance Considerations

### Photo Storage
- Base64 encoding increases size by ~33%
- 10MB JPEG → ~13.3MB base64
- PostgreSQL TEXT field can handle it
- Consider future migration to S3 for large volume

### Query Optimization
- Indexed fields: inspection_id, user_id, analyzed_at
- Photos loaded separately (not with slides)
- Share token indexed for fast lookup

### Caching Strategy (Future)
- Cache presentation by share_token (Redis)
- Cache photos separately (CDN)
- Invalidate on update

## Security

### Authentication
- All write operations require x-user-email header
- User ID validated against database
- Ownership checked before updates

### Authorization
- Reps can only access their own inspections
- Admin role can access all
- Public presentations (is_public=true) accessible to anyone

### Data Validation
- UUID format validation
- MIME type whitelist
- File size limits (10MB)
- SQL injection prevention (parameterized queries)

## Testing Checklist

- [ ] Upload photos → verify saved to database
- [ ] Generate presentation → verify inspection/job/presentation created
- [ ] Refresh page → verify photos reload
- [ ] Share presentation → verify link works
- [ ] Open share link in incognito → verify photos display
- [ ] Check database for correct data
- [ ] Verify photo counts auto-increment
- [ ] Test with 20 photos (max)
- [ ] Test error handling (network failure)
- [ ] Test concurrent uploads
