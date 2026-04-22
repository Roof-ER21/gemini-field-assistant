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
export async function slowFetch(url, opts = {}) {
    const { method = 'GET', headers = {}, body, timeoutMs = 300_000, // 5 min total (NCEI can be slow)
    connectTimeoutMs = 90_000, // 1.5 min connect (IPv4 handshake)
    maxRedirects = 5, } = opts;
    let redirects = 0;
    let currentUrl = url;
    while (true) {
        const u = new URL(currentUrl);
        const isHttps = u.protocol === 'https:';
        const lib = isHttps ? https : http;
        const response = await new Promise((resolve, reject) => {
            const req = lib.request({
                method,
                hostname: u.hostname,
                port: u.port || (isHttps ? 443 : 80),
                path: u.pathname + u.search,
                headers,
                timeout: connectTimeoutMs,
                family: 4, // IPv4 only — avoids IPv6 connect timeouts
            }, (res) => {
                // Handle redirects
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 &&
                    res.headers.location && redirects < maxRedirects) {
                    redirects++;
                    currentUrl = new URL(res.headers.location, currentUrl).toString();
                    res.resume();
                    // Signal caller to loop via rejection with special marker
                    reject({ __redirect: true });
                    return;
                }
                const responseHeaders = {};
                for (const [k, v] of Object.entries(res.headers)) {
                    responseHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : (v ?? '');
                }
                const chunks = [];
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
                        body: res,
                    });
                });
                res.on('error', (e) => reject(e));
            });
            req.setTimeout(timeoutMs, () => {
                req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
            });
            req.on('error', (e) => reject(e));
            if (body)
                req.write(body);
            req.end();
        }).catch((e) => {
            if (e?.__redirect)
                return null;
            throw e;
        });
        if (response)
            return response;
        // Redirect — loop with new URL
    }
}
/**
 * Download a binary file to a buffer with reliable IPv4 transport.
 */
export async function downloadBuffer(url, opts = {}) {
    const resp = await slowFetch(url, opts);
    if (!resp.ok)
        throw new Error(`HTTP ${resp.status} ${resp.statusText} for ${url}`);
    const ab = await resp.arrayBuffer();
    return Buffer.from(ab);
}
