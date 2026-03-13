-- ==========================================================================
-- Migration 062: Lead SMS Follow-Up Sequences
-- Tracks automated SMS follow-ups for leads captured through landing pages
-- Day 0: Confirmation | Day 3: Check-in | Day 7: Final follow-up
-- ==========================================================================

-- ============================================================================
-- LEAD SMS FOLLOW-UP TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_sms_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to the lead
    lead_id UUID NOT NULL REFERENCES profile_leads(id) ON DELETE CASCADE,

    -- Contact info (denormalized for reliability — lead may be updated)
    phone_number VARCHAR(20) NOT NULL,
    homeowner_name VARCHAR(255) NOT NULL,

    -- Sequence tracking
    sequence_step VARCHAR(20) NOT NULL DEFAULT 'day0',  -- 'day0', 'day3', 'day7'
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    message_sid VARCHAR(100),  -- Twilio SID
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'failed', 'skipped', 'opted_out'
    error_message TEXT,

    -- Opt-out tracking
    opted_out BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Find pending follow-ups that need to be sent
CREATE INDEX IF NOT EXISTS idx_lead_sms_pending
    ON lead_sms_followups(status, scheduled_at)
    WHERE status = 'pending';

-- Find all follow-ups for a lead
CREATE INDEX IF NOT EXISTS idx_lead_sms_lead_id
    ON lead_sms_followups(lead_id);

-- Find by phone number (for opt-out lookups)
CREATE INDEX IF NOT EXISTS idx_lead_sms_phone
    ON lead_sms_followups(phone_number);

-- ============================================================================
-- OPT-OUT TABLE (TCPA compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sms_opt_outs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    opted_out_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'reply_stop'  -- 'reply_stop', 'manual', 'admin'
);

CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_phone
    ON sms_opt_outs(phone_number);

-- ============================================================================
-- UPDATE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_lead_sms_followup_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lead_sms_followups_updated ON lead_sms_followups;
CREATE TRIGGER trigger_lead_sms_followups_updated
    BEFORE UPDATE ON lead_sms_followups
    FOR EACH ROW
    EXECUTE FUNCTION update_lead_sms_followup_timestamp();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '062: Lead SMS Follow-Up Sequences created';
    RAISE NOTICE '  - lead_sms_followups table (Day 0/3/7 sequences)';
    RAISE NOTICE '  - sms_opt_outs table (TCPA compliance)';
END $$;
