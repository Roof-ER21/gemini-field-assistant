# 📚 SA21 Field AI - Complete API Reference

## Base URL

```
Production: https://sa21.up.railway.app/api
Local Dev: http://localhost:3001/api
```

---

## 🔐 Authentication

All endpoints use **header-based authentication**:

```bash
# Include user email in request headers
curl -H "x-user-email: user@example.com" https://sa21.up.railway.app/api/users/me
```

**Note**: No traditional `/auth/login` endpoint exists. Authentication is client-side using localStorage.

---

## 📊 API Endpoints (57 Total)

### 1. Health & System Information

#### GET `/api/health`
Check API and database health status.

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-11-15T18:28:10.314Z"
}
```

**Example:**
```bash
curl https://sa21.up.railway.app/api/health
```

---

#### GET `/api/providers/status`
Check which AI providers are configured.

**Response:**
```json
{
  "groq": true,
  "together": true,
  "huggingface": false,
  "gemini": true,
  "anyConfigured": true,
  "environment": "production"
}
```

**Example:**
```bash
curl https://sa21.up.railway.app/api/providers/status
```

---

#### GET `/api/version`
Get deployment version and build info.

**Response:**
```json
{
  "service": "s21-field-assistant-api",
  "commit": "affdb41cc0006cfa6234fa24326fedecdff495b2",
  "builtAt": "2025-11-15T18:28:22.605Z"
}
```

**Example:**
```bash
curl https://sa21.up.railway.app/api/version
```

---

### 2. User Management

#### GET `/api/users/me`
Get current user profile.

**Headers Required:**
- `x-user-email`: User's email address

**Response:**
```json
{
  "id": "uuid-here",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "sales_rep",
  "state": "VA",
  "created_at": "2025-11-15T10:00:00.000Z"
}
```

**Example:**
```bash
curl -H "x-user-email: user@example.com" \
  https://sa21.up.railway.app/api/users/me
```

---

#### GET `/api/users/:email`
Get user profile by email.

**Parameters:**
- `email`: User's email address (URL encoded)

**Response:**
```json
{
  "id": "uuid-here",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "sales_rep"
}
```

**Example:**
```bash
curl https://sa21.up.railway.app/api/users/user%40example.com
```

---

#### POST `/api/users`
Create or update a user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "state": "VA"
}
```

**Response:**
```json
{
  "id": "uuid-here",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "sales_rep",
  "state": "VA"
}
```

**Example:**
```bash
curl -X POST https://sa21.up.railway.app/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","name":"John Doe","state":"VA"}'
```

---

### 3. Chat History

#### POST `/api/chat/messages`
Save a chat message to the database.

**Headers Required:**
- `x-user-email`: User's email address

**Request Body:**
```json
{
  "sessionId": "unique-session-id",
  "role": "user",
  "content": "What is wind damage?",
  "persona": "susan",
  "timestamp": "2025-11-15T10:30:00.000Z"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "uuid-here"
}
```

**Example:**
```bash
curl -X POST https://sa21.up.railway.app/api/chat/messages \
  -H "x-user-email: user@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123",
    "role": "user",
    "content": "What is wind damage?",
    "persona": "susan"
  }'
```

---

#### GET `/api/chat/messages`
Retrieve chat history for current user.

**Headers Required:**
- `x-user-email`: User's email address

**Query Parameters:**
- `sessionId` (optional): Filter by session ID
- `persona` (optional): Filter by persona (susan/agnes)
- `limit` (optional): Max messages to return (default: 50)

**Response:**
```json
{
  "messages": [
    {
      "id": "uuid-here",
      "session_id": "session-123",
      "role": "user",
      "content": "What is wind damage?",
      "persona": "susan",
      "timestamp": "2025-11-15T10:30:00.000Z"
    },
    {
      "id": "uuid-here-2",
      "session_id": "session-123",
      "role": "assistant",
      "content": "Wind damage occurs when...",
      "persona": "susan",
      "timestamp": "2025-11-15T10:30:05.000Z"
    }
  ],
  "total": 2
}
```

