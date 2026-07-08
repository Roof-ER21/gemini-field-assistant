-- 054_users_admin_columns.sql
-- Reconcile prod `users` table with the admin CRUD endpoints.
-- The admin create/update/resend/status endpoints reference is_verified,
-- verification_code, verification_expires_at, and is_active — columns that
-- never existed on the (legacy) prod schema, so every admin "Add User" /
-- edit / status-toggle threw a 500. Add them idempotently.
--
-- Safe: no auth/login path gates on these columns (verified 2026-07-08),
-- so backfilling existing users to verified/active cannot lock anyone out.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMP;

-- Existing rows: treat everyone already in the table as verified + active.
UPDATE users SET is_verified = true WHERE is_verified IS NULL;
UPDATE users SET is_active   = true WHERE is_active   IS NULL;
