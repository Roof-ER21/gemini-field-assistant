-- Migration 052: Agreements System
-- E-signature capture for Claim Authorization and Contingency agreements

-- Agreements table
CREATE TABLE IF NOT EXISTS agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id UUID REFERENCES presentations(id) ON DELETE SET NULL,
  inspection_id UUID REFERENCES inspections(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Type
  agreement_type VARCHAR(50) NOT NULL CHECK (agreement_type IN ('claim_authorization', 'contingency')),

  -- Customer info (snapshot at time of signing)
  customer_name VARCHAR(255) NOT NULL,
  customer_address TEXT,
  customer_phone VARCHAR(50),
  customer_email VARCHAR(255),

  -- Insurance info
  insurance_company VARCHAR(255),
  claim_number VARCHAR(100),
  deductible DECIMAL(10,2),

  -- Signatures (base64 PNG)
  agent_signature TEXT,
  agent_name VARCHAR(255),
  customer_signature_1 TEXT NOT NULL,
  customer_signature_2 TEXT,

  -- Additional form data
  notes TEXT,
  form_data JSONB,

  -- Audit trail
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,

  -- Status
  status VARCHAR(50) DEFAULT 'signed' CHECK (status IN ('pending', 'signed', 'voided', 'expired')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agreement audit log for compliance tracking
CREATE TABLE IF NOT EXISTS agreement_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID REFERENCES agreements(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('created', 'viewed', 'started', 'signed', 'voided', 'emailed', 'downloaded')),
  actor_type VARCHAR(50) DEFAULT 'user' CHECK (actor_type IN ('user', 'customer', 'system')),
  actor_id UUID,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  details JSONB
);

-- Email delivery tracking for agreements
CREATE TABLE IF NOT EXISTS agreement_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID REFERENCES agreements(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  email_type VARCHAR(50) NOT NULL CHECK (email_type IN ('signed_copy', 'reminder', 'voided_notice')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agreements_presentation ON agreements(presentation_id);
CREATE INDEX IF NOT EXISTS idx_agreements_inspection ON agreements(inspection_id);
CREATE INDEX IF NOT EXISTS idx_agreements_job ON agreements(job_id);
CREATE INDEX IF NOT EXISTS idx_agreements_user ON agreements(user_id);
CREATE INDEX IF NOT EXISTS idx_agreements_type ON agreements(agreement_type);
CREATE INDEX IF NOT EXISTS idx_agreements_status ON agreements(status);
CREATE INDEX IF NOT EXISTS idx_agreements_signed_at ON agreements(signed_at);
CREATE INDEX IF NOT EXISTS idx_agreements_customer_email ON agreements(customer_email);

CREATE INDEX IF NOT EXISTS idx_agreement_logs_agreement ON agreement_logs(agreement_id);
CREATE INDEX IF NOT EXISTS idx_agreement_logs_action ON agreement_logs(action);
CREATE INDEX IF NOT EXISTS idx_agreement_logs_timestamp ON agreement_logs(timestamp);

CREATE INDEX IF NOT EXISTS idx_agreement_emails_agreement ON agreement_emails(agreement_id);
CREATE INDEX IF NOT EXISTS idx_agreement_emails_status ON agreement_emails(status);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_agreements_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_agreements_updated_at ON agreements;
CREATE TRIGGER trigger_agreements_updated_at
BEFORE UPDATE ON agreements
FOR EACH ROW
EXECUTE FUNCTION update_agreements_timestamp();

-- Function to log agreement actions
CREATE OR REPLACE FUNCTION log_agreement_action(
  p_agreement_id UUID,
  p_action VARCHAR(50),
  p_actor_type VARCHAR(50) DEFAULT 'system',
  p_actor_id UUID DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO agreement_logs (agreement_id, action, actor_type, actor_id, ip_address, user_agent, details)
  VALUES (p_agreement_id, p_action, p_actor_type, p_actor_id, p_ip_address, p_user_agent, p_details)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE agreements IS 'Signed agreements (Claim Authorization, Contingency) with e-signatures';
COMMENT ON COLUMN agreements.agreement_type IS 'Type: claim_authorization or contingency';
COMMENT ON COLUMN agreements.customer_signature_1 IS 'Base64 PNG of primary customer signature';
COMMENT ON COLUMN agreements.customer_signature_2 IS 'Base64 PNG of secondary customer signature (optional)';
COMMENT ON COLUMN agreements.agent_signature IS 'Base64 PNG of agent signature (for contingency)';
COMMENT ON COLUMN agreements.form_data IS 'Additional form fields as JSON';

COMMENT ON TABLE agreement_logs IS 'Audit trail for compliance - tracks all agreement interactions';
COMMENT ON TABLE agreement_emails IS 'Email delivery tracking for signed agreements';
