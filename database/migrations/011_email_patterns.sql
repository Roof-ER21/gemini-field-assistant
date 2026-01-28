-- Migration 011: Email Pattern Learning
-- Tracks successful email approaches by insurer, state, and email type
-- Enables Susan 21 to recommend proven strategies based on past outcomes

-- ============================================================================
-- EMAIL PATTERNS TABLE
-- ============================================================================
-- Tracks email strategies and their outcomes
CREATE TABLE IF NOT EXISTS email_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Email classification
    email_type VARCHAR(50) NOT NULL,        -- 'supplement', 'dispute', 'follow_up', 'initial_claim', 'appeal', 'escalation'
    insurer VARCHAR(100),                   -- Insurance company name
    state VARCHAR(2),                       -- VA, MD, PA

    -- Content analysis
    subject_template TEXT,                  -- Subject line pattern
    arguments_used JSONB DEFAULT '[]',      -- Array of argument strategies used
    primary_argument TEXT,                  -- Main argument/approach
    code_citations JSONB DEFAULT '[]',      -- IRC, state codes cited
    tone VARCHAR(50),                       -- 'professional', 'firm', 'urgent', 'collaborative'

    -- Original email reference
    source_email_id UUID REFERENCES email_generation_log(id) ON DELETE SET NULL,
    source_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,

    -- Outcome tracking
    outcome VARCHAR(50) DEFAULT 'pending',  -- 'approved', 'partial', 'denied', 'pending', 'no_response', 'unknown'
    outcome_notes TEXT,                     -- User's notes on what happened
    response_time_days INTEGER,             -- Days until response received
    amount_requested DECIMAL(10,2),
    amount_approved DECIMAL(10,2),

    -- Success metrics
    is_successful BOOLEAN,                  -- Calculated from outcome
    success_factors JSONB DEFAULT '[]',     -- What user thinks made it work

    -- Timestamps
    sent_at TIMESTAMPTZ,
    outcome_recorded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for pattern matching
CREATE INDEX IF NOT EXISTS idx_email_patterns_user_id ON email_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_email_patterns_insurer ON email_patterns(insurer);
CREATE INDEX IF NOT EXISTS idx_email_patterns_state ON email_patterns(state);
CREATE INDEX IF NOT EXISTS idx_email_patterns_type ON email_patterns(email_type);
CREATE INDEX IF NOT EXISTS idx_email_patterns_outcome ON email_patterns(outcome);
CREATE INDEX IF NOT EXISTS idx_email_patterns_is_successful ON email_patterns(is_successful);
CREATE INDEX IF NOT EXISTS idx_email_patterns_insurer_state ON email_patterns(insurer, state);
CREATE INDEX IF NOT EXISTS idx_email_patterns_insurer_type ON email_patterns(insurer, email_type);
CREATE INDEX IF NOT EXISTS idx_email_patterns_created_at ON email_patterns(created_at DESC);

-- Full-text search on arguments
CREATE INDEX IF NOT EXISTS idx_email_patterns_arguments_search ON email_patterns
    USING gin(to_tsvector('english', primary_argument));

-- ============================================================================
-- EMAIL PATTERN AGGREGATES VIEW
-- ============================================================================
-- Quick view of success rates by insurer/state/type
CREATE OR REPLACE VIEW email_pattern_success_rates AS
SELECT
    insurer,
    state,
    email_type,
    COUNT(*) AS total_emails,
    COUNT(*) FILTER (WHERE outcome = 'approved') AS approved_count,
    COUNT(*) FILTER (WHERE outcome = 'partial') AS partial_count,
    COUNT(*) FILTER (WHERE outcome = 'denied') AS denied_count,
    COUNT(*) FILTER (WHERE is_successful = true) AS successful_count,
    ROUND(
        (COUNT(*) FILTER (WHERE is_successful = true)::DECIMAL / NULLIF(COUNT(*) FILTER (WHERE outcome != 'pending' AND outcome != 'unknown'), 0)) * 100,
        1
    ) AS success_rate_pct,
    AVG(response_time_days) FILTER (WHERE response_time_days IS NOT NULL) AS avg_response_days,
    AVG(amount_approved / NULLIF(amount_requested, 0) * 100) FILTER (WHERE amount_requested > 0) AS avg_approval_pct
FROM email_patterns
GROUP BY insurer, state, email_type
HAVING COUNT(*) >= 1
ORDER BY success_rate_pct DESC NULLS LAST;

-- ============================================================================
-- ARGUMENT EFFECTIVENESS TABLE
-- ============================================================================
-- Tracks which specific arguments work for which insurers
CREATE TABLE IF NOT EXISTS argument_effectiveness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Argument details
    argument_text TEXT NOT NULL,            -- The actual argument/approach
    argument_type VARCHAR(50),              -- 'code_citation', 'manufacturer_spec', 'industry_standard', 'policy_language', 'visual_evidence'

    -- Context where it works
    effective_for_insurers JSONB DEFAULT '[]',   -- Insurers where this works
    effective_for_states JSONB DEFAULT '[]',     -- States where this works
    effective_for_email_types JSONB DEFAULT '[]', -- Email types where applicable

    -- Effectiveness tracking
    times_used INTEGER DEFAULT 0,
    times_successful INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE WHEN times_used > 0
        THEN (times_successful::DECIMAL / times_used) * 100
        ELSE 0 END
    ) STORED,

    -- Source patterns
    source_pattern_ids JSONB DEFAULT '[]',  -- email_patterns.id where this was used

    -- Timestamps
    first_used_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_argument_effectiveness_type ON argument_effectiveness(argument_type);
