-- ============================================================================
-- Migration 005: API Usage Tracking and Budget Management
-- ============================================================================
-- Description: Complete API usage tracking system with budget monitoring,
--              cost calculation, and analytics for multi-provider AI services
-- Created: 2025-11-05
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. API PROVIDERS TABLE
-- ============================================================================
-- Stores pricing information for each AI provider and service type
CREATE TABLE IF NOT EXISTS api_providers (
    id SERIAL PRIMARY KEY,
    provider_name VARCHAR(100) NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    model_name VARCHAR(200) NOT NULL,
    pricing_type VARCHAR(50) NOT NULL CHECK (pricing_type IN ('per_token', 'per_minute', 'per_request', 'free')),
    input_token_price DECIMAL(12, 8) DEFAULT 0.00000000,
    output_token_price DECIMAL(12, 8) DEFAULT 0.00000000,
    per_minute_price DECIMAL(12, 8) DEFAULT 0.00000000,
    per_request_price DECIMAL(12, 8) DEFAULT 0.00000000,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_name, service_type, model_name)
);

-- Index for fast provider lookups
CREATE INDEX idx_api_providers_active ON api_providers(provider_name, service_type, is_active);
CREATE INDEX idx_api_providers_model ON api_providers(model_name) WHERE is_active = true;

COMMENT ON TABLE api_providers IS 'Pricing information for AI providers and their services';
COMMENT ON COLUMN api_providers.pricing_type IS 'Pricing model: per_token, per_minute, per_request, or free';
COMMENT ON COLUMN api_providers.input_token_price IS 'Cost per 1M input tokens';
COMMENT ON COLUMN api_providers.output_token_price IS 'Cost per 1M output tokens';

-- ============================================================================
-- 2. API USAGE LOG TABLE
-- ============================================================================
-- Tracks every API call with usage metrics and cost estimation
CREATE TABLE IF NOT EXISTS api_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id INTEGER REFERENCES api_providers(id) ON DELETE SET NULL,
    provider_name VARCHAR(100) NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    model_name VARCHAR(200),
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
    duration_ms INTEGER DEFAULT 0,
    estimated_cost DECIMAL(12, 8) DEFAULT 0.00000000,
    feature_used VARCHAR(100),
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for analytics and queries
CREATE INDEX idx_api_usage_user_id ON api_usage_log(user_id);
CREATE INDEX idx_api_usage_provider ON api_usage_log(provider_name);
CREATE INDEX idx_api_usage_service_type ON api_usage_log(service_type);
CREATE INDEX idx_api_usage_created_at ON api_usage_log(created_at DESC);
CREATE INDEX idx_api_usage_feature ON api_usage_log(feature_used);
CREATE INDEX idx_api_usage_success ON api_usage_log(success, created_at) WHERE success = false;
CREATE INDEX idx_api_usage_cost ON api_usage_log(estimated_cost) WHERE estimated_cost > 0;

-- Composite index for user spending queries
CREATE INDEX idx_api_usage_user_date_cost ON api_usage_log(user_id, created_at, estimated_cost);

COMMENT ON TABLE api_usage_log IS 'Detailed log of every API call with usage metrics';
COMMENT ON COLUMN api_usage_log.provider_name IS 'Denormalized for fast queries without joins';
COMMENT ON COLUMN api_usage_log.feature_used IS 'Application feature: chat, live_susan, transcription, document_analysis';
COMMENT ON COLUMN api_usage_log.metadata IS 'Additional context (prompt, response preview, user context)';

-- ============================================================================
-- 3. USER BUDGETS TABLE
-- ============================================================================
-- Budget limits and spending tracking per user
CREATE TABLE IF NOT EXISTS user_budgets (
    id SERIAL PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    monthly_budget DECIMAL(12, 2) NOT NULL DEFAULT 100.00,
    current_month_spend DECIMAL(12, 8) DEFAULT 0.00000000,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    alert_threshold_80 BOOLEAN DEFAULT true,
    alert_threshold_90 BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_budget CHECK (monthly_budget >= 0),
    CONSTRAINT positive_spend CHECK (current_month_spend >= 0)
);

