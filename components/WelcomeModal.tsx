import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import memoryService from '../services/memoryService';

interface WelcomeModalProps {
  isFirstLogin: boolean;
  onComplete: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isFirstLogin, onComplete }) => {
  const [nickname, setNickname] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGreeting, setShowGreeting] = useState(!isFirstLogin);
  const [greetingMessage, setGreetingMessage] = useState('');

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
            `Yo ${savedNickname}! Time to make it happen.`,
          ];

          const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
          setGreetingMessage(randomGreeting);

          // Auto-dismiss after 5 seconds
          setTimeout(() => {
            onComplete();
          }, 5000);
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
    try {
      await memoryService.setUserNickname(nickname.trim());

      // Show success message
      setShowGreeting(true);
      setGreetingMessage(`Great to meet you, ${nickname.trim()}! I'm here to help with anything you need.`);

      // Close modal after 2 seconds
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (error) {
      console.error('Error saving nickname:', error);
      setIsSubmitting(false);
    }
  };

  // First login flow - nickname collection
  if (isFirstLogin && !showGreeting) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px'
      }}>
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
          maxWidth: '400px',
          width: '100%',
          overflow: 'hidden'
        }}>
          {/* Susan Avatar Header */}
          <div style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            padding: '24px',
            textAlign: 'center',
            color: '#ffffff'
          }}>
            <div style={{
              width: '96px',
              height: '96px',
              margin: '0 auto 16px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '4px solid rgba(255, 255, 255, 0.2)'
            }}>
              <img
                src="/roofer-s21-logo.webp"
                alt="Susan 21"
                style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }}
              />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Welcome to the team!</h2>
          </div>

          {/* Content */}
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px', textAlign: 'center' }}>
              <p style={{ color: '#374151', fontSize: '18px', marginBottom: '8px' }}>
                I'm <span style={{ fontWeight: 'bold', color: '#dc2626' }}>Susan 21</span>, your AI assistant.
              </p>
              <p style={{ color: '#6b7280' }}>
                What would you like me to call you?
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '24px' }}>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Enter your nickname..."
                  autoFocus
                  maxLength={50}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '16px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    color: '#111827'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#dc2626'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              <button
                type="submit"
                disabled={!nickname.trim() || isSubmitting}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: (!nickname.trim() || isSubmitting) ? '#d1d5db' : '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: (!nickname.trim() || isSubmitting) ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmitting ? 'Saving...' : 'Let\'s Go!'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Greeting message (first login success or returning user)
  if (showGreeting) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 p-4 pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <div
            className="bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg shadow-2xl p-4 flex items-center justify-between animate-slide-down cursor-pointer"
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
              <p className="text-lg font-medium flex-1">{greetingMessage}</p>
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
