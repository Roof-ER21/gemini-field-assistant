import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiProxyRouter } from '../../server/routes/geminiProxyRoutes';
import { formatNumber } from '../../utils/formatNumber';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function request(options: { session?: boolean; operation?: string; upstream?: Response; body?: unknown } = {}) {
  vi.stubEnv('GOOGLE_AI_API_KEY', 'test-server-only-key');
  const upstream = vi.fn().mockResolvedValue(options.upstream ?? new Response('{"candidates":[]}'));
  const router = createGeminiProxyRouter(upstream);
  const handler = router.stack[0].route!.stack[0].handle;
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200, headersSent: false, writableEnded: false,
    body: undefined as unknown, chunks: [] as Uint8Array[],
    setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; this.writableEnded = true; return this; },
    write(chunk: Uint8Array) { this.headersSent = true; this.chunks.push(chunk); return true; },
    end() { this.writableEnded = true; },
  });
  await handler({
    session: options.session === false ? undefined : { userId: 'rep' },
    params: { operation: options.operation ?? 'gemini-2.5-flash:generateContent' },
    body: options.body ?? { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] },
    headers: { 'x-goog-api-key': 'untrusted-browser-key', 'x-user-email': 'spoof@example.com' },
  } as any, res as any, () => {});
  return { res, upstream };
}

describe('Gemini server boundary', () => {
  it('rejects a legacy header without a verified session before billing', async () => {
    const { res, upstream } = await request({ session: false });
    expect(res.statusCode).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects arbitrary models and malformed payloads', async () => {
    for (const options of [{ operation: 'other:generateContent' }, { body: { contents: [] } }]) {
      const { res, upstream } = await request(options);
      expect(res.statusCode).toBe(400);
      expect(upstream).not.toHaveBeenCalled();
    }
  });
  it('uses only the server key and disables response caching', async () => {
    const { res, upstream } = await request();
    expect(upstream.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-server-only-key');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.writableEnded).toBe(true);
  });
  it('preserves streaming chunks and selects SSE upstream', async () => {
    const payload = 'data: {"candidates":[]}\n\n';
    const { res, upstream } = await request({ operation: 'gemini-2.5-flash:streamGenerateContent', upstream: new Response(payload) });
    expect(upstream.mock.calls[0][0]).toMatch(/\?alt=sse$/);
    expect(Buffer.concat(res.chunks).toString()).toBe(payload);
  });
  it('does not disclose upstream error content', async () => {
    const { res } = await request({ upstream: new Response('secret-provider-diagnostic', { status: 403 }) });
    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('secret-provider-diagnostic');
  });
  it('routes the installed SDK through our endpoint and preserves response getters', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://sa21.example', hostname: 'sa21.example', protocol: 'https:' } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'answer' }] } }] })));
    vi.stubGlobal('fetch', fetchMock);
    const { createGeminiProxyClient } = await import('../../services/geminiProxyClient');
    const response = await createGeminiProxyClient().models.generateContent({ model: 'gemini-2.5-flash', contents: 'hello' });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://sa21.example/api/susan/gemini/v1beta/models/gemini-2.5-flash:generateContent');
    expect(response.text).toBe('answer');
  });
});

it('renders unknown measurements without crashing or inventing zero', () => {
  for (const value of [null, undefined, NaN, Infinity, '', 'bad']) expect(formatNumber(value, 2)).toBe('N/A');
  expect(formatNumber(0, 2)).toBe('0.00');
  expect(formatNumber('1.25', 2)).toBe('1.25');
});
