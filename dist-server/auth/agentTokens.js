/**
 * Personal agent tokens — "Connected agents" in Settings.
 *
 * Genie 21's Roof-ER pack (and any other MCP client) used to reach /mcp with
 * the rep's own sa21 SESSION token: fished out of localStorage, able to do
 * anything the rep can do in the app, and gone in a day without "remember
 * me". An agent token is the narrow credential for that job:
 *
 *   • minted by the rep, for themselves, in Settings → Connected agents;
 *   • shown once — only its sha256 is stored, plus a 4-character hint;
 *   • named, dated (created / last used / expires), revocable;
 *   • scoped `mcp:read`: it is honoured ONLY on /mcp and ONLY for the read
 *     tools in AGENT_READ_TOOLS. It is never a session — /api ignores it
 *     (session.ts only resolves app_sessions) — and a tool outside the
 *     allowlist, or one not marked read-only, is refused.
 *
 * The prefix `s21a_` (vs `s21_` for sessions) lets a client tell the two
 * apart before sending anything: `s21a_` + 43 base64url characters.
 *
 * Mirrors Roof HR's mcp_tokens (migrations/0010_mcp_tokens.sql) and CC24's
 * cc24_ tokens. Every agent tools/call leaves one agent_token_audit row:
 * argument KEYS only, never values.
 */
import crypto from 'crypto';
export const AGENT_TOKEN_PREFIX = 's21a_';
/** The whole token: prefix + 32 random bytes in base64url (43 characters, no padding). */
export const AGENT_TOKEN_PATTERN = /^s21a_[A-Za-z0-9_-]{43}$/;
export const AGENT_READ_SCOPE = 'mcp:read';
/**
 * The only tools an agent token may call. Deliberately a list here and not
 * "whatever /mcp offers": a tool added to the MCP catalog later — a write in
 * particular — is refused to agent tokens until someone adds it here AND it is
 * annotated read-only.
 */
export const AGENT_READ_TOOLS = [
    'ask',
    'carrier_directory',
    'carrier_learnings',
    'adjuster_learnings',
    'rep_directory',
];
export const AGENT_TOKEN_NAME_MAX = 80;
export const AGENT_TOKEN_DEFAULT_DAYS = 90;
export const AGENT_TOKEN_MAX_DAYS = 365;
export function hashAgentToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
export function isAgentTokenShape(token) {
    return AGENT_TOKEN_PATTERN.test(token);
}
/**
 * The read-only scope guard. True only when the token carries mcp:read, the
 * tool is on the allowlist, and the tool itself says it is read-only.
 */
export function agentMayCallTool(principal, tool) {
    if (!tool)
        return false;
    if (!principal.scopes.includes(AGENT_READ_SCOPE))
        return false;
    if (!AGENT_READ_TOOLS.includes(tool.name))
        return false;
    return tool.annotations?.readOnlyHint === true;
}
/** Idempotent; called from runStartupMigrations on every boot, like ensureSessionTable. */
export async function ensureAgentTokenTables(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      token_hint TEXT NOT NULL,
      scopes TEXT[] NOT NULL DEFAULT ARRAY['mcp:read'],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_agent_tokens_user ON agent_tokens(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS agent_token_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_id UUID NOT NULL,
      user_id UUID NOT NULL,
      tool TEXT NOT NULL,
      argument_keys TEXT[] NOT NULL DEFAULT '{}',
      outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'error', 'refused')),
      error TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_agent_token_audit_token ON agent_token_audit(token_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_token_audit_user ON agent_token_audit(user_id, created_at DESC);
  `);
    // No FK from the audit to agent_tokens on purpose: the trail outlives a token.
}
function present(row) {
    const expiresAt = new Date(row.expires_at);
    return {
        id: String(row.id),
        name: String(row.name),
        hint: String(row.token_hint),
        scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [AGENT_READ_SCOPE],
        createdAt: new Date(row.created_at).toISOString(),
        lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
        expiresAt: expiresAt.toISOString(),
        revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
        expired: expiresAt.getTime() <= Date.now(),
    };
}
export function parseAgentTokenRequest(body) {
    const input = (body ?? {});
    const name = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > AGENT_TOKEN_NAME_MAX) {
        return { ok: false, error: `Give the token a name (1-${AGENT_TOKEN_NAME_MAX} characters), such as the agent that will use it.` };
    }
    let days = AGENT_TOKEN_DEFAULT_DAYS;
    if (input.expiresInDays !== undefined && input.expiresInDays !== null && input.expiresInDays !== '') {
        days = Number(input.expiresInDays);
        if (!Number.isInteger(days) || days < 1 || days > AGENT_TOKEN_MAX_DAYS) {
            return { ok: false, error: `expiresInDays must be a whole number from 1 to ${AGENT_TOKEN_MAX_DAYS}.` };
        }
    }
    return { ok: true, name, days };
}
/**
 * Mint a token for `userId`. The plaintext is returned exactly once, here;
 * only its hash and last four characters are written.
 */
export async function mintAgentToken(pool, input) {
    const token = `${AGENT_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + input.days * 86_400_000);
    const result = await pool.query(`INSERT INTO agent_tokens (user_id, name, token_hash, token_hint, scopes, expires_at)
     VALUES ($1, $2, $3, $4, ARRAY[$5]::text[], $6)
     RETURNING id, name, token_hint, scopes, created_at, last_used_at, expires_at, revoked_at`, [input.userId, input.name, hashAgentToken(token), token.slice(-4), AGENT_READ_SCOPE, expiresAt]);
    return { token, row: present(result.rows[0]) };
}
/** The caller's own live tokens (not revoked). Expired ones stay listed, marked, until revoked. */
export async function listAgentTokens(pool, userId) {
    const result = await pool.query(`SELECT id, name, token_hint, scopes, created_at, last_used_at, expires_at, revoked_at
       FROM agent_tokens
      WHERE user_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC`, [userId]);
    return result.rows.map(present);
}
/**
 * Revoke one of the caller's own tokens. Ownership is part of the WHERE
 * clause, so another person's token id is simply "not found" — the answer
 * never says whether the id exists.
 */
