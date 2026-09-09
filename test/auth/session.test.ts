/**
 * sa21 identity — the front door, in both stages.
 *
 * Background: until 2026-09-09 the API decided who you were from the
 * `x-user-email` request header, confirmed live on prod — knowing any rep's
 * work address was the same as being them. Behind that sat Susan's agent, whose
 * tools include sending mail. These tests pin the replacement:
 *
 *   Stage 1  a verified bearer wins and rewrites the header; no bearer still
 *            falls through, so no rep is signed out by the deploy.
 *   Stage 1.5 the tools that act OUTWARD refuse an unverified caller.
 *   Stage 2  SA21_REQUIRE_SESSION=true — no session, no request.
 *
 * The pool is a stub: this module only ever calls `pool.query`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import {
  clearSessionCache,
  createSessionMiddleware,
  isPublicPath,
  mintSession,
  requireSessionEnabled,
  resolveSession,
  sessionAdoption,
} from '../../server/auth/session';

const REP = { id: '11111111-1111-1111-1111-111111111111', email: 'real.rep@theroofdocs.com' };

/** A pool that answers the session lookup for exactly one known token. */
function poolFor(token: string | null, row: Record<string, unknown> | null = null) {
  const wanted = token ? crypto.createHash('sha256').update(token).digest('hex') : null;
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/FROM app_sessions/.test(sql)) {
        const match = wanted && params[0] === wanted;
        return { rows: match && row ? [row] : [], rowCount: match && row ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
  } as any;
}

function reqFor(headers: Record<string, string>, path = '/api/jobs') {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    path,
    headers: lower,
    header(name: string) { return lower[name.toLowerCase()]; },
  } as any;
}

function resFor() {
  const out: { status?: number; body?: unknown } = {};
  return {
    out,
    status(code: number) { out.status = code; return this; },
    json(body: unknown) { out.body = body; return this; },
  } as any;
}

const live = { user_id: REP.id, email: REP.email, expires_at: new Date(Date.now() + 60_000) };

beforeEach(() => {
  clearSessionCache();
  delete process.env.SA21_REQUIRE_SESSION;
});
afterEach(() => {
  delete process.env.SA21_REQUIRE_SESSION;
});

describe('minting', () => {
  it('only ever hands out a session for a user id, and stores a HASH not the token', async () => {
    const pool = poolFor(null);
    const { token, expiresAt } = await mintSession(pool, { userId: REP.id, email: REP.email });
    expect(token.startsWith('s21_')).toBe(true);
    expect(token.length).toBeGreaterThan(20);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const insert = pool.calls.find((c: any) => /INSERT INTO app_sessions/.test(c.sql));
    expect(insert).toBeTruthy();
    // The plaintext token must never reach the table.
    expect(JSON.stringify(insert.params)).not.toContain(token);
    expect(insert.params[0]).toBe(crypto.createHash('sha256').update(token).digest('hex'));
  });

  it('a browser-only sign-in expires in a day, a remembered one in a year', async () => {
    const pool = poolFor(null);
    const short = await mintSession(pool, { userId: REP.id, email: REP.email, rememberMe: false });
    const long = await mintSession(pool, { userId: REP.id, email: REP.email, rememberMe: true });
    const day = 24 * 60 * 60 * 1000;
    expect(short.expiresAt.getTime() - Date.now()).toBeLessThan(day + 60_000);
    expect(long.expiresAt.getTime() - Date.now()).toBeGreaterThan(300 * day);
  });
});

describe('resolving', () => {
  it('resolves a live session and refuses an unknown token', async () => {
    const pool = poolFor('s21_good', live);
    expect((await resolveSession(pool, 's21_good'))?.email).toBe(REP.email);
    clearSessionCache();
    expect(await resolveSession(pool, 's21_forged')).toBeNull();
  });

  it('the expiry is enforced in SQL, not only in JS', async () => {
    const pool = poolFor('s21_good', live);
    await resolveSession(pool, 's21_good');
    const lookup = pool.calls.find((c: any) => /FROM app_sessions/.test(c.sql));
    expect(lookup.sql).toMatch(/expires_at > NOW\(\)/);
    // and it joins users, so a deleted rep's token dies with them
    expect(lookup.sql).toMatch(/JOIN users/);
  });

  it('a database failure resolves to no session rather than throwing into the request', async () => {
    const pool = { query: vi.fn(async () => { throw new Error('connection reset'); }) } as any;
    await expect(resolveSession(pool, 's21_good')).resolves.toBeNull();
  });
});

