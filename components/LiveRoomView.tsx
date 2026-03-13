/**
 * LiveRoomView - Full-screen LiveKit video room
 * Renders when a user joins or starts a live session
 */

import React, { useCallback, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
  GridLayout,
  ParticipantTile,
  Chat,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { ArrowLeft, Users, MessageCircle, Video, X } from 'lucide-react';
import { authService } from '../services/authService';

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
  roomName,
  sessionTitle,
  hostName,
  isHost,
  onLeave,
}) => {
  const [showChat, setShowChat] = useState(false);

  const handleDisconnect = useCallback(() => {
    onLeave();
  }, [onLeave]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: '#111',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 16px',
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
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
              background: showChat ? 'var(--roof-red, #dc2626)' : 'rgba(255,255,255,0.1)',
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
          {isHost && (
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
              }}
            >
              End Session
            </button>
          )}
        </div>
      </div>

      {/* LiveKit Room */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect={true}
          audio={true}
          video={true}
          onDisconnected={handleDisconnect}
          style={{ flex: 1 }}
          data-lk-theme="default"
        >
          <div style={{ display: 'flex', flex: 1, height: '100%' }}>
            {/* Video area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <VideoConference />
            </div>

            {/* Chat sidebar */}
            {showChat && (
              <div style={{
                width: '320px',
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(0,0,0,0.6)',
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
