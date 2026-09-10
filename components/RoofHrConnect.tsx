/**
 * "Connect Roof HR" — the rep-facing half.
 *
 * Susan cannot read anyone's Roof HR data with a login of her own; she reads it
 * on a token the rep mints for themselves by signing into Roof HR and approving
 * (see server/routes/connectRoutes.ts and Roof HR's server/mcp/connect.ts).
 * This file is the two places that touches the screen:
 *
 *   <RoofHrCallbackHandler/>  mounted once, app-wide. Roof HR sends the browser
 *                             back with a one-time code in the URL; the API
 *                             callback cannot redeem it because a top-level
 *                             navigation carries no bearer, so it lands here
 *                             instead, where the session token exists.
 *
 *   <RoofHrConnectChip/>      in the chat header. Invisible until the server
 *                             says connections are switched on, then one pill:
 *                             connect, or connected-and-disconnectable.
 *
 * The code in the URL is single-use and expires in 90 seconds, and it is
 * stripped from the address bar as soon as it has been read.
 *
 * In the Capacitor build the round trip ends in the browser rather than back
 * inside the native shell, so the chip there starts a connection that is
 * finished on the web. That is fine: the token is stored server-side against the
 * rep, so connecting once from anywhere makes Susan able to read Roof HR
 * everywhere.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { hasSessionToken } from '../src/auth/sessionToken';
import { API_BASE_URL } from '../services/config';

type ConnectionStatus = {
  app: string;
  displayName: string;
  configured: boolean;
  connected: boolean;
  connection?: { scopes?: string[]; expiresAt?: string; remoteUserId?: string } | null;
};

/** Every peer at once, so the header does not make one request per app. */
async function fetchStatuses(): Promise<ConnectionStatus[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/connect/status`);
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body?.apps) ? (body.apps as ConnectionStatus[]) : null;
  } catch {
    return null;
  }
}

/** Drop the connect parameters from the address bar without reloading. */
function stripConnectParams(): void {
  try {
    const url = new URL(window.location.href);
    let touched = false;
    for (const key of ['connect', 'code', 'state', 'error']) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        touched = true;
      }
    }
    if (touched) window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
  } catch {
    /* address bar is cosmetic here */
  }
}

// ---------------------------------------------------------------------------
// Callback handler
// ---------------------------------------------------------------------------

type Outcome = { kind: 'working' } | { kind: 'done'; scopes: string[]; app: string } | { kind: 'failed'; error: string };

export function RoofHrCallbackHandler(): React.ReactElement | null {
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const app = params.get('connect');
    // Any peer's callback lands here; the query says which one.
    if (!app) return;

    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    stripConnectParams();

    if (error || !code || !state) {
      setOutcome({ kind: 'failed', error: 'That app did not send a connection back. Try connecting again.' });
      return;
    }
    if (!hasSessionToken()) {
      // Without a session the server cannot tell that this is the same person
      // who started the trip, and it will refuse — say so plainly instead.
      setOutcome({
        kind: 'failed',
        error: 'Sign in again with Continue with Google, then connect the app.',
      });
      return;
    }

    setOutcome({ kind: 'working' });
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/connect/${encodeURIComponent(app)}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setOutcome({ kind: 'failed', error: body?.error || 'That connection could not be completed.' });
          return;
        }
        setOutcome({ kind: 'done', scopes: body?.connection?.scopes ?? [], app: body?.app ?? app });
        window.dispatchEvent(new Event('roofhr-connection-changed'));
      } catch {
        if (!cancelled) setOutcome({ kind: 'failed', error: 'Could not reach the server to finish connecting.' });
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!outcome) return null;

  const palette =
    outcome.kind === 'failed'
      ? { background: '#7f1d1d', border: '#991b1b' }
      : { background: '#14532d', border: '#166534' };

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 16px', color: '#e2e8f0', fontSize: 14, lineHeight: 1.4,
        background: palette.background, borderBottom: `1px solid ${palette.border}`,
      }}
    >
      <span style={{ flex: '1 1 260px' }}>
        {outcome.kind === 'working' && 'Finishing your Roof HR connection…'}
        {outcome.kind === 'done' &&
          `Connected. Susan can now read your own ${outcome.app} data${
            outcome.scopes.length > 0 ? ` (${outcome.scopes.join(', ')})` : ''
          }.`}
        {outcome.kind === 'failed' && outcome.error}
      </span>
      {outcome.kind !== 'working' && (
        <button
          type="button"
          onClick={() => setOutcome(null)}
          style={{ background: 'transparent', color: '#cbd5e1', border: 'none', cursor: 'pointer', fontSize: 14 }}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The pill
// ---------------------------------------------------------------------------

/**
 * One pill per peer that is switched on: connect it, or show it connected and
 * offer to disconnect. Peers the server has no secret for render nothing, so
 * the header stays empty until a connection is actually possible.
 */
function AppChip({ status, onChanged }: { status: ConnectionStatus; onChanged: () => void }): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/connect/${encodeURIComponent(status.app)}/start`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) {
        setError(body?.error || 'Could not start that connection.');
        setBusy(false);
        return;
      }
      // Same tab: the round trip ends back here, where the session lives.
      window.location.assign(body.url);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await fetch(`${API_BASE_URL}/connect/${encodeURIComponent(status.app)}`, { method: 'DELETE' });
    } catch {
      /* a failed delete leaves the pill as it was */
    }
    setBusy(false);
    setConfirming(false);
    onChanged();
  };

  const pill: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
    cursor: busy ? 'default' : 'pointer', border: '1px solid', whiteSpace: 'nowrap',
    opacity: busy ? 0.6 : 1,
  };

  if (!status.connected) {
    return (
      <button
        type="button"
        onClick={connect}
        disabled={busy}
        title={error || `Let Susan read your own ${status.displayName} data`}
        style={{ ...pill, background: 'transparent', borderColor: '#475569', color: '#cbd5e1' }}
      >
        Connect {status.displayName}
      </button>
    );
  }

  if (confirming) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={disconnect}
          disabled={busy}
          style={{ ...pill, background: '#7f1d1d', borderColor: '#991b1b', color: '#fee2e2' }}
        >
          Disconnect?
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
        >
          Keep
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title={`${status.displayName} connected${
        status.connection?.scopes?.length ? ` — ${status.connection.scopes.join(', ')}` : ''
      }. Click to disconnect.`}
      style={{ ...pill, background: '#064e3b', borderColor: '#047857', color: '#d1fae5' }}
    >
      {status.displayName} ✓
    </button>
  );
}

export function RoofHrConnectChip(): React.ReactElement | null {
  const [statuses, setStatuses] = useState<ConnectionStatus[] | null>(null);

  const refresh = useCallback(async () => {
    if (!hasSessionToken()) { setStatuses(null); return; }
    setStatuses(await fetchStatuses());
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener('roofhr-connection-changed', onChange);
    return () => window.removeEventListener('roofhr-connection-changed', onChange);
  }, [refresh]);

  // Nothing to offer: no session, server unreachable, or no peer is switched on.
  const offerable = (statuses ?? []).filter((s) => s.configured);
  if (offerable.length === 0) return null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {offerable.map((s) => (
        <AppChip key={s.app} status={s} onChanged={() => void refresh()} />
      ))}
    </span>
  );
}

export default RoofHrConnectChip;
