-- ==========================================================================
-- Migration 018: Add disabled status to global_learnings
-- ==========================================================================

ALTER TABLE global_learnings
  DROP CONSTRAINT IF EXISTS global_learnings_status_check;

ALTER TABLE global_learnings
  ADD CONSTRAINT global_learnings_status_check
  CHECK (status IN ('pending', 'ready', 'approved', 'rejected', 'disabled'));

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 018: Global learning status updated successfully!';
END $$;
