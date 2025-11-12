import React, { useEffect, useState } from 'react';

interface ToastProps {
  id: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'celebration';
  onDismiss: (id: string) => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  id,
  title,
  message,
  type = 'info',
  onDismiss,
  duration
}) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (duration && duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(id);
    }, 300); // Wait for exit animation
  };

  const getTypeStyles = () => {
    switch (type) {
      case 'celebration':
        return 'bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white border-none';
      case 'success':
        return 'bg-green-500 text-white border-green-600';
      case 'warning':
        return 'bg-yellow-500 text-black border-yellow-600';
      case 'error':
        return 'bg-red-500 text-white border-red-600';
      case 'info':
      default:
        return 'bg-blue-500 text-white border-blue-600';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'celebration':
        return '🎉';
      case 'success':
        return '✓';
      case 'warning':
        return '⚠';
      case 'error':
        return '✕';
      case 'info':
      default:
        return 'ℹ';
    }
  };

  return (
    <div
      className={`
        fixed top-4 right-4 z-[9999] max-w-md w-full
        ${getTypeStyles()}
        rounded-lg shadow-2xl border-2 p-4
        transform transition-all duration-300 ease-in-out
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
      `}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg mb-1 break-words">
            {title}
          </h3>
          <p className="text-sm opacity-90 break-words whitespace-pre-wrap">
            {message}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 ml-2 text-white/80 hover:text-white transition-colors"
          aria-label="Dismiss notification"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Array<{
    id: string;
    title: string;
    message: string;
    type?: 'info' | 'success' | 'warning' | 'error' | 'celebration';
    duration?: number;
  }>;
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed top-0 right-0 p-4 z-[9999] pointer-events-none">
      <div className="space-y-4 pointer-events-auto">
        {toasts.map((toast, index) => (
          <div
            key={toast.id}
            style={{
              transform: `translateY(${index * 10}px)`,
              zIndex: 9999 - index
            }}
          >
            <Toast {...toast} onDismiss={onDismiss} />
          </div>
        ))}
      </div>
    </div>
  );
};
