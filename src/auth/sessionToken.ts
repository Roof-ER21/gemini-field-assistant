/**
 * Client half of sa21's real sessions.
 *
 * The API used to identify the caller from an `x-user-email` header the client
 * simply asserted. It now issues a session token at a verified sign-in, and
 * every API call must carry it as `Authorization: Bearer <token>`.
 *
 * There are ~155 places in this app that build a fetch header block, so rather
 * than edit each one, `installSessionFetch()` wraps `window.fetch` once at boot
 * and attaches the bearer to same-origin API calls. The old `x-user-email`
 * header those call sites already send is left alone — during Stage 1 the
 * server still accepts it, and once Stage 2 lands the server ignores it and
 * rewrites it from the session anyway.
 */

const TOKEN_KEY = 's21_session_token';
const EXPIRY_KEY = 's21_session_expires_at';

export function storeSessionToken(token: string, expiresAt?: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    if (expiresAt) localStorage.setItem(EXPIRY_KEY, expiresAt);
  } catch {
    // Private mode / storage disabled: the app still works on the legacy path
    // during Stage 1, and prompts a fresh sign-in once Stage 2 lands.
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

/** Does this request go to our own API? Third-party calls must never see the token. */
function isOwnApi(url: string): boolean {
  try {
    const resolved = new URL(url, window.location.origin);
    if (resolved.origin !== window.location.origin) {
      // Allow an explicitly configured API origin (VITE_API_BASE_URL) as well.
      const configured = (import.meta as any).env?.VITE_API_BASE_URL;
      if (!configured) return false;
      try {
        if (new URL(configured, window.location.origin).origin !== resolved.origin) return false;
      } catch {
        return false;
      }
    }
    return resolved.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

let installed = false;

/** Call once, as early as possible, before anything fetches. */
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

    // Never overwrite an Authorization header a caller set deliberately.
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

    const response = await original(input as any, { ...init, headers });
    // A session the server no longer honours is dead weight; drop it so the app
    // falls back cleanly and the next sign-in mints a fresh one.
    if (response.status === 401) {
      try {
        const clone = response.clone();
        const body: any = await clone.json().catch(() => null);
        if (body?.code === 'SESSION_REQUIRED') clearSessionToken();
      } catch {
        /* body was not JSON; leave the token in place */
      }
    }
    return response;
  };
}
