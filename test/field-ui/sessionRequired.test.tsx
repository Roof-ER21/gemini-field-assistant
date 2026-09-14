/**
 * A browser signed in before sessions existed holds no token. Every route
 * still accepts its legacy header except the Gemini proxy, which answers 401
 * SESSION_REQUIRED. That answer must (a) reach the reauth banner even with no
 * token and even when the banner was snoozed, and (b) be recognisable to a
 * caller so it can say "sign in again" instead of "try again".
 */
import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/authService', () => ({ authService: { isAuthenticated: () => true } }));

import {
  installSessionFetch, isSessionRequiredError, storeSessionToken, getSessionToken, SESSION_REQUIRED_EVENT,
} from '../../src/auth/sessionToken';
import ReauthBanner from '../../components/ReauthBanner';

const sessionRequired = () =>
  new Response(JSON.stringify({ error: { message: 'Sign in to use AI.' }, code: 'SESSION_REQUIRED' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  });

describe('SESSION_REQUIRED from the API', () => {
  let original: typeof fetch;
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
      clear: () => data.clear(),
    });
    original = window.fetch;
  });
  afterEach(() => { cleanup(); window.fetch = original; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('is announced even when the browser holds no token', async () => {
    const underlying = vi.fn().mockResolvedValue(sessionRequired());
    window.fetch = underlying;
    // Module keeps an "installed" flag; call it fresh via a re-import.
    vi.resetModules();
    const mod = await import('../../src/auth/sessionToken');
    mod.installSessionFetch();
    const seen = vi.fn();
    window.addEventListener(mod.SESSION_REQUIRED_EVENT, seen);
    const res = await window.fetch('/api/susan/gemini/v1beta/models/gemini-2.5-flash:generateContent', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(underlying.mock.calls[0][1]?.headers).toBeUndefined(); // no bearer invented
    expect(seen).toHaveBeenCalledTimes(1);
    // The body is still readable by the caller (we only cloned it).
    await expect(res.json()).resolves.toMatchObject({ code: 'SESSION_REQUIRED' });
  });

  it('drops a stale token and announces', async () => {
    window.fetch = vi.fn().mockResolvedValue(sessionRequired());
    vi.resetModules();
    const mod = await import('../../src/auth/sessionToken');
    mod.storeSessionToken('s21_stale');
    mod.installSessionFetch();
    const seen = vi.fn();
    window.addEventListener(mod.SESSION_REQUIRED_EVENT, seen);
    await window.fetch('/api/anything');
    expect(mod.getSessionToken()).toBeNull();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('never announces for third-party 401s', async () => {
    window.fetch = vi.fn().mockResolvedValue(sessionRequired());
    vi.resetModules();
    const mod = await import('../../src/auth/sessionToken');
    mod.installSessionFetch();
    const seen = vi.fn();
    window.addEventListener(mod.SESSION_REQUIRED_EVENT, seen);
    await window.fetch('https://generativelanguage.googleapis.com/v1beta/models/x:generateContent');
    expect(seen).not.toHaveBeenCalled();
  });

  it('shows the banner, un-snoozed and not dismissible, when announced', async () => {
    localStorage.setItem('s21_reauth_dismissed_at', String(Date.now())); // snoozed
    window.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ promptReauth: true }), { status: 200 }));
    render(<ReauthBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => { window.dispatchEvent(new CustomEvent(SESSION_REQUIRED_EVENT)); });
    expect(screen.getByRole('status').textContent).toContain('Sign in again to use AI');
    expect(screen.queryByText('Not now')).toBeNull();
    expect(screen.getByText('Sign in with Google').getAttribute('href')).toBe('/api/auth/google/start');
  });

  it('recognises the SDK error shape the email panel receives', () => {
    const apiError = Object.assign(new Error('{"error":{"message":"Sign in to use AI."}}'), { status: 401 });
    expect(isSessionRequiredError(apiError)).toBe(true);
    expect(isSessionRequiredError(new Error('Empty email response'))).toBe(false);
    expect(isSessionRequiredError(Object.assign(new Error('rate limited'), { status: 429 }))).toBe(false);
    expect(isSessionRequiredError(null)).toBe(false);
  });
});
