-- ============================================================================
-- Email Notification Testing - SQL Helper Script
-- ============================================================================
-- Use these queries to test and debug email notifications
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Check Email Notification History
-- ----------------------------------------------------------------------------
-- View all email notifications sent by the system
SELECT
  id,
  notification_type,
  recipient_email,
  success,
  error_message,
  sent_at,
  email_data::jsonb->>'subject' as email_subject
FROM email_notifications
ORDER BY sent_at DESC
LIMIT 20;

-- ----------------------------------------------------------------------------
-- 2. Check User First Login Status
-- ----------------------------------------------------------------------------
-- See which users have logged in and when
SELECT
  id,
  email,
  name,
  role,
  state,
  first_login_at,
  created_at,
  CASE
    WHEN first_login_at IS NULL THEN 'Never logged in'
    ELSE 'Logged in'
  END as login_status
FROM users
ORDER BY created_at DESC;

-- ----------------------------------------------------------------------------
-- 3. Reset First Login for Testing
-- ----------------------------------------------------------------------------
-- Use this to test first-login email notifications
-- CAUTION: This will trigger a login email on next login!

-- Reset specific user (replace email)
-- UPDATE users
-- SET first_login_at = NULL
-- WHERE email = 'ahmed.mahmoud@theroofdocs.com';

-- Reset admin user for testing
-- UPDATE users
-- SET first_login_at = NULL
-- WHERE email = 'ahmed.mahmoud@theroofdocs.com';

-- ----------------------------------------------------------------------------
-- 4. Check Today's User Activity
-- ----------------------------------------------------------------------------
-- See which users have activity today (will get daily summaries)
SELECT
  u.email,
  u.name,
  COUNT(*) as activity_count,
  MIN(ual.created_at) as first_activity,
  MAX(ual.created_at) as last_activity,
  STRING_AGG(DISTINCT ual.activity_type, ', ') as activity_types
FROM user_activity_log ual
JOIN users u ON u.id = ual.user_id
WHERE DATE(ual.created_at) = CURRENT_DATE
GROUP BY u.email, u.name
ORDER BY activity_count DESC;

-- ----------------------------------------------------------------------------
-- 5. Check Daily Summary Email History
-- ----------------------------------------------------------------------------
-- View daily summary emails sent
SELECT
  en.id,
  en.recipient_email,
  u.name as user_name,
  en.success,
  en.sent_at,
  en.email_data::jsonb->>'activityCount' as activities,
  en.email_data::jsonb->>'date' as summary_date
FROM email_notifications en
LEFT JOIN users u ON u.id = en.user_id
WHERE en.notification_type = 'daily_summary'
ORDER BY en.sent_at DESC
LIMIT 20;

-- ----------------------------------------------------------------------------
-- 6. Check Login Notification History
-- ----------------------------------------------------------------------------
-- View login notification emails sent
SELECT
  en.id,
  en.recipient_email,
  u.name as user_name,
  u.email as user_email,
  en.success,
  en.sent_at,
  en.error_message
FROM email_notifications en
LEFT JOIN users u ON u.id = en.user_id
WHERE en.notification_type = 'login'
ORDER BY en.sent_at DESC
LIMIT 20;

-- ----------------------------------------------------------------------------
-- 7. Activity Breakdown by Type
-- ----------------------------------------------------------------------------
-- See what types of activities users are doing
SELECT
  activity_type,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users,
  DATE(created_at) as activity_date
FROM user_activity_log
WHERE DATE(created_at) = CURRENT_DATE
GROUP BY activity_type, DATE(created_at)
ORDER BY count DESC;

-- ----------------------------------------------------------------------------
-- 8. Check for Users Who Should Get Daily Summary
-- ----------------------------------------------------------------------------
-- Users with activity today who haven't received summary yet
SELECT
  u.id,
  u.email,
  u.name,
  COUNT(DISTINCT ual.id) as activity_count,
  COALESCE(
    (SELECT COUNT(*)
     FROM email_notifications en
     WHERE en.user_id = u.id
       AND en.notification_type = 'daily_summary'
       AND DATE(en.sent_at) = CURRENT_DATE
    ), 0
  ) as summaries_sent_today
