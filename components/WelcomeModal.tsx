import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import memoryService from '../services/memoryService';
import { authService } from '../services/authService';
import { getApiBaseUrl } from '../services/config';

interface WelcomeModalProps {
  isFirstLogin: boolean;
  onComplete: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isFirstLogin, onComplete }) => {
  const user = authService.getCurrentUser();
  const suggestedName = (user?.name || '').trim().split(/\s+/)[0] || '';
  const [nickname, setNickname] = useState(suggestedName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [showGreeting, setShowGreeting] = useState(!isFirstLogin);
  const [greetingMessage, setGreetingMessage] = useState('');
  const [continuityMessage, setContinuityMessage] = useState('');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  // Generate time-aware greeting for returning users
  useEffect(() => {
    if (!isFirstLogin) {
      const loadGreeting = async () => {
        const savedNickname = await memoryService.getUserNickname();
        if (savedNickname) {
          const hour = new Date().getHours();
          let timeOfDay = 'evening';
          if (hour < 12) timeOfDay = 'morning';
          else if (hour < 18) timeOfDay = 'afternoon';

          const greetings = [
            `Hey ${savedNickname}! Ready to make some moves today?`,
            `Welcome back, ${savedNickname}! Let's get after it.`,
            `Good ${timeOfDay}, ${savedNickname}! What are we conquering today?`,
            `${savedNickname}! Good to see you back. Let's crush it.`,
          ];

          const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
          setGreetingMessage(randomGreeting);

          // Continuity: reference the rep's last conversation so Susan visibly
          // remembers them (summary written on session close / new chat)
          let continuity = '';
          try {
            const email = authService.getCurrentUser()?.email;
            if (email) {
              const res = await fetch(`${getApiBaseUrl()}/memory/summaries?limit=1`, {
                headers: { 'x-user-email': email },
              });
              if (res.ok) {
                const rows = await res.json();
                const last = Array.isArray(rows) ? rows[0] : null;
                if (last?.created_at) {
                  const ageDays = (Date.now() - new Date(last.created_at).getTime()) / 86400000;
                  if (ageDays <= 7) {
                    const parse = (v: unknown): string[] => {
                      if (Array.isArray(v)) return v.filter(Boolean);
                      if (typeof v === 'string') { try { return JSON.parse(v) || []; } catch { return []; } }
                      return [];
                    };
                    const actionItems = parse(last.action_items);
                    const topics = parse(last.topics);
                    if (actionItems.length > 0) {
                      continuity = `Still open from last time: ${actionItems[0]}`;
                    } else if (topics.length > 0) {
                      continuity = `Last time we worked on ${topics[0]}. Pick up where we left off anytime.`;
                    }
                  }
                }
              }
            }
          } catch { /* continuity is a bonus, never block the greeting */ }
          setContinuityMessage(continuity);

          // Auto-dismiss (longer when there's a continuity line to read)
          timersRef.current.push(setTimeout(onComplete, continuity ? 8000 : 5000));
        } else {
          // No nickname found, shouldn't happen but handle gracefully
          onComplete();
        }
      };

      loadGreeting();
    }
  }, [isFirstLogin, onComplete]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSaveError(false);
    try {
      await memoryService.setUserNickname(nickname.trim());

      // Show success message
      setShowGreeting(true);
      setGreetingMessage(`Great to meet you, ${nickname.trim()}! I'm here to help with anything you need.`);

      // Close modal after 2 seconds
      timersRef.current.push(setTimeout(onComplete, 2000));
    } catch (error) {
      console.error('Error saving nickname:', error);
      setSaveError(true);
      setIsSubmitting(false);
    }
  };

  // First login flow - nickname collection
  if (isFirstLogin && !showGreeting) {
    return (
      <div
        className="welcome-modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px',
          overflowY: 'auto',
        }}
      >
        <style>{`
          @keyframes welcome-card-in {
            from { opacity: 0; transform: translateY(16px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes welcome-ring-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.35); }
            50% { box-shadow: 0 0 0 12px rgba(220, 38, 38, 0); }
          }
        `}</style>
        <div
          style={{
            backgroundColor: 'var(--bg-elevated, #2d2d2d)',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
            maxWidth: '420px',
            width: '100%',
            maxHeight: 'calc(100dvh - 32px)',
            overflowY: 'auto',
            animation: 'welcome-card-in 0.35s ease-out',
          }}
        >
          {/* Susan Avatar Header */}
          <div
            style={{
              background: 'linear-gradient(150deg, #dc2626 0%, #991b1b 60%, #7f1d1d 100%)',
              padding: '28px 24px 24px',
              textAlign: 'center',
              color: '#ffffff',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* soft glow accents */}
            <div style={{
              position: 'absolute', top: '-40px', right: '-40px', width: '160px', height: '160px',
              borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', bottom: '-60px', left: '-30px', width: '140px', height: '140px',
              borderRadius: '50%', background: 'rgba(0,0,0,0.12)', pointerEvents: 'none',
            }} />
            <div
              style={{
                width: '92px',
                height: '92px',
                margin: '0 auto 14px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid rgba(255, 255, 255, 0.3)',
                animation: 'welcome-ring-pulse 2.5s ease-in-out infinite',
                position: 'relative',
              }}
            >
              <img
                src="/roofer-s21-logo.webp"
                alt="Susan 21"
                style={{ width: '78px', height: '78px', borderRadius: '50%', objectFit: 'cover' }}
              />
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, letterSpacing: '-0.01em', position: 'relative' }}>
              Welcome to the team!
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'rgba(255,255,255,0.85)', position: 'relative' }}>
              I'm <strong>Susan 21</strong>, your AI field assistant.
            </p>
          </div>

          {/* Content */}
          <div style={{ padding: '24px' }}>
            <p style={{ color: 'var(--text-secondary, #c0c0c0)', fontSize: '15px', margin: '0 0 16px', textAlign: 'center' }}>
              What should I call you?
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Your name or nickname..."
                autoFocus
                maxLength={50}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '13px 16px',
                  border: '2px solid var(--border-default, #2a2a2a)',
                  borderRadius: '10px',
                  fontSize: '16px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  color: 'var(--text-primary, #ffffff)',
                  background: 'var(--bg-secondary, #0a0a0a)',
                  textAlign: 'center',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#dc2626')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-default, #2a2a2a)')}
              />

              {saveError && (
                <p style={{ color: '#f87171', fontSize: '13px', margin: '10px 0 0', textAlign: 'center' }}>
                  Couldn't save that — check your connection and try again.
                </p>
              )}

              <button
                type="submit"
                disabled={!nickname.trim() || isSubmitting}
                style={{
                  width: '100%',
                  marginTop: '16px',
                  padding: '14px',
                  background: (!nickname.trim() || isSubmitting)
                    ? 'var(--bg-tertiary, #1a1a1a)'
                    : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: (!nickname.trim() || isSubmitting) ? 'var(--text-disabled, #666666)' : '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: (!nickname.trim() || isSubmitting) ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  boxShadow: (!nickname.trim() || isSubmitting) ? 'none' : '0 6px 18px rgba(220, 38, 38, 0.35)',
                }}
              >
                {isSubmitting ? 'Saving...' : "Let's Go!"}
              </button>
            </form>

            <button
              type="button"
              onClick={onComplete}
              style={{
                display: 'block',
                margin: '14px auto 0',
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary, #808080)',
                fontSize: '13px',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              I'll do this later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Greeting message (first login success or returning user)
  if (showGreeting) {
    return (
      <div className="fixed top-0 left-0 right-0 p-4 pointer-events-none" style={{ zIndex: 9999 }}>
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <div
            className="text-white rounded-lg shadow-2xl p-4 flex items-center justify-between animate-slide-down cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #c41e3a 0%, #9b1830 100%)' }}
            onClick={onComplete}
          >
            <div className="flex items-center gap-4 flex-1">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20 flex-shrink-0">
                <img
                  src="/roofer-s21-logo.webp"
                  alt="Susan 21"
                  className="w-10 h-10 rounded-full object-cover"
                />
              </div>
              <div className="flex-1">
                <p className="text-lg font-medium">{greetingMessage}</p>
                {continuityMessage && (
                  <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {continuityMessage}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onComplete();
              }}
              className="ml-2 p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default WelcomeModal;
