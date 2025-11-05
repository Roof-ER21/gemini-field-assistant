# Analytics API Fixes Required - Quick Reference

**Status:** CRITICAL - Frontend cannot display analytics data
**Root Cause:** Field naming convention mismatch (snake_case vs camelCase)
**Estimated Fix Time:** 2-3 hours
**Files to Modify:** 1 file - `/Users/a21/Desktop/S21-A24/gemini-field-assistant/server/index.ts`

---

## Summary of Issues

| Issue | Severity | Lines | Impact |
|-------|----------|-------|--------|
| Overview endpoint field names | CRITICAL | 1463-1472 | Stats cards show 0 |
| User Activity field names | CRITICAL | 1493-1515 | User table empty/broken |
| Feature Usage data structure | CRITICAL | 1536-1570 | Chart won't render |
| Knowledge Base field names | CRITICAL | 1578-1656 | KB stats missing |
| Concerning Chats field names | HIGH | 1719-1747 | Chat monitor broken |

---

## Fix #1: Overview Endpoint Response

**Location:** `server/index.ts` lines 1463-1472

**Current Code:**
```typescript
res.json({
  total_users: totalUsers.rows[0].count,
  active_users_7d: activeUsers7d.rows[0].count,
  total_conversations: totalConversations.rows[0].count,
  total_messages: totalMessages.rows[0].count,
  emails_generated: emailsGenerated.rows[0].count,
  transcriptions_created: transcriptionsCreated.rows[0].count,
  documents_uploaded: documentsUploaded.rows[0].count,
  susan_sessions: susanSessions.rows[0].count
});
```

**Replace With:**
```typescript
res.json({
  totalUsers: totalUsers.rows[0].count,
  activeUsers7d: activeUsers7d.rows[0].count,
  totalConversations: totalConversations.rows[0].count,
  totalMessages: totalMessages.rows[0].count,
  emailsGenerated: emailsGenerated.rows[0].count,
  transcriptions: transcriptionsCreated.rows[0].count,
  documentsUploaded: documentsUploaded.rows[0].count,
  susanSessions: susanSessions.rows[0].count
});
```

**Changes Made:**
- All fields changed to camelCase
- `transcriptions_created` → `transcriptions` (matches frontend interface)

---

## Fix #2: User Activity Endpoint Response

**Location:** `server/index.ts` lines 1493-1513

**Current Code:**
```typescript
const result = await pool.query(`
  SELECT
    user_id,
    email,
    name,
    role,
    state,
    total_messages,
    emails_generated,
    transcriptions_created,
    documents_uploaded,
    susan_sessions,
    unique_documents_viewed,
    favorite_documents,
    images_analyzed,
    last_active,
    user_since
  FROM user_activity_enhanced
  WHERE ${timeFilter.replace('created_at', 'last_active')}
  ORDER BY last_active DESC NULLS LAST
`);

res.json(result.rows);
```

**Replace With:**
```typescript
const result = await pool.query(`
  SELECT
    user_id AS "userId",
    email,
    name,
    role,
    state,
    total_messages AS chats,
    emails_generated AS emails,
    transcriptions_created AS transcriptions,
    documents_uploaded AS uploads,
    susan_sessions AS susan,
    unique_documents_viewed AS "kbViews",
    favorite_documents AS "favoriteDocuments",
    images_analyzed AS "imagesAnalyzed",
    last_active AS "lastActive",
    user_since AS "userSince"
  FROM user_activity_enhanced
  WHERE ${timeFilter.replace('created_at', 'last_active')}
  ORDER BY last_active DESC NULLS LAST
`);

res.json(result.rows);
```

**Changes Made:**
- Added SQL column aliases to match frontend interface exactly
- `total_messages` → `chats`
- `emails_generated` → `emails`
- `transcriptions_created` → `transcriptions`
- `documents_uploaded` → `uploads`
- `susan_sessions` → `susan`
- `unique_documents_viewed` → `kbViews`
- `last_active` → `lastActive`

---

## Fix #3: Feature Usage Endpoint Response

**Location:** `server/index.ts` lines 1536-1570

**Current Code:**
```typescript
const result = await pool.query(`
  SELECT
    activity_date,
    activity_type,
    count
  FROM daily_activity_metrics
  WHERE ${timeFilter}
  ORDER BY activity_date ASC, activity_type
