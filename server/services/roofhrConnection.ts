/**
 * Where Susan keeps a rep's Roof HR token.
 *
 * Roof HR is the permissions key (see its server/mcp/connect.ts). A rep's Roof
 * HR question is answered on a token minted for THAT REP, so the answer passes
 * through Roof HR's own routes and role checks. That means sa21 holds one token
 * per person, and it must hold them carefully.
 *
 * Sessions are hashed because sa21 only ever needs to recognise one. These
 * tokens are different: Susan has to SEND them, so they must come back out.
 * They are therefore encrypted (AES-256-GCM) rather than hashed, with the key
 * in the environment and never in the database — so a dump of `agent_connections`
 * is ciphertext and nothing else. The ciphertext is additionally bound to the
 * row's owner through the AEAD's associated data, so a row copied onto another
 * user's id fails to decrypt instead of quietly working.
 *
 * If the key is missing, this module REFUSES to store rather than storing in
 * the clear. A connect attempt failing loudly is recoverable; a plaintext
 * Roof HR token sitting in a table is not.
 */

import crypto from 'crypto';
import type pg from 'pg';

/** The only app slug this module knows about today. CC24 and Lite Training reuse the table. */
export const ROOFHR_APP = 'roofhr';

export type StoredConnection = {
  /** sa21's own user id. */
  userId: string;
  /** Roof HR's id for the person who approved — never guessed from an email. */
  remoteUserId: string;
  token: string;
  scopes: string[];
  endpoint: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type ConnectionSummary = Omit<StoredConnection, 'token'> & { connected: true };

const ENC_KEY_ENV = 'SA21_TOKEN_ENC_KEY';

/**
 * 32 bytes, as 64 hex characters or 44 base64 characters.
 *
 * Deliberately not derived from a passphrase: deriving would let a short,
 * guessable secret masquerade as a key. Generate one with
 *   openssl rand -hex 32
 */
export function encryptionKey(): Buffer | null {
  const raw = (process.env[ENC_KEY_ENV] || '').trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
  } catch { /* fall through */ }
  console.error(
    `[roofhr-connection] ${ENC_KEY_ENV} is set but is not a 32-byte key ` +
    '(expected 64 hex chars or 44 base64 chars). Generate one with: openssl rand -hex 32',
  );
  return null;
}

export function encryptionConfigured(): boolean {
  return encryptionKey() !== null;
}

/** Binds a ciphertext to the row it belongs to. A row moved to another user will not open. */
function aad(app: string, userId: string): Buffer {
  return Buffer.from(`${app}:${userId}`, 'utf8');
}

function encrypt(plaintext: string, key: Buffer, app: string, userId: string): { ciphertext: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(app, userId));
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

function decrypt(
  parts: { ciphertext: string; iv: string; tag: string },
  key: Buffer,
  app: string,
  userId: string,
): string | null {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts.iv, 'base64'));
    decipher.setAAD(aad(app, userId));
    decipher.setAuthTag(Buffer.from(parts.tag, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(parts.ciphertext, 'base64')), decipher.final()]);
    return out.toString('utf8');
  } catch (err) {
    // A failed tag check means the row was tampered with, moved between users,
    // or the key was rotated. All three are "no usable token", never a fallback.
    console.error('[roofhr-connection] could not decrypt a stored token:', (err as Error).message);
    return null;
  }
}

