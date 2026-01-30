import React, { useState, useEffect } from 'react';
import {
  Users,
  MessageSquare,
  Mail,
  Search,
  Calendar,
  ChevronRight,
  User,
  Clock,
  Filter,
  Download,
  RefreshCw,
  BarChart3,
  Eye,
  DollarSign,
  Database,
  CheckCircle,
  XCircle,
  Loader
} from 'lucide-react';
import { authService } from '../services/authService';
import { databaseService } from '../services/databaseService';
import AdminAnalyticsTab from './AdminAnalyticsTab';
import AdminBudgetTab from './AdminBudgetTab';
import { useToast } from './Toast';

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

interface EmailLog {
  id?: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  emailType?: string;
  recipient?: string;
  subject?: string;
  body: string;
  context?: string;
  state?: string;
  created_at: string;
}

interface AllMessagesItem {
  id: string;
  message_id: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  sender: 'user' | 'bot';
  content: string;
  state: string | null;
  provider: string | null;
  session_id: string;
  created_at: string;
}

type QuickFilter = 'today' | 'week' | 'month' | 'all';

interface MigrationStatus {
  migration005: 'not_run' | 'running' | 'success' | 'error';
  migration006: 'not_run' | 'running' | 'success' | 'error';
  message005: string;
  message006: string;
}

