/**
 * Memory observability.
 *
 * Two things it does:
 *
 *   1. Heartbeat: every `heartbeatMs` (default 60s) log rss/heapUsed/heapTotal
 *      so we can see the memory profile over time in Railway logs. Tag the
 *      line with `[mem]` so it greps cleanly.
 *
 *   2. Per-request delta: middleware that snapshots heapUsed at request
 *      start, logs the delta + route at response end. Only logs when the
 *      delta or duration is interesting (>10 MB or >1000 ms) so we don't
 *      drown in noise.
 *
 * Context for why this exists: Susan 21 has been crash-looping with Railway
 * SIGKILL and we had no visibility into which cron/route caused the spike.
 * Keep this on permanently — cheap to run, invaluable when the container
 * next misbehaves. See `docs/PRODUCTION_STABILITY_HANDOFF.md`.
 */
import type { Request, Response, NextFunction } from 'express';

const MB = 1024 * 1024;

function fmt(bytes: number): string {
  return `${Math.round(bytes / MB)}MB`;
}

export function startMemoryHeartbeat(heartbeatMs = 60_000): NodeJS.Timeout {
  const timer = setInterval(() => {
    const u = process.memoryUsage();
    console.log(
      `[mem] heartbeat rss=${fmt(u.rss)} heap=${fmt(u.heapUsed)}/${fmt(u.heapTotal)} ext=${fmt(u.external)} arrays=${fmt(u.arrayBuffers)}`,
    );
  }, heartbeatMs);
  // Don't block process exit on the interval.
  timer.unref();
  return timer;
}

export function memoryDeltaMiddleware(
  opts: { minDeltaMB?: number; minDurationMs?: number } = {},
) {
  const minDeltaBytes = (opts.minDeltaMB ?? 10) * MB;
  const minDurationMs = opts.minDurationMs ?? 1000;
  return (req: Request, res: Response, next: NextFunction): void => {
    const startHeap = process.memoryUsage().heapUsed;
    const startRss = process.memoryUsage().rss;
    const startAt = Date.now();
    res.on('finish', () => {
      const endHeap = process.memoryUsage().heapUsed;
      const endRss = process.memoryUsage().rss;
      const dHeap = endHeap - startHeap;
      const dRss = endRss - startRss;
      const dur = Date.now() - startAt;
      if (Math.abs(dHeap) >= minDeltaBytes || Math.abs(dRss) >= minDeltaBytes || dur >= minDurationMs) {
        // route is Express's matched route path or falls back to the raw URL
        const route = (req.route && req.route.path) || req.baseUrl + (req.path || '');
        console.log(
          `[mem] req ${req.method} ${route} dur=${dur}ms dheap=${fmt(dHeap)} drss=${fmt(dRss)} heap_end=${fmt(endHeap)} rss_end=${fmt(endRss)} status=${res.statusCode}`,
        );
      }
    });
    next();
  };
}
