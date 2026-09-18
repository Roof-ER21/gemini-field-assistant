/**
 * The sa21 MCP endpoint (server/mcp/*), end to end over a real Express server
 * with the REAL session middleware (server/auth/session.ts) on a stub pool
 * and FAKE route handlers — so the protocol, the host gate, the bearer rule
 * and the field cuts are all pinned without a database or a Gemini call.
 * Run with: npm run test:mcp
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { clearSessionCache, createSessionMiddleware } from '../../server/auth/session';
import { JSON_RPC, MCP_PROTOCOL_VERSION, MCP_RESULT_MAX_CHARS, MCP_TOOL_NAMES, createMcpRouter, validateArgs } from '../../server/mcp/server';
import { createExecutors, type McpHandlers } from '../../server/mcp/executors';
import { runHandler } from '../../server/mcp/shim';

const REP = { id: '11111111-1111-1111-1111-111111111111', email: 'real.rep@theroofdocs.com' };
const TOKEN = 's21_test-token-for-the-mcp-suite';
/** A second signed-in person, to prove a bearer resolves to ITS owner and nobody else. */
const REP_B = { id: '22222222-2222-2222-2222-222222222222', email: 'other.rep@theroofdocs.com' };
const TOKEN_B = 's21_test-token-for-person-b';
const HOMEOWNER_HOST = 'get.theroofdocs.com';
const APP_ORIGIN = 'https://sa21.theroofdocs.com';

/** A pool that answers the session lookup for exactly the known tokens, each to its own person. */
function poolFor(token: string) {
  const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
  const sessions: Record<string, { user_id: string; email: string; expires_at: Date }> = {
    [hash(token)]: { user_id: REP.id, email: REP.email, expires_at: new Date(Date.now() + 60_000) },
    [hash(TOKEN_B)]: { user_id: REP_B.id, email: REP_B.email, expires_at: new Date(Date.now() + 60_000) },
  };
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/FROM app_sessions/.test(sql)) {
        const row = sessions[String(params[0])];
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
  } as any;
}

/** Fake handlers in the exact shape of the real routes; each records the request it saw. */
function fakeHandlers() {
  const seen: Record<string, any[]> = { susanChat: [], insuranceCompanies: [], learningGlobal: [], team: [] };
  const handlers: McpHandlers = {
    susanChat: async (req, res) => {
      seen.susanChat.push({ body: req.body, email: req.header('x-user-email') });
      if (!req.body?.message) { res.status(400).json({ success: false, error: 'Message is required' }); return; }
      res.json({ success: true, response: `Susan says: ${req.body.message}`, metadata: { mode: 'fallback', sessionId: null, slideIndex: null } });
    },
    insuranceCompanies: async (req, res) => {
      seen.insuranceCompanies.push({ query: req.query, email: req.header('x-user-email') });
      res.json([
        { id: 1, name: 'State Farm', state: 'VA', phone: '800', email: 'c@sf.com', address: 'x', website: 'sf.com', notes: 'n', category: 'std', created_at: '2026-01-01' },
        { id: 2, name: 'State Auto', state: 'MD', phone: '801', email: null, address: null, website: null, notes: null, category: null, created_at: '2026-01-01' },
      ]);
    },
    learningGlobal: async (req, res) => {
      seen.learningGlobal.push({ query: req.query, email: req.header('x-user-email') });
      res.json({ learnings: [{ id: 'l1', content: 'They pay for ridge cap.', scope_state: null, scope_insurer: 'State Farm', scope_adjuster: null, helpful_count: 4, updated_at: '2026-09-01' }] });
    },
    team: async (req, res) => {
      seen.team.push({ query: req.query, email: req.header('x-user-email'), userId: (req as any).userId });
      res.json({ success: true, users: [
        { userId: 'u1', name: 'Ford Barsi', email: 'ford.barsi@theroofdocs.com', username: 'ford.barsi', status: 'online', lastSeen: 'now' },
        { userId: 'u2', name: 'Reese Smith', email: 'reese@theroofdocs.com', username: 'reese', status: 'offline', lastSeen: null },
        { userId: 'u3', name: 'Ahmed Mahmoud', email: 'ahmed.mahmoud@theroofdocs.com', username: 'ahmed.mahmoud', status: 'away', lastSeen: null },
      ] });
    },
  };
  return { handlers, seen };
}

