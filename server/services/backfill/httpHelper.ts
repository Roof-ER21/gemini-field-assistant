/**
 * httpHelper — fetch-like HTTP/HTTPS client that works reliably for
 * slow/IPv6-flaky endpoints (NCEI, IEM, etc.).
 *
 * Why: Node's built-in fetch has a 10s connect timeout and Happy Eyeballs
 * AAAA/A probing that times out on NCEI NOAA.gov from some ISPs. This
 * helper forces IPv4 and uses 60s connect timeout.
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  body: NodeJS.ReadableStream;
}

export interface FetchLikeOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;           // total request timeout
  connectTimeoutMs?: number;    // connection-only timeout
  maxRedirects?: number;
}

export async function slowFetch(
  url: string,
  opts: FetchLikeOptions = {},
): Promise<FetchLikeResponse> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 180_000,          // 3 min total
    connectTimeoutMs = 60_000,    // 1 min connect
    maxRedirects = 5,
  } = opts;

  let redirects = 0;
  let currentUrl = url;

  while (true) {
    const u = new URL(currentUrl);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;

    const response = await new Promise<FetchLikeResponse>((resolve, reject) => {
      const req = lib.request(
        {
          method,
          hostname: u.hostname,
          port: u.port || (isHttps ? 443 : 80),
          path: u.pathname + u.search,
          headers,
          timeout: connectTimeoutMs,
          family: 4,       // IPv4 only — avoids IPv6 connect timeouts
        },
        (res) => {
          // Handle redirects
          if (
            res.statusCode && res.statusCode >= 300 && res.statusCode < 400 &&
            res.headers.location && redirects < maxRedirects
          ) {
            redirects++;
            currentUrl = new URL(res.headers.location, currentUrl).toString();
            res.resume();
            // Signal caller to loop via rejection with special marker
            reject({ __redirect: true });
            return;
          }

          const responseHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            responseHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : (v ?? '');
          }

          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(Buffer.from(c)));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            resolve({
              ok: !!(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
              status: res.statusCode || 0,
              statusText: res.statusMessage || '',
              headers: responseHeaders,
              text: async () => buf.toString('utf-8'),
              arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
              body: res as any,
            });
          });
          res.on('error', (e) => reject(e));
        },
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
      });

      req.on('error', (e) => reject(e));

      if (body) req.write(body);
      req.end();
    }).catch((e: any) => {
      if (e?.__redirect) return null;
      throw e;
    });

    if (response) return response;
    // Redirect — loop with new URL
  }
}

/**
 * Download a binary file to a buffer with reliable IPv4 transport.
 */
export async function downloadBuffer(url: string, opts: FetchLikeOptions = {}): Promise<Buffer> {
  const resp = await slowFetch(url, opts);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} for ${url}`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}
