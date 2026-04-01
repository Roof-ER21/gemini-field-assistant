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
      // Confirm step
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
              {mode === 'setup' ? <Key size={22} /> : <Shield size={22} />}
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {mode === 'setup' ? 'Set Admin PIN' : 'Admin Access'}
              </h2>
              <p className="text-sm text-slate-300">
                {mode === 'setup'
                  ? 'Create a 4-6 digit PIN to secure admin access'
                  : 'Enter your PIN to continue'}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {mode === 'setup' && step === 'confirm'
                ? 'Confirm PIN'
                : mode === 'setup'
                ? 'Choose PIN (4-6 digits)'
                : 'Enter PIN'}
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPin ? 'text' : 'password'}
                value={currentPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCurrentPin(val);
                  setError('');
                }}
                className="w-full px-4 py-3 text-center text-2xl tracking-[0.5em] border-2 border-gray-200 rounded-xl focus:border-slate-600 focus:ring-2 focus:ring-slate-200 outline-none font-mono"
                placeholder="••••"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 px-4 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || currentPin.length < 4}
              className="flex-1 py-3 px-4 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Lock size={16} />
                  {mode === 'setup' && step === 'enter' ? 'Next' : mode === 'setup' ? 'Set PIN' : 'Unlock'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminPinModal;
