-- Migration 022: Fix impacted assets stats function for jobs schema

CREATE OR REPLACE FUNCTION get_impact_stats(
    p_user_id UUID,
    p_days_back INTEGER DEFAULT 90
)
RETURNS TABLE (
    total_properties INTEGER,
    total_alerts INTEGER,
    alerts_pending INTEGER,
    alerts_converted INTEGER,
    conversion_rate DECIMAL,
    total_conversion_value DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT
            (SELECT COUNT(*) FROM customer_properties WHERE user_id = p_user_id AND is_active = TRUE) as props,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status IN ('pending', 'sent', 'viewed')) as pending,
            COUNT(*) FILTER (WHERE status = 'converted') as converted
        FROM impact_alerts
        WHERE user_id = p_user_id
        AND created_at >= NOW() - (p_days_back || ' days')::INTERVAL
    )
    SELECT
        stats.props::INTEGER as total_properties,
        stats.total::INTEGER as total_alerts,
        stats.pending::INTEGER as alerts_pending,
        stats.converted::INTEGER as alerts_converted,
        CASE WHEN stats.total > 0
            THEN ROUND(100.0 * stats.converted / stats.total, 2)
            ELSE 0
        END as conversion_rate,
        COALESCE((
            SELECT SUM(
              COALESCE(
                NULLIF(j.financials->>'estimated_value', '')::DECIMAL,
                NULLIF(j.financials->>'total', '')::DECIMAL,
                0
              )
            )
            FROM impact_alerts ia
            JOIN jobs j ON ia.converted_job_id = j.id
            WHERE ia.user_id = p_user_id
            AND ia.created_at >= NOW() - (p_days_back || ' days')::INTERVAL
        ), 0) as total_conversion_value
    FROM stats;
END;
$$ LANGUAGE plpgsql;
