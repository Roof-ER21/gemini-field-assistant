-- Migration 082: profile_leads JotForm webhook columns
--
-- Adds the columns the /api/profiles/jotform-webhook handler needs to
-- ingest JotForm submissions into the same profile_leads table that the
-- in-app /api/profiles/contact endpoint already writes to. Both paths
-- now produce uniform leads (same Calendar + Gmail fan-out via
-- processLeadIntegrations() in server/routes/profileRoutes.ts).
--
-- jotform_submission_id is the source-of-truth dedup key — JotForm retries
-- failed webhook deliveries and we don't want duplicate leads or double
-- calendar events. Unique constraint is partial (only on non-NULL values)
-- so existing rows that came through /contact (with NULL submission ids)
-- aren't affected.
--
-- raw_payload preserves the full JotForm webhook body for debugging and
-- field-mapping iteration. Strip the duplicate `rawRequest` JSON string
-- before storage to avoid bloating the column.

ALTER TABLE profile_leads
  ADD COLUMN IF NOT EXISTS jotform_submission_id TEXT,
  ADD COLUMN IF NOT EXISTS jotform_form_id TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS profile_leads_jotform_submission_unique
  ON profile_leads (jotform_submission_id)
  WHERE jotform_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS profile_leads_jotform_form_idx
  ON profile_leads (jotform_form_id)
  WHERE jotform_form_id IS NOT NULL;

COMMENT ON COLUMN profile_leads.jotform_submission_id IS
  'JotForm submissionID — dedup key for webhook retries. NULL for in-app /contact submissions.';
COMMENT ON COLUMN profile_leads.jotform_form_id IS
  'JotForm formID — supports multiple JotForms per app (e.g., signup vs claim packet).';
COMMENT ON COLUMN profile_leads.raw_payload IS
  'Full JotForm webhook body (rawRequest unstringified). For debugging field mapping when a new form variant ships.';