let server: http.Server;
let base: string;
let seen: Record<string, any[]>;
let pool: any;

beforeAll(async () => {
  const fake = fakeHandlers();
  seen = fake.seen;
  pool = poolFor(TOKEN);
  const app = express();
  app.use('/mcp', createMcpRouter({
    executors: createExecutors(fake.handlers),
    sessionMiddleware: createSessionMiddleware(pool),
    // Mirrors server/index.ts hitGetDomain (Host, X-Forwarded-Host, req.hostname).
    isHomeownerHost: (req) => [req.headers.host, req.headers['x-forwarded-host'], req.hostname]
      .some((h) => String(h || '').toLowerCase().split(',')[0].split(':')[0].trim() === HOMEOWNER_HOST),
    originAllowed: (origin) => origin === APP_ORIGIN,
  }));
  // The app-wide parser sits AFTER the mount in server/index.ts; mirror that.
  app.use(express.json());
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });
beforeEach(() => { clearSessionCache(); for (const k of Object.keys(seen)) seen[k].length = 0; });
afterEach(() => { delete process.env.SA21_REQUIRE_SESSION; });

type Call = { method?: string; headers?: Record<string, string>; body?: unknown; raw?: string; bearer?: string | null };
async function mcp(call: Call = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(call.headers ?? {}) };
  if (call.bearer !== null) headers.authorization = `Bearer ${call.bearer ?? TOKEN}`;
  const res = await fetch(`${base}/mcp`, {
    method: call.method ?? 'POST',
    headers,
    body: call.method === 'GET' ? undefined : (call.raw ?? JSON.stringify(call.body ?? {})),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, json, text };
}
const rpc = (method: string, params?: unknown, id: number | string = 1) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
const callTool = (name: string, args?: unknown) => mcp({ body: rpc('tools/call', { name, arguments: args }) });

describe('transport', () => {
  it('GET is 405 with Allow: POST', async () => {
    const r = await mcp({ method: 'GET' });
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('POST');
    expect(r.json.error.code).toBe(JSON_RPC.CONNECTION_REFUSED);
  });

  it('no bearer is 401 with WWW-Authenticate — never an empty tool list', async () => {
    const r = await mcp({ bearer: null, body: rpc('tools/list') });
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toMatch(/^Bearer /);
    expect(r.json.error.code).toBe(JSON_RPC.CONNECTION_REFUSED);
    expect(r.json.result).toBeUndefined();
  });

  it('an unknown bearer is 401 too', async () => {
    const r = await mcp({ bearer: 's21_not-a-session', body: rpc('tools/list') });
    expect(r.status).toBe(401);
  });

  it('a legacy x-user-email header is NOT an identity here, in either stage', async () => {
    const r1 = await mcp({ bearer: null, headers: { 'x-user-email': REP.email }, body: rpc('tools/list') });
    expect(r1.status).toBe(401);
    process.env.SA21_REQUIRE_SESSION = 'true';
    const r2 = await mcp({ bearer: null, headers: { 'x-user-email': REP.email }, body: rpc('tools/list') });
    expect(r2.status).toBe(401);
  });

  it('the homeowner host is 404 before anything else is learned', async () => {
    // fetch() will not let a test override Host; Railway's proxy sets X-Forwarded-Host, which hitGetDomain reads too.
    const r = await mcp({ headers: { 'x-forwarded-host': HOMEOWNER_HOST }, body: rpc('tools/list') });
    expect(r.status).toBe(404);
    expect(r.text).not.toMatch(/jsonrpc|tools/);
    const g = await mcp({ method: 'GET', headers: { 'x-forwarded-host': HOMEOWNER_HOST } });
    expect(g.status).toBe(404);
  });

  it('a foreign Origin is 403; localhost, the app origin and no Origin pass', async () => {
    expect((await mcp({ headers: { origin: 'https://evil.example' }, body: rpc('ping') })).status).toBe(403);
    expect((await mcp({ headers: { origin: 'http://localhost:5173' }, body: rpc('ping') })).status).toBe(200);
    expect((await mcp({ headers: { origin: APP_ORIGIN }, body: rpc('ping') })).status).toBe(200);
    expect((await mcp({ body: rpc('ping') })).status).toBe(200);
  });

  it('a protocol version this server does not speak is refused', async () => {
    const r = await mcp({ headers: { 'mcp-protocol-version': '2024-11-05' }, body: rpc('ping') });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe(JSON_RPC.CONNECTION_REFUSED);
    expect(r.json.error.message).toContain(MCP_PROTOCOL_VERSION);
    const ok = await mcp({ headers: { 'mcp-protocol-version': MCP_PROTOCOL_VERSION }, body: rpc('ping') });
    expect(ok.status).toBe(200);
  });

  it('malformed JSON is a JSON-RPC parse error, not an HTML page', async () => {
    const r = await mcp({ raw: '{not json' });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe(JSON_RPC.PARSE_ERROR);
  });

  it('a batch and a non-2.0 message are invalid requests; a notification is 202', async () => {
    expect((await mcp({ body: [rpc('ping')] })).json.error.code).toBe(JSON_RPC.INVALID_REQUEST);
    expect((await mcp({ body: { id: 1, method: 'ping' } })).json.error.code).toBe(JSON_RPC.INVALID_REQUEST);
    const n = await mcp({ body: { jsonrpc: '2.0', method: 'notifications/initialized' } });
    expect(n.status).toBe(202);
    expect(n.text).toBe('');
  });

  it('an unknown method is -32601', async () => {
    const r = await mcp({ body: rpc('resources/list') });
    expect(r.json.error.code).toBe(JSON_RPC.METHOD_NOT_FOUND);
  });
});

