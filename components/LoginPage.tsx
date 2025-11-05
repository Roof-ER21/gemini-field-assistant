/**
 * Login Page Component - Compact & Clean Design
 * Simple email-based authentication for S21 Field AI
 * Mobile-first, minimal interface showing off branded background
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
      {/* Branded Background - Wood texture with ROOFER text */}
      <div style={{
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundImage: 'url(/roofer-logo-full.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        opacity: '0.12',
        pointerEvents: 'none'
      }} />

      {/* Gradient overlay for better contrast */}
      <div style={{
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        background: 'radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.75) 100%)',
        pointerEvents: 'none'
      }} />

      {/* Compact Centered Login Card */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '340px',
          background: 'linear-gradient(135deg, rgba(26, 31, 46, 0.96) 0%, rgba(15, 20, 25, 0.96) 100%)',
          borderRadius: '12px',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(239, 68, 68, 0.15)',
          backdropFilter: 'blur(20px)',
          padding: '28px'
        }}
      >
        {/* Logo - Clean app icon (black rounded square with Roof ER branding) */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '16px'
        }}>
          <img
            src="/roofer-logo-icon.png"
            alt="S21 ROOFER"
            style={{
              width: '85px',
              height: '85px',
              borderRadius: '8px',
              filter: 'drop-shadow(0 4px 16px rgba(239, 68, 68, 0.35))'
            }}
          />
        </div>

        {/* Title - Reduced size */}
        <h1
          className="text-center font-bold"
          style={{
            color: '#ffffff',
            fontSize: '1.625rem',
            letterSpacing: '-0.03em',
            marginBottom: '8px',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.9)'
          }}
        >
          S21 ROOFER
        </h1>

        {/* Subtitle - Smaller, lighter */}
        <p
          className="text-center"
          style={{
            color: 'rgba(255, 255, 255, 0.65)',
            fontSize: '0.875rem',
            fontWeight: 400,
            marginBottom: '20px',
            textShadow: '0 1px 6px rgba(0, 0, 0, 0.9)'
          }}
        >
          Your intelligent field assistant
        </p>

        {/* Login Forms */}
        {step === 'email' ? (
          // Step 1: Email Input
          <form onSubmit={handleEmailSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="email"
                className="block text-sm font-semibold"
                style={{
                  color: 'rgba(255, 255, 255, 0.9)',
                  marginBottom: '8px'
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
                className="w-full px-4"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  height: '48px',
                  fontSize: '0.9375rem',
                  transition: 'all 0.2s',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.12)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {error && (
              <div
                className="text-sm"
                style={{
                  marginBottom: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ff6b6b'
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold transition-all"
              style={{
                background: loading ? 'rgba(239, 68, 68, 0.65)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                height: '48px',
                fontSize: '0.9375rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.75 : 1,
                boxShadow: loading ? 'none' : '0 4px 14px rgba(239, 68, 68, 0.45)',
                transform: loading ? 'scale(0.98)' : 'scale(1)',
                marginBottom: '12px'
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.transform = 'scale(1.015)';
              }}
              onMouseLeave={(e) => {
                if (!loading) e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {loading ? 'Sending Code...' : 'Continue'}
            </button>

            {/* Dev Login Toggle */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowDevLogin(!showDevLogin)}
                style={{
                  color: 'rgba(255, 255, 255, 0.45)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '0.75rem',
                  padding: '4px'
                }}
              >
                {showDevLogin ? 'Hide' : 'Show'} Quick Login (Dev)
              </button>
            </div>

            {showDevLogin && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label
                    htmlFor="dev-name"
                    className="block text-sm"
                    style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      marginBottom: '6px'
                    }}
                  >
                    Your Name (Optional)
                  </label>
                  <input
                    type="text"
                    id="dev-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Smith"
                    className="w-full px-4"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      height: '44px',
                      fontSize: '0.9375rem'
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleQuickLogin}
                  disabled={loading}
                  className="w-full font-semibold transition-all"
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    borderRadius: '8px',
                    height: '44px',
                    fontSize: '0.875rem',
                    cursor: loading ? 'not-allowed' : 'pointer'
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
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setCode('');
                setError('');
              }}
              className="text-sm flex items-center"
              style={{
                color: 'rgba(255, 255, 255, 0.6)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                marginBottom: '16px',
                padding: '4px 0'
              }}
            >
              ← Back
            </button>

            <p style={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.875rem',
              marginBottom: '8px'
            }}>
              We sent a verification code to:
            </p>
            <p
              className="font-semibold"
              style={{
                color: '#ef4444',
                fontSize: '0.9375rem',
                marginBottom: '16px'
              }}
            >
              {email}
            </p>

            {generatedCode && (
              <div
                className="text-center"
                style={{
                  marginBottom: '16px',
                  padding: '14px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)'
                }}
              >
                <p style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.6)',
                  marginBottom: '6px'
                }}>
                  MVP Test Code:
                </p>
                <p
                  className="font-bold"
                  style={{
                    fontSize: '1.75rem',
                    color: '#ef4444',
                    letterSpacing: '0.1em'
                  }}
                >
                  {generatedCode}
                </p>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="code"
                className="block text-sm font-semibold"
                style={{
                  color: 'rgba(255, 255, 255, 0.9)',
                  marginBottom: '8px'
                }}
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
                className="w-full text-center font-bold tracking-widest"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  height: '52px',
                  fontSize: '1.5rem',
                  letterSpacing: '0.15em'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="name"
                className="block text-sm font-semibold"
                style={{
                  color: 'rgba(255, 255, 255, 0.9)',
                  marginBottom: '8px'
                }}
              >
                Your Name (Optional)
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                className="w-full px-4"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  height: '48px',
                  fontSize: '0.9375rem'
                }}
              />
            </div>

            {/* Remember Me Checkbox */}
            <div style={{ marginBottom: '16px' }}>
              <label
                className="flex items-center cursor-pointer"
                style={{ color: 'rgba(255, 255, 255, 0.75)' }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    marginRight: '10px',
                    accentColor: '#ef4444',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  Remember me on this device
                </span>
              </label>
              <p style={{
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.45)',
                marginTop: '6px',
                marginLeft: '28px'
              }}>
                {rememberMe
                  ? 'Stay logged in for 1 year'
                  : 'Login again when browser closes'}
              </p>
            </div>

            {error && (
              <div
                className="text-sm"
                style={{
                  marginBottom: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ff6b6b'
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold transition-all"
              style={{
                background: loading ? 'rgba(239, 68, 68, 0.65)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                height: '48px',
                fontSize: '0.9375rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.75 : 1,
                boxShadow: loading ? 'none' : '0 4px 14px rgba(239, 68, 68, 0.45)',
                marginBottom: '12px'
              }}
            >
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleEmailSubmit}
                style={{
                  color: 'rgba(255, 255, 255, 0.45)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '0.75rem',
                  padding: '4px'
                }}
              >
                Resend Code
              </button>
            </div>
          </form>
        )}

        {/* Footer - Small text */}
        <div
          className="text-center"
          style={{
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <p style={{
            fontSize: '0.8125rem',
            color: 'rgba(255, 255, 255, 0.5)',
            fontWeight: 500,
            marginBottom: '4px'
          }}>
            S21 Field Assistant
          </p>
          <p style={{
            fontSize: '0.6875rem',
            color: 'rgba(255, 255, 255, 0.35)'
          }}>
            Secure email authentication
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
