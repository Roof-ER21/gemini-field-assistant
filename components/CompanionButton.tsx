/**
 * Rep Companion — the "something's wrong" button (P2 pilot).
 *
 * One press captures the last few minutes of technical context (console,
 * network trail with backend request ids, click breadcrumbs) and files it to
 * /api/companion/report. The rep gets a report number back instantly.
 *
 * Pilot gate: enabled for COMPANION_PILOT emails, or any device with
 * localStorage['companion21'] = 'on'. Help-first framing only — this catches
 * issues FOR the rep; it is not monitoring, and nothing is captured until
 * the button is pressed... the buffers live in memory and die with the tab.
 *
 * Palette is deliberately its own (indigo/slate), not Roof-ER ember/red.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Companion } from '../src/lib/companionCore';
import { config } from '../services/config';

const COMPANION_PILOT = new Set(['ahmed.mahmoud@theroofdocs.com']);

let singleton: Companion | null = null;
function getCompanion(userEmail: string): Companion {
  if (!singleton) {
    singleton = new Companion({
      app: 'sa21',
      endpoint: `${config.getApiUrl()}/companion/report`,
      userId: userEmail,
    });
    singleton.install();
  } else {
    singleton.setUser(userEmail);
  }
  return singleton;
}

export function companionEnabled(userEmail?: string | null): boolean {
  try {
    if (localStorage.getItem('companion21') === 'on') return true;
  } catch { /* storage blocked — fall through to allowlist */ }
  return !!userEmail && COMPANION_PILOT.has(userEmail.toLowerCase());
}

const CompanionButton: React.FC<{ userEmail?: string | null }> = ({ userEmail }) => {
  const enabled = useMemo(() => companionEnabled(userEmail), [userEmail]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);

  useEffect(() => {
    if (enabled && userEmail) getCompanion(userEmail);
  }, [enabled, userEmail]);

  if (!enabled || !userEmail) return null;

  const send = async () => {
    setSending(true);
    const { reportId, delivered } = await getCompanion(userEmail).send(message.trim());
    setSending(false);
    setSentId(delivered ? reportId : 'offline');
    setMessage('');
    setTimeout(() => { setSentId(null); setOpen(false); }, 4000);
  };

  const S: Record<string, React.CSSProperties> = {
    fab: {
      position: 'fixed', bottom: 84, left: 16, zIndex: 9000,
      background: '#312e81', color: '#e0e7ff', border: '1px solid #4f46e5',
      borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', boxShadow: '0 4px 14px rgba(49,46,129,0.4)',
    },
    card: {
      position: 'fixed', bottom: 130, left: 16, zIndex: 9001, width: 300,
      background: '#1e1b4b', color: '#e0e7ff', border: '1px solid #4f46e5',
      borderRadius: 12, padding: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
      fontSize: 13, lineHeight: 1.45,
    },
    textarea: {
      width: '100%', minHeight: 64, marginTop: 8, borderRadius: 8,
      border: '1px solid #4f46e5', background: '#312e81', color: '#e0e7ff',
      padding: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
    },
    sendBtn: {
      marginTop: 10, width: '100%', padding: '8px 0', borderRadius: 8,
      border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700,
      fontSize: 13, cursor: 'pointer', opacity: sending ? 0.6 : 1,
    },
  };

  return (
    <>
      {open && (
        <div style={S.card}>
          {sentId ? (
            sentId === 'offline' ? (
              <div>⚠️ Could not reach the server — try again in a minute.</div>
            ) : (
              <div>✅ Sent — report <b>{sentId.slice(0, 8)}</b>. The last few minutes of technical context went with it. Thank you!</div>
            )
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Something's wrong?</div>
              <div style={{ opacity: 0.85 }}>
                This sends the recent technical trail (errors, network calls, taps) to the dev
                team so we can fix it without asking you to reproduce anything.
              </div>
              <textarea
                style={S.textarea}
                placeholder="Optional: what were you trying to do?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
              />
              <button style={S.sendBtn} disabled={sending} onClick={send}>
                {sending ? 'Sending…' : 'Send report'}
              </button>
            </>
          )}
        </div>
      )}
      <button
        style={S.fab}
        aria-label="Report a problem"
        title="Something's wrong? Send a report"
        onClick={() => { setOpen((v) => !v); setSentId(null); }}
      >
        ⚑ Something's wrong?
      </button>
    </>
  );
};

export default CompanionButton;
