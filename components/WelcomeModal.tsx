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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-md w-full overflow-hidden">
          {/* Susan Avatar Header */}
          <div className="bg-gradient-to-r from-red-600 to-red-700 p-6 text-white text-center">
            <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center border-4 border-white/20">
              <img
                src="/roofer-s21-logo.webp"
                alt="Susan 21"
                className="w-20 h-20 rounded-full object-cover"
              />
            </div>
            <h2 className="text-2xl font-bold">Welcome to the team!</h2>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="mb-6">
              <p className="text-gray-700 text-center text-lg mb-2">
                I'm <span className="font-bold text-red-600">Susan 21</span>, your AI assistant.
              </p>
              <p className="text-gray-600 text-center">
                What would you like me to call you?
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Enter your nickname..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-lg"
                  autoFocus
                  maxLength={50}
                  disabled={isSubmitting}
                />
              </div>

              <button
                type="submit"
                disabled={!nickname.trim() || isSubmitting}
                className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
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