**Example:**
```bash
# Get all messages
curl -H "x-user-email: user@example.com" \
  https://sa21.up.railway.app/api/chat/messages

# Get messages for specific session
curl -H "x-user-email: user@example.com" \
  "https://sa21.up.railway.app/api/chat/messages?sessionId=session-123"
```

---

### 4. Knowledge Base & Documents

#### POST `/api/documents/track-view`
Track when a user views a document.

**Headers Required:**
- `x-user-email`: User's email address

**Request Body:**
```json
{
  "documentName": "IRC 2021 Section R905.pdf",
  "category": "building_codes"
}
```

**Response:**
```json
{
  "success": true
}
```

**Example:**
```bash
curl -X POST https://sa21.up.railway.app/api/documents/track-view \
  -H "x-user-email: user@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "documentName": "IRC 2021 Section R905.pdf",
    "category": "building_codes"
  }'
```

---

#### GET `/api/documents/recent`
Get recently viewed documents for current user.

**Headers Required:**
- `x-user-email`: User's email address

**Query Parameters:**
- `limit` (optional): Max documents to return (default: 10)

**Response:**
```json
{
  "documents": [
    {
      "document_name": "IRC 2021 Section R905.pdf",
      "category": "building_codes",
      "view_count": 5,
      "last_viewed_at": "2025-11-15T10:00:00.000Z"
    }
  ]
}
```

**Example:**
```bash
curl -H "x-user-email: user@example.com" \
  "https://sa21.up.railway.app/api/documents/recent?limit=5"
```

---

#### POST `/api/documents/favorites`
Add a document to favorites.

**Headers Required:**
- `x-user-email`: User's email address

**Request Body:**
```json
{
  "documentName": "GAF Timberline Specs.pdf",
  "category": "manufacturer_specs"
}
```

**Response:**
```json
{
  "success": true,
  "favoriteId": "uuid-here"
}
```

---

#### DELETE `/api/documents/favorites/:id`
Remove a document from favorites.

**Headers Required:**
- `x-user-email`: User's email address

**Parameters:**
- `id`: Favorite ID (UUID)

**Response:**
```json
{
  "success": true
}
```

---

#### GET `/api/documents/favorites`
Get all favorite documents for current user.

**Headers Required:**
- `x-user-email`: User's email address

**Response:**
```json
{
  "favorites": [
    {
      "id": "uuid-here",
      "document_name": "GAF Timberline Specs.pdf",
      "category": "manufacturer_specs",
      "created_at": "2025-11-15T10:00:00.000Z"
    }
  ]
}
```

---

### 5. Email Notifications

#### POST `/api/emails/log`
Log a generated email (for admin tracking).

**Headers Required:**
- `x-user-email`: User's email address

**Request Body:**
```json
{
  "recipient": "adjuster@insurance.com",
  "subject": "Re: Claim #12345 - Hail Damage Documentation",
  "emailBody": "Dear Adjuster...",
  "templateUsed": "claim_appeal",
  "sentVia": "manual_copy"
}
```

**Response:**
```json
{
  "success": true,
  "emailId": "uuid-here"
}
```

---

#### POST `/api/notifications/email`
Send email notification (login codes, alerts, etc.).

**Request Body:**
```json
{
  "type": "login_code",
  "recipientEmail": "user@example.com",
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email sent successfully"
}
```

---

#### GET `/api/notifications/config`
Get email notification configuration status.

**Response:**
```json
{
  "configured": true,
  "provider": "Resend",
  "adminEmail": "admin@theroofdocs.com",
  "fromEmail": "s21-assistant@roofer.com"
}
```

---

### 6. Analytics

#### GET `/api/analytics/summary`
Get analytics summary for current user.

**Headers Required:**
- `x-user-email`: User's email address

**Response:**
```json
{
  "totalChats": 45,
  "totalDocumentViews": 89,
  "favoriteDocuments": 5,
  "emailsGenerated": 12,
  "lastActive": "2025-11-15T10:00:00.000Z"
}
```

---

#### GET `/api/analytics/popular-documents`
Get most viewed documents across all users.

**Query Parameters:**
- `limit` (optional): Max documents to return (default: 10)

