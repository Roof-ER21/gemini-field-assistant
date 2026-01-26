-- ============================================================================
-- Migration 007: Performance Optimization Indexes
-- ============================================================================
-- Created: 2026-01-26
-- Purpose: Add composite indexes for better query performance across frequently queried tables
-- ============================================================================

-- ============================================================================
-- 1. CHAT HISTORY PERFORMANCE INDEXES
-- ============================================================================
-- Chat history is queried by user_id + session_id and user_id + created_at frequently

DO $$
BEGIN
    RAISE NOTICE 'Adding chat_history performance indexes...';

    -- Composite index for user + session queries
    CREATE INDEX IF NOT EXISTS idx_chat_history_user_session
    ON chat_history(user_id, session_id);

    -- Composite index for user + time-based queries (recent messages)
    CREATE INDEX IF NOT EXISTS idx_chat_history_user_created
    ON chat_history(user_id, created_at DESC);

    RAISE NOTICE '✓ chat_history indexes created';
END $$;

-- ============================================================================
-- 2. EMAIL GENERATION LOG INDEXES
-- ============================================================================
-- Email generation logs are frequently queried by user and time for analytics

DO $$
BEGIN
    RAISE NOTICE 'Adding email_generation_log performance indexes...';

    -- Composite index for user + time queries
    CREATE INDEX IF NOT EXISTS idx_email_generation_log_user_created
    ON email_generation_log(user_id, created_at DESC);

    RAISE NOTICE '✓ email_generation_log indexes created';
END $$;

-- ============================================================================
-- 3. USER ACTIVITY LOG INDEXES
-- ============================================================================
-- Activity tracking queried by user + date for daily summaries

DO $$
BEGIN
    RAISE NOTICE 'Adding user_activity_log performance indexes...';

    -- Composite index for user + activity date (already exists in activity_tracking_migration.sql)
    -- CREATE INDEX IF NOT EXISTS idx_activity_user_date ON user_activity_log(user_id, created_at DESC);
    -- This was already created, so we'll skip it to avoid duplication

    RAISE NOTICE '✓ user_activity_log indexes verified';
END $$;

-- ============================================================================
-- 4. EMAIL NOTIFICATIONS INDEXES
-- ============================================================================
-- Email notifications tracked for duplicate prevention and audit trail

DO $$
BEGIN
    RAISE NOTICE 'Adding email_notifications performance indexes...';

    -- Composite index for user + sent time (already exists in activity_tracking_migration.sql)
    -- CREATE INDEX IF NOT EXISTS idx_email_notifications_user ON email_notifications(user_id, sent_at DESC);
    -- This was already created, so we'll skip it

    RAISE NOTICE '✓ email_notifications indexes verified';
END $$;

-- ============================================================================
-- 5. CONCERNING CHATS INDEXES
-- ============================================================================
-- Concerning chats reviewed by admins - filter by reviewed status and date

DO $$
BEGIN
    RAISE NOTICE 'Adding concerning_chats performance indexes...';

    -- Composite index for reviewed status + time
    CREATE INDEX IF NOT EXISTS idx_concerning_chats_reviewed
    ON concerning_chats(reviewed, created_at DESC);

    -- Composite index for user lookup
    CREATE INDEX IF NOT EXISTS idx_concerning_chats_user_created
    ON concerning_chats(user_id, created_at DESC);

    RAISE NOTICE '✓ concerning_chats indexes created';
END $$;

-- ============================================================================
-- 6. USERS TABLE OPTIMIZATION
-- ============================================================================
-- Users frequently looked up by email (case-insensitive)

DO $$
BEGIN
    RAISE NOTICE 'Adding users table performance indexes...';

    -- Case-insensitive email index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_users_email_lower
    ON users(LOWER(email));

    -- Active users filter
    CREATE INDEX IF NOT EXISTS idx_users_active
    ON users(is_active, created_at DESC)
    WHERE is_active = TRUE;

    RAISE NOTICE '✓ users indexes created';
