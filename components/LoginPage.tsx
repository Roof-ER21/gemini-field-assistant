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
      const result = await authService.verifyLoginCode(email, code, name || undefined);

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
      const result = await authService.quickLogin(email, name || undefined);

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
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div
            className="inline-block px-6 py-3 mb-4 rounded-lg"
            style={{
              background: 'var(--roof-red)',
              fontWeight: 700,
              fontSize: '24px',
              letterSpacing: '1.5px'
            }}
          >
            ROOF ER
          </div>
          <h1
            className="text-3xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            S21 Field AI
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '15px' }}>
            Your intelligent field assistant
          </p>
        </div>

        {/* Login Card */}
        <div
          className="rounded-lg p-8 shadow-lg"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)'
          }}
        >
          {step === 'email' ? (
            // Step 1: Email Input
            <form onSubmit={handleEmailSubmit}>
              <div className="mb-6">
                <label
                  htmlFor="email"
                  className="block mb-2 text-sm font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
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
                  className="w-full px-4 py-3 rounded-lg text-base"
                  style={{
                    background: 'var(--bg-hover)',
                    border: '2px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    minHeight: '50px'
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
        <div className="mt-6 text-center text-xs" style={{ color: 'var(--text-disabled)' }}>
          <p>Roof-ER Field Assistant</p>
          <p className="mt-1">Secure email authentication</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