describe('Stage 1 — additive, nobody is signed out', () => {
  it('a verified bearer rewrites x-user-email from the session', async () => {
    const mw = createSessionMiddleware(poolFor('s21_good', live));
    // The caller asserts somebody else; the session must win.
    const req = reqFor({ authorization: 'Bearer s21_good', 'x-user-email': 'victim@theroofdocs.com' });
    const next = vi.fn();
    await mw(req, resFor(), next);
    expect(next).toHaveBeenCalled();
    expect(req.headers['x-user-email']).toBe(REP.email);
    expect(req.authMechanism).toBe('session');
    expect(req.session.userId).toBe(REP.id);
  });

  it('no bearer still passes on the legacy header — this deploy logs nobody out', async () => {
    const mw = createSessionMiddleware(poolFor('s21_good', live));
    const req = reqFor({ 'x-user-email': 'rep@theroofdocs.com' });
    const res = resFor();
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.out.status).toBeUndefined();
    expect(req.authMechanism).toBe('legacy-header');
    expect(req.headers['x-user-email']).toBe('rep@theroofdocs.com');
  });

  it('a stale or forged bearer does not lock a Stage 1 caller out', async () => {
    const mw = createSessionMiddleware(poolFor('s21_good', live));
    const req = reqFor({ authorization: 'Bearer s21_forged', 'x-user-email': 'rep@theroofdocs.com' });
    const res = resFor();
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.out.status).toBeUndefined();
    expect(req.session).toBeUndefined();
    expect(req.authMechanism).toBe('legacy-header');
  });

  it('adoption is measurable, which is what makes Stage 2 a decision and not a guess', async () => {
    const mw = createSessionMiddleware(poolFor('s21_good', live));
    const before = sessionAdoption().session;
    await mw(reqFor({ authorization: 'Bearer s21_good' }), resFor(), vi.fn());
    expect(sessionAdoption().session).toBe(before + 1);
    expect(sessionAdoption().sessionShare).toBeGreaterThan(0);
  });
});

describe('Stage 2 — the header stops being an identity', () => {
  it('is off unless the env var says otherwise', () => {
    expect(requireSessionEnabled()).toBe(false);
    process.env.SA21_REQUIRE_SESSION = 'true';
    expect(requireSessionEnabled()).toBe(true);
  });

  it('refuses a header-only caller with a plain sentence and a code the client can act on', async () => {
    process.env.SA21_REQUIRE_SESSION = 'true';
    const mw = createSessionMiddleware(poolFor('s21_good', live));
    const req = reqFor({ 'x-user-email': 'real.rep@theroofdocs.com' });
    const res = resFor();
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.out.status).toBe(401);
    expect((res.out.body as any).code).toBe('SESSION_REQUIRED');
    // and the asserted address is stripped, so nothing downstream can read it
    expect(req.headers['x-user-email']).toBeUndefined();
  });

  it('still lets a verified session through', async () => {
    process.env.SA21_REQUIRE_SESSION = 'true';
    const mw = createSessionMiddleware(poolFor('s21_good', live));
    const req = reqFor({ authorization: 'Bearer s21_good' });
    const res = resFor();
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.out.status).toBeUndefined();
  });

  it('does not lock out the paths that must work before anyone has a session', async () => {
    process.env.SA21_REQUIRE_SESSION = 'true';
    const mw = createSessionMiddleware(poolFor('s21_good', live));
    for (const path of [
      '/api/auth/google/start',
      '/api/auth/google/exchange',
      '/api/health',
      '/api/present/abc123',
      '/api/susan/groupme-webhook',
    ]) {
      const res = resFor();
      const next = vi.fn();
      await mw(reqFor({}, path), res, next);
      expect(next, `${path} must stay reachable`).toHaveBeenCalled();
      expect(res.out.status, `${path} must not 401`).toBeUndefined();
    }
  });

  it('a login path is public but a data path is not', () => {
    expect(isPublicPath('/api/auth/google/exchange')).toBe(true);
    expect(isPublicPath('/api/jobs')).toBe(false);
    expect(isPublicPath('/api/susan/agent/chat')).toBe(false);
  });
});
