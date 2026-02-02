# Deploy Check-In Notifications - Quick Guide

## Pre-Deployment Checklist

- [ ] Firebase Cloud Messaging (FCM) is configured
- [ ] Push tokens table exists (migration 026)
- [ ] Check-in system is working
- [ ] Database is accessible
- [ ] Server environment variables are set

## Deployment Steps

### 1. Run Database Migration

```bash
cd /Users/a21/gemini-field-assistant

# Run the migration
npm run db:migrate

# Or run manually
psql -d your_database_name -f database/migrations/045_checkin_notifications.sql
```

**What this does**:
- Adds `checkin_alerts_enabled` column (default: TRUE)
- Adds `checkin_proximity_miles` column (default: NULL)

### 2. Verify Migration

```sql
-- Check that columns were added
\d notification_preferences

-- Should show:
-- checkin_alerts_enabled | boolean
-- checkin_proximity_miles | integer

-- Verify defaults
SELECT
  checkin_alerts_enabled,
  checkin_proximity_miles
FROM notification_preferences
LIMIT 5;
```

### 3. Restart Server

```bash
# Development
npm run server:dev

# Production
npm run start

# Or with PM2
pm2 restart gemini-field-assistant
```

### 4. Test the Feature

#### Option A: Use Test Script
```bash
cd /Users/a21/gemini-field-assistant/server
chmod +x test-checkin-notifications.sh
./test-checkin-notifications.sh
```

#### Option B: Manual Testing
```bash
# 1. Register a push token
curl -X POST http://localhost:3000/api/push/register \
  -H "x-user-email: user1@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceToken": "test-token-123",
    "deviceType": "web"
  }'

# 2. Check preferences (should show new fields)
curl http://localhost:3000/api/push/preferences \
  -H "x-user-email: user1@example.com"

# Expected output:
# {
#   "preferences": {
#     "checkinAlertsEnabled": true,
#     "checkinProximityMiles": null,
#     ...
#   }
# }

# 3. Check in as another user
curl -X POST http://localhost:3000/api/checkin \
  -H "x-user-email: user2@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "location_lat": 40.7128,
    "location_lng": -74.0060,
    "notes": "Testing notifications"
  }'

# 4. Verify notification was logged
psql -d your_database -c "
  SELECT
    pnl.notification_type,
    pnl.title,
    pnl.body,
    pnl.status,
    u.email as recipient
  FROM push_notification_log pnl
  JOIN users u ON pnl.user_id = u.id
  WHERE notification_type = 'checkin_alert'
  ORDER BY created_at DESC
  LIMIT 5;
"
```

## Post-Deployment Verification

### 1. Check Logs
```bash
# Server logs should show:
# ✅ Registered push token for user...
# 📍 Processing check-in notification for user...
# 👥 Found X users to notify
# ✅ Sent check-in notification to...
```

### 2. Database Checks
```sql
-- Check notification preferences
SELECT
  u.email,
  COALESCE(np.checkin_alerts_enabled, TRUE) as enabled,
  np.checkin_proximity_miles
FROM users u
LEFT JOIN notification_preferences np ON u.id = np.user_id
WHERE u.role IN ('sales_rep', 'team_lead', 'manager');

-- Check push tokens
SELECT
  u.email,
  pt.device_type,
  pt.is_active,
  pt.notifications_enabled
FROM push_tokens pt
JOIN users u ON pt.user_id = u.id
WHERE pt.is_active = TRUE;

-- Check notification log
SELECT
  notification_type,
  status,
  COUNT(*) as count
FROM push_notification_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY notification_type, status;
```

### 3. Test Scenarios

#### Test 1: Basic Notification
```bash
# User A checks in
curl -X POST http://localhost:3000/api/checkin \
  -H "x-user-email: userA@example.com" \
  -H "Content-Type: application/json" \
  -d '{"location_lat": 40.7128, "location_lng": -74.0060}'

# Verify User B received notification
# Check push_notification_log table
```

