import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  MessageSquare,
  Mail,
  FileText,
  Upload,
  Mic,
  BookOpen,
  Eye,
  Star,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Calendar
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

// ============================================================================
// TYPES
// ============================================================================

interface OverviewStats {
  totalUsers: number;
  activeUsers7d: number;
  totalMessages: number;
  totalConversations: number;
  emailsGenerated: number;
  transcriptions: number;
  documentsUploaded: number;
  susanSessions: number;
}

interface UserActivity {
  email: string;
  role: string;
  state: string | null;
  chats: number;
  emails: number;
  transcriptions: number;
  uploads: number;
  susan: number;
  kbViews: number;
  lastActive: string;
}

interface FeatureUsageData {
  date: string;
  chat: number;
  email: number;
  upload: number;
  transcribe: number;
  susan: number;
  knowledgeBase: number;
}

interface KnowledgeBaseStats {
  mostViewed: Array<{ name: string; views: number; category: string }>;
  mostFavorited: Array<{ name: string; favorites: number; category: string }>;
  topCategories: Array<{ category: string; count: number }>;
}

interface ConcerningChat {
  id: string;
  userEmail: string;
  severity: 'critical' | 'warning' | 'info';
  concernType: string;
  content: string;
  fullContext: string;
  timestamp: string;
}

type TimeRange = 'today' | 'week' | 'month' | 'all';
type SeverityFilter = 'critical' | 'warning' | 'info' | 'all';

interface LoadingState {
  overview: boolean;
  userActivity: boolean;
  featureUsage: boolean;
  knowledgeBase: boolean;
  concerningChats: boolean;
}

interface ErrorState {
  overview: string | null;
  userActivity: string | null;
  featureUsage: string | null;
  knowledgeBase: string | null;
  concerningChats: string | null;
}

// ============================================================================
// DATA TRANSFORMATION UTILITIES
// ============================================================================

/**
 * Transforms snake_case API response to camelCase for OverviewStats
 */
const transformOverviewStats = (data: any): OverviewStats => {
  return {
    totalUsers: data.total_users ?? data.totalUsers ?? 0,
    activeUsers7d: data.active_users_7d ?? data.activeUsers7d ?? 0,
    totalMessages: data.total_messages ?? data.totalMessages ?? 0,
    totalConversations: data.total_conversations ?? data.totalConversations ?? 0,
    emailsGenerated: data.emails_generated ?? data.emailsGenerated ?? 0,
    transcriptions: data.transcriptions_created ?? data.transcriptions ?? 0,
    documentsUploaded: data.documents_uploaded ?? data.documentsUploaded ?? 0,
    susanSessions: data.susan_sessions ?? data.susanSessions ?? 0,
  };
};

/**
 * Transforms snake_case API response to camelCase for UserActivity
 */
const transformUserActivity = (data: any[]): UserActivity[] => {
  return data.map(user => ({
    email: user.email ?? '',
    role: user.role ?? '',
    state: user.state ?? null,
    chats: user.total_messages ?? user.chats ?? 0,
    emails: user.emails_generated ?? user.emails ?? 0,
    transcriptions: user.transcriptions_created ?? user.transcriptions ?? 0,
    uploads: user.documents_uploaded ?? user.uploads ?? 0,
    susan: user.susan_sessions ?? user.susan ?? 0,
    kbViews: user.kb_views ?? user.kbViews ?? 0,
    lastActive: user.last_active ?? user.lastActive ?? new Date().toISOString(),
  }));
};

/**
 * Transforms snake_case API response to camelCase for FeatureUsageData
 */
const transformFeatureUsage = (data: any[]): FeatureUsageData[] => {
  return data.map(item => ({
    date: item.date ?? '',
    chat: item.chat_count ?? item.chat ?? 0,
    email: item.email_count ?? item.email ?? 0,
    upload: item.upload_count ?? item.upload ?? 0,
    transcribe: item.transcription_count ?? item.transcribe ?? 0,
    susan: item.susan_count ?? item.susan ?? 0,
    knowledgeBase: item.kb_views ?? item.knowledgeBase ?? 0,
  }));
};

