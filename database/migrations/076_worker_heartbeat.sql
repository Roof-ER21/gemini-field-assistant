-- 076_worker_heartbeat.sql
-- Phase 2 worker split: heartbeat table so the web container can report
-- whether the sa21-worker process is alive. Updated every 60 s by the worker.
-- Status thresholds (read by /api/admin/worker-status):
--   healthy : age < 2 min
--   stale   : age 2-10 min (worker may be starting up or fell behind)
--   dead    : age > 10 min (worker is down)

CREATE TABLE IF NOT EXISTS worker_heartbeat (
  service       TEXT        PRIMARY KEY,
  last_beat_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the row so the admin endpoint always returns a row (shows "dead" until
-- the worker first checks in rather than returning an empty result set).
INSERT INTO worker_heartbeat (service, last_beat_at)
VALUES ('sa21-worker', '1970-01-01 00:00:00+00')
ON CONFLICT (service) DO NOTHING;
