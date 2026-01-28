/**
 * ConversationView - Chat view for direct messages
 * Shows messages and allows sending text, shared AI content, etc.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Send,
  Circle,
  Clock,
  Bot,
  Mail,
  Copy,
  Check,
  Paperclip,
  Smile,
  Search,
  Pin,
  Calendar,
  BarChart3,
  X
} from 'lucide-react';
import {
  messagingService,
  Message,
  MessageContent,
  TeamMember,
  Conversation
} from '../services/messagingService';
import { authService } from '../services/authService';
import { formatDisplayName } from '../utils/formatDisplayName';

interface ConversationViewProps {
  conversation: Conversation;
  participant?: TeamMember | null;
  onBack: () => void;
}

const ConversationView: React.FC<ConversationViewProps> = ({
  conversation,
  participant,
  onBack
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearchText, setMentionSearchText] = useState('');
  const [attachments, setAttachments] = useState<MessageContent['attachments']>([]);
  const [openReactionPickerId, setOpenReactionPickerId] = useState<string | null>(null);
  const [teamMap, setTeamMap] = useState<Record<string, TeamMember>>({});
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [showPinTray, setShowPinTray] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDateTime, setEventDateTime] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDescription, setEventDescription] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentUser = authService.getCurrentUser();
  const canSend = (inputText.trim().length > 0 || (attachments && attachments.length > 0)) && !uploadingAttachments;

  const conversationId = conversation.id;

  // Participant info
  const otherParticipant = React.useMemo(() => {
    if (conversation.type === 'direct') {
      if (participant) return participant;
      const other = conversation.participants?.find(p => p.email !== currentUser?.email);
      if (!other) return null;
      return {
        userId: other.user_id,
        name: other.name,
        email: other.email,
        username: other.username,
        status: 'offline',
        lastSeen: new Date()
      } as TeamMember;
    }
    return null;
  }, [conversation.type, conversation.participants, participant, currentUser?.email]);

  const groupMembers = React.useMemo(() => {
    return (conversation.participants || []).filter(p => p.email !== currentUser?.email);
  }, [conversation.participants, currentUser?.email]);

  const otherDisplayName = otherParticipant
    ? formatDisplayName(otherParticipant.name, otherParticipant.email)
    : 'Teammate';

  // Fetch messages
  const fetchMessages = useCallback(async (beforeMessageId?: string) => {
    try {
      const data = await messagingService.getMessages(conversationId, {
        limit: 50,
        beforeMessageId
      });

      if (beforeMessageId) {
        setMessages(prev => [...data.messages, ...prev]);
      } else {
        setMessages(data.messages.map(msg => ({
          ...msg,
          reactions: msg.reactions || [],
          read_receipts: msg.read_receipts || [],
          poll_votes: msg.poll_votes || [],
          event_rsvps: msg.event_rsvps || [],
          is_pinned: msg.is_pinned || false
        })));
        // Mark as read
        messagingService.markAsRead(conversationId);
      }

      setHasMore(data.has_more);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const refreshPins = useCallback(async () => {
    const pins = await messagingService.getPins(conversationId);
    setPinnedMessages(pins);
    const pinnedIds = new Set(pins.map((pin) => pin.message_id));
    setMessages(prev => prev.map(msg => ({
      ...msg,
      is_pinned: pinnedIds.has(msg.id)
    })));
  }, [conversationId]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchMessages();
    refreshPins();

    // Join conversation room
    messagingService.joinConversation(conversationId);

    // Listen for new messages
    const unsubMessage = messagingService.onNewMessage((message) => {
      if (message.conversation_id === conversationId) {
        setMessages(prev => [...prev, {
          ...message,
          reactions: message.reactions || [],
          read_receipts: message.read_receipts || [],
          poll_votes: message.poll_votes || [],
          event_rsvps: message.event_rsvps || [],
          is_pinned: message.is_pinned || false
        }]);
        // Mark as read if it's from the other person
        if (message.sender_id !== currentUser?.id) {
          messagingService.markAsRead(conversationId);
        }
      }
    });

    // Listen for typing
    const unsubTyping = messagingService.onTyping((data) => {
      if (data.conversationId === conversationId && data.userId !== currentUser?.id) {
        setIsTyping(data.isTyping);
      }
    });

    const unsubReaction = messagingService.onReactionUpdate((data) => {
      if (data.conversationId !== conversationId) return;
      setMessages(prev => prev.map(msg => (
        msg.id === data.messageId ? { ...msg, reactions: data.reactions || [] } : msg
      )));
    });

    const unsubRead = messagingService.onReadReceipt((data) => {
      if (data.conversationId !== conversationId) return;
      setMessages(prev => prev.map(msg => {
        if (!data.messageIds.includes(msg.id)) return msg;
        const existing = new Set(msg.read_receipts || []);
        existing.add(data.userId);
        return { ...msg, read_receipts: Array.from(existing) };
      }));
    });

    const unsubPin = messagingService.onPinUpdate((data) => {
      if (data.conversationId !== conversationId) return;
      refreshPins();
    });

    const unsubPoll = messagingService.onPollVoteUpdate((data) => {
      if (data.conversationId !== conversationId) return;
      setMessages(prev => prev.map(msg => (
        msg.id === data.messageId ? { ...msg, poll_votes: data.votes || [] } : msg
      )));
    });

    const unsubEvent = messagingService.onEventRsvpUpdate((data) => {
      if (data.conversationId !== conversationId) return;
      setMessages(prev => prev.map(msg => (
        msg.id === data.messageId ? { ...msg, event_rsvps: data.rsvps || [] } : msg
      )));
    });

    return () => {
      unsubMessage();
      unsubTyping();
      unsubReaction();
      unsubRead();
      unsubPin();
      unsubPoll();
      unsubEvent();
      messagingService.leaveConversation(conversationId);
    };
  }, [conversationId, currentUser?.id, fetchMessages, refreshPins]);

  // Load team members for presence display
  useEffect(() => {
    messagingService.getTeam().then((members) => {
      const map: Record<string, TeamMember> = {};
      members.forEach(member => {
        map[member.userId] = member;
      });
      setTeamMap(map);
    });

    const unsubPresence = messagingService.onPresenceUpdate((update) => {
      setTeamMap(prev => {
        const existing = prev[update.userId];
        if (!existing) return prev;
        return {
          ...prev,
          [update.userId]: { ...existing, status: update.status as TeamMember['status'] }
        };
      });
    });

    return () => {
      unsubPresence();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle typing indicator
  const handleTyping = () => {
    messagingService.startTyping(conversationId);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      messagingService.stopTyping(conversationId);
    }, 2000);
  };

  // Parse @mentions from text and resolve to user IDs
  const parseMentions = (text: string): string[] => {
    const mentionPattern = /@(\w+(?:\.\w+)*)/g;
    const mentionedUserIds: string[] = [];
    let match;

    while ((match = mentionPattern.exec(text)) !== null) {
      const mentionedUsername = match[1].toLowerCase();
      const candidates = conversation.participants || [];
      for (const person of candidates) {
        if (person.email === currentUser?.email) continue;
        const username = (person.username || person.email.split('@')[0]).toLowerCase();
        if (mentionedUsername === username) {
          mentionedUserIds.push(person.user_id);
        }
      }
    }

    return [...new Set(mentionedUserIds)]; // Remove duplicates
  };

  // Send message
  const handleSend = async () => {
    const text = inputText.trim();
    if ((!text && (!attachments || attachments.length === 0)) || sending) return;

    setSending(true);
    messagingService.stopTyping(conversationId);

    try {
      // Parse mentions from the message text
      const mentionedUserIds = parseMentions(text);

      const content: MessageContent = {
        type: 'text',
        text: text || undefined,
        ...(attachments && attachments.length > 0 && { attachments }),
        ...(mentionedUserIds.length > 0 && { mentioned_users: mentionedUserIds })
      };

      const message = await messagingService.sendMessage(conversationId, content);

      if (message) {
        setMessages(prev => [...prev, message]);
        setInputText('');
        setAttachments([]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleCreatePoll = async () => {
    const trimmedOptions = pollOptions.map(opt => opt.trim()).filter(Boolean);
    if (!pollQuestion.trim() || trimmedOptions.length < 2) return;

    const content: MessageContent = {
      type: 'poll',
      poll: {
        question: pollQuestion.trim(),
        options: trimmedOptions
      }
    };

    const message = await messagingService.sendMessage(conversationId, content);
    if (message) {
      setMessages(prev => [...prev, message]);
      setShowPollModal(false);
      setPollQuestion('');
      setPollOptions(['', '']);
    }
  };

  const handleCreateEvent = async () => {
    if (!eventTitle.trim() || !eventDateTime) return;

    const content: MessageContent = {
      type: 'event',
      event: {
        title: eventTitle.trim(),
        datetime: eventDateTime,
        location: eventLocation.trim() || undefined,
        description: eventDescription.trim() || undefined
      }
    };

    const message = await messagingService.sendMessage(conversationId, content);
    if (message) {
      setMessages(prev => [...prev, message]);
      setShowEventModal(false);
      setEventTitle('');
      setEventDateTime('');
      setEventLocation('');
      setEventDescription('');
    }
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Copy content to clipboard
  const handleCopy = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Format time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Format date header
  const formatDateHeader = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
    }
  };

  // Check if we should show date header
  const shouldShowDateHeader = (message: Message, index: number) => {
    if (index === 0) return true;
    const prevDate = new Date(messages[index - 1].created_at).toDateString();
    const currDate = new Date(message.created_at).toDateString();
    return prevDate !== currDate;
  };

  // Status indicator
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
          border: '2px solid var(--bg-secondary)'
        }}
      />
    );
  };

  // Render message content based on type
  const renderMessageContent = (message: Message) => {
    const content = message.content as MessageContent;
    const isOwn = message.sender_id === currentUser?.id;
    const effectiveType = content.type || message.message_type;

    if (effectiveType === 'shared_chat') {
      return (
        <div
          style={{
            background: isOwn ? 'rgba(255, 255, 255, 0.1)' : 'rgba(220, 38, 38, 0.1)',
            borderRadius: '8px',
            padding: '0.75rem',
            border: `1px solid ${isOwn ? 'rgba(255, 255, 255, 0.2)' : 'rgba(220, 38, 38, 0.2)'}`,
            maxWidth: '100%'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Bot style={{ width: '16px', height: '16px', color: 'var(--roof-red)' }} />
            <span style={{ fontWeight: '600', fontSize: '0.875rem', color: 'var(--roof-red)' }}>
              Susan AI Response
            </span>
          </div>

          {content.text && (
            <p style={{ marginBottom: '0.5rem', fontStyle: 'italic', opacity: 0.9 }}>
              "{content.text}"
            </p>
          )}

          {content.shared_data?.original_query && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.75rem', opacity: 0.7 }}>Question:</strong>
              <p style={{ fontSize: '0.875rem', margin: '0.25rem 0' }}>
                {content.shared_data.original_query}
              </p>
            </div>
          )}

          {content.shared_data?.ai_response && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.75rem', opacity: 0.7 }}>Response:</strong>
              <p style={{
                fontSize: '0.875rem',
                margin: '0.25rem 0',
                whiteSpace: 'pre-wrap',
                maxHeight: '200px',
                overflow: 'auto'
              }}>
                {content.shared_data.ai_response}
              </p>
            </div>
          )}

          <button
            onClick={() => handleCopy(
              content.shared_data?.ai_response || '',
              message.id
            )}
            style={{
              background: 'transparent',
              border: '1px solid currentColor',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              color: 'inherit',
              opacity: 0.8
            }}
          >
            {copiedId === message.id ? (
              <>
                <Check style={{ width: '12px', height: '12px' }} />
                Copied!
              </>
            ) : (
              <>
                <Copy style={{ width: '12px', height: '12px' }} />
                Copy Response
              </>
            )}
          </button>
        </div>
      );
    }

    if (effectiveType === 'shared_email') {
      return (
        <div
          style={{
            background: isOwn ? 'rgba(255, 255, 255, 0.1)' : 'rgba(220, 38, 38, 0.1)',
            borderRadius: '8px',
            padding: '0.75rem',
            border: `1px solid ${isOwn ? 'rgba(255, 255, 255, 0.2)' : 'rgba(220, 38, 38, 0.2)'}`,
            maxWidth: '100%'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Mail style={{ width: '16px', height: '16px', color: 'var(--roof-red)' }} />
            <span style={{ fontWeight: '600', fontSize: '0.875rem', color: 'var(--roof-red)' }}>
              Email Draft
            </span>
          </div>

          {content.text && (
            <p style={{ marginBottom: '0.5rem', fontStyle: 'italic', opacity: 0.9 }}>
              "{content.text}"
            </p>
          )}

          {content.shared_data?.email_subject && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.75rem', opacity: 0.7 }}>Subject:</strong>
              <p style={{ fontSize: '0.875rem', margin: '0.25rem 0', fontWeight: '500' }}>
                {content.shared_data.email_subject}
              </p>
            </div>
          )}

          {content.shared_data?.email_body && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.75rem', opacity: 0.7 }}>Body:</strong>
              <pre style={{
                fontSize: '0.875rem',
                margin: '0.25rem 0',
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                maxHeight: '200px',
                overflow: 'auto'
              }}>
                {content.shared_data.email_body}
              </pre>
            </div>
          )}

          <button
            onClick={() => handleCopy(
              `Subject: ${content.shared_data?.email_subject || ''}\n\n${content.shared_data?.email_body || ''}`,
              message.id
            )}
            style={{
              background: 'transparent',
              border: '1px solid currentColor',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              color: 'inherit',
              opacity: 0.8
            }}
          >
            {copiedId === message.id ? (
              <>
                <Check style={{ width: '12px', height: '12px' }} />
                Copied!
              </>
            ) : (
              <>
                <Copy style={{ width: '12px', height: '12px' }} />
                Copy Email
              </>
            )}
          </button>
        </div>
      );
    }

    if (effectiveType === 'poll') {
      const question = content.poll?.question || 'Poll';
      const options = content.poll?.options || [];
      const votes = message.poll_votes || [];
      const totalVotes = votes.reduce((sum, v) => sum + v.count, 0);
      const myVote = votes.find(v => v.user_ids?.includes(currentUser?.id || ''));

      return (
        <div>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{question}</div>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {options.map((opt, index) => {
              const voteData = votes.find(v => v.option_index === index);
              const count = voteData?.count || 0;
              const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const selected = myVote?.option_index === index;
              return (
                <button
                  key={`${message.id}-opt-${index}`}
                  onClick={() => handleVotePoll(message.id, index)}
                  style={{
                    border: selected ? '1px solid rgba(34,197,94,0.8)' : '1px solid var(--border-color)',
                    background: selected ? 'rgba(34,197,94,0.12)' : 'var(--bg-primary)',
                    color: 'inherit',
                    textAlign: 'left',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '10px',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span>{opt}</span>
                    <span>{count}</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', marginTop: '0.35rem' }}>
                    <div
                      style={{
                        width: `${percent}%`,
                        height: '100%',
                        borderRadius: '999px',
                        background: selected ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>
            {totalVotes} vote{totalVotes === 1 ? '' : 's'}
          </div>
        </div>
      );
    }

    if (effectiveType === 'event') {
      const event = content.event;
      const rsvps = message.event_rsvps || [];
      const counts = {
        going: rsvps.find(r => r.status === 'going')?.count || 0,
        maybe: rsvps.find(r => r.status === 'maybe')?.count || 0,
        declined: rsvps.find(r => r.status === 'declined')?.count || 0
      };
      const myStatus = rsvps.find(r => r.user_ids?.includes(currentUser?.id || ''))?.status;

      return (
        <div>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{event?.title || 'Event'}</div>
          {event?.datetime && (
            <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '0.25rem' }}>
              {new Date(event.datetime).toLocaleString()}
            </div>
          )}
          {event?.location && (
            <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '0.25rem' }}>
              {event.location}
            </div>
          )}
          {event?.description && (
            <div style={{ fontSize: '0.85rem', opacity: 0.9, marginBottom: '0.5rem' }}>
              {event.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(['going', 'maybe', 'declined'] as const).map(status => (
              <button
                key={`${message.id}-${status}`}
                onClick={() => handleRsvpEvent(message.id, status)}
                style={{
                  padding: '0.35rem 0.7rem',
                  borderRadius: '999px',
                  border: myStatus === status ? '1px solid rgba(34,197,94,0.8)' : '1px solid var(--border-color)',
                  background: myStatus === status ? 'rgba(34,197,94,0.12)' : 'var(--bg-primary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem'
                }}
              >
                {status === 'going' ? 'Going' : status === 'maybe' ? 'Maybe' : 'Declined'} · {counts[status]}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Default text message
    return (
      <>
        {content.text && (
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {content.text}
          </p>
        )}
        {content.attachments && content.attachments.length > 0 && (
          <div style={{ display: 'grid', gap: '0.5rem', marginTop: content.text ? '0.5rem' : 0 }}>
            {content.attachments.map((file) => (
              file.type.startsWith('image/') ? (
                <img
                  key={file.id}
                  src={file.url}
                  alt={file.name}
                  style={{
                    maxWidth: '240px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0,0,0,0.1)'
                  }}
                />
              ) : (
                <a
                  key={file.id}
                  href={file.url}
                  download={file.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'inherit',
                    textDecoration: 'none',
                    fontSize: '0.85rem'
                  }}
                >
                  <span style={{ fontWeight: 600 }}>File</span>
                  <span>{file.name}</span>
                </a>
              )
            ))}
          </div>
        )}
      </>
    );
  };

  const quickReactions = ['👍', '❤️', '😂', '🔥'];

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    const reactions = await messagingService.toggleReaction(messageId, emoji);
    setMessages(prev => prev.map(msg => (
      msg.id === messageId ? { ...msg, reactions } : msg
    )));
  };

  const handleTogglePin = async (messageId: string) => {
    const pinned = await messagingService.togglePin(conversationId, messageId);
    setMessages(prev => prev.map(msg => (
      msg.id === messageId ? { ...msg, is_pinned: pinned } : msg
    )));
    refreshPins();
  };

  const handleVotePoll = async (messageId: string, optionIndex: number) => {
    const votes = await messagingService.voteOnPoll(messageId, optionIndex);
    setMessages(prev => prev.map(msg => (
      msg.id === messageId ? { ...msg, poll_votes: votes } : msg
    )));
  };

  const handleRsvpEvent = async (messageId: string, status: 'going' | 'maybe' | 'declined') => {
    const rsvps = await messagingService.rsvpToEvent(messageId, status);
    setMessages(prev => prev.map(msg => (
      msg.id === messageId ? { ...msg, event_rsvps: rsvps } : msg
    )));
  };

  const availableMentions = (conversation.participants || [])
    .filter(p => p.email !== currentUser?.email)
    .map(p => ({
      id: p.user_id,
      name: p.name,
      email: p.email,
      username: p.username || p.email.split('@')[0]
    }));

  const mentionMatches = mentionSearchText
    ? availableMentions.filter(p =>
        p.username.toLowerCase().startsWith(mentionSearchText.toLowerCase()) ||
        (p.name || '').toLowerCase().includes(mentionSearchText.toLowerCase())
      )
    : availableMentions;

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const maxSize = 10 * 1024 * 1024;
    const newAttachments: NonNullable<MessageContent['attachments']> = [];
    setUploadingAttachments(true);

    for (const file of Array.from(files)) {
      if (file.size > maxSize) {
        console.warn(`File too large: ${file.name}`);
        continue;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const uploaded = await messagingService.uploadAttachment({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl
      });

      if (uploaded) {
        newAttachments.push(uploaded);
      } else {
        newAttachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          url: dataUrl
        });
      }
    }

    if (newAttachments.length > 0) {
      setAttachments(prev => [...(prev || []), ...newAttachments]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUploadingAttachments(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '0.5rem',
            cursor: 'pointer',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            display: 'flex'
          }}
        >
          <ArrowLeft style={{ width: '20px', height: '20px' }} />
        </button>

        {conversation.type === 'direct' && otherParticipant ? (
          <>
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: (teamMap[otherParticipant.userId]?.status || otherParticipant.status) === 'online'
                    ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                    : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: '600'
                }}
              >
                {otherDisplayName.charAt(0).toUpperCase()}
              </div>
              <div style={{ position: 'absolute', bottom: '-2px', right: '-2px' }}>
                <StatusIndicator status={teamMap[otherParticipant.userId]?.status || otherParticipant.status} />
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                {otherDisplayName}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {(teamMap[otherParticipant.userId]?.status || otherParticipant.status) === 'online' ? (
                  <>
                    <Circle style={{ width: '6px', height: '6px', fill: '#22c55e', color: '#22c55e' }} />
                    Online
                  </>
                ) : (
                  <>
                    <Clock style={{ width: '12px', height: '12px' }} />
                    Last seen recently
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: '700'
              }}
            >
              {(conversation.name || 'Group').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                {conversation.name || 'Group Chat'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {groupMembers.length + 1} members • {groupMembers.filter(p => teamMap[p.user_id]?.status === 'online').length} online
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setShowSearch(prev => !prev)}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: showSearch ? 'rgba(220,38,38,0.15)' : 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Search messages"
          >
            <Search style={{ width: '16px', height: '16px' }} />
          </button>
          <button
            onClick={() => setShowPinTray(prev => !prev)}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: showPinTray ? 'rgba(234,179,8,0.2)' : 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Pinned messages"
          >
            <Pin style={{ width: '16px', height: '16px' }} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '1rem'
        }}
      >
        {showSearch && (
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '0.75rem',
              marginBottom: '1rem'
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Search style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in this conversation..."
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  color: 'var(--text-primary)'
                }}
              />
              <button
                onClick={async () => {
                  if (!searchQuery.trim()) return;
                  const results = await messagingService.searchMessages(searchQuery, conversationId);
                  setSearchResults(results);
                }}
                style={{
                  padding: '0.4rem 0.7rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.75rem'
                }}
              >
                Search
              </button>
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchResults([]);
                }}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
            {searchResults.length > 0 && (
              <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                {searchResults.slice(0, 10).map(result => (
                  <div
                    key={`search-${result.id}`}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: 'var(--bg-primary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                      {formatDisplayName(result.sender?.name, result.sender?.email)} • {new Date(result.created_at).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      {(() => {
                        const content = result.content as MessageContent;
                        if (result.message_type === 'poll') return content.poll?.question || 'Poll';
                        if (result.message_type === 'event') return content.event?.title || 'Event';
                        if (content.attachments?.length) return 'Attachment';
                        return content.text || 'Message';
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showPinTray && (
          <div
            style={{
              background: 'rgba(234,179,8,0.08)',
              border: '1px solid rgba(234,179,8,0.35)',
              borderRadius: '12px',
              padding: '0.75rem',
              marginBottom: '1rem'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Pinned messages</div>
            {pinnedMessages.length === 0 ? (
              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>No pins yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {pinnedMessages.slice(0, 5).map((pin) => (
                  <button
                    key={pin.id}
                    onClick={() => {
                      const target = document.getElementById(`message-${pin.message_id}`);
                      if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setShowPinTray(false);
                      }
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: 'var(--bg-primary)',
                      borderRadius: '8px',
                      border: '1px solid rgba(234,179,8,0.2)',
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                      {formatDisplayName(pin.message?.sender?.name, pin.message?.sender?.email)} • {new Date(pin.message?.created_at).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                      {(pin.message?.content as MessageContent)?.text || 'Message'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            <p>No messages yet</p>
            <p style={{ fontSize: '0.875rem' }}>Send a message to start the conversation</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <button
                onClick={() => fetchMessages(messages[0]?.id)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  marginBottom: '1rem',
                  background: 'var(--bg-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  fontSize: '0.875rem'
                }}
              >
                Load older messages
              </button>
            )}

            {messages.map((message, index) => {
              const isOwn = message.sender_id === currentUser?.id;
              const showDateHeader = shouldShowDateHeader(message, index);
              const senderLabel = isOwn ? 'You' : formatDisplayName(message.sender?.name, message.sender?.email);

              return (
                <React.Fragment key={message.id}>
                  {showDateHeader && (
                    <div
                      style={{
                        textAlign: 'center',
                        margin: '1rem 0',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <span
                        style={{
                          background: 'var(--bg-secondary)',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '12px'
                        }}
                      >
                        {formatDateHeader(message.created_at)}
                      </span>
                    </div>
                  )}

                  <div
                    id={`message-${message.id}`}
                    style={{
                      display: 'flex',
                      justifyContent: isOwn ? 'flex-end' : 'flex-start',
                      marginBottom: '0.5rem'
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '80%',
                        padding: '0.75rem',
                        borderRadius: isOwn
                          ? '16px 16px 4px 16px'
                          : '16px 16px 16px 4px',
                        background: isOwn
                          ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                          : 'var(--bg-secondary)',
                        color: isOwn ? 'white' : 'var(--text-primary)'
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          marginBottom: '0.25rem',
                          opacity: isOwn ? 0.9 : 0.8,
                          color: isOwn ? 'rgba(255,255,255,0.9)' : 'var(--text-secondary)'
                        }}
                      >
                        {senderLabel}
                      </div>
                      {renderMessageContent(message)}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                        {(message.reactions || []).map((reaction) => {
                          const reacted = reaction.user_ids?.includes(currentUser?.id || '');
                          return (
                            <button
                              key={`${message.id}-${reaction.emoji}`}
                              onClick={() => handleToggleReaction(message.id, reaction.emoji)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '999px',
                                border: reacted ? '1px solid rgba(255,255,255,0.8)' : '1px solid var(--border-color)',
                                background: reacted ? 'rgba(255,255,255,0.2)' : 'var(--bg-primary)',
                                fontSize: '0.75rem',
                                cursor: 'pointer'
                              }}
                            >
                              <span>{reaction.emoji}</span>
                              <span>{reaction.count}</span>
                            </button>
                          );
                        })}
                        <div style={{ position: 'relative' }}>
                          <button
                            onClick={() => setOpenReactionPickerId(prev => prev === message.id ? null : message.id)}
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Smile style={{ width: '14px', height: '14px' }} />
                          </button>
                          {openReactionPickerId === message.id && (
                            <div
                              style={{
                                position: 'absolute',
                                bottom: '110%',
                                right: 0,
                                background: 'var(--bg-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                padding: '0.35rem',
                                display: 'flex',
                                gap: '0.25rem',
                                boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
                                zIndex: 20
                              }}
                            >
                              {quickReactions.map((emoji) => (
                                <button
                                  key={`${message.id}-${emoji}`}
                                  onClick={() => {
                                    handleToggleReaction(message.id, emoji);
                                    setOpenReactionPickerId(null);
                                  }}
                                  style={{
                                    fontSize: '1rem',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleTogglePin(message.id)}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            border: message.is_pinned ? '1px solid rgba(234,179,8,0.9)' : '1px solid var(--border-color)',
                            background: message.is_pinned ? 'rgba(234,179,8,0.2)' : 'var(--bg-primary)',
                            color: message.is_pinned ? '#facc15' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title={message.is_pinned ? 'Unpin' : 'Pin'}
                        >
                          <Pin style={{ width: '13px', height: '13px' }} />
                        </button>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: '0.5rem',
                          marginTop: '0.25rem',
                          fontSize: '0.7rem',
                          opacity: 0.7
                        }}
                      >
                        <span>{formatTime(message.created_at)}</span>
                        {message.is_edited && <span>(edited)</span>}
                      </div>
                      {isOwn && message.read_receipts && message.read_receipts.length > 0 && (
                        (() => {
                          const seenBy = message.read_receipts
                            .filter(id => id !== currentUser?.id)
                            .map(id => {
                              const participant = conversation.participants.find(p => p.user_id === id);
                              const name = teamMap[id]?.name || participant?.name;
                              const email = teamMap[id]?.email || participant?.email;
                              return formatDisplayName(name, email);
                            });
                          if (seenBy.length === 0) return null;
                          return (
                            <div style={{ fontSize: '0.65rem', marginTop: '0.15rem', opacity: 0.7 }}>
                              Seen by {seenBy.join(', ')}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </>
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: '0.5rem'
            }}
          >
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '16px 16px 16px 4px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)'
              }}
            >
              <div style={{ display: 'flex', gap: '4px' }}>
                <span className="typing-dot" style={{ animationDelay: '0s' }}>.</span>
                <span className="typing-dot" style={{ animationDelay: '0.2s' }}>.</span>
                <span className="typing-dot" style={{ animationDelay: '0.4s' }}>.</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          position: 'relative',
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)'
        }}
      >
        {/* @ Mention Dropdown */}
        {showMentionDropdown && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '1rem',
              right: '1rem',
              marginBottom: '0.5rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              zIndex: 100
            }}
          >
            {mentionMatches.length === 0 ? (
              <div style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                No matches
              </div>
            ) : (
              mentionMatches.map((person) => {
                const displayName = formatDisplayName(person.name, person.email);
                return (
                  <button
                    key={person.id}
                    onClick={() => {
                      const lastAtIndex = inputText.lastIndexOf('@');
                      const newText = inputText.slice(0, lastAtIndex) + '@' + person.username + ' ';
                      setInputText(newText);
                      setShowMentionDropdown(false);
                      inputRef.current?.focus();
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--text-primary)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: '600',
                        fontSize: '0.875rem'
                      }}
                    >
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: '500' }}>{displayName}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        @{person.username}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '0.5rem'
          }}
        >
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Attach photos"
          >
            <Paperclip style={{ width: '18px', height: '18px' }} />
          </button>
          <button
            onClick={() => setShowPollModal(true)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Create poll"
          >
            <BarChart3 style={{ width: '18px', height: '18px' }} />
          </button>
          <button
            onClick={() => setShowEventModal(true)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Create event"
          >
            <Calendar style={{ width: '18px', height: '18px' }} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => {
              const value = e.target.value;
              setInputText(value);
              handleTyping();

              // Check for @ mention trigger
              const lastAtIndex = value.lastIndexOf('@');
              if (lastAtIndex !== -1) {
                const textAfterAt = value.slice(lastAtIndex + 1);
                const matchList = textAfterAt === ''
                  ? availableMentions
                  : availableMentions.filter(p =>
                      p.username.toLowerCase().startsWith(textAfterAt.toLowerCase()) ||
                      p.name.toLowerCase().includes(textAfterAt.toLowerCase())
                    );

                if (matchList.length > 0) {
                  setShowMentionDropdown(true);
                } else {
                  setShowMentionDropdown(false);
                }
                setMentionSearchText(textAfterAt);
              } else {
                setShowMentionDropdown(false);
              }
            }}
            onKeyDown={handleKeyPress}
            placeholder="Type a message... (use @ to mention)"
            rows={1}
            style={{
              flex: 1,
              padding: '0.75rem',
              borderRadius: '20px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.9375rem',
              resize: 'none',
              outline: 'none',
              maxHeight: '120px'
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend || sending}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              border: 'none',
              background: canSend
                ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                : 'var(--bg-tertiary)',
              color: canSend ? 'white' : 'var(--text-secondary)',
              cursor: canSend ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            <Send style={{ width: '18px', height: '18px' }} />
          </button>
        </div>
        {attachments && attachments.length > 0 && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {attachments.map((file) => (
              <div key={file.id} style={{ position: 'relative' }}>
                {file.type.startsWith('image/') ? (
                  <img
                    src={file.url}
                    alt={file.name}
                    style={{
                      width: '64px',
                      height: '64px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '96px',
                      height: '64px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.7rem',
                      padding: '0.25rem',
                      textAlign: 'center'
                    }}
                  >
                    {file.name}
                  </div>
                )}
                <button
                  onClick={() => setAttachments(prev => (prev || []).filter(att => att.id !== file.id))}
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'var(--roof-red)',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {uploadingAttachments && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Uploading attachments...
          </div>
        )}
      </div>

      {showPollModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onClick={() => setShowPollModal(false)}
        >
          <div
            style={{
              width: '92%',
              maxWidth: '420px',
              background: 'var(--bg-primary)',
              borderRadius: '16px',
              padding: '1.25rem',
              border: '1px solid var(--border-color)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: '0.75rem' }}>Create Poll</h3>
            <input
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Poll question"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                marginBottom: '0.75rem'
              }}
            />
            {pollOptions.map((opt, idx) => (
              <input
                key={`poll-opt-${idx}`}
                value={opt}
                onChange={(e) => {
                  const next = [...pollOptions];
                  next[idx] = e.target.value;
                  setPollOptions(next);
                }}
                placeholder={`Option ${idx + 1}`}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  marginBottom: '0.5rem'
                }}
              />
            ))}
            <button
              onClick={() => setPollOptions(prev => [...prev, ''])}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '8px',
                border: '1px dashed var(--border-color)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                marginBottom: '0.75rem'
              }}
            >
              Add option
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setShowPollModal(false)}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-secondary)'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePoll}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white'
                }}
              >
                Post Poll
              </button>
            </div>
          </div>
        </div>
      )}

      {showEventModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onClick={() => setShowEventModal(false)}
        >
          <div
            style={{
              width: '92%',
              maxWidth: '420px',
              background: 'var(--bg-primary)',
              borderRadius: '16px',
              padding: '1.25rem',
              border: '1px solid var(--border-color)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: '0.75rem' }}>Create Event</h3>
            <input
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Event title"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                marginBottom: '0.75rem'
              }}
            />
            <input
              value={eventDateTime}
              onChange={(e) => setEventDateTime(e.target.value)}
              type="datetime-local"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                marginBottom: '0.75rem'
              }}
            />
            <input
              value={eventLocation}
              onChange={(e) => setEventLocation(e.target.value)}
              placeholder="Location (optional)"
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                marginBottom: '0.75rem'
              }}
            />
            <textarea
              value={eventDescription}
              onChange={(e) => setEventDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                marginBottom: '0.75rem',
                resize: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setShowEventModal(false)}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-secondary)'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateEvent}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white'
                }}
              >
                Post Event
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; }
          30% { opacity: 1; }
        }
        .typing-dot {
          animation: typingDot 1.4s infinite ease-in-out;
          font-weight: bold;
          font-size: 1.5rem;
          line-height: 0.5;
        }
      `}</style>
    </div>
  );
};

export default ConversationView;
