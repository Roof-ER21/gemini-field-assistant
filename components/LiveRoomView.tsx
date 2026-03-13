/**
 * LiveRoomView - Full-screen LiveKit video room
 * Uses livekit-client directly (no pre-built components) for reliability
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  LocalParticipant,
  RemoteParticipant,
  RemoteTrackPublication,
  LocalTrackPublication,
  VideoPresets,
  ConnectionState,
} from 'livekit-client';
import { ArrowLeft, Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MessageCircle, Users } from 'lucide-react';

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

const LiveRoomView: React.FC<LiveRoomViewProps> = ({
  token,
  serverUrl,
  sessionTitle,
  hostName,
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
  const roomRef = useRef<Room | null>(null);

  // Build participants list from room state
  const updateParticipants = useCallback((room: Room) => {
    const parts: ParticipantInfo[] = [];

    // Local participant
    const local = room.localParticipant;
    const localVideo = local.getTrackPublication(Track.Source.Camera);
    const localAudio = local.getTrackPublication(Track.Source.Microphone);
    parts.push({
      identity: local.identity,
      name: local.name || local.identity,
      videoTrack: localVideo?.track?.mediaStreamTrack || null,
      audioTrack: null, // Don't play own audio
      isSpeaking: local.isSpeaking,
      isMuted: localAudio?.isMuted ?? true,
      isVideoMuted: localVideo?.isMuted ?? true,
      isLocal: true,
      isScreenShare: false,
    });

    // Remote participants
    room.remoteParticipants.forEach((remote) => {
      const remoteVideo = remote.getTrackPublication(Track.Source.Camera);
      const remoteAudio = remote.getTrackPublication(Track.Source.Microphone);
      const remoteScreen = remote.getTrackPublication(Track.Source.ScreenShare);

      parts.push({
        identity: remote.identity,
        name: remote.name || remote.identity,
        videoTrack: (remoteVideo?.track?.mediaStreamTrack) || null,
        audioTrack: (remoteAudio?.track?.mediaStreamTrack) || null,
        isSpeaking: remote.isSpeaking,
        isMuted: remoteAudio?.isMuted ?? true,
        isVideoMuted: remoteVideo?.isMuted ?? true,
        isLocal: false,
        isScreenShare: false,
      });

      // Screen share as separate tile
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

  // Connect to room
  useEffect(() => {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
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
    room.on(RoomEvent.Disconnected, () => {
      setConnectionState('disconnected');
    });

    // Connect
    room.connect(serverUrl, token)
      .then(() => {
        // Enable camera and mic
        return room.localParticipant.enableCameraAndMicrophone();
      })
      .then(() => {
        updateParticipants(room);
      })
      .catch((err) => {
        console.error('[LiveKit] Connection error:', err);
        setError(err.message || 'Failed to connect to video room');
      });

    return () => {
      room.disconnect();
      roomRef.current = null;
    };
  }, [token, serverUrl, updateParticipants]);

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

  const handleLeave = () => {
    const room = roomRef.current;
    if (room) {
      room.disconnect();
    }
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
            <div style={{ color: 'white', fontSize: '15px', fontWeight: 600 }}>
              {sessionTitle}
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

      {/* Control Bar */}
      <div style={{
        padding: '12px 16px', background: '#000',
        borderTop: '1px solid rgba(255,255,255,0.15)',
        display: 'flex', justifyContent: 'center', gap: '12px', flexShrink: 0,
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
        <ControlButton
          icon={<PhoneOff style={{ width: 22, height: 22 }} />}
          label={isHost ? 'End' : 'Leave'}
          danger
          onClick={handleLeave}
        />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
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
            width: '100%', height: '100%', objectFit: 'cover',
            transform: participant.isLocal && !participant.isScreenShare ? 'scaleX(-1)' : 'none',
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

      {/* Audio element for remote participants */}
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
  onClick: () => void;
}> = ({ icon, label, active, danger, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    style={{
      width: 52, height: 52, borderRadius: '50%',
      border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: danger ? '#dc2626' : active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
      color: danger ? 'white' : active ? 'white' : 'rgba(255,255,255,0.5)',
      transition: 'all 0.2s',
    }}
  >
    {icon}
  </button>
);

export default LiveRoomView;
