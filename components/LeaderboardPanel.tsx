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

type SortBy = 'monthly_signups' | 'monthly_revenue' | 'yearly_revenue' | 'doors_knocked_30d';

const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({ userEmail }) => {
  const [entries, setEntries] = useState<CombinedLeaderboardEntry[]>([]);
  const [currentUser, setCurrentUser] = useState<UserRankInfo | null>(null);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('monthly_signups');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  useEffect(() => {
    fetchLeaderboardData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchLeaderboardData();
    }, 30000);

    return () => clearInterval(interval);
  }, [sortBy, userEmail]);

  const fetchLeaderboardData = async () => {
    try {
      setError(null);

      const [leaderboardRes, userRankRes, statsRes] = await Promise.all([
        fetch(`/api/leaderboard?sortBy=${sortBy}`),
        fetch(`/api/leaderboard/me?email=${encodeURIComponent(userEmail)}`),
        fetch('/api/leaderboard/stats')
      ]);

      if (!leaderboardRes.ok || !userRankRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch leaderboard data');
      }

      const leaderboardData = await leaderboardRes.json();
      const userRankData = await userRankRes.json();
      const statsData = await statsRes.json();

      setEntries(leaderboardData.entries || []);
      setCurrentUser(userRankData);
      setStats(statsData);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setError('Failed to load leaderboard. Please try again.');
    } finally {
      setLoading(false);
    }
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

  const getSortLabel = (sort: SortBy): string => {
    const labels: Record<SortBy, string> = {
      'monthly_signups': 'Monthly Signups',
      'monthly_revenue': 'Monthly Revenue',
      'yearly_revenue': 'Yearly Revenue',
      'doors_knocked_30d': 'Doors Knocked'
    };
    return labels[sort];
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

  if (error) {
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

  return (
    <div className="roof-er-content-area" style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <div className="roof-er-content-scroll" style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
        {/* Header */}
        <div className="roof-er-page-title">
          <Trophy className="w-6 h-6 inline mr-2" style={{ color: '#dc2626' }} />
          Sales Leaderboard
        </div>

        {/* User Card */}
        {currentUser && (
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
                  #{currentUser.rank}
                  <span style={{ fontSize: '16px', opacity: 0.8, marginLeft: '8px' }}>
                    of {currentUser.totalUsers}
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
                  border: `2px solid ${getTierColor(currentUser.user.bonus_tier_name)}`
                }}
              >
                {getTierIcon(currentUser.user.bonus_tier_name)}
                <span style={{ fontSize: '14px', fontWeight: 600 }}>
                  {currentUser.user.bonus_tier_name}
                </span>
              </div>
            </div>

            {/* Goal Progress */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span>Goal Progress</span>
                <span>{currentUser.user.goal_progress.toFixed(0)}%</span>
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
                    width: `${Math.min(currentUser.user.goal_progress, 100)}%`,
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
                <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '2px' }}>Signups</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>
                  {currentUser.user.monthly_signups}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '2px' }}>Revenue</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>
                  {formatCurrency(currentUser.user.monthly_revenue)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '2px' }}>Doors</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>
                  {currentUser.user.doors_knocked_30d}
                </div>
              </div>
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
              <div style={{ fontSize: '12px', color: '#71717a' }}>Monthly Revenue</div>
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
              <div style={{ fontSize: '12px', color: '#71717a' }}>Monthly Signups</div>
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
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
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
                {(['monthly_signups', 'monthly_revenue', 'yearly_revenue', 'doors_knocked_30d'] as SortBy[]).map((sort) => (
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

          {/* Refresh Button */}
          <button
            onClick={fetchLeaderboardData}
            style={{
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
              gap: '8px'
            }}
          >
            <RefreshCw className="w-4 h-4" />
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
                        <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                          {entry.name}
                          {isCurrentUser && (
                            <span style={{
                              marginLeft: '8px',
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
                        {entry.team && (
                          <div style={{ fontSize: '12px', color: '#71717a' }}>
                            {entry.team}
                          </div>
                        )}
                      </div>

                      {/* Tier Badge */}
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          background: `${getTierColor(entry.bonus_tier_name)}20`,
                          border: `1px solid ${getTierColor(entry.bonus_tier_name)}`,
                          borderRadius: '16px',
                          flexShrink: 0
                        }}
                      >
                        <span style={{ color: getTierColor(entry.bonus_tier_name) }}>
                          {getTierIcon(entry.bonus_tier_name)}
                        </span>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: getTierColor(entry.bonus_tier_name)
                        }}>
                          {entry.bonus_tier_name}
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
                          Signups
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
                          {entry.monthly_signups}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '4px' }}>
                          Revenue
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981' }}>
                          {formatCurrency(entry.monthly_revenue)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '4px' }}>
                          Tier
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: getTierColor(entry.bonus_tier_name) }}>
                          {entry.bonus_tier}
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
