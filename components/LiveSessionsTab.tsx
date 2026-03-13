/**
 * LiveSessionsTab - Shows active live sessions, "Go Live" button,
 * 1:1 video calling from team members, and session history
 * Rendered inside TeamPanel as the 5th tab
 */

import React, { useState, useEffect, useCallback, Component, ErrorInfo } from 'react';
import {
  Video, Users, Clock, Radio, Wifi, Phone,
  ChevronDown, ChevronUp, Play, Circle, History,
} from 'lucide-react';
import { authService } from '../services/authService';
import { formatDisplayName } from '../utils/formatDisplayName';
import LiveRoomView from './LiveRoomView';

// Error boundary to catch LiveKit render crashes
class LiveRoomErrorBoundary extends Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[LiveRoom] Render crash:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: '#111',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: 'white', padding: '24px',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px', color: '#ef4444' }}>
            Video Room Error
          </div>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: '24px', textAlign: 'center' }}>
            {this.state.error}
          </div>
          <button onClick={this.props.onError} style={{
            padding: '12px 24px', background: '#dc2626', border: 'none', borderRadius: '10px',
            color: 'white', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
          }}>
            Go Back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface LiveSession {
  id: string;
  room_name: string;
  title: string;
  session_type?: string;
  host: {
    id: string;
    name: string;
    email: string;
  };
  participants: Array<{
    userId: string;
    name: string;
    role: string;
    joinedAt: string;
  }>;
  participantCount: number;
  started_at: string;
}

interface HistorySession {
  id: string;
  title: string;
  session_type: string;
  host: { id: string; name: string; email: string };
  participants: Array<{ userId: string; name: string; role: string }>;
  total_participants: number;
  duration_seconds: number;
  max_participants: number;
  started_at: string;
  ended_at: string;
  recordings: Array<{ id: string; status: string; file_url: string; duration_seconds: number }> | null;
}

interface RoomConnection {
  token: string;
  serverUrl: string;
  roomName: string;
  sessionId: string;
  sessionTitle: string;
  hostName: string;
  isHost: boolean;
}

interface LiveSessionsTabProps {
  teamMembers?: Array<{ id: string; name: string; email: string; is_online?: boolean }>;
}