export async function revokeAgentToken(pool, input) {
    if (!/^[0-9a-f-]{36}$/i.test(input.id))
        return 'not_found';
    const updated = await pool.query(`UPDATE agent_tokens SET revoked_at = NOW()
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
      RETURNING id`, [input.id, input.userId]);
    if ((updated.rowCount ?? 0) > 0)
        return 'revoked';
    const existing = await pool.query(`SELECT revoked_at FROM agent_tokens WHERE id = $1 AND user_id = $2`, [input.id, input.userId]);
    return existing.rows.length > 0 ? 'already_revoked' : 'not_found';
}
/**
 * Resolve a bearer to its owner, or null. Not cached: a revoke must take
 * effect on the very next call, on every instance.
 */
export async function resolveAgentToken(pool, token) {
    if (!isAgentTokenShape(token))
        return null;
    try {
        const result = await pool.query(`SELECT t.id, t.user_id, t.scopes, u.email
         FROM agent_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1
          AND t.revoked_at IS NULL
          AND t.expires_at > NOW()
        LIMIT 1`, [hashAgentToken(token)]);
        const row = result.rows[0];
        if (!row)
            return null;
        return {
            tokenId: String(row.id),
            userId: String(row.user_id),
            email: String(row.email).toLowerCase(),
            scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
        };
    }
    catch (err) {
        console.error('[agent-tokens] lookup failed:', err.message);
        return null;
    }
}
const lastTouched = new Map();
/** `last_used_at`, at most once a minute per token, off the request path. */
export function touchAgentToken(pool, tokenId) {
    const now = Date.now();
    if ((lastTouched.get(tokenId) ?? 0) > now - 60_000)
        return;
    lastTouched.set(tokenId, now);
    pool
        .query('UPDATE agent_tokens SET last_used_at = NOW() WHERE id = $1', [tokenId])
        .catch(() => { });
}
/** One audit row per agent tools/call. Best effort: a failed write never fails the call. */
export async function recordAgentToolUse(pool, use) {
    try {
        await pool.query(`INSERT INTO agent_token_audit (token_id, user_id, tool, argument_keys, outcome, error, duration_ms)
       VALUES ($1, $2, $3, $4::text[], $5, $6, $7)`, [
            use.tokenId,
            use.userId,
            use.tool.slice(0, 80),
            use.argumentKeys.map((k) => k.slice(0, 40)).slice(0, 20),
            use.outcome,
            use.error ? use.error.slice(0, 200) : null,
            Math.max(0, Math.round(use.durationMs)),
        ]);
    }
    catch (err) {
        console.warn('[agent-tokens] audit write failed:', err.message);
    }
}
export function agentBearerFrom(req) {
    const raw = req.header('authorization');
    if (!raw)
        return null;
    const token = /^Bearer\s+(.+)$/i.exec(raw.trim())?.[1]?.trim();
    return token && token.startsWith(AGENT_TOKEN_PREFIX) ? token : null;
}
/** Test seam. */
export function clearAgentTokenTouches() {
    lastTouched.clear();
}