const AdminPanel: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'users' | 'emails' | 'messages' | 'analytics' | 'budget'>('users');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Migration state
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus>({
    migration005: 'not_run',
    migration006: 'not_run',
    message005: '',
    message006: ''
  });

  // New state for emails and all messages
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [allMessages, setAllMessages] = useState<AllMessagesItem[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Email and message filters
  const [emailSearch, setEmailSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [messageUserFilter, setMessageUserFilter] = useState<string>('');

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
    }
  }, [isAdmin]);

  // Fetch emails when emails tab is active
  useEffect(() => {
    if (activeTab === 'emails' && isAdmin) {
      fetchEmails();
    }
  }, [activeTab, isAdmin]);

  // Fetch all messages when messages tab is active
  useEffect(() => {
    if (activeTab === 'messages' && isAdmin) {
      fetchAllMessages();
    }
  }, [activeTab, isAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get user email from localStorage for authentication
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;
      const headers = userEmail ? { 'x-user-email': userEmail } : {};

      let resp = await fetch('/api/admin/users', { headers });
      if (!resp.ok) {
        // Fallback to basic endpoint if legacy schema causes failure
        resp = await fetch('/api/admin/users-basic', { headers });
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
      // Get user email from localStorage for authentication
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;
      const headers = userEmail ? { 'x-user-email': userEmail } : {};

      const response = await fetch(`/api/admin/conversations?userId=${userId}`, { headers });
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
      // Get user email from localStorage for authentication
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;
      const headers = userEmail ? { 'x-user-email': userEmail } : {};

      const response = await fetch(`/api/admin/conversations/${sessionId}?userId=${userId}`, { headers });
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

  const fetchEmails = async () => {
    setEmailsLoading(true);
    try {
      // Get user email from localStorage for authentication
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;
      const headers = userEmail ? { 'x-user-email': userEmail } : {};

      // Try to fetch from API endpoint first
      const response = await fetch('/api/admin/emails', { headers });
      if (response.ok) {
        const responseData = await response.json();
        // API returns {data: [], pagination: {}} - extract the data array
        const emailData = responseData.data || responseData;
        setEmails(emailData);
      } else {
        // Fallback to localStorage if API not available
        const emailLogsStr = localStorage.getItem('email_generation_log') || '[]';
        const emailLogs = JSON.parse(emailLogsStr);
        setEmails(emailLogs);
      }
    } catch (err) {
      console.warn('Error fetching emails, using localStorage:', err);
      // Fallback to localStorage
      const emailLogsStr = localStorage.getItem('email_generation_log') || '[]';
      const emailLogs = JSON.parse(emailLogsStr);
      setEmails(emailLogs);
    } finally {
      setEmailsLoading(false);
    }
  };

  const fetchAllMessages = async () => {
    setMessagesLoading(true);
    try {
      // Get user email from localStorage for authentication
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;
      const headers = userEmail ? { 'x-user-email': userEmail } : {};

      // Try to fetch from API endpoint first
      const response = await fetch('/api/admin/all-messages', { headers });
      if (response.ok) {
        const responseData = await response.json();
        // API returns {data: [], pagination: {}} - extract the data array
        const messagesData = responseData.data || responseData;
        setAllMessages(messagesData);
      } else {
        // Fallback to localStorage if API not available
        const chatHistoryStr = localStorage.getItem('chatHistory') || '[]';
        const chatHistory = JSON.parse(chatHistoryStr);
        setAllMessages(chatHistory);
      }
    } catch (err) {
      console.warn('Error fetching all messages, using localStorage:', err);
      // Fallback to localStorage
      const chatHistoryStr = localStorage.getItem('chatHistory') || '[]';
      const chatHistory = JSON.parse(chatHistoryStr);
      setAllMessages(chatHistory);
    } finally {
      setMessagesLoading(false);
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
  const filteredUsers = (users || []).filter(user => {
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

  // Filter emails
  const filteredEmails = (emails || []).filter(email => {
    if (emailSearch) {
      const search = emailSearch.toLowerCase();
      return (
        email.subject?.toLowerCase().includes(search) ||
        email.recipient?.toLowerCase().includes(search) ||
        email.user_name?.toLowerCase().includes(search) ||
        email.user_email?.toLowerCase().includes(search) ||
        email.body?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Filter all messages
  const filteredMessages = (allMessages || []).filter(msg => {
    if (messageUserFilter && msg.user_id !== messageUserFilter) {
      return false;
    }
    if (messageSearch) {
      const search = messageSearch.toLowerCase();
      return (
        msg.content?.toLowerCase().includes(search) ||
        msg.user_name?.toLowerCase().includes(search) ||
        msg.user_email?.toLowerCase().includes(search)
      );
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
      total_users: users.length,
      active_users: users.filter(u => u.total_messages > 0).length,
      users_by_role: {
        admin: users.filter(u => u.role === 'admin').length,
        sales_rep: users.filter(u => u.role.includes('sales')).length,
        manager: users.filter(u => u.role === 'manager').length
      },
      user_details: users.map(u => ({
        email: u.email,
        name: u.name,
        role: u.role,
        total_messages: u.total_messages,
        last_active: u.last_active
      }))
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

  // Migration handlers
  const handleRunMigration005 = async () => {
    setMigrationStatus(prev => ({ ...prev, migration005: 'running', message005: 'Running migration...' }));

    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;
      const headers = userEmail ? { 'x-user-email': userEmail } : {};

      const response = await fetch('/api/admin/run-migration-005', {
        method: 'POST',
        headers
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Migration failed');
      }

      const result = await response.json();
      setMigrationStatus(prev => ({
        ...prev,
        migration005: 'success',
        message005: result.message || 'Migration 005 completed successfully!'
      }));
    } catch (err) {
      console.error('Migration 005 error:', err);
      setMigrationStatus(prev => ({
        ...prev,
        migration005: 'error',
        message005: (err as Error).message || 'Migration failed'
      }));
    }
  };

  const handleRunMigration006 = async () => {
    setMigrationStatus(prev => ({ ...prev, migration006: 'running', message006: 'Running migration...' }));

    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;
      const headers = userEmail ? { 'x-user-email': userEmail } : {};

      const response = await fetch('/api/admin/run-migration-006', {
        method: 'POST',
        headers
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Migration failed');
      }

      const result = await response.json();
      setMigrationStatus(prev => ({
        ...prev,
        migration006: 'success',
        message006: result.message || 'Migration 006 completed successfully!'
      }));
    } catch (err) {
      console.error('Migration 006 error:', err);
      setMigrationStatus(prev => ({
        ...prev,
        migration006: 'error',
        message006: (err as Error).message || 'Migration failed'
      }));
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
      minHeight: '100vh',
      overflowY: 'auto',
      overflowX: 'hidden',
      maxWidth: '100vw',
      boxSizing: 'border-box',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      {/* Database Migrations Section */}
      <div style={{
        background: '#0a0a0a',
        borderBottom: '2px solid #262626',
        padding: '1.5rem 2rem'
      }}>
        <div style={{
          maxWidth: '1600px',
          margin: '0 auto'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1rem'
          }}>
            <Database style={{ width: '20px', height: '20px', color: '#dc2626' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#ffffff', margin: 0 }}>
              Database Migrations
            </h3>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {/* Migration 005 Button */}
            <div style={{ flex: '1', minWidth: '300px' }}>
              <button
                onClick={handleRunMigration005}
                disabled={migrationStatus.migration005 === 'running' || migrationStatus.migration005 === 'success'}
                style={{
                  width: '100%',
                  padding: '0.75rem 1.25rem',
                  background: migrationStatus.migration005 === 'success'
                    ? '#166534'
                    : migrationStatus.migration005 === 'error'
                    ? '#dc2626'
                    : migrationStatus.migration005 === 'running'
                    ? '#262626'
                    : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: migrationStatus.migration005 === 'running' || migrationStatus.migration005 === 'success'
                    ? 'not-allowed'
                    : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s ease',
                  opacity: migrationStatus.migration005 === 'running' || migrationStatus.migration005 === 'success'
                    ? 0.6
                    : 1
                }}
                onMouseEnter={(e) => {
                  if (migrationStatus.migration005 !== 'running' && migrationStatus.migration005 !== 'success') {
                    e.currentTarget.style.background = '#b91c1c';
                  }
                }}
                onMouseLeave={(e) => {
                  if (migrationStatus.migration005 !== 'running' && migrationStatus.migration005 !== 'success') {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
                  }
                }}
              >
                {migrationStatus.migration005 === 'running' && (
                  <Loader style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                )}
                {migrationStatus.migration005 === 'success' && (
                  <CheckCircle style={{ width: '16px', height: '16px' }} />
                )}
                {migrationStatus.migration005 === 'error' && (
                  <XCircle style={{ width: '16px', height: '16px' }} />
                )}
                {migrationStatus.migration005 === 'not_run' && (
                  <Database style={{ width: '16px', height: '16px' }} />
                )}
                Run Migration 005 (Budget System)
              </button>
              {migrationStatus.message005 && (
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  background: migrationStatus.migration005 === 'success'
                    ? 'rgba(22, 101, 52, 0.2)'
                    : migrationStatus.migration005 === 'error'
                    ? 'rgba(153, 27, 27, 0.2)'
                    : 'rgba(58, 58, 58, 0.2)',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  color: migrationStatus.migration005 === 'success'
                    ? '#86efac'
                    : migrationStatus.migration005 === 'error'
                    ? '#fca5a5'
                    : '#a1a1aa'
                }}>
                  {migrationStatus.message005}
                </div>
              )}
            </div>

            {/* Migration 006 Button */}
            <div style={{ flex: '1', minWidth: '300px' }}>
              <button
                onClick={handleRunMigration006}
                disabled={migrationStatus.migration006 === 'running' || migrationStatus.migration006 === 'success'}
                style={{
                  width: '100%',
                  padding: '0.75rem 1.25rem',
                  background: migrationStatus.migration006 === 'success'
                    ? '#166534'
                    : migrationStatus.migration006 === 'error'
                    ? '#dc2626'
                    : migrationStatus.migration006 === 'running'
                    ? '#262626'
                    : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: migrationStatus.migration006 === 'running' || migrationStatus.migration006 === 'success'
                    ? 'not-allowed'
                    : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s ease',
                  opacity: migrationStatus.migration006 === 'running' || migrationStatus.migration006 === 'success'
                    ? 0.6
                    : 1
                }}
                onMouseEnter={(e) => {
                  if (migrationStatus.migration006 !== 'running' && migrationStatus.migration006 !== 'success') {
                    e.currentTarget.style.background = '#b91c1c';
                  }
                }}
                onMouseLeave={(e) => {
                  if (migrationStatus.migration006 !== 'running' && migrationStatus.migration006 !== 'success') {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
                  }
                }}
              >
                {migrationStatus.migration006 === 'running' && (
                  <Loader style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                )}
                {migrationStatus.migration006 === 'success' && (
                  <CheckCircle style={{ width: '16px', height: '16px' }} />
                )}
                {migrationStatus.migration006 === 'error' && (
                  <XCircle style={{ width: '16px', height: '16px' }} />
                )}
                {migrationStatus.migration006 === 'not_run' && (
                  <Database style={{ width: '16px', height: '16px' }} />
                )}
                Run Migration 006 (Fix Database Errors)
              </button>
              {migrationStatus.message006 && (
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  background: migrationStatus.migration006 === 'success'
                    ? 'rgba(22, 101, 52, 0.2)'
                    : migrationStatus.migration006 === 'error'
                    ? 'rgba(153, 27, 27, 0.2)'
                    : 'rgba(58, 58, 58, 0.2)',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  color: migrationStatus.migration006 === 'success'
                    ? '#86efac'
                    : migrationStatus.migration006 === 'error'
                    ? '#fca5a5'
                    : '#a1a1aa'
                }}>
                  {migrationStatus.message006}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        background: '#0a0a0a',
        borderBottom: '1px solid #262626',
        padding: '1rem 2rem',
        display: 'flex',
        gap: '1rem',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        flexWrap: 'nowrap'
      }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'users' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'transparent',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
        >
          <Users style={{ width: '1.125rem', height: '1.125rem' }} />
          Users
        </button>

        <button
          onClick={() => setActiveTab('emails')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'emails' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'transparent',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
        >
          <Mail style={{ width: '1.125rem', height: '1.125rem' }} />
          Emails
        </button>

        <button
          onClick={() => setActiveTab('messages')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'messages' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'transparent',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
        >
          <MessageSquare style={{ width: '1.125rem', height: '1.125rem' }} />
          Messages
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'analytics' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'transparent',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
        >
          <BarChart3 style={{ width: '1.125rem', height: '1.125rem' }} />
          Analytics
        </button>

        <button
          onClick={() => setActiveTab('budget')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'budget' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'transparent',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
        >
          <DollarSign style={{ width: '1.125rem', height: '1.125rem' }} />
          Budget
        </button>
      </div>

      {/* Main Container */}
      <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
        {activeTab === 'users' && (
        <div style={{ display: 'flex', gap: '1.5rem', height: 'calc(100vh - 200px)' }}>
        {/* Sidebar - Users List */}
        <div style={{
          width: '320px',
          background: '#0a0a0a',
          borderRadius: '12px',
          border: '1px solid #262626',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0
        }}>
          {/* Sidebar Header */}
          <div style={{
            padding: '25px',
            borderBottom: '1px solid #1a1a1a'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '20px',
              fontWeight: 700,
              marginBottom: '20px',
              color: '#ffffff'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
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
                  e.currentTarget.style.background = 'rgba(220, 38, 38, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                title="Refresh users"
              >
                <RefreshCw style={{ width: '16px', height: '16px', color: '#dc2626' }} />
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
                  background: '#171717',
                  border: '1px solid #262626',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '14px',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#dc2626';
                  e.currentTarget.style.background = '#1a1a1a';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#262626';
                  e.currentTarget.style.background = '#171717';
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
                  background: '#171717',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  color: '#ffffff',
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
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
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
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
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
                      background: quickFilter === filter ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : '#171717',
                      border: `1px solid ${quickFilter === filter ? '#dc2626' : '#262626'}`,
                      borderRadius: '6px',
                      color: quickFilter === filter ? '#ffffff' : '#a1a1aa',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (quickFilter !== filter) {
                        e.currentTarget.style.background = '#1a1a1a';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (quickFilter !== filter) {
                        e.currentTarget.style.background = '#171717';
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
              color: '#a1a1aa',
              marginTop: '15px',
              paddingTop: '15px',
              borderTop: '1px solid #1a1a1a'
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
                  border: '4px solid #262626',
                  borderTop: '4px solid #dc2626',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <p style={{ color: '#a1a1aa', marginTop: '16px', fontSize: '14px' }}>
                  Loading users...
                </p>
              </div>
            )}

            {error && (
              <div style={{
                background: '#0a0a0a',
                border: '1px solid #dc2626',
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
                  background: selectedUser?.id === user.id ? '#171717' : '#0a0a0a',
                  border: '1px solid #262626',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  boxShadow: selectedUser?.id === user.id ? '-4px 0 0 #dc2626' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (selectedUser?.id !== user.id) {
                    e.currentTarget.style.background = '#171717';
                    e.currentTarget.style.borderColor = '#dc2626';
                    e.currentTarget.style.transform = 'translateX(4px)';
                    e.currentTarget.style.boxShadow = '-4px 0 0 #dc2626';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedUser?.id !== user.id) {
                    e.currentTarget.style.background = '#0a0a0a';
                    e.currentTarget.style.borderColor = '#262626';
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
                    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    fontWeight: 600,
                    flexShrink: 0,
                    position: 'relative',
                    color: '#ffffff'
                  }}>
                    {getInitials(user.name)}
                    {/* Status Indicator */}
                    <div style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '2px',
                      width: '12px',
                      height: '12px',
                      background: isUserOnline(user.last_active) ? '#10b981' : '#52525b',
                      border: '2px solid #0a0a0a',
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
                      color: '#ffffff'
                    }}>
                      {user.name}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#a1a1aa',
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
                    background: user.role === 'admin' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : user.role.includes('sales') ? '#dc2626' : '#262626',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: user.role === 'admin' || user.role.includes('sales') ? '#ffffff' : '#d4d4d8'
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
                      background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                      color: '#ffffff',
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
                color: '#a1a1aa'
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  background: '#171717',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  fontSize: '36px'
                }}>
                  👥
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>
                  No users found
                </div>
                <div style={{ fontSize: '14px', color: '#a1a1aa' }}>
                  Try adjusting your filters
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Conversations Panel - Shows when user is selected */}
        {selectedUser && (
          <div style={{
            flex: 1,
            background: '#0a0a0a',
            borderRadius: '12px',
            border: '1px solid #262626',
            display: 'flex',
            flexDirection: 'column',
            minWidth: '350px',
            maxWidth: '450px'
          }}>
            {/* Header */}
            <div style={{
              padding: '25px',
              borderBottom: '1px solid #1a1a1a'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '18px',
                fontWeight: 600,
                color: '#ffffff',
                marginBottom: '10px'
              }}>
                <MessageSquare style={{ width: '20px', height: '20px', color: '#dc2626' }} />
                Conversations
              </div>
              <div style={{
                fontSize: '14px',
                color: '#a1a1aa'
              }}>
                {selectedUser.name}
              </div>
            </div>

            {/* Conversations List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px'
            }} className="custom-scrollbar">
              {loading && conversations.length === 0 ? (
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
                    Loading conversations...
                  </p>
                </div>
              ) : conversations.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
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
                    💬
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#e4e4e7', marginBottom: '8px' }}>
                    No conversations
                  </div>
                  <div style={{ fontSize: '14px', color: '#71717a' }}>
                    This user has no chat history
                  </div>
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.session_id}
                    onClick={() => handleConversationSelect(conv)}
                    style={{
                      background: selectedConversation?.session_id === conv.session_id ? '#171717' : '#0a0a0a',
                      border: `1px solid ${selectedConversation?.session_id === conv.session_id ? '#dc2626' : '#262626'}`,
                      borderRadius: '12px',
                      padding: '16px',
                      marginBottom: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedConversation?.session_id !== conv.session_id) {
                        e.currentTarget.style.background = '#171717';
                        e.currentTarget.style.borderColor = '#dc2626';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedConversation?.session_id !== conv.session_id) {
                        e.currentTarget.style.background = '#0a0a0a';
                        e.currentTarget.style.borderColor = '#262626';
                      }
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px'
                    }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#ffffff'
                      }}>
                        <MessageSquare style={{ width: '14px', height: '14px' }} />
                        {conv.message_count}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#71717a'
                      }}>
                        {new Date(conv.last_message_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#a1a1aa',
                      lineHeight: '1.5',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {conv.preview || 'No preview available'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Messages Panel - Shows when conversation is selected */}
        {selectedUser && selectedConversation && (
          <div style={{
            flex: 1,
            background: '#0a0a0a',
            borderRadius: '12px',
            border: '1px solid #262626',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              padding: '25px',
              borderBottom: '1px solid #1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#ffffff',
                  marginBottom: '8px'
                }}>
                  <MessageSquare style={{ width: '20px', height: '20px', color: '#dc2626' }} />
                  Messages
                </div>
                <div style={{ fontSize: '13px', color: '#a1a1aa' }}>
                  {selectedConversation.message_count} messages • {new Date(selectedConversation.first_message_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={exportConversation}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(220, 38, 38, 0.2)',
                  border: '1px solid #dc2626',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(220, 38, 38, 0.2)';
                }}
              >
                <Download style={{ width: '16px', height: '16px' }} />
                Export
              </button>
            </div>

            {/* Messages List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px'
            }} className="custom-scrollbar">
              {loading && messages.length === 0 ? (
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
                    Loading messages...
                  </p>
                </div>
              ) : messages.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
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
                    📭
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#e4e4e7', marginBottom: '8px' }}>
                    No messages
                  </div>
                  <div style={{ fontSize: '14px', color: '#71717a' }}>
                    No messages in this conversation
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      marginBottom: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div style={{
                      maxWidth: '75%',
                      background: msg.sender === 'user' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : '#171717',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      position: 'relative'
                    }}>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        marginBottom: '8px',
                        color: msg.sender === 'user' ? 'rgba(255, 255, 255, 0.8)' : '#a1a1aa',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        {msg.sender === 'user' ? selectedUser.name : 'S21 AI'}
                      </div>
                      <div style={{
                        fontSize: '15px',
                        lineHeight: '1.6',
                        color: msg.sender === 'user' ? '#ffffff' : '#d4d4d8',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}>
                        {msg.content}
                      </div>
                      {msg.provider && (
                        <div style={{
                          marginTop: '10px',
                          fontSize: '11px',
                          color: msg.sender === 'user' ? 'rgba(255, 255, 255, 0.7)' : '#a1a1aa',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <span>Provider: {msg.provider}</span>
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#a1a1aa',
                      marginTop: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <Clock style={{ width: '12px', height: '12px' }} />
                      {new Date(msg.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        </div>
        )}

        {/* EMAILS TAB - Full Page View */}
        {activeTab === 'emails' && (
          <div style={{
            flex: 1,
            padding: '2rem',
            overflowY: 'auto'
          }} className="custom-scrollbar">
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', color: 'white' }}>
              Email Generation Log
            </h2>

            {/* Search and Filter Bar */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
              <input
                type="text"
                placeholder="Search emails by subject, recipient, user..."
                value={emailSearch}
                onChange={(e) => setEmailSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#171717',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#dc2626';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#262626';
                }}
              />
              <button
                onClick={fetchEmails}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#b91c1c';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
                }}
              >
                <RefreshCw style={{ width: '16px', height: '16px' }} />
                Refresh
              </button>
            </div>

            {/* Email Table */}
            <div style={{
              background: '#0a0a0a',
              borderRadius: '12px',
              border: '1px solid #262626',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#000000', borderBottom: '1px solid #262626' }}>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#ffffff' }}>User</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#ffffff' }}>Subject</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#ffffff' }}>Recipient</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#ffffff' }}>Date</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#ffffff' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {emailsLoading ? (
                    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#a1a1aa' }}>
                        <div style={{
                          display: 'inline-block',
                          width: '30px',
                          height: '30px',
                          border: '3px solid #262626',
                          borderTop: '3px solid #dc2626',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                          marginBottom: '0.5rem'
                        }} />
                        <div>Loading emails...</div>
                      </td>
                    </tr>
                  ) : filteredEmails.length === 0 ? (
                    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#a1a1aa' }}>
                        <div style={{
                          width: '64px',
                          height: '64px',
                          background: '#171717',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 1rem',
                          fontSize: '32px'
                        }}>
                          📧
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>
                          No emails found
                        </div>
                        <div style={{ fontSize: '14px', color: '#a1a1aa' }}>
                          {emailSearch ? 'Try adjusting your search' : 'No emails have been generated yet'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredEmails.map((email, index) => (
                      <tr key={email.id || index} style={{ borderBottom: '1px solid #1a1a1a' }}>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                          <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '0.25rem' }}>
                            {email.user_name || 'Unknown User'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                            {email.user_email || 'N/A'}
                          </div>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#a1a1aa', maxWidth: '300px' }}>
                          <div style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontWeight: 500,
                            color: '#d4d4d8'
                          }}>
                            {email.subject || 'No Subject'}
                          </div>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                          {email.recipient || 'N/A'}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#a1a1aa', whiteSpace: 'nowrap' }}>
                          {new Date(email.created_at).toLocaleDateString()} {new Date(email.created_at).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <button
                            onClick={() => {
                              toast.info(`Email: ${email.subject}`, `To: ${email.recipient}\n\n${email.body.substring(0, 200)}${email.body.length > 200 ? '...' : ''}`);
                            }}
                            style={{
                              padding: '0.5rem 1rem',
                              background: 'rgba(220, 38, 38, 0.2)',
                              border: '1px solid #dc2626',
                              borderRadius: '6px',
                              color: '#ffffff',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.2)';
                            }}
                          >
                            <Eye style={{ width: '14px', height: '14px' }} />
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Email Count */}
            {filteredEmails.length > 0 && (
              <div style={{
                marginTop: '1rem',
                fontSize: '0.875rem',
                color: '#71717a',
                textAlign: 'right'
              }}>
                Showing {filteredEmails.length} of {emails.length} emails
              </div>
            )}
          </div>
        )}

        {/* MESSAGES TAB - Full Page View */}
        {activeTab === 'messages' && (
          <div style={{
            flex: 1,
            padding: '2rem',
            overflowY: 'auto'
          }} className="custom-scrollbar">
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', color: 'white' }}>
              All Messages
            </h2>

            {/* Filters */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
              <select
                value={messageUserFilter}
                onChange={(e) => setMessageUserFilter(e.target.value)}
                style={{
                  padding: '0.75rem',
                  background: '#171717',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '14px',
                  cursor: 'pointer',
                  outline: 'none',
                  minWidth: '200px'
                }}
              >
                <option value="">All Users</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Search messages..."
                value={messageSearch}
                onChange={(e) => setMessageSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#171717',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#dc2626';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#262626';
                }}
              />

              <button
                onClick={fetchAllMessages}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#b91c1c';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
                }}
              >
                <RefreshCw style={{ width: '16px', height: '16px' }} />
                Refresh
              </button>
            </div>

            {/* Messages List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {messagesLoading ? (
                <div style={{
                  background: '#0a0a0a',
                  borderRadius: '12px',
                  padding: '3rem',
                  border: '1px solid #262626',
                  textAlign: 'center',
                  color: '#a1a1aa'
                }}>
                  <div style={{
                    display: 'inline-block',
                    width: '40px',
                    height: '40px',
                    border: '4px solid #262626',
                    borderTop: '4px solid #dc2626',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '1rem'
                  }} />
                  <div>Loading messages...</div>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div style={{
                  background: '#0a0a0a',
                  borderRadius: '12px',
                  padding: '4rem',
                  border: '1px solid #262626',
                  textAlign: 'center',
                  color: '#a1a1aa'
                }}>
                  <div style={{
                    width: '80px',
                    height: '80px',
                    background: '#171717',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.5rem',
                    fontSize: '40px'
                  }}>
                    💬
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>
                    No messages found
                  </div>
                  <div style={{ fontSize: '14px', color: '#a1a1aa' }}>
                    {messageSearch || messageUserFilter ? 'Try adjusting your filters' : 'No messages have been sent yet'}
                  </div>
                </div>
              ) : (
                filteredMessages.map((msg, index) => (
                  <div
                    key={msg.id || index}
                    style={{
                      background: '#0a0a0a',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      border: '1px solid #262626',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#dc2626';
                      e.currentTarget.style.background = '#171717';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#262626';
                      e.currentTarget.style.background = '#0a0a0a';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: msg.sender === 'user' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : '#262626',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: '#ffffff'
                        }}>
                          {msg.sender === 'user' ? getInitials(msg.user_name || 'User') : 'AI'}
                        </div>
                        <div>
                          <div style={{ fontWeight: '600', color: '#ffffff', fontSize: '15px' }}>
                            {msg.sender === 'user' ? (msg.user_name || 'Unknown User') : 'S21 AI'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                            {msg.user_email || 'N/A'}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#a1a1aa', textAlign: 'right' }}>
                        <div>{new Date(msg.created_at).toLocaleDateString()}</div>
                        <div>{new Date(msg.created_at).toLocaleTimeString()}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.9375rem', lineHeight: '1.6', color: '#a1a1aa', whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                    </div>
                    {msg.provider && (
                      <div style={{
                        marginTop: '0.75rem',
                        display: 'inline-block',
                        padding: '0.25rem 0.75rem',
                        background: 'rgba(220, 38, 38, 0.2)',
                        border: '1px solid rgba(220, 38, 38, 0.3)',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        color: '#dc2626',
                        fontWeight: 600
                      }}>
                        {msg.provider}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Message Count */}
            {filteredMessages.length > 0 && (
              <div style={{
                marginTop: '1rem',
                fontSize: '0.875rem',
                color: '#71717a',
                textAlign: 'right'
              }}>
                Showing {filteredMessages.length} of {allMessages.length} messages
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <AdminAnalyticsTab />
        )}

        {activeTab === 'budget' && (
          <AdminBudgetTab />
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
