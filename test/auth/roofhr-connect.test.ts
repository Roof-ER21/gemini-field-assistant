/**
 * Connecting Susan to Roof HR — the refusals.
 *
 * Roof HR is the permissions key: a rep's HR question is answered on a token
 * minted for THAT REP. Every test here pins a refusal that, if it were missing,
 * would put a Roof HR token in the wrong hands or let Susan answer from the
 * wrong person's permissions.
 *
 * No database and no network beyond a throwaway localhost server: the storage
 * module takes its pool by injection and the MCP client takes its endpoint as an
 * argument, so a stub and a real ephemeral port are enough.
 *
 * Run with: npm run test:auth
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';

import {
  ROOFHR_APP,
  deleteConnection,
  encryptionConfigured,
  getConnection,
  saveConnection,
} from '../../server/services/roofhrConnection';
import { buildConnectStartUrl, createConnectRoutes, signState, verifyState } from '../../server/routes/connectRoutes';
import { clearToolCache, declarationFor, resolveRoofhr, toGeminiSchema } from '../../server/services/roofhrAgentTools';
import { callTool, listTools, McpError } from '../../server/services/mcpClient';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const SECRET = 'connect-secret-for-tests';
const USER = '11111111-1111-1111-1111-111111111111';
const OTHER_USER = '22222222-2222-2222-2222-222222222222';
const ROOFHR_TOKEN = 'rhm_live_token_value_do_not_leak';

// ---------------------------------------------------------------------------
// A pool that actually remembers, so a round trip is a real round trip.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function fakePool() {
  const rows: Row[] = [];
  const pool = {
    rows,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/^\s*CREATE TABLE/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/INSERT INTO agent_connections/i.test(sql)) {
        const [user_id, app, remote_user_id, token_ciphertext, token_iv, token_tag, scopes, endpoint, expires_at] =
          params as any[];
        const existing = rows.findIndex((r) => r.user_id === user_id && r.app === app);
        const row: Row = {
          user_id, app, remote_user_id, token_ciphertext, token_iv, token_tag,
          scopes, endpoint, expires_at, created_at: new Date(), last_used_at: null,
        };
        if (existing >= 0) rows[existing] = row; else rows.push(row);
        return { rows: [row], rowCount: 1 };
      }
      // DELETE is matched first: `DELETE FROM agent_connections` also contains
      // `FROM agent_connections`, and reading it as a SELECT would make a delete
      // report success while removing nothing.
      if (/^\s*DELETE FROM agent_connections/i.test(sql)) {
        const [user_id, app] = params as any[];
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].user_id === user_id && rows[i].app === app) rows.splice(i, 1);
        }
        return { rows: [], rowCount: before - rows.length };
      }
      if (/FROM agent_connections/i.test(sql)) {
        const [user_id, app] = params as any[];
        const found = rows.filter(
          (r) => r.user_id === user_id && r.app === app && (r.expires_at as Date).getTime() > Date.now(),
        );
        return { rows: found, rowCount: found.length };
      }
      if (/UPDATE agent_connections/i.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`unexpected SQL in test: ${sql.slice(0, 60)}`);
    }),
  };
  return pool as typeof pool & { query: any };
}

/** Listen on an ephemeral loopback port; never 0.0.0.0 in a test. */
async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const openServers: Array<() => Promise<void>> = [];

beforeEach(() => {
  process.env.SA21_TOKEN_ENC_KEY = KEY_A;
  process.env.CONNECT_SECRET_SA21 = SECRET;
  process.env.BASE_URL = 'http://localhost:5173';
  clearToolCache();
});

afterEach(async () => {
  while (openServers.length > 0) await openServers.pop()!();
  delete process.env.SA21_TOKEN_ENC_KEY;
  delete process.env.CONNECT_SECRET_SA21;
  delete process.env.BASE_URL;
  delete process.env.ROOFHR_BASE_URL;
});

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

