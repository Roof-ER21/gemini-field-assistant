-- ==========================================================================
-- Migration 044 Fix: Update refresh_contest_standings to use correct tables
-- ==========================================================================

-- Drop and recreate the function with correct table references
CREATE OR REPLACE FUNCTION refresh_contest_standings(contest_id_param INTEGER)
RETURNS void AS $$
DECLARE
    v_contest RECORD;
    v_start_date DATE;
    v_end_date DATE;
    v_contest_type VARCHAR(50);
    v_metric_type VARCHAR(50);
BEGIN
    -- Get contest details
    SELECT start_date, end_date, contest_type, metric_type
    INTO v_start_date, v_end_date, v_contest_type, v_metric_type
    FROM contests
    WHERE id = contest_id_param;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contest % not found', contest_id_param;
    END IF;

    -- Clear existing standings
    DELETE FROM contest_standings WHERE contest_id = contest_id_param;

    -- Calculate standings based on contest type
    IF v_contest_type = 'company_wide' THEN
        -- Company-wide: all active sales reps
        -- Aggregate metrics from monthly table for the date range
        INSERT INTO contest_standings (contest_id, sales_rep_id, team_name, signups_count, revenue_amount)
        SELECT
            contest_id_param,
            sr.id,
            NULL,
            COALESCE(SUM(CASE
                WHEN v_metric_type IN ('signups', 'both')
                THEN m.signups
                ELSE 0
            END), 0)::INTEGER as signups_count,
            COALESCE(SUM(CASE
                WHEN v_metric_type IN ('revenue', 'both')
                THEN m.revenue
                ELSE 0
            END), 0) as revenue_amount
        FROM sales_reps sr
        LEFT JOIN sales_rep_monthly_metrics m ON sr.id = m.sales_rep_id
            AND (
                -- Filter by date range (year/month must overlap with contest dates)
                (m.year = EXTRACT(YEAR FROM v_start_date)::INTEGER AND m.month >= EXTRACT(MONTH FROM v_start_date)::INTEGER)
                OR
                (m.year = EXTRACT(YEAR FROM v_end_date)::INTEGER AND m.month <= EXTRACT(MONTH FROM v_end_date)::INTEGER)
                OR
                (m.year > EXTRACT(YEAR FROM v_start_date)::INTEGER AND m.year < EXTRACT(YEAR FROM v_end_date)::INTEGER)
            )
        WHERE sr.is_active = true
        GROUP BY sr.id;

    ELSIF v_contest_type = 'team_based' THEN
        -- Team-based: aggregate by custom team name or existing team
        INSERT INTO contest_standings (contest_id, sales_rep_id, team_name, signups_count, revenue_amount)
        SELECT
            contest_id_param,
            NULL,
            COALESCE(cp.team_name, t.name, 'No Team') as team_name,
            COALESCE(SUM(CASE
                WHEN v_metric_type IN ('signups', 'both')
                THEN m.signups
                ELSE 0
            END), 0)::INTEGER as signups_count,
            COALESCE(SUM(CASE
                WHEN v_metric_type IN ('revenue', 'both')
                THEN m.revenue
                ELSE 0
            END), 0) as revenue_amount
        FROM contest_participants cp
        JOIN sales_reps sr ON cp.sales_rep_id = sr.id
        LEFT JOIN teams t ON sr.team_id = t.id
        LEFT JOIN sales_rep_monthly_metrics m ON sr.id = m.sales_rep_id
            AND (
                (m.year = EXTRACT(YEAR FROM v_start_date)::INTEGER AND m.month >= EXTRACT(MONTH FROM v_start_date)::INTEGER)
                OR
                (m.year = EXTRACT(YEAR FROM v_end_date)::INTEGER AND m.month <= EXTRACT(MONTH FROM v_end_date)::INTEGER)
                OR
                (m.year > EXTRACT(YEAR FROM v_start_date)::INTEGER AND m.year < EXTRACT(YEAR FROM v_end_date)::INTEGER)
            )
        WHERE cp.contest_id = contest_id_param
        GROUP BY COALESCE(cp.team_name, t.name, 'No Team');

    ELSE -- 'individual'
        -- Individual: only contest participants
        INSERT INTO contest_standings (contest_id, sales_rep_id, team_name, signups_count, revenue_amount)
        SELECT
            contest_id_param,
            sr.id,
            NULL,
            COALESCE(SUM(CASE
                WHEN v_metric_type IN ('signups', 'both')
                THEN m.signups
                ELSE 0
            END), 0)::INTEGER as signups_count,
            COALESCE(SUM(CASE
                WHEN v_metric_type IN ('revenue', 'both')
                THEN m.revenue
                ELSE 0
            END), 0) as revenue_amount
        FROM contest_participants cp
        JOIN sales_reps sr ON cp.sales_rep_id = sr.id
        LEFT JOIN sales_rep_monthly_metrics m ON sr.id = m.sales_rep_id
            AND (
                (m.year = EXTRACT(YEAR FROM v_start_date)::INTEGER AND m.month >= EXTRACT(MONTH FROM v_start_date)::INTEGER)
                OR
                (m.year = EXTRACT(YEAR FROM v_end_date)::INTEGER AND m.month <= EXTRACT(MONTH FROM v_end_date)::INTEGER)
                OR
                (m.year > EXTRACT(YEAR FROM v_start_date)::INTEGER AND m.year < EXTRACT(YEAR FROM v_end_date)::INTEGER)
            )
        WHERE cp.contest_id = contest_id_param
        GROUP BY sr.id;
    END IF;

    -- Update ranks based on metric type
    UPDATE contest_standings cs
    SET rank = subquery.rank
    FROM (
        SELECT
            id,
            CASE
                WHEN v_metric_type = 'signups' THEN
                    RANK() OVER (ORDER BY signups_count DESC, revenue_amount DESC)
                WHEN v_metric_type = 'revenue' THEN
                    RANK() OVER (ORDER BY revenue_amount DESC, signups_count DESC)
                ELSE -- 'both'
                    RANK() OVER (ORDER BY signups_count + revenue_amount DESC)
            END as rank
        FROM contest_standings
        WHERE contest_id = contest_id_param
    ) subquery
    WHERE cs.id = subquery.id;

    -- Update standings timestamp
    UPDATE contest_standings
    SET updated_at = NOW()
    WHERE contest_id = contest_id_param;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    RAISE NOTICE '=== Migration 044 Fix: Updated refresh_contest_standings ===';
    RAISE NOTICE 'Function now uses sales_rep_monthly_metrics table';
END $$;
