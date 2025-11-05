-- Fix session_id column type in chat_history table
-- Change from UUID to TEXT to support string session IDs like "session-123456"

ALTER TABLE chat_history
ALTER COLUMN session_id TYPE TEXT USING session_id::TEXT;

-- Verify the change
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'chat_history' AND column_name = 'session_id';