CREATE INDEX idx_user_budgets_active ON user_budgets(user_id) WHERE is_active = true;
CREATE INDEX idx_user_budgets_reset_date ON user_budgets(last_reset_date);

COMMENT ON TABLE user_budgets IS 'Monthly budget limits and spending tracking per user';
COMMENT ON COLUMN user_budgets.current_month_spend IS 'Running total that resets monthly';
COMMENT ON COLUMN user_budgets.alert_threshold_80 IS 'Send alert when 80% of budget is used';

-- ============================================================================
-- 4. COMPANY BUDGET TABLE
-- ============================================================================
-- Global budget limits for the entire organization
CREATE TABLE IF NOT EXISTS company_budget (
    id SERIAL PRIMARY KEY,
    monthly_budget DECIMAL(12, 2) NOT NULL DEFAULT 10000.00,
    current_month_spend DECIMAL(12, 8) DEFAULT 0.00000000,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    fiscal_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_company_budget CHECK (monthly_budget >= 0),
    CONSTRAINT positive_company_spend CHECK (current_month_spend >= 0)
);

-- Insert initial company budget record
INSERT INTO company_budget (monthly_budget, current_month_spend, notes)
VALUES (10000.00, 0.00, 'Initial company-wide API budget')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE company_budget IS 'Global budget limits for entire organization';

-- ============================================================================
-- 5. BUDGET ALERTS TABLE
-- ============================================================================
-- Track budget warnings and notifications
CREATE TABLE IF NOT EXISTS budget_alerts (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
        'user_80', 'user_90', 'user_100',
        'company_80', 'company_90', 'company_100'
    )),
    threshold_percentage INTEGER NOT NULL,
    current_spend DECIMAL(12, 8) NOT NULL,
    budget_limit DECIMAL(12, 2) NOT NULL,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT valid_threshold CHECK (threshold_percentage IN (80, 90, 100))
);

CREATE INDEX idx_budget_alerts_user ON budget_alerts(user_id, triggered_at DESC);
CREATE INDEX idx_budget_alerts_unacknowledged ON budget_alerts(acknowledged, triggered_at) WHERE acknowledged = false;
CREATE INDEX idx_budget_alerts_type ON budget_alerts(alert_type, triggered_at DESC);

COMMENT ON TABLE budget_alerts IS 'Budget warning notifications and acknowledgment tracking';
COMMENT ON COLUMN budget_alerts.user_id IS 'NULL for company-wide alerts';

-- ============================================================================
-- 6. ANALYTICS VIEWS
-- ============================================================================

-- View: User API Usage Summary
CREATE OR REPLACE VIEW user_api_usage_summary AS
SELECT
    u.id AS user_id,
    u.username,
    u.email,
    COUNT(*) AS total_requests,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successful_requests,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) AS failed_requests,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    SUM(total_tokens) AS total_tokens,
    SUM(estimated_cost) AS total_cost,
    AVG(duration_ms) AS avg_duration_ms,
    MAX(created_at) AS last_api_call,
    ub.monthly_budget,
    ub.current_month_spend,
    ROUND((ub.current_month_spend / NULLIF(ub.monthly_budget, 0) * 100), 2) AS budget_usage_percentage
FROM users u
LEFT JOIN api_usage_log aul ON u.id = aul.user_id
LEFT JOIN user_budgets ub ON u.id = ub.user_id
GROUP BY u.id, u.username, u.email, ub.monthly_budget, ub.current_month_spend;

COMMENT ON VIEW user_api_usage_summary IS 'Per-user API usage statistics and budget status';

-- View: Provider Cost Breakdown
CREATE OR REPLACE VIEW provider_cost_breakdown AS
SELECT
    provider_name,
    service_type,
    model_name,
    COUNT(*) AS request_count,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successful_requests,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    SUM(estimated_cost) AS total_cost,
    AVG(estimated_cost) AS avg_cost_per_request,
    AVG(duration_ms) AS avg_duration_ms,
    MIN(created_at) AS first_used,
    MAX(created_at) AS last_used
FROM api_usage_log
GROUP BY provider_name, service_type, model_name
ORDER BY total_cost DESC;

COMMENT ON VIEW provider_cost_breakdown IS 'Cost analysis by provider and service type';

