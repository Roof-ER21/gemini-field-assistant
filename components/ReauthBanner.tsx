/**
 * "Sign in again" — the nudge that gets sa21 from Stage 1 to Stage 2.
 *
 * A rep who signed in months ago holds only their email address, which is what
 * the old header-based identity accepted. They stay signed in for a year, so
 * they would never pick up a real session on their own and the header could
 * never be switched off. This asks them once, and only when the server says to
 * (SA21_PROMPT_REAUTH=true — off by default, because it is rep-visible).
 *
 * It never blocks anything: dismissible, and everything keeps working either
 * way until Stage 2. Reps who already hold a session never see it.
 */
import React, { useEffect, useState } from 'react';
import { hasSessionToken } from '../src/auth/sessionToken';
import { authService } from '../services/authService';

const DISMISS_KEY = 's21_reauth_dismissed_at';
/** If they dismiss it, leave them alone for a week. */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

export default function ReauthBanner(): React.ReactElement | null {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Nothing to ask if they are not signed in, already hold a session, or said not now.
    if (!authService.isAuthenticated() || hasSessionToken() || snoozed()) return;

    (async () => {
      try {
        const res = await fetch('/api/auth/session-policy');
        if (!res.ok) return;
        const policy = await res.json();
        if (!cancelled && policy?.promptReauth === true) setShow(true);
      } catch {
        // Server unreachable: say nothing rather than nagging.
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 16px', background: '#1e293b', color: '#e2e8f0',
        borderBottom: '1px solid #334155', fontSize: 14, lineHeight: 1.4,
      }}
    >
      <span style={{ flex: '1 1 260px' }}>
        Please sign in again to secure your account. Everything keeps working in the meantime.
      </span>
      <a
        href="/api/auth/google/start"
        style={{
          background: '#2563eb', color: '#fff', padding: '6px 14px', borderRadius: 6,
          textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap',
        }}
      >
        Sign in with Google
      </a>
      <button
        type="button"
        onClick={dismiss}
        style={{
          background: 'transparent', color: '#94a3b8', border: 'none',
          cursor: 'pointer', padding: '6px 8px', fontSize: 14,
        }}
      >
        Not now
      </button>
    </div>
  );
}