#### Test 2: Proximity Filter
```bash
# User B sets 5-mile proximity filter
curl -X PUT http://localhost:3000/api/push/preferences \
  -H "x-user-email: userB@example.com" \
  -H "Content-Type: application/json" \
  -d '{"checkinProximityMiles": 5}'

# User A checks in 10 miles away
curl -X POST http://localhost:3000/api/checkin \
  -H "x-user-email: userA@example.com" \
  -H "Content-Type: application/json" \
  -d '{"location_lat": 40.8500, "location_lng": -74.1000}'

# Verify User B did NOT receive notification
```

#### Test 3: Disabled Notifications
```bash
# User B disables check-in notifications
curl -X PUT http://localhost:3000/api/push/preferences \
  -H "x-user-email: userB@example.com" \
  -H "Content-Type: application/json" \
  -d '{"checkinAlertsEnabled": false}'

# User A checks in
curl -X POST http://localhost:3000/api/checkin \
  -H "x-user-email: userA@example.com" \
  -H "Content-Type: application/json" \
  -d '{"location_lat": 40.7128, "location_lng": -74.0060}'

# Verify User B did NOT receive notification
```

## Rollback Plan

If issues occur, you can disable the feature without removing code:

### Option 1: Database-Level Disable
```sql
-- Disable for all users
UPDATE notification_preferences
SET checkin_alerts_enabled = FALSE;

-- Or disable for specific users
UPDATE notification_preferences
SET checkin_alerts_enabled = FALSE
WHERE user_id IN (SELECT id FROM users WHERE email IN ('user1@example.com', 'user2@example.com'));
```

### Option 2: Code-Level Disable
```typescript
// In checkinService.ts, comment out the notification trigger:
/*
if (session.checkInLat && session.checkInLng) {
  const notificationService = createCheckinNotificationService(this.pool);
  notificationService.notifyTeamOfCheckin({...}).catch(...);
}
*/
```

### Option 3: Full Rollback
```sql
-- Revert migration (if needed)
ALTER TABLE notification_preferences
DROP COLUMN IF EXISTS checkin_alerts_enabled;

ALTER TABLE notification_preferences
DROP COLUMN IF EXISTS checkin_proximity_miles;
```

## Monitoring

### Key Metrics to Track

```sql
-- Notification delivery rate
SELECT
  DATE(created_at) as date,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'sent') / COUNT(*), 2) as delivery_rate
FROM push_notification_log
WHERE notification_type = 'checkin_alert'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- User preferences adoption
SELECT
  COUNT(*) FILTER (WHERE checkin_alerts_enabled = TRUE) as enabled,
  COUNT(*) FILTER (WHERE checkin_alerts_enabled = FALSE) as disabled,
  COUNT(*) FILTER (WHERE checkin_proximity_miles IS NOT NULL) as has_proximity_filter,
  AVG(checkin_proximity_miles) FILTER (WHERE checkin_proximity_miles IS NOT NULL) as avg_proximity_miles
FROM notification_preferences;

-- Check-ins per day
SELECT
  DATE(check_in_time) as date,
  COUNT(*) as total_checkins,
  COUNT(DISTINCT user_id) as unique_users
FROM territory_checkins
WHERE check_in_time > NOW() - INTERVAL '7 days'
GROUP BY DATE(check_in_time)
ORDER BY date DESC;
```

### Error Monitoring

```sql
-- Failed notifications
SELECT
  u.email,
  pnl.error_message,
  pnl.created_at
FROM push_notification_log pnl
JOIN users u ON pnl.user_id = u.id
WHERE pnl.notification_type = 'checkin_alert'
  AND pnl.status = 'failed'
  AND pnl.created_at > NOW() - INTERVAL '24 hours'
ORDER BY pnl.created_at DESC;

-- Inactive tokens (need re-registration)
SELECT
  u.email,
  pt.device_type,
  pt.updated_at as last_active
FROM push_tokens pt
JOIN users u ON pt.user_id = u.id
WHERE pt.is_active = FALSE
  AND pt.updated_at > NOW() - INTERVAL '7 days'
ORDER BY pt.updated_at DESC;
```