describe('initialize and tools/list', () => {
  it('initialize pins the protocol and names the server', async () => {
    const r = await mcp({ body: rpc('initialize', { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 't', version: '0' } }) });
    expect(r.status).toBe(200);
    expect(r.json.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(r.json.result.serverInfo.name).toBe('sa21');
    expect(r.json.result.capabilities.tools).toBeDefined();
  });

  it('lists exactly the five tools Genie expects, every one read-only with a strict schema', async () => {
    const r = await mcp({ body: rpc('tools/list') });
    expect(r.status).toBe(200);
    const tools = r.json.result.tools as any[];
    expect(tools.map((t) => t.name)).toEqual(['ask', 'carrier_directory', 'carrier_learnings', 'adjuster_learnings', 'rep_directory']);
    expect(tools).toHaveLength(5);
    for (const t of tools) {
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.destructiveHint).toBe(false);
      expect(t.inputSchema.additionalProperties).toBe(false);
      for (const p of Object.values<any>(t.inputSchema.properties)) {
        expect(p.type).toBe('string');
        expect(p.maxLength).toBeLessThanOrEqual(400);
      }
    }
    expect(tools.find((t) => t.name === 'ask').description).toMatch(/model call/i);
    expect(tools.find((t) => t.name === 'rep_directory').inputSchema.required).toEqual(['q']);
  });
});

