/**
 * Login Page - Clean Red/Black Design
 * Mobile-first, properly sized for all screens
 */

import React, { useState } from 'react';
import { authService } from '../services/authService';
import LegalPage from './LegalPage';
import { Mail, User, ArrowLeft, Shield, Copy, Check, Eye, EyeOff } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  // Load saved email/name from localStorage (persists across app closes)
  const savedEmail = localStorage.getItem('s21_login_email') || '';
  const savedName = localStorage.getItem('s21_login_name') || '';

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(savedEmail);
  const [code, setCode] = useState('');
  const [name, setName] = useState(savedName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showLegal, setShowLegal] = useState<'privacy' | 'terms' | null>(null);
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [isDevelopmentMode, setIsDevelopmentMode] = useState(false);
  const [displayedCode, setDisplayedCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);

  // Save email/name as user types (so they don't lose it if app closes)
  const handleEmailChange = (value: string) => {
    setEmail(value);
    localStorage.setItem('s21_login_email', value);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    localStorage.setItem('s21_login_name', value);
  };

  // Clear saved login info after successful login
  const clearSavedLoginInfo = () => {
    localStorage.removeItem('s21_login_email');
    localStorage.removeItem('s21_login_name');
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setCodeCopied(false);

    try {
      const result = await authService.requestLoginCode(email, name, rememberMe);
      if (result.success) {
        if (result.autoLoginSuccess) {
          clearSavedLoginInfo();
          onLoginSuccess();
          return;
        }
        setStep('code');
        setIsDevelopmentMode(result.developmentMode || false);
        // Store the verification code if returned (for display when email not sent)
        if (result.verificationCode) {
          setDisplayedCode(result.verificationCode);
        }
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (displayedCode) {
      try {
        await navigator.clipboard.writeText(displayedCode);
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = displayedCode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      }
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authService.verifyLoginCode(email, code, name, rememberMe);
      if (result.success) {
        clearSavedLoginInfo();
        onLoginSuccess();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authService.quickLogin(email, name || undefined, rememberMe);
      if (result.success) {
        clearSavedLoginInfo();
        onLoginSuccess();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Common input styles
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '52px',
    padding: '0 16px',
    fontSize: '16px',
    color: '#ffffff',
    background: '#171717',
    border: '1px solid #262626',
    borderRadius: '12px',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#a1a1aa',
    marginBottom: '8px'
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        background: '#000000',
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
          background: '#0a0a0a',
          borderRadius: '20px',
          border: '1px solid #262626',
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
              boxShadow: '0 8px 24px rgba(220, 38, 38, 0.3)'
            }}
          >
            <img
              src="/roofer-s21-logo.webp"
              alt="ROOFER S21"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                padding: '8px'
              }}
              onError={(e) => {
                // Fallback to gradient if image fails
                e.currentTarget.parentElement!.style.background = 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <h1
            style={{
              fontSize: '32px',
              fontWeight: '700',
              margin: '0 0 6px 0',
              letterSpacing: '-0.02em'
            }}
          >
            <span style={{ color: '#ffffff' }}>ROOFER</span>
            <span style={{ color: '#dc2626', marginLeft: '6px' }}>S21</span>
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#71717a',
              margin: 0
            }}
          >
            The Roof Docs AI Assistant
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit}>
            {/* Email Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                style={inputStyle}
                onFocus={(e) => {
                  e.target.style.borderColor = '#dc2626';
                  e.target.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#262626';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Name Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="John Smith"
                required
                autoComplete="name"
                style={inputStyle}
                onFocus={(e) => {
                  e.target.style.borderColor = '#dc2626';
                  e.target.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#262626';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Remember Me */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '20px',
                cursor: 'pointer'
              }}
            >
              <div
                onClick={() => setRememberMe(!rememberMe)}
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '6px',
                  background: rememberMe ? '#dc2626' : '#262626',
                  border: rememberMe ? 'none' : '2px solid #404040',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                {rememberMe && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <div>
                <span style={{ fontSize: '14px', color: '#ffffff' }}>Remember me</span>
                <p style={{ fontSize: '12px', color: '#71717a', margin: '2px 0 0 0' }}>
                  Stay logged in for 1 year
                </p>
              </div>
            </label>

            {/* Error */}
            {error && (
              <div
                style={{
                  padding: '12px 14px',
                  marginBottom: '16px',
                  borderRadius: '10px',
                  background: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                  fontSize: '13px',
                  color: '#f87171'
                }}
              >
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: '52px',
                fontSize: '16px',
                fontWeight: '600',
                color: '#ffffff',
                background: loading
                  ? '#4b1818'
                  : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                border: 'none',
                borderRadius: '12px',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(220, 38, 38, 0.35)',
                transition: 'all 0.2s'
              }}
            >
              {loading ? (
                'Sending...'
              ) : (
                <>
                  <Mail style={{ width: '18px', height: '18px' }} />
                  Continue
                </>
              )}
            </button>

            {/* Dev Login Toggle */}
            <button
              type="button"
              onClick={() => setShowDevLogin(!showDevLogin)}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '8px',
                fontSize: '12px',
                color: '#52525b',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {showDevLogin ? 'Hide' : 'Show'} Quick Login
            </button>

            {showDevLogin && (
              <button
                type="button"
                onClick={handleQuickLogin}
                disabled={loading || !email}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  padding: '12px',
                  fontSize: '14px',
                  color: '#dc2626',
                  background: '#171717',
                  border: '1px solid #262626',
                  borderRadius: '10px',
                  cursor: loading || !email ? 'not-allowed' : 'pointer',
                  opacity: loading || !email ? 0.5 : 1
                }}
              >
                Quick Login (Skip Verification)
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit}>
            {/* Back Button */}
            <button
              type="button"
              onClick={() => { setStep('email'); setCode(''); setError(''); setDisplayedCode(null); setShowCode(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '20px',
                padding: '0',
                fontSize: '14px',
                color: '#71717a',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft style={{ width: '16px', height: '16px' }} />
              Back
            </button>

            <p style={{ fontSize: '14px', color: '#a1a1aa', margin: '0 0 4px 0' }}>
              Logging in as
            </p>
            <p style={{ fontSize: '15px', fontWeight: '600', color: '#dc2626', margin: '0 0 20px 0' }}>
              {email}
            </p>

            {/* Display Verification Code Prominently */}
            {displayedCode && (
              <div
                style={{
                  padding: '16px',
                  marginBottom: '20px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                  border: '1px solid #dc2626',
                  textAlign: 'center'
                }}
              >
                <p style={{ fontSize: '12px', color: '#a1a1aa', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Verification Code
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                  <span
                    style={{
                      fontSize: '32px',
                      fontWeight: '700',
                      color: '#ffffff',
                      letterSpacing: '0.15em',
                      fontFamily: 'monospace'
                    }}
                  >
                    {showCode ? displayedCode : '••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCode(!showCode)}
                    style={{
                      padding: '8px',
                      background: '#262626',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={showCode ? 'Hide code' : 'Show code'}
                  >
                    {showCode
                      ? <EyeOff style={{ width: '18px', height: '18px', color: '#a1a1aa' }} />
                      : <Eye style={{ width: '18px', height: '18px', color: '#a1a1aa' }} />
                    }
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  style={{
                    marginTop: '12px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: codeCopied ? '#22c55e' : '#dc2626',
                    background: codeCopied ? 'rgba(34, 197, 94, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                    border: `1px solid ${codeCopied ? '#22c55e' : '#dc2626'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                >
                  {codeCopied
                    ? <><Check style={{ width: '14px', height: '14px' }} /> Copied!</>
                    : <><Copy style={{ width: '14px', height: '14px' }} /> Copy Code</>
                  }
                </button>
                <p style={{ fontSize: '11px', color: '#71717a', margin: '12px 0 0 0' }}>
                  Share this code via message, call, or in person
                </p>
              </div>
            )}

            {/* Code Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Verification Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                style={{
                  ...inputStyle,
                  textAlign: 'center',
                  fontSize: '24px',
                  fontWeight: '700',
                  letterSpacing: '0.2em'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#dc2626';
                  e.target.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#262626';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  padding: '12px 14px',
                  marginBottom: '16px',
                  borderRadius: '10px',
                  background: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                  fontSize: '13px',
                  color: '#f87171'
                }}
              >
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || code.length < 6}
              style={{
                width: '100%',
                height: '52px',
                fontSize: '16px',
                fontWeight: '600',
                color: '#ffffff',
                background: loading || code.length < 6
                  ? '#4b1818'
                  : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                border: 'none',
                borderRadius: '12px',
                cursor: loading || code.length < 6 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: loading || code.length < 6 ? 'none' : '0 4px 16px rgba(220, 38, 38, 0.35)',
                transition: 'all 0.2s'
              }}
            >
              {loading ? (
                'Verifying...'
              ) : (
                <>
                  <Shield style={{ width: '18px', height: '18px' }} />
                  Sign In
                </>
              )}
            </button>

            {/* Resend */}
            <button
              type="button"
              onClick={handleEmailSubmit}
              disabled={loading}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '10px',
                fontSize: '13px',
                color: '#71717a',
                background: 'transparent',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              Resend Code
            </button>
          </form>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid #1a1a1a',
            textAlign: 'center'
          }}
        >
          <p style={{ fontSize: '13px', color: '#52525b', margin: '0 0 4px 0' }}>
            ROOFER S21 - The Roof Docs
          </p>
          <p style={{ fontSize: '11px', color: '#3f3f46', margin: '0 0 12px 0' }}>
            Secure email authentication
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
            <button
              type="button"
              onClick={() => setShowLegal('privacy')}
              style={{
                fontSize: '11px',
                color: '#52525b',
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
                color: '#52525b',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Terms of Service
            </button>
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
