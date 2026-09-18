/**
 * Settings → Connected agents.
 *
 * A rep makes a read-only token for an assistant that reads Susan on their
 * behalf (Genie 21, Claude, any MCP client), copies it once, and can revoke it
 * here at any time. The server keeps only a hash (server/auth/agentTokens.ts),
 * so the full token is on screen exactly once, right after it is made.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Copy, Check, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../services/config';

type AgentToken = {
  id: string;
  name: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  expired: boolean;
};

type ListResponse = {
  tokens: AgentToken[];
  endpoint: string;
  tools: string[];
  defaultDays: number;
  maxDays: number;
};

const EXPIRY_CHOICES = [30, 90, 365];

function when(value: string | null): string {
  if (!value) return 'never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const sectionStyle: React.CSSProperties = {
  marginBottom: '20px',
  padding: '16px',
  background: 'var(--bg-secondary)',
  borderRadius: '12px',
  border: '1px solid var(--border-subtle)',
};
const labelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-tertiary)' };
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-primary, #0a0a0a)',
  color: 'var(--text-primary)',
  fontSize: '14px',
};
const buttonStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

export default function ConnectedAgents() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/agent-tokens`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'Could not load your connected agents.');
        return;
      }
      setData(body as ListResponse);
      setError(null);
    } catch {
      setError('Could not load your connected agents.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/agent-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), expiresInDays: days }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || typeof body?.token !== 'string') {
        setError(body?.error ?? 'Could not create the token.');
        return;
      }
      setFresh({ token: body.token, name: body.name });
      setCopied(false);
      setName('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: AgentToken) => {
    if (busy) return;
    if (!window.confirm(`Revoke "${token.name}"? Any assistant using it stops working right away.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/agent-tokens/${encodeURIComponent(token.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? 'Could not revoke the token.');
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bot style={{ width: '14px', height: '14px', color: '#dc2626' }} />
          Connected agents
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
          Give an assistant such as Genie 21 read-only access to Susan as you: the carrier directory, the team's
          carrier and adjuster learnings, rep lookup, and Susan's answers. It cannot send, change or delete anything.
        </p>
        {data?.endpoint && (
          <p style={labelStyle}>
            Connect it to <code style={{ userSelect: 'all' }}>{data.endpoint}</code>
          </p>
        )}
      </div>

      {fresh && (
        <div role="status" style={{ ...sectionStyle, border: '1px solid #dc2626' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Token for "{fresh.name}". Copy it now: it will not be shown again.
          </p>
          <code style={{ display: 'block', wordBreak: 'break-all', fontSize: '12px', padding: '10px', borderRadius: '8px', background: 'var(--bg-primary, #0a0a0a)', color: 'var(--text-primary)', userSelect: 'all' }}>
            {fresh.token}
          </code>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button type="button" onClick={copy} style={{ ...buttonStyle, background: '#dc2626', color: '#ffffff' }}>
              {copied ? <Check style={{ width: '14px', height: '14px' }} /> : <Copy style={{ width: '14px', height: '14px' }} />}
              {copied ? 'Copied' : 'Copy token'}
            </button>
            <button type="button" onClick={() => setFresh(null)} style={{ ...buttonStyle, background: 'var(--bg-hover, #171717)', color: 'var(--text-primary)' }}>
              Done
            </button>
          </div>
        </div>
      )}

      <form onSubmit={create} style={sectionStyle}>
        <label htmlFor="agent-token-name" style={labelStyle}>Name (the assistant that will use it)</label>
        <input
          id="agent-token-name"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder="Genie 21"
          style={{ ...inputStyle, margin: '6px 0 10px' }}
        />
        <label htmlFor="agent-token-expiry" style={labelStyle}>Expires after</label>
        <select
          id="agent-token-expiry"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          style={{ ...inputStyle, margin: '6px 0 12px' }}
        >
          {EXPIRY_CHOICES.map((choice) => (
            <option key={choice} value={choice}>{choice} days</option>
          ))}
        </select>
        <button type="submit" disabled={busy || !name.trim()} style={{ ...buttonStyle, background: '#dc2626', color: '#ffffff', opacity: busy || !name.trim() ? 0.6 : 1 }}>
          Create read-only token
        </button>
      </form>

      {error && (
        <p role="alert" style={{ fontSize: '13px', color: '#f87171', marginBottom: '12px' }}>{error}</p>
      )}

      <div style={sectionStyle}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>Your tokens</p>
        {data && data.tokens.length === 0 && (
          <p style={labelStyle}>No agents connected.</p>
        )}
        {data?.tokens.map((token) => (
          <div key={token.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {token.name} <span style={labelStyle}>…{token.hint}</span>
              </p>
              <p style={{ ...labelStyle, margin: '2px 0 0' }}>
                Last used {when(token.lastUsedAt)} · {token.expired ? 'expired' : 'expires'} {when(token.expiresAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => revoke(token)}
              disabled={busy}
              aria-label={`Revoke ${token.name}`}
              style={{ ...buttonStyle, background: 'var(--bg-hover, #171717)', color: '#f87171' }}
            >
              <Trash2 style={{ width: '14px', height: '14px' }} />
              Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