`);

// Transform into chart-friendly format
const dataByDate: { [key: string]: { [key: string]: number } } = {};
const activityTypes = new Set<string>();

for (const row of result.rows) {
  const dateStr = row.activity_date.toISOString().split('T')[0];
  if (!dataByDate[dateStr]) {
    dataByDate[dateStr] = {};
  }
  dataByDate[dateStr][row.activity_type] = row.count;
  activityTypes.add(row.activity_type);
}

// Convert to arrays for charting
const labels = Object.keys(dataByDate).sort();
const datasets = Array.from(activityTypes).map(type => ({
  name: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
  data: labels.map(date => dataByDate[date][type] || 0)
}));

res.json({
  labels,
  datasets
});
```

**Replace With:**
```typescript
const result = await pool.query(`
  SELECT
    activity_date,
    activity_type,
    count
  FROM daily_activity_metrics
  WHERE ${timeFilter}
  ORDER BY activity_date ASC, activity_type
`);

// Transform into flat objects for frontend (Recharts compatible)
const dataByDate: { [key: string]: any } = {};

for (const row of result.rows) {
  const dateStr = row.activity_date.toISOString().split('T')[0];
  if (!dataByDate[dateStr]) {
    dataByDate[dateStr] = {
      date: dateStr,
      chat: 0,
      email: 0,
      upload: 0,
      transcribe: 0,
      susan: 0,
      knowledgeBase: 0
    };
  }

  // Map database activity types to frontend field names
  const activityTypeMap: { [key: string]: string } = {
    'chat': 'chat',
    'email': 'email',
    'upload': 'upload',
    'transcription': 'transcribe',
    'susan_session': 'susan',
    'knowledge_base': 'knowledgeBase'
  };

  const frontendField = activityTypeMap[row.activity_type];
  if (frontendField) {
    dataByDate[dateStr][frontendField] = row.count;
  }
}

// Convert to array of flat objects
const chartData = Object.values(dataByDate);

res.json(chartData);
```

**Changes Made:**
- Changed from `{labels[], datasets[]}` structure to flat objects array
- Each object has `{date, chat, email, upload, transcribe, susan, knowledgeBase}`
- Maps database activity types to frontend-expected field names
- Format matches Recharts LineChart expectations

---

## Fix #4: Knowledge Base Endpoint Response

**Location:** `server/index.ts` lines 1578-1656

**Current Code:**
```typescript
res.json({
  most_viewed: mostViewed.rows,
  most_favorited: mostFavorited.rows,
  search_queries: searchQueries,
  category_breakdown: categoryBreakdown.rows.reduce((acc: any, row: any) => {
    acc[row.document_category] = {
      document_count: row.document_count,
      total_views: row.total_views
    };
    return acc;
  }, {})
});
```

**Replace With:**
```typescript
res.json({
  mostViewed: mostViewed.rows.map(row => ({
    name: row.document_name,
    views: parseInt(row.total_views),
    category: row.document_category || 'Uncategorized'
  })),
  mostFavorited: mostFavorited.rows.map(row => ({
    name: row.document_name,
    favorites: parseInt(row.favorite_count),
    category: row.document_category || 'Uncategorized'
  })),
  topCategories: categoryBreakdown.rows.map(row => ({
    category: row.document_category || 'Uncategorized',
    count: parseInt(row.total_views)
  }))
});
```

