/**
 * Admin Sales Dashboard
 *
 * Visual analytics for sales performance using recharts.
 * Data sources: leaderboard, contests, goals, storm memory APIs.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import {
  DollarSign, TrendingUp, Users, Target, Trophy,
  RefreshCw, ChevronDown
} from 'lucide-react';
import { getApiBaseUrl } from '../services/config';
import { authService } from '../services/authService';

const API = getApiBaseUrl();

const getHeaders = () => {
  const email = authService.getCurrentUser()?.email || '';
  return {
    'Content-Type': 'application/json',
    ...(email ? { 'x-user-email': email } : {})
  };
};

// Colors for tier distribution
const TIER_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#6b7280'];

interface LeaderboardEntry {
  name: string;
  email: string;
  monthly_revenue: number;
  monthly_signups: number;
  yearly_revenue: number;
  tier: string;
  team_name?: string;
}

interface LeaderboardStats {
  totalReps: number;
  totalRevenue: number;
  totalSignups: number;
  avgMonthlyRevenue: number;
  avgMonthlySignups: number;
  topPerformer: { name: string; value: number } | null;
  tierDistribution: Record<string, number>;
}

interface TeamData {
  id: number;
  name: string;
  leader_name: string;
  member_count: number;
}

interface Contest {
  id: number;
  name: string;
  status: string;
  metric: string;
  start_date: string;
  end_date: string;
  standings?: Array<{ name: string; value: number; rank: number }>;
}

const AdminSalesDashboard: React.FC = () => {
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [topReps, setTopReps] = useState<LeaderboardEntry[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [bonusTiers, setBonusTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'monthly_signups' | 'monthly_revenue'>('monthly_signups');

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, repsRes, teamsRes, contestsRes, tiersRes] = await Promise.all([
        fetch(`${API}/leaderboard/stats?sortBy=${sortBy}`, { headers: getHeaders() }),
        fetch(`${API}/leaderboard?sortBy=${sortBy}&limit=10`, { headers: getHeaders() }),
        fetch(`${API}/leaderboard/teams`, { headers: getHeaders() }),
        fetch(`${API}/contests?active=true`, { headers: getHeaders() }),
        fetch(`${API}/leaderboard/bonus-tiers`, { headers: getHeaders() })
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      if (repsRes.ok) {
        const data = await repsRes.json();
        setTopReps(Array.isArray(data) ? data : data.reps || data.leaderboard || []);
      }
      if (teamsRes.ok) {
        const data = await teamsRes.json();
        setTeams(Array.isArray(data) ? data : data.teams || []);
      }
      if (contestsRes.ok) {
        const data = await contestsRes.json();
        setContests(Array.isArray(data) ? data : data.contests || []);
      }
      if (tiersRes.ok) {
        const data = await tiersRes.json();
        setBonusTiers(Array.isArray(data) ? data : data.tiers || []);
      }
    } catch (err) {
      console.error('[SalesDashboard] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Prepare tier distribution data for pie chart
  const tierData = stats?.tierDistribution
    ? Object.entries(stats.tierDistribution).map(([name, count], i) => ({
        name,
        value: count as number,
        color: bonusTiers.find(t => t.name === name)?.color || TIER_COLORS[i % TIER_COLORS.length]
      }))
    : [];

  // Prepare top reps data for bar chart
  const topRepsData = topReps.slice(0, 10).map(r => ({
    name: r.name?.split(' ')[0] || r.email?.split('@')[0] || 'Unknown',
    fullName: r.name || r.email,
    signups: r.monthly_signups || 0,
    revenue: r.monthly_revenue || 0,
    tier: r.tier || 'Unranked'
  }));

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '20px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#a1a1aa',
    marginBottom: '4px',
    fontWeight: 500,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: '28px',
    fontWeight: 700,
    color: '#fafafa',
    lineHeight: 1.1,
  };

  if (loading && !stats) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#a1a1aa' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
        <div>Loading sales dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fafafa', margin: 0 }}>
          Sales Performance Dashboard
        </h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '6px',
              color: '#e4e4e7',
              padding: '6px 10px',
              fontSize: '13px'
            }}
          >
            <option value="monthly_signups">Sort: Signups</option>
            <option value="monthly_revenue">Sort: Revenue</option>
          </select>
          <button
            onClick={fetchDashboardData}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '6px',
              color: '#e4e4e7',
              padding: '6px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px'
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <DollarSign size={18} style={{ color: '#22c55e' }} />
            <span style={labelStyle}>Total Revenue</span>
          </div>
          <div style={valueStyle}>
            ${(stats?.totalRevenue || 0).toLocaleString()}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <TrendingUp size={18} style={{ color: '#3b82f6' }} />
            <span style={labelStyle}>Monthly Signups</span>
          </div>
          <div style={valueStyle}>
            {(stats?.totalSignups || 0).toLocaleString()}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Users size={18} style={{ color: '#a855f7' }} />
            <span style={labelStyle}>Active Reps</span>
          </div>
          <div style={valueStyle}>
            {stats?.totalReps || 0}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Target size={18} style={{ color: '#f97316' }} />
            <span style={labelStyle}>Avg Revenue/Rep</span>
          </div>
          <div style={valueStyle}>
            ${Math.round(stats?.avgMonthlyRevenue || 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Top Performer Callout */}
      {stats?.topPerformer && (
        <div style={{
          ...cardStyle,
          background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(249,115,22,0.1))',
          border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 20px'
        }}>
          <Trophy size={24} style={{ color: '#fbbf24' }} />
          <div>
            <div style={{ fontSize: '13px', color: '#fbbf24', fontWeight: 600 }}>Top Performer</div>
            <div style={{ fontSize: '16px', color: '#fafafa', fontWeight: 700 }}>
              {stats.topPerformer.name} — {sortBy === 'monthly_revenue'
                ? `$${stats.topPerformer.value.toLocaleString()}`
                : `${stats.topPerformer.value} signups`
              }
            </div>
          </div>
        </div>
      )}

      {/* Charts Row: Top Reps + Tier Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '16px' }}>
        {/* Top 10 Reps Bar Chart */}
        <div style={cardStyle}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7', marginBottom: '16px' }}>
            Top 10 Reps — {sortBy === 'monthly_revenue' ? 'Revenue' : 'Signups'}
          </div>
          {topRepsData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topRepsData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={70} tick={{ fill: '#d4d4d8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#e4e4e7' }}
                  formatter={(value: number, name: string) => [
                    name === 'revenue' ? `$${value.toLocaleString()}` : value,
                    name === 'revenue' ? 'Revenue' : 'Signups'
                  ]}
                  labelFormatter={(label) => {
                    const rep = topRepsData.find(r => r.name === label);
                    return rep?.fullName || label;
                  }}
                />
                {sortBy === 'monthly_revenue' ? (
                  <Bar dataKey="revenue" fill="#22c55e" radius={[0, 4, 4, 0]} name="Revenue" />
                ) : (
                  <Bar dataKey="signups" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Signups" />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: '#71717a', padding: '40px', textAlign: 'center' }}>No rep data available</div>
          )}
        </div>

        {/* Tier Distribution Pie Chart */}
        <div style={cardStyle}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7', marginBottom: '16px' }}>
            Tier Distribution
          </div>
          {tierData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={tierData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={55}
                  paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {tierData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#e4e4e7' }}
                  formatter={(value: number, name: string) => [`${value} reps`, name]}
                />
                <Legend
                  wrapperStyle={{ color: '#a1a1aa', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: '#71717a', padding: '40px', textAlign: 'center' }}>No tier data available</div>
          )}
        </div>
      </div>

      {/* Teams Section */}
      {teams.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7', marginBottom: '16px' }}>
            Teams Overview
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {teams.map(team => (
              <div
                key={team.id}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  padding: '14px'
                }}
              >
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#e4e4e7' }}>{team.name}</div>
                <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '4px' }}>
                  Led by {team.leader_name || 'Unassigned'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>
                  {team.member_count} member{team.member_count !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Contests */}
      {contests.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Trophy size={18} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4e7' }}>Active Contests</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {contests.map(contest => (
              <div
                key={contest.id}
                style={{
                  background: 'rgba(251,191,36,0.05)',
                  border: '1px solid rgba(251,191,36,0.2)',
                  borderRadius: '8px',
                  padding: '14px'
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fbbf24' }}>{contest.name}</div>
                <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>
                  Metric: {contest.metric} | Ends: {new Date(contest.end_date).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}
                </div>
                {contest.standings && contest.standings.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    {contest.standings.slice(0, 5).map((s, i) => (
                      <div key={i} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '3px 0',
                        fontSize: '12px',
                        color: i === 0 ? '#fbbf24' : '#d4d4d8',
                        fontWeight: i === 0 ? 600 : 400
                      }}>
                        <span>{s.rank}. {s.name}</span>
                        <span>{s.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats Summary */}
      <div style={{
        ...cardStyle,
        background: 'rgba(255,255,255,0.03)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
        padding: '16px 20px'
      }}>
        <div>
          <div style={{ fontSize: '11px', color: '#71717a', fontWeight: 500 }}>Avg Signups/Rep</div>
          <div style={{ fontSize: '18px', color: '#e4e4e7', fontWeight: 600 }}>
            {(stats?.avgMonthlySignups || 0).toFixed(1)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#71717a', fontWeight: 500 }}>Teams</div>
          <div style={{ fontSize: '18px', color: '#e4e4e7', fontWeight: 600 }}>{teams.length}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#71717a', fontWeight: 500 }}>Active Contests</div>
          <div style={{ fontSize: '18px', color: '#e4e4e7', fontWeight: 600 }}>{contests.length}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#71717a', fontWeight: 500 }}>Tier Levels</div>
          <div style={{ fontSize: '18px', color: '#e4e4e7', fontWeight: 600 }}>{tierData.length}</div>
        </div>
      </div>
    </div>
  );
};

export default AdminSalesDashboard;