describe('tools/call', () => {
  it('ask runs the chat handler AS the session\'s rep and returns text content cut to Genie\'s fields', async () => {
    const r = await callTool('ask', { message: 'Does State Farm pay for ridge cap?' });
    expect(r.status).toBe(200);
    expect(r.json.result.isError).toBe(false);
    expect(r.json.result.content[0].type).toBe('text');
    expect(JSON.parse(r.json.result.content[0].text)).toEqual({ response: 'Susan says: Does State Farm pay for ridge cap?', mode: 'fallback' });
    expect(seen.susanChat[0]).toEqual({ body: { message: 'Does State Farm pay for ridge cap?' }, email: REP.email });
  });

  it('carrier_directory forwards q and limit and projects the rows', async () => {
    const r = await callTool('carrier_directory', { q: 'state' });
    const data = JSON.parse(r.json.result.content[0].text);
    expect(seen.insuranceCompanies[0]).toEqual({ query: { q: 'state', limit: '25' }, email: REP.email });
    expect(data.countReturned).toBe(2);
    expect(Object.keys(data.rows[0])).toEqual(['name', 'state', 'phone', 'email', 'address', 'website', 'category', 'notes']);
    expect(data.rows[0]).not.toHaveProperty('id');
    const capped = await callTool('carrier_directory', { q: 'state', limit: '1' });
    expect(JSON.parse(capped.json.result.content[0].text).countReturned).toBe(1);
    expect(seen.insuranceCompanies[1].query.limit).toBe('1');
  });

  it('carrier_learnings and adjuster_learnings hit the same route with different params', async () => {
    await callTool('carrier_learnings', { insurer: 'State Farm' });
    await callTool('adjuster_learnings', { adjuster: 'Jane Doe', limit: '99' });
    expect(seen.learningGlobal[0].query).toEqual({ insurer: 'State Farm', limit: '20' });
    expect(seen.learningGlobal[1].query).toEqual({ adjuster: 'Jane Doe', limit: '20' }); // clamped
    const r = await callTool('carrier_learnings', { insurer: 'State Farm' });
    const data = JSON.parse(r.json.result.content[0].text);
    expect(data.rows[0]).toEqual({ content: 'They pay for ridge cap.', scope_state: null, scope_insurer: 'State Farm', scope_adjuster: null, helpful_count: 4, updated_at: '2026-09-01' });
    expect(data.rows[0]).not.toHaveProperty('id');
  });

  it('rep_directory narrows the roster by q, drops presence, and never returns the whole list', async () => {
    const r = await callTool('rep_directory', { q: 'FORD' });
    const data = JSON.parse(r.json.result.content[0].text);
    expect(data).toEqual({ totalMatching: 1, countReturned: 1, rows: [{ name: 'Ford Barsi', email: 'ford.barsi@theroofdocs.com', username: 'ford.barsi' }] });
    expect(seen.team[0].email).toBe(REP.email);
    expect(seen.team[0].userId).toBe(REP.id);
    const byDomain = await callTool('rep_directory', { q: 'theroofdocs' });
    expect(JSON.parse(byDomain.json.result.content[0].text).countReturned).toBe(3);
  });

  it('rep_directory without q is refused with -32602, and the roster handler is never run', async () => {
    const r = await callTool('rep_directory', {});
    expect(r.json.error.code).toBe(JSON_RPC.INVALID_PARAMS);
    expect(r.json.error.message).toMatch(/q is required/);
    const short = await callTool('rep_directory', { q: 'f' });
    expect(short.json.error.code).toBe(JSON_RPC.INVALID_PARAMS);
    expect(seen.team).toHaveLength(0);
  });

  it('an unknown tool, a stray argument and a too-long argument are -32602', async () => {
    expect((await callTool('delete_everything', {})).json.error.code).toBe(JSON_RPC.INVALID_PARAMS);
    expect((await callTool('carrier_directory', { q: 'x', evil: 'y' })).json.error.code).toBe(JSON_RPC.INVALID_PARAMS);
    expect((await callTool('carrier_directory', { q: 'x'.repeat(121) })).json.error.code).toBe(JSON_RPC.INVALID_PARAMS);
    expect((await callTool('ask', { message: 'x'.repeat(401) })).json.error.code).toBe(JSON_RPC.INVALID_PARAMS);
    expect((await callTool('ask', { message: 'line one\nline two' })).json.error.code).toBe(JSON_RPC.INVALID_PARAMS);
  });

  it('a handler 4xx/5xx becomes an isError result with no message echoed', async () => {
    const fake = fakeHandlers();
    fake.handlers.learningGlobal = async (_req, res) => { res.status(500).json({ error: 'relation "global_learnings" does not exist at db-host-01' }); };
    fake.handlers.team = async () => { throw new Error('ECONNREFUSED db-host-01:5432'); };
    const ex = createExecutors(fake.handlers);
    const caller = { userId: REP.id, email: REP.email };
    const r = await ex.carrier_learnings({ insurer: 'State Farm' }, caller);
    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/db-host|relation/);
    await expect(ex.rep_directory({ q: 'ford' }, caller)).rejects.toThrow(); // the handler threw; the endpoint layer masks it
  });

  it('an executor that throws is masked by the endpoint', async () => {
    const app = express();
    const fake = fakeHandlers();
    fake.handlers.team = async () => { throw new Error('ECONNREFUSED db-host-01:5432'); };
    app.use('/mcp', createMcpRouter({
      executors: createExecutors(fake.handlers),
      sessionMiddleware: createSessionMiddleware(pool),
      isHomeownerHost: () => false,
      originAllowed: () => false,
    }));
    const s = http.createServer(app);
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(rpc('tools/call', { name: 'rep_directory', arguments: { q: 'ford' } })),
      });
      const json: any = await res.json();
      expect(res.status).toBe(200);
      expect(json.result.isError).toBe(true);
      expect(json.result.content[0].text).not.toMatch(/db-host|ECONNREFUSED/);
    } finally { s.close(); }
  });
});

