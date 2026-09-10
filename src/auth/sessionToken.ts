/**
 * Client half of sa21's real sessions — the iOS/Capacitor build.
 *
 * The backend (sa21, shared with the web app) used to identify a caller from
 * the `x-user-email` header this app asserts in ~127 places. It now issues a
 * session token at a verified sign-in and expects it as
 * `Authorization: Bearer <token>` on every call. Once the backend requires it
 * (SA21_REQUIRE_SESSION=true) a client that does not send one gets 401 on
 * everything, so this app needs the same two pieces the web app got.
 *
 * ONE IMPORTANT DIFFERENCE from the web version: this app is cross-origin.
 * A Capacitor build runs on capacitor://localhost and calls
 * https://sa21.up.railway.app/api, so a same-origin check would never attach
 * the bearer and the whole thing would silently do nothing. The origin we
 * trust is therefore the configured API base URL, not window.location.
 *
 * The bearer is attached ONLY to that origin. It must never ride along on a
 * request to Gemini, Groq, Together or any other third party this app calls.
 */

import { API_BASE_URL } from '../../services/config';

const TOKEN_KEY = 's21_session_token';
const EXPIRY_KEY = 's21_session_expires_at';

export function storeSessionToken(token: string, expiresAt?: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    if (expiresAt) localStorage.setItem(EXPIRY_KEY, expiresAt);
  } catch {
    // Storage unavailable: the app still works while the backend accepts the
    // legacy header, and prompts a fresh sign-in once it does not.
  }
}

export function getSessionToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const expiresAt = localStorage.getItem(EXPIRY_KEY);
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
      clearSessionToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function hasSessionToken(): boolean {
  return getSessionToken() !== null;
}

/**
 * Should the bearer go on this request?
 *
 * Pure on purpose — this is the one piece that differs from the web build and
 * the one most able to fail silently in either direction: too strict and the
 * token is never sent (Stage 2 then 401s the whole app), too loose and it
 * leaks to Gemini/Groq/Together. Taking its inputs explicitly means it can be
 * checked without a browser: see test/session-token.test.mjs.
 */
export function shouldAttachBearer(url: string, apiBaseUrl: string, pageOrigin: string): boolean {
  let apiOrigin: string;
  try {
    apiOrigin = new URL(apiBaseUrl, pageOrigin).origin;
  } catch {
    return false;
  }
  try {
    const resolved = new URL(url, pageOrigin);
    if (resolved.origin !== apiOrigin) return false;
    // A same-origin web build resolves the API to its own origin, so still
    // require the /api/ path rather than tagging every asset request.
    return resolved.pathname.includes('/api/');
  } catch {
    return false;
  }
}

function isOwnApi(url: string): boolean {
  return shouldAttachBearer(url, API_BASE_URL, window.location.origin);
}

let installed = false;

/** Call once at boot, before anything fetches. */
export function installSessionFetch(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = getSessionToken();
    if (!token) return original(input as any, init);

    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (!isOwnApi(url)) return original(input as any, init);

    // Never overwrite an Authorization header a caller set deliberately — this
    // app uses that header for third-party AI keys elsewhere.
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

    const response = await original(input as any, { ...init, headers });
    if (response.status === 401) {
      try {
        const clone = response.clone();
        const body: any = await clone.json().catch(() => null);
        if (body?.code === 'SESSION_REQUIRED') clearSessionToken();
      } catch {
        /* not JSON; leave the token alone */
      }
    }
    return response;
  };
}
