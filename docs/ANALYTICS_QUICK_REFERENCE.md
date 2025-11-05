# Analytics API - Quick Reference Card

## Activity Tracking

### Start Live Susan Session
```bash
POST /api/activity/live-susan
Headers: x-user-email: user@example.com
Body: {"action":"start"}
Response: {"session_id":"uuid"}
```

### End Live Susan Session
```bash
POST /api/activity/live-susan
Headers: x-user-email: user@example.com
Body: {"action":"end","session_id":"uuid","message_count":10,"double_tap_stops":2}
Response: {"success":true,"duration_seconds":180}
```

### Log Transcription
```bash
POST /api/activity/transcription
Headers: x-user-email: user@example.com
Body: {"audio_duration_seconds":30,"transcription_text":"...","word_count":15,"provider":"Gemini"}
Response: {"success":true,"transcription_id":"uuid","created_at":"..."}
```

### Log Document Upload
```bash
POST /api/activity/document-upload
Headers: x-user-email: user@example.com
Body: {"file_name":"test.pdf","file_type":"pdf","file_size_bytes":1024000,"analysis_performed":true,"analysis_type":"roof_damage","analysis_result":"..."}
Response: {"success":true,"upload_id":"uuid","created_at":"..."}
```

---

## Admin Analytics

### Overview Dashboard
```bash
GET /api/admin/analytics/overview
Headers: x-user-email: admin@example.com
Response: {
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

### User Activity Breakdown
```bash
GET /api/admin/analytics/user-activity?timeRange={today|week|month|all}
Headers: x-user-email: admin@example.com
Response: [{user_id,email,name,total_messages,emails_generated,...}]
```

### Feature Usage Trends
```bash
GET /api/admin/analytics/feature-usage?timeRange={today|week|month|all}
Headers: x-user-email: admin@example.com
Response: {
  "labels": ["2025-01-01","2025-01-02"],
  "datasets": [{"name":"Chat","data":[45,67]},...]
}
```

### Knowledge Base Analytics
```bash
GET /api/admin/analytics/knowledge-base
Headers: x-user-email: admin@example.com
Response: {
  "most_viewed": [{document_path,document_name,total_views,...}],
  "most_favorited": [{document_path,favorite_count,...}],
  "search_queries": [{search_query,search_count,...}],
  "category_breakdown": {"Insurance":{document_count,total_views},...}
}
```

### Per-User Analytics Table
```bash
GET /api/admin/analytics/per-user
Headers: x-user-email: admin@example.com
Response: [{user_id,email,name,total_messages,emails_generated,...}]
(Sorted by total_messages DESC)
```

---

## Concerning Chats

### List Flagged Chats
```bash
GET /api/admin/concerning-chats?severity={critical|warning|info|all}
Headers: x-user-email: admin@example.com
Response: [{
  id,session_id,user_id,message_id,concern_type,severity,
  flagged_content,detection_reason,flagged_at,reviewed,
  user_email,user_name,user_state,...
}]
```

### Trigger Manual Scan
```bash
POST /api/admin/concerning-chats/scan
Headers: x-user-email: admin@example.com
Response: {"success":true,"scanned":234,"flagged":5}
```

### Mark as Reviewed
```bash
PATCH /api/admin/concerning-chats/:id/review
Headers: x-user-email: admin@example.com
Body: {"review_notes":"False positive - general inquiry"}
Response: {"success":true,"reviewed":true,"reviewed_at":"..."}
```

---

## Concern Types

- `state_mismatch` - Susan referenced wrong state (CRITICAL)
- `off_topic` - Off-topic or inappropriate queries (WARNING/CRITICAL)
- `inappropriate` - Inappropriate language (WARNING)
- `legal` - Potential legal concerns (CRITICAL)
- `confusion` - User confusion/dissatisfaction (WARNING)
- `competitor` - Competitor mentions (INFO)

---

## Time Range Options

- `today` - From start of current day
- `week` - Last 7 days
- `month` - Last 30 days
- `all` - All time (default)

---

## HTTP Status Codes

- `200` - Success
- `400` - Bad request (missing/invalid parameters)
- `401` - Unauthorized (user not found)
- `403` - Forbidden (non-admin accessing admin endpoint)
- `404` - Not found (resource doesn't exist)
- `500` - Server error (database/service error)

---

## Authorization

- **User Endpoints**: `x-user-email` header (any valid user)
- **Admin Endpoints**: `x-user-email` header (must be admin role)
- **Admin Check**: Email must match `EMAIL_ADMIN_ADDRESS` env var

---

## Testing

```bash
# Run all tests
./scripts/test-analytics-endpoints.sh

# Test specific endpoint
curl http://localhost:3001/api/admin/analytics/overview \
  -H "x-user-email: admin@roofer.com"

# Test with different environment
ADMIN_EMAIL=admin@example.com ./scripts/test-analytics-endpoints.sh https://api.example.com
```

---

## Database Tables

- `live_susan_sessions` - Voice assistant sessions
- `transcriptions` - Audio transcriptions
- `document_uploads` - File uploads and analysis
- `concerning_chats` - Flagged conversations

## Database Views

- `user_activity_enhanced` - Aggregated user metrics
- `daily_activity_metrics` - Daily feature usage

---

## Common Patterns

### Frontend React Hook
```typescript
const { data } = useQuery({
  queryKey: ['analytics', 'overview'],
  queryFn: async () => {
    const response = await fetch('/api/admin/analytics/overview', {
      headers: { 'x-user-email': userEmail }
    });
    return response.json();
  }
});
```

### Error Handling
```typescript
try {
  const response = await fetch(endpoint, {
    headers: { 'x-user-email': userEmail }
  });

  if (!response.ok) {
    if (response.status === 403) {
      // Show "Admin access required" error
    } else {
      // Show generic error
    }
  }

  const data = await response.json();
} catch (error) {
  // Network error
}
```

---

## Performance Tips

1. Cache overview stats (5-minute TTL)
2. Use time range filtering to reduce dataset size
3. Implement pagination for large result sets
4. Rate limit manual scan endpoint
5. Monitor query performance with database tools

---

## Files

- **Server Code**: `/server/index.ts` (lines 1250-1890)
- **Migration**: `/database/migrations/003_analytics_and_monitoring.sql`
- **Monitor Service**: `/services/chatMonitorService.ts`
- **Documentation**: `/docs/ANALYTICS_API_ENDPOINTS.md`
- **Test Script**: `/scripts/test-analytics-endpoints.sh`

---

**Version:** 1.0.0
**Last Updated:** 2025-01-05
**Total Endpoints:** 11
