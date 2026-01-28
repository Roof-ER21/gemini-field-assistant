-- Migration 009: Jobs Table for persistent job management
-- This replaces localStorage-based job storage with proper database persistence

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_number VARCHAR(20) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Basic info
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'new_lead',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    lead_source VARCHAR(50),

    -- Customer info (JSONB for flexibility)
    customer JSONB NOT NULL DEFAULT '{"name": ""}',

    -- Property info (JSONB)
    property JSONB NOT NULL DEFAULT '{"address": "", "city": "", "state": "VA"}',

    -- Optional detailed info
    roof_details JSONB,
    damage JSONB,
    insurance JSONB,
    financials JSONB,

    -- Collections (JSONB arrays)
    notes JSONB NOT NULL DEFAULT '[]',
    attachments JSONB NOT NULL DEFAULT '[]',
    actions JSONB NOT NULL DEFAULT '[]',
    tags JSONB NOT NULL DEFAULT '[]',

    -- Dates
    inspection_date TIMESTAMPTZ,
    contract_signed_date DATE,
    scheduled_install_date DATE,
    completed_date DATE,

    -- Integration references
    linked_chat_session_id VARCHAR(255),
    linked_transcript_ids JSONB DEFAULT '[]',
    linked_email_ids JSONB DEFAULT '[]',
    linked_image_analysis_ids JSONB DEFAULT '[]',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Job number sequence per year
CREATE TABLE IF NOT EXISTS job_number_sequence (
    year INTEGER PRIMARY KEY,
    last_number INTEGER NOT NULL DEFAULT 0
);

-- Initialize current year
INSERT INTO job_number_sequence (year, last_number)
VALUES (EXTRACT(YEAR FROM NOW())::INTEGER, 0)
ON CONFLICT (year) DO NOTHING;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_job_number ON jobs(job_number);

-- GIN indexes for JSONB searches (requires pg_trgm extension)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- May require superuser
-- CREATE INDEX IF NOT EXISTS idx_jobs_customer_name ON jobs USING GIN ((customer->'name') gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_jobs_property_address ON jobs USING GIN ((property->'address') gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_jobs_insurance_company ON jobs USING GIN ((insurance->'company') gin_trgm_ops);

-- Function to generate next job number
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    current_year INTEGER;
    next_number INTEGER;
BEGIN
    current_year := EXTRACT(YEAR FROM NOW())::INTEGER;

    -- Get and increment the sequence
    INSERT INTO job_number_sequence (year, last_number)
    VALUES (current_year, 1)
    ON CONFLICT (year) DO UPDATE
    SET last_number = job_number_sequence.last_number + 1
    RETURNING last_number INTO next_number;

    RETURN current_year || '-' || LPAD(next_number::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate job number on insert
CREATE OR REPLACE FUNCTION set_job_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
        NEW.job_number := generate_job_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_job_number ON jobs;
CREATE TRIGGER trigger_set_job_number
    BEFORE INSERT ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION set_job_number();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_job_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_job_timestamp ON jobs;
CREATE TRIGGER trigger_update_job_timestamp
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_job_timestamp();

-- Note: pg_trgm extension would enhance text search but may require superuser
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMENT ON TABLE jobs IS 'Stores all roofing jobs/projects with full tracking history';
COMMENT ON COLUMN jobs.customer IS 'Customer info: {name, phone, phoneSecondary, email, preferredContact}';
COMMENT ON COLUMN jobs.property IS 'Property info: {address, city, state, zip, propertyType, stories, accessNotes}';
COMMENT ON COLUMN jobs.insurance IS 'Insurance claim: {company, claimNumber, adjusterName, deductible, etc.}';
COMMENT ON COLUMN jobs.notes IS 'Array of {id, text, createdAt, author, type}';
COMMENT ON COLUMN jobs.actions IS 'Array of {id, description, dueDate, completed, completedAt}';