-- View: Daily API Usage Trends
CREATE OR REPLACE VIEW daily_api_usage_trends AS
SELECT
    DATE(created_at) AS usage_date,
    provider_name,
    service_type,
    COUNT(*) AS request_count,
    SUM(input_tokens) AS input_tokens,
    SUM(output_tokens) AS output_tokens,
    SUM(estimated_cost) AS daily_cost,
    AVG(duration_ms) AS avg_duration_ms,
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100 AS success_rate
FROM api_usage_log
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at), provider_name, service_type
ORDER BY usage_date DESC, daily_cost DESC;

COMMENT ON VIEW daily_api_usage_trends IS 'Time series data for daily API usage and costs';

-- View: Feature Usage Breakdown
CREATE OR REPLACE VIEW feature_usage_breakdown AS
SELECT
    feature_used,
    provider_name,
    COUNT(*) AS usage_count,
    SUM(estimated_cost) AS total_cost,
    AVG(estimated_cost) AS avg_cost,
    SUM(total_tokens) AS total_tokens,
    AVG(duration_ms) AS avg_duration_ms,
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100 AS success_rate
FROM api_usage_log
WHERE feature_used IS NOT NULL
GROUP BY feature_used, provider_name
ORDER BY usage_count DESC;

COMMENT ON VIEW feature_usage_breakdown IS 'Usage statistics by application feature';

-- View: Monthly Spending Report
CREATE OR REPLACE VIEW monthly_spending_report AS
SELECT
    TO_CHAR(created_at, 'YYYY-MM') AS month,
    COUNT(DISTINCT user_id) AS active_users,
    COUNT(*) AS total_requests,
    SUM(estimated_cost) AS total_spend,
    AVG(estimated_cost) AS avg_cost_per_request,
    SUM(total_tokens) AS total_tokens,
    (SELECT monthly_budget FROM company_budget ORDER BY id DESC LIMIT 1) AS company_budget,
    ROUND((SUM(estimated_cost) / (SELECT monthly_budget FROM company_budget ORDER BY id DESC LIMIT 1) * 100), 2) AS budget_usage_percentage
FROM api_usage_log
GROUP BY TO_CHAR(created_at, 'YYYY-MM')
ORDER BY month DESC;

COMMENT ON VIEW monthly_spending_report IS 'Monthly aggregated spending and usage metrics';

-- ============================================================================
-- 7. FUNCTIONS
-- ============================================================================

-- Function: Calculate API Cost
CREATE OR REPLACE FUNCTION calculate_api_cost(
    p_provider_id INTEGER,
    p_input_tokens INTEGER,
    p_output_tokens INTEGER,
    p_duration_ms INTEGER DEFAULT 0
) RETURNS DECIMAL(12, 8) AS $$
DECLARE
    v_cost DECIMAL(12, 8) := 0.00000000;
    v_pricing_type VARCHAR(50);
    v_input_price DECIMAL(12, 8);
    v_output_price DECIMAL(12, 8);
    v_per_minute_price DECIMAL(12, 8);
    v_per_request_price DECIMAL(12, 8);
BEGIN
    -- Get pricing information
    SELECT
        pricing_type,
        input_token_price,
        output_token_price,
        per_minute_price,
        per_request_price
    INTO
        v_pricing_type,
        v_input_price,
        v_output_price,
        v_per_minute_price,
        v_per_request_price
    FROM api_providers
    WHERE id = p_provider_id AND is_active = true;

    -- If provider not found, return 0
    IF NOT FOUND THEN
        RETURN 0.00000000;
    END IF;

    -- Calculate cost based on pricing type
    CASE v_pricing_type
        WHEN 'per_token' THEN
            -- Cost = (input_tokens * input_price + output_tokens * output_price) / 1,000,000
            v_cost := (p_input_tokens * v_input_price + p_output_tokens * v_output_price) / 1000000.0;
        WHEN 'per_minute' THEN
            -- Cost = (duration_ms / 60000) * per_minute_price
            v_cost := (p_duration_ms / 60000.0) * v_per_minute_price;
        WHEN 'per_request' THEN
            -- Flat rate per request
            v_cost := v_per_request_price;
        WHEN 'free' THEN
            -- Free tier
            v_cost := 0.00000000;
        ELSE
            v_cost := 0.00000000;
    END CASE;

    RETURN v_cost;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_api_cost IS 'Calculate API call cost based on provider pricing';