CREATE INDEX IF NOT EXISTS idx_argument_effectiveness_success_rate ON argument_effectiveness(success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_argument_effectiveness_times_used ON argument_effectiveness(times_used DESC);

-- Full-text search
CREATE INDEX IF NOT EXISTS idx_argument_effectiveness_search ON argument_effectiveness
    USING gin(to_tsvector('english', argument_text));

-- GIN index for JSONB arrays
CREATE INDEX IF NOT EXISTS idx_argument_effectiveness_insurers ON argument_effectiveness
    USING gin(effective_for_insurers);
CREATE INDEX IF NOT EXISTS idx_argument_effectiveness_states ON argument_effectiveness
    USING gin(effective_for_states);

-- ============================================================================
-- FUNCTION: Get successful patterns for a situation
-- ============================================================================
CREATE OR REPLACE FUNCTION get_successful_email_patterns(
    p_insurer VARCHAR(100),
    p_state VARCHAR(2),
    p_email_type VARCHAR(50),
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    primary_argument TEXT,
    arguments_used JSONB,
    code_citations JSONB,
    tone VARCHAR(50),
    outcome VARCHAR(50),
    success_rate DECIMAL,
    times_used_similar BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ep.id,
        ep.primary_argument,
        ep.arguments_used,
        ep.code_citations,
        ep.tone,
        ep.outcome,
        COALESCE(sr.success_rate_pct, 0) AS success_rate,
        COALESCE(sr.total_emails, 0) AS times_used_similar
    FROM email_patterns ep
    LEFT JOIN email_pattern_success_rates sr ON
        sr.insurer = ep.insurer AND
        sr.state = ep.state AND
        sr.email_type = ep.email_type
    WHERE ep.is_successful = true
      AND (p_insurer IS NULL OR ep.insurer ILIKE p_insurer)
      AND (p_state IS NULL OR ep.state = p_state)
      AND (p_email_type IS NULL OR ep.email_type = p_email_type)
    ORDER BY
        -- Exact match priority
        CASE WHEN ep.insurer ILIKE p_insurer AND ep.state = p_state THEN 0 ELSE 1 END,
        -- Then by success rate
        sr.success_rate_pct DESC NULLS LAST,
        -- Then by recency
        ep.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get best arguments for a situation
-- ============================================================================
CREATE OR REPLACE FUNCTION get_best_arguments(
    p_insurer VARCHAR(100),
    p_state VARCHAR(2),
    p_email_type VARCHAR(50),
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    argument_text TEXT,
    argument_type VARCHAR(50),
    success_rate DECIMAL(5,2),
    times_used INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ae.argument_text,
        ae.argument_type,
        ae.success_rate,
        ae.times_used
    FROM argument_effectiveness ae
    WHERE ae.times_used >= 2
      AND ae.success_rate >= 50
      AND (
          p_insurer IS NULL
          OR ae.effective_for_insurers ? p_insurer
          OR ae.effective_for_insurers = '[]'::jsonb
      )
      AND (
          p_state IS NULL
          OR ae.effective_for_states ? p_state
          OR ae.effective_for_states = '[]'::jsonb
      )
      AND (
          p_email_type IS NULL
          OR ae.effective_for_email_types ? p_email_type
          OR ae.effective_for_email_types = '[]'::jsonb
      )
    ORDER BY
        ae.success_rate DESC,
        ae.times_used DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Update timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_email_pattern_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_email_pattern_timestamp ON email_patterns;
CREATE TRIGGER trigger_update_email_pattern_timestamp
    BEFORE UPDATE ON email_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_email_pattern_timestamp();

DROP TRIGGER IF EXISTS trigger_update_argument_timestamp ON argument_effectiveness;
CREATE TRIGGER trigger_update_argument_timestamp
    BEFORE UPDATE ON argument_effectiveness
    FOR EACH ROW
    EXECUTE FUNCTION update_email_pattern_timestamp();

-- ============================================================================
-- TRIGGER: Update is_successful based on outcome
-- ============================================================================
CREATE OR REPLACE FUNCTION update_email_pattern_success()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_successful = (NEW.outcome IN ('approved', 'partial'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_email_pattern_success ON email_patterns;
CREATE TRIGGER trigger_update_email_pattern_success
    BEFORE INSERT OR UPDATE OF outcome ON email_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_email_pattern_success();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE email_patterns IS 'Tracks email strategies and outcomes for pattern learning';
COMMENT ON TABLE argument_effectiveness IS 'Aggregated effectiveness of specific arguments across all emails';
COMMENT ON VIEW email_pattern_success_rates IS 'Quick reference for success rates by insurer/state/email type combination';

COMMENT ON COLUMN email_patterns.email_type IS 'Type: supplement, dispute, follow_up, initial_claim, appeal, escalation';
COMMENT ON COLUMN email_patterns.outcome IS 'Result: approved, partial, denied, pending, no_response, unknown';
COMMENT ON COLUMN email_patterns.arguments_used IS 'Array of argument strategies: [{type, text, citation}]';
COMMENT ON COLUMN argument_effectiveness.effective_for_insurers IS 'JSON array of insurer names where this argument has proven effective';
