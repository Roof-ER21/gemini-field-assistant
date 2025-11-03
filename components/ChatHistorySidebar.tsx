import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageSquare, Download, Trash2, ChevronRight, Clock } from 'lucide-react';
import { databaseService, ChatSession } from '../services/databaseService';

interface ChatHistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSession: (sessionId: string, messages: any[]) => void;
  onNewChat: () => void;
  currentSessionId?: string;
}

const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
  isOpen,
  onClose,
  onLoadSession,
  onNewChat,
  currentSessionId
}) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [showLoadMore, setShowLoadMore] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const loadedSessions = await databaseService.getChatSessions(20);
      setSessions(loadedSessions);
      setShowLoadMore(loadedSessions.length >= 20);
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadSession = async (sessionId: string) => {
    const session = await databaseService.getChatSession(sessionId);
    if (session && session.messages) {
      onLoadSession(sessionId, session.messages);
      onClose();
    }
  };

  const handleExportSession = async (sessionId: string, format: 'json' | 'txt') => {
    try {
      const content = await databaseService.exportChatSession(sessionId, format);
      const session = sessions.find(s => s.session_id === sessionId);
      const fileName = `chat-${session?.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.${format}`;

      // Create download
      const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export session:', error);
      alert('Failed to export conversation');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (confirm('Are you sure you want to delete this conversation?')) {
      await databaseService.deleteChatSession(sessionId);
      loadSessions();
    }
  };

  const formatRelativeTime = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Swipe gesture handlers
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isRightSwipe) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 lg:hidden"
            style={{
              background: 'rgba(0, 0, 0, 0.6)',
              zIndex: 1000
            }}
            onClick={onClose}
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-80 flex flex-col"
            style={{
              maxWidth: 'calc(100vw - 60px)',
              zIndex: 1100,
              background: '#0f1419',
              borderRight: '1px solid rgba(239, 68, 68, 0.3)',
              boxShadow: '4px 0 24px -4px rgba(0, 0, 0, 0.5)',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* Header */}
            <div style={{
              padding: '1rem',
              borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                letterSpacing: '-0.01em'
              }}>
                <MessageSquare className="w-5 h-5" style={{ color: '#ef4444' }} />
                Chat History
              </h2>
              <button
                onClick={onClose}
                style={{
                  padding: '0.5rem',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <X className="w-5 h-5" style={{ color: '#9ca3af' }} />
              </button>
            </div>

            {/* New Chat Button */}
            <div style={{
              padding: '0.75rem',
              borderBottom: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              <button
                onClick={() => {
                  onNewChat();
                  onClose();
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: '500',
                  fontSize: '0.9375rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
                  letterSpacing: '-0.01em'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#dc2626';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ef4444';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.3)';
                }}
              >
                + New Chat
              </button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto" style={{ background: '#0f1419' }}>
              {isLoading ? (
                <div style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: '#9ca3af'
                }}>
                  <div style={{
                    display: 'inline-block',
                    width: '2rem',
                    height: '2rem',
                    border: '2px solid transparent',
                    borderTopColor: '#ef4444',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                  <p style={{
                    marginTop: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}>Loading conversations...</p>
                </div>
              ) : sessions.length === 0 ? (
                <div style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: '#6b7280'
                }}>
                  <MessageSquare className="w-12 h-12 mx-auto mb-3" style={{ opacity: 0.3 }} />
                  <p style={{
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    marginBottom: '0.25rem'
                  }}>No conversations yet</p>
                  <p style={{
                    fontSize: '0.8125rem',
                    color: '#4b5563'
                  }}>Start chatting to see history here</p>
                </div>
              ) : (
                <div style={{ padding: '0.5rem' }}>
                  {sessions.map((session) => {
                    const [isHovered, setIsHovered] = useState(false);
                    const [hoveredButton, setHoveredButton] = useState<string | null>(null);
                    const isActive = currentSessionId === session.session_id;

                    return (
                      <div
                        key={session.session_id}
                        style={{
                          background: isActive ? 'rgba(239, 68, 68, 0.1)' : '#1a1f2e',
                          border: `1px solid ${isActive ? 'rgba(239, 68, 68, 0.4)' : isHovered ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                          borderRadius: '0.5rem',
                          marginBottom: '0.25rem',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => setIsHovered(false)}
                      >
                        {/* Session Header */}
                        <div
                          onClick={() => handleLoadSession(session.session_id)}
                          style={{
                            padding: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            marginBottom: '0.25rem'
                          }}>
                            <h3 style={{
                              fontWeight: '500',
                              fontSize: '0.875rem',
                              color: '#fff',
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: 'vertical',
                              lineHeight: '1.25rem',
                              letterSpacing: '-0.01em'
                            }}>
                              {session.title}
                            </h3>
                            <ChevronRight
                              style={{
                                width: '1rem',
                                height: '1rem',
                                color: '#9ca3af',
                                flexShrink: 0,
                                marginLeft: '0.5rem'
                              }}
                            />
                          </div>
                          <p style={{
                            fontSize: '0.8125rem',
                            color: '#9ca3af',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            marginBottom: '0.5rem',
                            lineHeight: '1.25rem'
                          }}>
                            {session.preview}
                          </p>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            fontSize: '0.8125rem',
                            color: '#9ca3af'
                          }}>
                            <span style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              <Clock style={{ width: '0.75rem', height: '0.75rem' }} />
                              {formatRelativeTime(session.last_message_at)}
                            </span>
                            <span>{session.message_count} messages</span>
                            {session.state && (
                              <span style={{
                                padding: '0.125rem 0.5rem',
                                background: 'rgba(239, 68, 68, 0.2)',
                                color: '#ef4444',
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}>
                                {session.state}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{
                          padding: '0 0.75rem 0.5rem 0.75rem',
                          display: 'flex',
                          gap: '0.5rem',
                          opacity: isHovered ? 1 : 0,
                          transition: 'opacity 0.2s'
                        }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportSession(session.session_id, 'txt');
                            }}
                            style={{
                              flex: 1,
                              padding: '0.375rem 0.5rem',
                              fontSize: '0.75rem',
                              background: hoveredButton === 'txt' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                              color: '#9ca3af',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.25rem',
                              transition: 'background 0.2s',
                              fontWeight: '500'
                            }}
                            onMouseEnter={() => setHoveredButton('txt')}
                            onMouseLeave={() => setHoveredButton(null)}
                            title="Export as text"
                          >
                            <Download style={{ width: '0.75rem', height: '0.75rem' }} />
                            TXT
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportSession(session.session_id, 'json');
                            }}
                            style={{
                              flex: 1,
                              padding: '0.375rem 0.5rem',
                              fontSize: '0.75rem',
                              background: hoveredButton === 'json' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                              color: '#9ca3af',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.25rem',
                              transition: 'background 0.2s',
                              fontWeight: '500'
                            }}
                            onMouseEnter={() => setHoveredButton('json')}
                            onMouseLeave={() => setHoveredButton(null)}
                            title="Export as JSON"
                          >
                            <Download style={{ width: '0.75rem', height: '0.75rem' }} />
                            JSON
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(session.session_id);
                            }}
                            style={{
                              padding: '0.375rem 0.5rem',
                              fontSize: '0.75rem',
                              background: hoveredButton === 'delete' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)',
                              color: hoveredButton === 'delete' ? '#ef4444' : '#dc2626',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s',
                              fontWeight: '500'
                            }}
                            onMouseEnter={() => setHoveredButton('delete')}
                            onMouseLeave={() => setHoveredButton(null)}
                            title="Delete conversation"
                          >
                            <Trash2 style={{ width: '0.75rem', height: '0.75rem' }} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Load More Button */}
              {showLoadMore && (() => {
                const [isLoadMoreHovered, setIsLoadMoreHovered] = useState(false);
                return (
                  <div style={{ padding: '0.75rem' }}>
                    <button
                      onClick={loadSessions}
                      style={{
                        width: '100%',
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        color: isLoadMoreHovered ? '#fff' : '#9ca3af',
                        background: isLoadMoreHovered ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontWeight: '500',
                        letterSpacing: '-0.01em'
                      }}
                      onMouseEnter={() => setIsLoadMoreHovered(true)}
                      onMouseLeave={() => setIsLoadMoreHovered(false)}
                    >
                      Load More
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div style={{
              padding: '0.75rem',
              borderTop: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              <p style={{
                fontSize: '0.75rem',
                textAlign: 'center',
                color: '#6b7280'
              }}>
                Swipe right to close
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ChatHistorySidebar;
