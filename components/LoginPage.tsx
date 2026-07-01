/**
 * Login Page — Google Workspace SSO only.
 *
 * Reps sign in with their @theroofdocs.com Google account via the OAuth redirect
 * flow (/api/auth/google/start → callback → one-time handoff → exchange).
 *
 * The passwordless email login was retired 2026-07-01: the "enter your email"
 * path was removed from this page and the backend /api/auth/direct-login now
 * 403s under SSO_ONLY=true. See the sa21-auth-domain-split memory for history.
 */

import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import LegalPage from './LegalPage';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [showLegal, setShowLegal] = useState<'privacy' | 'terms' | null>(null);

  // Clear any legacy saved email/name left over from the old email-login flow.
  const clearSavedLoginInfo = () => {
    localStorage.removeItem('s21_login_email');
    localStorage.removeItem('s21_login_name');
  };

  // ── Sign in with Google (Workspace SSO via OAuth redirect) ───────────────────
  const startGoogleLogin = () => {
    setGoogleError('');
    setLoading(true);
    window.location.href = '/api/auth/google/start';
  };

  // On return from Google (?gl=<token> or ?gl_error=…), exchange the handoff for the session.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoff = params.get('gl');
    const glErr = params.get('gl_error');
    if (glErr) {
      const map: Record<string, string> = {
        domain: 'Please sign in with your @theroofdocs.com Google account.',
        notapproved: 'Your account isn’t set up yet — please ask an admin to add you.',
        state: 'Sign-in session expired — please try again.',
        config: 'Google sign-in is finishing setup — please try again shortly.',
        token: 'Google sign-in failed — please try again.',
        email: 'Your Google account email is not verified.',
      };
      setGoogleError(map[glErr] || 'Google sign-in failed — please try again.');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    if (!handoff) return;
    setLoading(true);
    (async () => {
      try {
        const result = await authService.completeGoogleLogin(handoff, true);
        window.history.replaceState({}, '', window.location.pathname);
        if (result.success) {
          clearSavedLoginInfo();
          onLoginSuccess();
        } else {
          setGoogleError(result.message || 'Google sign-in failed — please try again.');
          setLoading(false);
        }
      } catch {
        setGoogleError('Google sign-in failed — please try again.');
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        boxSizing: 'border-box',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      {/* Main Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '360px',
          background: 'var(--bg-primary)',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle)',
          padding: '32px 24px',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            style={{
              width: '88px',
              height: '88px',
              margin: '0 auto 16px',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(196, 30, 58, 0.3)'
            }}
          >
            <img
              src="/roofer-s21-logo.webp"
              alt="ROOF-ER S21"
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '8px' }}
              onError={(e) => {
                e.currentTarget.parentElement!.style.background = 'linear-gradient(135deg, #c41e3a 0%, #9b1830 100%)';
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          {/* RoofER brand lockup */}
          <h1
            style={{
              fontSize: '32px',
              fontWeight: '700',
              margin: '0 0 4px 0',
              letterSpacing: '0.06em',
              fontFamily: "'Rajdhani', ui-sans-serif, system-ui, sans-serif"
            }}
          >
            <span style={{ color: 'var(--text-primary)' }}>Roof</span>
            <span style={{ color: '#c41e3a' }}>ER</span>
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-tertiary)',
              margin: 0,
              letterSpacing: '0.1em',
              textTransform: 'uppercase'
            }}
          >
            Susan 21
          </p>
        </div>

        {/* Sign in with Google — sole login path (Workspace SSO) */}
        <button
          type="button"
          onClick={startGoogleLogin}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            height: '52px',
            padding: '0 16px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.18)',
            background: '#ffffff',
            color: '#1f2937',
            fontSize: '16px',
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          {loading ? 'Connecting…' : 'Continue with Google'}
        </button>

        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', margin: '14px 0 0 0' }}>
          Sign in with your <strong style={{ color: 'var(--text-primary)' }}>@theroofdocs.com</strong> Google account
        </p>

        {googleError && (
          <p style={{ fontSize: '12px', color: '#ef4444', textAlign: 'center', marginTop: '10px' }}>{googleError}</p>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid var(--bg-elevated)',
            textAlign: 'center'
          }}
        >
          <p style={{ fontSize: '13px', color: 'var(--text-disabled)', margin: '0 0 4px 0' }}>
            ROOF-ER S21 - The Roof Docs
          </p>
          <p style={{ fontSize: '11px', color: 'var(--text-disabled)', margin: '0 0 12px 0' }}>
            Secure Google Workspace sign-in
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
            <button
              type="button"
              onClick={() => setShowLegal('privacy')}
              style={{
                fontSize: '11px',
                color: 'var(--text-disabled)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setShowLegal('terms')}
              style={{
                fontSize: '11px',
                color: 'var(--text-disabled)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Terms of Service
            </button>
          </div>

          {/* AO21 · Susan 21 maker's mark — same corner signature used across all surfaces */}
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', marginTop: '18px', opacity: 0.8 }}
            aria-label="Susan 21 · AO21"
          >
            <img
              src="/brand/ao21-sig.png"
              alt=""
              width={34}
              height={24}
              style={{ display: 'block', height: '24px', width: 'auto', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '9.5px', letterSpacing: '0.04em', color: 'var(--text-disabled)', marginTop: '1px' }}>
              Susan&nbsp;21
            </span>
          </div>
        </div>
      </div>

      {/* Legal Modal */}
      {showLegal && (
        <LegalPage
          initialTab={showLegal}
          onClose={() => setShowLegal(null)}
        />
      )}
    </div>
  );
};

export default LoginPage;
