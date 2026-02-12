/**
 * Login Page - Clean Red/Black Design
 * Mobile-first, properly sized for all screens
 *
 * Flow (Direct Login - No Email Verification):
 * 1. Email entry → Check if user exists
 * 2a. Existing user → Logged in immediately
 * 2b. New user → "Create Account" with name → Account created & logged in
 */

import React, { useState } from 'react';
import { authService } from '../services/authService';
import LegalPage from './LegalPage';
import { Mail, User, ArrowLeft, Shield, UserPlus } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

type Step = 'email' | 'login' | 'signup' | 'code';

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  // Load saved email from localStorage (persists across app closes)
  const savedEmail = localStorage.getItem('s21_login_email') || '';

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(savedEmail);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [existingUserName, setExistingUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showLegal, setShowLegal] = useState<'privacy' | 'terms' | null>(null);
  const [isSignup, setIsSignup] = useState(false);

  // Save email as user types (so they don't lose it if app closes)
  const handleEmailChange = (value: string) => {
    setEmail(value);
    localStorage.setItem('s21_login_email', value);
  };

  // Clear saved login info after successful login
  const clearSavedLoginInfo = () => {
    localStorage.removeItem('s21_login_email');
    localStorage.removeItem('s21_login_name');
  };

  // Step 1: Check if email exists
  const handleEmailCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // First check for auto-login (existing valid token) - doesn't send code
      const autoLoginResult = await authService.tryAutoLogin(email, rememberMe);
      if (autoLoginResult.success) {
        clearSavedLoginInfo();
        onLoginSuccess();
        return;
      }

      // Check if user exists in database
      const result = await authService.checkEmail(email);

      if (!result.success) {
        setError(result.error || 'Failed to check email');
        setLoading(false);
        return;
      }

      if (result.exists) {
        // Existing user - log in directly (no verification code)
        setExistingUserName(result.name || '');
        setIsSignup(false);

        // Direct login - no code needed
        const loginResult = await authService.requestLoginCode(email, result.name || '', rememberMe);
        if (loginResult.success) {
          clearSavedLoginInfo();
          onLoginSuccess();
          return;
        } else {
          setError(loginResult.message);
        }
      } else if (result.canSignup) {
        // New user - go to signup step
        setIsSignup(true);
        setStep('signup');
      } else {
        setError('Unable to sign up with this email. Please try a different email address.');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2a: Existing user requests code
  const handleLoginRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authService.requestLoginCode(email, existingUserName, rememberMe);
      if (result.success) {
        if (result.autoLoginSuccess) {
          clearSavedLoginInfo();
          onLoginSuccess();
          return;
        }
        setStep('code');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2b: New user signs up (direct - no code verification)
  const handleSignupRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || name.trim().length < 2) {
      setError('Please enter your full name');
      return;
    }

    setLoading(true);

    try {
      const result = await authService.requestSignup(email, name);
      if (result.success) {
        // Direct signup - logged in immediately
        clearSavedLoginInfo();
        onLoginSuccess();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify code
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userName = isSignup ? name : existingUserName;
      const result = await authService.verifyLoginCode(email, code, userName, rememberMe);
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

  // Go back to previous step
  const handleBack = () => {
    setError('');
    setCode('');
    if (step === 'code') {
      // For existing users, go back to email (since we skip login step)
      // For new users, go back to signup
      if (isSignup) {
        setStep('signup');
      } else {
        setStep('email');
        setExistingUserName('');
      }
    } else if (step === 'login' || step === 'signup') {
      setStep('email');
      setName('');
      setExistingUserName('');
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
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#a1a1aa',
    marginBottom: '8px'
  };

  const buttonStyle: React.CSSProperties = {
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
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#dc2626';
    e.target.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.15)';
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#262626';
    e.target.style.boxShadow = 'none';
  };

  // Render error message
  const renderError = () => error && (
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
  );

  // Render back button
  const renderBackButton = () => (
    <button
      type="button"
      onClick={handleBack}
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
  );

  // Render remember me checkbox
  const renderRememberMe = () => (
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
  );

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
              alt="ROOF-ER S21"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                padding: '8px'
              }}
              onError={(e) => {
                e.currentTarget.parentElement!.style.background = 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          {/* S21 above ROOF ER */}
          <div
            style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#dc2626',
              letterSpacing: '0.1em',
              marginBottom: '4px'
            }}
          >
            S21
          </div>
          <h1
            style={{
              fontSize: '32px',
              fontWeight: '700',
              margin: '0 0 6px 0',
              letterSpacing: '-0.02em'
            }}
          >
            <span style={{ color: '#ffffff' }}>ROOF</span>
            <span style={{ color: '#dc2626' }}> ER</span>
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

        {/* Step 1: Email Entry */}
        {step === 'email' && (
          <form onSubmit={handleEmailCheck}>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder="you@yourcompany.com"
                required
                autoComplete="email"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
              <p style={{ fontSize: '12px', color: '#52525b', margin: '8px 0 0 0' }}>
                Enter your work email to get started
              </p>
            </div>

            {renderRememberMe()}
            {renderError()}

            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? 'Checking...' : (
                <>
                  <Mail style={{ width: '18px', height: '18px' }} />
                  Continue
                </>
              )}
            </button>
          </form>
        )}

        {/* Step 2a: Existing User Login */}
        {step === 'login' && (
          <form onSubmit={handleLoginRequest}>
            {renderBackButton()}

            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  margin: '0 auto 12px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#ffffff'
                }}
              >
                {existingUserName.charAt(0).toUpperCase() || email.charAt(0).toUpperCase()}
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', margin: '0 0 4px 0' }}>
                Welcome back{existingUserName ? `, ${existingUserName.split(' ')[0]}` : ''}!
              </h2>
              <p style={{ fontSize: '14px', color: '#71717a', margin: 0 }}>
                {email}
              </p>
            </div>

            {renderRememberMe()}
            {renderError()}

            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? 'Sending code...' : (
                <>
                  <Mail style={{ width: '18px', height: '18px' }} />
                  Send Verification Code
                </>
              )}
            </button>
          </form>
        )}

        {/* Step 2b: New User Signup */}
        {step === 'signup' && (
          <form onSubmit={handleSignupRequest}>
            {renderBackButton()}

            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  margin: '0 auto 12px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <UserPlus style={{ width: '28px', height: '28px', color: '#ffffff' }} />
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', margin: '0 0 4px 0' }}>
                Create Your Account
              </h2>
              <p style={{ fontSize: '14px', color: '#71717a', margin: 0 }}>
                {email}
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Your Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                required
                autoComplete="name"
                autoFocus
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            {renderRememberMe()}
            {renderError()}

            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? 'Creating account...' : (
                <>
                  <UserPlus style={{ width: '18px', height: '18px' }} />
                  Create Account & Sign In
                </>
              )}
            </button>
          </form>
        )}

        {/* Step 3: Code Verification (legacy - no longer used) */}
        {step === 'code' && (
          <form onSubmit={handleCodeSubmit}>
            {renderBackButton()}

            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: '#a1a1aa', margin: '0 0 4px 0' }}>
                {isSignup ? 'Creating account for' : 'Logging in as'}
              </p>
              <p style={{ fontSize: '15px', fontWeight: '600', color: '#dc2626', margin: 0 }}>
                {email}
              </p>
            </div>

            <div
              style={{
                padding: '16px',
                marginBottom: '20px',
                borderRadius: '12px',
                background: '#171717',
                border: '1px solid #262626',
                textAlign: 'center'
              }}
            >
              <Mail style={{ width: '32px', height: '32px', color: '#dc2626', margin: '0 auto 8px' }} />
              <p style={{ fontSize: '14px', color: '#ffffff', margin: '0 0 4px 0' }}>
                Check your email
              </p>
              <p style={{ fontSize: '12px', color: '#71717a', margin: 0 }}>
                We sent a 6-digit code to your inbox
              </p>
            </div>

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
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            {renderError()}

            <button
              type="submit"
              disabled={loading || code.length < 6}
              style={{
                ...buttonStyle,
                background: loading || code.length < 6
                  ? '#4b1818'
                  : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                cursor: loading || code.length < 6 ? 'not-allowed' : 'pointer',
                boxShadow: loading || code.length < 6 ? 'none' : '0 4px 16px rgba(220, 38, 38, 0.35)'
              }}
            >
              {loading ? 'Verifying...' : (
                <>
                  <Shield style={{ width: '18px', height: '18px' }} />
                  {isSignup ? 'Complete Signup' : 'Sign In'}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (isSignup) {
                  handleSignupRequest({ preventDefault: () => {} } as React.FormEvent);
                } else {
                  handleLoginRequest({ preventDefault: () => {} } as React.FormEvent);
                }
              }}
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
            ROOF-ER S21 - The Roof Docs
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
