# API Quick Reference - Gemini Field Assistant

**Production Base URL:** `https://sa21.up.railway.app`

---

## Quick Stats
- **Total Endpoints:** 59
- **Feature Areas:** 10
- **Authentication:** Email header (`x-user-email`)
- **Database:** PostgreSQL
- **Server Status:** ✅ ONLINE

---

## Endpoint Summary by Feature

| Feature | Endpoints | Base Route | Key Capabilities |
|---------|-----------|------------|------------------|
| **Susan AI Chat** | 8 | `/api/chat` | Save messages, feedback, learning patterns |
| **Team Messaging** | 23 | `/api/messages`, `/api/team` | Conversations, attachments, reactions, polls |
| **Roof Feed** | 12 | `/api/roof` | Posts, comments, likes, @mentions |
| **Job Management** | 11 | `/api/jobs` | CRUD jobs, notes, actions, stats |
| **Hail Lookups** | 3 | `/api/hail` | Storm search, monitoring, IHM integration |
| **Storm Memory** | 15 | `/api/storm-memory` | Save lookups, nearby search, outcomes |
| **Canvassing** | 10 | `/api/canvassing` | Mark addresses, sessions, stats, heatmap |
| **Impacted Assets** | 10 | `/api/assets` | Monitor customers, alerts, conversions |
| **Territories** | 9 | `/api/territories` | Territory CRUD, check-in/out, leaderboard |
| **System** | 10+ | `/api/users`, `/api/health` | Users, health, documents, analytics |

---

## Essential API Calls

### 1. Health Check
```bash
GET https://sa21.up.railway.app/api/health
# Response: 200 OK with server status
```

### 2. Susan AI Chat - Save Message
```bash
POST https://sa21.up.railway.app/api/chat/messages
Headers: x-user-email: user@example.com
Body: {
  "message_id": "uuid",
  "sender": "user",
  "content": "What's the weather?",
  "session_id": "session-uuid",
  "provider": "gemini"
}
```

### 3. Get Chat History
```bash
GET https://sa21.up.railway.app/api/chat/messages?session_id=session-uuid
Headers: x-user-email: user@example.com
```

### 4. Team Messaging - Get Conversations
```bash
GET https://sa21.up.railway.app/api/messages/conversations
Headers: x-user-email: user@example.com
# Returns all conversations with unread counts
```

### 5. Hail Storm Search
```bash
GET https://sa21.up.railway.app/api/hail/search?street=123+Main+St&city=Austin&state=TX&zip=78701&months=24
# Returns storm events for address
```

### 6. Save Storm Memory
```bash
POST https://sa21.up.railway.app/api/storm-memory/save
Headers: x-user-email: user@example.com
Body: {
  "address": "123 Main St",
  "city": "Austin",
  "state": "TX",
  "zipCode": "78701",
  "latitude": 30.2672,
  "longitude": -97.7431,
  "stormEvents": [
    {
      "eventType": "hail",
      "date": "2024-05-15",
      "magnitude": 1.75,
      "source": "ihm"
    }
  ],
  "dataSources": { "ihm": true }
}
```

### 7. Mark Canvassing Address
```bash
POST https://sa21.up.railway.app/api/canvassing/mark
Headers: x-user-email: user@example.com
Body: {
  "address": "456 Oak Ave",
  "status": "contacted",
  "city": "Austin",
  "state": "TX",
  "zipCode": "78702",
  "latitude": 30.2672,
  "longitude": -97.7431,
  "notes": "Interested in inspection"
}
```

### 8. Create Job
```bash
POST https://sa21.up.railway.app/api/jobs
Headers: x-user-email: user@example.com
Body: {
  "customer": {
    "name": "John Smith",
    "phone": "512-555-1234",
    "email": "john@example.com"
  },
  "property": {
    "address": "123 Main St",
    "city": "Austin",
    "state": "TX",
    "zip": "78701"
  },
  "status": "new_lead",
  "priority": "high"
}
```

### 9. Get Jobs with Filters
```bash
GET https://sa21.up.railway.app/api/jobs?status=new_lead,contacted&priority=high&limit=50
Headers: x-user-email: user@example.com
```

### 10. Create Team Post
```bash
POST https://sa21.up.railway.app/api/roof/posts
Headers: x-user-email: user@example.com
Body: {
  "content": "Great job today team! @john closed 3 deals 🎉",
  "post_type": "text"
}
```

---

## Authentication

**Method:** Email header-based
**Header Name:** `x-user-email`
**Example:** `x-user-email: roofer@example.com`

**Note:** In production, ensure email is validated/authenticated upstream (e.g., Firebase Auth, Auth0).

