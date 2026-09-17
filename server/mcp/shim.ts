/**
 * The Express request/response shim the MCP executors run a route handler
 * through, in-process. No loopback fetch: the handler gets a synthetic
 * `req` carrying the SAME identity the session middleware established for the
 * MCP call (`x-user-email` rewritten to the session's address, plus the
 * `userId` / `userEmail` fields `authMiddleware` sets for /api/team), reads
 * `req.query` or `req.body`, and answers through `res.json` / `res.send`,
 * which the shim captures.
 *
 * Kept free of any DB or handler import so test/mcp can exercise it with fake
 * handlers.
 */
import type { Request, Response } from 'express';

export type Handler = (req: Request, res: Response) => unknown;

export interface Captured { status: number; body: unknown }

/** Who the in-process call is made as. Comes from the resolved session, never from a header the client sent. */
export interface ShimIdentity {
  userId: string;
  email: string;
}

export interface ShimRequest {
  method: 'GET' | 'POST';
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  identity: ShimIdentity;
}

/**
 * Run an Express handler against a synthetic request and capture what it
 * would have sent. Implements only what the five handlers touch; anything
 * else throws, which the executor turns into an isError result.
 */
export async function runHandler(handler: Handler, input: ShimRequest): Promise<Captured> {
  return new Promise<Captured>((resolve, reject) => {
    let status = 200;
    let settled = false;
    let answered = false;
    const done = (c: Captured) => { answered = true; if (!settled) { settled = true; resolve(c); } };
    const fail = (err: unknown) => { answered = true; if (!settled) { settled = true; reject(err); } };
    const res = {
      status(code: number) { status = code; return res; },
      setHeader() { return res; },
      set() { return res; },
      type() { return res; },
      json(body: unknown) { done({ status, body }); return res; },
      send(body: unknown) { done({ status, body }); return res; },
      end() { done({ status, body: null }); return res; },
      headersSent: false,
    };
    const headers: Record<string, string> = {
      'x-user-email': input.identity.email,
      accept: 'application/json',
    };
    const header = (name: string) => headers[String(name).toLowerCase()];
    const req = {
      method: input.method,
      path: '/',
      query: input.query ?? {},
      params: {},
      body: input.body,
      headers,
      header,
      get: header,
      // What server/index.ts's authMiddleware would have set for /api/team.
      userId: input.identity.userId,
      userEmail: input.identity.email,
      authMechanism: 'session',
      ip: '127.0.0.1',
    };
    try {
      Promise.resolve(handler(req as unknown as Request, res as unknown as Response))
        .then(() => { if (!answered) fail(new Error('handler finished without answering')); })
        .catch(fail);
    } catch (err) {
      fail(err);
    }
  });
}
