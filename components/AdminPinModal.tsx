import React, { useState, useRef, useEffect } from 'react';
import { Lock, Eye, EyeOff, Shield, Key } from 'lucide-react';

interface AdminPinModalProps {
  mode: 'verify' | 'setup';
  onSuccess: (token: string) => void;
  onCancel: () => void;
  userEmail: string;
}

const AdminPinModal: React.FC<AdminPinModalProps> = ({ mode, onSuccess, onCancel, userEmail }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'setup') {
      if (step === 'enter') {
        if (!/^\d{4,6}$/.test(pin)) {
          setError('PIN must be 4-6 digits');
          return;
        }
        setStep('confirm');
        setConfirmPin('');
        return;
      }
      if (confirmPin !== pin) {
        setError('PINs do not match');
        setConfirmPin('');
        return;
      }
    } else {
      if (!pin) {
        setError('Enter your PIN');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = mode === 'setup' ? '/api/admin/auth/set-pin' : '/api/admin/auth/verify-pin';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail,
        },
        body: JSON.stringify({ pin }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        onSuccess(result.token);
      } else {
        setError(result.error || 'Verification failed');
        if (mode === 'verify') setPin('');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const currentPin = step === 'confirm' ? confirmPin : pin;
  const setCurrentPin = step === 'confirm' ? setConfirmPin : setPin;

  const label = mode === 'setup' && step === 'confirm'
    ? 'Confirm PIN'
    : mode === 'setup'
    ? 'Choose PIN (4-6 digits)'
    : 'Enter PIN';

  const buttonText = mode === 'setup' && step === 'enter'
    ? 'Next'
    : mode === 'setup'
    ? 'Set PIN'
    : 'Unlock';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: 10001,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '360px',
          background: 'var(--bg-primary, #000)',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle, #2a2a2a)',
          overflow: 'hidden',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.8)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 24px 20px',
            textAlign: 'center',
            borderBottom: '1px solid var(--border-subtle, #2a2a2a)',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              margin: '0 auto 16px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {mode === 'setup'
              ? <Key style={{ width: '28px', height: '28px', color: '#fff' }} />
              : <Shield style={{ width: '28px', height: '28px', color: '#fff' }} />
            }
          </div>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: '600',
              color: 'var(--text-primary, #fff)',
              margin: '0 0 6px 0',
            }}
          >
            {mode === 'setup' ? 'Set Admin PIN' : 'Admin Access'}
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary, #999)',
              margin: 0,
            }}
          >
            {mode === 'setup'
              ? 'Create a 4-6 digit PIN to secure admin access'
              : 'Enter your PIN to continue'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: 'var(--text-secondary, #999)',
              marginBottom: '10px',
            }}
          >
            {label}
          </label>

          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <input
              ref={inputRef}
              type={showPin ? 'text' : 'password'}
              value={currentPin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCurrentPin(val);
                setError('');
              }}
              style={{
                width: '100%',
                padding: '14px 48px 14px 16px',
                textAlign: 'center',
                fontSize: '28px',
                letterSpacing: '0.5em',
                fontFamily: 'monospace',
                background: 'var(--bg-secondary, #0a0a0a)',
                color: 'var(--text-primary, #fff)',
                border: '1px solid var(--border-subtle, #2a2a2a)',
                borderRadius: '12px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="••••"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary, #999)',
                padding: '4px',
              }}
            >
              {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <div
              style={{
                padding: '10px',
                marginBottom: '16px',
                borderRadius: '10px',
                background: 'rgba(220, 38, 38, 0.15)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                color: '#f87171',
                fontSize: '13px',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '14px',
                border: '1px solid var(--border-subtle, #2a2a2a)',
                borderRadius: '12px',
                background: 'transparent',
                color: 'var(--text-primary, #fff)',
                fontSize: '15px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || currentPin.length < 4}
              style={{
                flex: 1,
                padding: '14px',
                border: 'none',
                borderRadius: '12px',
                background: currentPin.length < 4 || loading ? '#333' : '#dc2626',
                color: currentPin.length < 4 || loading ? '#666' : '#fff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: currentPin.length < 4 || loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {loading ? (
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              ) : (
                <>
                  <Lock size={16} />
                  {buttonText}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AdminPinModal;