-- Function: Update User Budget on API Call (Trigger Function)
CREATE OR REPLACE FUNCTION update_user_budget_on_api_call()
RETURNS TRIGGER AS $$
DECLARE
    v_user_budget_id INTEGER;
    v_current_month_spend DECIMAL(12, 8);
    v_monthly_budget DECIMAL(12, 2);
BEGIN
    -- Ensure user has a budget record
    INSERT INTO user_budgets (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Update user's current month spend
    UPDATE user_budgets
    SET
        current_month_spend = current_month_spend + NEW.estimated_cost,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id
    RETURNING id, current_month_spend, monthly_budget
    INTO v_user_budget_id, v_current_month_spend, v_monthly_budget;

    -- Update company budget
    UPDATE company_budget
    SET
        current_month_spend = current_month_spend + NEW.estimated_cost,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = (SELECT id FROM company_budget ORDER BY id DESC LIMIT 1);

    -- Check for budget alerts (80%, 90%, 100%)
    PERFORM check_budget_alerts();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_user_budget_on_api_call IS 'Trigger function to update budgets after API calls';

-- Function: Check Budget Alerts
CREATE OR REPLACE FUNCTION check_budget_alerts()
RETURNS VOID AS $$
DECLARE
    v_user RECORD;
    v_company RECORD;
    v_percentage DECIMAL(5, 2);
BEGIN
    -- Check user budgets
    FOR v_user IN
        SELECT
            user_id,
            monthly_budget,
            current_month_spend,
            alert_threshold_80,
            alert_threshold_90,
            ROUND((current_month_spend / NULLIF(monthly_budget, 0) * 100), 2) AS usage_percentage
        FROM user_budgets
        WHERE is_active = true AND monthly_budget > 0
    LOOP
        v_percentage := v_user.usage_percentage;

        -- 100% threshold
        IF v_percentage >= 100 THEN
            INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
            VALUES (v_user.user_id, 'user_100', 100, v_user.current_month_spend, v_user.monthly_budget)
            ON CONFLICT DO NOTHING;
        -- 90% threshold
        ELSIF v_percentage >= 90 AND v_user.alert_threshold_90 THEN
            INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
            SELECT v_user.user_id, 'user_90', 90, v_user.current_month_spend, v_user.monthly_budget
            WHERE NOT EXISTS (
                SELECT 1 FROM budget_alerts
                WHERE user_id = v_user.user_id
                AND alert_type = 'user_90'
                AND triggered_at >= CURRENT_DATE
            );
        -- 80% threshold
        ELSIF v_percentage >= 80 AND v_user.alert_threshold_80 THEN
            INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
            SELECT v_user.user_id, 'user_80', 80, v_user.current_month_spend, v_user.monthly_budget
            WHERE NOT EXISTS (
                SELECT 1 FROM budget_alerts
                WHERE user_id = v_user.user_id
                AND alert_type = 'user_80'
                AND triggered_at >= CURRENT_DATE
            );
        END IF;
    END LOOP;

    -- Check company budget
    SELECT
        monthly_budget,
        current_month_spend,
        ROUND((current_month_spend / NULLIF(monthly_budget, 0) * 100), 2) AS usage_percentage
    INTO v_company
    FROM company_budget
    ORDER BY id DESC LIMIT 1;

    IF v_company.usage_percentage >= 100 THEN
        INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
        VALUES (NULL, 'company_100', 100, v_company.current_month_spend, v_company.monthly_budget)
        ON CONFLICT DO NOTHING;
    ELSIF v_company.usage_percentage >= 90 THEN
        INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
        SELECT NULL, 'company_90', 90, v_company.current_month_spend, v_company.monthly_budget
        WHERE NOT EXISTS (
            SELECT 1 FROM budget_alerts
            WHERE user_id IS NULL
            AND alert_type = 'company_90'
            AND triggered_at >= CURRENT_DATE
        );
    ELSIF v_company.usage_percentage >= 80 THEN
        INSERT INTO budget_alerts (user_id, alert_type, threshold_percentage, current_spend, budget_limit)
        SELECT NULL, 'company_80', 80, v_company.current_month_spend, v_company.monthly_budget
        WHERE NOT EXISTS (
            SELECT 1 FROM budget_alerts
            WHERE user_id IS NULL
            AND alert_type = 'company_80'
            AND triggered_at >= CURRENT_DATE
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_budget_alerts IS 'Check and create budget alerts at 80%, 90%, and 100% thresholds';

-- Function: Reset Monthly Budgets
CREATE OR REPLACE FUNCTION reset_monthly_budgets()
RETURNS VOID AS $$
BEGIN
    -- Reset user budgets if month has changed
    UPDATE user_budgets
    SET
        current_month_spend = 0.00000000,
        last_reset_date = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP
    WHERE last_reset_date < DATE_TRUNC('month', CURRENT_DATE);

    -- Reset company budget if month has changed
    UPDATE company_budget
    SET
        current_month_spend = 0.00000000,
        last_reset_date = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP
    WHERE last_reset_date < DATE_TRUNC('month', CURRENT_DATE);

    -- Archive old alerts (optional - keep last 6 months)
    DELETE FROM budget_alerts
    WHERE triggered_at < CURRENT_DATE - INTERVAL '6 months';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_monthly_budgets IS 'Reset monthly budget counters (run via cron job)';

-- ============================================================================
-- 8. TRIGGERS
-- ============================================================================

-- Trigger: Update user budget after API call
CREATE TRIGGER trg_update_user_budget_after_api_call
AFTER INSERT ON api_usage_log
FOR EACH ROW
EXECUTE FUNCTION update_user_budget_on_api_call();

-- Trigger: Update api_providers updated_at
CREATE TRIGGER trg_api_providers_updated_at
BEFORE UPDATE ON api_providers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update user_budgets updated_at
CREATE TRIGGER trg_user_budgets_updated_at
BEFORE UPDATE ON user_budgets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update company_budget updated_at
CREATE TRIGGER trg_company_budget_updated_at
BEFORE UPDATE ON company_budget
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9. SEED DATA - API PROVIDER PRICING (2025 Current Rates)
-- ============================================================================
-- Note: Prices are per 1M tokens unless specified otherwise
-- Last updated: January 2025

-- Google Gemini Pricing (Free during experimental preview, then very low cost)
-- Source: Google AI Studio pricing (ai.google.dev/pricing)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('gemini', 'chat', 'gemini-2.0-flash', 'free', 0.0, 0.0),  -- Currently FREE in preview
('gemini', 'chat', 'gemini-2.0-flash-thinking-exp', 'free', 0.0, 0.0),  -- Currently FREE in preview
('gemini', 'chat', 'gemini-1.5-pro', 'per_token', 1.25, 5.00),  -- Actual paid tier pricing
('gemini', 'chat', 'gemini-1.5-flash', 'per_token', 0.075, 0.30),  -- When paid ($0.075/$0.30 per 1M)
('gemini', 'image_analysis', 'gemini-2.0-flash', 'free', 0.0, 0.0),  -- Same model, currently FREE
('gemini', 'embedding', 'text-embedding-004', 'per_token', 0.00001, 0.0);  -- Embeddings are very cheap

-- Groq Pricing (Free tier available, paid tier is ultra-fast and cheap)
-- Source: groq.com/pricing (Free tier: 14,400 requests/day, Paid: $0.05-$0.10 per 1M)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('groq', 'chat', 'llama-3.3-70b-versatile', 'per_token', 0.059, 0.079),  -- $0.059/$0.079 per 1M tokens
('groq', 'chat', 'llama-3.1-70b-versatile', 'per_token', 0.059, 0.079),  -- Same pricing
('groq', 'chat', 'mixtral-8x7b-32768', 'per_token', 0.024, 0.024),  -- Cheaper model
('groq', 'chat', 'gemma2-9b-it', 'per_token', 0.02, 0.02);  -- Smallest/cheapest

-- Together AI Pricing (Competitive rates for open models)
-- Source: together.ai/pricing (Turbo models: $0.18/$0.18, smaller: $0.06/$0.06)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('together', 'chat', 'meta-llama/Llama-3.1-70B-Instruct-Turbo', 'per_token', 0.18, 0.18),  -- $0.18 per 1M
('together', 'chat', 'meta-llama/Llama-3.1-8B-Instruct-Turbo', 'per_token', 0.06, 0.06),  -- Smaller model
('together', 'chat', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'per_token', 0.12, 0.12),  -- Mid-tier
('together', 'chat', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'per_token', 0.18, 0.18);  -- Same as Llama 70B

-- DeepSeek Pricing (Known for being very cheap - actual 2025 rates)
-- Source: platform.deepseek.com/api-docs/pricing
-- DeepSeek-Chat: $0.14 input / $0.28 output per 1M tokens
-- DeepSeek-Reasoner: $0.55 input / $2.19 output per 1M tokens (uses reasoning tokens)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('deepseek', 'chat', 'deepseek-chat', 'per_token', 0.14, 0.28),  -- Very affordable
('deepseek', 'chat', 'deepseek-reasoner', 'per_token', 0.55, 2.19);  -- Reasoning model (more expensive)

-- HuggingFace Inference API (Free tier available)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('huggingface', 'chat', 'meta-llama/Llama-3.2-3B-Instruct', 'free', 0.0, 0.0),  -- Free inference
('huggingface', 'image_analysis', 'Salesforce/blip-image-captioning-large', 'free', 0.0, 0.0);  -- Free

-- Ollama (Self-hosted - Completely Free)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, input_token_price, output_token_price) VALUES
('ollama', 'chat', 'llama3.2', 'free', 0.0, 0.0),  -- Self-hosted
('ollama', 'chat', 'qwen2.5-coder', 'free', 0.0, 0.0),  -- Self-hosted
('ollama', 'chat', 'deepseek-r1', 'free', 0.0, 0.0),  -- Self-hosted
('ollama', 'embedding', 'nomic-embed-text', 'free', 0.0, 0.0);  -- Self-hosted

-- Audio Transcription Services (2025 rates)
-- Google Speech-to-Text: Chirp 2 is free during preview, then ~$0.002-$0.005/min
-- Deepgram: Nova-2 is $0.0043/min
-- AssemblyAI: Best model is $0.00037/min (very cheap)
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, per_minute_price) VALUES
('google-speech', 'transcription', 'chirp-2', 'per_minute', 0.002),  -- Chirp 2 (free in preview)
('google-speech', 'transcription', 'latest_long', 'per_minute', 0.005),  -- Standard long audio
('deepgram', 'transcription', 'nova-2', 'per_minute', 0.0043),  -- Nova-2 model
('assemblyai', 'transcription', 'best', 'per_minute', 0.00037);  -- Very affordable

