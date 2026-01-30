-- ==========================================================================
-- Migration 034: Fix Canvassing Stats Calculation
-- Stats were showing 0 because they were only counting from canvassing_sessions
-- Now they count from actual canvassing_status entries (where data is saved)
-- ==========================================================================

-- Drop the old function
DROP FUNCTION IF EXISTS get_user_canvassing_stats(UUID, INTEGER);

-- Create improved stats function that counts actual canvassing entries
CREATE OR REPLACE FUNCTION get_user_canvassing_stats(
    p_user_id UUID,
    p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_doors INTEGER,
    total_contacts INTEGER,
    total_leads INTEGER,
    total_appointments INTEGER,
    conversion_rate DECIMAL,
    avg_doors_per_session DECIMAL
) AS $$
DECLARE
    v_cutoff_date DATE;
BEGIN
    -- Calculate cutoff date
    v_cutoff_date := CURRENT_DATE - p_days_back;

    RETURN QUERY
    WITH activity_stats AS (
        -- Count actual canvassing activities from canvassing_status table
        SELECT
            -- Total doors knocked = all entries (any status change means a door was knocked)
            COUNT(*) as doors,
            -- Contacts made = status is contacted or better
            COUNT(*) FILTER (WHERE status IN ('contacted', 'interested', 'lead', 'appointment_set', 'sold', 'customer')) as contacts,
            -- Leads generated = status is lead or better
            COUNT(*) FILTER (WHERE status IN ('lead', 'appointment_set', 'sold', 'customer')) as leads,
            -- Appointments set
            COUNT(*) FILTER (WHERE status IN ('appointment_set', 'sold', 'customer')) as appointments
        FROM canvassing_status
        WHERE contacted_by = p_user_id
        AND contact_date >= v_cutoff_date
    ),
    session_stats AS (
        -- Get session data if it exists (for avg calculation)
        SELECT
            COUNT(*) as session_count,
            COALESCE(SUM(doors_knocked), 0) as session_doors
        FROM canvassing_sessions
        WHERE user_id = p_user_id
        AND session_date >= v_cutoff_date
    )
    SELECT
        -- Use actual activity data (not session data)
        COALESCE(a.doors, 0)::INTEGER as total_doors,
        COALESCE(a.contacts, 0)::INTEGER as total_contacts,
        COALESCE(a.leads, 0)::INTEGER as total_leads,
        COALESCE(a.appointments, 0)::INTEGER as total_appointments,
        -- Conversion rate = leads / doors knocked
        CASE WHEN a.doors > 0
            THEN ROUND(100.0 * a.leads / a.doors, 2)
            ELSE 0
        END as conversion_rate,
        -- Average doors per session (use session data if available, otherwise activity data)
        CASE
            WHEN s.session_count > 0
                THEN ROUND(s.session_doors::DECIMAL / s.session_count, 2)
            WHEN a.doors > 0
                THEN a.doors::DECIMAL
            ELSE 0
        END as avg_doors_per_session
    FROM activity_stats a
    CROSS JOIN session_stats s;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_canvassing_stats IS 'Get canvassing stats for a user based on actual canvassing_status entries (not just sessions)';

-- Test the function to verify it works
DO $$
DECLARE
    v_test_result RECORD;
BEGIN
    -- Get stats for a random user to verify function works
    SELECT * INTO v_test_result
    FROM get_user_canvassing_stats(
        (SELECT id FROM users LIMIT 1),
        30
    );

    RAISE NOTICE '✅ Migration 034: Canvassing stats function fixed!';
    RAISE NOTICE '📊 Stats now calculate from canvassing_status entries (actual activity)';
    RAISE NOTICE '🔧 Previous issue: Stats only counted from canvassing_sessions (which users may not create)';
    RAISE NOTICE '✨ Result: All saved canvassing entries now count toward stats';
END $$;
