/**
 * Request-ID middleware
 * ---------------------
 * Every request gets a correlation id: an inbound `x-request-id` is honored
 * (so a client — the rep companion, a test harness, another service — can
 * stitch its own trail to ours), otherwise one is minted. The id is echoed
 * back as a response header and stamped on `req.requestId` for log lines and
 * GlitchTip reports.
 *
 * Inbound ids are only trusted when they look like an id — anything outside
 * a safe charset/length is replaced, not sanitized, so log lines can never
 * carry injected content.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('x-request-id');
  const id = inbound && SAFE_ID.test(inbound) ? inbound : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}