describe('a stored Roof HR token is not readable from the table alone', () => {
  it('round-trips through encryption', async () => {
    const pool = fakePool();
    const saved = await saveConnection(pool as any, {
      userId: USER, remoteUserId: 'rh-1', token: ROOFHR_TOKEN,
      scopes: ['pto:read'], endpoint: 'https://roofhr.example/mcp',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(saved.ok).toBe(true);

    const conn = await getConnection(pool as any, USER);
    expect(conn?.token).toBe(ROOFHR_TOKEN);
    expect(conn?.remoteUserId).toBe('rh-1');
  });

  it('never writes the token in the clear', async () => {
    const pool = fakePool();
    await saveConnection(pool as any, {
      userId: USER, remoteUserId: 'rh-1', token: ROOFHR_TOKEN,
      scopes: [], endpoint: 'https://roofhr.example/mcp',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const stored = JSON.stringify(pool.rows);
    expect(stored).not.toContain(ROOFHR_TOKEN);
    expect(stored).not.toContain('rhm_live');
  });

  it('refuses to store at all when no key is configured', async () => {
    delete process.env.SA21_TOKEN_ENC_KEY;
    expect(encryptionConfigured()).toBe(false);
    const pool = fakePool();
    const saved = await saveConnection(pool as any, {
      userId: USER, remoteUserId: 'rh-1', token: ROOFHR_TOKEN,
      scopes: [], endpoint: 'https://roofhr.example/mcp',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    // Storing in the clear would be the only other option, so this must fail.
    expect(saved.ok).toBe(false);
    expect(pool.rows).toHaveLength(0);
  });

  it('will not decrypt a row moved onto another user id', async () => {
    const pool = fakePool();
    await saveConnection(pool as any, {
      userId: USER, remoteUserId: 'rh-1', token: ROOFHR_TOKEN,
      scopes: [], endpoint: 'https://roofhr.example/mcp',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    // Exactly what someone with write access to the table would try.
    pool.rows[0].user_id = OTHER_USER;
    expect(await getConnection(pool as any, OTHER_USER)).toBeNull();
  });

  it('will not decrypt under a rotated key', async () => {
    const pool = fakePool();
    await saveConnection(pool as any, {
      userId: USER, remoteUserId: 'rh-1', token: ROOFHR_TOKEN,
      scopes: [], endpoint: 'https://roofhr.example/mcp',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    process.env.SA21_TOKEN_ENC_KEY = KEY_B;
    expect(await getConnection(pool as any, USER)).toBeNull();
  });

  it('treats an expired connection as no connection', async () => {
    const pool = fakePool();
    await saveConnection(pool as any, {
      userId: USER, remoteUserId: 'rh-1', token: ROOFHR_TOKEN,
      scopes: [], endpoint: 'https://roofhr.example/mcp',
      expiresAt: new Date(Date.now() - 1_000),
    });
    expect(await getConnection(pool as any, USER)).toBeNull();
  });

  it('disconnect removes it', async () => {
    const pool = fakePool();
    await saveConnection(pool as any, {
      userId: USER, remoteUserId: 'rh-1', token: ROOFHR_TOKEN,
      scopes: [], endpoint: 'https://roofhr.example/mcp',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(await deleteConnection(pool as any, USER, ROOFHR_APP)).toBe(true);
    expect(await getConnection(pool as any, USER)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

describe('the state that carries a rep through Roof HR and back', () => {
  it('verifies what it signed', () => {
    const state = signState(USER)!;
    expect(verifyState(state).userId).toBe(USER);
  });

  it('refuses a tampered payload', () => {
    const state = signState(USER)!;
    const [payload, sig] = state.split('.');
    const forged = Buffer.from(JSON.stringify({ u: OTHER_USER, n: 'x', e: Date.now() + 60_000 })).toString('base64url');
    expect(verifyState(`${forged}.${sig}`).userId).toBeNull();
    expect(payload).not.toBe(forged);
  });

  it('refuses a tampered signature', () => {
    const state = signState(USER)!;
    const [payload] = state.split('.');
    expect(verifyState(`${payload}.${Buffer.from('nope').toString('base64url')}`).userId).toBeNull();
  });

  it('refuses one signed under a different key', () => {
    const state = signState(USER)!;
    process.env.SA21_TOKEN_ENC_KEY = KEY_B;
    expect(verifyState(state).userId).toBeNull();
  });

  it('refuses an expired one', () => {
    const state = signState(USER, Date.now() - 3_600_000)!;
    const verdict = verifyState(state);
    expect(verdict.userId).toBeNull();
    expect(verdict.error).toMatch(/expired/i);
  });

  it('is unavailable at all when the key is missing', () => {
    delete process.env.SA21_TOKEN_ENC_KEY;
    expect(signState(USER)).toBeNull();
  });

  it('only builds a start URL for a registered return address', () => {
    const req: any = { protocol: 'https', get: () => 'someone-elses-host.example' };
    process.env.BASE_URL = 'https://someone-elses-host.example';
    // A prefix or wildcard here would be an open redirect with a token on the end.
    expect(buildConnectStartUrl(req, USER)).toBeNull();

    process.env.BASE_URL = 'https://sa21.theroofdocs.com';
    const url = buildConnectStartUrl(req, USER)!;
    expect(url).toContain('/connect/agent?app=sa21');
    expect(url).toContain(encodeURIComponent('https://sa21.theroofdocs.com/api/connect/roofhr/callback'));
  });

  /**
   * sa21 answers on two domains and the session lives in per-origin localStorage.
   * A rep who starts on one domain must come back to THAT domain, or /complete
   * sees no session and refuses a trip they completed correctly.
   */
  it('returns the rep to the domain they started on, not whatever BASE_URL says', () => {
    process.env.BASE_URL = 'https://sa21.up.railway.app';
    const req: any = { protocol: 'https', get: () => 'sa21.theroofdocs.com' };
    const url = buildConnectStartUrl(req, USER)!;
    expect(url).toContain(encodeURIComponent('https://sa21.theroofdocs.com/api/connect/roofhr/callback'));
    expect(url).not.toContain(encodeURIComponent('sa21.up.railway.app'));
  });

  it('falls back to BASE_URL when the request host is not registered', () => {
    process.env.BASE_URL = 'https://sa21.up.railway.app';
    // e.g. reached through an internal hostname or a health-check probe.
    const req: any = { protocol: 'https', get: () => 'susan-21.railway.internal' };
    const url = buildConnectStartUrl(req, USER)!;
    expect(url).toContain(encodeURIComponent('https://sa21.up.railway.app/api/connect/roofhr/callback'));
  });
});

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

/**
 * The connect router with a session we control. `createSessionMiddleware` has
 * its own 37 tests; what is under test here is what the router does with the
 * session it is given.
 */
async function connectApp(pool: any, session: { userId: string } | null, roofhrBase?: string) {
  if (roofhrBase) process.env.ROOFHR_BASE_URL = roofhrBase;
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { if (session) req.session = { ...session, email: 'rep@theroofdocs.com' }; next(); });
  app.use('/api/connect', createConnectRoutes(pool));
  const server = await listen(app);
  openServers.push(server.close);
  return server.url;
}

/** A stand-in Roof HR that hands back a token for one known code. */
async function fakeRoofHr(opts: { code: string; secret: string; roofhrUserId?: string }) {
  const app = express();
  app.use(express.json());
  app.post('/api/mcp/connect/exchange', (req, res) => {
    if (req.body?.client_secret !== opts.secret) return res.status(401).json({ error: 'This app could not be authenticated.' });
    if (req.body?.code !== opts.code) return res.status(400).json({ error: 'That connection code is not valid or has already been used.' });
    res.json({
      token: ROOFHR_TOKEN,
      tokenId: 'tok-1',
      scopes: ['me:read', 'pto:read'],
      endpoint: 'https://roofhr.example/mcp',
      readOnly: true,
      roofhrUserId: opts.roofhrUserId ?? 'rh-42',
    });
  });
  const server = await listen(app);
  openServers.push(server.close);
  return server.url;
}

describe('completing a connection', () => {
  it('stores the token for the rep who started the trip', async () => {
    const pool = fakePool();
    const roofhr = await fakeRoofHr({ code: 'good-code', secret: SECRET });
    const base = await connectApp(pool, { userId: USER }, roofhr);

    const res = await fetch(`${base}/api/connect/roofhr/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'good-code', state: signState(USER) }),
    });
    expect(res.status).toBe(201);

    const conn = await getConnection(pool as any, USER);
    expect(conn?.token).toBe(ROOFHR_TOKEN);
    expect(conn?.remoteUserId).toBe('rh-42');
    expect(conn?.scopes).toEqual(['me:read', 'pto:read']);
  });

  /**
   * THE test. A signed state proves only that sa21 issued it — to whoever asked.
   * Without this check, a rep could start a connection, hand the link to a
   * colleague, and have the COLLEAGUE's Roof HR token filed under their own
   * account, then read the colleague's HR record through Susan.
   */
  it('refuses a code when the state names a different rep', async () => {
    const pool = fakePool();
    const roofhr = await fakeRoofHr({ code: 'good-code', secret: SECRET });
    const base = await connectApp(pool, { userId: OTHER_USER }, roofhr);

    const res = await fetch(`${base}/api/connect/roofhr/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'good-code', state: signState(USER) }),
    });
    expect(res.status).toBe(400);
    expect(pool.rows).toHaveLength(0);
    expect(await getConnection(pool as any, OTHER_USER)).toBeNull();
    expect(await getConnection(pool as any, USER)).toBeNull();
  });

  it('refuses without a session at all', async () => {
    const pool = fakePool();
    const base = await connectApp(pool, null);
    for (const [method, path] of [
      ['GET', '/api/connect/roofhr/start'],
      ['GET', '/api/connect/roofhr/status'],
      ['POST', '/api/connect/roofhr/complete'],
      ['DELETE', '/api/connect/roofhr'],
    ] as const) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: '{}' } : {}),
      });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('relays Roof HR\'s own refusal rather than inventing one', async () => {
    const pool = fakePool();
    const roofhr = await fakeRoofHr({ code: 'good-code', secret: SECRET });
    const base = await connectApp(pool, { userId: USER }, roofhr);

    const res = await fetch(`${base}/api/connect/roofhr/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'already-used', state: signState(USER) }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already been used/i);
    expect(pool.rows).toHaveLength(0);
  });

  it('is inert until both secrets are set', async () => {
    delete process.env.CONNECT_SECRET_SA21;
    const pool = fakePool();
    const base = await connectApp(pool, { userId: USER });
    expect((await fetch(`${base}/api/connect/roofhr/start`)).status).toBe(503);
    const status = await (await fetch(`${base}/api/connect/roofhr/status`)).json();
    expect(status.configured).toBe(false);
  });

  it('the callback itself redeems nothing — it only forwards the code', async () => {
    const pool = fakePool();
    const base = await connectApp(pool, null);
    const res = await fetch(`${base}/api/connect/roofhr/callback?code=abc&state=def`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('connect=roofhr');
    // Nothing was stored: a browser redirect cannot prove who is looking.
    expect(pool.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// No shared token, ever
// ---------------------------------------------------------------------------

describe('Susan has no Roof HR access of her own', () => {
  it('offers no Roof HR tool when this rep has not connected', async () => {
    const pool = fakePool();
    const availability = await resolveRoofhr(pool as any, { userId: USER, hasVerifiedSession: true });
    expect(availability.state).toBe('not_connected');
    expect('bridge' in availability).toBe(false);
    expect(availability.promptBlock).toMatch(/cannot see Roof HR/i);
    expect(availability.promptBlock).toMatch(/no shared login/i);
  });

  it('offers no Roof HR tool to a caller who only asserted an email', async () => {
    const pool = fakePool();
    await saveConnection(pool as any, {
      userId: USER, remoteUserId: 'rh-1', token: ROOFHR_TOKEN,
      scopes: ['pto:read'], endpoint: 'https://roofhr.example/mcp',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    // The rep HAS connected. The request did not arrive on a verified session,
    // so reading their HR record must still be refused — otherwise the
    // `x-user-email` hole would reach further than anything inside sa21.
    const availability = await resolveRoofhr(pool as any, { userId: USER, hasVerifiedSession: false });
    expect(availability.state).toBe('unverified');
    expect('bridge' in availability).toBe(false);
  });

  it('offers nothing when the token key is missing', async () => {
    delete process.env.SA21_TOKEN_ENC_KEY;
    const pool = fakePool();
    const availability = await resolveRoofhr(pool as any, { userId: USER, hasVerifiedSession: true });
    expect(availability.state).toBe('unconfigured');
    expect('bridge' in availability).toBe(false);
  });

  /**
   * A belt-and-braces read of the source. A fallback would most plausibly arrive
   * as "if there is no per-user token, use the service one from the environment",
   * and it must never be added.
   */
  it('reads no Roof HR token from the environment anywhere', () => {
    for (const file of [
      'server/services/roofhrConnection.ts',
      'server/services/roofhrAgentTools.ts',
      'server/services/mcpClient.ts',
      'server/routes/connectRoutes.ts',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/ROOFHR_(MCP_)?TOKEN/);
      expect(source, file).not.toMatch(/process\.env\.[A-Z_]*MCP_TOKEN/);
    }
  });
});

// ---------------------------------------------------------------------------
// Schema translation
// ---------------------------------------------------------------------------

describe('an MCP tool schema becomes something Gemini accepts', () => {
  it('drops keywords Gemini rejects', () => {
    const schema = toGeminiSchema({
      type: 'object',
      additionalProperties: false,
      $schema: 'http://json-schema.org/draft-07/schema#',
      properties: {
        month: { type: 'string', description: 'YYYY-MM', pattern: '^\\d{4}-\\d{2}$' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        view: { type: 'string', enum: ['balance', 'calendar'] },
      },
      required: ['month', 'nonexistent'],
    })!;
    const asJson = JSON.stringify(schema);
    expect(asJson).not.toContain('additionalProperties');
    expect(asJson).not.toContain('$schema');
    expect(asJson).not.toContain('pattern');
    expect(asJson).not.toContain('minimum');
    expect(schema.properties?.view?.enum).toEqual(['balance', 'calendar']);
    // A required name with no matching property would be rejected by the API.
    expect(schema.required).toEqual(['month']);
  });

  it('declares a no-argument tool with no parameters', () => {
    const decl = declarationFor({
      name: 'me',
      description: 'Who this token acts as.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    })!;
    expect(decl.name).toBe('roofhr_me');
    expect(decl.parameters).toBeUndefined();
  });

  it('namespaces every Roof HR tool so it cannot shadow one of Susan\'s', () => {
    expect(declarationFor({ name: 'send_email', inputSchema: {} })!.name).toBe('roofhr_send_email');
  });
});

// ---------------------------------------------------------------------------
// The MCP client
// ---------------------------------------------------------------------------

describe('the MCP client', () => {
  async function mcpServer(handler: (req: express.Request, res: express.Response) => void) {
    const app = express();
    app.use(express.json());
    app.post('/mcp', handler);
    const server = await listen(app);
    openServers.push(server.close);
    return `${server.url}/mcp`;
  }

  it('asks for both content types, because the server demands both', async () => {
    let seen = '';
    const endpoint = await mcpServer((req, res) => {
      seen = String(req.headers.accept || '');
      res.setHeader('Content-Type', 'text/event-stream');
      res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [] } })}\n\n`);
    });
    await listTools(endpoint, 'tok');
    expect(seen).toContain('application/json');
    expect(seen).toContain('text/event-stream');
  });

  it('reads a result out of an SSE frame', async () => {
    const endpoint = await mcpServer((_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end(
        'event: message\n' +
        `data: ${JSON.stringify({
          jsonrpc: '2.0', id: 1,
          result: { content: [{ type: 'text', text: '{"remaining":4}' }], structuredContent: { remaining: 4 } },
        })}\n\n`,
      );
    });
    const result = await callTool(endpoint, 'tok', 'pto', { view: 'balance' });
    expect(result.structuredContent).toEqual({ remaining: 4 });
  });

  it('never follows a redirect, so a token cannot be sent onward', async () => {
    const endpoint = await mcpServer((_req, res) => {
      res.redirect(302, 'https://attacker.example/collect');
    });
    await expect(listTools(endpoint, ROOFHR_TOKEN)).rejects.toThrow(/redirect/i);
  });

  it('surfaces a JSON-RPC error as written', async () => {
    const endpoint = await mcpServer((_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end(
        'event: message\n' +
        `data: ${JSON.stringify({
          jsonrpc: '2.0', id: 1,
          error: { code: -32602, message: 'This token has no employees:read scope.' },
        })}\n\n`,
      );
    });
    await expect(callTool(endpoint, 'tok', 'employees', {})).rejects.toThrow(/employees:read scope/);
  });

  it('reports a revoked token as a reconnect, not a crash', async () => {
    const endpoint = await mcpServer((_req, res) => {
      res.status(401).json({ error: 'unauthorized' });
    });
    await expect(listTools(endpoint, 'dead')).rejects.toBeInstanceOf(McpError);
    await expect(listTools(endpoint, 'dead')).rejects.toThrow(/reconnect/i);
  });
});

// ---------------------------------------------------------------------------
// End to end, through the bridge
// ---------------------------------------------------------------------------

describe('a connected rep reads Roof HR as themselves', () => {
  it('sends the rep\'s own token and relays a refusal verbatim', async () => {
    const seenTokens: string[] = [];
    const app = express();
    app.use(express.json());
    app.post('/mcp', (req, res) => {
      seenTokens.push(String(req.headers.authorization || ''));
      const method = req.body?.method;
      res.setHeader('Content-Type', 'text/event-stream');
      if (method === 'tools/list') {
        res.end(
          'event: message\n' +
          `data: ${JSON.stringify({
            jsonrpc: '2.0', id: 1,
            result: {
              tools: [
                { name: 'me', description: 'Who this token acts as.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
                { name: 'pto', description: 'PTO.', inputSchema: { type: 'object', properties: { view: { type: 'string' } }, additionalProperties: false } },
              ],
            },
          })}\n\n`,
        );
        return;
      }
      const isOwn = req.body?.params?.arguments?.view === 'balance';
      res.end(
        'event: message\n' +
        `data: ${JSON.stringify({
          jsonrpc: '2.0', id: 2,
          result: isOwn
            ? { content: [{ type: 'text', text: '{"remaining":4}' }], structuredContent: { remaining: 4 } }
            : { content: [{ type: 'text', text: 'You may only see your own PTO.' }], isError: true },
        })}\n\n`,
      );
    });
    const server = await listen(app);
    openServers.push(server.close);

    const pool = fakePool();
    await saveConnection(pool as any, {
      userId: USER, remoteUserId: 'rh-42', token: ROOFHR_TOKEN,
      scopes: ['me:read', 'pto:read'], endpoint: `${server.url}/mcp`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const availability = await resolveRoofhr(pool as any, { userId: USER, hasVerifiedSession: true });
    expect(availability.state).toBe('connected');
    if (availability.state !== 'connected') return;

    expect(availability.bridge.declarations.map((d) => d.name)).toEqual(['roofhr_me', 'roofhr_pto']);
    expect(availability.bridge.handles('roofhr_pto')).toBe(true);
    expect(availability.bridge.handles('send_email')).toBe(false);

    const ok = await availability.bridge.call('roofhr_pto', { view: 'balance' });
    expect(ok.result.success).toBe(true);
    expect(ok.result.data).toEqual({ remaining: 4 });

    const refused = await availability.bridge.call('roofhr_pto', { view: 'someone_else' });
    expect(refused.result.success).toBe(false);
    // Roof HR's wording, not a rephrasing of it.
    expect(refused.result.error).toBe('You may only see your own PTO.');

    // Every call carried THIS rep's token and nothing else.
    expect(new Set(seenTokens)).toEqual(new Set([`Bearer ${ROOFHR_TOKEN}`]));
  });

  it('drops a connection Roof HR has stopped honouring', async () => {
    const app = express();
    app.use(express.json());
    app.post('/mcp', (_req, res) => res.status(401).json({ error: 'revoked' }));
    const server = await listen(app);
    openServers.push(server.close);

    const pool = fakePool();
    await saveConnection(pool as any, {
      userId: USER, remoteUserId: 'rh-42', token: ROOFHR_TOKEN,
      scopes: ['pto:read'], endpoint: `${server.url}/mcp`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const availability = await resolveRoofhr(pool as any, { userId: USER, hasVerifiedSession: true });
    expect(availability.state).toBe('not_connected');
    // The row is gone, so the rep is told to reconnect instead of being shown a
    // connection that no longer works.
    expect(pool.rows).toHaveLength(0);
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});
