/**
 * LeaderboardPanel - Sales leaderboard with RoofTrack + Gemini data
 * Displays rankings, tier badges, revenue, and canvassing stats
 */

import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Medal,
  Users,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Target,
  Home,
  Award,
  Crown,
  Star,
  Zap,
  ArrowUp,
  ArrowDown,
  ChevronDown
} from 'lucide-react';
import { getApiBaseUrl } from '../services/config';

interface LeaderboardPanelProps {
  userEmail: string;
}

// Combined data structure from RoofTrack + Gemini
interface CombinedLeaderboardEntry {
  rank: number;
  gemini_user_id: string | null;
  rooftrack_sales_rep_id: string;
  name: string;
  email: string;
  team: string | null;
  team_id: number | null;
  team_name: string | null;
  territory_id: number | null;
  territory_name: string | null;
  is_team_leader: boolean;
  // RoofTrack data
  monthly_revenue: number;
  yearly_revenue: number;
  all_time_revenue: number;
  monthly_signups: number;
  yearly_signups: number;
  goal_progress: number;
  bonus_tier: number; // 0-6
  bonus_tier_name: string; // Rookie, Bronze, Silver, Gold, Platinum, Diamond, Elite
  player_level: number; // 1-21
  career_points: number;
  current_streak: number;
  // Gemini data
  doors_knocked_30d: number;
  leads_generated_30d: number;
  appointments_set_30d: number;
}

interface Team {
  id: number;
  name: string;
  leader_name: string | null;
  member_count: number;
}

interface Territory {
  id: number;
  name: string;
  rep_count: number;
}

interface UserRankInfo {
  user: CombinedLeaderboardEntry;
  rank: number;
  totalUsers: number;
  nearbyCompetitors: CombinedLeaderboardEntry[];
}

interface LeaderboardStats {
  totalReps: number;
  totalRevenue: number;
  totalSignups: number;
  avgMonthlyRevenue: number;
  topPerformer: CombinedLeaderboardEntry | null;
  tierDistribution: Record<string, number>;
}

interface SyncStatus {
  lastSync: string | null;
  lastSyncStatus: string;
  nextSyncLocal?: string | null;
  nextSync?: string | null;
  recordCount: number;
}

type SortBy =
  | 'monthly_signups'
  | 'monthly_revenue'
  | 'yearly_revenue'
  | 'all_time_revenue'
  | 'doors_knocked_30d';