**Response:**
```json
{
  "documents": [
    {
      "document_name": "IRC 2021 Section R905.pdf",
      "category": "building_codes",
      "total_views": 234,
      "unique_users": 45
    }
  ]
}
```

---

### 7. Activity Tracking

#### POST `/api/activity/log`
Log user activity (feature usage, interactions).

**Headers Required:**
- `x-user-email`: User's email address

**Request Body:**
```json
{
  "activityType": "chat_message",
  "metadata": {
    "persona": "susan",
    "messageLength": 150
  }
}
```

**Response:**
```json
{
  "success": true
}
```

---

#### GET `/api/activity/summary/:userId`
Get activity summary for a specific user.

**Parameters:**
- `userId`: User ID (UUID)

**Response:**
```json
{
  "userId": "uuid-here",
  "totalActivities": 567,
  "activitiesByType": {
    "chat_message": 234,
    "document_view": 123,
    "email_generated": 45
  },
  "lastActivity": "2025-11-15T10:00:00.000Z"
}
```

---

### 8. Admin Panel Endpoints

**All admin endpoints require admin role**

#### GET `/api/admin/users`
Get all users with detailed statistics.

**Headers Required:**
- `x-user-email`: Admin email address

**Response:**
```json
{
  "users": [
    {
      "id": "uuid-here",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "sales_rep",
      "totalChats": 45,
      "totalDocuments": 89,
      "lastActive": "2025-11-15T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

#### GET `/api/admin/users-basic`
Get basic user list (no stats).

**Headers Required:**
- `x-user-email`: Admin email address

**Response:**
```json
{
  "users": [
    {
      "id": "uuid-here",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "sales_rep"
    }
  ]
}
```

---

#### GET `/api/admin/conversations`
Get all conversations across all users.

**Headers Required:**
- `x-user-email`: Admin email address

**Query Parameters:**
- `limit` (optional): Max conversations to return
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "conversations": [
    {
      "session_id": "session-123",
      "user_email": "user@example.com",
      "message_count": 15,
      "first_message": "What is wind damage?",
      "last_updated": "2025-11-15T10:00:00.000Z"
    }
  ],
  "total": 100
}
```

---

#### GET `/api/admin/conversations/:sessionId`
Get detailed conversation by session ID.

**Headers Required:**
- `x-user-email`: Admin email address

**Parameters:**
- `sessionId`: Session ID

**Response:**
```json
{
  "sessionId": "session-123",
  "userEmail": "user@example.com",
  "messages": [
    {
      "role": "user",
      "content": "What is wind damage?",
      "timestamp": "2025-11-15T10:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Wind damage occurs when...",
      "timestamp": "2025-11-15T10:00:05.000Z"
    }
  ],
  "messageCount": 2
}
```

---

#### PATCH `/api/admin/users/:userId/role`
Update user role.

**Headers Required:**
- `x-user-email`: Admin email address

**Parameters:**
- `userId`: User ID (UUID)

**Request Body:**
```json
{
  "role": "manager"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "role": "manager"
  }
}
```

---

#### GET `/api/admin/emails`
Get all logged emails.

**Headers Required:**
- `x-user-email`: Admin email address

**Response:**
```json
{
  "emails": [
    {
      "id": "uuid-here",
      "user_email": "user@example.com",
      "recipient": "adjuster@insurance.com",
      "subject": "Re: Claim #12345",
      "template_used": "claim_appeal",
      "created_at": "2025-11-15T10:00:00.000Z"
    }
  ],
  "total": 45
}
```

---

#### GET `/api/admin/all-messages`
Get all chat messages across all users.

**Headers Required:**
- `x-user-email`: Admin email address

**Query Parameters:**
- `limit` (optional): Max messages to return

**Response:**
```json
{
  "messages": [...],
  "total": 1234
}
```

---

### 9. Budget Management

#### GET `/api/admin/budget/overview`
Get company-wide budget overview.

**Headers Required:**
- `x-user-email`: Admin email address

**Response:**
```json
{
  "companyLimit": 1000.00,
  "companyUsed": 234.56,
  "companyRemaining": 765.44,
  "periodStart": "2025-11-01",
  "periodEnd": "2025-11-30"
}
```