FROM users u
JOIN user_activity_log ual ON ual.user_id = u.id
WHERE DATE(ual.created_at) = CURRENT_DATE
GROUP BY u.id, u.email, u.name
HAVING COALESCE(
  (SELECT COUNT(*)
   FROM email_notifications en
   WHERE en.user_id = u.id
     AND en.notification_type = 'daily_summary'
     AND DATE(en.sent_at) = CURRENT_DATE
  ), 0
) = 0
ORDER BY activity_count DESC;

-- ----------------------------------------------------------------------------
-- 9. Email Notification Success Rate
-- ----------------------------------------------------------------------------
-- Overall success rate of email sending
SELECT
  notification_type,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed,
  ROUND(
    100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) as success_rate_percent
FROM email_notifications
GROUP BY notification_type
ORDER BY total_attempts DESC;

-- ----------------------------------------------------------------------------
-- 10. Recent Failed Email Attempts
-- ----------------------------------------------------------------------------
-- Debug failed emails
SELECT
  id,
  notification_type,
  recipient_email,
  error_message,
  sent_at,
  email_data
FROM email_notifications
WHERE success = false
ORDER BY sent_at DESC
LIMIT 10;

-- ----------------------------------------------------------------------------
-- 11. Insert Test Activity (for testing daily summaries)
-- ----------------------------------------------------------------------------
-- Add test activity for a user to test daily summary generation
-- CAUTION: Replace user_id with actual user ID

-- INSERT INTO user_activity_log (user_id, activity_type, activity_data)
-- SELECT
--   id,
--   'chat',
--   '{"message": "Test message for daily summary"}'::jsonb
-- FROM users
-- WHERE email = 'ahmed.mahmoud@theroofdocs.com';

-- ----------------------------------------------------------------------------
-- 12. Clean Up Test Data (Optional)
-- ----------------------------------------------------------------------------
-- Remove test email notifications (use carefully!)

-- DELETE FROM email_notifications
-- WHERE recipient_email LIKE 'test-%@test.com';

-- DELETE FROM users
-- WHERE email LIKE 'test-%@test.com';

-- ----------------------------------------------------------------------------
-- 13. Verify Email Configuration in Database
-- ----------------------------------------------------------------------------
-- Check that all required tables exist
SELECT
  table_name,
  CASE
    WHEN table_name = 'users' THEN 'User accounts'
    WHEN table_name = 'user_activity_log' THEN 'Activity tracking'
    WHEN table_name = 'email_notifications' THEN 'Email history'
    WHEN table_name = 'chat_history' THEN 'Chat messages'
    ELSE 'Other'
  END as purpose
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'user_activity_log', 'email_notifications', 'chat_history')
ORDER BY table_name;

-- ----------------------------------------------------------------------------
-- 14. Admin User Check
-- ----------------------------------------------------------------------------
-- Verify admin user exists and configuration
SELECT
  id,
  email,
  name,
  role,
  first_login_at,
  created_at,
  CASE
    WHEN role = 'admin' THEN '✅ Admin'
    ELSE '❌ Not Admin'
  END as admin_status
FROM users
WHERE email = 'ahmed.mahmoud@theroofdocs.com'
   OR role = 'admin';

-- ============================================================================
-- Testing Workflow
-- ============================================================================
--
-- To test first-login email notifications:
-- 1. Run query #3 to reset first_login_at for admin user
-- 2. Log in to the application
-- 3. Run query #6 to check if login notification was sent
-- 4. Check server console for email logs
--
-- To test daily summary emails:
-- 1. Run query #4 to check if there's activity today
-- 2. If no activity, run query #11 to insert test activity
-- 3. Trigger cron manually: curl -X POST http://localhost:3001/api/cron/trigger
-- 4. Run query #5 to check if daily summary was sent
--
-- To monitor email system health:
-- 1. Run query #9 to check success rate
-- 2. Run query #10 to see recent failures
-- 3. Run query #1 to see recent email history
--
-- ============================================================================
