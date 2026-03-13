/**
 * LiveRoomView - Full-screen LiveKit video room
 * Renders when a user joins or starts a live session
 */

import React, { useCallback, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  Chat,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { ArrowLeft, MessageCircle, X, PhoneOff } from 'lucide-react';

interface LiveRoomViewProps {
  token: string;
  serverUrl: string;
  roomName: string;
  sessionId: string;
  sessionTitle: string;
  hostName: string;
  isHost: boolean;
  onLeave: () => void;
}

const LiveRoomView: React.FC<LiveRoomViewProps> = ({
  token,
  serverUrl,
  sessionTitle,
  hostName,
  isHost,
  onLeave,
}) => {
  const [showChat, setShowChat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDisconnect = useCallback(() => {
    onLeave();
  }, [onLeave]);

  const handleError = useCallback((err: Error) => {
    console.error('[LiveKit] Room error:', err);
    setError(err.message);
  }, []);

  if (error) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#111',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        padding: '24px',
      }}>
        <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px', color: '#ef4444' }}>
          Connection Failed
        </div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: '24px', textAlign: 'center', maxWidth: '400px' }}>
          {error}
        </div>
        <button
          onClick={onLeave}
          style={{
            padding: '12px 24px',
            background: '#dc2626',
            border: 'none',
            borderRadius: '10px',
            color: 'white',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div
      data-lk-theme="default"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        height: '100vh',
        width: '100vw',
        background: '#111',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Our custom header - always visible regardless of LiveKit state */}
      <div style={{
        padding: '8px 16px',
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        zIndex: 10,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onLeave}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ArrowLeft className="w-5 h-5" style={{ color: 'white' }} />
          </button>
          <div>
            <div style={{ color: 'white', fontSize: '15px', fontWeight: 600 }}>
              {sessionTitle}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>
              Hosted by {hostName} {isHost && '(You)'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowChat(!showChat)}
            style={{
              background: showChat ? '#dc2626' : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <MessageCircle className="w-5 h-5" style={{ color: 'white' }} />
          </button>
          <button
            onClick={onLeave}
            style={{
              background: '#dc2626',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              cursor: 'pointer',
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <PhoneOff className="w-4 h-4" />
            {isHost ? 'End' : 'Leave'}
          </button>
        </div>
      </div>

      {/* LiveKit Room - takes remaining height */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect={true}
          audio={true}
          video={true}
          onDisconnected={handleDisconnect}
          onError={handleError}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
            {/* Video area */}
            <div style={{ flex: 1, height: '100%' }}>
              <VideoConference />
            </div>

            {/* Chat sidebar */}
            {showChat && (
              <div style={{
                width: '300px',
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(0,0,0,0.6)',
                flexShrink: 0,
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ color: 'white', fontWeight: 600, fontSize: '14px' }}>Chat</span>
                  <button
                    onClick={() => setShowChat(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                  >
                    <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
                  </button>
                </div>
                <Chat style={{ flex: 1 }} />
              </div>
            )}
          </div>

          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    </div>
  );
};

export default LiveRoomView;
