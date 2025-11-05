import React, { useState, useEffect } from 'react';
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
// MAIN COMPONENT
// ============================================================================

const AdminAnalyticsTab: React.FC = () => {
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
  const itemsPerPage = 20;

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

  useEffect(() => {
    fetchOverviewStats();
    fetchUserActivity();
    fetchFeatureUsage();
    fetchKnowledgeBase();
    fetchConcerningChats();
  }, [timeRange]);

  const fetchOverviewStats = async () => {
    try {
      setLoading(prev => ({ ...prev, overview: true }));
      setError(prev => ({ ...prev, overview: null }));

      const response = await fetch(`/api/admin/analytics/overview?range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setOverviewStats(data);
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
    } catch (err) {
      setError(prev => ({ ...prev, overview: (err as Error).message }));
      console.error('Error fetching overview stats:', err);
    } finally {
      setLoading(prev => ({ ...prev, overview: false }));
    }
  };

  const fetchUserActivity = async () => {
    try {
      setLoading(prev => ({ ...prev, userActivity: true }));
      setError(prev => ({ ...prev, userActivity: null }));

      const response = await fetch(`/api/admin/analytics/user-activity?range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setUserActivity(data);
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
    } catch (err) {
      setError(prev => ({ ...prev, userActivity: (err as Error).message }));
      console.error('Error fetching user activity:', err);
    } finally {
      setLoading(prev => ({ ...prev, userActivity: false }));
    }
  };

  const fetchFeatureUsage = async () => {
    try {
      setLoading(prev => ({ ...prev, featureUsage: true }));
      setError(prev => ({ ...prev, featureUsage: null }));

      const response = await fetch(`/api/admin/analytics/feature-usage?range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setFeatureUsage(data);
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
    } catch (err) {
      setError(prev => ({ ...prev, featureUsage: (err as Error).message }));
      console.error('Error fetching feature usage:', err);
    } finally {
      setLoading(prev => ({ ...prev, featureUsage: false }));
    }
  };

  const fetchKnowledgeBase = async () => {
    try {
      setLoading(prev => ({ ...prev, knowledgeBase: true }));
      setError(prev => ({ ...prev, knowledgeBase: null }));

      const response = await fetch(`/api/admin/analytics/knowledge-base?range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setKnowledgeBase(data);
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
    } catch (err) {
      setError(prev => ({ ...prev, knowledgeBase: (err as Error).message }));
      console.error('Error fetching knowledge base stats:', err);
    } finally {
      setLoading(prev => ({ ...prev, knowledgeBase: false }));
    }
  };

  const fetchConcerningChats = async () => {
    try {
      setLoading(prev => ({ ...prev, concerningChats: true }));
      setError(prev => ({ ...prev, concerningChats: null }));

      const response = await fetch(`/api/admin/analytics/concerning-chats?range=${timeRange}`);
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
    } catch (err) {
      setError(prev => ({ ...prev, concerningChats: (err as Error).message }));
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

  const sortedUserActivity = [...userActivity].sort((a, b) => {
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    return sortDirection === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  const paginatedUsers = sortedUserActivity.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(userActivity.length / itemsPerPage);

  const exportToCSV = () => {
    const headers = ['Email', 'Role', 'State', 'Chats', 'Emails', 'Transcriptions', 'Uploads', 'Susan', 'KB Views', 'Last Active'];
    const csvRows = [
      headers.join(','),
      ...userActivity.map(user =>
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
          new Date(user.lastActive).toLocaleString(),
        ].join(',')
      ),
    ];

    const csvContent = csvRows.join('\n');
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

  const filteredConcerningChats = concerningChats.filter(chat =>
    severityFilter === 'all' || chat.severity === severityFilter
  );

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

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      style={{
        background: '#0f0f0f',
        minHeight: '100vh',
        padding: '30px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        color: '#e4e4e7',
      }}
    >
      {/* Section 1: Time Range Filter Bar */}
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calendar style={{ width: '20px', height: '20px', color: '#ef4444' }} />
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Time Range:</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['today', 'week', 'month', 'all'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
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

      {/* Section 2: Overview Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          marginBottom: '24px',
        }}
      >
        {loading.overview ? (
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

      {/* Section 3: Feature Usage Chart */}
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
        {loading.featureUsage ? (
          <LoadingSkeleton />
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
              <Line type="monotone" dataKey="email" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="upload" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="transcribe" stroke="#f59e0b" strokeWidth={2} />
              <Line type="monotone" dataKey="susan" stroke="#8b5cf6" strokeWidth={2} />
              <Line type="monotone" dataKey="knowledgeBase" stroke="#ec4899" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Section 4: User Activity Chart */}
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
          Top Active Users
        </h2>
        {loading.userActivity ? (
          <LoadingSkeleton />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={userActivity.slice(0, 10)}>
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

      {/* Section 5: Knowledge Base Analytics */}
      {knowledgeBase && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
            marginBottom: '24px',
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
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#e4e4e7' }}>Most Viewed</h3>
            </div>
            {knowledgeBase.mostViewed.map((doc, idx) => (
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
            ))}
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
            {knowledgeBase.mostFavorited.map((doc, idx) => (
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
            ))}
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
            {knowledgeBase.topCategories.map((cat, idx) => (
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
            ))}
          </div>
        </div>
      )}

      {/* Section 6: Concerning Chats Monitor */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={20} style={{ color: '#ef4444' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e4e4e7' }}>Concerning Chats Monitor</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['critical', 'warning', 'info', 'all'] as SeverityFilter[]).map((severity) => (
              <button
                key={severity}
                onClick={() => setSeverityFilter(severity)}
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

        {filteredConcerningChats.length === 0 ? (
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7' }}>{chat.userEmail}</span>
                    <span style={{ fontSize: '12px', color: '#71717a' }}>
                      {new Date(chat.timestamp).toLocaleString()}
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

      {/* Section 7: Per-User Detailed Table */}
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
            <Download size={16} />
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
                      <span style={{ marginLeft: '4px' }}>
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