## Troubleshooting

### Issue: Notifications not being sent

**Check 1**: Firebase initialized?
```bash
# Server logs should show:
# ✅ Firebase Admin SDK initialized for push notifications
```

**Check 2**: Push tokens registered?
```sql
SELECT COUNT(*) FROM push_tokens WHERE is_active = TRUE;
```

**Check 3**: Preferences enabled?
```sql
SELECT
  u.email,
  COALESCE(np.all_notifications_enabled, TRUE) as all_enabled,
  COALESCE(np.checkin_alerts_enabled, TRUE) as checkin_enabled
FROM users u
LEFT JOIN notification_preferences np ON u.id = np.user_id
WHERE u.id = 'target-user-id';
```

**Check 4**: Quiet hours?
```sql
SELECT
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  timezone
FROM notification_preferences
WHERE user_id = 'target-user-id';
```

### Issue: Distance calculations incorrect

**Check 1**: Coordinates valid?
```sql
SELECT
  user_id,
  check_in_lat,
  check_in_lng
FROM territory_checkins
WHERE check_in_lat NOT BETWEEN -90 AND 90
   OR check_in_lng NOT BETWEEN -180 AND 180;
```

**Check 2**: Last known location exists?
```sql
SELECT DISTINCT ON (user_id)
  user_id,
  check_in_lat,
  check_in_lng,
  check_in_time
FROM territory_checkins
WHERE check_in_lat IS NOT NULL
  AND check_in_lng IS NOT NULL
ORDER BY user_id, check_in_time DESC;
```

### Issue: Too many/too few notifications

**Check**: Review notification log
```sql
SELECT
  u.email as recipient,
  pnl.title,
  pnl.body,
  pnl.created_at
FROM push_notification_log pnl
JOIN users u ON pnl.user_id = u.id
WHERE notification_type = 'checkin_alert'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

## Production Considerations

### 1. Firebase Quotas
- FCM has daily send limits (free tier: ~10,000/day)
- Monitor usage in Firebase Console
- Consider upgrading plan if needed

### 2. Rate Limiting
For large teams (50+ users):
```typescript
// Consider batching notifications
const BATCH_SIZE = 10;
for (let i = 0; i < users.length; i += BATCH_SIZE) {
  const batch = users.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(user => sendNotification(user)));
  await sleep(100); // Small delay between batches
}
```

### 3. Logging
- Keep `push_notification_log` under 1M rows
- Archive old logs periodically
```sql
DELETE FROM push_notification_log
WHERE created_at < NOW() - INTERVAL '90 days';
```

### 4. Performance Tuning
```sql
-- Add index if needed
CREATE INDEX IF NOT EXISTS idx_checkins_user_time
ON territory_checkins(user_id, check_in_time DESC);

-- Analyze query performance
EXPLAIN ANALYZE
SELECT DISTINCT ON (user_id)
  user_id, check_in_lat, check_in_lng
FROM territory_checkins
WHERE check_in_lat IS NOT NULL
ORDER BY user_id, check_in_time DESC;
```

## Support

### Documentation
- Full docs: `/server/services/README_CHECKIN_NOTIFICATIONS.md`
- Flow diagram: `/CHECKIN_NOTIFICATIONS_FLOW.md`
- Implementation summary: `/CHECKIN_NOTIFICATIONS_SUMMARY.md`

### Contact
For issues or questions, check the logs and database queries above first, then:
1. Review error messages in `push_notification_log`
2. Verify Firebase configuration
3. Check server logs for detailed error traces

## Success Criteria

✅ Migration completed successfully
✅ New columns visible in `notification_preferences`
✅ Test check-in triggers notifications
✅ Preferences can be updated via API
✅ Notifications appear in `push_notification_log`
✅ Distance calculations are accurate
✅ Proximity filtering works correctly
✅ Quiet hours are respected
✅ No errors in server logs
✅ Firebase quota is acceptable

Once all criteria are met, the feature is ready for production use!
