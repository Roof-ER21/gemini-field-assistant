/**
 * Real sessions for sa21.
 *
 * Until now the API decided who you were from the `x-user-email` request
 * header: `getRequestEmail` (server/index.ts) read it and `authMiddleware`
 * looked the address up in `users`. Google sign-in only guarded the login
 * page, so knowing any rep's work address was the same as being them —
 * confirmed against prod on 2026-09-09.
 *
 * This module is where identity is now established. A verified sign-in mints
 * a session row; the client sends `Authorization: Bearer <token>` on every
 * call; `sessionMiddleware` resolves it and rewrites `x-user-email` to the
 * session's own address. That last part is deliberate: ~348 call sites read
 * `req.userId` / `req.userEmail` / the header, and rewriting the header at the
 * front door makes every one of them session-backed without being touched.
 *
 * Rollout is in two stages, and the second is an env var rather than a deploy:
 *
 *   Stage 1 (this, live now, additive): sessions are minted and honoured, but a
 *   request without one still falls through to the old header. Nobody is logged
 *   out. `sessionAdoption()` reports how much traffic already carries a session.
 *
 *   Stage 2 (SA21_REQUIRE_SESSION=true): a request without a valid session is
 *   401 and the header is ignored entirely. Flip it when adoption is ~total;
 *   flip it back in seconds if the field team hits trouble.
 */

import crypto from 'crypto';
import type express from 'express';
import type pg from 'pg';

export const SESSION_HEADER = 'authorization';
export const LEGACY_EMAIL_HEADER = 'x-user-email';

/** A rep stays signed in for a year unless they said otherwise; a browser-only session is a day. */
const REMEMBERED_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const SHORT_TTL_MS = 24 * 60 * 60 * 1000;
/** Resolved sessions are cached briefly so a session does not cost a query per request. */
const CACHE_TTL_MS = 60_000;

export type AppSession = {
  token: string;
  userId: string;
  email: string;
  expiresAt: Date;
};

export type SessionRequest = express.Request & {
  session?: AppSession;
  /** How this request was identified. Read by the adoption counters and by Susan's write tools. */
  authMechanism?: 'session' | 'legacy-header' | 'none';
};

const cache = new Map<string, { session: AppSession | null; at: number }>();

/** Requests that must work before anyone holds a session. Prefix match, checked in Stage 2 only. */
const PUBLIC_PREFIXES = [
  '/api/auth/',
  '/api/health',
  '/api/present/',
  '/api/susan/groupme',
  '/api/webhooks/',
  // Roof HR sends the BROWSER here after someone approves a connection. A
  // top-level navigation carries no Authorization header, so in Stage 2 this one
  // path must stay open or the redirect would 401 and no rep could ever connect.
  // It is safe to open because it does nothing: it only hands the code to a
  // client route, and the code is redeemed by /api/connect/roofhr/complete,
  // which DOES require a session. Only the callback — not /api/connect/.
  '/api/connect/roofhr/callback',
];

export function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

function hash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Adoption counters — how identity is arriving, so Stage 2 is a measurement and not a guess. */
const counters = { session: 0, legacyHeader: 0, none: 0, staleToken: 0 };

export function sessionAdoption() {
  const identified = counters.session + counters.legacyHeader;
  return {
    ...counters,
    identifiedRequests: identified,
    sessionShare: identified === 0 ? null : Number((counters.session / identified).toFixed(4)),
    requireSession: requireSessionEnabled(),
  };
}

/**
 * Stage 1 ships the mechanism, but a rep who signed in months ago stays signed
 * in for a year and never picks up a session — so adoption would sit near zero
 * and Stage 2 could never be reached. This flag asks those reps, once and
 * dismissibly, to sign in again. It is rep-visible, so it defaults to OFF and
 * is turned on deliberately.
 */
export function promptReauthEnabled(): boolean {
  return String(process.env.SA21_PROMPT_REAUTH || '').toLowerCase() === 'true';
}

export function requireSessionEnabled(): boolean {
  return String(process.env.SA21_REQUIRE_SESSION || '').toLowerCase() === 'true';
}