-- Web Search APIs (2025 rates)
-- Brave Search: ~$0.0005 per request (very cheap)
-- Serper: ~$0.001 per request
INSERT INTO api_providers (provider_name, service_type, model_name, pricing_type, per_request_price) VALUES
('brave-search', 'web_search', 'web-search-api', 'per_request', 0.0005),  -- Cost-effective
('serper', 'web_search', 'google-search-api', 'per_request', 0.001);  -- Standard rate

-- ============================================================================
-- 10. HELPER FUNCTIONS FOR APPLICATION USE
-- ============================================================================

-- Function: Get User Budget Status
CREATE OR REPLACE FUNCTION get_user_budget_status(p_user_id UUID)
RETURNS TABLE(
    monthly_budget DECIMAL(12, 2),
    current_spend DECIMAL(12, 8),
    remaining_budget DECIMAL(12, 8),
    usage_percentage DECIMAL(5, 2),
    is_over_budget BOOLEAN,
    days_until_reset INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ub.monthly_budget,
        ub.current_month_spend,
        ub.monthly_budget - ub.current_month_spend AS remaining_budget,
        ROUND((ub.current_month_spend / NULLIF(ub.monthly_budget, 0) * 100), 2) AS usage_percentage,
        ub.current_month_spend >= ub.monthly_budget AS is_over_budget,
        (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - CURRENT_DATE)::INTEGER AS days_until_reset
    FROM user_budgets ub
    WHERE ub.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Get Company Budget Status
CREATE OR REPLACE FUNCTION get_company_budget_status()
RETURNS TABLE(
    monthly_budget DECIMAL(12, 2),
    current_spend DECIMAL(12, 8),
    remaining_budget DECIMAL(12, 8),
    usage_percentage DECIMAL(5, 2),
    is_over_budget BOOLEAN,
    active_users_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cb.monthly_budget,
        cb.current_month_spend,
        cb.monthly_budget - cb.current_month_spend AS remaining_budget,
        ROUND((cb.current_month_spend / NULLIF(cb.monthly_budget, 0) * 100), 2) AS usage_percentage,
        cb.current_month_spend >= cb.monthly_budget AS is_over_budget,
        (SELECT COUNT(DISTINCT user_id) FROM api_usage_log
         WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE))::INTEGER AS active_users_count
    FROM company_budget cb
    ORDER BY cb.id DESC LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Log API Usage (convenience function for application)
CREATE OR REPLACE FUNCTION log_api_usage(
    p_user_id UUID,
    p_provider_name VARCHAR,
    p_service_type VARCHAR,
    p_model_name VARCHAR,
    p_input_tokens INTEGER DEFAULT 0,
    p_output_tokens INTEGER DEFAULT 0,
    p_duration_ms INTEGER DEFAULT 0,
    p_feature_used VARCHAR DEFAULT NULL,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_usage_id UUID;
    v_provider_id INTEGER;
    v_estimated_cost DECIMAL(12, 8);
BEGIN
    -- Get provider ID
    SELECT id INTO v_provider_id
    FROM api_providers
    WHERE provider_name = p_provider_name
      AND service_type = p_service_type
      AND model_name = p_model_name
      AND is_active = true
    LIMIT 1;

    -- Calculate cost
    IF v_provider_id IS NOT NULL THEN
        v_estimated_cost := calculate_api_cost(v_provider_id, p_input_tokens, p_output_tokens, p_duration_ms);
    ELSE
        v_estimated_cost := 0.00000000;
    END IF;

    -- Insert usage log
    INSERT INTO api_usage_log (
        user_id, provider_id, provider_name, service_type, model_name,
        input_tokens, output_tokens, duration_ms, estimated_cost,
        feature_used, success, error_message, metadata
    ) VALUES (
        p_user_id, v_provider_id, p_provider_name, p_service_type, p_model_name,
        p_input_tokens, p_output_tokens, p_duration_ms, v_estimated_cost,
        p_feature_used, p_success, p_error_message, p_metadata
    )
    RETURNING id INTO v_usage_id;

    RETURN v_usage_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_api_usage IS 'Convenience function to log API usage from application code';

-- ============================================================================
-- 11. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Additional performance indexes
CREATE INDEX IF NOT EXISTS idx_api_usage_log_user_month ON api_usage_log(user_id, DATE_TRUNC('month', created_at));
CREATE INDEX IF NOT EXISTS idx_api_usage_log_provider_month ON api_usage_log(provider_name, DATE_TRUNC('month', created_at));
CREATE INDEX IF NOT EXISTS idx_budget_alerts_user_unack ON budget_alerts(user_id, acknowledged) WHERE acknowledged = false;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMIT;

-- Display success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 005 completed successfully!';
    RAISE NOTICE '📊 Created tables: api_providers, api_usage_log, user_budgets, company_budget, budget_alerts';
    RAISE NOTICE '📈 Created views: user_api_usage_summary, provider_cost_breakdown, daily_api_usage_trends, feature_usage_breakdown, monthly_spending_report';
    RAISE NOTICE '⚙️  Created functions: calculate_api_cost, update_user_budget_on_api_call, check_budget_alerts, reset_monthly_budgets';
    RAISE NOTICE '💰 Seeded pricing data for: Gemini, Groq, Together AI, DeepSeek, HuggingFace, Ollama, Speech APIs';
    RAISE NOTICE '🎯 Next steps: Run reset_monthly_budgets() via cron job (e.g., monthly on 1st)';
END $$;
