-- Rollback for migration 070
BEGIN;
DROP FUNCTION IF EXISTS refresh_all_property_impact_rollups();
DROP FUNCTION IF EXISTS refresh_property_impact_rollup(UUID);
DROP TABLE IF EXISTS property_impact_rollup CASCADE;
COMMIT;
