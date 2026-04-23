/**
 * LiveRoomView - Full-screen LiveKit video room with in-room chat
 * Uses livekit-client directly (no pre-built components) for reliability
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  ConnectionState,
  DataPacket_Kind,
} from 'livekit-client';
import {
  ArrowLeft, Mic, MicOff, Video, VideoOff, PhoneOff,
  Monitor, MessageCircle, Users, Send, Circle, X,
} from 'lucide-react';
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

interface ParticipantInfo {
  identity: string;
  name: string;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  isSpeaking: boolean;
  isMuted: boolean;
  isVideoMuted: boolean;
  isLocal: boolean;
  isScreenShare: boolean;
}

interface ChatMessage {
  id: string;
  userId: string;
  senderName: string;
  message: string;
  createdAt: string;
  isLocal?: boolean;
}

const LiveRoomView: React.FC<LiveRoomViewProps> = ({
  token,
  serverUrl,
  sessionId,
  sessionTitle,
  isHost,
  onLeave,
}) => {
  const [connectionState, setConnectionState] = useState<string>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStarting, setRecordingStarting] = useState(false);

  // Chat state
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageTimeRef = useRef<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const currentUser = authService.getCurrentUser();

  // Build participants list from room state
  const updateParticipants = useCallback((room: Room) => {
    const parts: ParticipantInfo[] = [];

    const local = room.localParticipant;
    const localVideo = local.getTrackPublication(Track.Source.Camera);
    const localAudio = local.getTrackPublication(Track.Source.Microphone);
    parts.push({
      identity: local.identity,
      name: local.name || local.identity,
      videoTrack: localVideo?.track?.mediaStreamTrack || null,
      audioTrack: null,
      isSpeaking: local.isSpeaking,
      isMuted: localAudio?.isMuted ?? true,
      isVideoMuted: localVideo?.isMuted ?? true,
      isLocal: true,
      isScreenShare: false,
    });

    room.remoteParticipants.forEach((remote) => {
      const remoteVideo = remote.getTrackPublication(Track.Source.Camera);
      const remoteAudio = remote.getTrackPublication(Track.Source.Microphone);
      const remoteScreen = remote.getTrackPublication(Track.Source.ScreenShare);

      parts.push({
        identity: remote.identity,
        name: remote.name || remote.identity,
        videoTrack: remoteVideo?.track?.mediaStreamTrack || null,
        audioTrack: remoteAudio?.track?.mediaStreamTrack || null,
        isSpeaking: remote.isSpeaking,
        isMuted: remoteAudio?.isMuted ?? true,
        isVideoMuted: remoteVideo?.isMuted ?? true,
        isLocal: false,
        isScreenShare: false,
      });

      if (remoteScreen?.track?.mediaStreamTrack) {
        parts.push({
          identity: remote.identity + '-screen',
          name: `${remote.name || remote.identity}'s Screen`,
          videoTrack: remoteScreen.track.mediaStreamTrack,
          audioTrack: null,
          isSpeaking: false,
          isMuted: true,
          isVideoMuted: false,
          isLocal: false,
          isScreenShare: true,
        });
      }
    });

    setParticipants(parts);
    setParticipantCount(1 + room.remoteParticipants.size);
  }, []);

  // Handle incoming DataChannel messages (real-time chat)
  const handleDataReceived = useCallback((payload: Uint8Array, participant: any) => {
    try {
      const text = new TextDecoder().decode(payload);
      const data = JSON.parse(text);
      if (data.type === 'chat') {
        const msg: ChatMessage = {
          id: `dc-${Date.now()}-${Math.random()}`,
          userId: participant?.identity || 'unknown',
          senderName: data.senderName || participant?.name || 'Unknown',
          message: data.message,
          createdAt: new Date().toISOString(),
          isLocal: false,
        };
        setChatMessages(prev => [...prev, msg]);
        if (!showChat) {
          setUnreadCount(prev => prev + 1);
        }
      }
    } catch {}
  }, [showChat]);

  // Connect to room
  useEffect(() => {
    const room = new Room({
      adaptiveStream: { pixelDensity: 'high' },
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h1080.resolution,
        facingMode: 'environment',
      },
      publishDefaults: {
        simulcast: true,
        videoEncoding: {
          maxBitrate: 3_000_000,
          maxFramerate: 30,
        },
      },
    });
    roomRef.current = room;

    const onStateChange = (state: ConnectionState) => {
      setConnectionState(state);
      if (state === ConnectionState.Connected) {
        updateParticipants(room);
      }
    };

    const onParticipantChange = () => updateParticipants(room);

    room.on(RoomEvent.ConnectionStateChanged, onStateChange);
    room.on(RoomEvent.ParticipantConnected, onParticipantChange);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantChange);
    room.on(RoomEvent.TrackSubscribed, onParticipantChange);
    room.on(RoomEvent.TrackUnsubscribed, onParticipantChange);
    room.on(RoomEvent.TrackMuted, onParticipantChange);
    room.on(RoomEvent.TrackUnmuted, onParticipantChange);
    room.on(RoomEvent.ActiveSpeakersChanged, onParticipantChange);
    room.on(RoomEvent.LocalTrackPublished, onParticipantChange);
    room.on(RoomEvent.LocalTrackUnpublished, onParticipantChange);
    room.on(RoomEvent.DataReceived, handleDataReceived);
    room.on(RoomEvent.Disconnected, () => setConnectionState('disconnected'));

    room.connect(serverUrl, token)
      .then(() => room.localParticipant.enableCameraAndMicrophone())
      .then(() => updateParticipants(room))
      .catch((err) => {
        console.error('[LiveKit] Connection error:', err);
        setError(err.message || 'Failed to connect to video room');
      });

    return () => {
      room.disconnect();
      roomRef.current = null;
    };
  }, [token, serverUrl, updateParticipants, handleDataReceived]);

  // Poll for chat messages from server (backup for DataChannel + persistence)
  useEffect(() => {
    const pollMessages = async () => {
      try {
        let url = `/api/livekit/sessions/${sessionId}/messages`;
        if (lastMessageTimeRef.current) {
          url += `?since=${encodeURIComponent(lastMessageTimeRef.current)}`;
        }
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data.messages?.length > 0) {
          const newMsgs: ChatMessage[] = data.messages
            .filter((m: any) => m.user_id !== currentUser?.id) // skip own messages (already added locally)
            .map((m: any) => ({
              id: m.id,
              userId: m.user_id,
              senderName: m.sender_name || m.sender_email || 'Unknown',
              message: m.message,
              createdAt: m.created_at,
              isLocal: false,
            }));

          if (newMsgs.length > 0) {
            setChatMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id));
              const unique = newMsgs.filter((m: ChatMessage) => !existingIds.has(m.id));
              return unique.length > 0 ? [...prev, ...unique] : prev;
            });
          }

          lastMessageTimeRef.current = data.messages[data.messages.length - 1].created_at;
        }
      } catch {}
    };

    // Initial fetch of all messages
    const fetchAll = async () => {
      try {
        const res = await fetch(`/api/livekit/sessions/${sessionId}/messages`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.messages?.length > 0) {
          const msgs: ChatMessage[] = data.messages.map((m: any) => ({
            id: m.id,
            userId: m.user_id,
            senderName: m.sender_name || m.sender_email || 'Unknown',
            message: m.message,
            createdAt: m.created_at,
            isLocal: m.user_id === currentUser?.id,
          }));
          setChatMessages(msgs);
          lastMessageTimeRef.current = data.messages[data.messages.length - 1].created_at;
        }
      } catch {}
    };
    fetchAll();

    chatPollRef.current = setInterval(pollMessages, 5000);
    return () => {
      if (chatPollRef.current) clearInterval(chatPollRef.current);
    };
  }, [sessionId, currentUser?.id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Clear unread when opening chat
  useEffect(() => {
    if (showChat) setUnreadCount(0);
  }, [showChat]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !currentUser) return;
    const msg = chatInput.trim();
    setChatInput('');

    const localMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      userId: currentUser.id,
      senderName: 'You',
      message: msg,
      createdAt: new Date().toISOString(),
      isLocal: true,
    };
    setChatMessages(prev => [...prev, localMsg]);

    // Send via DataChannel for real-time delivery
    const room = roomRef.current;
    if (room?.localParticipant) {
      try {
        const payload = new TextEncoder().encode(JSON.stringify({
          type: 'chat',
          message: msg,
          senderName: currentUser.name || currentUser.email || 'Unknown',
        }));
        await room.localParticipant.publishData(payload, { reliable: true });
      } catch {}
    }

    // Also persist to server
    fetch(`/api/livekit/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, message: msg }),
    }).catch(() => {});
  };

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(isMuted);
    setIsMuted(!isMuted);
    updateParticipants(room);
  };

  const toggleVideo = async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setCameraEnabled(isVideoOff);
    setIsVideoOff(!isVideoOff);
    updateParticipants(room);
  };

  const toggleScreenShare = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(!isScreenSharing);
      setIsScreenSharing(!isScreenSharing);
      updateParticipants(room);
    } catch (err) {
      console.warn('Screen share failed:', err);
    }
  };

  const toggleRecording = async () => {
    if (!currentUser) return;
    if (isRecording) {
      // Stop
      try {
        await fetch(`/api/livekit/sessions/${sessionId}/record/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id }),
        });
        setIsRecording(false);
      } catch {}
    } else {
      // Start
      setRecordingStarting(true);
      try {
        const res = await fetch(`/api/livekit/sessions/${sessionId}/record/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id }),
        });
        if (res.ok) {
          setIsRecording(true);
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to start recording');
        }
      } catch {
        alert('Failed to start recording');
      } finally {
        setRecordingStarting(false);
      }
    }
  };

  const handleLeave = () => {
    const room = roomRef.current;
    if (room) room.disconnect();
    onLeave();
  };

  // Error state
  if (error) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#111', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', color: 'white', padding: '24px',
      }}>
        <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px', color: '#ef4444' }}>
          Connection Failed
        </div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: '24px', textAlign: 'center', maxWidth: '400px' }}>
          {error}
        </div>
        <button onClick={onLeave} style={{
          padding: '12px 24px', background: '#dc2626', border: 'none', borderRadius: '10px',
          color: 'white', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
        }}>
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#111', display: 'flex', flexDirection: 'column',
      height: '100vh', width: '100vw',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', background: '#000',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.15)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={handleLeave} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px',
            padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}>
            <ArrowLeft style={{ width: 20, height: 20, color: 'white' }} />
          </button>
          <div>
            <div style={{ color: 'white', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {sessionTitle}
              {isRecording && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: '#dc2626', borderRadius: '4px', padding: '2px 6px',
                  fontSize: '11px', fontWeight: 700, animation: 'pulse 1.5s ease-in-out infinite',
                }}>
                  <Circle style={{ width: 6, height: 6, fill: 'white' }} /> REC
                </span>
              )}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {connectionState === 'connected' ? (
                <>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  {participantCount} {participantCount === 1 ? 'person' : 'people'}
                </>
              ) : (
                <>{connectionState}...</>
              )}
            </div>
          </div>
        </div>

        <button onClick={handleLeave} style={{
          background: '#dc2626', border: 'none', borderRadius: '8px',
          padding: '8px 16px', cursor: 'pointer', color: 'white',
          fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <PhoneOff style={{ width: 16, height: 16 }} />
          {isHost ? 'End' : 'Leave'}
        </button>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Video Grid */}
        <div style={{
          flex: 1, display: 'grid', gap: '4px', padding: '4px', overflow: 'hidden',
          gridTemplateColumns: participants.length <= 1 ? '1fr' :
            participants.length <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          gridAutoRows: '1fr',
        }}>
          {connectionState !== 'connected' ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.6)', fontSize: '16px',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 40, height: 40, border: '3px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white', borderRadius: '50%',
                  animation: 'spin 1s linear infinite', margin: '0 auto 16px',
                }} />
                Connecting to room...
              </div>
            </div>
          ) : participants.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.6)',
            }}>
              Waiting for camera...
            </div>
          ) : (
            participants.map((p) => (
              <VideoTile key={p.identity} participant={p} />
            ))
          )}
        </div>

        {/* Chat Panel (slide-out) */}
        {showChat && (
          <div style={{
            width: '320px', background: '#1a1a1a', display: 'flex', flexDirection: 'column',
            borderLeft: '1px solid rgba(255,255,255,0.15)', flexShrink: 0,
          }}>
            {/* Chat header */}
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: 'white', fontSize: '14px', fontWeight: 600 }}>Chat</span>
              <button onClick={() => setShowChat(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
              }}>
                <X style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.5)' }} />
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '12px',
              display: 'flex', flexDirection: 'column', gap: '8px',
            }}>
              {chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', marginTop: '2rem' }}>
                  No messages yet. Say something!
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} style={{
                    alignSelf: msg.isLocal ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                  }}>
                    {!msg.isLocal && (
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px', paddingLeft: '4px' }}>
                        {msg.senderName}
                      </div>
                    )}
                    <div style={{
                      padding: '8px 12px', borderRadius: '12px',
                      background: msg.isLocal ? '#dc2626' : 'rgba(255,255,255,0.1)',
                      color: 'white', fontSize: '13px', lineHeight: 1.4,
                      wordBreak: 'break-word',
                    }}>
                      {msg.message}
                    </div>
                    <div style={{
                      fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '2px',
                      textAlign: msg.isLocal ? 'right' : 'left', paddingLeft: '4px', paddingRight: '4px',
                    }}>
                      {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })} ET
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div style={{
              padding: '12px', borderTop: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', gap: '8px',
            }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder="Type a message..."
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
                  color: 'white', fontSize: '13px', outline: 'none',
                }}
              />
              <button onClick={sendChatMessage} style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: chatInput.trim() ? '#dc2626' : 'rgba(255,255,255,0.08)',
                border: 'none', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Send style={{ width: 16, height: 16, color: chatInput.trim() ? 'white' : 'rgba(255,255,255,0.3)' }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div style={{
        padding: '12px 16px', background: '#000',
        borderTop: '1px solid rgba(255,255,255,0.15)',
        display: 'flex', justifyContent: 'center', gap: '10px', flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <ControlButton
          icon={isMuted ? <MicOff style={{ width: 22, height: 22 }} /> : <Mic style={{ width: 22, height: 22 }} />}
          label={isMuted ? 'Unmute' : 'Mute'}
          active={!isMuted}
          danger={isMuted}
          onClick={toggleMute}
        />
        <ControlButton
          icon={isVideoOff ? <VideoOff style={{ width: 22, height: 22 }} /> : <Video style={{ width: 22, height: 22 }} />}
          label={isVideoOff ? 'Start Video' : 'Stop Video'}
          active={!isVideoOff}
          danger={isVideoOff}
          onClick={toggleVideo}
        />
        <ControlButton
          icon={<Monitor style={{ width: 22, height: 22 }} />}
          label="Share Screen"
          active={isScreenSharing}
          onClick={toggleScreenShare}
        />
        {/* Chat toggle */}
        <div style={{ position: 'relative' }}>
          <ControlButton
            icon={<MessageCircle style={{ width: 22, height: 22 }} />}
            label="Chat"
            active={showChat}
            onClick={() => setShowChat(!showChat)}
          />
          {unreadCount > 0 && !showChat && (
            <div style={{
              position: 'absolute', top: '-2px', right: '-2px',
              background: '#dc2626', color: 'white', borderRadius: '50%',
              width: '18px', height: '18px', fontSize: '10px', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
        </div>
        {/* Record (host only) */}
        {isHost && (
          <ControlButton
            icon={<Circle style={{ width: 22, height: 22, fill: isRecording ? '#ef4444' : 'none' }} />}
            label={isRecording ? 'Stop Recording' : (recordingStarting ? 'Starting...' : 'Record')}
            active={isRecording}
            danger={isRecording}
            onClick={toggleRecording}
            disabled={recordingStarting}
          />
        )}
        <ControlButton
          icon={<PhoneOff style={{ width: 22, height: 22 }} />}
          label={isHost ? 'End' : 'Leave'}
          danger
          onClick={handleLeave}
        />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
};

// Video tile for a single participant
const VideoTile: React.FC<{ participant: ParticipantInfo }> = ({ participant }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.videoTrack) {
      const stream = new MediaStream([participant.videoTrack]);
      videoRef.current.srcObject = stream;
    } else if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [participant.videoTrack]);

  useEffect(() => {
    if (audioRef.current && participant.audioTrack) {
      const stream = new MediaStream([participant.audioTrack]);
      audioRef.current.srcObject = stream;
    } else if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
  }, [participant.audioTrack]);

  return (
    <div style={{
      position: 'relative', borderRadius: '8px', overflow: 'hidden',
      background: '#1a1a1a',
      border: participant.isSpeaking ? '2px solid #22c55e' : '2px solid transparent',
      transition: 'border-color 0.2s',
    }}>
      {participant.videoTrack && !participant.isVideoMuted ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          style={{
            width: '100%', height: '100%',
            objectFit: participant.isScreenShare ? 'contain' : 'cover',
            transform: participant.isLocal && !participant.isScreenShare ? 'scaleX(-1)' : 'none',
            imageRendering: 'auto',
          }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: participant.isLocal ? '#dc2626' : '#444',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', fontWeight: 600, color: 'white',
          }}>
            {(participant.name?.[0] || '?').toUpperCase()}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>
            {participant.name}
          </div>
        </div>
      )}

      {/* Name badge */}
      <div style={{
        position: 'absolute', bottom: '8px', left: '8px',
        background: 'rgba(0,0,0,0.7)', borderRadius: '4px',
        padding: '2px 8px', fontSize: '12px', color: 'white',
        display: 'flex', alignItems: 'center', gap: '4px',
      }}>
        {participant.isMuted && <MicOff style={{ width: 12, height: 12, color: '#ef4444' }} />}
        {participant.isLocal ? 'You' : participant.name}
      </div>

      {participant.audioTrack && !participant.isLocal && (
        <audio ref={audioRef} autoPlay />
      )}
    </div>
  );
};

// Control bar button
const ControlButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ icon, label, active, danger, disabled, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    disabled={disabled}
    style={{
      width: 52, height: 52, borderRadius: '50%',
      border: 'none', cursor: disabled ? 'wait' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: danger ? '#dc2626' : active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
      color: danger ? 'white' : active ? 'white' : 'rgba(255,255,255,0.5)',
      transition: 'all 0.2s',
      opacity: disabled ? 0.5 : 1,
    }}
  >
    {icon}
  </button>
);

export default LiveRoomView;
