import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function ConnectionStatus() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={offline ? 'field-connection' : 'field-connection-empty'}
    >
      {offline && (
        <>
          <WifiOff size={18} aria-hidden="true" />
          <span>You’re offline. Keep this page open. Sending and AI tools need a connection.</span>
        </>
      )}
    </div>
  );
}
