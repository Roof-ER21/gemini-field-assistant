/**
 * IncomingCallModal - Full-screen overlay for incoming 1:1 video calls
 * Polls for pending call invites and shows accept/decline UI
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { authService } from '../services/authService';
import { formatDisplayName } from '../utils/formatDisplayName';

interface PendingCall {
  id: string;
  caller_id: string;
  caller_name: string;
  caller_email: string;
  room_name: string;
  session_id: string;
  created_at: string;
}

interface IncomingCallModalProps {
  onAccept: (call: PendingCall) => void;
}

const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ onAccept }) => {
  const [pendingCall, setPendingCall] = useState<PendingCall | null>(null);
  const [declining, setDeclining] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUser = authService.getCurrentUser();

  const checkPendingCalls = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/livekit/call/pending?userId=${currentUser.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.calls?.length > 0) {
        setPendingCall(data.calls[0]);
      } else {
        setPendingCall(null);
      }
    } catch {}
  }, [currentUser]);

  useEffect(() => {
    checkPendingCalls();
    const interval = setInterval(checkPendingCalls, 3000); // Poll every 3s
    return () => clearInterval(interval);
  }, [checkPendingCalls]);

  // Play ring sound when call comes in
  useEffect(() => {
    if (pendingCall) {
      // Try vibrate on mobile
      try { navigator.vibrate?.([200, 100, 200, 100, 200]); } catch {}
    }
  }, [pendingCall]);

  const handleAccept = async () => {
    if (!pendingCall || !currentUser) return;
    try {
      const res = await fetch(`/api/livekit/call/${pendingCall.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      if (res.ok) {
        onAccept(pendingCall);
        setPendingCall(null);
      }
    } catch {}
  };

  const handleDecline = async () => {
    if (!pendingCall || !currentUser) return;
    setDeclining(true);
    try {
      await fetch(`/api/livekit/call/${pendingCall.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      setPendingCall(null);
    } catch {} finally {
      setDeclining(false);
    }
  };

  if (!pendingCall) return null;

  const callerDisplay = formatDisplayName(pendingCall.caller_name, pendingCall.caller_email);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.3s ease',
    }}>
      {/* Caller avatar */}
      <div style={{
        width: 100, height: 100, borderRadius: '50%',
        background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '40px', fontWeight: 600, color: 'white',
        marginBottom: '20px',
        animation: 'ringPulse 1.5s ease-in-out infinite',
        boxShadow: '0 0 0 0 rgba(220, 38, 38, 0.4)',
      }}>
        {(callerDisplay[0] || '?').toUpperCase()}
      </div>

      <div style={{ color: 'white', fontSize: '22px', fontWeight: 600, marginBottom: '8px' }}>
        {callerDisplay}
      </div>
      <div style={{
        color: 'rgba(255,255,255,0.6)', fontSize: '15px', marginBottom: '48px',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <Video style={{ width: 18, height: 18 }} />
        Incoming video call...
      </div>

      {/* Accept / Decline buttons */}
      <div style={{ display: 'flex', gap: '40px' }}>
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleDecline}
            disabled={declining}
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: '#dc2626', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(220, 38, 38, 0.4)',
            }}
          >
            <PhoneOff style={{ width: 28, height: 28, color: 'white' }} />
          </button>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginTop: '8px' }}>
            Decline
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleAccept}
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: '#22c55e', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(34, 197, 94, 0.4)',
            }}
          >
            <Phone style={{ width: 28, height: 28, color: 'white' }} />
          </button>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginTop: '8px' }}>
            Accept
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes ringPulse {
          0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5); }
          70% { box-shadow: 0 0 0 20px rgba(220, 38, 38, 0); }
          100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
        }
      `}</style>
    </div>
  );
};

export default IncomingCallModal;
