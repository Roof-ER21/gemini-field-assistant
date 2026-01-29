-- ==========================================================================
-- Migration 017: Global Learning + Feedback Follow-ups
-- Adds context to chat feedback, global learning candidates, and follow-up reminders
-- ==========================================================================

ALTER TABLE chat_feedback
  ADD COLUMN IF NOT EXISTS context_state VARCHAR(10),
  ADD COLUMN IF NOT EXISTS context_insurer TEXT,
  ADD COLUMN IF NOT EXISTS context_adjuster TEXT,
  ADD COLUMN IF NOT EXISTS outcome_status TEXT,
  ADD COLUMN IF NOT EXISTS outcome_notes TEXT,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS global_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_key TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  scope_state TEXT,
  scope_insurer TEXT,
  scope_adjuster TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'approved', 'rejected')),
  helpful_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  last_feedback_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_learnings_unique
  ON global_learnings(normalized_key, scope_key);
CREATE INDEX IF NOT EXISTS idx_global_learnings_status
  ON global_learnings(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_learnings_scope
  ON global_learnings(scope_state, scope_insurer, scope_adjuster);

CREATE TABLE IF NOT EXISTS global_learning_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_learning_id UUID REFERENCES global_learnings(id) ON DELETE CASCADE,
  feedback_id UUID REFERENCES chat_feedback(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (global_learning_id, feedback_id)
);

CREATE TABLE IF NOT EXISTS feedback_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID REFERENCES chat_feedback(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reminder_number SMALLINT NOT NULL,
  due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed', 'dismissed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_feedback_followups_user
  ON feedback_followups(user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_feedback_followups_status
  ON feedback_followups(status, due_at);

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 017: Global learning + follow-ups created successfully!';
END $$;
