-- Rollback for Migration 079: drop ihm_city_mirror
BEGIN;
DROP INDEX IF EXISTS idx_ihm_city_mirror_dates_gin;
DROP INDEX IF EXISTS idx_ihm_city_mirror_city_state;
DROP INDEX IF EXISTS idx_ihm_city_mirror_fetched;
DROP INDEX IF EXISTS idx_ihm_city_mirror_state;
DROP TABLE IF EXISTS ihm_city_mirror;
COMMIT;
