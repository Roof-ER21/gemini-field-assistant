/**
 * TeamPanel - Shows team members with online/offline status
 * Allows starting direct conversations with teammates
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  MessageSquare,
  Search,
  Circle,
  Clock,
  RefreshCw,
  X,
  ChevronRight,
  Bell
} from 'lucide-react';
import { messagingService, TeamMember, Conversation } from '../services/messagingService';
import { authService } from '../services/authService';

interface TeamPanelProps {
  onClose: () => void;
  onOpenConversation: (conversationId: string, participant: TeamMember) => void;
}

const TeamPanel: React.FC<TeamPanelProps> = ({ onClose, onOpenConversation }) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'team' | 'messages'>('messages');
  const [totalUnread, setTotalUnread] = useState(0);

  const currentUser = authService.getCurrentUser();

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [team, convData] = await Promise.all([
        messagingService.getTeam(),
        messagingService.getConversations()
      ]);

      // Filter out current user from team list
      const filteredTeam = team.filter(m => m.email !== currentUser?.email);
      setTeamMembers(filteredTeam);
      setConversations(convData.conversations);
      setTotalUnread(convData.total_unread);
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.email]);

  useEffect(() => {
    fetchData();

    // Connect to WebSocket for real-time updates
    messagingService.connect();

    // Listen for presence updates
    const unsubPresence = messagingService.onPresenceUpdate((update) => {
      setTeamMembers(prev =>
        prev.map(m =>
          m.userId === update.userId
            ? { ...m, status: update.status as TeamMember['status'] }
            : m
        )
      );
    });

    // Listen for new messages
    const unsubMessage = messagingService.onNewMessage(() => {
      // Refresh conversations when new message arrives
      messagingService.getConversations().then(data => {
        setConversations(data.conversations);
        setTotalUnread(data.total_unread);
      });
    });

    return () => {
      unsubPresence();
      unsubMessage();
    };
  }, [fetchData]);

  // Start conversation with a team member
  const handleStartConversation = async (member: TeamMember) => {
    try {
      const conversationId = await messagingService.getOrCreateDirectConversation(member.userId);
      if (conversationId) {
        onOpenConversation(conversationId, member);
      }
    } catch (error) {
      console.error('Error starting conversation:', error);
    }
  };

  // Open existing conversation
  const handleOpenConversation = (conversation: Conversation) => {
    // Find the other participant
    const otherParticipant = conversation.participants?.find(
      p => p.email !== currentUser?.email
    );

    if (otherParticipant) {
      const member: TeamMember = {
        userId: otherParticipant.user_id,
        name: otherParticipant.name,
        email: otherParticipant.email,
        username: otherParticipant.username,
        status: 'offline', // Will be updated by presence
        lastSeen: new Date()
      };
      onOpenConversation(conversation.id, member);
    }
  };

  // Format last seen time
  const formatLastSeen = (lastSeen: Date | string) => {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Filter members by search
  const filteredMembers = teamMembers.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort: online first, then by name
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const statusOrder = { online: 0, away: 1, offline: 2 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    return a.name.localeCompare(b.name);
  });

  // Status indicator component
  const StatusIndicator: React.FC<{ status: TeamMember['status'] }> = ({ status }) => {
    const colors = {
      online: '#22c55e',
      away: '#f59e0b',
      offline: '#6b7280'
    };

    return (
      <div
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: colors[status],
          border: '2px solid var(--bg-secondary)',
          boxShadow: status === 'online' ? '0 0 6px rgba(34, 197, 94, 0.5)' : 'none'
        }}
      />
    );
  };

  const onlineCount = teamMembers.filter(m => m.status === 'online').length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)',
        borderRadius: '12px',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border-color)',
          background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(185, 28, 28, 0.05) 100%)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Users style={{ width: '24px', height: '24px', color: 'var(--roof-red)' }} />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Team
            </h2>
            {totalUnread > 0 && (
              <span
                style={{
                  background: 'var(--roof-red)',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  minWidth: '20px',
                  textAlign: 'center'
                }}
              >
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={fetchData}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.5rem',
                cursor: 'pointer',
                borderRadius: '8px',
                color: 'var(--text-secondary)'
              }}
              title="Refresh"
            >
              <RefreshCw style={{ width: '18px', height: '18px' }} />
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.5rem',
                cursor: 'pointer',
                borderRadius: '8px',
                color: 'var(--text-secondary)'
              }}
            >
              <X style={{ width: '18px', height: '18px' }} />
            </button>
          </div>
        </div>

        {/* Status summary */}
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Circle style={{ width: '8px', height: '8px', fill: '#22c55e', color: '#22c55e' }} />
            {onlineCount} online
          </span>
          <span>{teamMembers.length} team members</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={() => setActiveTab('messages')}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'messages' ? 'var(--roof-red)' : 'var(--bg-secondary)',
              color: activeTab === 'messages' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <MessageSquare style={{ width: '16px', height: '16px' }} />
            Messages
            {totalUnread > 0 && activeTab !== 'messages' && (
              <span
                style={{
                  background: 'white',
                  color: 'var(--roof-red)',
                  fontSize: '0.7rem',
                  padding: '1px 5px',
                  borderRadius: '8px'
                }}
              >
                {totalUnread}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('team')}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'team' ? 'var(--roof-red)' : 'var(--bg-secondary)',
              color: activeTab === 'team' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <Users style={{ width: '16px', height: '16px' }} />
            Team ({onlineCount})
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0.75rem 1rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem'
          }}
        >
          <Search style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder={activeTab === 'messages' ? 'Search conversations...' : 'Search team members...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '0.875rem',
              color: 'var(--text-primary)'
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 0.5rem 1rem' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading...
          </div>
        ) : activeTab === 'messages' ? (
          /* Conversations List */
          conversations.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <MessageSquare style={{ width: '48px', height: '48px', margin: '0 auto 1rem', opacity: 0.5 }} />
              <p>No conversations yet</p>
              <p style={{ fontSize: '0.875rem' }}>
                Click the Team tab to start chatting with a colleague
              </p>
            </div>
          ) : (
            conversations.map(conv => {
              const otherParticipant = conv.participants?.find(p => p.email !== currentUser?.email);
              const teamMember = teamMembers.find(m => m.userId === otherParticipant?.user_id);

              return (
                <div
                  key={conv.id}
                  onClick={() => handleOpenConversation(conv)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginBottom: '0.25rem',
                    background: conv.unread_count > 0 ? 'rgba(220, 38, 38, 0.1)' : 'transparent',
                    border: conv.unread_count > 0 ? '1px solid rgba(220, 38, 38, 0.2)' : '1px solid transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = conv.unread_count > 0 ? 'rgba(220, 38, 38, 0.1)' : 'transparent'}
                >
                  {/* Avatar with status */}
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: '600',
                        fontSize: '1rem'
                      }}
                    >
                      {otherParticipant?.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div style={{ position: 'absolute', bottom: '-2px', right: '-2px' }}>
                      <StatusIndicator status={teamMember?.status || 'offline'} />
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontWeight: conv.unread_count > 0 ? '600' : '500',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {otherParticipant?.name || 'Unknown'}
                      </span>
                      {conv.last_message && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {formatLastSeen(conv.last_message.created_at)}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '0.875rem',
                        color: 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      {conv.last_message?.message_type === 'shared_chat' && (
                        <span style={{ color: 'var(--roof-red)' }}>Shared AI chat</span>
                      )}
                      {conv.last_message?.message_type === 'shared_email' && (
                        <span style={{ color: 'var(--roof-red)' }}>Shared email</span>
                      )}
                      {conv.last_message?.message_type === 'text' && (
                        <span>{(conv.last_message.content as any)?.text || 'Message'}</span>
                      )}
                      {!conv.last_message && 'No messages yet'}
                    </div>
                  </div>

                  {/* Unread badge */}
                  {conv.unread_count > 0 && (
                    <span
                      style={{
                        background: 'var(--roof-red)',
                        color: 'white',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        minWidth: '20px',
                        textAlign: 'center'
                      }}
                    >
                      {conv.unread_count}
                    </span>
                  )}

                  <ChevronRight style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
                </div>
              );
            })
          )
        ) : (
          /* Team Members List */
          sortedMembers.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No team members found
            </div>
          ) : (
            sortedMembers.map(member => (
              <div
                key={member.userId}
                onClick={() => handleStartConversation(member)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  marginBottom: '0.25rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {/* Avatar with status */}
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: member.status === 'online'
                        ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                        : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: '600',
                      fontSize: '1rem'
                    }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-2px' }}>
                    <StatusIndicator status={member.status} />
                  </div>
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                    {member.name}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>@{member.username || member.email.split('@')[0]}</span>
                    {member.status !== 'online' && (
                      <>
                        <span style={{ opacity: 0.5 }}>|</span>
                        <Clock style={{ width: '12px', height: '12px' }} />
                        <span>{formatLastSeen(member.lastSeen)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Message button */}
                <button
                  style={{
                    background: 'var(--roof-red)',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.875rem'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartConversation(member);
                  }}
                >
                  <MessageSquare style={{ width: '14px', height: '14px' }} />
                  Message
                </button>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
};

export default TeamPanel;
