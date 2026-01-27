import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const TOAST_ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_COLORS = {
  success: {
    bg: 'bg-green-50 dark:bg-green-900/30',
    border: 'border-green-200 dark:border-green-800',
    icon: 'text-green-600 dark:text-green-400',
    title: 'text-green-800 dark:text-green-200',
    message: 'text-green-700 dark:text-green-300',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/30',
    border: 'border-red-200 dark:border-red-800',
    icon: 'text-red-600 dark:text-red-400',
    title: 'text-red-800 dark:text-red-200',
    message: 'text-red-700 dark:text-red-300',
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/30',
    border: 'border-yellow-200 dark:border-yellow-800',
    icon: 'text-yellow-600 dark:text-yellow-400',
    title: 'text-yellow-800 dark:text-yellow-200',
    message: 'text-yellow-700 dark:text-yellow-300',
  },
  info: {
    bg: 'bg-zinc-100 dark:bg-zinc-800/30',
    border: 'border-zinc-300 dark:border-zinc-700',
    icon: 'text-zinc-600 dark:text-zinc-400',
    title: 'text-zinc-800 dark:text-zinc-200',
    message: 'text-zinc-700 dark:text-zinc-300',
  },
};

const DEFAULT_DURATION = 4000;

/**
 * Individual Toast component
 */
const Toast: React.FC<{
  toast: ToastMessage;
  onRemove: (id: string) => void;
}> = ({ toast, onRemove }) => {
  const Icon = TOAST_ICONS[toast.type];
  const colors = TOAST_COLORS[toast.type];

  useEffect(() => {
    const duration = toast.duration ?? DEFAULT_DURATION;
    if (duration > 0) {
      const timer = setTimeout(() => {
        onRemove(toast.id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg ${colors.bg} ${colors.border} max-w-sm`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${colors.icon}`} />

      <div className="flex-1 min-w-0">
        <p className={`font-medium ${colors.title}`}>{toast.title}</p>
        {toast.message && (
          <p className={`text-sm mt-1 ${colors.message}`}>{toast.message}</p>
        )}
      </div>

      <button
        onClick={() => onRemove(toast.id)}
        className="flex-shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-gray-500" />
      </button>
    </motion.div>
  );
};

/**
 * Toast Container - displays all active toasts
 */
const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
};

/**
 * Toast Provider - wraps app to provide toast functionality
 */
export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const success = useCallback((title: string, message?: string) => {
    addToast({ type: 'success', title, message });
  }, [addToast]);

  const error = useCallback((title: string, message?: string) => {
    addToast({ type: 'error', title, message });
  }, [addToast]);

  const warning = useCallback((title: string, message?: string) => {
    addToast({ type: 'warning', title, message });
  }, [addToast]);

  const info = useCallback((title: string, message?: string) => {
    addToast({ type: 'info', title, message });
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

/**
 * Hook to use toast notifications
 */
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

/**
 * Standalone toast function for use outside React components
 * Uses a simple fallback when context isn't available
 */
let globalToastHandler: ToastContextType | null = null;

export const setGlobalToastHandler = (handler: ToastContextType) => {
  globalToastHandler = handler;
};

export const toast = {
  success: (title: string, message?: string) => {
    if (globalToastHandler) {
      globalToastHandler.success(title, message);
    } else {
      console.log(`[Toast Success] ${title}${message ? `: ${message}` : ''}`);
    }
  },
  error: (title: string, message?: string) => {
    if (globalToastHandler) {
      globalToastHandler.error(title, message);
    } else {
      console.error(`[Toast Error] ${title}${message ? `: ${message}` : ''}`);
    }
  },
  warning: (title: string, message?: string) => {
    if (globalToastHandler) {
      globalToastHandler.warning(title, message);
    } else {
      console.warn(`[Toast Warning] ${title}${message ? `: ${message}` : ''}`);
    }
  },
  info: (title: string, message?: string) => {
    if (globalToastHandler) {
      globalToastHandler.info(title, message);
    } else {
      console.info(`[Toast Info] ${title}${message ? `: ${message}` : ''}`);
    }
  },
};

export default Toast;
