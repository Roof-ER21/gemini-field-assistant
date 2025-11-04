import React, { useState, useEffect } from 'react';
import {
  Users,
  MessageSquare,
  Search,
  Calendar,
  ChevronRight,
  User,
  Clock,
  Filter,
  Download,
  RefreshCw
} from 'lucide-react';
import { authService } from '../services/authService';
import { databaseService } from '../services/databaseService';

interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  state: string | null;
  total_messages: number;
  last_active: string;
}

interface ConversationSession {
  session_id: string;
  message_count: number;
  first_message_at: string;
  last_message_at: string;
  preview: string;
}

interface ChatMessage {
  id: string;
  message_id: string;
  sender: 'user' | 'bot';
  content: string;
  state: string | null;
  provider: string | null;
  sources: any;
  created_at: string;
}

interface AnalyticsSummary {
  total_messages?: number;
  unique_documents_viewed?: number;
  favorite_documents?: number;
  emails_generated?: number;
  last_active?: string;
}

const AdminPanel: React.FC = () => {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');

  const currentUser = authService.getCurrentUser();

  // Check if current user is admin
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchAnalytics();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      let resp = await fetch('/api/admin/users');
      if (!resp.ok) {
        // Fallback to basic endpoint if legacy schema causes failure
        resp = await fetch('/api/admin/users-basic');
      }
      if (!resp.ok) throw new Error('Failed to fetch users');
      const data = await resp.json();
      setUsers(data);
    } catch (err) {
      setError((err as Error).message);
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserConversations = async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/conversations?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      const data = await response.json();
      setConversations(data);
    } catch (err) {
      setError((err as Error).message);
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchConversationMessages = async (userId: string, sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/conversations/${sessionId}?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      const data = await response.json();
      setMessages(data);
    } catch (err) {
      setError((err as Error).message);
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const summary = await databaseService.getAnalyticsSummary();
      setAnalytics(summary || null);
    } catch (e) {
      console.warn('Failed to load analytics:', (e as Error).message);
    }
  };

  const handleUserSelect = async (user: UserSummary) => {
    setSelectedUser(user);
    setSelectedConversation(null);
    setMessages([]);
    await fetchUserConversations(user.id);
  };

  const handleConversationSelect = async (conversation: ConversationSession) => {
    setSelectedConversation(conversation);
    if (selectedUser) {
      await fetchConversationMessages(selectedUser.id, conversation.session_id);
    }
  };

  const exportConversation = () => {
    if (!selectedConversation || !messages.length) return;

    const conversationText = messages
      .map(msg => `[${new Date(msg.created_at).toLocaleString()}] ${msg.sender.toUpperCase()}: ${msg.content}`)
      .join('\n\n');

    const blob = new Blob([conversationText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${selectedConversation.session_id}-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filter users based on search and filters
  const filteredUsers = users.filter(user => {
    if (searchQuery && !user.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !user.email.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (roleFilter && user.role !== roleFilter) {
      return false;
    }
    if (dateFrom && user.last_active && new Date(user.last_active) < new Date(dateFrom)) {
      return false;
    }
    if (dateTo && user.last_active && new Date(user.last_active) > new Date(dateTo)) {
      return false;
    }
    return true;
  });

  // Access denied for non-admin users
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)' }}>
        <div
          className="p-12 rounded-2xl text-center max-w-md"
          style={{
            background: 'rgba(30, 30, 30, 0.95)',
            border: '2px solid var(--roof-red)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <div
            className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center animate-pulse"
            style={{
              background: 'linear-gradient(135deg, var(--roof-red) 0%, #dc2626 100%)',
              boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)'
            }}
          >
            <Users className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-3" style={{ color: 'white' }}>Access Denied</h2>
          <p className="text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
            You need admin privileges to access this panel.
          </p>
          <div
            className="p-4 rounded-lg text-sm"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}
          >
            <p style={{ color: 'var(--text-tertiary)' }}>
              If you believe this is an error, please contact your administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full" style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)' }}>
      {/* Analytics Summary Bar */}
      {analytics && (
        <div className="w-full p-4" style={{ position: 'absolute', top: 64, left: 0 }}>
          <div className="mx-4 grid grid-cols-2 md:grid-cols-5 gap-3" style={{
            background: 'rgba(30,30,30,0.9)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12,
            padding: 12,
            backdropFilter: 'blur(8px)'
          }}>
            <div className="text-center">
              <div className="text-xl font-bold" style={{ color: 'white' }}>{analytics.total_messages ?? 0}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Messages</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold" style={{ color: 'white' }}>{analytics.emails_generated ?? 0}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Emails</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold" style={{ color: 'white' }}>{analytics.unique_documents_viewed ?? 0}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Docs Viewed</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold" style={{ color: 'white' }}>{analytics.favorite_documents ?? 0}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Favorites</div>
            </div>
            <div className="text-center">
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Last Active</div>
              <div className="text-sm" style={{ color: 'white' }}>{analytics.last_active ? new Date(analytics.last_active).toLocaleString() : '-'}</div>
            </div>
          </div>
        </div>
      )}
      {/* User List Panel */}
      <div
        className="w-80 border-r flex flex-col"
        style={{
          background: 'rgba(30, 30, 30, 0.8)',
          borderColor: 'rgba(239, 68, 68, 0.2)',
          backdropFilter: 'blur(10px)'
        }}
      >
        {/* Search and Filters */}
        <div
          className="p-4 border-b"
          style={{
            borderColor: 'rgba(239, 68, 68, 0.2)',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, transparent 100%)'
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--roof-red) 0%, #dc2626 100%)',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
              }}
            >
              <Users className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-bold" style={{ color: 'white' }}>All Users</h2>
            <button
              onClick={fetchUsers}
              className="ml-auto p-2 rounded-lg transition-all"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Refresh users"
            >
              <RefreshCw className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full p-2 rounded mb-2"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)'
            }}
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="sales_rep">Sales Rep</option>
          </select>

          {/* Date Filters */}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From"
              className="p-2 rounded text-sm"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)'
              }}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="To"
              className="p-2 rounded text-sm"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          <div className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
            {filteredUsers.length} of {users.length} users
          </div>
        </div>

        {/* User List */}
        <div className="flex-1 overflow-y-auto">
          {loading && !users.length && (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-solid border-current border-r-transparent mb-4" style={{ color: 'var(--roof-red)' }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Loading users...
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 m-4 rounded-lg" style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%)',
              border: '2px solid rgba(239, 68, 68, 0.3)',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)'
            }}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--roof-red)' }}>
                  <span className="text-white text-xl font-bold">!</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold mb-1" style={{ color: 'var(--roof-red)' }}>Error Loading Users</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                  <button
                    onClick={fetchUsers}
                    className="mt-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: 'var(--roof-red)',
                      color: 'white'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          )}

          {filteredUsers.map((user) => (
            <div
              key={user.id}
              onClick={() => handleUserSelect(user)}
              className="p-3 border-b cursor-pointer hover:bg-white/5 transition-colors"
              style={{
                borderColor: 'var(--border-default)',
                background: selectedUser?.id === user.id ? 'var(--bg-elevated)' : 'transparent'
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: 'var(--roof-red)' }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{user.name}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {user.email}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        background: user.role === 'admin' ? 'var(--roof-red)' : 'var(--bg-elevated)',
                        color: user.role === 'admin' ? 'white' : 'var(--text-tertiary)'
                      }}
                    >
                      {user.role}
                    </span>
                    {user.state && (
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {user.state}
                      </span>
                    )}
                    <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>
                      {user.total_messages} msgs
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conversations Panel */}
      {selectedUser && (
        <div
          className="w-96 border-r flex flex-col"
          style={{
            background: 'var(--bg-secondary)',
            borderColor: 'var(--border-default)'
          }}
        >
          <div className="p-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-5 h-5" style={{ color: 'var(--roof-red)' }} />
              <h2 className="text-lg font-bold">Conversations</h2>
            </div>
            <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {selectedUser.name} - {conversations.length} conversations
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
              <div
                key={conv.session_id}
                onClick={() => handleConversationSelect(conv)}
                className="p-3 border-b cursor-pointer hover:bg-white/5 transition-colors"
                style={{
                  borderColor: 'var(--border-default)',
                  background: selectedConversation?.session_id === conv.session_id ? 'var(--bg-elevated)' : 'transparent'
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
                    <span className="text-sm font-medium">{conv.message_count} messages</span>
                  </div>
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                </div>
                <div className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                  {conv.preview.substring(0, 100)}...
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <Clock className="w-3 h-3" />
                  <span>{new Date(conv.first_message_at).toLocaleDateString()}</span>
                  <span>-</span>
                  <span>{new Date(conv.last_message_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}

            {!conversations.length && !loading && (
              <div className="p-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
                No conversations found
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages Panel */}
      <div className="flex-1 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
        {selectedConversation && selectedUser ? (
          <>
            {/* Header */}
            <div
              className="p-4 border-b flex items-center justify-between"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border-default)'
              }}
            >
              <div>
                <h2 className="text-lg font-bold">Conversation Details</h2>
                <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {new Date(selectedConversation.first_message_at).toLocaleString()} - {selectedConversation.message_count} messages
                </div>
              </div>
              <button
                onClick={exportConversation}
                className="px-4 py-2 rounded flex items-center gap-2 hover:opacity-80 transition-opacity"
                style={{ background: 'var(--roof-red)', color: 'white' }}
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {messages.map((msg, index) => (
                <div
                  key={msg.id}
                  className="mb-4 p-4 rounded-lg"
                  style={{
                    background: msg.sender === 'user' ? 'var(--user-bg)' : 'var(--bg-card)',
                    border: `1px solid ${msg.sender === 'user' ? 'var(--user-border)' : 'var(--border-default)'}`,
                    marginLeft: msg.sender === 'user' ? '20%' : '0',
                    marginRight: msg.sender === 'bot' ? '20%' : '0'
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: msg.sender === 'user' ? 'var(--user-avatar)' : 'var(--roof-red)' }}
                    >
                      {msg.sender === 'user' ? 'U' : 'AI'}
                    </div>
                    <span className="text-sm font-medium">
                      {msg.sender === 'user' ? selectedUser.name : 'S21 AI'}
                    </span>
                    <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                    {msg.content}
                  </div>
                  {msg.provider && (
                    <div className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      Provider: {msg.provider}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a conversation to view messages</p>
              <p className="text-sm mt-2">Choose a user and conversation from the left panels</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
