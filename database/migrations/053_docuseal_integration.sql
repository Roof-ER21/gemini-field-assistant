-- Migration 053: DocuSeal E-Signature Integration
-- Adds DocuSeal tracking columns to existing agreements table
-- Supports both canvas-based (existing) and DocuSeal signing methods

-- Add DocuSeal tracking columns
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS docuseal_submission_id INTEGER;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS docuseal_slug VARCHAR(255);
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS signed_pdf_url TEXT;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS signing_method VARCHAR(50) DEFAULT 'canvas';

-- Expand agreement_type to include new document types
ALTER TABLE agreements DROP CONSTRAINT IF EXISTS agreements_agreement_type_check;
ALTER TABLE agreements ADD CONSTRAINT agreements_agreement_type_check
  CHECK (agreement_type IN ('claim_authorization', 'contingency', 'coc', 'inspection_agreement', 'insurance_authorization'));

-- Expand status to include docuseal-specific states
ALTER TABLE agreements DROP CONSTRAINT IF EXISTS agreements_status_check;
ALTER TABLE agreements ADD CONSTRAINT agreements_status_check
  CHECK (status IN ('pending', 'awaiting_signature', 'signed', 'voided', 'expired', 'declined'));

-- Index for DocuSeal lookups
CREATE INDEX IF NOT EXISTS idx_agreements_docuseal ON agreements(docuseal_submission_id) WHERE docuseal_submission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agreements_signing_method ON agreements(signing_method);

-- Comments
COMMENT ON COLUMN agreements.docuseal_submission_id IS 'DocuSeal submission ID for tracking';
COMMENT ON COLUMN agreements.docuseal_slug IS 'DocuSeal signing URL slug';
COMMENT ON COLUMN agreements.signed_pdf_url IS 'URL or path to the signed PDF document';
COMMENT ON COLUMN agreements.signing_method IS 'How the agreement was signed: canvas (in-app) or docuseal';
