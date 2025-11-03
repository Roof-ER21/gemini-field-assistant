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
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={onClose}
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col"
            style={{ maxWidth: 'calc(100vw - 60px)' }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Chat History
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* New Chat Button */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  onNewChat();
                  onClose();
                }}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
              >
                + New Chat
              </button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-sm">Loading conversations...</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No conversations yet</p>
                  <p className="text-xs mt-1">Start chatting to see history here</p>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {sessions.map((session) => (
                    <div
                      key={session.session_id}
                      className={`group rounded-lg border transition-all ${
                        currentSessionId === session.session_id
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {/* Session Header */}
                      <div
                        onClick={() => handleLoadSession(session.session_id)}
                        className="p-3 cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-1 flex-1">
                            {session.title}
                          </h3>
                          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                          {session.preview}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(session.last_message_at)}
                          </span>
                          <span>{session.message_count} messages</span>
                          {session.state && (
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                              {session.state}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="px-3 pb-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportSession(session.session_id, 'txt');
                          }}
                          className="flex-1 px-2 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded flex items-center justify-center gap-1"
                          title="Export as text"
                        >
                          <Download className="w-3 h-3" />
                          TXT
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportSession(session.session_id, 'json');
                          }}
                          className="flex-1 px-2 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded flex items-center justify-center gap-1"
                          title="Export as JSON"
                        >
                          <Download className="w-3 h-3" />
                          JSON
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(session.session_id);
                          }}
                          className="px-2 py-1.5 text-xs bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded"
                          title="Delete conversation"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Load More Button */}
              {showLoadMore && (
                <div className="p-3">
                  <button
                    onClick={loadSessions}
                    className="w-full px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Load More
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-center text-gray-500">
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
