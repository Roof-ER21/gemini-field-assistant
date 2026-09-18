/**
 * Agent tokens (server/auth/agentTokens.ts + server/routes/agentTokenRoutes.ts)
 * without a database: the parts whose correctness does not live in SQL.
 * Ownership, revocation and expiry are SQL, so they are proven against a real
 * Postgres in agent-tokens.pg.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import {
  AGENT_READ_SCOPE,
  AGENT_READ_TOOLS,
  AGENT_TOKEN_PATTERN,
  AGENT_TOKEN_PREFIX,
  agentMayCallTool,
  hashAgentToken,
  isAgentTokenShape,
  mintAgentToken,
  parseAgentTokenRequest,
  resolveAgentToken,
} from '../../server/auth/agentTokens';
import { clearSessionCache, createSessionMiddleware } from '../../server/auth/session';
import { createAgentTokenRouter } from '../../server/routes/agentTokenRoutes';
import { MCP_TOOLS } from '../../server/mcp/server';

const REP = { id: '11111111-1111-1111-1111-111111111111', email: 'real.rep@theroofdocs.com' };
const SESSION = 's21_session-token-for-the-agent-suite';

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Genie 21',
    token_hint: 'wxyz',
    scopes: [AGENT_READ_SCOPE],
    created_at: new Date('2026-09-18T15:00:00Z'),
    last_used_at: null,
    expires_at: new Date(Date.now() + 90 * 86_400_000),
    revoked_at: null,
    ...overrides,
  };
}

/** Records every statement; answers the session lookup for SESSION only. */
function recordingPool() {
  const statements: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (/FROM app_sessions/.test(sql)) {
        const hit = params[0] === crypto.createHash('sha256').update(SESSION).digest('hex');
        return hit
          ? { rows: [{ user_id: REP.id, email: REP.email, expires_at: new Date(Date.now() + 60_000) }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (/INSERT INTO agent_tokens/.test(sql)) return { rows: [tokenRow({ token_hint: String(params[3]) })], rowCount: 1 };
      if (/FROM agent_tokens/.test(sql)) return { rows: [tokenRow()], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
  } as any;
  return { pool, statements };
}

async function serve(app: express.Express) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

function appWith(pool: any) {
  const app = express();
  app.use(express.json());
  app.use(createSessionMiddleware(pool));
  app.use('/api/agent-tokens', createAgentTokenRouter(pool));
  app.get('/api/whoami', (req: any, res) => res.json({ mechanism: req.authMechanism, email: req.header('x-user-email') ?? null }));
  return app;
}

afterEach(() => {
  clearSessionCache();
  delete process.env.SA21_REQUIRE_SESSION;
});

describe('agent token shape', () => {
  it('is s21a_ + 43 base64url characters, distinct from an s21_ session token', async () => {
    const { pool } = recordingPool();
    const { token } = await mintAgentToken(pool, { userId: REP.id, name: 'Genie 21', days: 90 });
    expect(token.startsWith(AGENT_TOKEN_PREFIX)).toBe(true);
    expect(token).toMatch(AGENT_TOKEN_PATTERN);
    expect(isAgentTokenShape(token)).toBe(true);
    expect(isAgentTokenShape(SESSION)).toBe(false);
    expect(isAgentTokenShape(`${token}x`)).toBe(false);
    expect(isAgentTokenShape('s21a_short')).toBe(false);
  });

  it('never looks up a bearer that is not token-shaped', async () => {
    const { pool, statements } = recordingPool();
    await expect(resolveAgentToken(pool, 's21a_not-a-real-token')).resolves.toBeNull();
    await expect(resolveAgentToken(pool, SESSION)).resolves.toBeNull();
    expect(statements).toHaveLength(0);
  });
});

describe('hash at rest', () => {
  it('writes the sha256 and a 4-character hint, never the token', async () => {
    const { pool, statements } = recordingPool();
    const { token, row } = await mintAgentToken(pool, { userId: REP.id, name: 'Genie 21', days: 90 });
    const insert = statements.find((s) => /INSERT INTO agent_tokens/.test(s.sql))!;
    const written = JSON.stringify(insert.params);
    expect(written).not.toContain(token);
    expect(written).not.toContain(token.slice(AGENT_TOKEN_PREFIX.length, AGENT_TOKEN_PREFIX.length + 20));
    expect(insert.params).toContain(hashAgentToken(token));
    expect(insert.params[3]).toBe(token.slice(-4));
    expect(row.hint).toBe(token.slice(-4));
  });

  it('asks for exactly the token hash when resolving', async () => {
    const { pool, statements } = recordingPool();
    const { token } = await mintAgentToken(pool, { userId: REP.id, name: 'x', days: 1 });
    statements.length = 0;
    await resolveAgentToken(pool, token);
    expect(statements[0]!.params).toEqual([hashAgentToken(token)]);
    expect(statements[0]!.sql).toMatch(/revoked_at IS NULL/);
    expect(statements[0]!.sql).toMatch(/expires_at > NOW\(\)/);
  });
});

describe('create request', () => {
  it('needs a name and bounds the expiry', () => {
    expect(parseAgentTokenRequest({ name: '  Genie   21 ' })).toEqual({ ok: true, name: 'Genie 21', days: 90 });
    expect(parseAgentTokenRequest({ name: 'x', expiresInDays: 365 })).toEqual({ ok: true, name: 'x', days: 365 });
    expect(parseAgentTokenRequest({})).toMatchObject({ ok: false });
    expect(parseAgentTokenRequest({ name: 'x'.repeat(81) })).toMatchObject({ ok: false });
    for (const bad of [0, 366, 1.5, 'never', -1]) {
      expect(parseAgentTokenRequest({ name: 'x', expiresInDays: bad })).toMatchObject({ ok: false });
    }
  });
});

describe('the read-only scope guard', () => {
  const read = (name: string) => ({ name, annotations: { readOnlyHint: true } });

  it('allows exactly the five read tools the MCP offers today', () => {
    const principal = { scopes: [AGENT_READ_SCOPE] };
    expect(MCP_TOOLS.filter((tool) => agentMayCallTool(principal, tool)).map((tool) => tool.name)).toEqual([...AGENT_READ_TOOLS]);
  });

  it('refuses a tool that is not on the allowlist, even one marked read-only', () => {
    expect(agentMayCallTool({ scopes: [AGENT_READ_SCOPE] }, read('send_email'))).toBe(false);
    expect(agentMayCallTool({ scopes: [AGENT_READ_SCOPE] }, read('create_job'))).toBe(false);
  });

  it('refuses an allowlisted name the catalog does not mark read-only (a future write under an old name)', () => {
    expect(agentMayCallTool({ scopes: [AGENT_READ_SCOPE] }, { name: 'ask', annotations: { readOnlyHint: false } as any })).toBe(false);
    expect(agentMayCallTool({ scopes: [AGENT_READ_SCOPE] }, { name: 'ask' })).toBe(false);
  });

  it('refuses everything without the mcp:read scope, and an unknown tool', () => {
    expect(agentMayCallTool({ scopes: [] }, read('ask'))).toBe(false);
    expect(agentMayCallTool({ scopes: ['mcp:write'] }, read('ask'))).toBe(false);
    expect(agentMayCallTool({ scopes: [AGENT_READ_SCOPE] }, undefined)).toBe(false);
  });
});

describe('an agent token is never a session', () => {
  it('gets no identity on /api, and Stage 2 treats it as no credential at all', async () => {
    const { pool, statements } = recordingPool();
    const agentToken = `${AGENT_TOKEN_PREFIX}${'A'.repeat(43)}`;
    const { base, close } = await serve(appWith(pool));
    try {
      const stage1 = await fetch(`${base}/api/whoami`, { headers: { authorization: `Bearer ${agentToken}` } });
      expect(await stage1.json()).toEqual({ mechanism: 'none', email: null });
      // session.ts only ever consults app_sessions.
      expect(statements.every((s) => !/agent_tokens/.test(s.sql))).toBe(true);
      process.env.SA21_REQUIRE_SESSION = 'true';
      const stage2 = await fetch(`${base}/api/whoami`, { headers: { authorization: `Bearer ${agentToken}` } });
      expect(stage2.status).toBe(401);
    } finally {
      await close();
    }
  });
});

describe('Settings → Connected agents routes', () => {
  it('shows the token once: in the create response, never in the list', async () => {
    const { pool } = recordingPool();
    const { base, close } = await serve(appWith(pool));
    try {
      const created = await fetch(`${base}/api/agent-tokens`, {
        method: 'POST',
        headers: { authorization: `Bearer ${SESSION}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Genie 21' }),
      });
      expect(created.status).toBe(201);
      const body = await created.json();
      expect(body.token).toMatch(AGENT_TOKEN_PATTERN);
      expect(body.readOnly).toBe(true);
      expect(body.endpoint).toMatch(/\/mcp$/);
      const list = await fetch(`${base}/api/agent-tokens`, { headers: { authorization: `Bearer ${SESSION}` } });
      const listed = await list.text();
      expect(list.status).toBe(200);
      expect(listed).not.toContain(body.token);
      expect(listed).not.toContain(hashAgentToken(body.token));
      expect(listed).not.toContain('token_hash');
      expect(JSON.parse(listed).tools).toEqual([...AGENT_READ_TOOLS]);
    } finally {
      await close();
    }
  });

  it('refuses the legacy header and an agent token: only a real session manages tokens', async () => {
    const { pool, statements } = recordingPool();
    const { base, close } = await serve(appWith(pool));
    try {
      for (const headers of [
        { 'x-user-email': REP.email },
        { authorization: `Bearer ${AGENT_TOKEN_PREFIX}${'B'.repeat(43)}` },
        {},
      ]) {
        for (const method of ['GET', 'POST', 'DELETE']) {
          const path = method === 'DELETE' ? '/api/agent-tokens/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' : '/api/agent-tokens';
          const res = await fetch(`${base}${path}`, {
            method,
            headers: { ...headers, 'content-type': 'application/json' },
            ...(method === 'POST' ? { body: JSON.stringify({ name: 'x' }) } : {}),
          });
          expect(res.status, `${method} with ${Object.keys(headers).join(',') || 'nothing'}`).toBe(401);
        }
      }
      expect(statements.some((s) => /agent_tokens/.test(s.sql))).toBe(false);
    } finally {
      await close();
    }
  });
});