/** Idempotent; called from runStartupMigrations on every boot. */
export async function ensureSessionTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash TEXT NOT NULL UNIQUE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_app_sessions_expires ON app_sessions(expires_at);
  `);
}

/**
 * Mint a session for someone whose identity has just been VERIFIED — a Google
 * id_token, or an emailed code that checked out. Never call this from a path
 * that only knows an address.
 */
export async function mintSession(
  pool: pg.Pool,
  input: { userId: string; email: string; rememberMe?: boolean; userAgent?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = `s21_${crypto.randomBytes(32).toString('base64url')}`;
  const ttl = input.rememberMe === false ? SHORT_TTL_MS : REMEMBERED_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  await pool.query(
    `INSERT INTO app_sessions (token_hash, user_id, email, expires_at, user_agent)
     VALUES ($1, $2, LOWER($3), $4, $5)`,
    [hash(token), input.userId, input.email, expiresAt, (input.userAgent || '').slice(0, 400) || null],
  );
  return { token, expiresAt };
}

export async function revokeSession(pool: pg.Pool, token: string): Promise<void> {
  const h = hash(token);
  cache.delete(h);
  await pool.query('DELETE FROM app_sessions WHERE token_hash = $1', [h]);
}

export async function revokeAllSessionsForUser(pool: pg.Pool, userId: string): Promise<number> {
  cache.clear();
  const r = await pool.query('DELETE FROM app_sessions WHERE user_id = $1', [userId]);
  return r.rowCount ?? 0;
}

function bearerFrom(req: express.Request): string | null {
  const raw = req.header(SESSION_HEADER);
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  const token = match?.[1]?.trim();
  return token && token.length <= 400 ? token : null;
}

/** Resolve a bearer to a live session, or null. Cached for a minute; expiry is still enforced. */
export async function resolveSession(pool: pg.Pool, token: string): Promise<AppSession | null> {
  const h = hash(token);
  const hit = cache.get(h);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) {
    if (hit.session && hit.session.expiresAt.getTime() <= now) {
      cache.delete(h);
      return null;
    }
    return hit.session;
  }
  let session: AppSession | null = null;
  try {
    const r = await pool.query(
      `SELECT s.user_id, s.email, s.expires_at
         FROM app_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > NOW()
        LIMIT 1`,
      [h],
    );
    if (r.rows.length > 0) {
      session = {
        token,
        userId: r.rows[0].user_id,
        email: String(r.rows[0].email).toLowerCase(),
        expiresAt: new Date(r.rows[0].expires_at),
      };
    }
  } catch (err) {
    // A session lookup that fails must not take the app down; in Stage 1 the
    // request simply falls through to the legacy header, as it did before.
    console.error('[auth] session lookup failed:', (err as Error).message);
    return null;
  }
  cache.set(h, { session, at: now });
  return session;
}

/** Touch `last_seen_at` at most once a minute per session, off the request path. */
const lastTouched = new Map<string, number>();
function touch(pool: pg.Pool, token: string): void {
  const h = hash(token);
  const now = Date.now();
  if ((lastTouched.get(h) ?? 0) > now - 60_000) return;
  lastTouched.set(h, now);
  pool
    .query('UPDATE app_sessions SET last_seen_at = NOW() WHERE token_hash = $1', [h])
    .catch(() => { /* best effort */ });
}

/**
 * Mount this before every /api route.
 *
 * Stage 1: a valid bearer wins and rewrites `x-user-email`; anything else is
 * left exactly as it was. Stage 2 (SA21_REQUIRE_SESSION=true): no valid
 * session on a non-public path is a 401, and the header never decides anything.
 */
export function createSessionMiddleware(pool: pg.Pool) {
  return async function sessionMiddleware(
    req: SessionRequest,
    res: express.Response,
    next: express.NextFunction,
  ): Promise<void> {
    const token = bearerFrom(req);
    const session = token ? await resolveSession(pool, token) : null;

    if (session) {
      req.session = session;
      req.authMechanism = 'session';
      counters.session++;
      // The front door decides identity. Every downstream reader of the header
      // — and there are hundreds — is now reading a verified address.
      req.headers[LEGACY_EMAIL_HEADER] = session.email;
      touch(pool, session.token);
      next();
      return;
    }

    if (token) counters.staleToken++;

    const legacy = req.header(LEGACY_EMAIL_HEADER);
    req.authMechanism = legacy ? 'legacy-header' : 'none';
    if (legacy) counters.legacyHeader++;
    else counters.none++;

    if (requireSessionEnabled() && !isPublicPath(req.path)) {
      // Stage 2. The header is no longer an identity.
      delete req.headers[LEGACY_EMAIL_HEADER];
      res.status(401).json({
        error: 'Please sign in again.',
        code: 'SESSION_REQUIRED',
      });
      return;
    }

    next();
  };
}

/** Test seam: forget cached sessions (used by the suite, and after a revoke). */
export function clearSessionCache(): void {
  cache.clear();
  lastTouched.clear();
}
