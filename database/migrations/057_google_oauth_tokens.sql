-- 057_google_oauth_tokens.sql
-- Per-user Google OAuth token storage for Calendar + Gmail integration
-- Tokens are AES-256-GCM encrypted at rest

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- AES-256-GCM encrypted tokens (separate IV + auth tag for each)
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    access_token_iv VARCHAR(32) NOT NULL,
    refresh_token_iv VARCHAR(32) NOT NULL,
    access_token_tag VARCHAR(32) NOT NULL,
    refresh_token_tag VARCHAR(32) NOT NULL,
    -- Token metadata
    token_type VARCHAR(20) DEFAULT 'Bearer',
    scope TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    -- Google account info (plaintext for UI display)
    google_email VARCHAR(255),
    -- Lifecycle
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_user ON google_oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_google_oauth_active ON google_oauth_tokens(user_id) WHERE revoked_at IS NULL;
