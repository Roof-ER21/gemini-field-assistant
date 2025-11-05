# Analytics & Monitoring API Endpoints

This document describes all the analytics and monitoring endpoints added to the S21 ROOFER admin panel.

## Table of Contents
1. [Activity Tracking Endpoints](#activity-tracking-endpoints)
2. [Admin Analytics Endpoints](#admin-analytics-endpoints)
3. [Concerning Chats Monitoring](#concerning-chats-monitoring)
4. [Data Models](#data-models)

---

## Activity Tracking Endpoints

### 1. Track Live Susan Session

**Endpoint:** `POST /api/activity/live-susan`

**Description:** Track Live Susan voice assistant sessions (start/end)

**Headers:**
- `x-user-email`: User's email address

**Request Body:**

For starting a session:
```json
{
  "action": "start"
}
```

For ending a session:
```json
{
  "action": "end",
  "session_id": "uuid-of-session",
  "message_count": 15,
  "double_tap_stops": 3
}
```

**Response:**

Start action:
```json
{
  "session_id": "uuid-of-created-session"
}
```

End action:
```json
{
  "success": true,
  "duration_seconds": 180
}
```

**Database:** `live_susan_sessions` table

---

### 2. Log Transcription Activity

**Endpoint:** `POST /api/activity/transcription`

**Description:** Log voice transcription usage

**Headers:**
- `x-user-email`: User's email address

**Request Body:**
```json
{
  "audio_duration_seconds": 30,
  "transcription_text": "Full transcription text here...",
  "word_count": 125,
  "provider": "Gemini"
}
```

**Response:**
```json
{
  "success": true,
  "transcription_id": "uuid",
  "created_at": "2025-01-05T10:30:00.000Z"
}
```

**Database:** `transcriptions` table

---

### 3. Log Document Upload Activity

**Endpoint:** `POST /api/activity/document-upload`

**Description:** Log document and image uploads with analysis results

**Headers:**
- `x-user-email`: User's email address

**Request Body:**
```json
{
  "file_name": "roof_damage.jpg",
  "file_type": "jpg",
  "file_size_bytes": 2048576,
  "analysis_performed": true,
  "analysis_type": "roof_damage",
  "analysis_result": "Detected: Missing shingles, water damage on north side"
}
```

**Response:**
```json
{
  "success": true,
  "upload_id": "uuid",
  "created_at": "2025-01-05T10:30:00.000Z"
}
```

**Database:** `document_uploads` table

---

## Admin Analytics Endpoints

> **Note:** All admin endpoints require `x-user-email` header with admin-level user

### 4. Analytics Overview

**Endpoint:** `GET /api/admin/analytics/overview`

**Description:** Get high-level platform statistics

**Headers:**
- `x-user-email`: Admin user's email address

**Response:**
```json
{
  "total_users": 45,
  "active_users_7d": 32,
  "total_conversations": 1234,
  "total_messages": 5678,
  "emails_generated": 234,
  "transcriptions_created": 567,
  "documents_uploaded": 123,
  "susan_sessions": 89
}
```

**Database:** Aggregates from multiple tables

---

### 5. User Activity Breakdown

**Endpoint:** `GET /api/admin/analytics/user-activity?timeRange={today|week|month|all}`

**Description:** Get detailed activity breakdown per user

**Headers:**
- `x-user-email`: Admin user's email address

**Query Parameters:**
- `timeRange` (optional): `today`, `week`, `month`, or `all` (default: `all`)

**Response:**
```json
[
  {
    "user_id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "sales_rep",
    "state": "VA",
    "total_messages": 234,
    "emails_generated": 12,
    "transcriptions_created": 45,
    "documents_uploaded": 23,
    "susan_sessions": 15,
    "unique_documents_viewed": 34,
    "favorite_documents": 5,
    "images_analyzed": 8,
    "last_active": "2025-01-05T10:30:00.000Z",
    "user_since": "2024-12-01T08:00:00.000Z"
  }
]
```

**Database:** `user_activity_enhanced` view

---

### 6. Feature Usage Over Time

**Endpoint:** `GET /api/admin/analytics/feature-usage?timeRange={today|week|month|all}`

**Description:** Get feature usage trends over time (chart-ready format)

**Headers:**
- `x-user-email`: Admin user's email address

**Query Parameters:**
- `timeRange` (optional): `today`, `week`, `month`, or `all` (default: `week`)

**Response:**
```json
{
  "labels": ["2025-01-01", "2025-01-02", "2025-01-03"],
  "datasets": [
    {
      "name": "Chat",
      "data": [45, 67, 89]
    },
    {
      "name": "Email",
      "data": [12, 15, 18]
    },
    {
      "name": "Transcription",
      "data": [23, 34, 45]
    }
  ]
}
```

**Database:** `daily_activity_metrics` view

---

### 7. Knowledge Base Analytics

**Endpoint:** `GET /api/admin/analytics/knowledge-base`

**Description:** Get knowledge base usage analytics

**Headers:**
- `x-user-email`: Admin user's email address

**Response:**
```json
{
  "most_viewed": [
    {
      "document_path": "/docs/insurance/va-guidelines.pdf",
      "document_name": "VA Insurance Guidelines",
      "document_category": "Insurance",
      "unique_viewers": 25,
      "total_views": 123,
      "avg_time_spent": 180
    }
  ],
  "most_favorited": [
    {
      "document_path": "/docs/roofing/materials.pdf",
      "document_name": "Roofing Materials Guide",
      "document_category": "Roofing",
      "favorite_count": 15
    }
  ],
  "search_queries": [
    {
      "search_query": "insurance claim process",
      "search_count": 45,
      "last_searched": "2025-01-05T10:30:00.000Z"
    }
  ],
  "category_breakdown": {
    "Insurance": {
      "document_count": 12,
      "total_views": 456
    },
    "Roofing": {
      "document_count": 23,
      "total_views": 789
    }
  }
}
```

**Database:** `document_views`, `document_favorites`, `search_analytics` tables

---

### 8. Per-User Analytics Table

**Endpoint:** `GET /api/admin/analytics/per-user`

**Description:** Get comprehensive per-user analytics (table format, sorted by activity)

**Headers:**
- `x-user-email`: Admin user's email address

**Response:**
```json
[
  {
    "user_id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "sales_rep",
    "state": "VA",
    "total_messages": 234,
    "emails_generated": 12,
    "transcriptions_created": 45,
    "documents_uploaded": 23,
    "susan_sessions": 15,
    "unique_documents_viewed": 34,
    "favorite_documents": 5,
    "images_analyzed": 8,
    "last_active": "2025-01-05T10:30:00.000Z",
    "user_since": "2024-12-01T08:00:00.000Z"
  }
]
```

**Database:** `user_activity_enhanced` view (sorted by `total_messages DESC`)

---

## Concerning Chats Monitoring

### 9. Get Concerning/Flagged Chats

**Endpoint:** `GET /api/admin/concerning-chats?severity={critical|warning|info|all}`

**Description:** Get list of flagged concerning chat messages

**Headers:**
- `x-user-email`: Admin user's email address

**Query Parameters:**
- `severity` (optional): `critical`, `warning`, `info`, or `all` (default: `all`)

**Response:**
```json
[
  {
    "id": "uuid",
    "session_id": "uuid",
    "user_id": "uuid",
    "message_id": "msg_123",
    "concern_type": "state_mismatch",
    "severity": "critical",
    "flagged_content": "The full message content that was flagged",
    "context": "Additional context or surrounding messages",
    "detection_reason": "Susan referenced MD but user is in VA",
    "flagged_at": "2025-01-05T10:30:00.000Z",
    "reviewed": false,
    "reviewed_by": null,
    "reviewed_at": null,
    "review_notes": null,
    "user_email": "user@example.com",
    "user_name": "John Doe",
    "user_state": "VA",
    "reviewer_email": null
  }
]
```

**Concern Types:**
- `state_mismatch` - Susan referenced wrong state
- `off_topic` - Off-topic or inappropriate queries
- `inappropriate` - Inappropriate language
- `legal` - Potential legal concerns
- `confusion` - User expressing confusion/dissatisfaction
- `competitor` - Competitor mentions

**Severity Levels:**
- `critical` - Immediate attention required
- `warning` - Should be reviewed soon
- `info` - For information/monitoring

**Database:** `concerning_chats` table with joins to `users`

---

### 10. Trigger Manual Scan for Concerning Chats

**Endpoint:** `POST /api/admin/concerning-chats/scan`

**Description:** Manually scan recent messages (last 24 hours) for concerning content

**Headers:**
- `x-user-email`: Admin user's email address

**Response:**
```json
{
  "success": true,
  "scanned": 234,
  "flagged": 5
}
```

**Logic:**
- Scans all messages from last 24 hours
- Uses `chatMonitorService` for detection
- Inserts new flags into `concerning_chats` table
- Skips messages already flagged with same concern type

**Database:** Reads from `chat_history`, writes to `concerning_chats`

---

### 11. Mark Concerning Chat as Reviewed

**Endpoint:** `PATCH /api/admin/concerning-chats/:id/review`

**Description:** Mark a flagged chat as reviewed by admin

**Headers:**
- `x-user-email`: Admin user's email address

**URL Parameters:**
- `id`: UUID of the concerning chat record

**Request Body:**
```json
{
  "review_notes": "Reviewed - false positive, user was asking about general information"
}
```

**Response:**
```json
{
  "success": true,
  "id": "uuid",
  "reviewed": true,
  "reviewed_by": "admin-uuid",
  "reviewed_at": "2025-01-05T10:30:00.000Z",
  "review_notes": "Reviewed - false positive...",
  ...
}
```

**Database:** Updates `concerning_chats` table

---

## Data Models

### Live Susan Sessions
```sql
CREATE TABLE live_susan_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  message_count INTEGER DEFAULT 0,
  double_tap_stops INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Transcriptions
```sql
CREATE TABLE transcriptions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  audio_duration_seconds INTEGER,
  transcription_text TEXT,
  word_count INTEGER,
  provider VARCHAR(50) DEFAULT 'Gemini',
  state VARCHAR(2),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Document Uploads
```sql
CREATE TABLE document_uploads (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name VARCHAR(255),
  file_type VARCHAR(50),
  file_size_bytes INTEGER,
  analysis_performed BOOLEAN DEFAULT FALSE,
  analysis_type VARCHAR(50),
  analysis_result TEXT,
  state VARCHAR(2),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Concerning Chats
```sql
CREATE TABLE concerning_chats (
  id UUID PRIMARY KEY,
  session_id UUID,
  user_id UUID NOT NULL,
  message_id VARCHAR(100),
  concern_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  flagged_content TEXT NOT NULL,
  context TEXT,
  detection_reason TEXT,
  flagged_at TIMESTAMP DEFAULT NOW(),
  reviewed BOOLEAN DEFAULT FALSE,
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  review_notes TEXT
);
```

---

## Helper Functions

### Time Range Filter
```typescript
function getTimeRangeFilter(timeRange: string, columnName: string = 'created_at'): string {
  switch (timeRange) {
    case 'today': return `${columnName} >= CURRENT_DATE`;
    case 'week': return `${columnName} >= CURRENT_DATE - INTERVAL '7 days'`;
    case 'month': return `${columnName} >= CURRENT_DATE - INTERVAL '30 days'`;
    default: return '1=1'; // all time
  }
}
```

### Admin Check
```typescript
async function isAdmin(email: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  );
  return result.rows.length > 0 && result.rows[0].role === 'admin';
}
```

---

## Views Used

### user_activity_enhanced
Aggregates all user activity metrics across tables:
- Chat messages
- Emails generated
- Transcriptions
- Document uploads
- Susan sessions
- Document views/favorites
- Image analysis

### daily_activity_metrics
Daily activity counts by activity type:
- chat
- email
- transcription
- upload
- susan_session
- knowledge_base

---

## Security Notes

1. **Admin Authorization**: All `/api/admin/*` endpoints check for admin role using `isAdmin()` helper
2. **User Context**: Non-admin endpoints use `x-user-email` header to identify user
3. **SQL Injection Prevention**: All queries use parameterized statements
4. **Input Validation**: Endpoints validate required fields and data types
5. **Error Handling**: All endpoints wrapped in try-catch with proper error responses

---

## Performance Considerations

1. **Indexes**: All date columns and foreign keys are indexed
2. **Views**: Pre-aggregated views for fast analytics queries
3. **Limits**: Query results limited (e.g., 100 concerning chats, 10 popular docs)
4. **Time Filtering**: Time range filters reduce dataset size
5. **Aggregation**: Uses PostgreSQL aggregate functions for efficiency

---

## Testing

### Test Activity Tracking
```bash
# Start Live Susan session
curl -X POST http://localhost:3001/api/activity/live-susan \
  -H "Content-Type: application/json" \
  -H "x-user-email: test@roofer.com" \
  -d '{"action":"start"}'

# Log transcription
curl -X POST http://localhost:3001/api/activity/transcription \
  -H "Content-Type: application/json" \
  -H "x-user-email: test@roofer.com" \
  -d '{"audio_duration_seconds":30,"transcription_text":"Test","word_count":10,"provider":"Gemini"}'
```

### Test Admin Analytics
```bash
# Get overview (requires admin email)
curl http://localhost:3001/api/admin/analytics/overview \
  -H "x-user-email: admin@roofer.com"

# Get user activity for last week
curl "http://localhost:3001/api/admin/analytics/user-activity?timeRange=week" \
  -H "x-user-email: admin@roofer.com"

# Scan for concerning chats
curl -X POST http://localhost:3001/api/admin/concerning-chats/scan \
  -H "x-user-email: admin@roofer.com"
```

---

## Integration with Frontend

The frontend admin panel should:

1. **Dashboard**: Call `/api/admin/analytics/overview` for stats cards
2. **User Activity Table**: Call `/api/admin/analytics/per-user`
3. **Feature Usage Chart**: Call `/api/admin/analytics/feature-usage?timeRange=week`
4. **Knowledge Base Tab**: Call `/api/admin/analytics/knowledge-base`
5. **Concerning Chats Tab**: Call `/api/admin/concerning-chats?severity=critical`
6. **Manual Scan Button**: Call `/api/admin/concerning-chats/scan`
7. **Review Modal**: Call `PATCH /api/admin/concerning-chats/:id/review`

---

## Future Enhancements

1. **Real-time Monitoring**: WebSocket connections for live chat monitoring
2. **Export Functionality**: CSV/Excel export of analytics data
3. **Scheduled Scans**: Automatic scanning via cron job
4. **Alert System**: Email/Slack notifications for critical flags
5. **Trend Analysis**: Week-over-week and month-over-month comparisons
6. **User Segmentation**: Analytics by state, role, or custom segments
7. **Custom Dashboards**: User-configurable analytics views

---

## Changelog

**Version 1.0.0** (2025-01-05)
- Initial release with 11 analytics endpoints
- Activity tracking for Live Susan, transcriptions, and uploads
- Admin analytics overview and user activity breakdown
- Feature usage trends and knowledge base analytics
- Concerning chats monitoring with manual scan and review
