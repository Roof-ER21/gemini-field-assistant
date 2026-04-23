-- 078_pdf_jobs.sql
--
-- Phase 4 of the production stability plan: asynchronous PDF generation.
--
-- The /api/hail/generate-report endpoint used to render the PDF inline
-- with the HTTP request. For big multi-event reports that took 30-60s,
-- and when the server was also processing rep chat/SSE, a single report
-- generation could push the web container into GC pressure and cause
-- the 502 gateway timeouts Ahmed has been seeing.
--
-- This table is a tiny queue. Flow:
--   POST /api/hail/generate-report        -> INSERT row, return { jobId }
--   sa21-worker polls every few seconds   -> picks up 'pending' row, renders PDF,
--                                            writes the bytes to storage, updates
--                                            status=done + result_url
--   GET /api/hail/report/:id              -> returns { status, result_url, error }
--
-- Rows are kept for 7 days so reps can re-download; a daily cron nukes
-- anything older.

CREATE TABLE IF NOT EXISTS pdf_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('pending','running','done','error'))
    DEFAULT 'pending',
  -- Full /generate-report body. Worker re-uses it verbatim.
  payload JSONB NOT NULL,
  -- Populated when status='done'. PDF bytes live directly in Postgres so
  -- the web container and the worker service (which may not share a
  -- filesystem on Railway) both have access. Trade-off: ~1MB per row.
  -- Cleanup cron prunes 'done' rows older than 7 days.
  result_bytes BYTEA,
  result_mime TEXT DEFAULT 'application/pdf',
  -- If we later move to object storage (S3, R2, Railway volume), this
  -- column holds the external URL and result_bytes is NULL.
  result_url TEXT,
  -- Populated when status='error'.
  error TEXT,
  -- Who requested it (for dashboard filtering + later audit).
  requested_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Worker scans for 'pending' rows FIFO. This index keeps that cheap.
CREATE INDEX IF NOT EXISTS pdf_jobs_pending_idx
  ON pdf_jobs (created_at ASC)
  WHERE status = 'pending';

-- Occasional cleanup sweep: delete 'done' and 'error' rows older than 7 days.
CREATE INDEX IF NOT EXISTS pdf_jobs_completed_age_idx
  ON pdf_jobs (completed_at)
  WHERE status IN ('done', 'error');