/** Idempotent; called from runStartupMigrations on every boot. */
export async function ensureAgentConnectionsTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      app TEXT NOT NULL,
      remote_user_id TEXT NOT NULL,
      token_ciphertext TEXT NOT NULL,
      token_iv TEXT NOT NULL,
      token_tag TEXT NOT NULL,
      scopes TEXT[] NOT NULL DEFAULT '{}',
      endpoint TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      CONSTRAINT agent_connections_user_app UNIQUE (user_id, app)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_connections_user ON agent_connections(user_id);
  `);
}

/**
 * Store (or replace) a rep's connection.
 *
 * Refuses without a key rather than writing a readable token. Re-connecting
 * replaces the previous row, so a rep who approves again simply supersedes the
 * old grant.
 */
export async function saveConnection(
  pool: pg.Pool,
  input: {
    userId: string;
    app?: string;
    remoteUserId: string;
    token: string;
    scopes: string[];
    endpoint: string;
    expiresAt: Date;
  },
): Promise<{ ok: boolean; error?: string }> {
  const app = input.app ?? ROOFHR_APP;
  const key = encryptionKey();
  if (!key) {
    return {
      ok: false,
      error: `${ENC_KEY_ENV} is not configured, so a Roof HR token cannot be stored safely. Set it and try again.`,
    };
  }
  if (!input.token || !input.remoteUserId) {
    return { ok: false, error: 'Roof HR returned an incomplete connection.' };
  }

  const { ciphertext, iv, tag } = encrypt(input.token, key, app, input.userId);
  try {
    await pool.query(
      `INSERT INTO agent_connections
         (user_id, app, remote_user_id, token_ciphertext, token_iv, token_tag, scopes, endpoint, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, app) DO UPDATE SET
         remote_user_id   = EXCLUDED.remote_user_id,
         token_ciphertext = EXCLUDED.token_ciphertext,
         token_iv         = EXCLUDED.token_iv,
         token_tag        = EXCLUDED.token_tag,
         scopes           = EXCLUDED.scopes,
         endpoint         = EXCLUDED.endpoint,
         expires_at       = EXCLUDED.expires_at,
         created_at       = NOW(),
         last_used_at     = NULL`,
      [input.userId, app, input.remoteUserId, ciphertext, iv, tag, input.scopes, input.endpoint, input.expiresAt],
    );
    return { ok: true };
  } catch (err) {
    console.error('[roofhr-connection] save failed:', (err as Error).message);
    return { ok: false, error: 'Could not save that connection.' };
  }
}

/**
 * The rep's live token, or null.
 *
 * Null means exactly one thing: Susan has nothing to read Roof HR with. There
 * is no shared-token fallback anywhere in this file, and there must never be
 * one — the service token on Roof HR prod is a System Administrator, so a
 * fallback would hand every rep an admin's view of the company.
 */
export async function getConnection(
  pool: pg.Pool,
  userId: string,
  app: string = ROOFHR_APP,
): Promise<StoredConnection | null> {
  const key = encryptionKey();
  if (!key) return null;
  try {
    const r = await pool.query(
      `SELECT remote_user_id, token_ciphertext, token_iv, token_tag, scopes, endpoint,
              expires_at, created_at, last_used_at
         FROM agent_connections
        WHERE user_id = $1 AND app = $2 AND expires_at > NOW()
        LIMIT 1`,
      [userId, app],
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    const token = decrypt(
      { ciphertext: row.token_ciphertext, iv: row.token_iv, tag: row.token_tag },
      key,
      app,
      userId,
    );
    if (!token) return null;
    return {
      userId,
      remoteUserId: String(row.remote_user_id),
      token,
      scopes: (row.scopes as string[]) ?? [],
      endpoint: String(row.endpoint),
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
    };
  } catch (err) {
    console.error('[roofhr-connection] lookup failed:', (err as Error).message);
    return null;
  }
}

/** What the rep is told about their own connection. Never includes the token. */
export async function connectionSummary(
  pool: pg.Pool,
  userId: string,
  app: string = ROOFHR_APP,
): Promise<ConnectionSummary | null> {
  const conn = await getConnection(pool, userId, app);
  if (!conn) return null;
  const { token, ...rest } = conn;
  void token;
  return { ...rest, connected: true };
}

export async function deleteConnection(
  pool: pg.Pool,
  userId: string,
  app: string = ROOFHR_APP,
): Promise<boolean> {
  try {
    const r = await pool.query('DELETE FROM agent_connections WHERE user_id = $1 AND app = $2', [userId, app]);
    return (r.rowCount ?? 0) > 0;
  } catch (err) {
    console.error('[roofhr-connection] delete failed:', (err as Error).message);
    return false;
  }
}

/** Best effort, off the request path. */
export function touchConnection(pool: pg.Pool, userId: string, app: string = ROOFHR_APP): void {
  pool
    .query('UPDATE agent_connections SET last_used_at = NOW() WHERE user_id = $1 AND app = $2', [userId, app])
    .catch(() => { /* best effort */ });
}