**Changes Made:**
- `most_viewed` → `mostViewed` (camelCase)
- `document_name` → `name`
- `total_views` → `views`
- `most_favorited` → `mostFavorited` (camelCase)
- `favorite_count` → `favorites`
- `category_breakdown` object → `topCategories` array
- Removed `search_queries` (frontend doesn't use it)
- Added `parseInt()` for number fields
- Added fallback for null categories

---

## Fix #5: Concerning Chats Endpoint Response

**Location:** `server/index.ts` lines 1719-1747

**Current Code:**
```typescript
const result = await pool.query(`
  SELECT
    cc.id,
    cc.session_id,
    cc.user_id,
    cc.message_id,
    cc.concern_type,
    cc.severity,
    cc.flagged_content,
    cc.context,
    cc.detection_reason,
    cc.flagged_at,
    cc.reviewed,
    cc.reviewed_by,
    cc.reviewed_at,
    cc.review_notes,
    u.email as user_email,
    u.name as user_name,
    u.state as user_state,
    reviewer.email as reviewer_email
  FROM concerning_chats cc
  JOIN users u ON cc.user_id = u.id
  LEFT JOIN users reviewer ON cc.reviewed_by = reviewer.id
  WHERE ${severityFilter}
  ORDER BY cc.flagged_at DESC
  LIMIT 100
`);

res.json(result.rows);
```

**Replace With:**
```typescript
const result = await pool.query(`
  SELECT
    cc.id,
    cc.session_id AS "sessionId",
    cc.user_id AS "userId",
    cc.message_id AS "messageId",
    cc.concern_type AS "concernType",
    cc.severity,
    cc.flagged_content AS content,
    cc.context AS "fullContext",
    cc.detection_reason AS "detectionReason",
    cc.flagged_at AS timestamp,
    cc.reviewed,
    cc.reviewed_by AS "reviewedBy",
    cc.reviewed_at AS "reviewedAt",
    cc.review_notes AS "reviewNotes",
    u.email AS "userEmail",
    u.name AS "userName",
    u.state AS "userState",
    reviewer.email AS "reviewerEmail"
  FROM concerning_chats cc
  JOIN users u ON cc.user_id = u.id
  LEFT JOIN users reviewer ON cc.reviewed_by = reviewer.id
  WHERE ${severityFilter}
  ORDER BY cc.flagged_at DESC
  LIMIT 100
`);

res.json(result.rows);
```

**Changes Made:**
- Added SQL column aliases to match frontend interface
- `user_email` → `userEmail`
- `concern_type` → `concernType`
- `flagged_content` → `content`
- `context` → `fullContext`
- `flagged_at` → `timestamp`
- All other snake_case fields converted to camelCase

---

## Bonus Fix: Query Parameter Standardization

**Issue:** Frontend sends `?range=` but backend expects `?timeRange=`

### Fix in Frontend (Alternative to backend changes)

**Location:** `components/AdminAnalyticsTab.tsx`

**Lines 159, 189, 235, 272, 315:**

**Current:**
```typescript
const response = await fetch(`/api/admin/analytics/overview?range=${timeRange}`);
const response = await fetch(`/api/admin/analytics/user-activity?range=${timeRange}`);
const response = await fetch(`/api/admin/analytics/feature-usage?range=${timeRange}`);
const response = await fetch(`/api/admin/analytics/knowledge-base?range=${timeRange}`);
const response = await fetch(`/api/admin/analytics/concerning-chats?range=${timeRange}`);
```

**Replace With:**
```typescript
const response = await fetch(`/api/admin/analytics/overview?timeRange=${timeRange}`);
const response = await fetch(`/api/admin/analytics/user-activity?timeRange=${timeRange}`);
const response = await fetch(`/api/admin/analytics/feature-usage?timeRange=${timeRange}`);
const response = await fetch(`/api/admin/analytics/knowledge-base?timeRange=${timeRange}`);
const response = await fetch(`/api/admin/concerning-chats?severity=all&timeRange=${timeRange}`);
```

**Or in Backend:** Add `range` parameter support to match frontend

---

## Testing After Fixes

### 1. Test Overview Endpoint
```bash
curl -H "x-user-email: admin@roofer.com" \
  http://localhost:3001/api/admin/analytics/overview | jq
```

**Expected Response:**
```json
{
  "totalUsers": 42,
  "activeUsers7d": 28,
  "totalConversations": 389,
  "totalMessages": 1524,
  "emailsGenerated": 156,
  "transcriptions": 89,
  "documentsUploaded": 234,
  "susanSessions": 67
}
```

### 2. Test User Activity Endpoint
```bash
curl -H "x-user-email: admin@roofer.com" \
  "http://localhost:3001/api/admin/analytics/user-activity?timeRange=week" | jq
```

**Expected Response:**
```json
[
  {
    "userId": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "sales_rep",
    "state": "VA",
    "chats": 234,
    "emails": 12,
    "transcriptions": 45,
    "uploads": 23,
    "susan": 15,
    "kbViews": 34,
    "favoriteDocuments": 5,
    "imagesAnalyzed": 8,
    "lastActive": "2025-01-05T10:30:00.000Z",
    "userSince": "2024-12-01T08:00:00.000Z"
  }
]
```

### 3. Test Feature Usage Endpoint
```bash
curl -H "x-user-email: admin@roofer.com" \
  "http://localhost:3001/api/admin/analytics/feature-usage?timeRange=week" | jq
```

**Expected Response:**
```json
[
  {
    "date": "2025-01-01",
    "chat": 45,
    "email": 12,
    "upload": 5,
    "transcribe": 23,
    "susan": 10,
    "knowledgeBase": 15
  },
  {
    "date": "2025-01-02",
    "chat": 67,
    "email": 15,
    "upload": 8,
    "transcribe": 34,
    "susan": 12,
    "knowledgeBase": 20
  }
]
```

### 4. Test Knowledge Base Endpoint
```bash
curl -H "x-user-email: admin@roofer.com" \
  http://localhost:3001/api/admin/analytics/knowledge-base | jq
```

**Expected Response:**
```json
{
  "mostViewed": [
    {
      "name": "Installation Guide",
      "views": 123,
      "category": "Technical"
    }
  ],
  "mostFavorited": [
    {
      "name": "Quick Reference",
      "favorites": 45,
      "category": "Reference"
    }
  ],
  "topCategories": [
    {
      "category": "Insurance",
      "count": 456
    },
    {
      "category": "Roofing",
      "count": 789
    }
  ]
}
```

### 5. Test Concerning Chats Endpoint
```bash
curl -H "x-user-email: admin@roofer.com" \
  "http://localhost:3001/api/admin/concerning-chats?severity=critical" | jq
```

**Expected Response:**
```json
[
  {
    "id": "uuid",
    "sessionId": "uuid",
    "userId": "uuid",
    "messageId": "msg_123",
    "concernType": "state_mismatch",
    "severity": "critical",
    "content": "Full message content",
    "fullContext": "Surrounding messages",
    "detectionReason": "Susan referenced MD but user is in VA",
    "timestamp": "2025-01-05T10:30:00.000Z",
    "reviewed": false,
    "reviewedBy": null,
    "reviewedAt": null,
    "reviewNotes": null,
    "userEmail": "user@example.com",
    "userName": "John Doe",
    "userState": "VA",
    "reviewerEmail": null
  }
]
```

---

## Implementation Checklist

- [ ] Fix #1: Update Overview endpoint response (lines 1463-1472)
- [ ] Fix #2: Update User Activity SQL aliases (lines 1493-1513)
- [ ] Fix #3: Update Feature Usage response structure (lines 1536-1570)
- [ ] Fix #4: Update Knowledge Base response format (lines 1578-1656)
- [ ] Fix #5: Update Concerning Chats SQL aliases (lines 1719-1747)
- [ ] Test all 5 endpoints with curl commands
- [ ] Test frontend integration in browser
- [ ] Verify charts render correctly
- [ ] Verify user activity table displays data
- [ ] Verify concerning chats filter works
- [ ] Deploy to production

---

## Rollback Plan

If issues occur after deployment:

1. **Immediate Rollback:**
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

2. **Partial Rollback:**
   - Revert specific endpoint changes
   - Keep working endpoints deployed

3. **Frontend Fallback:**
   - Frontend already has mock data as fallback
   - If backend fails, mock data displays automatically

---

## Additional Recommendations

### 1. Add Response Type Definitions

Create `/Users/a21/Desktop/S21-A24/gemini-field-assistant/types/analytics.ts`:
```typescript
export interface OverviewStats {
  totalUsers: number;
  activeUsers7d: number;
  totalConversations: number;
  totalMessages: number;
  emailsGenerated: number;
  transcriptions: number;
  documentsUploaded: number;
  susanSessions: number;
}

export interface UserActivity {
  userId: string;
  email: string;
  name: string;
  role: string;
  state: string | null;
  chats: number;
  emails: number;
  transcriptions: number;
  uploads: number;
  susan: number;
  kbViews: number;
  favoriteDocuments: number;
  imagesAnalyzed: number;
  lastActive: string;
  userSince: string;
}

// Add other interfaces...
```

### 2. Add Input Validation

Install zod:
```bash
npm install zod
```

Add validation to endpoints:
```typescript
import { z } from 'zod';

const timeRangeSchema = z.enum(['today', 'week', 'month', 'all']);
const severitySchema = z.enum(['critical', 'warning', 'info', 'all']);

// In endpoint:
const { timeRange } = timeRangeSchema.parse(req.query);
```

### 3. Add API Versioning

For future backward compatibility:
```typescript
app.get('/api/v1/admin/analytics/overview', ...);
```

---

## Estimated Timeline

| Task | Time | Priority |
|------|------|----------|
| Fix #1 (Overview) | 5 min | CRITICAL |
| Fix #2 (User Activity) | 10 min | CRITICAL |
| Fix #3 (Feature Usage) | 15 min | CRITICAL |
| Fix #4 (Knowledge Base) | 10 min | CRITICAL |
| Fix #5 (Concerning Chats) | 10 min | HIGH |
| Testing all endpoints | 30 min | CRITICAL |
| Frontend integration test | 20 min | CRITICAL |
| Documentation update | 10 min | MEDIUM |
| **TOTAL** | **1.5-2 hours** | - |

---

## Contact for Questions

If issues arise during implementation:
1. Review full verification report: `ANALYTICS_BACKEND_VERIFICATION_REPORT.md`
2. Check API documentation: `docs/ANALYTICS_API_ENDPOINTS.md`
3. Review database schema: `database/migrations/003_analytics_and_monitoring.sql`

---

**Last Updated:** 2025-11-05
**Status:** READY FOR IMPLEMENTATION
**Risk Level:** LOW (isolated changes, no data migration required)
