/**
 * Agent tokens against a REAL Postgres: ownership, revocation and expiry live
 * in SQL WHERE clauses, and a stub pool would only prove itself. This file
 * boots a throwaway cluster (initdb into a temp dir, its own port, trust auth,
 * deleted afterwards) — it never touches a configured database.
 *
 * PostgreSQL binaries are found via SA21_TEST_PG_BIN, Homebrew, or the Ubuntu
 * layout GitHub runners ship. Without them the suite is skipped and SAYS so.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import net from 'net';
import pg from 'pg';
import {
  AGENT_READ_SCOPE,
  ensureAgentTokenTables,
  hashAgentToken,
  listAgentTokens,
  mintAgentToken,
  recordAgentToolUse,
  resolveAgentToken,
  revokeAgentToken,
} from '../../server/auth/agentTokens';

function findPgBin(): string | null {
  const candidates = [process.env.SA21_TEST_PG_BIN, '/opt/homebrew/opt/postgresql@16/bin', '/usr/local/opt/postgresql@16/bin'];
  try {
    for (const version of readdirSync('/usr/lib/postgresql').sort().reverse()) candidates.push(`/usr/lib/postgresql/${version}/bin`);
  } catch { /* not Ubuntu */ }
  return candidates.find((dir) => dir && existsSync(path.join(dir, 'initdb')) && existsSync(path.join(dir, 'postgres'))) ?? null;
}

const PG_BIN = findPgBin();
if (!PG_BIN) console.warn('[agent-tokens.pg] SKIPPED: no PostgreSQL binaries (set SA21_TEST_PG_BIN). Ownership/revoke/expiry are NOT proven in this run.');

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

describe.skipIf(!PG_BIN)('agent tokens on a real Postgres', () => {
  let dir = '';
  let postgres: ChildProcess | null = null;
  let pool: pg.Pool;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'sa21-agent-pg-'));
    execFileSync(path.join(PG_BIN!, 'initdb'), ['-D', dir, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'], { stdio: 'ignore' });
    const port = await freePort();
    postgres = spawn(path.join(PG_BIN!, 'postgres'), ['-D', dir, '-p', String(port), '-h', '127.0.0.1', '-k', dir], { stdio: 'ignore' });
    pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', max: 4 });
    for (let attempt = 0; ; attempt++) {
      try { await pool.query('SELECT 1'); break; } catch (err) {
        if (attempt > 100) throw err;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    // The slice of sa21's users table these queries join.
    await pool.query(`CREATE TABLE users (id UUID PRIMARY KEY, email TEXT NOT NULL)`);
    await pool.query(`INSERT INTO users (id, email) VALUES ($1, 'Alice@TheRoofDocs.com'), ($2, 'bob@theroofdocs.com')`, [ALICE, BOB]);
    await ensureAgentTokenTables(pool);
    await ensureAgentTokenTables(pool); // idempotent on every boot
  }, 60_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    if (postgres) {
      postgres.kill('SIGINT');
      await new Promise((resolve) => postgres!.once('exit', resolve));
    }
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('stores only the hash: no column anywhere holds the token', async () => {
    const { token } = await mintAgentToken(pool, { userId: ALICE, name: 'Genie 21', days: 90 });
    const rows = await pool.query(`SELECT to_jsonb(t) AS row FROM agent_tokens t WHERE token_hash = $1`, [hashAgentToken(token)]);
    expect(rows.rows).toHaveLength(1);
    const stored = JSON.stringify(rows.rows[0].row);
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(token.slice(5, 30));
    expect(rows.rows[0].row.token_hint).toBe(token.slice(-4));
    expect(rows.rows[0].row.scopes).toEqual([AGENT_READ_SCOPE]);
  });

  it('resolves a live token to its owner, lower-cased, with mcp:read', async () => {
    const { token, row } = await mintAgentToken(pool, { userId: ALICE, name: 'resolve me', days: 30 });
    await expect(resolveAgentToken(pool, token)).resolves.toEqual({
      tokenId: row.id, userId: ALICE, email: 'alice@theroofdocs.com', scopes: [AGENT_READ_SCOPE],
    });
  });

  it("a user can neither see nor revoke another user's token", async () => {
    const { token, row } = await mintAgentToken(pool, { userId: ALICE, name: "alice's agent", days: 30 });
    const bobs = await listAgentTokens(pool, BOB);
    expect(bobs.map((t) => t.id)).not.toContain(row.id);
    await expect(revokeAgentToken(pool, { userId: BOB, id: row.id })).resolves.toBe('not_found');
    await expect(resolveAgentToken(pool, token)).resolves.not.toBeNull();
    expect((await listAgentTokens(pool, ALICE)).map((t) => t.id)).toContain(row.id);
  });

  it('a revoked token is refused at once, and leaves the list', async () => {
    const { token, row } = await mintAgentToken(pool, { userId: ALICE, name: 'revoke me', days: 30 });
    await expect(revokeAgentToken(pool, { userId: ALICE, id: row.id })).resolves.toBe('revoked');
    await expect(resolveAgentToken(pool, token)).resolves.toBeNull();
    await expect(revokeAgentToken(pool, { userId: ALICE, id: row.id })).resolves.toBe('already_revoked');
    expect((await listAgentTokens(pool, ALICE)).map((t) => t.id)).not.toContain(row.id);
  });

  it('an expired token is refused, and listed as expired until revoked', async () => {
    const { token, row } = await mintAgentToken(pool, { userId: ALICE, name: 'expire me', days: 1 });
    await pool.query(`UPDATE agent_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1`, [row.id]);
    await expect(resolveAgentToken(pool, token)).resolves.toBeNull();
    const listed = (await listAgentTokens(pool, ALICE)).find((t) => t.id === row.id);
    expect(listed?.expired).toBe(true);
  });

  it("a deleted user's tokens stop resolving (cascade)", async () => {
    const CAROL = '33333333-3333-3333-3333-333333333333';
    await pool.query(`INSERT INTO users (id, email) VALUES ($1, 'carol@theroofdocs.com')`, [CAROL]);
    const { token } = await mintAgentToken(pool, { userId: CAROL, name: 'carol', days: 30 });
    await pool.query(`DELETE FROM users WHERE id = $1`, [CAROL]);
    await expect(resolveAgentToken(pool, token)).resolves.toBeNull();
  });

  it('writes one audit row per use: argument keys, never values', async () => {
    const { row } = await mintAgentToken(pool, { userId: ALICE, name: 'audited', days: 30 });
    await recordAgentToolUse(pool, { tokenId: row.id, userId: ALICE, tool: 'carrier_directory', argumentKeys: ['q'], outcome: 'ok', durationMs: 12 });
    await recordAgentToolUse(pool, { tokenId: row.id, userId: ALICE, tool: 'send_email', argumentKeys: ['to'], outcome: 'refused', error: 'outside the agent token scope', durationMs: 0 });
    const audit = await pool.query(`SELECT tool, argument_keys, outcome FROM agent_token_audit WHERE token_id = $1 ORDER BY created_at`, [row.id]);
    expect(audit.rows).toEqual([
      { tool: 'carrier_directory', argument_keys: ['q'], outcome: 'ok' },
      { tool: 'send_email', argument_keys: ['to'], outcome: 'refused' },
    ]);
  });
});
