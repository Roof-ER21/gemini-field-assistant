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
  ExternalLink,
  MoreVertical
} from 'lucide-react';
import {
  messagingService,
  Message,
  MessageContent,
  TeamMember
} from '../services/messagingService';
import { authService } from '../services/authService';

interface ConversationViewProps {
  conversationId: string;
  participant: TeamMember;
  onBack: () => void;
}

const ConversationView: React.FC<ConversationViewProps> = ({
  conversationId,
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentUser = authService.getCurrentUser();

  // Get participant username for mentions
  const participantUsername = participant.username || participant.email.split('@')[0];

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
        setMessages(data.messages);
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

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchMessages();

    // Join conversation room
    messagingService.joinConversation(conversationId);

    // Listen for new messages
    const unsubMessage = messagingService.onNewMessage((message) => {
      if (message.conversation_id === conversationId) {
        setMessages(prev => [...prev, message]);
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

    return () => {
      unsubMessage();
      unsubTyping();
      messagingService.leaveConversation(conversationId);
    };
  }, [conversationId, currentUser?.id, fetchMessages]);

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
      // Check if it matches the participant's username or email prefix
      const participantUsername = participant.username?.toLowerCase() ||
        participant.email.split('@')[0].toLowerCase();

      if (mentionedUsername === participantUsername) {
        mentionedUserIds.push(participant.userId);
      }
    }

    return [...new Set(mentionedUserIds)]; // Remove duplicates
  };

  // Send message
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    messagingService.stopTyping(conversationId);

    try {
      // Parse mentions from the message text
      const mentionedUserIds = parseMentions(text);

      const content: MessageContent = {
        type: 'text',
        text,
        ...(mentionedUserIds.length > 0 && { mentioned_users: mentionedUserIds })
      };

      const message = await messagingService.sendMessage(conversationId, content);

      if (message) {
        setMessages(prev => [...prev, message]);
        setInputText('');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
      inputRef.current?.focus();
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

    if (content.type === 'shared_chat') {
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

    if (content.type === 'shared_email') {
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

    // Default text message
    return (
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
        {content.text || ''}
      </p>
    );
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

        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: participant.status === 'online'
                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: '600'
            }}
          >
            {participant.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ position: 'absolute', bottom: '-2px', right: '-2px' }}>
            <StatusIndicator status={participant.status} />
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
            {participant.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {participant.status === 'online' ? (
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
                      {renderMessageContent(message)}

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
            <button
              onClick={() => {
                // Insert @username at the @ position
                const lastAtIndex = inputText.lastIndexOf('@');
                const newText = inputText.slice(0, lastAtIndex) + '@' + participantUsername + ' ';
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
                {participant.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: '500' }}>{participant.name}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  @{participantUsername}
                </div>
              </div>
            </button>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '0.5rem'
          }}
        >
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
                // Show dropdown if @ is at end or followed by partial match
                if (textAfterAt === '' || participantUsername.toLowerCase().startsWith(textAfterAt.toLowerCase())) {
                  setShowMentionDropdown(true);
                  setMentionSearchText(textAfterAt);
                } else {
                  setShowMentionDropdown(false);
                }
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
            disabled={!inputText.trim() || sending}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              border: 'none',
              background: inputText.trim()
                ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                : 'var(--bg-tertiary)',
              color: inputText.trim() ? 'white' : 'var(--text-secondary)',
              cursor: inputText.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            <Send style={{ width: '18px', height: '18px' }} />
          </button>
        </div>
      </div>

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
