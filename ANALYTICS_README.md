# Analytics & Monitoring System - Complete Implementation

## Overview

This document provides a comprehensive overview of the analytics and monitoring system implemented for the S21 ROOFER admin panel.

## Implementation Status

**Status:** COMPLETE
**Date:** 2025-01-05
**Lines of Code:** ~640 lines
**Endpoints Added:** 11 endpoints
**Files Modified:** 1 (server/index.ts)
**Documentation Created:** 3 files

## Quick Links

- **API Documentation:** `/docs/ANALYTICS_API_ENDPOINTS.md`
- **Implementation Details:** `/docs/ANALYTICS_IMPLEMENTATION_SUMMARY.md`
- **Test Script:** `/scripts/test-analytics-endpoints.sh`
- **Server Code:** `/server/index.ts` (lines 1250-1890)

## What Was Built

### 1. Activity Tracking (3 Endpoints)

Track user activities across the platform:

- **Live Susan Sessions** - Voice assistant usage tracking
- **Transcriptions** - Audio transcription logging
- **Document Uploads** - File upload and analysis tracking

### 2. Admin Analytics (5 Endpoints)

Comprehensive analytics for administrators:

- **Overview Dashboard** - High-level platform statistics
- **User Activity Breakdown** - Per-user activity metrics with time filtering
- **Feature Usage Trends** - Chart-ready data for feature adoption
- **Knowledge Base Analytics** - Document views, favorites, and searches
- **Per-User Table** - Detailed user activity table view

### 3. Concerning Chats Monitoring (3 Endpoints)

Intelligent chat monitoring system:

- **List Flagged Chats** - View concerning conversations by severity
- **Manual Scan** - Trigger on-demand chat analysis
- **Review System** - Mark chats as reviewed with notes

## Database Schema

### New Tables Created

1. **live_susan_sessions** - Track voice assistant sessions
2. **transcriptions** - Log transcription usage
3. **document_uploads** - Track file uploads and analysis
4. **concerning_chats** - Flag problematic conversations

### Views Created

1. **user_activity_enhanced** - Aggregated user metrics
2. **daily_activity_metrics** - Daily activity by feature type

### Migration File

- **File:** `/database/migrations/003_analytics_and_monitoring.sql`
- **Status:** Ready to run
- **Tables:** 4 new tables
- **Views:** 2 new views
- **Indexes:** 20+ performance indexes

## Key Features

### Security
- Admin role authorization on all admin endpoints
- SQL injection prevention via parameterized queries
- User context isolation (users can only see their own data)
- Input validation on all endpoints

### Performance
- Database indexes on all query columns
- Pre-aggregated views for complex analytics
- Query result limits to prevent memory issues
- Time range filtering to reduce dataset size

### Monitoring
- Concerning chat detection with multiple severity levels
- Automatic flagging of state mismatches
- Detection of inappropriate content
- Legal concern identification
- User confusion monitoring

### Scalability
- Efficient queries using views and indexes
- Parallel query execution where possible
- Optimized aggregation queries
- Ready for horizontal scaling

## Getting Started

### Prerequisites

1. PostgreSQL database with migration 003 applied
2. Node.js and TypeScript installed
3. Environment variables configured:
   - `DATABASE_URL` or `POSTGRES_URL`
   - `EMAIL_ADMIN_ADDRESS` or `ADMIN_EMAIL` (for admin role)

### Running the Migration

```bash
# Connect to your database
psql $DATABASE_URL

# Run the migration
\i database/migrations/003_analytics_and_monitoring.sql
```

### Testing the Endpoints

```bash
# Run the test script
./scripts/test-analytics-endpoints.sh

# Or test against a remote server
./scripts/test-analytics-endpoints.sh https://your-api.com

# With custom admin email
ADMIN_EMAIL=your-admin@example.com ./scripts/test-analytics-endpoints.sh
```

### Manual Testing

```bash
# Test activity tracking
curl -X POST http://localhost:3001/api/activity/live-susan \
  -H "Content-Type: application/json" \
  -H "x-user-email: test@roofer.com" \
  -d '{"action":"start"}'

# Test admin analytics
curl http://localhost:3001/api/admin/analytics/overview \
  -H "x-user-email: admin@roofer.com"

# Test concerning chats
curl "http://localhost:3001/api/admin/concerning-chats?severity=critical" \
  -H "x-user-email: admin@roofer.com"
```

## API Endpoints

### Activity Tracking

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/activity/live-susan` | POST | User | Track Live Susan sessions |
| `/api/activity/transcription` | POST | User | Log transcriptions |
| `/api/activity/document-upload` | POST | User | Log document uploads |

### Admin Analytics

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/admin/analytics/overview` | GET | Admin | Platform statistics |
| `/api/admin/analytics/user-activity` | GET | Admin | User activity breakdown |
| `/api/admin/analytics/feature-usage` | GET | Admin | Feature usage trends |
| `/api/admin/analytics/knowledge-base` | GET | Admin | Knowledge base analytics |
| `/api/admin/analytics/per-user` | GET | Admin | Per-user activity table |

