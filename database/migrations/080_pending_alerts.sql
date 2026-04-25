-- Migration 080: pending storm-alert approvals
--
-- New env mode LIVE_MRMS_ALERT_ENABLED=approval-gate (and same for NWS):
-- alerts post to TEST group as proposals, await human ✅/❌ in test group,
-- then forward (or skip) to Sales Team. This table persists pending
-- proposals so a service restart doesn't lose state.

CREATE TABLE IF NOT EXISTS pending_alerts (
  id              BIGSERIAL PRIMARY KEY,
  alert_id        TEXT       NOT NULL UNIQUE,           -- short token "A-XXXXXX"
  source          TEXT       NOT NULL,                  -- 'mrms' | 'nws'
  target_group_id TEXT       NOT NULL,                  -- where to post if approved
  target_bot_id   TEXT       NOT NULL,                  -- which bot to use
  message_text    TEXT       NOT NULL,                  -- the alert body to forward
  proposal_message_id TEXT,                             -- GroupMe msg id of the proposal we posted
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  status          TEXT       NOT NULL DEFAULT 'pending', -- pending | approved | rejected | expired
  decided_by      TEXT,                                 -- nickname of approver
  decided_at      TIMESTAMPTZ,
  posted_message_id TEXT,                               -- GroupMe msg id of forwarded post
  metadata        JSONB                                 -- {peakInches, cellCount, refTime, ...}
);

CREATE INDEX IF NOT EXISTS idx_pending_alerts_status_created
  ON pending_alerts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_alerts_expires_pending
  ON pending_alerts(expires_at) WHERE status = 'pending';

COMMENT ON TABLE pending_alerts IS
  'Storm alerts proposed in test group, awaiting human approval before forward to Sales Team';
COMMENT ON COLUMN pending_alerts.alert_id IS
  'Short user-facing token (A-XXXXXX). Approver replies "yes A-XXXXXX" or just "yes" for most-recent.';
