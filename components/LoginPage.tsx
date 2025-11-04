/**
 * Login Page Component
 * Simple email-based authentication for S21 Field AI
 * Mobile-first design with Roof-ER branding
 */

import React, { useState } from 'react';
import { authService } from '../services/authService';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Handle email submission (Step 1)
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authService.requestLoginCode(email);

      if (result.success) {
        setGeneratedCode(result.verificationCode || '');
        setStep('code');
        // Auto-fill code for MVP convenience
        if (result.verificationCode) {
          setCode(result.verificationCode);
        }
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle code verification (Step 2)
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authService.verifyLoginCode(email, code, name || undefined, rememberMe);

      if (result.success) {
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

  // Handle quick login for development
  const handleQuickLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authService.quickLogin(email, name || undefined, rememberMe);

      if (result.success) {
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

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: '#000000',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Full Logo Background */}
      <div style={{
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundImage: 'url(/roofer-logo-full.png)',
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        opacity: '0.15',
        pointerEvents: 'none',
        filter: 'blur(1px)'
      }} />

      {/* Gradient overlay for better text readability */}
      <div style={{
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        background: 'radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.7) 100%)',
        pointerEvents: 'none'
      }} />

      <div className="w-full max-w-2xl px-6" style={{ position: 'relative', zIndex: 1 }}>
        {/* Logo and Title */}
        <div className="text-center mb-12">
          {/* Full ROOFER Logo Image */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '32px'
          }}>
            <img
              src="/roofer-logo-full.png"
              alt="ROOFER - The Roof Docs"
              style={{
                width: '360px',
                height: 'auto',
                filter: 'drop-shadow(0 12px 32px rgba(239, 68, 68, 0.5))'
              }}
            />
          </div>

          <h1
            className="text-4xl font-bold mb-2"
            style={{
              color: '#ffffff',
              letterSpacing: '-0.02em',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)'
            }}
          >
            S21 ROOFER
          </h1>
          <p style={{
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '16px',
            fontWeight: 500,
            textShadow: '0 1px 4px rgba(0, 0, 0, 0.8)'
          }}>
            Your intelligent field assistant
          </p>
        </div>

        {/* Login Card */}
        <div
          className="shadow-lg"
          style={{
            background: 'linear-gradient(135deg, rgba(26, 31, 46, 0.95) 0%, rgba(15, 20, 25, 0.95) 100%)',
            borderRadius: '24px',
            border: '2px solid rgba(239, 68, 68, 0.3)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(239, 68, 68, 0.2)',
            backdropFilter: 'blur(20px)',
            padding: '48px 40px'
          }}
        >
          {step === 'email' ? (
            // Step 1: Email Input
            <form onSubmit={handleEmailSubmit}>
              <div className="mb-5">
                <label
                  htmlFor="email"
                  className="block mb-2 text-sm font-semibold"
                  style={{
                    color: 'rgba(255, 255, 255, 0.9)',
                    letterSpacing: '-0.01em'
                  }}
                >
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@roofer.com"
                  required
                  autoFocus
                  className="w-full px-4 py-3 text-base"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    color: '#ffffff',
                    minHeight: '50px',
                    transition: 'all 0.2s',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>

              {error && (
                <div
                  className="mb-4 p-3 rounded-lg text-sm"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid var(--error)',
                    color: 'var(--error)'
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 font-semibold text-base transition-all"
                style={{
                  background: loading ? 'rgba(239, 68, 68, 0.6)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  minHeight: '50px',
                  opacity: loading ? 0.7 : 1,
                  boxShadow: loading ? 'none' : '0 4px 12px rgba(239, 68, 68, 0.4)',
                  transform: loading ? 'scale(0.98)' : 'scale(1)'
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.transform = 'scale(1.01)';
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {loading ? 'Sending Code...' : 'Continue'}
              </button>

              {/* Dev Login Toggle */}
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setShowDevLogin(!showDevLogin)}
                  className="text-sm"
                  style={{
                    color: 'var(--text-tertiary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  {showDevLogin ? 'Hide' : 'Show'} Quick Login (Dev)
                </button>
              </div>

              {showDevLogin && (
                <div className="mt-4">
                  <div className="mb-3">
                    <label
                      htmlFor="dev-name"
                      className="block mb-2 text-sm"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Your Name (Optional)
                    </label>
                    <input
                      type="text"
                      id="dev-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Smith"
                      className="w-full px-4 py-3 rounded-lg text-base"
                      style={{
                        background: 'var(--bg-hover)',
                        border: '2px solid var(--border-default)',
                        color: 'var(--text-primary)',
                        minHeight: '50px'
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleQuickLogin}
                    disabled={loading}
                    className="w-full py-3 rounded-lg font-semibold text-base transition-all"
                    style={{
                      background: 'var(--bg-hover)',
                      color: 'var(--text-primary)',
                      border: '2px solid var(--roof-red)',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      minHeight: '50px'
                    }}
                  >
                    Quick Login (Skip Code)
                  </button>
                </div>
              )}
            </form>
          ) : (
            // Step 2: Code Verification
            <form onSubmit={handleCodeSubmit}>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setCode('');
                    setError('');
                  }}
                  className="mb-4 text-sm flex items-center"
                  style={{
                    color: 'var(--text-tertiary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  ← Back
                </button>

                <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                  We sent a verification code to:
                </p>
                <p
                  className="mb-6 font-semibold"
                  style={{ color: 'var(--roof-red)' }}
                >
                  {email}
                </p>

                {generatedCode && (
                  <div
                    className="mb-4 p-4 rounded-lg text-center"
                    style={{
                      background: 'rgba(196, 30, 58, 0.1)',
                      border: '1px solid var(--roof-red)'
                    }}
                  >
                    <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                      MVP Test Code (check console):
                    </p>
                    <p
                      className="text-2xl font-bold"
                      style={{ color: 'var(--roof-red)' }}
                    >
                      {generatedCode}
                    </p>
                  </div>
                )}

                <label
                  htmlFor="code"
                  className="block mb-2 text-sm font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Verification Code
                </label>
                <input
                  type="text"
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  required
                  autoFocus
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-lg text-base text-center text-2xl tracking-widest font-bold"
                  style={{
                    background: 'var(--bg-hover)',
                    border: '2px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    minHeight: '60px'
                  }}
                />
              </div>

              <div className="mb-6">
                <label
                  htmlFor="name"
                  className="block mb-2 text-sm font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Your Name (Optional)
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full px-4 py-3 rounded-lg text-base"
                  style={{
                    background: 'var(--bg-hover)',
                    border: '2px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    minHeight: '50px'
                  }}
                />
              </div>

              {/* Remember Me Checkbox */}
              <div className="mb-6">
                <label
                  className="flex items-center cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="mr-3"
                    style={{
                      width: '20px',
                      height: '20px',
                      accentColor: 'var(--roof-red)',
                      cursor: 'pointer'
                    }}
                  />
                  <span className="text-sm font-semibold">
                    Remember me for 30 days
                  </span>
                </label>
                <p className="text-xs mt-2 ml-8" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                  {rememberMe
                    ? 'Your session will be saved for 30 days'
                    : 'You will need to login again when you close the browser'}
                </p>
              </div>

              {error && (
                <div
                  className="mb-4 p-3 rounded-lg text-sm"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid var(--error)',
                    color: 'var(--error)'
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg font-semibold text-base transition-all"
                style={{
                  background: loading ? 'var(--roof-red-darker)' : 'var(--roof-red)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  minHeight: '50px',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? 'Verifying...' : 'Login'}
              </button>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={handleEmailSubmit}
                  className="text-sm"
                  style={{
                    color: 'var(--text-tertiary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Resend Code
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm" style={{
          color: 'rgba(255, 255, 255, 0.5)',
          fontWeight: 500
        }}>
          <p style={{ marginBottom: '4px' }}>S21 Field Assistant</p>
          <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.4)' }}>
            Secure email authentication
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