### Concerning Chats

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/admin/concerning-chats` | GET | Admin | List flagged chats |
| `/api/admin/concerning-chats/scan` | POST | Admin | Trigger manual scan |
| `/api/admin/concerning-chats/:id/review` | PATCH | Admin | Mark as reviewed |

## Frontend Integration

### Dashboard Components Needed

1. **Stats Cards** - Display overview metrics
   - Call: `GET /api/admin/analytics/overview`
   - Shows: Total users, active users, conversations, etc.

2. **User Activity Table** - Show per-user metrics
   - Call: `GET /api/admin/analytics/per-user`
   - Columns: Email, messages, emails, transcriptions, etc.

3. **Feature Usage Chart** - Line/bar chart of feature adoption
   - Call: `GET /api/admin/analytics/feature-usage?timeRange=week`
   - Chart library: Chart.js, Recharts, etc.

4. **Knowledge Base Stats** - Popular documents and searches
   - Call: `GET /api/admin/analytics/knowledge-base`
   - Display: Most viewed, most favorited, top searches

5. **Concerning Chats List** - Flagged conversations table
   - Call: `GET /api/admin/concerning-chats?severity=critical`
   - Features: Filter by severity, review modal, mark reviewed

### Example React Hook

```typescript
// useAnalytics.ts
import { useQuery } from '@tanstack/react-query';

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: async () => {
      const response = await fetch('/api/admin/analytics/overview', {
        headers: {
          'x-user-email': getCurrentUserEmail()
        }
      });
      return response.json();
    }
  });
}

export function useUserActivity(timeRange: string) {
  return useQuery({
    queryKey: ['analytics', 'user-activity', timeRange],
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/analytics/user-activity?timeRange=${timeRange}`,
        {
          headers: {
            'x-user-email': getCurrentUserEmail()
          }
        }
      );
      return response.json();
    }
  });
}
```

## Monitoring & Alerts

### Concerning Chat Detection

The system automatically detects:

- **State Mismatch** (Critical) - Susan references wrong state
- **Off-Topic Queries** (Warning/Critical) - Inappropriate questions
- **Inappropriate Language** (Warning) - Profanity or offensive content
- **Legal Concerns** (Critical) - Potential fraud or illegal activity
- **User Confusion** (Warning) - User expressing dissatisfaction
- **Competitor Mentions** (Info) - Discussing other roofers

### Recommended Actions

1. **Daily Review** - Check concerning chats dashboard daily
2. **Critical Alerts** - Set up email notifications for critical flags
3. **Weekly Scan** - Run manual scan weekly via admin panel
4. **Monthly Analysis** - Review trends in user confusion/dissatisfaction

## Performance Benchmarks

### Expected Response Times

- Activity tracking: < 50ms
- Analytics overview: < 200ms
- User activity: < 100ms
- Feature usage: < 150ms
- Concerning chats: < 100ms
- Manual scan: 1-5 seconds (depends on message volume)

### Database Impact

- Tables: ~100KB per 1000 records
- Indexes: ~10% overhead
- Views: Computed on query (no storage)

## Troubleshooting

### Common Issues

1. **403 Forbidden on admin endpoints**
   - Check that user's email matches `EMAIL_ADMIN_ADDRESS` env var
   - Verify user role is set to 'admin' in database

2. **Empty analytics data**
   - Run migration 003 to create tables/views
   - Verify activity tracking endpoints are being called

3. **Slow queries**
   - Check that indexes are created (run migration)
   - Consider materializing views for high traffic
   - Add query result caching (5-minute TTL)

4. **chatMonitorService import error**
   - Verify file exists at `/services/chatMonitorService.ts`
   - Check that service is exported correctly

### Debug Mode

Enable detailed logging:

```bash
# Set debug level
export DEBUG=analytics:*

# Check logs
tail -f logs/server.log | grep analytics
```

## Future Enhancements

### Phase 2 (Short Term)
- [ ] Add pagination to concerning chats list
- [ ] Export analytics data to CSV/Excel
- [ ] Custom date range picker
- [ ] Real-time dashboard updates (WebSocket)

### Phase 3 (Medium Term)
- [ ] Scheduled automatic scans (cron job)
- [ ] Email/Slack alerts for critical flags
- [ ] Week-over-week trend analysis
- [ ] User segmentation (by state, role, etc.)

### Phase 4 (Long Term)
- [ ] Custom dashboard builder
- [ ] Predictive analytics (user churn, feature adoption)
- [ ] AI-powered insights and recommendations
- [ ] Multi-tenant analytics (for franchises)

## Support & Maintenance

### Regular Maintenance

1. **Weekly** - Review concerning chats, run manual scan
2. **Monthly** - Analyze trends, update detection rules
3. **Quarterly** - Performance review, optimize slow queries
4. **Annually** - Archive old data, update documentation

### Monitoring Checklist

- [ ] Database query performance
- [ ] Endpoint response times
- [ ] Error rates and logs
- [ ] Concerning chat detection accuracy
- [ ] Admin user activity

## Documentation

### Full Documentation

1. **API Reference** - `/docs/ANALYTICS_API_ENDPOINTS.md`
   - Complete endpoint documentation
   - Request/response examples
   - Data models and schemas

2. **Implementation Guide** - `/docs/ANALYTICS_IMPLEMENTATION_SUMMARY.md`
   - Code structure and patterns
   - Security considerations
   - Performance optimizations

3. **Test Suite** - `/scripts/test-analytics-endpoints.sh`
   - Automated endpoint testing
   - Authorization testing
   - Integration testing

### Code Comments

All endpoints include:
- Purpose description
- Request/response formats
- Error handling notes
- Performance considerations

## Contributing

### Adding New Analytics

1. Create database table/view in new migration
2. Add endpoint in server/index.ts (analytics section)
3. Implement admin authorization check
4. Add tests to test script
5. Document in ANALYTICS_API_ENDPOINTS.md

### Modifying Detection Rules

1. Update `chatMonitorService.ts` keyword lists
2. Test detection accuracy
3. Run manual scan to flag old messages
4. Document changes in service comments

## Contact & Support

For questions or issues:

1. Check documentation in `/docs` folder
2. Review implementation code in `/server/index.ts`
3. Run test script to verify functionality
4. Check database migration status

## License

Same as parent project (S21 ROOFER Field Assistant)

---

**Built with:** Node.js, TypeScript, Express, PostgreSQL
**Version:** 1.0.0
**Last Updated:** 2025-01-05
