/**
 * Does the session bearer go where it should, and nowhere else?
 *
 * This app is cross-origin: a Capacitor build runs on capacitor://localhost and
 * calls https://sa21.up.railway.app/api. The web app's same-origin check would
 * therefore never attach the bearer, and the failure would be silent — right up
 * until the backend requires a session and every screen 401s. The opposite
 * mistake is worse: a token that rides along to Gemini, Groq or Together.
 *
 * `shouldAttachBearer` takes its inputs explicitly so both directions can be
 * checked with no browser and no test dependency:
 *
 *   node --experimental-strip-types test/session-token.test.mjs
 *   (or: node test/session-token.test.mjs on Node >= 23)
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';

// Inlined rather than imported: the module pulls in services/config, which
// touches `window`. The function under test is pure, so this copy is checked
// against the real one by the drift test at the bottom.
function shouldAttachBearer(url, apiBaseUrl, pageOrigin) {
  let apiOrigin;
  try {
    apiOrigin = new URL(apiBaseUrl, pageOrigin).origin;
  } catch {
    return false;
  }
  try {
    const resolved = new URL(url, pageOrigin);
    if (resolved.origin !== apiOrigin) return false;
    return resolved.pathname.includes('/api/');
  } catch {
    return false;
  }
}

const NATIVE = 'capacitor://localhost';
const API = 'https://sa21.up.railway.app/api';

test('the native build DOES attach the bearer to the backend — the whole point', () => {
  assert.equal(shouldAttachBearer(`${API}/jobs`, API, NATIVE), true);
  assert.equal(shouldAttachBearer(`${API}/auth/logout`, API, NATIVE), true);
  assert.equal(shouldAttachBearer('https://sa21.up.railway.app/api/susan/agent/chat', API, NATIVE), true);
});

test('the bearer NEVER goes to a third party', () => {
  for (const url of [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    'https://api.groq.com/openai/v1/chat/completions',
    'https://api.together.xyz/v1/chat/completions',
    'https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct',
    'https://api.anthropic.com/v1/messages',
  ]) {
    assert.equal(shouldAttachBearer(url, API, NATIVE), false, `must not attach to ${url}`);
  }
});

test('a look-alike host does not get the token', () => {
  assert.equal(shouldAttachBearer('https://sa21.up.railway.app.evil.test/api/jobs', API, NATIVE), false);
  assert.equal(shouldAttachBearer('http://sa21.up.railway.app/api/jobs', API, NATIVE), false, 'scheme is part of origin');
  assert.equal(shouldAttachBearer('https://evil.test/api/jobs', API, NATIVE), false);
});

test('a same-origin web build still only tags /api/ paths', () => {
  const WEB = 'https://sa21.theroofdocs.com';
  assert.equal(shouldAttachBearer('/api/jobs', `${WEB}/api`, WEB), true);
  assert.equal(shouldAttachBearer('/roofer-s21-logo.webp', `${WEB}/api`, WEB), false);
  assert.equal(shouldAttachBearer('/index.html', `${WEB}/api`, WEB), false);
});

test('relative URLs from a native page resolve against the page, so they are not the API', () => {
  // On a Capacitor build a bare "/api/jobs" is capacitor://localhost/api/jobs —
  // not the backend. Every real call in this app uses the absolute API_BASE_URL.
  assert.equal(shouldAttachBearer('/api/jobs', API, NATIVE), false);
});

test('garbage in, no token out', () => {
  assert.equal(shouldAttachBearer('not a url', API, NATIVE), false);
  assert.equal(shouldAttachBearer(`${API}/jobs`, 'not a url', 'also not a url'), false);
});

test('the inlined copy has not drifted from the module', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/auth/sessionToken.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function shouldAttachBearer'));
  const end = body.indexOf('\nfunction isOwnApi');
  const real = body.slice(0, end);
  // The real one is the same decision: API origin must match, path must hold /api/.
  assert.ok(real.includes("resolved.origin !== apiOrigin"), 'origin check missing from module');
  assert.ok(real.includes("resolved.pathname.includes('/api/')"), 'path check missing from module');
  assert.ok(real.includes('new URL(apiBaseUrl, pageOrigin).origin'), 'api origin derivation changed');
});
