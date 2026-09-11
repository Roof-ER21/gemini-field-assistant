/**
 * CC24 is open to Ahmed only (2026-09-11). These pin that a rep who is not on
 * the list can neither start nor finish a connection, never sees the button,
 * and never has a stored connection used — and that Roof HR is untouched.
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { appAllowsEmail, findConnectedApp } from '../../server/services/connectedApps';
import { resolveApp } from '../../server/services/roofhrAgentTools';
import { createConnectRoutes } from '../../server/routes/connectRoutes';

const CC24 = findConnectedApp('cc24')!;
const ROOFHR = findConnectedApp('roofhr')!;
const AHMED = 'ahmed.mahmoud@theroofdocs.com';
const FORD = 'ford.barsi@theroofdocs.com';

afterEach(() => { delete process.env.CONNECT_ALLOWED_EMAILS_CC24; });

describe('who may connect CC24', () => {
  it('defaults to Ahmed only when the env var is unset (fails closed)', () => {
    expect(appAllowsEmail(CC24, AHMED)).toBe(true);
    expect(appAllowsEmail(CC24, FORD)).toBe(false);
    expect(appAllowsEmail(CC24, null)).toBe(false);
    expect(appAllowsEmail(CC24, '')).toBe(false);
  });

  it('matches case and whitespace insensitively', () => {
    expect(appAllowsEmail(CC24, '  Ahmed.Mahmoud@TheRoofDocs.com ')).toBe(true);
  });

  it('lets the env var replace the default list, or open it with *', () => {
    process.env.CONNECT_ALLOWED_EMAILS_CC24 = `${FORD}`;
    expect(appAllowsEmail(CC24, FORD)).toBe(true);
    expect(appAllowsEmail(CC24, AHMED)).toBe(false);
    process.env.CONNECT_ALLOWED_EMAILS_CC24 = '*';
    expect(appAllowsEmail(CC24, FORD)).toBe(true);
  });

  it('leaves Roof HR open to everyone', () => {
    expect(appAllowsEmail(ROOFHR, FORD)).toBe(true);
    expect(appAllowsEmail(ROOFHR, null)).toBe(true);
  });

  it('never uses a connection or offers a link to someone not allowed', async () => {
    // A pool that throws proves the refusal happens before any stored token is read.
    const pool = { query: () => { throw new Error('must not touch the database'); } } as never;
    const result = await resolveApp(pool, { userId: 'u-ford', hasVerifiedSession: true, connectUrl: 'https://x', allowed: false }, CC24);
    expect(result.state).toBe('not_allowed');
    expect(result.promptBlock).not.toContain('https://x');
    expect(result.promptBlock).toMatch(/do not offer a way to connect/);
  });
});

describe('the connect routes, as a signed-in rep', () => {
  const servers: http.Server[] = [];
  afterAll(() => { for (const s of servers) s.close(); });

  async function as(email: string) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as any).session = { userId: `u-${email}`, email }; next(); });
    app.use('/api/connect', createConnectRoutes({ query: async () => ({ rows: [] }) } as never));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise((r) => server.once('listening', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/connect`;
  }

  it('refuses to start or complete a CC24 connection for Ford', async () => {
    const base = await as(FORD);
    const start = await fetch(`${base}/cc24/start`);
    expect(start.status).toBe(403);
    expect((await start.json()).code).toBe('APP_NOT_OPEN');
    const complete = await fetch(`${base}/cc24/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'c', state: 's' }),
    });
    expect(complete.status).toBe(403);
  });

  it('does not refuse Ahmed on the allowlist (any refusal is about keys, not him)', async () => {
    const base = await as(AHMED);
    const start = await fetch(`${base}/cc24/start`);
    expect(start.status).not.toBe(403);
  });

  it('reports CC24 as not configured to Ford, so no button is shown', async () => {
    const base = await as(FORD);
    const res = await fetch(`${base}/status`);
    const body = await res.json();
    const cc24 = body.apps.find((a: { app: string }) => a.app === 'cc24');
    expect(cc24.configured).toBe(false);
  });
});