const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({ userEmail }) => {
  const apiBaseUrl = getApiBaseUrl();
  const [entries, setEntries] = useState<CombinedLeaderboardEntry[]>([]);
  const [currentUser, setCurrentUser] = useState<UserRankInfo | null>(null);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comingSoon, setComingSoon] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('monthly_signups');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(new Set([currentYear, currentYear - 1])).sort((a, b) => b - a);
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];

  useEffect(() => {
    fetchLeaderboardData();

    // Auto-refresh every 60 seconds (reduced from 30 to avoid rate limiting)
    const interval = setInterval(() => {
      fetchLeaderboardData();
    }, 60000);

    return () => clearInterval(interval);
  }, [sortBy, userEmail, selectedYear, selectedMonth, selectedTeamId, selectedTerritoryId]);

  // Fetch teams and territories on mount
  useEffect(() => {
    const fetchTeamsAndTerritories = async () => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        const [teamsRes, territoriesRes] = await Promise.all([
          fetch(`${apiBaseUrl}/leaderboard/teams`, { headers }),
          fetch(`${apiBaseUrl}/leaderboard/territories`, { headers })
        ]);

        if (teamsRes.ok) {
          const teamsData = await teamsRes.json();
          if (teamsData.success && teamsData.teams) {
            setTeams(teamsData.teams);
          }
        }

        if (territoriesRes.ok) {
          const territoriesData = await territoriesRes.json();
          if (territoriesData.success && territoriesData.territories) {
            setTerritories(territoriesData.territories);
          }
        }
      } catch (err) {
        console.error('Error fetching teams/territories:', err);
      }
    };

    fetchTeamsAndTerritories();
  }, [apiBaseUrl]);

  useEffect(() => {
    const loadRole = async () => {
      try {
        const headers = {
          'x-user-email': userEmail,
          'Content-Type': 'application/json'
        };
        const response = await fetch(`${apiBaseUrl}/users/me`, { headers });
        if (!response.ok) return;
        const data = await response.json();
        setIsAdmin(data?.role === 'admin');
      } catch {
        setIsAdmin(false);
      }
    };
    loadRole();
  }, [apiBaseUrl, userEmail]);

  useEffect(() => {
    if (!isAdmin) {
      setSyncStatus(null);
      return;
    }
    fetchSyncStatus();
  }, [isAdmin]);

  const fetchLeaderboardData = async () => {
    try {
      setIsRefreshing(true);
      setError(null);

      const headers = {
        'x-user-email': userEmail,
        'Content-Type': 'application/json'
      };

      const params = new URLSearchParams();
      params.set('sortBy', sortBy);
      if (selectedYear) {
        params.set('year', String(selectedYear));
      }
      if (selectedYear && selectedMonth) {
        params.set('month', String(selectedMonth));
      }
      if (selectedTeamId) {
        params.set('teamId', String(selectedTeamId));
      }
      if (selectedTerritoryId) {
        params.set('territoryId', String(selectedTerritoryId));
      }

      const queryString = params.toString();

      // Fetch one at a time to avoid rate limiting
      const leaderboardRes = await fetch(`${apiBaseUrl}/leaderboard?${queryString}`, { headers });

      // Check for coming soon / not ready state
      if (leaderboardRes.status === 503 || leaderboardRes.status === 500) {
        const data = await leaderboardRes.json().catch(() => ({}));
        if (data.comingSoon) {
          setComingSoon(true);
          setLoading(false);
          return;
        }
      }

      const leaderboardData = leaderboardRes.ok ? await leaderboardRes.json() : { entries: [] };

      // Fetch user rank (may 404 if not found)
      const userRankRes = await fetch(`${apiBaseUrl}/leaderboard/me?${queryString}`, { headers });
      const userRankData = userRankRes.ok ? await userRankRes.json() : null;

      // Fetch stats
      const statsRes = await fetch(`${apiBaseUrl}/leaderboard/stats?${queryString}`, { headers });
      const statsData = statsRes.ok ? await statsRes.json() : null;

      setEntries(leaderboardData.entries || []);
      setCurrentUser(userRankData?.success ? userRankData : null);
      setStats(statsData?.success ? statsData : null);
      setLastUpdate(new Date());
      setComingSoon(false);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      // Don't show error if we have no data - show coming soon instead
      if (entries.length === 0) {
        setComingSoon(true);
      } else {
        setError('Failed to refresh leaderboard data.');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const headers = {
        'x-user-email': userEmail,
        'Content-Type': 'application/json'
      };
      const response = await fetch(`${apiBaseUrl}/leaderboard/sync-status`, { headers });
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.success) return;

      setSyncStatus({
        lastSync: data.lastSync || null,
        lastSyncStatus: data.lastSyncStatus || 'unknown',
        nextSyncLocal: data.nextSyncLocal || null,
        nextSync: data.nextSync || null,
        recordCount: typeof data.recordCount === 'number' ? data.recordCount : 0
      });
    } catch {
      setSyncStatus(null);
    }
  };

  const formatSyncTime = (value?: string | null): string => {
    if (!value) return 'Never';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };

  // Safe accessor for tier name with fallback
  const getTierName = (entry: CombinedLeaderboardEntry | undefined | null): string => {
    return entry?.bonus_tier_name || 'Rookie';
  };

  // Safe accessor for numeric values with fallback
  const safeNum = (val: number | undefined | null): number => {
    return typeof val === 'number' && !isNaN(val) ? val : 0;
  };

  const getTierColor = (tierName: string): string => {
    const colors: Record<string, string> = {
      'Rookie': '#71717a',
      'Bronze': '#cd7f32',
      'Silver': '#c0c0c0',
      'Gold': '#ffd700',
      'Platinum': '#e5e4e2',
      'Diamond': '#b9f2ff',
      'Elite': '#ff0000'
    };
    return colors[tierName] || '#71717a';
  };

  const getTierIcon = (tierName: string) => {
    switch (tierName) {
      case 'Elite':
        return <Crown className="w-4 h-4" />;
      case 'Diamond':
      case 'Platinum':
        return <Star className="w-4 h-4" />;
      case 'Gold':
        return <Trophy className="w-4 h-4" />;
      case 'Silver':
      case 'Bronze':
        return <Medal className="w-4 h-4" />;
      default:
        return <Award className="w-4 h-4" />;
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const filterSelectStyle: React.CSSProperties = {
    padding: '12px 16px',
    background: '#111',
    border: '1px solid #1a1a1a',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    appearance: 'none'
  };

  const periodLabel = selectedYear
    ? (selectedMonth ? `${monthNames[selectedMonth - 1]} ${selectedYear}` : `${selectedYear}`)
    : null;

  const signupsLabel = selectedYear ? `Signups (${periodLabel})` : 'Monthly Signups';
  const revenueLabel = selectedYear ? `Revenue (${periodLabel})` : 'Monthly Revenue';
  const signupsLabelShort = selectedYear
    ? (selectedMonth ? `${monthNames[selectedMonth - 1]} Signups` : `${selectedYear} Signups`)
    : 'Signups';
  const revenueLabelShort = selectedYear
    ? (selectedMonth ? `${monthNames[selectedMonth - 1]} Revenue` : `${selectedYear} Revenue`)
    : 'Revenue';

  const getSortLabel = (sort: SortBy): string => {
    switch (sort) {
      case 'monthly_signups':
        return signupsLabel;
      case 'monthly_revenue':
        return revenueLabel;
      case 'yearly_revenue':
        return selectedYear ? `Yearly Revenue (${selectedYear})` : 'Yearly Revenue';
      case 'all_time_revenue':
        return 'All-Time Revenue';
      case 'doors_knocked_30d':
      default:
        return 'Doors Knocked';
    }
  };

  if (loading) {
    return (
      <div className="roof-er-content-area">
        <div className="roof-er-content-scroll">
          <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" style={{ color: '#dc2626' }} />
            Loading leaderboard...
          </div>
        </div>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="roof-er-content-area">
        <div className="roof-er-content-scroll">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ color: '#ef4444', marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
              {error}
            </div>
            <button
              onClick={fetchLeaderboardData}
              style={{
                padding: '12px 24px',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Coming Soon state - shown when data source isn't ready
  if (comingSoon) {
    return (
      <div className="roof-er-content-area">
        <div className="roof-er-content-scroll">
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Trophy className="w-16 h-16 mx-auto mb-4" style={{ color: '#dc2626', opacity: 0.5 }} />
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '12px' }}>
              Leaderboard Coming Soon
            </h2>
            <p style={{ color: '#71717a', fontSize: '14px', maxWidth: '400px', margin: '0 auto 24px' }}>
              We're setting up the sales leaderboard with Google Sheets integration.
              Check back soon to see rankings, tiers, and competition stats!
            </p>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '8px',
              color: '#71717a',
              fontSize: '13px'
            }}>
              <Zap className="w-4 h-4" style={{ color: '#fbbf24' }} />
              Google Sheets sync in progress...
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showSyncStatus = isAdmin && syncStatus;

  return (
    <div className="roof-er-content-area" style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <div className="roof-er-content-scroll" style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
        {/* Header */}
        <div className="roof-er-page-title">
          <Trophy className="w-6 h-6 inline mr-2" style={{ color: '#dc2626' }} />
          Sales Leaderboard
        </div>

        {showSyncStatus && (
          <div style={{
            background: '#121212',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '18px',
            border: '1px solid #2a2a2a',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RefreshCw className="w-4 h-4" style={{ color: '#dc2626' }} />
              <span style={{ color: '#e5e7eb', fontSize: '14px', fontWeight: 600 }}>
                Leaderboard Sync
              </span>
              <span style={{
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: '999px',
                background: syncStatus?.lastSyncStatus === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                color: syncStatus?.lastSyncStatus === 'error' ? '#fca5a5' : '#6ee7b7'
              }}>
                {syncStatus?.lastSyncStatus || 'unknown'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', color: '#a1a1aa', fontSize: '12px' }}>
              <div>Last: {formatSyncTime(syncStatus?.lastSync)}</div>
              <div>Next: {syncStatus?.nextSyncLocal || formatSyncTime(syncStatus?.nextSync)}</div>
              <div>Active reps: {syncStatus?.recordCount ?? 0}</div>
            </div>
          </div>
        )}

        {/* User Card */}
        {currentUser?.user && (
          <div style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
            color: 'white',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>Your Rank</div>
                <div style={{ fontSize: '36px', fontWeight: 700, lineHeight: 1 }}>
                  #{safeNum(currentUser.rank)}
                  <span style={{ fontSize: '16px', opacity: 0.8, marginLeft: '8px' }}>
                    of {safeNum(currentUser.totalUsers)}
                  </span>
                </div>
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: '20px',
                  border: `2px solid ${getTierColor(getTierName(currentUser.user))}`
                }}
              >
                {getTierIcon(getTierName(currentUser.user))}
                <span style={{ fontSize: '14px', fontWeight: 600 }}>
                  {getTierName(currentUser.user)}
                </span>
              </div>
            </div>

            {/* Goal Progress */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span>Goal Progress</span>
                <span>{safeNum(currentUser.user.goal_progress).toFixed(0)}%</span>
              </div>
              <div style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div
                  style={{
                    width: `${Math.min(safeNum(currentUser.user.goal_progress), 100)}%`,
                    height: '100%',
                    background: 'white',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '2px' }}>{signupsLabelShort}</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>
                  {safeNum(currentUser.user.monthly_signups)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '2px' }}>{revenueLabelShort}</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>
                  {formatCurrency(safeNum(currentUser.user.monthly_revenue))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '2px' }}>Doors</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>
                  {safeNum(currentUser.user.doors_knocked_30d)}
                </div>
              </div>
            </div>
            <div style={{ marginTop: '12px', fontSize: '12px', opacity: 0.85 }}>
              All-Time Revenue: {formatCurrency(safeNum(currentUser.user.all_time_revenue))}
            </div>
          </div>
        )}

        {/* Quick Stats Grid */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div style={{
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <Users className="w-5 h-5 mb-2" style={{ color: '#3b82f6' }} />
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                {stats.totalReps}
              </div>
              <div style={{ fontSize: '12px', color: '#71717a' }}>Total Reps</div>
            </div>

            <div style={{
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <DollarSign className="w-5 h-5 mb-2" style={{ color: '#10b981' }} />
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                {formatCurrency(stats.totalRevenue)}
              </div>
              <div style={{ fontSize: '12px', color: '#71717a' }}>{revenueLabel}</div>
            </div>

            <div style={{
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <TrendingUp className="w-5 h-5 mb-2" style={{ color: '#8b5cf6' }} />
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                {stats.totalSignups}
              </div>
              <div style={{ fontSize: '12px', color: '#71717a' }}>{signupsLabel}</div>
            </div>

            <div style={{
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <Trophy className="w-5 h-5 mb-2" style={{ color: '#dc2626' }} />
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                {stats.topPerformer?.name.split(' ')[0] || 'N/A'}
              </div>
              <div style={{ fontSize: '12px', color: '#71717a' }}>Top Performer</div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Sort Dropdown */}
          <div style={{ position: 'relative', flex: 1 }}>
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#111',
                border: '1px solid #1a1a1a',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}
            >
              <span>Sort: {getSortLabel(sortBy)}</span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {showSortDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                  zIndex: 100,
                  overflow: 'hidden'
                }}
              >
                {(['monthly_signups', 'monthly_revenue', 'yearly_revenue', 'all_time_revenue', 'doors_knocked_30d'] as SortBy[]).map((sort) => (
                  <button
                    key={sort}
                    onClick={() => {
                      setSortBy(sort);
                      setShowSortDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: sortBy === sort ? '#1a1a1a' : 'transparent',
                      border: 'none',
                      color: sortBy === sort ? '#dc2626' : '#fff',
                      fontSize: '14px',
                      fontWeight: sortBy === sort ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (sortBy !== sort) {
                        e.currentTarget.style.background = '#111';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (sortBy !== sort) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    {getSortLabel(sort)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Year Filter */}
          <div style={{ minWidth: '160px' }}>
            <select
              value={selectedYear ? String(selectedYear) : ''}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) {
                  setSelectedYear(null);
                  setSelectedMonth(null);
                } else {
                  setSelectedYear(parseInt(value, 10));
                }
              }}
              style={filterSelectStyle}
            >
              <option value="">Current Year</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div style={{ minWidth: '170px' }}>
            <select
              value={selectedMonth ? String(selectedMonth) : ''}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) {
                  setSelectedMonth(null);
                } else {
                  setSelectedMonth(parseInt(value, 10));
                }
              }}
              style={{
                ...filterSelectStyle,
                opacity: selectedYear ? 1 : 0.5,
                cursor: selectedYear ? 'pointer' : 'not-allowed'
              }}
              disabled={!selectedYear}
            >
              <option value="">All Months</option>
              {monthNames.map((month, index) => (
                <option key={month} value={index + 1}>{month}</option>
              ))}
            </select>
          </div>

          {/* Team Filter */}
          {teams.length > 0 && (
            <div style={{ minWidth: '150px' }}>
              <select
                value={selectedTeamId ? String(selectedTeamId) : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedTeamId(value ? parseInt(value, 10) : null);
                }}
                style={filterSelectStyle}
              >
                <option value="">All Teams</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.member_count})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Territory Filter */}
          {territories.length > 0 && (
            <div style={{ minWidth: '150px' }}>
              <select
                value={selectedTerritoryId ? String(selectedTerritoryId) : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedTerritoryId(value ? parseInt(value, 10) : null);
                }}
                style={filterSelectStyle}
              >
                <option value="">All Territories</option>
                {territories.map((terr) => (
                  <option key={terr.id} value={terr.id}>
                    {terr.name} ({terr.rep_count})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Refresh Button */}
          <button
            onClick={fetchLeaderboardData}
            disabled={isRefreshing}
            style={{
              padding: '12px 16px',
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: isRefreshing ? 0.7 : 1,
              transition: 'opacity 0.2s'
            }}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Last Update */}
        <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '16px', textAlign: 'right' }}>
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>

        {/* Leaderboard Table */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#fff' }}>
            Rankings
          </h3>

          {entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
              No leaderboard data available
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {entries.map((entry) => {
                const isCurrentUser = entry.email === userEmail;

                return (
                  <div
                    key={entry.rooftrack_sales_rep_id}
                    style={{
                      background: isCurrentUser ? '#1a1a1a' : '#111',
                      border: isCurrentUser ? '2px solid #dc2626' : '1px solid #1a1a1a',
                      borderRadius: '12px',
                      padding: '16px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      {/* Rank */}
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          background: entry.rank <= 3 ? '#dc2626' : '#262626',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '18px',
                          fontWeight: 700,
                          color: '#fff',
                          flexShrink: 0
                        }}
                      >
                        {entry.rank <= 3 ? (
                          entry.rank === 1 ? <Crown className="w-5 h-5" /> : <Trophy className="w-5 h-5" />
                        ) : (
                          entry.rank
                        )}
                      </div>

                      {/* Name & Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                          {entry.name}
                          {entry.is_team_leader && (
                            <span style={{
                              padding: '2px 8px',
                              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              color: '#000',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <Crown className="w-3 h-3" />
                              LEAD
                            </span>
                          )}
                          {isCurrentUser && (
                            <span style={{
                              padding: '2px 8px',
                              background: '#dc2626',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700
                            }}>
                              YOU
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#71717a', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {entry.team_name && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Users className="w-3 h-3" />
                              {entry.team_name}
                            </span>
                          )}
                          {entry.territory_name && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Target className="w-3 h-3" />
                              {entry.territory_name}
                            </span>
                          )}
                          {!entry.team_name && !entry.territory_name && entry.team && (
                            <span>{entry.team}</span>
                          )}
                        </div>
                      </div>

                      {/* Tier Badge */}
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          background: `${getTierColor(getTierName(entry))}20`,
                          border: `1px solid ${getTierColor(getTierName(entry))}`,
                          borderRadius: '16px',
                          flexShrink: 0
                        }}
                      >
                        <span style={{ color: getTierColor(getTierName(entry)) }}>
                          {getTierIcon(getTierName(entry))}
                        </span>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: getTierColor(getTierName(entry))
                        }}>
                          {getTierName(entry)}
                        </span>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid #1a1a1a'
                    }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '4px' }}>
                          {signupsLabelShort}
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
                          {entry.monthly_signups}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '4px' }}>
                          {revenueLabelShort}
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981' }}>
                          {formatCurrency(entry.monthly_revenue)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '4px' }}>
                          Tier
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: getTierColor(getTierName(entry)) }}>
                          {safeNum(entry.bonus_tier)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '4px' }}>
                          Doors (30d)
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#3b82f6' }}>
                          {entry.doors_knocked_30d}
                        </div>
                      </div>
                    </div>

                    {/* Additional Stats Row */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '12px',
                      paddingTop: '8px',
                      fontSize: '11px',
                      color: '#71717a'
                    }}>
                      <div>
                        Level {entry.player_level}
                      </div>
                      <div>
                        {entry.current_streak} day streak
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {formatNumber(entry.career_points)} pts
                      </div>
                    </div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '8px',
                      fontSize: '11px',
                      color: '#71717a'
                    }}>
                      <span>All-Time Revenue</span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>
                        {formatCurrency(entry.all_time_revenue)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeaderboardPanel;