END $$;

-- ============================================================================
-- 7. BUDGET ALERTS INDEXES
-- ============================================================================
-- Budget alerts queried by acknowledged status for notifications

DO $$
BEGIN
    RAISE NOTICE 'Adding budget_alerts performance indexes...';

    -- Composite index for acknowledged status + time
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_acknowledged
    ON budget_alerts(acknowledged, created_at DESC);

    -- Composite index for user-specific alerts
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_user_acknowledged
    ON budget_alerts(user_id, acknowledged, created_at DESC)
    WHERE user_id IS NOT NULL;

    RAISE NOTICE '✓ budget_alerts indexes created';
END $$;

-- ============================================================================
-- 8. API USAGE LOG OPTIMIZATION (if table exists)
-- ============================================================================
-- API usage tracking for cost management

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'api_usage_log') THEN

        RAISE NOTICE 'Adding api_usage_log performance indexes...';

        -- Composite index for user + time queries
        CREATE INDEX IF NOT EXISTS idx_api_usage_log_user_created
        ON api_usage_log(user_id, created_at DESC);

        -- Composite index for provider analysis
        CREATE INDEX IF NOT EXISTS idx_api_usage_log_provider_created
        ON api_usage_log(provider, created_at DESC);

        RAISE NOTICE '✓ api_usage_log indexes created';
    ELSE
        RAISE NOTICE '⚠ api_usage_log table does not exist, skipping indexes';
    END IF;
END $$;

-- ============================================================================
-- 9. DOCUMENT VIEWS OPTIMIZATION
-- ============================================================================
-- Document views for analytics

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'document_views') THEN

        RAISE NOTICE 'Adding document_views performance indexes...';

        -- Composite index for user + last viewed
        CREATE INDEX IF NOT EXISTS idx_document_views_user_last_viewed
        ON document_views(user_id, last_viewed_at DESC);

        RAISE NOTICE '✓ document_views indexes created';
    ELSE
        RAISE NOTICE '⚠ document_views table does not exist, skipping indexes';
    END IF;
END $$;

-- ============================================================================
-- 10. VERIFICATION & STATISTICS
-- ============================================================================

DO $$
DECLARE
    index_count INTEGER;
BEGIN
    -- Count new indexes created
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%'
    AND tablename IN (
        'chat_history',
        'email_generation_log',
        'concerning_chats',
        'users',
        'budget_alerts',
        'api_usage_log',
        'document_views'
    );

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 007 completed successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ Performance indexes added/verified';
    RAISE NOTICE '✓ Total indexes on core tables: %', index_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables optimized:';
    RAISE NOTICE '  - chat_history (user+session, user+time)';
    RAISE NOTICE '  - email_generation_log (user+time)';
    RAISE NOTICE '  - concerning_chats (reviewed+time, user+time)';
    RAISE NOTICE '  - users (case-insensitive email, active filter)';
    RAISE NOTICE '  - budget_alerts (acknowledged+time, user+acknowledged)';
    RAISE NOTICE '  - api_usage_log (user+time, provider+time)';
    RAISE NOTICE '  - document_views (user+time)';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Expected query improvements:';
    RAISE NOTICE '  • User chat history retrieval (user+session)';
    RAISE NOTICE '  • Recent message queries (user+time)';
    RAISE NOTICE '  • Admin review panels (filtered+sorted)';
    RAISE NOTICE '  • Email generation analytics';
    RAISE NOTICE '  • Budget monitoring dashboards';
    RAISE NOTICE '  • API cost tracking queries';
    RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- INDEX USAGE MONITORING QUERY (for future optimization)
-- ============================================================================
-- Run this query periodically to check index usage:
--
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     idx_scan as times_used,
--     idx_tup_read as tuples_read,
--     idx_tup_fetch as tuples_fetched,
--     pg_size_pretty(pg_relation_size(indexrelid)) as index_size
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- AND indexname LIKE 'idx_%'
-- ORDER BY idx_scan DESC;
-- ============================================================================
