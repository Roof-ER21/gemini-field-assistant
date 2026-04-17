-- Claim Packet Shares
--
-- When a rep generates a claim-packet PDF for an adjuster, we also record a
-- shareable token so the rep can copy a public URL into an email or text —
-- adjuster clicks, downloads PDF, no login needed. Links expire.
--
-- Scope is intentionally narrow: we store the source params (propertyId +
-- stormDate + anchorTimestamp) rather than the PDF bytes. The PDF re-renders
-- on demand from the stored params, which means any upstream data upgrade
-- (HailTrace imports, new MRMS coverage) automatically flows into old links
-- and keeps storage costs flat.

CREATE TABLE IF NOT EXISTS claim_packet_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- URL-safe token that adjusters load, 16 bytes = ~22 base64 chars
    token VARCHAR(64) NOT NULL UNIQUE,

    -- Which rep created the share (audit + revoke)
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- PDF source params (re-rendered on each fetch)
    customer_property_id UUID NOT NULL REFERENCES customer_properties(id) ON DELETE CASCADE,
    storm_date DATE NOT NULL,
    anchor_timestamp VARCHAR(64),

    -- Access tracking
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS claim_packet_shares_token_idx
    ON claim_packet_shares (token)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS claim_packet_shares_user_idx
    ON claim_packet_shares (created_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS claim_packet_shares_expires_idx
    ON claim_packet_shares (expires_at);

COMMENT ON TABLE claim_packet_shares IS
    'Token-based public links for claim-packet PDFs. PDF re-renders on each fetch from stored params so upstream data upgrades automatically reach existing links.';