/**
 * Transforms snake_case API response to camelCase for KnowledgeBaseStats
 */
const transformKnowledgeBase = (data: any): KnowledgeBaseStats => {
  return {
    mostViewed: (data.most_viewed ?? data.mostViewed ?? []).map((doc: any) => ({
      name: doc.document_name ?? doc.name ?? '',
      views: doc.total_views ?? doc.views ?? 0,
      category: doc.category ?? '',
    })),
    mostFavorited: (data.most_favorited ?? data.mostFavorited ?? []).map((doc: any) => ({
      name: doc.document_name ?? doc.name ?? '',
      favorites: doc.total_favorites ?? doc.favorites ?? 0,
      category: doc.category ?? '',
    })),
    topCategories: (data.top_categories ?? data.topCategories ?? []).map((cat: any) => ({
      category: cat.category ?? '',
      count: cat.document_count ?? cat.count ?? 0,
    })),
  };
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const AdminAnalyticsTab: React.FC = () => {
  // Sub-section navigation state
  type SubSection = 'overview' | 'leaderboard' | 'canvassing' | 'knowledge-base' | 'ai-monitoring';
  const [activeSubSection, setActiveSubSection] = useState<SubSection>('overview');

  // State
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
  const [userActivity, setUserActivity] = useState<UserActivity[]>([]);
  const [featureUsage, setFeatureUsage] = useState<FeatureUsageData[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseStats | null>(null);
  const [concerningChats, setConcerningChats] = useState<ConcerningChat[]>([]);

  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [expandedChat, setExpandedChat] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof UserActivity>('lastActive');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [loading, setLoading] = useState<LoadingState>({
    overview: false,
    userActivity: false,
    featureUsage: false,
    knowledgeBase: false,
    concerningChats: false,
  });

  const [error, setError] = useState<ErrorState>({
    overview: null,
    userActivity: null,
    featureUsage: null,
    knowledgeBase: null,
    concerningChats: null,
  });

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  // Bug Fix #4: Race Condition in useEffect with AbortController
  useEffect(() => {
    const controller = new AbortController();

    const fetchAllData = async () => {
      try {
        await Promise.all([
          fetchOverviewStats(controller.signal),
          fetchUserActivity(controller.signal),
          fetchFeatureUsage(controller.signal),
          fetchKnowledgeBase(controller.signal)
        ]);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching analytics:', err);
      }
    };

    fetchAllData();

    return () => controller.abort();
  }, [timeRange]);

  useEffect(() => {
    const controller = new AbortController();
    fetchConcerningChats(controller.signal);
    return () => controller.abort();
  }, [severityFilter]);

  // Bug Fix #2: HTTP Error Handling for 403/401/500
  const fetchOverviewStats = async (signal?: AbortSignal) => {
    try {
      setLoading(prev => ({ ...prev, overview: true }));
      setError(prev => ({ ...prev, overview: null }));

      // Get user email from localStorage for authentication
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;

      const response = await fetch(`/api/admin/analytics/overview?range=${timeRange}`, {
        signal,
        headers: {
          ...(userEmail ? { 'x-user-email': userEmail } : {})
        }
      });

      if (response.status === 403 || response.status === 401) {
        throw new Error('You do not have permission to view analytics');
      }

      if (response.status === 500) {
        throw new Error('Server error - please try again later');
      }

      if (!response.ok && response.status !== 404) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (response.ok) {
        const data = await response.json();
        setOverviewStats(transformOverviewStats(data));
      } else {
        // Mock data for development
        setOverviewStats({
          totalUsers: 42,
          activeUsers7d: 28,
          totalMessages: 1524,
          totalConversations: 389,
          emailsGenerated: 156,
          transcriptions: 89,
          documentsUploaded: 234,
          susanSessions: 67,
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(prev => ({ ...prev, overview: err.message }));
      console.error('Error fetching overview stats:', err);
    } finally {
      setLoading(prev => ({ ...prev, overview: false }));
    }
  };

  const fetchUserActivity = async (signal?: AbortSignal) => {
    try {
      setLoading(prev => ({ ...prev, userActivity: true }));
      setError(prev => ({ ...prev, userActivity: null }));

      // Get user email from localStorage for authentication
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;

      const response = await fetch(`/api/admin/analytics/user-activity?range=${timeRange}`, {
        signal,
        headers: {
          ...(userEmail ? { 'x-user-email': userEmail } : {})
        }
      });

      if (response.status === 403 || response.status === 401) {
        throw new Error('You do not have permission to view analytics');
      }

      if (response.status === 500) {
        throw new Error('Server error - please try again later');
      }

      if (!response.ok && response.status !== 404) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (response.ok) {
        const data = await response.json();
        setUserActivity(transformUserActivity(data));
      } else {
        // Mock data for development
        setUserActivity([
          {
            email: 'john.doe@roofer.com',
            role: 'sales_rep',
            state: 'MD',
            chats: 45,
            emails: 23,
            transcriptions: 12,
            uploads: 8,
            susan: 15,
            kbViews: 67,
            lastActive: new Date().toISOString(),
          },
          {
            email: 'jane.smith@roofer.com',
            role: 'manager',
            state: 'VA',
            chats: 38,
            emails: 19,
            transcriptions: 7,
            uploads: 5,
            susan: 11,
            kbViews: 52,
            lastActive: new Date(Date.now() - 3600000).toISOString(),
          },
        ]);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(prev => ({ ...prev, userActivity: err.message }));
      console.error('Error fetching user activity:', err);
    } finally {
      setLoading(prev => ({ ...prev, userActivity: false }));
    }
  };

  const fetchFeatureUsage = async (signal?: AbortSignal) => {
    try {
      setLoading(prev => ({ ...prev, featureUsage: true }));
      setError(prev => ({ ...prev, featureUsage: null }));

      // Get user email from localStorage for authentication
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;

      const response = await fetch(`/api/admin/analytics/feature-usage?range=${timeRange}`, {
        signal,
        headers: {
          ...(userEmail ? { 'x-user-email': userEmail } : {})
        }
      });

      if (response.status === 403 || response.status === 401) {
        throw new Error('You do not have permission to view analytics');
      }

      if (response.status === 500) {
        throw new Error('Server error - please try again later');
      }

      if (!response.ok && response.status !== 404) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (response.ok) {
        const data = await response.json();
        setFeatureUsage(transformFeatureUsage(data));
      } else {
        // Mock data for development
        const mockData: FeatureUsageData[] = [];
        const days = timeRange === 'today' ? 1 : timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 90;

        for (let i = days - 1; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          mockData.push({
            date: date.toISOString().split('T')[0],
            chat: Math.floor(Math.random() * 50) + 20,
            email: Math.floor(Math.random() * 30) + 10,
            upload: Math.floor(Math.random() * 20) + 5,
            transcribe: Math.floor(Math.random() * 15) + 5,
            susan: Math.floor(Math.random() * 25) + 10,
            knowledgeBase: Math.floor(Math.random() * 40) + 15,
          });
        }
        setFeatureUsage(mockData);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(prev => ({ ...prev, featureUsage: err.message }));
      console.error('Error fetching feature usage:', err);
    } finally {
      setLoading(prev => ({ ...prev, featureUsage: false }));
    }
  };

  const fetchKnowledgeBase = async (signal?: AbortSignal) => {
    try {
      setLoading(prev => ({ ...prev, knowledgeBase: true }));
      setError(prev => ({ ...prev, knowledgeBase: null }));

      // Get user email from localStorage for authentication
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;

      const response = await fetch(`/api/admin/analytics/knowledge-base?range=${timeRange}`, {
        signal,
        headers: {
          ...(userEmail ? { 'x-user-email': userEmail } : {})
        }
      });

      if (response.status === 403 || response.status === 401) {
        throw new Error('You do not have permission to view analytics');
      }

      if (response.status === 500) {
        throw new Error('Server error - please try again later');
      }

      if (!response.ok && response.status !== 404) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (response.ok) {
        const data = await response.json();
        setKnowledgeBase(transformKnowledgeBase(data));
      } else {
        // Mock data for development
        setKnowledgeBase({
          mostViewed: [
            { name: 'Product Catalog 2024', views: 234, category: 'Products' },
            { name: 'Installation Guide', views: 189, category: 'Technical' },
            { name: 'Pricing Sheet Q1', views: 156, category: 'Sales' },
            { name: 'Safety Standards', views: 142, category: 'Compliance' },
            { name: 'Warranty Information', views: 128, category: 'Support' },
          ],
          mostFavorited: [
            { name: 'Quick Reference Guide', favorites: 45, category: 'Reference' },
            { name: 'Email Templates', favorites: 38, category: 'Sales' },
            { name: 'Product Specs', favorites: 32, category: 'Products' },
            { name: 'ROI Calculator', favorites: 28, category: 'Tools' },
            { name: 'Competitor Analysis', favorites: 24, category: 'Strategy' },
          ],
          topCategories: [
            { category: 'Products', count: 456 },
            { category: 'Sales', count: 389 },
            { category: 'Technical', count: 267 },
            { category: 'Support', count: 234 },
            { category: 'Compliance', count: 198 },
          ],
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(prev => ({ ...prev, knowledgeBase: err.message }));
      console.error('Error fetching knowledge base stats:', err);
    } finally {
      setLoading(prev => ({ ...prev, knowledgeBase: false }));
    }
  };

  const fetchConcerningChats = async (signal?: AbortSignal) => {
    try {
      setLoading(prev => ({ ...prev, concerningChats: true }));
      setError(prev => ({ ...prev, concerningChats: null }));

      // Get user email from localStorage for authentication
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;

      const response = await fetch(`/api/admin/concerning-chats?severity=${severityFilter}`, {
        signal,
        headers: {
          ...(userEmail ? { 'x-user-email': userEmail } : {})
        }
      });

      if (response.status === 403 || response.status === 401) {
        throw new Error('You do not have permission to view analytics');
      }

      if (response.status === 500) {
        throw new Error('Server error - please try again later');
      }

      if (!response.ok && response.status !== 404) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (response.ok) {
        const data = await response.json();
        setConcerningChats(data);
      } else {
        // Mock data for development
        setConcerningChats([
          {
            id: '1',
            userEmail: 'user@example.com',
            severity: 'warning',
            concernType: 'Pricing Complaint',
            content: 'Customer mentioned our prices are too high compared to competitors...',
            fullContext: 'User: Your prices seem really high.\nAI: Let me help you understand our pricing...',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(prev => ({ ...prev, concerningChats: err.message }));
      console.error('Error fetching concerning chats:', err);
    } finally {
      setLoading(prev => ({ ...prev, concerningChats: false }));
    }
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSort = (column: keyof UserActivity) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Bug Fix #1: Sort Logic Crashes with Null Values
  const sortedUserActivity = useMemo(() => {
    return [...userActivity].sort((a, b) => {
      const aValue = a[sortColumn] ?? '';
      const bValue = b[sortColumn] ?? '';

      if (typeof aValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue as string)
          : (bValue as string).localeCompare(aValue);
      }

      const aNum = Number(aValue) || 0;
      const bNum = Number(bValue) || 0;
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
    });
  }, [userActivity, sortColumn, sortDirection]);

  const paginatedUsers = sortedUserActivity.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(userActivity.length / itemsPerPage);

  // Bug Fix #3: CSV Export Special Characters
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const exportToCSV = () => {
    const headers = ['Email', 'Role', 'State', 'Chats', 'Emails', 'Transcriptions', 'Uploads', 'Susan', 'KB Views', 'Last Active'];
    const rows = userActivity.map(user =>
      [
        user.email,
        user.role,
        user.state || 'N/A',
        user.chats,
        user.emails,
        user.transcriptions,
        user.uploads,
        user.susan,
        user.kbViews,
        user.lastActive ? new Date(user.lastActive).toLocaleString() : 'N/A',
      ]
    );

    const csvContent = [
      headers.map(escapeCSV),
      ...rows.map(row => row.map(escapeCSV))
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Note: Filtering is now handled server-side via the API endpoint
  const filteredConcerningChats = concerningChats;

  // Bug Fix #5: BarChart Shows First 10, Not TOP 10
  const topUsers = useMemo(() => {
    return [...userActivity]
      .sort((a, b) => b.chats - a.chats)
      .slice(0, 10);
  }, [userActivity]);

  // Bug Fix #7: Color Contrast Fails WCAG AA
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#dc2626'; // Red - contrast ratio 4.5:1
      case 'warning': return '#d97706';  // Darker amber - contrast ratio 4.5:1
      case 'info': return '#6b7280';     // Gray - contrast ratio 4.5:1
      default: return '#6b7280';
    }
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const StatCard: React.FC<{ icon: React.ReactNode; value: number; label: string }> = ({
    icon,
    value,
    label,
  }) => (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.3s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
        e.currentTarget.style.borderColor = '#ef4444';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ color: '#ef4444' }}>{icon}</div>
      <div style={{ fontSize: '32px', fontWeight: 700, color: '#e4e4e7' }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: '12px', color: '#a1a1aa', textAlign: 'center' }}>{label}</div>
    </div>
  );

  const LoadingSkeleton = () => (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '20px',
        height: '200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          border: '4px solid rgba(255, 255, 255, 0.1)',
          borderTop: '4px solid #ef4444',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
    </div>
  );

  const ErrorDisplay: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
    <div
      style={{
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
        <AlertTriangle size={20} />
        <span style={{ fontSize: '14px', fontWeight: 600 }}>Error Loading Data</span>
      </div>
      <div style={{ fontSize: '13px', color: '#fca5a5', textAlign: 'center' }}>
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '8px 16px',
            background: '#ef4444',
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#dc2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ef4444';
          }}
        >
          Retry
        </button>
      )}
    </div>
  );

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      style={{
        background: 'transparent',
        padding: '0',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        color: '#e4e4e7',
        paddingBottom: '40px',
      }}
    >
      {/* Sub-Section Navigation */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '8px',
          marginBottom: '24px',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        }}
        role="tablist"
        aria-label="Analytics sections"
      >
        {([
          { key: 'overview', label: 'Overview', icon: <BarChart3 size={16} /> },
          { key: 'leaderboard', label: 'Leaderboard', icon: <TrendingUp size={16} /> },
          { key: 'canvassing', label: 'Canvassing', icon: <Users size={16} /> },
          { key: 'knowledge-base', label: 'Knowledge Base', icon: <BookOpen size={16} /> },
          { key: 'ai-monitoring', label: 'AI Monitoring', icon: <AlertTriangle size={16} /> },
        ] as Array<{ key: SubSection; label: string; icon: React.ReactNode }>).map((section) => (
          <button
            key={section.key}
            role="tab"
            aria-selected={activeSubSection === section.key}
            aria-controls={`${section.key}-panel`}
            onClick={() => setActiveSubSection(section.key)}
            style={{
              flex: '1 1 auto',
              minWidth: '140px',
              padding: '12px 16px',
              background: activeSubSection === section.key ? '#ef4444' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${activeSubSection === section.key ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '8px',
              color: activeSubSection === section.key ? 'white' : '#a1a1aa',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => {
              if (activeSubSection !== section.key) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeSubSection !== section.key) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }
            }}
          >
            {section.icon}
            {section.label}
          </button>
        ))}
      </div>

      {/* Time Range Filter Bar - Show on relevant sections */}
      {(activeSubSection === 'overview' || activeSubSection === 'leaderboard') && (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '16px 24px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Calendar style={{ width: '20px', height: '20px', color: '#ef4444' }} aria-hidden="true" />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Time Range:</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} role="group" aria-label="Filter by time range">
            {(['today', 'week', 'month', 'all'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                aria-pressed={timeRange === range}
                aria-label={`Filter by ${range === 'week' ? 'this week' : range === 'month' ? 'this month' : range === 'all' ? 'all time' : 'today'}`}
                style={{
                  padding: '8px 16px',
                  background: timeRange === range ? '#ef4444' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${timeRange === range ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '8px',
                  color: timeRange === range ? 'white' : '#a1a1aa',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textTransform: 'capitalize',
                }}
                onMouseEnter={(e) => {
                  if (timeRange !== range) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (timeRange !== range) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }
                }}
              >
                {range === 'week' ? 'This Week' : range === 'month' ? 'This Month' : range === 'all' ? 'All Time' : 'Today'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* OVERVIEW SECTION */}
      {activeSubSection === 'overview' && (
        <div id="overview-panel" role="tabpanel" aria-labelledby="overview-tab">
          {/* Overview Stats Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '24px',
            }}
          >
            {error.overview ? (
              <div style={{ gridColumn: '1 / -1' }}>
                <ErrorDisplay message={error.overview} onRetry={fetchOverviewStats} />
              </div>
            ) : loading.overview ? (
              <>
                <LoadingSkeleton />
                <LoadingSkeleton />
                <LoadingSkeleton />
                <LoadingSkeleton />
              </>
            ) : overviewStats ? (
              <>
                <StatCard icon={<Users size={24} />} value={overviewStats.totalUsers} label="Total Users" />
                <StatCard icon={<TrendingUp size={24} />} value={overviewStats.activeUsers7d} label="Active Users (7d)" />
                <StatCard icon={<MessageSquare size={24} />} value={overviewStats.totalMessages} label="Total Messages" />
                <StatCard icon={<BarChart3 size={24} />} value={overviewStats.totalConversations} label="Conversations" />
                <StatCard icon={<Mail size={24} />} value={overviewStats.emailsGenerated} label="Emails Generated" />
                <StatCard icon={<Mic size={24} />} value={overviewStats.transcriptions} label="Transcriptions" />
                <StatCard icon={<Upload size={24} />} value={overviewStats.documentsUploaded} label="Documents Uploaded" />
                <StatCard icon={<BookOpen size={24} />} value={overviewStats.susanSessions} label="Susan Sessions" />
              </>
            ) : null}
          </div>

          {/* Feature Usage Chart */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', color: '#e4e4e7' }}>
              Feature Usage Over Time
            </h2>
            {error.featureUsage ? (
              <ErrorDisplay message={error.featureUsage} onRetry={fetchFeatureUsage} />
            ) : loading.featureUsage ? (
              <LoadingSkeleton />
            ) : featureUsage.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: '#71717a',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>No feature usage data available</div>
                <div style={{ fontSize: '14px' }}>Data will appear here once users start using features</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={featureUsage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                  <XAxis dataKey="date" stroke="#a1a1aa" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#a1a1aa" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      background: '#1a1a1a',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#e4e4e7',
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="chat" stroke="#ef4444" strokeWidth={2} />
                  <Line type="monotone" dataKey="email" stroke="#059669" strokeWidth={2} />
                  <Line type="monotone" dataKey="upload" stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="transcribe" stroke="#f59e0b" strokeWidth={2} />
                  <Line type="monotone" dataKey="susan" stroke="#8b5cf6" strokeWidth={2} />
                  <Line type="monotone" dataKey="knowledgeBase" stroke="#ec4899" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* LEADERBOARD SECTION */}
      {activeSubSection === 'leaderboard' && (
        <div id="leaderboard-panel" role="tabpanel" aria-labelledby="leaderboard-tab">
          {/* Top 10 Active Users Chart */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', color: '#e4e4e7' }}>
              Top 10 Active Users
            </h2>
            {error.userActivity ? (
              <ErrorDisplay message={error.userActivity} onRetry={fetchUserActivity} />
            ) : loading.userActivity ? (
              <LoadingSkeleton />
            ) : topUsers.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: '#71717a',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>No user activity data available</div>
                <div style={{ fontSize: '14px' }}>Data will appear here once users start chatting</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topUsers}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                  <XAxis
                    dataKey="email"
                    stroke="#a1a1aa"
                    style={{ fontSize: '12px' }}
                    tickFormatter={(value) => value.split('@')[0].substring(0, 10)}
                  />
                  <YAxis stroke="#a1a1aa" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      background: '#1a1a1a',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#e4e4e7',
                    }}
                  />
                  <Bar dataKey="chats" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* User Activity Breakdown Table */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e4e4e7' }}>User Activity Breakdown</h2>
              <button
                onClick={exportToCSV}
                aria-label="Export analytics data to CSV"
                style={{
                  padding: '10px 16px',
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#dc2626';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ef4444';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <Download size={16} aria-hidden="true" />
                Export CSV
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    {[
                      { key: 'email', label: 'Email' },
                      { key: 'role', label: 'Role' },
                      { key: 'state', label: 'State' },
                      { key: 'chats', label: 'Chats' },
                      { key: 'emails', label: 'Emails' },
                      { key: 'transcriptions', label: 'Transcriptions' },
                      { key: 'uploads', label: 'Uploads' },
                      { key: 'susan', label: 'Susan' },
                      { key: 'kbViews', label: 'KB Views' },
                      { key: 'lastActive', label: 'Last Active' },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key as keyof UserActivity)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSort(col.key as keyof UserActivity);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Sort by ${col.label}`}
                        aria-sort={sortColumn === col.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                        style={{
                          padding: '12px',
                          textAlign: 'left',
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#a1a1aa',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        {col.label}
                        {sortColumn === col.key && (
                          <span style={{ marginLeft: '4px' }} aria-hidden="true">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((user, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        transition: 'background 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{user.email}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>
                        <span
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{user.state || '-'}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{user.chats}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{user.emails}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{user.transcriptions}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{user.uploads}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{user.susan}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{user.kbViews}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#a1a1aa' }}>
                        {new Date(user.lastActive).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: '8px 12px',
                    background: currentPage === 1 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: currentPage === 1 ? '#71717a' : '#e4e4e7',
                    fontSize: '14px',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Previous
                </button>
                <span style={{ fontSize: '14px', color: '#a1a1aa' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '8px 12px',
                    background: currentPage === totalPages ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: currentPage === totalPages ? '#71717a' : '#e4e4e7',
                    fontSize: '14px',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CANVASSING SECTION */}
      {activeSubSection === 'canvassing' && (
        <div id="canvassing-panel" role="tabpanel" aria-labelledby="canvassing-tab">
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '60px 24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '64px', marginBottom: '24px' }}>🚪</div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#e4e4e7', marginBottom: '12px' }}>
              Canvassing Analytics Coming Soon
            </h2>
            <p style={{ fontSize: '16px', color: '#a1a1aa', lineHeight: 1.6, maxWidth: '600px', margin: '0 auto' }}>
              This section will track door-to-door metrics including:
            </p>
            <div style={{
              marginTop: '24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              maxWidth: '800px',
              margin: '24px auto 0',
            }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '16px',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📍</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7' }}>Doors Knocked</div>
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '16px',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>💬</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7' }}>Conversations</div>
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '16px',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📈</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7' }}>Conversion Rate</div>
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '16px',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎯</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7' }}>Leads Generated</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KNOWLEDGE BASE SECTION */}
      {activeSubSection === 'knowledge-base' && (
        <div id="knowledge-base-panel" role="tabpanel" aria-labelledby="knowledge-base-tab">
          {error.knowledgeBase ? (
            <ErrorDisplay message={error.knowledgeBase} onRetry={fetchKnowledgeBase} />
          ) : loading.knowledgeBase ? (
            <LoadingSkeleton />
          ) : knowledgeBase && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '20px',
              }}
            >
              {/* Most Viewed */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Eye size={18} style={{ color: '#ef4444' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#e4e4e7' }}>Most Viewed Documents</h3>
                </div>
                {knowledgeBase.mostViewed.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#71717a' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                    <div style={{ fontSize: '14px' }}>No document views yet</div>
                  </div>
                ) : (
                  knowledgeBase.mostViewed.map((doc, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7', marginBottom: '4px' }}>
                        {doc.name}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a1a1aa' }}>
                        <span>{doc.category}</span>
                        <span>{doc.views} views</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Most Favorited */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Star size={18} style={{ color: '#ef4444' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#e4e4e7' }}>Most Favorited</h3>
                </div>
                {knowledgeBase.mostFavorited.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#71717a' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>⭐</div>
                    <div style={{ fontSize: '14px' }}>No favorites yet</div>
                  </div>
                ) : (
                  knowledgeBase.mostFavorited.map((doc, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7', marginBottom: '4px' }}>
                        {doc.name}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a1a1aa' }}>
                        <span>{doc.category}</span>
                        <span>{doc.favorites} favorites</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Top Categories */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <BookOpen size={18} style={{ color: '#ef4444' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#e4e4e7' }}>Top Categories</h3>
                </div>
                {knowledgeBase.topCategories.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#71717a' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📚</div>
                    <div style={{ fontSize: '14px' }}>No categories yet</div>
                  </div>
                ) : (
                  knowledgeBase.topCategories.map((cat, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        marginBottom: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7' }}>{cat.category}</span>
                      <span
                        style={{
                          fontSize: '12px',
                          color: '#ef4444',
                          background: 'rgba(239, 68, 68, 0.1)',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        {cat.count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI MONITORING SECTION */}
      {activeSubSection === 'ai-monitoring' && (
        <div id="ai-monitoring-panel" role="tabpanel" aria-labelledby="ai-monitoring-tab">
          {/* Concerning Chats Monitor */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} style={{ color: '#ef4444' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e4e4e7' }}>Concerning Chats Monitor</h2>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} role="group" aria-label="Filter concerning chats by severity">
                {(['critical', 'warning', 'info', 'all'] as SeverityFilter[]).map((severity) => (
                  <button
                    key={severity}
                    onClick={() => setSeverityFilter(severity)}
                    aria-pressed={severityFilter === severity}
                    aria-label={`Filter by ${severity} severity`}
                    style={{
                      padding: '6px 12px',
                      background: severityFilter === severity ? '#ef4444' : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${severityFilter === severity ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: '6px',
                      color: severityFilter === severity ? 'white' : '#a1a1aa',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {severity}
                  </button>
                ))}
              </div>
            </div>

            {error.concerningChats ? (
              <ErrorDisplay message={error.concerningChats} onRetry={fetchConcerningChats} />
            ) : loading.concerningChats ? (
              <LoadingSkeleton />
            ) : filteredConcerningChats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>No Concerning Chats</div>
                <div style={{ fontSize: '14px' }}>All conversations are within normal parameters</div>
              </div>
            ) : (
              filteredConcerningChats.map((chat) => (
                <div
                  key={chat.id}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '12px',
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedChat(expandedChat === chat.id ? null : chat.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                    <div style={{ fontSize: '20px' }}>
                      {chat.severity === 'critical' ? '🔴' : chat.severity === 'warning' ? '🟡' : '🔵'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7' }}>{chat.userEmail}</span>
                        <span style={{ fontSize: '12px', color: '#71717a' }}>
                          {chat.timestamp ? new Date(chat.timestamp).toLocaleString() : 'Unknown'}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: '#ef4444',
                          fontWeight: 600,
                          marginBottom: '8px',
                        }}
                      >
                        {chat.concernType}
                      </div>
                      <div style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.6 }}>{chat.content}</div>
                      {expandedChat === chat.id && (
                        <div
                          style={{
                            marginTop: '12px',
                            padding: '12px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '6px',
                            fontSize: '13px',
                            color: '#e4e4e7',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {chat.fullContext}
                        </div>
                      )}
                    </div>
                    <div>
                      {expandedChat === chat.id ? (
                        <ChevronUp size={18} style={{ color: '#a1a1aa' }} />
                      ) : (
                        <ChevronDown size={18} style={{ color: '#a1a1aa' }} />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* AI Usage Stats Placeholder */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', color: '#e4e4e7' }}>
              AI Usage & API Costs
            </h2>
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#71717a',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
              <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>AI Cost Tracking Coming Soon</div>
              <div style={{ fontSize: '14px' }}>
                Track API costs per user, conversation length, and model usage patterns
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Global Styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          @media (max-width: 768px) {
            /* Mobile responsive adjustments */
          }
        `
      }} />
    </div>
  );
};

export default AdminAnalyticsTab;