---

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { /* result object */ },
  "count": 10,  // For list endpoints
  "pagination": { /* pagination info */ }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message here"
}
```

### HTTP Status Codes
- `200` - Success (GET)
- `201` - Created (POST)
- `400` - Bad request (validation failed)
- `401` - Unauthorized (missing/invalid email)
- `403` - Forbidden (access denied)
- `404` - Not found
- `500` - Server error

---

## Common Query Parameters

### Pagination
- `limit` - Number of results (default varies by endpoint)
- `offset` - Skip N results
- `before_message_id` - Cursor-based pagination (messaging)

### Filtering
- `status` - Filter by status (jobs, canvassing)
- `priority` - Filter by priority
- `search` - Text search
- `userOnly` - Show only current user's data (true/false)

### Geographic
- `lat`, `lng` - Latitude/longitude
- `radius` - Search radius in miles
- `city`, `state`, `zipCode` - Address components

### Date Ranges
- `daysBack` - N days of history
- `dateFrom`, `dateTo` - Date range (YYYY-MM-DD)

---

## WebSocket Events

**Connection:** Real-time updates via `presenceService`

### Events Emitted (Server → Client)
- `new_message` - New team message received
- `reaction_update` - Emoji reaction added/removed
- `read_receipt` - Message read by user
- `notification` - New notification
- `presence_update` - User online/offline status
- `pin_update` - Message pinned/unpinned
- `poll_vote_update` - Poll vote changed
- `event_rsvp_update` - Event RSVP changed

---

## File Upload

### Attachment Upload (Team Messages)
```bash
POST https://sa21.up.railway.app/api/messages/attachments
Headers: x-user-email: user@example.com
Body: {
  "name": "roof-photo.jpg",
  "type": "image/jpeg",
  "size": 1024000,
  "data_url": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

**Limits:**
- Max size: 10MB
- Format: Base64 data URL
- Storage: Server filesystem at `/uploads/messages/`

---

## Storm Data Integration

### Interactive Hail Maps (IHM)
- **Status endpoint:** `/api/hail/status`
- **Search methods:** Address, coordinates, marker ID
- **Default lookback:** 24 months
- **Radius:** Configurable (default 0 miles = exact location)

### Storm Memory System
- **Purpose:** Learn from verified lookups
- **Sharing:** Team-wide or user-only
- **Outcomes:** Track claim success rates
- **Search:** By location, event type, date range

---

## Geospatial Queries

### Nearby Search (Haversine Distance)
Used in:
- Storm memory: `/api/storm-memory/nearby?lat=30.27&lng=-97.74&radius=10`
- Canvassing: `/api/canvassing/nearby?lat=30.27&lng=-97.74&radius=1`
- Neighborhood intel: `/api/canvassing/intel?lat=30.27&lng=-97.74&radius=0.5`

**Note:** Radius in miles. Server calculates distance using Haversine formula.

---

## Admin Endpoints

**Located in:** `server/index.ts` (inline, not in route files)

### Admin Operations
- `GET /api/admin/users` - List all users
- `GET /api/admin/conversations` - All conversations
- `GET /api/admin/emails` - Email logs
- `GET /api/admin/analytics/*` - Analytics dashboards
- `POST /api/admin/trigger-daily-summary` - Manual summary
- `POST /api/admin/run-migration` - Database migrations

**Authorization:** Requires `role: 'admin'` in users table

---

## Rate Limits

### Applied Routes
- General API: All `/api/` routes (standard limit)
- Write operations: `/api/chat/messages`, `/api/documents/`
- Email operations: `/api/emails/`, `/api/notifications/email`
- Verification codes: `/api/auth/send-verification-code`

**Implementation:** Express rate-limit middleware

---

## CORS Configuration

### Allowed Origins
- `https://sa21.up.railway.app` (production)
- `https://a21.up.railway.app` (legacy)
- `http://localhost:3000`, `http://localhost:3001` (dev)
- `capacitor://localhost`, `ionic://localhost` (mobile)

### Headers Allowed
- `x-user-email` (authentication)
- `Content-Type`, `Authorization`, `Accept`
- Credentials: Enabled

---

## Environment Variables

### Required
```bash
DATABASE_URL=postgresql://...
INTERACTIVE_HAIL_MAPS_API_KEY=your-ihm-key
GEMINI_API_KEY=your-gemini-key
OPENAI_API_KEY=your-openai-key
```

### Optional
```bash
NODE_ENV=production
PORT=3001
```

---

## Testing the API

### cURL Examples

**Health Check:**
```bash
curl https://sa21.up.railway.app/api/health
```

**Get User Info:**
```bash
curl -H "x-user-email: test@example.com" \
  https://sa21.up.railway.app/api/users/me
```

**Create Job:**
```bash
curl -X POST \
  -H "x-user-email: test@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {"name": "Test Customer"},
    "property": {"address": "123 Test St", "city": "Austin", "state": "TX", "zip": "78701"}
  }' \
  https://sa21.up.railway.app/api/jobs
```

### Postman Collection
Recommended: Import endpoints into Postman with environment variable for base URL.

---

## Database Tables Quick Reference

### Core Data Models
- `users` - Authentication and profiles
- `chat_messages` - Susan AI conversations
- `chat_feedback` - Learning and feedback
- `jobs` - Job management
- `storm_lookups` - Storm memory
- `canvassing_addresses` - Door-to-door tracking
- `customer_properties` - Asset monitoring
- `impact_alerts` - Storm alerts

### Team Communication
- `conversations` + `conversation_participants`
- `team_messages` + `message_reactions` + `message_mentions`
- `team_posts` + `post_comments` + `post_likes`
- `team_notifications`

### Territory Management
- `territories`
- `territory_checkins`

---

## Support & Documentation

**Full Audit Report:** See `BACKEND_API_AUDIT_REPORT.md`
**Server Code:** `/Users/a21/gemini-field-assistant/server/`
**Database Migrations:** `/Users/a21/gemini-field-assistant/database/migrations/`

---

**Last Updated:** January 30, 2026
**Production URL:** https://sa21.up.railway.app
**Status:** ✅ ONLINE
