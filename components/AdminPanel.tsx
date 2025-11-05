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
  RefreshCw,
  BarChart3
} from 'lucide-react';
import { authService } from '../services/authService';
import { databaseService } from '../services/databaseService';
import AdminAnalyticsTab from './AdminAnalyticsTab';

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

type QuickFilter = 'today' | 'week' | 'month' | 'all';

const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'conversations' | 'messages' | 'analytics'>('users');
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
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

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

  // Quick filter date calculation
  const getQuickFilterDate = (filter: QuickFilter): Date | null => {
    const now = new Date();
    switch (filter) {
      case 'today':
        return new Date(now.setHours(0, 0, 0, 0));
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo;
      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return monthAgo;
      case 'all':
      default:
        return null;
    }
  };

  // Apply quick filter
  const handleQuickFilter = (filter: QuickFilter) => {
    setQuickFilter(filter);
    const filterDate = getQuickFilterDate(filter);
    if (filterDate) {
      setDateFrom(filterDate.toISOString().split('T')[0]);
      setDateTo(new Date().toISOString().split('T')[0]);
    } else {
      setDateFrom('');
      setDateTo('');
    }
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

  // Get user initials for avatar
  const getInitials = (name: string): string => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Export all users data to CSV
  const exportAllUsers = () => {
    if (users.length === 0) return;

    const csvHeader = 'Name,Email,Role,State,Total Messages,Last Active\n';
    const csvRows = users.map(user =>
      `"${user.name}","${user.email}","${user.role}","${user.state || 'N/A'}",${user.total_messages},"${user.last_active ? new Date(user.last_active).toLocaleString() : 'N/A'}"`
    ).join('\n');

    const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-users-export-${new Date().toISOString()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export analytics summary
  const exportAnalyticsSummary = () => {
    const summary = {
      generated_at: new Date().toISOString(),
      analytics,
      total_users: users.length,
      active_users: users.filter(u => u.total_messages > 0).length,
      users_by_role: {
        admin: users.filter(u => u.role === 'admin').length,
        sales_rep: users.filter(u => u.role.includes('sales')).length,
        manager: users.filter(u => u.role === 'manager').length
      }
    };

    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-summary-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Determine online status (mock - can be enhanced with real data)
  const isUserOnline = (lastActive: string): boolean => {
    if (!lastActive) return false;
    const lastActiveDate = new Date(lastActive);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return lastActiveDate > fiveMinutesAgo;
  };

  // Handle stat card clicks
  const handleStatClick = (statType: 'messages' | 'emails' | 'docs' | 'active') => {
    setActiveTab('analytics');
    // Optional: Pass filter to analytics tab via state/context
    if ('vibrate' in navigator) {
      navigator.vibrate(30); // Haptic feedback
    }
  };

  // Access denied for non-admin users
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: '#0f0f0f' }}>
        <div
          className="p-12 rounded-2xl text-center max-w-md"
          style={{
            background: '#1a1a1a',
            border: '2px solid #991b1b',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div
            className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center animate-pulse"
            style={{
              background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
              boxShadow: '0 8px 24px rgba(127, 29, 29, 0.4)'
            }}
          >
            <Users className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-3" style={{ color: '#e4e4e7' }}>Access Denied</h2>
          <p className="text-base mb-6" style={{ color: '#a1a1aa' }}>
            You need admin privileges to access this panel.
          </p>
          <div
            className="p-4 rounded-lg text-sm"
            style={{
              background: 'rgba(153, 27, 27, 0.1)',
              border: '1px solid rgba(153, 27, 27, 0.3)'
            }}
          >
            <p style={{ color: '#71717a' }}>
              If you believe this is an error, please contact your administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#0f0f0f',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      {/* Stats Header - Fixed */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a',
        padding: '20px 30px',
        zIndex: 100,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px'
      }}>
        {/* Stat Card 1 */}
        <div
          onClick={() => handleStatClick('messages')}
          title="Click to view analytics"
          style={{
            background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
            padding: '20px',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(127, 29, 29, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '100px',
            height: '100px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            transform: 'translate(30%, -30%)'
          }} />
          <div style={{ fontSize: '36px', fontWeight: 700, marginBottom: '5px', position: 'relative', zIndex: 1 }}>
            {analytics?.total_messages ?? 0}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.9, fontWeight: 500, position: 'relative', zIndex: 1 }}>
            Total Messages
          </div>
        </div>

        {/* Stat Card 2 */}
        <div
          onClick={() => handleStatClick('emails')}
          title="Click to view analytics"
          style={{
            background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
            padding: '20px',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(127, 29, 29, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '100px',
            height: '100px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            transform: 'translate(30%, -30%)'
          }} />
          <div style={{ fontSize: '36px', fontWeight: 700, marginBottom: '5px', position: 'relative', zIndex: 1 }}>
            {analytics?.emails_generated ?? 0}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.9, fontWeight: 500, position: 'relative', zIndex: 1 }}>
            Emails Generated
          </div>
        </div>

        {/* Stat Card 3 */}
        <div
          onClick={() => handleStatClick('docs')}
          title="Click to view analytics"
          style={{
            background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
            padding: '20px',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(127, 29, 29, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '100px',
            height: '100px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            transform: 'translate(30%, -30%)'
          }} />
          <div style={{ fontSize: '36px', fontWeight: 700, marginBottom: '5px', position: 'relative', zIndex: 1 }}>
            {analytics?.unique_documents_viewed ?? 0}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.9, fontWeight: 500, position: 'relative', zIndex: 1 }}>
            Documents
          </div>
        </div>

        {/* Stat Card 4 */}
        <div
          onClick={() => handleStatClick('active')}
          title="Click to view analytics"
          style={{
            background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
            padding: '20px',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(127, 29, 29, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '100px',
            height: '100px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            transform: 'translate(30%, -30%)'
          }} />
          <div style={{ fontSize: '36px', fontWeight: 700, marginBottom: '5px', position: 'relative', zIndex: 1 }}>
            {analytics?.last_active ? new Date(analytics.last_active).toLocaleDateString() : '-'}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.9, fontWeight: 500, position: 'relative', zIndex: 1 }}>
            Last Active
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        position: 'fixed',
        top: '140px',
        left: 0,
        right: 0,
        background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a',
        zIndex: 99,
        display: 'flex',
        padding: '0 30px'
      }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'users'
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : 'transparent',
            color: activeTab === 'users' ? '#fff' : 'rgba(255, 255, 255, 0.7)',
            border: 'none',
            borderBottom: activeTab === 'users'
              ? '2px solid #ef4444'
              : '2px solid transparent',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: activeTab === 'users' ? '600' : '400',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          onMouseEnter={(e) => {
            if (activeTab !== 'users') {
              e.currentTarget.style.color = '#fff';
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'users') {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }
          }}
        >
          <Users className="w-4 h-4" />
          Users
        </button>

        <button
          onClick={() => setActiveTab('conversations')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'conversations'
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : 'transparent',
            color: activeTab === 'conversations' ? '#fff' : 'rgba(255, 255, 255, 0.7)',
            border: 'none',
            borderBottom: activeTab === 'conversations'
              ? '2px solid #ef4444'
              : '2px solid transparent',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: activeTab === 'conversations' ? '600' : '400',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          onMouseEnter={(e) => {
            if (activeTab !== 'conversations') {
              e.currentTarget.style.color = '#fff';
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'conversations') {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }
          }}
        >
          <MessageSquare className="w-4 h-4" />
          Conversations
        </button>

        <button
          onClick={() => setActiveTab('messages')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'messages'
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : 'transparent',
            color: activeTab === 'messages' ? '#fff' : 'rgba(255, 255, 255, 0.7)',
            border: 'none',
            borderBottom: activeTab === 'messages'
              ? '2px solid #ef4444'
              : '2px solid transparent',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: activeTab === 'messages' ? '600' : '400',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          onMouseEnter={(e) => {
            if (activeTab !== 'messages') {
              e.currentTarget.style.color = '#fff';
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'messages') {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }
          }}
        >
          <MessageSquare className="w-4 h-4" />
          Messages
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'analytics'
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : 'transparent',
            color: activeTab === 'analytics' ? '#fff' : 'rgba(255, 255, 255, 0.7)',
            border: 'none',
            borderBottom: activeTab === 'analytics'
              ? '2px solid #ef4444'
              : '2px solid transparent',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: activeTab === 'analytics' ? '600' : '400',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          onMouseEnter={(e) => {
            if (activeTab !== 'analytics') {
              e.currentTarget.style.color = '#fff';
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'analytics') {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }
          }}
        >
          <BarChart3 className="w-4 h-4" />
          Analytics
        </button>
      </div>

      {/* Main Container */}
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', marginTop: '50px' }}>
        {activeTab === 'users' && (
        <>{/* Sidebar - Users List */}
        <div style={{
          width: '320px',
          background: '#1a1a1a',
          borderRight: '1px solid #2a2a2a',
          display: 'flex',
          flexDirection: 'column',
          marginTop: '140px'
        }}>
          {/* Sidebar Header */}
          <div style={{
            padding: '25px',
            borderBottom: '1px solid #2a2a2a'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '20px',
              fontWeight: 700,
              marginBottom: '20px',
              color: '#e4e4e7'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                background: 'linear-gradient(135deg, #991b1b, #7f1d1d)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px'
              }}>
                👥
              </div>
              All Users
              <button
                onClick={fetchUsers}
                style={{
                  marginLeft: 'auto',
                  padding: '6px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(153, 27, 27, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                title="Refresh users"
              >
                <RefreshCw style={{ width: '16px', height: '16px', color: '#991b1b' }} />
              </button>
            </div>

            {/* Search Box */}
            <div style={{ position: 'relative', marginBottom: '15px' }}>
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 40px 12px 16px',
                  background: '#262626',
                  border: '1px solid #3a3a3a',
                  borderRadius: '10px',
                  color: '#e4e4e7',
                  fontSize: '14px',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#991b1b';
                  e.currentTarget.style.background = '#2a2a2a';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#3a3a3a';
                  e.currentTarget.style.background = '#262626';
                }}
              />
              <span style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: 0.5
              }}>
                🔍
              </span>
            </div>

            {/* Filter Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '#262626',
                  border: '1px solid #3a3a3a',
                  borderRadius: '8px',
                  color: '#e4e4e7',
                  fontSize: '14px',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="sales_repMD">Sales Rep MD</option>
                <option value="manager">Manager</option>
              </select>

              {/* Date Filters */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setQuickFilter('all');
                  }}
                  style={{
                    padding: '10px',
                    background: '#262626',
                    border: '1px solid #3a3a3a',
                    borderRadius: '8px',
                    color: '#e4e4e7',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setQuickFilter('all');
                  }}
                  style={{
                    padding: '10px',
                    background: '#262626',
                    border: '1px solid #3a3a3a',
                    borderRadius: '8px',
                    color: '#e4e4e7',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Quick Filters */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                {(['today', 'week', 'month', 'all'] as QuickFilter[]).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => handleQuickFilter(filter)}
                    style={{
                      padding: '6px 12px',
                      background: quickFilter === filter ? '#991b1b' : '#262626',
                      border: `1px solid ${quickFilter === filter ? '#991b1b' : '#3a3a3a'}`,
                      borderRadius: '6px',
                      color: quickFilter === filter ? 'white' : '#a1a1aa',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (quickFilter !== filter) {
                        e.currentTarget.style.background = '#2a2a2a';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (quickFilter !== filter) {
                        e.currentTarget.style.background = '#262626';
                      }
                    }}
                  >
                    {filter === 'week' ? 'This Week' : filter === 'month' ? 'This Month' : filter === 'all' ? 'All Time' : 'Today'}
                  </button>
                ))}
              </div>
            </div>

            {/* Users Count */}
            <div style={{
              fontSize: '12px',
              color: '#71717a',
              marginTop: '15px',
              paddingTop: '15px',
              borderTop: '1px solid #2a2a2a'
            }}>
              {filteredUsers.length} of {users.length} users
            </div>
          </div>

          {/* Users List */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px'
          }} className="custom-scrollbar">
            {loading && !users.length && (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{
                  display: 'inline-block',
                  width: '40px',
                  height: '40px',
                  border: '4px solid #3a3a3a',
                  borderTop: '4px solid #991b1b',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <p style={{ color: '#71717a', marginTop: '16px', fontSize: '14px' }}>
                  Loading users...
                </p>
              </div>
            )}

            {error && (
              <div style={{
                background: '#1a1a1a',
                border: '1px solid #991b1b',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '12px'
              }}>
                <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: '8px' }}>Error</div>
                <div style={{ color: '#a1a1aa', fontSize: '14px' }}>{error}</div>
              </div>
            )}

            {filteredUsers.map((user) => (
              <div
                key={user.id}
                onClick={() => handleUserSelect(user)}
                style={{
                  background: selectedUser?.id === user.id ? '#2a2a2a' : '#262626',
                  border: '1px solid #3a3a3a',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  boxShadow: selectedUser?.id === user.id ? '-4px 0 0 #991b1b' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (selectedUser?.id !== user.id) {
                    e.currentTarget.style.background = '#2a2a2a';
                    e.currentTarget.style.borderColor = '#991b1b';
                    e.currentTarget.style.transform = 'translateX(4px)';
                    e.currentTarget.style.boxShadow = '-4px 0 0 #991b1b';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedUser?.id !== user.id) {
                    e.currentTarget.style.background = '#262626';
                    e.currentTarget.style.borderColor = '#3a3a3a';
                    e.currentTarget.style.transform = 'translateX(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                {/* User Card Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '10px'
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #991b1b, #7f1d1d)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    fontWeight: 600,
                    flexShrink: 0,
                    position: 'relative',
                    color: '#fff'
                  }}>
                    {getInitials(user.name)}
                    {/* Status Indicator */}
                    <div style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '2px',
                      width: '12px',
                      height: '12px',
                      background: isUserOnline(user.last_active) ? '#10b981' : '#6b7280',
                      border: '2px solid #262626',
                      borderRadius: '50%'
                    }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600,
                      fontSize: '15px',
                      marginBottom: '2px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: '#e4e4e7'
                    }}>
                      {user.name}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#71717a',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {user.email}
                    </div>
                  </div>
                </div>

                {/* User Card Footer */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    background: user.role === 'admin' ? '#dc2626' : user.role.includes('sales') ? '#991b1b' : '#3a3a3a',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: user.role === 'admin' || user.role.includes('sales') ? 'white' : '#e4e4e7'
                  }}>
                    {user.role}
                  </span>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: '#a1a1aa'
                  }}>
                    <span style={{
                      background: '#991b1b',
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>
                      {user.total_messages}
                    </span>
                    messages
                  </div>
                </div>
              </div>
            ))}

            {!loading && filteredUsers.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#71717a'
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  background: '#262626',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  fontSize: '36px'
                }}>
                  👥
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#e4e4e7', marginBottom: '8px' }}>
                  No users found
                </div>
                <div style={{ fontSize: '14px', color: '#71717a' }}>
                  Try adjusting your filters
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Conversations Panel */}
        <div style={{
          width: '380px',
          background: '#161616',
          borderRight: '1px solid #2a2a2a',
          display: 'flex',
          flexDirection: 'column',
          marginTop: '140px'
        }}>
          <div style={{
            padding: '25px',
            borderBottom: '1px solid #2a2a2a'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '18px',
              fontWeight: 700,
              marginBottom: '8px',
              color: '#e4e4e7'
            }}>
              💬 Conversations
            </div>
            <div style={{ fontSize: '13px', color: '#71717a' }}>
              {selectedUser ? `${selectedUser.name} - ${conversations.length} conversations` : 'Select a user to view conversations'}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }} className="custom-scrollbar">
            {selectedUser && conversations.map((conv) => (
              <div
                key={conv.session_id}
                onClick={() => handleConversationSelect(conv)}
                style={{
                  background: selectedConversation?.session_id === conv.session_id ? '#262626' : '#1a1a1a',
                  border: `1px solid ${selectedConversation?.session_id === conv.session_id ? '#991b1b' : '#2a2a2a'}`,
                  borderRadius: '10px',
                  padding: '14px',
                  marginBottom: '10px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (selectedConversation?.session_id !== conv.session_id) {
                    e.currentTarget.style.background = '#262626';
                    e.currentTarget.style.borderColor = '#991b1b';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedConversation?.session_id !== conv.session_id) {
                    e.currentTarget.style.background = '#1a1a1a';
                    e.currentTarget.style.borderColor = '#2a2a2a';
                  }
                }}
              >
                <div style={{
                  fontSize: '11px',
                  color: '#71717a',
                  marginBottom: '6px'
                }}>
                  {new Date(conv.first_message_at).toLocaleDateString()} - {conv.message_count} messages
                </div>
                <div style={{
                  fontSize: '13px',
                  color: '#a1a1aa',
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {conv.preview}
                </div>
              </div>
            ))}

            {!selectedUser && (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '40px',
                color: '#71717a'
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  background: '#262626',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  fontSize: '36px'
                }}>
                  📭
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#e4e4e7', marginBottom: '8px' }}>
                  Select a user
                </div>
                <div style={{ fontSize: '14px', color: '#71717a' }}>
                  Choose a user from the left to view their conversations
                </div>
              </div>
            )}

            {selectedUser && conversations.length === 0 && !loading && (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '40px',
                color: '#71717a'
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  background: '#262626',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  fontSize: '36px'
                }}>
                  📭
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#e4e4e7', marginBottom: '8px' }}>
                  No conversations found
                </div>
                <div style={{ fontSize: '14px', color: '#71717a' }}>
                  This user hasn't started any conversations yet
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Messages Panel */}
        <div style={{
          flex: 1,
          background: '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
          marginTop: '140px'
        }}>
          {selectedConversation && selectedUser ? (
            <>
              {/* Messages Header */}
              <div style={{
                padding: '20px 25px',
                borderBottom: '1px solid #2a2a2a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#1a1a1a'
              }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e4e4e7', marginBottom: '4px' }}>
                    Conversation Details
                  </h2>
                  <div style={{ fontSize: '13px', color: '#71717a' }}>
                    {new Date(selectedConversation.first_message_at).toLocaleString()} - {selectedConversation.message_count} messages
                  </div>
                </div>
                <button
                  onClick={exportConversation}
                  style={{
                    padding: '10px 20px',
                    background: '#991b1b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#7f1d1d';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#991b1b';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <Download style={{ width: '16px', height: '16px' }} />
                  Export
                </button>
              </div>

              {/* Messages List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }} className="custom-scrollbar">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      marginBottom: '16px',
                      padding: '16px',
                      borderRadius: '12px',
                      background: msg.sender === 'user' ? '#1a1a1a' : '#262626',
                      border: `1px solid ${msg.sender === 'user' ? '#2a2a2a' : '#3a3a3a'}`,
                      marginLeft: msg.sender === 'user' ? '15%' : '0',
                      marginRight: msg.sender === 'bot' ? '15%' : '0'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '10px'
                    }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: msg.sender === 'user' ? '#3a3a3a' : 'linear-gradient(135deg, #991b1b, #7f1d1d)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#fff'
                      }}>
                        {msg.sender === 'user' ? getInitials(selectedUser.name) : 'AI'}
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7' }}>
                        {msg.sender === 'user' ? selectedUser.name : 'S21 AI'}
                      </span>
                      <span style={{ fontSize: '12px', color: '#71717a', marginLeft: 'auto' }}>
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#a1a1aa',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap'
                    }}>
                      {msg.content}
                    </div>
                    {msg.provider && (
                      <div style={{
                        marginTop: '10px',
                        fontSize: '11px',
                        color: '#71717a',
                        padding: '4px 8px',
                        background: '#1a1a1a',
                        borderRadius: '4px',
                        display: 'inline-block'
                      }}>
                        Provider: {msg.provider}
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{
                      display: 'inline-block',
                      width: '30px',
                      height: '30px',
                      border: '3px solid #3a3a3a',
                      borderTop: '3px solid #991b1b',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '40px',
              color: '#71717a'
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                background: '#262626',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
                fontSize: '36px'
              }}>
                💬
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#e4e4e7', marginBottom: '8px' }}>
                Select a conversation to view messages
              </div>
              <div style={{ fontSize: '14px', color: '#71717a' }}>
                Choose a user and conversation from the left panels
              </div>
            </div>
          )}
        </div>
        </>
        )}

        {activeTab === 'conversations' && (
          <div style={{
            flex: 1,
            padding: '40px',
            color: '#e4e4e7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column'
          }}>
            <MessageSquare className="w-16 h-16 mb-4" style={{ color: '#991b1b' }} />
            <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Conversations View</h2>
            <p style={{ color: '#71717a' }}>Select a user from the Users tab to view their conversations</p>
          </div>
        )}

        {activeTab === 'messages' && (
          <div style={{
            flex: 1,
            padding: '40px',
            color: '#e4e4e7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column'
          }}>
            <MessageSquare className="w-16 h-16 mb-4" style={{ color: '#991b1b' }} />
            <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Messages View</h2>
            <p style={{ color: '#71717a' }}>Select a conversation to view messages</p>
          </div>
        )}

        {activeTab === 'analytics' && (
          <AdminAnalyticsTab />
        )}
      </div>

      {/* Global Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #3a3a3a;
          border-radius: 3px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4a4a4a;
        }

        @media (max-width: 1400px) {
          /* Adjust stat cards for smaller screens */
        }

        @media (max-width: 1024px) {
          /* Responsive adjustments */
        }
      ` }} />
    </div>
  );
};

export default AdminPanel;
