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
  Loader,
  Settings,
  ToggleLeft,
  ToggleRight,
  Sliders,
  Trophy,
  MapPin,
  Target,
  CloudLightning,
  Bot,
  UserPlus,
  Trash2,
  Edit2,
  Send,
  Power
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

interface LeaderboardSyncStatus {
  lastSync: string | null;
  lastSyncStatus: 'success' | 'error' | 'never' | string;
  lastSyncError: string | null;
  nextSync: string | null;
  nextSyncLocal?: string | null;
  recordCount: number;
}

// User mapping interfaces
interface UserMapping {
  id: number;
  user_id: string;
  sales_rep_id: number;
  notes: string | null;
  created_at: string;
  user_email: string;
  user_name: string;
  sales_rep_name: string;
  sales_rep_email: string;
  created_by_email: string | null;
}

interface UnmappedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

interface UnmappedSalesRep {
  id: number;
  name: string;
  email: string;
  team: string;
  is_active: boolean;
}

const AdminPanel: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'users' | 'emails' | 'messages' | 'analytics' | 'budget' | 'mappings' | 'settings'>('users');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);

  // User-to-Sales-Rep mapping state
  const [userMappings, setUserMappings] = useState<UserMapping[]>([]);
  const [unmappedUsers, setUnmappedUsers] = useState<UnmappedUser[]>([]);
  const [unmappedSalesReps, setUnmappedSalesReps] = useState<UnmappedSalesRep[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [selectedUnmappedUser, setSelectedUnmappedUser] = useState<string>('');
  const [selectedUnmappedRep, setSelectedUnmappedRep] = useState<string>('');
  const [mappingNotes, setMappingNotes] = useState('');
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

  const [leaderboardSyncStatus, setLeaderboardSyncStatus] = useState<LeaderboardSyncStatus | null>(null);
  const [leaderboardSyncRunning, setLeaderboardSyncRunning] = useState(false);
  const [leaderboardSyncMessage, setLeaderboardSyncMessage] = useState<string | null>(null);

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

  // System settings state
  const [systemSettings, setSystemSettings] = useState<Record<string, any>>({});
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState<Set<string>>(new Set());

  // User management modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [userFormData, setUserFormData] = useState({ name: '', email: '', role: 'sales_rep', state: '' });
  const [userModalLoading, setUserModalLoading] = useState(false);
  const [showConversationsModal, setShowConversationsModal] = useState(false);
  const [conversationsModalUser, setConversationsModalUser] = useState<UserSummary | null>(null);

  // Settings tab - selected user for per-user actions
  const [settingsSelectedUserId, setSettingsSelectedUserId] = useState<string>('');
  const [settingsUserActionLoading, setSettingsUserActionLoading] = useState(false);

  const currentUser = authService.getCurrentUser();

  // Check if current user is admin
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchLeaderboardSyncStatus();
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

  // Fetch user mappings when mappings tab is active
  useEffect(() => {
    if (activeTab === 'mappings' && isAdmin) {
      fetchUserMappings();
    }
  }, [activeTab, isAdmin]);

  // Fetch system settings when settings tab is active
  useEffect(() => {
    if (activeTab === 'settings' && isAdmin) {
      fetchSystemSettings();
    }
  }, [activeTab, isAdmin]);

  // Fetch all system settings
  const fetchSystemSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;
      const headers: Record<string, string> = userEmail ? { 'x-user-email': userEmail } : {};

      const response = await fetch('/api/admin/settings', { headers });
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      const data = await response.json();
      const settingsMap: Record<string, any> = {};
      for (const setting of data.settings || []) {
        settingsMap[setting.key] = setting;
      }
      setSystemSettings(settingsMap);
    } catch (err) {
      console.error('Error fetching settings:', err);
      setSettingsError((err as Error).message);
    } finally {
      setSettingsLoading(false);
    }
  };

  // Update a system setting
  const updateSetting = async (key: string, value: any) => {
    setSavingSettings(prev => new Set(prev).add(key));
    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;

      const response = await fetch(`/api/admin/settings/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(userEmail ? { 'x-user-email': userEmail } : {})
        },
        body: JSON.stringify({ value })
      });

      if (!response.ok) {
        throw new Error('Failed to update setting');
      }

      const data = await response.json();
      setSystemSettings(prev => ({
        ...prev,
        [key]: data.setting
      }));
      toast.success('Setting updated');
    } catch (err) {
      console.error('Error updating setting:', err);
      toast.error('Error', (err as Error).message);
    } finally {
      setSavingSettings(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // Toggle a feature flag
  const toggleFeature = async (key: string) => {
    const currentValue = systemSettings[key]?.value?.enabled ?? true;
    await updateSetting(key, { enabled: !currentValue });
  };

  const fetchUserMappings = async () => {
    setMappingsLoading(true);
    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;
      const headers: Record<string, string> = userEmail ? { 'x-user-email': userEmail } : {};

      const [mappingsRes, unmappedUsersRes, unmappedRepsRes] = await Promise.all([
        fetch('/api/admin/user-mappings', { headers }),
        fetch('/api/admin/unmapped-users', { headers }),
        fetch('/api/admin/unmapped-sales-reps', { headers })
      ]);

      if (mappingsRes.ok) {
        const data = await mappingsRes.json();
        setUserMappings(data.mappings || []);
      }
      if (unmappedUsersRes.ok) {
        const data = await unmappedUsersRes.json();
        setUnmappedUsers(data.users || []);
      }
      if (unmappedRepsRes.ok) {
        const data = await unmappedRepsRes.json();
        setUnmappedSalesReps(data.salesReps || []);
      }
    } catch (err) {
      console.error('Error fetching user mappings:', err);
      toast.error('Error', 'Failed to fetch user mappings');
    } finally {
      setMappingsLoading(false);
    }
  };

  const createUserMapping = async () => {
    if (!selectedUnmappedUser || !selectedUnmappedRep) {
      toast.error('Error', 'Please select both a user and a sales rep');
      return;
    }

    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;

      const res = await fetch('/api/admin/user-mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userEmail ? { 'x-user-email': userEmail } : {})
        },
        body: JSON.stringify({
          userId: selectedUnmappedUser,
          salesRepId: parseInt(selectedUnmappedRep),
          notes: mappingNotes || null
        })
      });

      if (res.ok) {
        toast.success('User mapping created');
        setSelectedUnmappedUser('');
        setSelectedUnmappedRep('');
        setMappingNotes('');
        fetchUserMappings();
      } else {
        const data = await res.json();
        toast.error('Error', data.error || 'Failed to create mapping');
      }
    } catch (err) {
      console.error('Error creating user mapping:', err);
      toast.error('Error', 'Failed to create mapping');
    }
  };

  const deleteUserMapping = async (mappingId: number) => {
    if (!confirm('Are you sure you want to delete this mapping?')) return;

    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;

      const res = await fetch(`/api/admin/user-mappings/${mappingId}`, {
        method: 'DELETE',
        headers: userEmail ? { 'x-user-email': userEmail } : {}
      });

      if (res.ok) {
        toast.success('Mapping deleted');
        fetchUserMappings();
      } else {
        toast.error('Error', 'Failed to delete mapping');
      }
    } catch (err) {
      console.error('Error deleting user mapping:', err);
      toast.error('Error', 'Failed to delete mapping');
    }
  };

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

  // User CRUD operations
  const handleCreateUser = async () => {
    if (!userFormData.email || !userFormData.name) {
      toast.error('Error', 'Email and name are required');
      return;
    }
    setUserModalLoading(true);
    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const adminEmail = authUser ? JSON.parse(authUser).email : null;

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminEmail ? { 'x-user-email': adminEmail } : {})
        },
        body: JSON.stringify(userFormData)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      toast.success('User created', 'Verification email sent');
      setShowUserModal(false);
      setUserFormData({ name: '', email: '', role: 'sales_rep', state: '' });
      fetchUsers();
    } catch (err) {
      toast.error('Error', (err as Error).message);
    } finally {
      setUserModalLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setUserModalLoading(true);
    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const adminEmail = authUser ? JSON.parse(authUser).email : null;

      const response = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(adminEmail ? { 'x-user-email': adminEmail } : {})
        },
        body: JSON.stringify({
          name: userFormData.name,
          role: userFormData.role,
          state: userFormData.state || null
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      toast.success('User updated');
      setShowUserModal(false);
      setEditingUser(null);
      setUserFormData({ name: '', email: '', role: 'sales_rep', state: '' });
      fetchUsers();
    } catch (err) {
      toast.error('Error', (err as Error).message);
    } finally {
      setUserModalLoading(false);
    }
  };

  const handleDeleteUser = async (user: UserSummary) => {
    if (!confirm(`Are you sure you want to delete ${user.name || user.email}? This cannot be undone.`)) {
      return;
    }
    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const adminEmail = authUser ? JSON.parse(authUser).email : null;

      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: adminEmail ? { 'x-user-email': adminEmail } : {}
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      toast.success('User deleted');
      if (selectedUser?.id === user.id) {
        setSelectedUser(null);
      }
      fetchUsers();
    } catch (err) {
      toast.error('Error', (err as Error).message);
    }
  };

  const handleResendVerification = async (user: UserSummary) => {
    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const adminEmail = authUser ? JSON.parse(authUser).email : null;

      const response = await fetch(`/api/admin/users/${user.id}/resend-verification`, {
        method: 'POST',
        headers: adminEmail ? { 'x-user-email': adminEmail } : {}
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend verification');
      }

      toast.success('Verification sent', data.message);
    } catch (err) {
      toast.error('Error', (err as Error).message);
    }
  };

  const openCreateUserModal = () => {
    setEditingUser(null);
    setUserFormData({ name: '', email: '', role: 'sales_rep', state: '' });
    setShowUserModal(true);
  };

  const openEditUserModal = (user: UserSummary) => {
    setEditingUser(user);
    setUserFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      state: user.state || ''
    });
    setShowUserModal(true);
  };

  const fetchLeaderboardSyncStatus = async () => {
    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;
      const headers = userEmail ? { 'x-user-email': userEmail } : {};

      const response = await fetch('/api/leaderboard/sync-status', { headers });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch leaderboard sync status');
      }

      setLeaderboardSyncStatus({
        lastSync: data.lastSync || null,
        lastSyncStatus: data.lastSyncStatus || 'never',
        lastSyncError: data.lastSyncError || null,
        nextSync: data.nextSync || null,
        nextSyncLocal: data.nextSyncLocal || null,
        recordCount: Number.isFinite(data.recordCount) ? data.recordCount : 0
      });
    } catch (err) {
      setLeaderboardSyncMessage((err as Error).message);
    }
  };

  const handleLeaderboardSync = async () => {
    setLeaderboardSyncRunning(true);
    setLeaderboardSyncMessage(null);
    try {
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;
      const headers = userEmail
        ? { 'x-user-email': userEmail, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };

      const response = await fetch('/api/leaderboard/sync', {
        method: 'POST',
        headers
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Leaderboard sync failed');
      }

      setLeaderboardSyncMessage(data.message || 'Leaderboard sync completed');
      await fetchLeaderboardSyncStatus();
      toast?.success?.(data.message || 'Leaderboard sync completed');
    } catch (err) {
      const message = (err as Error).message || 'Leaderboard sync failed';
      setLeaderboardSyncMessage(message);
      toast?.error?.(message);
    } finally {
      setLeaderboardSyncRunning(false);
    }
  };

  const formatSyncTime = (value?: string | null): string => {
    if (!value) return 'Never';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString();
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

            {/* Leaderboard Sync */}
            <div style={{ flex: '1', minWidth: '300px' }}>
              <div style={{
                border: '1px solid #262626',
                borderRadius: '8px',
                padding: '0.75rem 1.25rem',
                background: 'rgba(17, 17, 17, 0.6)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <RefreshCw style={{ width: '16px', height: '16px', color: '#dc2626' }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#ffffff' }}>
                      Leaderboard Sync
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    color: leaderboardSyncStatus?.lastSyncStatus === 'error' ? '#fca5a5' : '#86efac'
                  }}>
                    {leaderboardSyncStatus?.lastSyncStatus || 'unknown'}
                  </span>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '0.25rem' }}>
                  Last sync: {formatSyncTime(leaderboardSyncStatus?.lastSync)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '0.25rem' }}>
                  Next sync: {leaderboardSyncStatus?.nextSyncLocal || formatSyncTime(leaderboardSyncStatus?.nextSync)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '0.75rem' }}>
                  Active reps: {leaderboardSyncStatus?.recordCount ?? 0}
                </div>

                <button
                  onClick={handleLeaderboardSync}
                  disabled={leaderboardSyncRunning}
                  style={{
                    width: '100%',
                    padding: '0.6rem 1rem',
                    background: leaderboardSyncRunning
                      ? '#262626'
                      : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: leaderboardSyncRunning ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s ease',
                    opacity: leaderboardSyncRunning ? 0.7 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!leaderboardSyncRunning) {
                      e.currentTarget.style.background = '#b91c1c';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!leaderboardSyncRunning) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
                    }
                  }}
                >
                  {leaderboardSyncRunning && (
                    <Loader style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                  )}
                  Sync Leaderboard Now
                </button>

                {leaderboardSyncMessage && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: leaderboardSyncStatus?.lastSyncStatus === 'error'
                      ? 'rgba(153, 27, 27, 0.2)'
                      : 'rgba(22, 101, 52, 0.2)',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: leaderboardSyncStatus?.lastSyncStatus === 'error' ? '#fca5a5' : '#86efac'
                  }}>
                    {leaderboardSyncMessage}
                  </div>
                )}

                {leaderboardSyncStatus?.lastSyncError && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(153, 27, 27, 0.2)',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: '#fca5a5'
                  }}>
                    Error: {leaderboardSyncStatus.lastSyncError}
                  </div>
                )}
              </div>
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
        <button
          onClick={() => setActiveTab('mappings')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'mappings' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'transparent',
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
          User Mappings
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'settings' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'transparent',
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
          <Sliders style={{ width: '1.125rem', height: '1.125rem' }} />
          Settings
        </button>
      </div>

      {/* Main Container */}
      <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
        {activeTab === 'users' && (
          <div>
            {/* Header and Filter Bar */}
            <div style={{
              marginBottom: '2rem',
              background: '#0a0a0a',
              border: '1px solid #262626',
              borderRadius: '12px',
              padding: '1.5rem'
            }}>
              {/* Title Row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.5rem'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '24px',
                  fontWeight: 700,
                  color: '#ffffff'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    👥
                  </div>
                  All Users
                  <span style={{ fontSize: '16px', color: '#a1a1aa', fontWeight: 400, marginLeft: '8px' }}>
                    {filteredUsers.length} of {users.length}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={openCreateUserModal}
                    style={{
                      padding: '10px 20px',
                      background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      color: '#ffffff',
                      fontWeight: 600,
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <UserPlus style={{ width: '16px', height: '16px' }} />
                    Add User
                  </button>
                  <button
                    onClick={fetchUsers}
                    style={{
                      padding: '10px',
                      background: 'rgba(220, 38, 38, 0.1)',
                      border: '1px solid #dc2626',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(220, 38, 38, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)';
                    }}
                    title="Refresh users"
                  >
                    <RefreshCw style={{ width: '18px', height: '18px', color: '#dc2626' }} />
                  </button>
                </div>
              </div>

              {/* Filters Row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                gap: '12px',
                alignItems: 'center'
              }}>
                {/* Search */}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search users by name or email..."
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
                  <Search style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '18px',
                    height: '18px',
                    color: '#a1a1aa'
                  }} />
                </div>

                {/* Role Filter */}
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  style={{
                    padding: '12px 16px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    cursor: 'pointer',
                    outline: 'none',
                    minWidth: '150px'
                  }}
                >
                  <option value="">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="sales_repMD">Sales Rep MD</option>
                  <option value="manager">Manager</option>
                </select>

                {/* Date From */}
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setQuickFilter('all');
                  }}
                  style={{
                    padding: '12px 16px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    minWidth: '150px'
                  }}
                />

                {/* Date To */}
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setQuickFilter('all');
                  }}
                  style={{
                    padding: '12px 16px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    minWidth: '150px'
                  }}
                />
              </div>

              {/* Quick Filters */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                {(['today', 'week', 'month', 'all'] as QuickFilter[]).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => handleQuickFilter(filter)}
                    style={{
                      padding: '8px 16px',
                      background: quickFilter === filter ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : '#171717',
                      border: `1px solid ${quickFilter === filter ? '#dc2626' : '#262626'}`,
                      borderRadius: '8px',
                      color: quickFilter === filter ? '#ffffff' : '#a1a1aa',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none',
                      fontWeight: 500
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

            {/* Users Grid */}
            <div style={{
              height: 'calc(100vh - 380px)',
              overflowY: 'auto',
              paddingRight: '4px'
            }} className="custom-scrollbar">
              {loading && !users.length ? (
                <div style={{ padding: '80px', textAlign: 'center' }}>
                  <div style={{
                    display: 'inline-block',
                    width: '50px',
                    height: '50px',
                    border: '4px solid #262626',
                    borderTop: '4px solid #dc2626',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <p style={{ color: '#a1a1aa', marginTop: '20px', fontSize: '16px' }}>
                    Loading users...
                  </p>
                </div>
              ) : error ? (
                <div style={{
                  background: '#0a0a0a',
                  border: '1px solid #dc2626',
                  borderRadius: '12px',
                  padding: '24px',
                  maxWidth: '600px',
                  margin: '0 auto'
                }}>
                  <div style={{ color: '#dc2626', fontWeight: 600, fontSize: '18px', marginBottom: '12px' }}>Error</div>
                  <div style={{ color: '#a1a1aa', fontSize: '14px' }}>{error}</div>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '80px 20px',
                  color: '#a1a1aa'
                }}>
                  <div style={{
                    width: '120px',
                    height: '120px',
                    background: '#171717',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 24px',
                    fontSize: '60px'
                  }}>
                    👥
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 600, color: '#ffffff', marginBottom: '12px' }}>
                    No users found
                  </div>
                  <div style={{ fontSize: '16px', color: '#a1a1aa' }}>
                    Try adjusting your filters or search query
                  </div>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '20px'
                }}>
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      style={{
                        background: '#111111',
                        border: '1px solid #262626',
                        borderRadius: '16px',
                        padding: '24px',
                        transition: 'all 0.3s ease',
                        cursor: 'default',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#171717';
                        e.currentTarget.style.borderColor = '#dc2626';
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(220, 38, 38, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#111111';
                        e.currentTarget.style.borderColor = '#262626';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      {/* Avatar and Status */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        marginBottom: '20px'
                      }}>
                        <div style={{
                          width: '80px',
                          height: '80px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '32px',
                          fontWeight: 700,
                          position: 'relative',
                          color: '#ffffff',
                          marginBottom: '12px'
                        }}>
                          {getInitials(user.name)}
                          {/* Status Indicator */}
                          <div style={{
                            position: 'absolute',
                            bottom: '4px',
                            right: '4px',
                            width: '18px',
                            height: '18px',
                            background: isUserOnline(user.last_active) ? '#10b981' : '#52525b',
                            border: '3px solid #111111',
                            borderRadius: '50%'
                          }} />
                        </div>
                        <div style={{
                          fontSize: '18px',
                          fontWeight: 600,
                          color: '#ffffff',
                          marginBottom: '4px',
                          textAlign: 'center'
                        }}>
                          {user.name}
                        </div>
                        <div style={{
                          fontSize: '14px',
                          color: '#a1a1aa',
                          marginBottom: '12px',
                          textAlign: 'center',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {user.email}
                        </div>
                      </div>

                      {/* Badges */}
                      <div style={{
                        display: 'flex',
                        gap: '8px',
                        marginBottom: '16px',
                        flexWrap: 'wrap',
                        justifyContent: 'center'
                      }}>
                        <span style={{
                          padding: '6px 12px',
                          background: user.role === 'admin' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : user.role.includes('sales') ? '#dc2626' : '#262626',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: user.role === 'admin' || user.role.includes('sales') ? '#ffffff' : '#d4d4d8'
                        }}>
                          {user.role}
                        </span>
                        {user.state && (
                          <span style={{
                            padding: '6px 12px',
                            background: '#262626',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#d4d4d8'
                          }}>
                            {user.state}
                          </span>
                        )}
                      </div>

                      {/* Stats */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                        marginBottom: '20px',
                        padding: '16px',
                        background: '#0a0a0a',
                        borderRadius: '12px',
                        border: '1px solid #1a1a1a'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{
                            fontSize: '24px',
                            fontWeight: 700,
                            color: '#ffffff',
                            marginBottom: '4px'
                          }}>
                            {user.total_messages}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#a1a1aa',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            Messages
                          </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: isUserOnline(user.last_active) ? '#10b981' : '#a1a1aa',
                            marginBottom: '4px'
                          }}>
                            {isUserOnline(user.last_active) ? 'ONLINE' : 'OFFLINE'}
                          </div>
                          <div style={{
                            fontSize: '11px',
                            color: '#71717a'
                          }}>
                            {new Date(user.last_active).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: '8px'
                      }}>
                        <button
                          onClick={() => {
                            setConversationsModalUser(user);
                            setShowConversationsModal(true);
                            handleUserSelect(user);
                          }}
                          style={{
                            padding: '10px',
                            background: 'rgba(220, 38, 38, 0.1)',
                            border: '1px solid #dc2626',
                            borderRadius: '8px',
                            color: '#dc2626',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#dc2626';
                            e.currentTarget.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)';
                            e.currentTarget.style.color = '#dc2626';
                          }}
                          title="View conversations"
                        >
                          <MessageSquare style={{ width: '14px', height: '14px' }} />
                          Chats
                        </button>
                        <button
                          onClick={() => openEditUserModal(user)}
                          style={{
                            padding: '10px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid #3b82f6',
                            borderRadius: '8px',
                            color: '#3b82f6',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#3b82f6';
                            e.currentTarget.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                            e.currentTarget.style.color = '#3b82f6';
                          }}
                          title="Edit user"
                        >
                          <Edit2 style={{ width: '14px', height: '14px' }} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          style={{
                            padding: '10px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid #ef4444',
                            borderRadius: '8px',
                            color: '#ef4444',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ef4444';
                            e.currentTarget.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            e.currentTarget.style.color = '#ef4444';
                          }}
                          title="Delete user"
                        >
                          <Trash2 style={{ width: '14px', height: '14px' }} />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Conversations Modal */}
            {showConversationsModal && conversationsModalUser && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '20px'
              }}
              onClick={() => {
                setShowConversationsModal(false);
                setConversationsModalUser(null);
                setSelectedUser(null);
                setSelectedConversation(null);
              }}>
                <div
                  style={{
                    background: '#0a0a0a',
                    borderRadius: '16px',
                    border: '1px solid #262626',
                    maxWidth: '1200px',
                    width: '100%',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div style={{
                    padding: '24px',
                    borderBottom: '1px solid #262626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: '#ffffff',
                        marginBottom: '4px'
                      }}>
                        {conversationsModalUser.name}'s Conversations
                      </div>
                      <div style={{ fontSize: '14px', color: '#a1a1aa' }}>
                        {conversationsModalUser.email}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowConversationsModal(false);
                        setConversationsModalUser(null);
                        setSelectedUser(null);
                        setSelectedConversation(null);
                      }}
                      style={{
                        padding: '8px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        color: '#a1a1aa',
                        fontSize: '24px',
                        lineHeight: 1,
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(220, 38, 38, 0.2)';
                        e.currentTarget.style.color = '#dc2626';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#a1a1aa';
                      }}
                    >
                      ×
                    </button>
                  </div>

                  {/* Modal Content */}
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    overflow: 'hidden'
                  }}>
                    {/* Conversations List */}
                    <div style={{
                      width: '350px',
                      borderRight: '1px solid #262626',
                      display: 'flex',
                      flexDirection: 'column',
                      background: '#111111'
                    }}>
                      <div style={{
                        padding: '20px',
                        borderBottom: '1px solid #262626'
                      }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: 600,
                          color: '#ffffff'
                        }}>
                          Chat Sessions
                        </div>
                      </div>
                      <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '16px'
                      }} className="custom-scrollbar">
                        {loading && conversations.length === 0 ? (
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
                              Loading...
                            </p>
                          </div>
                        ) : conversations.length === 0 ? (
                          <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: '#71717a'
                          }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
                            <div style={{ fontSize: '14px' }}>No conversations yet</div>
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
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (selectedConversation?.session_id !== conv.session_id) {
                                  e.currentTarget.style.background = '#171717';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (selectedConversation?.session_id !== conv.session_id) {
                                  e.currentTarget.style.background = '#0a0a0a';
                                }
                              }}
                            >
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '8px'
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
                                  {conv.message_count} msgs
                                </div>
                                <div style={{ fontSize: '12px', color: '#71717a' }}>
                                  {new Date(conv.last_message_at).toLocaleDateString()}
                                </div>
                              </div>
                              <div style={{
                                fontSize: '13px',
                                color: '#a1a1aa',
                                lineHeight: '1.4',
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

                    {/* Messages Panel */}
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      background: '#0a0a0a'
                    }}>
                      {selectedConversation ? (
                        <>
                          <div style={{
                            padding: '20px',
                            borderBottom: '1px solid #262626',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}>
                            <div>
                              <div style={{
                                fontSize: '16px',
                                fontWeight: 600,
                                color: '#ffffff',
                                marginBottom: '4px'
                              }}>
                                Conversation Messages
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
                                  border: '4px solid #262626',
                                  borderTop: '4px solid #dc2626',
                                  borderRadius: '50%',
                                  animation: 'spin 1s linear infinite'
                                }} />
                                <p style={{ color: '#a1a1aa', marginTop: '16px', fontSize: '14px' }}>
                                  Loading messages...
                                </p>
                              </div>
                            ) : messages.length === 0 ? (
                              <div style={{
                                textAlign: 'center',
                                padding: '60px 20px',
                                color: '#71717a'
                              }}>
                                <div style={{ fontSize: '64px', marginBottom: '16px' }}>📭</div>
                                <div style={{ fontSize: '16px' }}>No messages in this conversation</div>
                              </div>
                            ) : (
                              messages.map((msg) => (
                                <div
                                  key={msg.id}
                                  style={{
                                    marginBottom: '20px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start'
                                  }}
                                >
                                  <div style={{
                                    maxWidth: '70%',
                                    background: msg.sender === 'user' ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : '#171717',
                                    padding: '14px 18px',
                                    borderRadius: '12px'
                                  }}>
                                    <div style={{
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      marginBottom: '8px',
                                      color: msg.sender === 'user' ? 'rgba(255, 255, 255, 0.8)' : '#a1a1aa',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.5px'
                                    }}>
                                      {msg.sender === 'user' ? conversationsModalUser.name : 'S21 AI'}
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
                                        marginTop: '8px',
                                        fontSize: '11px',
                                        color: msg.sender === 'user' ? 'rgba(255, 255, 255, 0.7)' : '#a1a1aa'
                                      }}>
                                        Provider: {msg.provider}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{
                                    fontSize: '12px',
                                    color: '#71717a',
                                    marginTop: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    <Clock style={{ width: '12px', height: '12px' }} />
                                    {new Date(msg.created_at).toLocaleString()}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </>
                      ) : (
                        <div style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#71717a',
                          fontSize: '16px'
                        }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '64px', marginBottom: '16px' }}>💬</div>
                            <div>Select a conversation to view messages</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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

        {activeTab === 'mappings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
              borderRadius: '12px',
              padding: '1.5rem',
              border: '1px solid #262626'
            }}>
              <h2 style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                User to Sales Rep Mappings
              </h2>
              <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>
                Link app users to their sales rep records for leaderboard tracking. Users with matching emails are auto-linked.
              </p>
            </div>

            {/* Create New Mapping */}
            <div style={{
              background: '#0a0a0a',
              borderRadius: '12px',
              padding: '1.5rem',
              border: '1px solid #262626'
            }}>
              <h3 style={{ color: '#ffffff', fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
                Create New Mapping
              </h3>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1', minWidth: '200px' }}>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                    Select User (Not Yet Linked)
                  </label>
                  <select
                    value={selectedUnmappedUser}
                    onChange={(e) => setSelectedUnmappedUser(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: '#171717',
                      border: '1px solid #262626',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="">-- Select a user --</option>
                    {unmappedUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '1', minWidth: '200px' }}>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                    Select Sales Rep (Not Yet Linked)
                  </label>
                  <select
                    value={selectedUnmappedRep}
                    onChange={(e) => setSelectedUnmappedRep(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: '#171717',
                      border: '1px solid #262626',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="">-- Select a sales rep --</option>
                    {unmappedSalesReps.map(rep => (
                      <option key={rep.id} value={rep.id}>
                        {rep.name} ({rep.email || 'no email'})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '1', minWidth: '200px' }}>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={mappingNotes}
                    onChange={(e) => setMappingNotes(e.target.value)}
                    placeholder="e.g., Different email format"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: '#171717',
                      border: '1px solid #262626',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <button
                  onClick={createUserMapping}
                  disabled={!selectedUnmappedUser || !selectedUnmappedRep}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: selectedUnmappedUser && selectedUnmappedRep
                      ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                      : '#262626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: selectedUnmappedUser && selectedUnmappedRep ? 'pointer' : 'not-allowed',
                    fontWeight: '600',
                    fontSize: '0.875rem'
                  }}
                >
                  Create Link
                </button>
              </div>
              {unmappedUsers.length === 0 && unmappedSalesReps.length === 0 && !mappingsLoading && (
                <p style={{ color: '#22c55e', fontSize: '0.875rem', marginTop: '1rem' }}>
                  All users are linked to sales reps (via email match or manual mapping).
                </p>
              )}
            </div>

            {/* Existing Mappings */}
            <div style={{
              background: '#0a0a0a',
              borderRadius: '12px',
              padding: '1.5rem',
              border: '1px solid #262626'
            }}>
              <h3 style={{ color: '#ffffff', fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
                Manual Mappings ({userMappings.length})
              </h3>
              {mappingsLoading ? (
                <p style={{ color: '#a1a1aa' }}>Loading...</p>
              ) : userMappings.length === 0 ? (
                <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>
                  No manual mappings created yet. Users with matching emails are auto-linked.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #262626' }}>
                        <th style={{ textAlign: 'left', padding: '0.75rem', color: '#a1a1aa', fontSize: '0.75rem', fontWeight: '500' }}>User</th>
                        <th style={{ textAlign: 'left', padding: '0.75rem', color: '#a1a1aa', fontSize: '0.75rem', fontWeight: '500' }}>Sales Rep</th>
                        <th style={{ textAlign: 'left', padding: '0.75rem', color: '#a1a1aa', fontSize: '0.75rem', fontWeight: '500' }}>Notes</th>
                        <th style={{ textAlign: 'left', padding: '0.75rem', color: '#a1a1aa', fontSize: '0.75rem', fontWeight: '500' }}>Created</th>
                        <th style={{ textAlign: 'right', padding: '0.75rem', color: '#a1a1aa', fontSize: '0.75rem', fontWeight: '500' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userMappings.map(mapping => (
                        <tr key={mapping.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                          <td style={{ padding: '0.75rem' }}>
                            <div style={{ color: '#ffffff', fontSize: '0.875rem' }}>{mapping.user_name || 'Unknown'}</div>
                            <div style={{ color: '#71717a', fontSize: '0.75rem' }}>{mapping.user_email}</div>
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <div style={{ color: '#ffffff', fontSize: '0.875rem' }}>{mapping.sales_rep_name}</div>
                            <div style={{ color: '#71717a', fontSize: '0.75rem' }}>{mapping.sales_rep_email}</div>
                          </td>
                          <td style={{ padding: '0.75rem', color: '#a1a1aa', fontSize: '0.875rem' }}>
                            {mapping.notes || '-'}
                          </td>
                          <td style={{ padding: '0.75rem', color: '#71717a', fontSize: '0.75rem' }}>
                            {new Date(mapping.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                            <button
                              onClick={() => deleteUserMapping(mapping.id)}
                              style={{
                                padding: '0.5rem 1rem',
                                background: 'transparent',
                                color: '#ef4444',
                                border: '1px solid #ef4444',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem'
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Stats Summary */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem'
            }}>
              <div style={{
                background: '#0a0a0a',
                borderRadius: '12px',
                padding: '1.5rem',
                border: '1px solid #262626',
                textAlign: 'center'
              }}>
                <div style={{ color: '#22c55e', fontSize: '2rem', fontWeight: '700' }}>{userMappings.length}</div>
                <div style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>Manual Mappings</div>
              </div>
              <div style={{
                background: '#0a0a0a',
                borderRadius: '12px',
                padding: '1.5rem',
                border: '1px solid #262626',
                textAlign: 'center'
              }}>
                <div style={{ color: '#f59e0b', fontSize: '2rem', fontWeight: '700' }}>{unmappedUsers.length}</div>
                <div style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>Unmapped Users</div>
              </div>
              <div style={{
                background: '#0a0a0a',
                borderRadius: '12px',
                padding: '1.5rem',
                border: '1px solid #262626',
                textAlign: 'center'
              }}>
                <div style={{ color: '#3b82f6', fontSize: '2rem', fontWeight: '700' }}>{unmappedSalesReps.length}</div>
                <div style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>Unmapped Sales Reps</div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab Content */}
        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {settingsLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#a1a1aa' }}>
                <Loader className="animate-spin" style={{ width: '2rem', height: '2rem', margin: '0 auto 1rem' }} />
                Loading settings...
              </div>
            ) : settingsError ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#ef4444' }}>
                Error: {settingsError}
                <button
                  onClick={fetchSystemSettings}
                  style={{
                    marginTop: '1rem',
                    padding: '0.5rem 1rem',
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                {/* User-Specific Settings Section */}
                <div style={{
                  background: '#0a0a0a',
                  borderRadius: '12px',
                  border: '1px solid #262626',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid #262626',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <User style={{ width: '1.25rem', height: '1.25rem', color: '#3b82f6' }} />
                    <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.125rem', fontWeight: '600' }}>
                      User Actions
                    </h2>
                    <span style={{ color: '#71717a', fontSize: '0.875rem' }}>
                      Select a user to manage
                    </span>
                  </div>
                  <div style={{ padding: '1.5rem' }}>
                    {/* User Dropdown */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        Select User
                      </label>
                      <select
                        value={settingsSelectedUserId}
                        onChange={(e) => setSettingsSelectedUserId(e.target.value)}
                        style={{
                          width: '100%',
                          maxWidth: '400px',
                          padding: '0.75rem 1rem',
                          background: '#111111',
                          border: '1px solid #262626',
                          borderRadius: '8px',
                          color: '#ffffff',
                          fontSize: '1rem'
                        }}
                      >
                        <option value="">-- Select a user --</option>
                        {users.map(user => (
                          <option key={user.id} value={user.id}>
                            {user.name} ({user.email}) - {user.role}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Selected User Info & Actions */}
                    {settingsSelectedUserId && (() => {
                      const selectedUser = users.find(u => u.id === settingsSelectedUserId);
                      if (!selectedUser) return null;
                      return (
                        <div style={{
                          background: '#111111',
                          borderRadius: '12px',
                          border: '1px solid #262626',
                          padding: '1.5rem'
                        }}>
                          {/* User Info Header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div style={{
                              width: '56px',
                              height: '56px',
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.5rem',
                              fontWeight: '700',
                              color: '#ffffff'
                            }}>
                              {selectedUser.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: '600' }}>
                                {selectedUser.name}
                              </div>
                              <div style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>
                                {selectedUser.email}
                              </div>
                              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.75rem',
                                  fontWeight: '600',
                                  background: selectedUser.role === 'admin' ? '#7c3aed' : selectedUser.role === 'manager' ? '#2563eb' : '#059669',
                                  color: '#ffffff'
                                }}>
                                  {selectedUser.role}
                                </span>
                                {selectedUser.state && (
                                  <span style={{
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.75rem',
                                    fontWeight: '500',
                                    background: '#262626',
                                    color: '#a1a1aa'
                                  }}>
                                    {selectedUser.state}
                                  </span>
                                )}
                                <span style={{
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  background: '#262626',
                                  color: '#71717a'
                                }}>
                                  {selectedUser.total_messages} messages
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div style={{ borderTop: '1px solid #262626', paddingTop: '1.5rem' }}>
                            <div style={{ color: '#a1a1aa', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                              Quick Actions
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                              <button
                                onClick={async () => {
                                  setSettingsUserActionLoading(true);
                                  try {
                                    const authUser = localStorage.getItem('s21_auth_user');
                                    const userEmail = authUser ? JSON.parse(authUser).email : null;
                                    const response = await fetch(`/api/admin/users/${selectedUser.id}/resend-verification`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', ...(userEmail ? { 'x-user-email': userEmail } : {}) }
                                    });
                                    if (response.ok) {
                                      toast.success('Verification code sent', `Sent new code to ${selectedUser.email}`);
                                    } else {
                                      const err = await response.json();
                                      toast.error('Failed', err.error || 'Could not send verification');
                                    }
                                  } catch (e) {
                                    toast.error('Error', 'Network error');
                                  } finally {
                                    setSettingsUserActionLoading(false);
                                  }
                                }}
                                disabled={settingsUserActionLoading}
                                style={{
                                  padding: '0.75rem 1.25rem',
                                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                                  border: 'none',
                                  borderRadius: '8px',
                                  color: '#ffffff',
                                  fontSize: '0.875rem',
                                  fontWeight: '500',
                                  cursor: settingsUserActionLoading ? 'wait' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  opacity: settingsUserActionLoading ? 0.7 : 1
                                }}
                              >
                                <Send style={{ width: '1rem', height: '1rem' }} />
                                Resend Verification
                              </button>
                              <button
                                onClick={() => {
                                  setEditingUser(selectedUser);
                                  setUserFormData({
                                    name: selectedUser.name,
                                    email: selectedUser.email,
                                    role: selectedUser.role,
                                    state: selectedUser.state || ''
                                  });
                                  setShowUserModal(true);
                                }}
                                style={{
                                  padding: '0.75rem 1.25rem',
                                  background: '#262626',
                                  border: '1px solid #3f3f46',
                                  borderRadius: '8px',
                                  color: '#ffffff',
                                  fontSize: '0.875rem',
                                  fontWeight: '500',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem'
                                }}
                              >
                                <Edit2 style={{ width: '1rem', height: '1rem' }} />
                                Edit User
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedUser(selectedUser);
                                  setActiveTab('users');
                                }}
                                style={{
                                  padding: '0.75rem 1.25rem',
                                  background: '#262626',
                                  border: '1px solid #3f3f46',
                                  borderRadius: '8px',
                                  color: '#ffffff',
                                  fontSize: '0.875rem',
                                  fontWeight: '500',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem'
                                }}
                              >
                                <Eye style={{ width: '1rem', height: '1rem' }} />
                                View Conversations
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm(`Are you sure you want to delete ${selectedUser.name}? This cannot be undone.`)) return;
                                  setSettingsUserActionLoading(true);
                                  try {
                                    const authUser = localStorage.getItem('s21_auth_user');
                                    const userEmail = authUser ? JSON.parse(authUser).email : null;
                                    const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
                                      method: 'DELETE',
                                      headers: { ...(userEmail ? { 'x-user-email': userEmail } : {}) }
                                    });
                                    if (response.ok) {
                                      toast.success('User deleted', `${selectedUser.name} has been removed`);
                                      setSettingsSelectedUserId('');
                                      fetchUsers();
                                    } else {
                                      const err = await response.json();
                                      toast.error('Failed', err.error || 'Could not delete user');
                                    }
                                  } catch (e) {
                                    toast.error('Error', 'Network error');
                                  } finally {
                                    setSettingsUserActionLoading(false);
                                  }
                                }}
                                disabled={settingsUserActionLoading}
                                style={{
                                  padding: '0.75rem 1.25rem',
                                  background: 'transparent',
                                  border: '1px solid #dc2626',
                                  borderRadius: '8px',
                                  color: '#dc2626',
                                  fontSize: '0.875rem',
                                  fontWeight: '500',
                                  cursor: settingsUserActionLoading ? 'wait' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  opacity: settingsUserActionLoading ? 0.7 : 1
                                }}
                              >
                                <Trash2 style={{ width: '1rem', height: '1rem' }} />
                                Delete User
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Feature Toggles Section */}
                <div style={{
                  background: '#0a0a0a',
                  borderRadius: '12px',
                  border: '1px solid #262626',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid #262626',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <Power style={{ width: '1.25rem', height: '1.25rem', color: '#dc2626' }} />
                    <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.125rem', fontWeight: '600' }}>
                      Feature Toggles
                    </h2>
                    <span style={{ color: '#71717a', fontSize: '0.875rem' }}>
                      Enable/disable features app-wide
                    </span>
                  </div>
                  <div style={{ padding: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                      {[
                        { key: 'feature_leaderboard', label: 'Leaderboard', icon: Trophy, desc: 'Sales leaderboard and rankings' },
                        { key: 'feature_territories', label: 'Territories', icon: MapPin, desc: 'Territory management and assignments' },
                        { key: 'feature_canvassing', label: 'Canvassing', icon: Target, desc: 'Door-to-door tracking' },
                        { key: 'feature_impacted_assets', label: 'Impacted Assets', icon: CloudLightning, desc: 'Storm damage tracking' },
                        { key: 'feature_storm_map', label: 'Storm Map', icon: CloudLightning, desc: 'Hail storm visualization' },
                        { key: 'feature_agnes', label: 'Agnes Training', icon: Bot, desc: 'AI roleplay training' },
                        { key: 'feature_live', label: 'Live Conversation', icon: MessageSquare, desc: 'Real-time AI assistance' },
                        { key: 'feature_susan_chat', label: 'Susan Chat', icon: Bot, desc: 'AI chat assistant' }
                      ].map(({ key, label, icon: Icon, desc }) => {
                        const enabled = systemSettings[key]?.value?.enabled ?? true;
                        const saving = savingSettings.has(key);
                        return (
                          <div
                            key={key}
                            style={{
                              background: '#111111',
                              borderRadius: '8px',
                              padding: '1rem',
                              border: '1px solid #262626',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <Icon style={{ width: '1.25rem', height: '1.25rem', color: enabled ? '#22c55e' : '#71717a' }} />
                              <div>
                                <div style={{ color: '#ffffff', fontWeight: '500' }}>{label}</div>
                                <div style={{ color: '#71717a', fontSize: '0.75rem' }}>{desc}</div>
                              </div>
                            </div>
                            <button
                              onClick={() => toggleFeature(key)}
                              disabled={saving}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: saving ? 'wait' : 'pointer',
                                padding: '0.25rem',
                                opacity: saving ? 0.5 : 1
                              }}
                            >
                              {enabled ? (
                                <ToggleRight style={{ width: '2.5rem', height: '2.5rem', color: '#22c55e' }} />
                              ) : (
                                <ToggleLeft style={{ width: '2.5rem', height: '2.5rem', color: '#71717a' }} />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Leaderboard Settings Section */}
                <div style={{
                  background: '#0a0a0a',
                  borderRadius: '12px',
                  border: '1px solid #262626',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid #262626',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <Trophy style={{ width: '1.25rem', height: '1.25rem', color: '#f59e0b' }} />
                    <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.125rem', fontWeight: '600' }}>
                      Leaderboard Settings
                    </h2>
                  </div>
                  <div style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'grid', gap: '1.5rem' }}>
                      {/* Sync Controls */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#111111',
                        borderRadius: '8px',
                        padding: '1rem',
                        border: '1px solid #262626'
                      }}>
                        <div>
                          <div style={{ color: '#ffffff', fontWeight: '500' }}>Automatic Sync</div>
                          <div style={{ color: '#71717a', fontSize: '0.875rem' }}>
                            Sync leaderboard from Google Sheets
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <select
                            value={systemSettings['leaderboard_sync_enabled']?.value?.interval_hours ?? 12}
                            onChange={(e) => updateSetting('leaderboard_sync_enabled', {
                              enabled: systemSettings['leaderboard_sync_enabled']?.value?.enabled ?? true,
                              interval_hours: parseInt(e.target.value)
                            })}
                            style={{
                              background: '#1a1a1a',
                              color: '#ffffff',
                              border: '1px solid #262626',
                              borderRadius: '6px',
                              padding: '0.5rem'
                            }}
                          >
                            <option value={6}>Every 6 hours</option>
                            <option value={12}>Every 12 hours</option>
                            <option value={24}>Every 24 hours</option>
                          </select>
                          <button
                            onClick={() => toggleFeature('leaderboard_sync_enabled')}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0.25rem'
                            }}
                          >
                            {systemSettings['leaderboard_sync_enabled']?.value?.enabled ?? true ? (
                              <ToggleRight style={{ width: '2.5rem', height: '2.5rem', color: '#22c55e' }} />
                            ) : (
                              <ToggleLeft style={{ width: '2.5rem', height: '2.5rem', color: '#71717a' }} />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Manual Sync Button */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#111111',
                        borderRadius: '8px',
                        padding: '1rem',
                        border: '1px solid #262626'
                      }}>
                        <div>
                          <div style={{ color: '#ffffff', fontWeight: '500' }}>Manual Sync</div>
                          <div style={{ color: '#71717a', fontSize: '0.875rem' }}>
                            {leaderboardSyncStatus?.lastSync
                              ? `Last synced: ${new Date(leaderboardSyncStatus.lastSync).toLocaleString()}`
                              : 'Never synced'}
                          </div>
                        </div>
                        <button
                          onClick={handleLeaderboardSync}
                          disabled={leaderboardSyncRunning}
                          style={{
                            padding: '0.75rem 1.5rem',
                            background: leaderboardSyncRunning ? '#262626' : '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: leaderboardSyncRunning ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          <RefreshCw style={{
                            width: '1rem',
                            height: '1rem',
                            animation: leaderboardSyncRunning ? 'spin 1s linear infinite' : 'none'
                          }} />
                          {leaderboardSyncRunning ? 'Syncing...' : 'Sync Now'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Susan AI Settings Section */}
                <div style={{
                  background: '#0a0a0a',
                  borderRadius: '12px',
                  border: '1px solid #262626',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid #262626',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <Bot style={{ width: '1.25rem', height: '1.25rem', color: '#8b5cf6' }} />
                    <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.125rem', fontWeight: '600' }}>
                      Susan AI Settings
                    </h2>
                  </div>
                  <div style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      {[
                        { key: 'susan_voice_enabled', label: 'Voice Responses', desc: 'Enable text-to-speech responses' },
                        { key: 'susan_roleplay_enabled', label: 'Roleplay Training', desc: 'Enable Agnes roleplay scenarios' },
                        { key: 'susan_storm_lookup', label: 'Storm Data Lookup', desc: 'Enable weather and hail data queries' },
                        { key: 'susan_performance_coaching', label: 'Performance Coaching', desc: 'Enable leaderboard-based coaching' }
                      ].map(({ key, label, desc }) => {
                        const enabled = systemSettings[key]?.value?.enabled ?? true;
                        const saving = savingSettings.has(key);
                        return (
                          <div
                            key={key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: '#111111',
                              borderRadius: '8px',
                              padding: '1rem',
                              border: '1px solid #262626'
                            }}
                          >
                            <div>
                              <div style={{ color: '#ffffff', fontWeight: '500' }}>{label}</div>
                              <div style={{ color: '#71717a', fontSize: '0.875rem' }}>{desc}</div>
                            </div>
                            <button
                              onClick={() => toggleFeature(key)}
                              disabled={saving}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: saving ? 'wait' : 'pointer',
                                padding: '0.25rem',
                                opacity: saving ? 0.5 : 1
                              }}
                            >
                              {enabled ? (
                                <ToggleRight style={{ width: '2.5rem', height: '2.5rem', color: '#22c55e' }} />
                              ) : (
                                <ToggleLeft style={{ width: '2.5rem', height: '2.5rem', color: '#71717a' }} />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Territory & Canvassing Settings */}
                <div style={{
                  background: '#0a0a0a',
                  borderRadius: '12px',
                  border: '1px solid #262626',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid #262626',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <MapPin style={{ width: '1.25rem', height: '1.25rem', color: '#3b82f6' }} />
                    <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.125rem', fontWeight: '600' }}>
                      Territory & Canvassing Settings
                    </h2>
                  </div>
                  <div style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#111111',
                        borderRadius: '8px',
                        padding: '1rem',
                        border: '1px solid #262626'
                      }}>
                        <div>
                          <div style={{ color: '#ffffff', fontWeight: '500' }}>Auto-Assign Territories</div>
                          <div style={{ color: '#71717a', fontSize: '0.875rem' }}>
                            Automatically assign territories to new users
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const current = systemSettings['territory_auto_assign']?.value?.enabled ?? false;
                            updateSetting('territory_auto_assign', { enabled: !current });
                          }}
                          disabled={savingSettings.has('territory_auto_assign')}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.25rem'
                          }}
                        >
                          {systemSettings['territory_auto_assign']?.value?.enabled ? (
                            <ToggleRight style={{ width: '2.5rem', height: '2.5rem', color: '#22c55e' }} />
                          ) : (
                            <ToggleLeft style={{ width: '2.5rem', height: '2.5rem', color: '#71717a' }} />
                          )}
                        </button>
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#111111',
                        borderRadius: '8px',
                        padding: '1rem',
                        border: '1px solid #262626'
                      }}>
                        <div>
                          <div style={{ color: '#ffffff', fontWeight: '500' }}>Require Location Check-in</div>
                          <div style={{ color: '#71717a', fontSize: '0.875rem' }}>
                            Require GPS verification for canvassing activities
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const current = systemSettings['territory_checkin_required']?.value?.enabled ?? true;
                            updateSetting('territory_checkin_required', {
                              enabled: !current,
                              radius_miles: systemSettings['territory_checkin_required']?.value?.radius_miles ?? 0.5
                            });
                          }}
                          disabled={savingSettings.has('territory_checkin_required')}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.25rem'
                          }}
                        >
                          {systemSettings['territory_checkin_required']?.value?.enabled ?? true ? (
                            <ToggleRight style={{ width: '2.5rem', height: '2.5rem', color: '#22c55e' }} />
                          ) : (
                            <ToggleLeft style={{ width: '2.5rem', height: '2.5rem', color: '#71717a' }} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
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

      {/* User Create/Edit Modal */}
      {showUserModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={() => setShowUserModal(false)}
        >
          <div
            style={{
              background: '#0a0a0a',
              borderRadius: '16px',
              border: '1px solid #262626',
              padding: '2rem',
              width: '100%',
              maxWidth: '480px',
              margin: '1rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              color: '#ffffff',
              fontSize: '1.5rem',
              fontWeight: '600',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              {editingUser ? (
                <>
                  <Edit2 style={{ width: '1.25rem', height: '1.25rem', color: '#3b82f6' }} />
                  Edit User
                </>
              ) : (
                <>
                  <UserPlus style={{ width: '1.25rem', height: '1.25rem', color: '#22c55e' }} />
                  Add New User
                </>
              )}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Email field - readonly when editing */}
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData(prev => ({ ...prev, email: e.target.value }))}
                  disabled={!!editingUser}
                  placeholder="user@theroofdocs.com"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: editingUser ? '#1a1a1a' : '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9375rem',
                    opacity: editingUser ? 0.6 : 1
                  }}
                />
                {editingUser && (
                  <p style={{ color: '#71717a', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    Email cannot be changed
                  </p>
                )}
              </div>

              {/* Name field */}
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Name
                </label>
                <input
                  type="text"
                  value={userFormData.name}
                  onChange={(e) => setUserFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="John Smith"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9375rem'
                  }}
                />
              </div>

              {/* Role field */}
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Role
                </label>
                <select
                  value={userFormData.role}
                  onChange={(e) => setUserFormData(prev => ({ ...prev, role: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9375rem'
                  }}
                >
                  <option value="sales_rep">Sales Rep</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* State field */}
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  State (Optional)
                </label>
                <select
                  value={userFormData.state}
                  onChange={(e) => setUserFormData(prev => ({ ...prev, state: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9375rem'
                  }}
                >
                  <option value="">Select state...</option>
                  <option value="VA">Virginia (VA)</option>
                  <option value="MD">Maryland (MD)</option>
                  <option value="PA">Pennsylvania (PA)</option>
                </select>
              </div>

              {/* Resend verification button for existing users */}
              {editingUser && (
                <button
                  onClick={() => handleResendVerification(editingUser)}
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'transparent',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#a1a1aa',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#3b82f6';
                    e.currentTarget.style.color = '#3b82f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#262626';
                    e.currentTarget.style.color = '#a1a1aa';
                  }}
                >
                  <Send style={{ width: '1rem', height: '1rem' }} />
                  Resend Verification Email
                </button>
              )}
            </div>

            {/* Modal actions */}
            <div style={{
              display: 'flex',
              gap: '1rem',
              marginTop: '1.5rem',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setShowUserModal(false);
                  setEditingUser(null);
                  setUserFormData({ name: '', email: '', role: 'sales_rep', state: '' });
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'transparent',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  color: '#a1a1aa',
                  fontSize: '0.9375rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={editingUser ? handleUpdateUser : handleCreateUser}
                disabled={userModalLoading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: userModalLoading ? '#262626' : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.9375rem',
                  fontWeight: '500',
                  cursor: userModalLoading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {userModalLoading && (
                  <Loader style={{ width: '1rem', height: '1rem', animation: 'spin 1s linear infinite' }} />
                )}
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