---

#### GET `/api/admin/budget/users`
Get per-user budget usage.

**Headers Required:**
- `x-user-email`: Admin email address

**Response:**
```json
{
  "users": [
    {
      "userId": "uuid-here",
      "email": "user@example.com",
      "limit": 100.00,
      "used": 45.67,
      "remaining": 54.33
    }
  ]
}
```

---

#### PUT `/api/admin/budget/user/:userId`
Update user budget limit.

**Headers Required:**
- `x-user-email`: Admin email address

**Parameters:**
- `userId`: User ID (UUID)

**Request Body:**
```json
{
  "limit": 150.00
}
```

---

### 10. Database Migrations (Admin Only)

#### POST `/api/admin/run-migration`
Run database migrations to create all tables.

**Headers Required:**
- `x-user-email`: Admin email address

**Response:**
```json
{
  "success": true,
  "message": "All migrations completed successfully"
}
```

---

#### POST `/api/admin/run-analytics-migration`
Run analytics-specific migrations.

**Headers Required:**
- `x-user-email`: Admin email address

**Response:**
```json
{
  "success": true,
  "tablesCreated": ["live_susan_sessions", "transcriptions", "document_uploads"]
}
```

---

### 11. Cron Jobs & Background Tasks

#### POST `/api/admin/trigger-daily-summary`
Manually trigger daily summary email.

**Headers Required:**
- `x-user-email`: Admin email address

**Response:**
```json
{
  "success": true,
  "message": "Daily summary email sent"
}
```

---

#### GET `/api/admin/cron-status`
Get status of cron jobs.

**Response:**
```json
{
  "dailySummary": {
    "active": true,
    "schedule": "0 18 * * *",
    "lastRun": "2025-11-14T18:00:00.000Z"
  }
}
```

---

## 🔒 Rate Limiting

All endpoints are rate-limited to prevent abuse:

| Endpoint Type | Window | Max Requests |
|--------------|--------|--------------|
| General API | 15 min | 100 requests |
| Write Operations (POST/PUT) | 15 min | 50 requests |
| Email Notifications | 1 hour | 10 requests |

**Rate limit headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699900800
```

---

## 🛡️ Security Headers

All responses include security headers via Helmet.js:
- Content-Security-Policy
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Strict-Transport-Security
- X-XSS-Protection

---

## 📝 Error Responses

### Standard Error Format

```json
{
  "error": "Error message here",
  "code": "ERROR_CODE",
  "timestamp": "2025-11-15T10:00:00.000Z"
}
```

### Common HTTP Status Codes

| Code | Meaning | When It Occurs |
|------|---------|----------------|
| 200 | OK | Success |
| 400 | Bad Request | Invalid request body/params |
| 401 | Unauthorized | Missing x-user-email header |
| 403 | Forbidden | Admin access required |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

---

## 🧪 Testing Examples

### Complete Workflow Test

```bash
# 1. Check health
curl https://sa21.up.railway.app/api/health

# 2. Create user
curl -X POST https://sa21.up.railway.app/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User","state":"VA"}'

# 3. Get user profile
curl -H "x-user-email: test@example.com" \
  https://sa21.up.railway.app/api/users/me

# 4. Save chat message
curl -X POST https://sa21.up.railway.app/api/chat/messages \
  -H "x-user-email: test@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-1",
    "role": "user",
    "content": "Test message",
    "persona": "susan"
  }'

# 5. Get chat history
curl -H "x-user-email: test@example.com" \
  "https://sa21.up.railway.app/api/chat/messages?sessionId=test-session-1"

# 6. Track document view
curl -X POST https://sa21.up.railway.app/api/documents/track-view \
  -H "x-user-email: test@example.com" \
  -H "Content-Type: application/json" \
  -d '{"documentName":"Test Doc.pdf","category":"building_codes"}'

# 7. Get analytics
curl -H "x-user-email: test@example.com" \
  https://sa21.up.railway.app/api/analytics/summary
```

---

**Last Updated**: November 15, 2025
**API Version**: 1.0.0
**Total Endpoints**: 57