const LiveSessionsTab: React.FC<LiveSessionsTabProps> = ({ teamMembers }) => {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<RoomConnection | null>(null);
  const [calling, setCalling] = useState<string | null>(null);

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);

  const currentUser = authService.getCurrentUser();

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/livekit/sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
      setConfigured(data.configured !== false);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/livekit/sessions/history?limit=20');
      const data = await res.json();
      setHistorySessions(data.sessions || []);
      setHistoryTotal(data.total || 0);
    } catch {} finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showHistory && historySessions.length === 0) {
      fetchHistory();
    }
  }, [showHistory, fetchHistory, historySessions.length]);

  const getToken = async (roomName: string, identity: string, name: string) => {
    const res = await fetch('/api/livekit/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, identity, name }),
    });
    if (!res.ok) throw new Error('Failed to get token');
    return res.json();
  };

  const forceEndMySessions = async () => {
    if (!currentUser) return;
    await fetch('/api/livekit/sessions/force-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id }),
    }).catch(() => {});
  };

  const handleGoLive = async () => {
    if (!currentUser) return;
    setCreating(true);
    try {
      await forceEndMySessions();

      const title = sessionTitle.trim() || `${formatDisplayName(currentUser.name, currentUser.email)}'s Live`;
      const res = await fetch('/api/livekit/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, title }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to go live');
        return;
      }
      const session = await res.json();

      const { token, url } = await getToken(
        session.room_name, currentUser.id,
        formatDisplayName(currentUser.name, currentUser.email)
      );

      setActiveRoom({
        token, serverUrl: url, roomName: session.room_name,
        sessionId: session.id, sessionTitle: title,
        hostName: formatDisplayName(currentUser.name, currentUser.email),
        isHost: true,
      });
      setShowGoLiveModal(false);
      setSessionTitle('');
    } catch (err) {
      console.error('Go live error:', err);
      alert('Failed to start live session');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinSession = async (session: LiveSession) => {
    if (!currentUser) return;
    setJoining(session.id);
    try {
      const joinRes = await fetch(`/api/livekit/sessions/${session.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      if (!joinRes.ok) throw new Error('Failed to join');

      const { token, url } = await getToken(
        session.room_name, currentUser.id,
        formatDisplayName(currentUser.name, currentUser.email)
      );

      setActiveRoom({
        token, serverUrl: url, roomName: session.room_name,
        sessionId: session.id, sessionTitle: session.title,
        hostName: formatDisplayName(session.host.name, session.host.email),
        isHost: false,
      });
    } catch (err) {
      console.error('Join error:', err);
      alert('Failed to join session');
    } finally {
      setJoining(null);
    }
  };

  const handleCallTeamMember = async (memberId: string, memberName: string) => {
    if (!currentUser || !configured) return;
    setCalling(memberId);
    try {
      const res = await fetch('/api/livekit/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callerId: currentUser.id, calleeId: memberId }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to call');
        return;
      }
      const data = await res.json();

      // Join the call room as host
      const { token, url } = await getToken(
        data.session.room_name, currentUser.id,
        formatDisplayName(currentUser.name, currentUser.email)
      );

      setActiveRoom({
        token, serverUrl: url, roomName: data.session.room_name,
        sessionId: data.session.id,
        sessionTitle: `Call with ${memberName}`,
        hostName: formatDisplayName(currentUser.name, currentUser.email),
        isHost: true,
      });
    } catch (err) {
      console.error('Call error:', err);
      alert('Failed to start call');
    } finally {
      setCalling(null);
    }
  };

  const handleLeaveRoom = async () => {
    if (!currentUser) return;
    try {
      if (activeRoom) {
        const endpoint = activeRoom.isHost
          ? `/api/livekit/sessions/${activeRoom.sessionId}/end`
          : `/api/livekit/sessions/${activeRoom.sessionId}/leave`;

        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id }),
        });
      }
      await forceEndMySessions();
    } catch (err) {
      console.error('Leave error:', err);
    }
    setActiveRoom(null);
    fetchSessions();
  };

  const formatDuration = (startedAt: string) => {
    const mins = Math.round((Date.now() - new Date(startedAt).getTime()) / 60000);
    if (mins < 1) return 'Just started';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const formatSeconds = (seconds: number | null) => {
    if (!seconds) return '< 1m';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  // Full-screen video room
  if (activeRoom) {
    return (
      <LiveRoomErrorBoundary onError={handleLeaveRoom}>
        <LiveRoomView {...activeRoom} onLeave={handleLeaveRoom} />
      </LiveRoomErrorBoundary>
    );
  }

  // Online team members (for 1:1 calling)
  const callableMembers = (teamMembers || []).filter(
    m => m.id !== currentUser?.id && m.is_online
  );

  return (
    <div style={{ padding: '0' }}>
      {/* Go Live Button */}
      <div style={{ padding: '0.75rem' }}>
        <button
          onClick={() => {
            if (!configured) {
              alert('LiveKit is not configured. Admin needs to set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.');
              return;
            }
            setShowGoLiveModal(true);
          }}
          style={{
            width: '100%', padding: '14px',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            border: 'none', borderRadius: '12px', color: 'white',
            fontSize: '15px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
          }}
        >
          <Video style={{ width: '20px', height: '20px' }} />
          Go Live
        </button>
      </div>

      {/* Active Sessions */}
      <div style={{ padding: '0 0.75rem' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading...
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <Radio style={{ width: '36px', height: '36px', margin: '0 auto 0.75rem', opacity: 0.3, color: 'var(--text-tertiary)' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 4px' }}>No one is live right now</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', margin: 0 }}>
              Start a session so teammates can join
            </p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Live Now ({sessions.length})
            </div>
            {sessions.map(session => {
              const isMySession = session.host.id === currentUser?.id;
              return (
                <div
                  key={session.id}
                  onClick={() => !isMySession && handleJoinSession(session)}
                  style={{
                    padding: '14px', borderRadius: '12px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
                    marginBottom: '8px', cursor: isMySession ? 'default' : 'pointer',
                    backdropFilter: 'blur(10px) saturate(120%)', boxShadow: 'var(--shadow-glass)',
                    opacity: joining === session.id ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: '#ef4444', animation: 'pulse 1.5s ease-in-out infinite',
                        }} />
                        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                          {session.title}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        Hosted by {formatDisplayName(session.host.name, session.host.email)}
                        {isMySession && ' (You)'}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Users style={{ width: '12px', height: '12px' }} />
                          {session.participantCount} {session.participantCount === 1 ? 'person' : 'people'}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock style={{ width: '12px', height: '12px' }} />
                          {formatDuration(session.started_at)}
                        </span>
                      </div>
                    </div>
                    {!isMySession && (
                      <button
                        disabled={joining === session.id}
                        style={{
                          padding: '8px 16px', background: 'var(--roof-red)',
                          border: 'none', borderRadius: '8px', color: 'white',
                          fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
                        }}
                      >
                        {joining === session.id ? 'Joining...' : (
                          <><Wifi style={{ width: '14px', height: '14px' }} /> Join</>
                        )}
                      </button>
                    )}
                  </div>

                  {session.participants.length > 0 && (
                    <div style={{ display: 'flex', marginTop: '10px' }}>
                      {session.participants.slice(0, 6).map((p, i) => (
                        <div key={p.userId} style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          background: p.role === 'host' ? 'var(--roof-red)' : 'var(--bg-secondary)',
                          border: '2px solid var(--bg-elevated)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '11px', fontWeight: 600,
                          color: p.role === 'host' ? 'white' : 'var(--text-secondary)',
                          marginLeft: i > 0 ? '-6px' : '0', zIndex: 10 - i,
                        }} title={p.name}>
                          {(p.name?.[0] || '').toUpperCase()}
                        </div>
                      ))}
                      {session.participants.length > 6 && (
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          background: 'var(--bg-secondary)', border: '2px solid var(--bg-elevated)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '-6px',
                        }}>
                          +{session.participants.length - 6}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Quick Call - Online Team Members */}
      {callableMembers.length > 0 && (
        <div style={{ padding: '0 0.75rem', marginTop: '8px' }}>
          <div style={{
            fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px',
          }}>
            Quick Call
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {callableMembers.slice(0, 8).map(member => (
              <button
                key={member.id}
                onClick={() => handleCallTeamMember(member.id, formatDisplayName(member.name, member.email))}
                disabled={calling === member.id}
                style={{
                  padding: '8px 12px', borderRadius: '10px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)', fontSize: '13px',
                  cursor: calling === member.id ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  opacity: calling === member.id ? 0.6 : 1,
                }}
              >
                <Phone style={{ width: 14, height: 14, color: '#22c55e' }} />
                {formatDisplayName(member.name, member.email)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Session History */}
      <div style={{ padding: '0 0.75rem', marginTop: '16px' }}>
        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: '10px',
            background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History style={{ width: 16, height: 16 }} />
            Session History
          </span>
          {showHistory
            ? <ChevronUp style={{ width: 16, height: 16 }} />
            : <ChevronDown style={{ width: 16, height: 16 }} />
          }
        </button>

        {showHistory && (
          <div style={{ marginTop: '8px' }}>
            {historyLoading ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                Loading history...
              </div>
            ) : historySessions.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                No past sessions yet
              </div>
            ) : (
              historySessions.map(session => (
                <div key={session.id} style={{
                  padding: '12px', borderRadius: '10px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
                  marginBottom: '6px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {session.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        {formatDisplayName(session.host.name, session.host.email)}
                        {' • '}
                        {new Date(session.started_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        {' at '}
                        {new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
                        background: session.session_type === 'call' ? 'rgba(34,197,94,0.1)' : 'rgba(220,38,38,0.1)',
                        color: session.session_type === 'call' ? '#22c55e' : '#ef4444',
                      }}>
                        {session.session_type === 'call' ? 'Call' : 'Live'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Clock style={{ width: 11, height: 11 }} />
                      {formatSeconds(session.duration_seconds)}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Users style={{ width: 11, height: 11 }} />
                      {session.max_participants || session.total_participants} people
                    </span>
                    {session.recordings && session.recordings.length > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#22c55e' }}>
                        <Circle style={{ width: 11, height: 11, fill: '#22c55e' }} />
                        {session.recordings.length} recording{session.recordings.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Participant list */}
                  {session.participants && session.participants.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {session.participants.slice(0, 5).map((p, i) => (
                        <span key={i} style={{
                          padding: '2px 6px', borderRadius: '4px', fontSize: '11px',
                          background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
                        }}>
                          {formatDisplayName(p.name, '')}
                        </span>
                      ))}
                      {session.participants.length > 5 && (
                        <span style={{
                          padding: '2px 6px', borderRadius: '4px', fontSize: '11px',
                          background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
                        }}>
                          +{session.participants.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            {historyTotal > 20 && (
              <div style={{ textAlign: 'center', padding: '8px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                Showing 20 of {historyTotal} sessions
              </div>
            )}
          </div>
        )}
      </div>

      {/* Go Live Modal */}
      {showGoLiveModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px',
        }}>
          <div style={{
            background: 'var(--bg-primary)', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '400px', border: '1px solid var(--glass-border)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Start Live Session
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Your camera and mic will be shared. Team members will get a notification and can join from the Live tab.
            </p>

            <input
              type="text"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder="What are you showing? (e.g. Roof assessment at 123 Main St)"
              maxLength={100}
              style={{
                width: '100%', padding: '12px', borderRadius: '10px',
                border: '1px solid var(--glass-border)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: '14px', marginBottom: '16px',
                outline: 'none', boxSizing: 'border-box',
              }}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleGoLive()}
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setShowGoLiveModal(false); setSessionTitle(''); }}
                style={{
                  flex: 1, padding: '12px', borderRadius: '10px',
                  border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleGoLive}
                disabled={creating}
                style={{
                  flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  color: 'white', fontSize: '14px', fontWeight: 600,
                  cursor: creating ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  opacity: creating ? 0.7 : 1,
                }}
              >
                <Video style={{ width: '16px', height: '16px' }} />
                {creating ? 'Starting...' : 'Go Live'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

export default LiveSessionsTab;
