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

const AdminPanel: React.FC = () => {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/users');
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      const data = await response.json();
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
      <div className="flex items-center justify-center h-full" style={{ background: 'var(--bg-primary)' }}>
        <div
          className="p-8 rounded-lg text-center max-w-md"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'var(--error)' }}>
            <Users className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p style={{ color: 'var(--text-tertiary)' }}>
            You need admin privileges to access this panel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* User List Panel */}
      <div
        className="w-80 border-r flex flex-col"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-default)'
        }}
      >
        {/* Search and Filters */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5" style={{ color: 'var(--roof-red)' }} />
            <h2 className="text-lg font-bold">All Users</h2>
            <button
              onClick={fetchUsers}
              className="ml-auto p-1 hover:bg-white/10 rounded transition-colors"
              title="Refresh users"
            >
              <RefreshCw className="w-4 h-4" />
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
            <div className="p-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
              Loading users...
            </div>
          )}

          {error && (
            <div className="p-4 m-4 rounded" style={{ background: 'var(--error)', color: 'white' }}>
              {error}
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
