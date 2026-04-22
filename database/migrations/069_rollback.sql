-- Rollback for migration 069

BEGIN;
DROP VIEW IF EXISTS verified_hail_events_stats_by_state_year;
DROP VIEW IF EXISTS verified_hail_events_stats_by_tier;
DROP VIEW IF EXISTS verified_hail_events_stats_by_source;
DROP VIEW IF EXISTS verified_hail_events_public;
DROP TRIGGER IF EXISTS trg_verified_hail_events_updated ON verified_hail_events;
DROP FUNCTION IF EXISTS update_verified_hail_events_timestamp();
DROP TABLE IF EXISTS verified_hail_events CASCADE;
COMMIT;
