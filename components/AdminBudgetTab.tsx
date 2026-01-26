import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  Users,
  Zap,
  Download,
  CheckCircle,
  XCircle,
  Edit2,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar
} from 'lucide-react';
import { useToast } from './Toast';

// ============================================================================
// TYPES
// ============================================================================

interface BudgetOverview {
  companyBudget: number;
  companySpend: number;
  companyPercentUsed: number;
  totalSpendThisMonth: number;
  avgCostPerCall: number;
  totalApiCalls: number;
  usersOverBudget: number;
  mostExpensiveProvider: string;
  mostExpensiveProviderCost: number;
}

interface BudgetAlert {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  budgetLimit: number;
  currentSpend: number;
  percentUsed: number;
  severity: 'critical' | 'warning' | 'info';
  acknowledged: boolean;
  createdAt: string;
}

interface UserBudget {
  userId: string;
  email: string;
  name: string;
  budgetLimit: number;
  currentSpend: number;
  percentUsed: number;
  status: 'safe' | 'warning' | 'critical';
  lastApiCall: string;
}

interface ApiUsageLog {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  userName: string;
  provider: string;
  serviceType: string;
  tokens: number;
  cost: number;
  feature: string;
  status: 'success' | 'error';
}

type AlertFilter = 'all' | 'unacknowledged' | 'acknowledged';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const AdminBudgetTab: React.FC = () => {
  const toast = useToast();
  // State
  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [users, setUsers] = useState<UserBudget[]>([]);
  const [usageLog, setUsageLog] = useState<ApiUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editBudgetValue, setEditBudgetValue] = useState<string>('');

  // Filters
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [logUserFilter, setLogUserFilter] = useState<string>('');
  const [logProviderFilter, setLogProviderFilter] = useState<string>('');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');

  // Pagination
  const [userPage, setUserPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const usersPerPage = 10;
  const logsPerPage = 10;

  // Company budget modal
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [newCompanyBudget, setNewCompanyBudget] = useState('');

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchOverview(),
        fetchAlerts(),
        fetchUsers(),
        fetchUsageLog()
      ]);
    } catch (err) {
      console.error('Error fetching budget data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getAuthHeaders = () => {
    const authUser = localStorage.getItem('s21_auth_user');
    const userEmail = authUser ? JSON.parse(authUser).email : null;
    return userEmail ? { 'x-user-email': userEmail } : {};
  };

  const fetchOverview = async () => {
    try {
      const response = await fetch('/api/admin/budget/overview', {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setOverview(data);
      } else {
        // Mock data for development
        setOverview({
          companyBudget: 10000,
          companySpend: 6234.50,
          companyPercentUsed: 62.35,
          totalSpendThisMonth: 6234.50,
          avgCostPerCall: 0.12,
          totalApiCalls: 51954,
          usersOverBudget: 3,
          mostExpensiveProvider: 'OpenAI GPT-4',
          mostExpensiveProviderCost: 2845.30
        });
      }
    } catch (err) {
      console.error('Error fetching overview:', err);
      // Use mock data on error
      setOverview({
        companyBudget: 10000,
        companySpend: 6234.50,
        companyPercentUsed: 62.35,
        totalSpendThisMonth: 6234.50,
        avgCostPerCall: 0.12,
        totalApiCalls: 51954,
        usersOverBudget: 3,
        mostExpensiveProvider: 'OpenAI GPT-4',
        mostExpensiveProviderCost: 2845.30
      });
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/admin/budget/alerts', {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setAlerts(data);
      } else {
        // Mock data
        setAlerts([
          {
            id: '1',
            userId: 'u1',
            userEmail: 'john.doe@company.com',
            userName: 'John Doe',
            budgetLimit: 500,
            currentSpend: 520,
            percentUsed: 104,
            severity: 'critical',
            acknowledged: false,
            createdAt: new Date().toISOString()
          },
          {
            id: '2',
            userId: 'u2',
            userEmail: 'jane.smith@company.com',
            userName: 'Jane Smith',
            budgetLimit: 300,
            currentSpend: 285,
            percentUsed: 95,
            severity: 'warning',
            acknowledged: false,
            createdAt: new Date(Date.now() - 3600000).toISOString()
          }
        ]);
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/budget/users?page=1&limit=100', {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || data);
      } else {
        // Mock data
        setUsers([
          {
            userId: 'u1',
            email: 'john.doe@company.com',
            name: 'John Doe',
            budgetLimit: 500,
            currentSpend: 520,
            percentUsed: 104,
            status: 'critical',
            lastApiCall: new Date().toISOString()
          },
          {
            userId: 'u2',
            email: 'jane.smith@company.com',
            name: 'Jane Smith',
            budgetLimit: 300,
            currentSpend: 285,
            percentUsed: 95,
            status: 'warning',
            lastApiCall: new Date(Date.now() - 3600000).toISOString()
          },
          {
            userId: 'u3',
            email: 'bob.wilson@company.com',
            name: 'Bob Wilson',
            budgetLimit: 400,
            currentSpend: 180,
            percentUsed: 45,
            status: 'safe',
            lastApiCall: new Date(Date.now() - 7200000).toISOString()
          }
        ]);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const fetchUsageLog = async () => {
    try {
      const response = await fetch('/api/admin/budget/usage-log?page=1&limit=100', {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setUsageLog(data.logs || data);
      } else {
        // Mock data
        const mockLogs: ApiUsageLog[] = [];
        const providers = ['OpenAI GPT-4', 'OpenAI GPT-3.5', 'Anthropic Claude', 'Google Gemini'];
        const services = ['Chat', 'Email', 'Transcription', 'Document Analysis'];
        const features = ['General Chat', 'Email Generation', 'Audio Transcription', 'PDF Analysis'];

        for (let i = 0; i < 50; i++) {
          mockLogs.push({
            id: `log-${i}`,
            timestamp: new Date(Date.now() - i * 3600000).toISOString(),
            userId: `u${(i % 3) + 1}`,
            userEmail: ['john.doe@company.com', 'jane.smith@company.com', 'bob.wilson@company.com'][i % 3],
            userName: ['John Doe', 'Jane Smith', 'Bob Wilson'][i % 3],
            provider: providers[i % providers.length],
            serviceType: services[i % services.length],
            tokens: Math.floor(Math.random() * 5000) + 500,
            cost: parseFloat((Math.random() * 2 + 0.1).toFixed(2)),
            feature: features[i % features.length],
            status: Math.random() > 0.05 ? 'success' : 'error'
          });
        }
        setUsageLog(mockLogs);
      }
    } catch (err) {
      console.error('Error fetching usage log:', err);
    }
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/admin/budget/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        setAlerts(alerts.map(alert =>
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        ));
      } else {
        // Optimistic update for mock
        setAlerts(alerts.map(alert =>
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        ));
      }
    } catch (err) {
      console.error('Error acknowledging alert:', err);
    }
  };

  const startEditBudget = (user: UserBudget) => {
    setEditingUserId(user.userId);
    setEditBudgetValue(user.budgetLimit.toString());
  };

  const cancelEditBudget = () => {
    setEditingUserId(null);
    setEditBudgetValue('');
  };

  const saveUserBudget = async (userId: string) => {
    try {
      const newBudget = parseFloat(editBudgetValue);
      if (isNaN(newBudget) || newBudget < 0) {
        toast.warning('Invalid Input', 'Please enter a valid budget amount');
        return;
      }

      const response = await fetch(`/api/admin/budget/user/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ budgetLimit: newBudget })
      });

      if (response.ok) {
        setUsers(users.map(user => {
          if (user.userId === userId) {
            const percentUsed = (user.currentSpend / newBudget) * 100;
            return {
              ...user,
              budgetLimit: newBudget,
              percentUsed,
              status: percentUsed >= 100 ? 'critical' : percentUsed >= 80 ? 'warning' : 'safe'
            };
          }
          return user;
        }));
        setEditingUserId(null);
        setEditBudgetValue('');
      } else {
        // Optimistic update for mock
        setUsers(users.map(user => {
          if (user.userId === userId) {
            const percentUsed = (user.currentSpend / newBudget) * 100;
            return {
              ...user,
              budgetLimit: newBudget,
              percentUsed,
              status: percentUsed >= 100 ? 'critical' : percentUsed >= 80 ? 'warning' : 'safe'
            };
          }
          return user;
        }));
        setEditingUserId(null);
        setEditBudgetValue('');
      }
    } catch (err) {
      console.error('Error updating budget:', err);
    }
  };

  const updateCompanyBudget = async () => {
    try {
      const budget = parseFloat(newCompanyBudget);
      if (isNaN(budget) || budget < 0) {
        toast.warning('Invalid Input', 'Please enter a valid budget amount');
        return;
      }

      const response = await fetch('/api/admin/budget/company', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ budget })
      });

      if (response.ok) {
        if (overview) {
          setOverview({
            ...overview,
            companyBudget: budget,
            companyPercentUsed: (overview.companySpend / budget) * 100
          });
        }
        setShowBudgetModal(false);
        setNewCompanyBudget('');
      } else {
        // Optimistic update for mock
        if (overview) {
          setOverview({
            ...overview,
            companyBudget: budget,
            companyPercentUsed: (overview.companySpend / budget) * 100
          });
        }
        setShowBudgetModal(false);
        setNewCompanyBudget('');
      }
    } catch (err) {
      console.error('Error updating company budget:', err);
    }
  };

  const exportUsageLog = () => {
    const headers = ['Timestamp', 'User Email', 'User Name', 'Provider', 'Service Type', 'Tokens', 'Cost', 'Feature', 'Status'];
    const rows = filteredUsageLogs.map(log => [
      new Date(log.timestamp).toLocaleString(),
      log.userEmail,
      log.userName,
      log.provider,
      log.serviceType,
      log.tokens,
      `$${log.cost.toFixed(2)}`,
      log.feature,
      log.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-usage-log-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ============================================================================
  // FILTERING & PAGINATION
  // ============================================================================

  const filteredAlerts = alerts.filter(alert => {
    if (alertFilter === 'acknowledged' && !alert.acknowledged) return false;
    if (alertFilter === 'unacknowledged' && alert.acknowledged) return false;
    return true;
  });

  const filteredUsers = users.filter(user => {
    if (userSearchQuery && !user.email.toLowerCase().includes(userSearchQuery.toLowerCase()) &&
        !user.name.toLowerCase().includes(userSearchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const filteredUsageLogs = usageLog.filter(log => {
    if (logUserFilter && log.userId !== logUserFilter) return false;
    if (logProviderFilter && log.provider !== logProviderFilter) return false;
    if (logDateFrom && new Date(log.timestamp) < new Date(logDateFrom)) return false;
    if (logDateTo && new Date(log.timestamp) > new Date(logDateTo)) return false;
    return true;
  });

  const paginatedUsers = filteredUsers.slice(
    (userPage - 1) * usersPerPage,
    userPage * usersPerPage
  );

  const paginatedLogs = filteredUsageLogs.slice(
    (logPage - 1) * logsPerPage,
    logPage * logsPerPage
  );

  const userTotalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const logTotalPages = Math.ceil(filteredUsageLogs.length / logsPerPage);

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#dc2626';
      case 'warning': return '#d97706';
      default: return '#2563eb';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return '#dc2626';
      case 'warning': return '#d97706';
      case 'safe': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'critical': return 'Over Budget';
      case 'warning': return 'Near Limit';
      case 'safe': return 'Within Budget';
      default: return 'Unknown';
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        color: '#71717a'
      }}>
        <div style={{
          textAlign: 'center'
        }}>
          <div style={{
            display: 'inline-block',
            width: '48px',
            height: '48px',
            border: '4px solid #3a3a3a',
            borderTop: '4px solid #991b1b',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '16px'
          }} />
          <div style={{ fontSize: '16px', fontWeight: 600 }}>Loading budget data...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'transparent',
      padding: '0',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#e4e4e7'
    }}>
      {/* Section 1: Overview Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        {/* Company Budget Status */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '24px',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.borderColor = '#991b1b';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <DollarSign style={{ width: '24px', height: '24px', color: '#991b1b' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#a1a1aa' }}>Company Budget</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#e4e4e7', marginBottom: '8px' }}>
            ${overview?.companySpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '13px', color: '#71717a', marginBottom: '12px' }}>
            of ${overview?.companyBudget.toLocaleString()}
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: '#262626',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(overview?.companyPercentUsed || 0, 100)}%`,
              height: '100%',
              background: overview && overview.companyPercentUsed >= 100 ? '#dc2626' :
                         overview && overview.companyPercentUsed >= 80 ? '#d97706' : '#10b981',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{
            fontSize: '12px',
            color: '#a1a1aa',
            marginTop: '8px',
            textAlign: 'right'
          }}>
            {overview?.companyPercentUsed.toFixed(1)}% used
          </div>
        </div>

        {/* Total Spend This Month */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '24px',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.borderColor = '#991b1b';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <TrendingUp style={{ width: '24px', height: '24px', color: '#991b1b' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#a1a1aa' }}>Total Spend This Month</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#e4e4e7' }}>
            ${overview?.totalSpendThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Average Cost per Call */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '24px',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.borderColor = '#991b1b';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <DollarSign style={{ width: '24px', height: '24px', color: '#991b1b' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#a1a1aa' }}>Avg Cost per Call</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#e4e4e7' }}>
            ${overview?.avgCostPerCall.toFixed(3)}
          </div>
        </div>

        {/* Total API Calls */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '24px',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.borderColor = '#991b1b';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <Zap style={{ width: '24px', height: '24px', color: '#991b1b' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#a1a1aa' }}>Total API Calls</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#e4e4e7' }}>
            {overview?.totalApiCalls.toLocaleString()}
          </div>
        </div>

        {/* Users Over Budget */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '24px',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.borderColor = '#991b1b';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <Users style={{ width: '24px', height: '24px', color: '#991b1b' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#a1a1aa' }}>Users Over Budget</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#e4e4e7' }}>
              {overview?.usersOverBudget || 0}
            </div>
            {(overview?.usersOverBudget || 0) > 0 && (
              <div style={{
                padding: '4px 10px',
                background: 'rgba(220, 38, 38, 0.2)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#dc2626'
              }}>
                WARNING
              </div>
            )}
          </div>
        </div>

        {/* Most Expensive Provider */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '24px',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.borderColor = '#991b1b';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <Zap style={{ width: '24px', height: '24px', color: '#991b1b' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#a1a1aa' }}>Most Expensive Provider</div>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#e4e4e7', marginBottom: '8px' }}>
            {overview?.mostExpensiveProvider}
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#991b1b' }}>
            ${overview?.mostExpensiveProviderCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Section 2: Budget Alerts */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '32px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle style={{ width: '24px', height: '24px', color: '#991b1b' }} />
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e4e4e7', margin: 0 }}>Budget Alerts</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['all', 'unacknowledged', 'acknowledged'] as AlertFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setAlertFilter(filter)}
                style={{
                  padding: '8px 16px',
                  background: alertFilter === filter ? '#991b1b' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${alertFilter === filter ? '#991b1b' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '8px',
                  color: alertFilter === filter ? 'white' : '#a1a1aa',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (alertFilter !== filter) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (alertFilter !== filter) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }
                }}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {filteredAlerts.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: '#71717a'
          }}>
            <CheckCircle style={{ width: '48px', height: '48px', margin: '0 auto 16px', color: '#10b981' }} />
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>No Budget Alerts</div>
            <div style={{ fontSize: '14px' }}>All users are within their budget limits</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>User</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Budget Limit</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Current Spend</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Usage</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Severity</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((alert) => (
                  <tr key={alert.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#e4e4e7' }}>
                      <div style={{ fontWeight: 600 }}>{alert.userName}</div>
                      <div style={{ fontSize: '12px', color: '#71717a' }}>{alert.userEmail}</div>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#e4e4e7' }}>
                      ${alert.budgetLimit.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#e4e4e7' }}>
                      ${alert.currentSpend.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>
                      <div style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        background: alert.percentUsed >= 100 ? 'rgba(220, 38, 38, 0.2)' :
                                   alert.percentUsed >= 90 ? 'rgba(234, 88, 12, 0.2)' :
                                   'rgba(217, 119, 6, 0.2)',
                        border: `1px solid ${alert.percentUsed >= 100 ? 'rgba(220, 38, 38, 0.3)' :
                                            alert.percentUsed >= 90 ? 'rgba(234, 88, 12, 0.3)' :
                                            'rgba(217, 119, 6, 0.3)'}`,
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: alert.percentUsed >= 100 ? '#dc2626' :
                               alert.percentUsed >= 90 ? '#ea580c' :
                               '#d97706'
                      }}>
                        {alert.percentUsed.toFixed(1)}%
                      </div>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        background: `${getSeverityColor(alert.severity)}20`,
                        border: `1px solid ${getSeverityColor(alert.severity)}30`,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: getSeverityColor(alert.severity),
                        textTransform: 'uppercase'
                      }}>
                        {alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵'}
                        {alert.severity}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {alert.acknowledged ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '13px',
                          color: '#10b981'
                        }}>
                          <CheckCircle style={{ width: '16px', height: '16px' }} />
                          Acknowledged
                        </div>
                      ) : (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          style={{
                            padding: '6px 12px',
                            background: 'rgba(153, 27, 27, 0.2)',
                            border: '1px solid #991b1b',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#991b1b';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(153, 27, 27, 0.2)';
                          }}
                        >
                          Acknowledge
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 3: User Budgets Table */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '32px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Users style={{ width: '24px', height: '24px', color: '#991b1b' }} />
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e4e4e7', margin: 0 }}>User Budgets</h2>
          </div>
          <input
            type="text"
            placeholder="Search by email..."
            value={userSearchQuery}
            onChange={(e) => setUserSearchQuery(e.target.value)}
            style={{
              padding: '8px 16px',
              background: '#262626',
              border: '1px solid #3a3a3a',
              borderRadius: '8px',
              color: '#e4e4e7',
              fontSize: '14px',
              width: '300px',
              outline: 'none'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#991b1b';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#3a3a3a';
            }}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Email</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Budget Limit</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Current Spend</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>% Used</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Status</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => (
                <tr key={user.userId} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#e4e4e7' }}>
                    <div style={{ fontWeight: 600 }}>{user.name}</div>
                    <div style={{ fontSize: '12px', color: '#71717a' }}>{user.email}</div>
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#e4e4e7' }}>
                    {editingUserId === user.userId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          value={editBudgetValue}
                          onChange={(e) => setEditBudgetValue(e.target.value)}
                          style={{
                            width: '100px',
                            padding: '4px 8px',
                            background: '#262626',
                            border: '1px solid #991b1b',
                            borderRadius: '4px',
                            color: '#e4e4e7',
                            fontSize: '14px',
                            outline: 'none'
                          }}
                        />
                        <button
                          onClick={() => saveUserBudget(user.userId)}
                          style={{
                            padding: '4px',
                            background: '#10b981',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <Save style={{ width: '16px', height: '16px' }} />
                        </button>
                        <button
                          onClick={cancelEditBudget}
                          style={{
                            padding: '4px',
                            background: '#dc2626',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <X style={{ width: '16px', height: '16px' }} />
                        </button>
                      </div>
                    ) : (
                      <span>${user.budgetLimit.toFixed(2)}</span>
                    )}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#e4e4e7' }}>
                    ${user.currentSpend.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    <div style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      background: user.status === 'critical' ? 'rgba(220, 38, 38, 0.2)' :
                                 user.status === 'warning' ? 'rgba(217, 119, 6, 0.2)' :
                                 'rgba(16, 185, 129, 0.2)',
                      border: `1px solid ${user.status === 'critical' ? 'rgba(220, 38, 38, 0.3)' :
                                          user.status === 'warning' ? 'rgba(217, 119, 6, 0.3)' :
                                          'rgba(16, 185, 129, 0.3)'}`,
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: getStatusColor(user.status)
                    }}>
                      {user.percentUsed.toFixed(1)}%
                    </div>
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    <div style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      background: user.status === 'critical' ? 'rgba(220, 38, 38, 0.2)' :
                                 user.status === 'warning' ? 'rgba(217, 119, 6, 0.2)' :
                                 'rgba(16, 185, 129, 0.2)',
                      border: `1px solid ${user.status === 'critical' ? 'rgba(220, 38, 38, 0.3)' :
                                          user.status === 'warning' ? 'rgba(217, 119, 6, 0.3)' :
                                          'rgba(16, 185, 129, 0.3)'}`,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: getStatusColor(user.status)
                    }}>
                      {getStatusBadge(user.status)}
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {editingUserId !== user.userId && (
                      <button
                        onClick={() => startEditBudget(user)}
                        style={{
                          padding: '6px 12px',
                          background: 'rgba(153, 27, 27, 0.2)',
                          border: '1px solid #991b1b',
                          borderRadius: '6px',
                          color: '#fff',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#991b1b';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(153, 27, 27, 0.2)';
                        }}
                      >
                        <Edit2 style={{ width: '14px', height: '14px' }} />
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {userTotalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            marginTop: '20px'
          }}>
            <button
              onClick={() => setUserPage(p => Math.max(1, p - 1))}
              disabled={userPage === 1}
              style={{
                padding: '8px 12px',
                background: userPage === 1 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                color: userPage === 1 ? '#71717a' : '#e4e4e7',
                fontSize: '14px',
                cursor: userPage === 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <ChevronLeft style={{ width: '16px', height: '16px' }} />
              Previous
            </button>
            <span style={{ fontSize: '14px', color: '#a1a1aa' }}>
              Page {userPage} of {userTotalPages}
            </span>
            <button
              onClick={() => setUserPage(p => Math.min(userTotalPages, p + 1))}
              disabled={userPage === userTotalPages}
              style={{
                padding: '8px 12px',
                background: userPage === userTotalPages ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                color: userPage === userTotalPages ? '#71717a' : '#e4e4e7',
                fontSize: '14px',
                cursor: userPage === userTotalPages ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              Next
              <ChevronRight style={{ width: '16px', height: '16px' }} />
            </button>
          </div>
        )}
      </div>

      {/* Section 4: API Usage Log */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '32px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Zap style={{ width: '24px', height: '24px', color: '#991b1b' }} />
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e4e4e7', margin: 0 }}>API Usage Log</h2>
          </div>
          <button
            onClick={exportUsageLog}
            style={{
              padding: '10px 16px',
              background: '#991b1b',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
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
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#991b1b';
            }}
          >
            <Download style={{ width: '16px', height: '16px' }} />
            Export CSV
          </button>
        </div>

        {/* Filters */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <select
            value={logUserFilter}
            onChange={(e) => setLogUserFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              background: '#262626',
              border: '1px solid #3a3a3a',
              borderRadius: '8px',
              color: '#e4e4e7',
              fontSize: '14px',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="">All Users</option>
            {users.map(user => (
              <option key={user.userId} value={user.userId}>{user.email}</option>
            ))}
          </select>

          <select
            value={logProviderFilter}
            onChange={(e) => setLogProviderFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              background: '#262626',
              border: '1px solid #3a3a3a',
              borderRadius: '8px',
              color: '#e4e4e7',
              fontSize: '14px',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="">All Providers</option>
            <option value="OpenAI GPT-4">OpenAI GPT-4</option>
            <option value="OpenAI GPT-3.5">OpenAI GPT-3.5</option>
            <option value="Anthropic Claude">Anthropic Claude</option>
            <option value="Google Gemini">Google Gemini</option>
          </select>

          <input
            type="date"
            value={logDateFrom}
            onChange={(e) => setLogDateFrom(e.target.value)}
            style={{
              padding: '8px 12px',
              background: '#262626',
              border: '1px solid #3a3a3a',
              borderRadius: '8px',
              color: '#e4e4e7',
              fontSize: '14px',
              outline: 'none'
            }}
          />

          <input
            type="date"
            value={logDateTo}
            onChange={(e) => setLogDateTo(e.target.value)}
            style={{
              padding: '8px 12px',
              background: '#262626',
              border: '1px solid #3a3a3a',
              borderRadius: '8px',
              color: '#e4e4e7',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Timestamp</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>User</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Provider</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Service</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Tokens</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Cost</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Feature</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#a1a1aa' }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>
                    <div>{log.userName}</div>
                    <div style={{ fontSize: '11px', color: '#71717a' }}>{log.userEmail}</div>
                  </td>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{log.provider}</td>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{log.serviceType}</td>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{log.tokens.toLocaleString()}</td>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#991b1b', fontWeight: 600 }}>
                    ${log.cost.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#e4e4e7' }}>{log.feature}</td>
                  <td style={{ padding: '12px' }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      background: log.status === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(220, 38, 38, 0.2)',
                      border: `1px solid ${log.status === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(220, 38, 38, 0.3)'}`,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: log.status === 'success' ? '#10b981' : '#dc2626'
                    }}>
                      {log.status === 'success' ? <CheckCircle style={{ width: '12px', height: '12px' }} /> : <XCircle style={{ width: '12px', height: '12px' }} />}
                      {log.status}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {logTotalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            marginTop: '20px'
          }}>
            <button
              onClick={() => setLogPage(p => Math.max(1, p - 1))}
              disabled={logPage === 1}
              style={{
                padding: '8px 12px',
                background: logPage === 1 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                color: logPage === 1 ? '#71717a' : '#e4e4e7',
                fontSize: '14px',
                cursor: logPage === 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <ChevronLeft style={{ width: '16px', height: '16px' }} />
              Previous
            </button>
            <span style={{ fontSize: '14px', color: '#a1a1aa' }}>
              Page {logPage} of {logTotalPages}
            </span>
            <button
              onClick={() => setLogPage(p => Math.min(logTotalPages, p + 1))}
              disabled={logPage === logTotalPages}
              style={{
                padding: '8px 12px',
                background: logPage === logTotalPages ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                color: logPage === logTotalPages ? '#71717a' : '#e4e4e7',
                fontSize: '14px',
                cursor: logPage === logTotalPages ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              Next
              <ChevronRight style={{ width: '16px', height: '16px' }} />
            </button>
          </div>
        )}
      </div>

      {/* Section 5: Company Budget Settings */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '24px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <DollarSign style={{ width: '24px', height: '24px', color: '#991b1b' }} />
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e4e4e7', margin: 0 }}>Company Budget Settings</h2>
          </div>
          <button
            onClick={() => {
              setNewCompanyBudget(overview?.companyBudget.toString() || '');
              setShowBudgetModal(true);
            }}
            style={{
              padding: '10px 16px',
              background: '#991b1b',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
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
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#991b1b';
            }}
          >
            <Edit2 style={{ width: '16px', height: '16px' }} />
            Edit Budget
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <div>
            <div style={{ fontSize: '14px', color: '#a1a1aa', marginBottom: '8px' }}>Current Budget</div>
            <div style={{ fontSize: '36px', fontWeight: 700, color: '#e4e4e7' }}>
              ${overview?.companyBudget.toLocaleString()}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              width: '100%',
              height: '12px',
              background: '#262626',
              borderRadius: '6px',
              overflow: 'hidden',
              marginBottom: '8px'
            }}>
              <div style={{
                width: `${Math.min(overview?.companyPercentUsed || 0, 100)}%`,
                height: '100%',
                background: overview && overview.companyPercentUsed >= 100 ? '#dc2626' :
                           overview && overview.companyPercentUsed >= 80 ? '#d97706' : '#10b981',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#a1a1aa' }}>
              <span>${overview?.companySpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent</span>
              <span>{overview?.companyPercentUsed.toFixed(1)}% used</span>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Modal */}
      {showBudgetModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}
        onClick={() => setShowBudgetModal(false)}>
          <div style={{
            background: '#1a1a1a',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%'
          }}
          onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#e4e4e7', marginBottom: '24px' }}>
              Update Company Budget
            </h3>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', color: '#a1a1aa', marginBottom: '8px' }}>
                New Budget Amount
              </label>
              <input
                type="number"
                value={newCompanyBudget}
                onChange={(e) => setNewCompanyBudget(e.target.value)}
                placeholder="Enter amount"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: '#262626',
                  border: '1px solid #3a3a3a',
                  borderRadius: '8px',
                  color: '#e4e4e7',
                  fontSize: '16px',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#991b1b';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#3a3a3a';
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowBudgetModal(false)}
                style={{
                  padding: '12px 24px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#e4e4e7',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
              >
                Cancel
              </button>
              <button
                onClick={updateCompanyBudget}
                style={{
                  padding: '12px 24px',
                  background: '#991b1b',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#7f1d1d';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#991b1b';
                }}
              >
                Update Budget
              </button>
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
        `
      }} />
    </div>
  );
};

export default AdminBudgetTab;
