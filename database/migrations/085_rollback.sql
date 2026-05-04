-- Rollback for 085_susan_persons.sql
DROP TABLE IF EXISTS susan_disambiguation_events;
ALTER TABLE knowledge_documents DROP COLUMN IF EXISTS person_id;
DROP TRIGGER IF EXISTS trg_susan_persons_updated_at ON susan_persons;
DROP FUNCTION IF EXISTS susan_persons_touch_updated_at();
DROP TABLE IF EXISTS susan_persons;