describe('the bearer is the only credential', () => {
  /** Credentials of every kind an operator might have in the process. None of them may stand in for a person. */
  const PLANTED = {
    SUSAN_API_KEY: 'susan-service-key',
    SUSAN_SERVICE_TOKEN: 's21_susan-service-token',
    SUSAN_OWNER_EMAIL: 'ahmed.mahmoud@theroofdocs.com',
    OWNER_TOKEN: 's21_owner-token',
    OWNER_EMAIL: 'ahmed.mahmoud@theroofdocs.com',
    API_KEY: 'api-key',
    SA21_API_KEY: 'sa21-api-key',
    MCP_API_KEY: 'mcp-api-key',
    GOOGLE_AI_API_KEY: 'gemini-key',
    ADMIN_EMAIL: 'ahmed.mahmoud@theroofdocs.com',
  };
  beforeEach(() => { for (const [k, v] of Object.entries(PLANTED)) process.env[k] = v; });
  afterEach(() => { for (const k of Object.keys(PLANTED)) delete process.env[k]; });

  it('(a) with no bearer, or an invalid one, tools/call is 401 and NO handler runs — whatever credentials exist in process', async () => {
    const attempts = [
      { bearer: null as string | null, headers: {} as Record<string, string> },
      { bearer: 's21_not-a-session', headers: {} },
      { bearer: PLANTED.SUSAN_SERVICE_TOKEN, headers: {} },
      { bearer: PLANTED.OWNER_TOKEN, headers: {} },
      { bearer: PLANTED.API_KEY, headers: {} },
      { bearer: null, headers: { 'x-api-key': PLANTED.API_KEY } },
      { bearer: null, headers: { 'x-user-email': PLANTED.OWNER_EMAIL } },
      { bearer: 's21_not-a-session', headers: { 'x-user-email': PLANTED.OWNER_EMAIL } },
    ];
    for (const tool of ['ask', 'carrier_directory', 'carrier_learnings', 'adjuster_learnings', 'rep_directory']) {
      const args = { ask: { message: 'hello there' }, carrier_directory: { q: 'state' }, carrier_learnings: { insurer: 'State Farm' }, adjuster_learnings: { adjuster: 'Jane Doe' }, rep_directory: { q: 'ford' } }[tool];
      for (const attempt of attempts) {
        const r = await mcp({ bearer: attempt.bearer, headers: attempt.headers, body: rpc('tools/call', { name: tool, arguments: args }) });
        expect(r.status, `${tool} with ${JSON.stringify(attempt)}`).toBe(401);
        expect(r.headers.get('www-authenticate')).toMatch(/^Bearer /);
        expect(r.json?.result).toBeUndefined();
      }
    }
    for (const [name, calls] of Object.entries(seen)) expect(calls, `${name} handler must not have run`).toHaveLength(0);
  });

  it('(b) a valid bearer for person A resolves to A on the shim request — not a default, an admin, or person B', async () => {
    const a = await callTool('rep_directory', { q: 'ford' });
    expect(a.status).toBe(200);
    expect(seen.team[0]).toMatchObject({ email: REP.email, userId: REP.id });

    const b = await mcp({ bearer: TOKEN_B, body: rpc('tools/call', { name: 'rep_directory', arguments: { q: 'ford' } }) });
    expect(b.status).toBe(200);
    expect(seen.team[1]).toMatchObject({ email: REP_B.email, userId: REP_B.id });

    // Person B's bearer plus person A's (or the owner's) legacy header still reads as B: the header never decides.
    const spoof = await mcp({ bearer: TOKEN_B, headers: { 'x-user-email': PLANTED.OWNER_EMAIL }, body: rpc('tools/call', { name: 'ask', arguments: { message: 'who am i' } }) });
    expect(spoof.status).toBe(200);
    expect(seen.susanChat[0].email).toBe(REP_B.email);

    for (const call of [...seen.team, ...seen.susanChat]) {
      expect(call.email).not.toBe('demo@roofer.com');
      expect(call.email).not.toBe(PLANTED.OWNER_EMAIL);
      expect(call.email).not.toBe(PLANTED.ADMIN_EMAIL);
    }
  });

  it('(c) no code path in server/mcp/* reads process.env, or any credential-shaped name', () => {
    const dir = path.resolve(__dirname, '../../server/mcp');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.sort()).toEqual(['executors.ts', 'server.ts', 'shim.ts']);
    for (const f of files) {
      const src = readFileSync(path.join(dir, f), 'utf8');
      expect(src, `${f} must not read process.env`).not.toMatch(/process\.env/);
      expect(src, `${f} must not reach for an API key or service token`).not.toMatch(/API_KEY|SERVICE_TOKEN|OWNER_TOKEN|apiKey|x-api-key|x-riq-api-key/i);
      // The only identity source is the session middleware's result.
      expect(src).not.toMatch(/mintSession|resolveSession\(/);
    }
    // And server.ts takes identity from req.session set by the injected middleware, nowhere else.
    const serverSrc = readFileSync(path.join(dir, 'server.ts'), 'utf8');
    expect(serverSrc).toMatch(/\(req as SessionRequest\)\.session/);
    expect(serverSrc).toMatch(/authMechanism !== 'session'/);
  });
});

describe('units', () => {
  it('validateArgs trims, collapses whitespace and drops empty optionals', () => {
    expect(validateArgs('carrier_directory', { q: '  State   Farm ', limit: '' })).toEqual({ ok: true, args: { q: 'State Farm' } });
    expect(validateArgs('carrier_directory', { q: 'x', limit: 'abc' })).toMatchObject({ ok: false });
    expect(validateArgs('ask', 'not an object')).toMatchObject({ ok: false });
    expect(MCP_TOOL_NAMES).toHaveLength(5);
  });

  it('the shim carries the session identity and captures json/send/end', async () => {
    const id = { userId: REP.id, email: REP.email };
    const j = await runHandler(async (req, res) => { res.status(201).json({ who: req.header('x-user-email'), id: (req as any).userId }); }, { method: 'GET', identity: id });
    expect(j).toEqual({ status: 201, body: { who: REP.email, id: REP.id } });
    const s = await runHandler(async (_req, res) => { res.send('plain'); }, { method: 'GET', identity: id });
    expect(s).toEqual({ status: 200, body: 'plain' });
    await expect(runHandler(async () => { /* never answers */ }, { method: 'GET', identity: id })).rejects.toThrow(/without answering/);
  });

  it('a huge result is truncated with a marker', async () => {
    const fake = fakeHandlers();
    fake.handlers.learningGlobal = async (_req, res) => {
      res.json({ learnings: Array.from({ length: 20 }, (_, i) => ({ content: 'x'.repeat(30_000), helpful_count: i })) });
    };
    const app = express();
    app.use('/mcp', createMcpRouter({
      executors: createExecutors(fake.handlers),
      sessionMiddleware: createSessionMiddleware(pool),
      isHomeownerHost: () => false,
      originAllowed: () => false,
    }));
    const s = http.createServer(app);
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(rpc('tools/call', { name: 'carrier_learnings', arguments: { insurer: 'State Farm' } })),
      });
      const json: any = await res.json();
      const text: string = json.result.content[0].text;
      expect(text.length).toBeLessThan(MCP_RESULT_MAX_CHARS + 200);
      expect(text).toMatch(/\[TRUNCATED: result exceeded 400000 characters/);
    } finally { s.close(); }
  });
});
