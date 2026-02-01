import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Award,
  Medal,
  Star,
  Crown,
  Target,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface Contest {
  id: number;
  name: string;
  description: string;
  contest_type: 'company_wide' | 'team_based' | 'individual';
  metric_type: 'signups' | 'revenue' | 'both';
  start_date: string;
  end_date: string;
  is_monthly: boolean;
  prize_description: string;
  rules: string;
  is_active: boolean;
  created_by_name: string;
  participant_count: number;
  standings_last_updated: string;
}

interface Standing {
  id: number;
  sales_rep_id: number;
  team_name: string;
  rep_name: string;
  rep_email: string;
  signups_count: number;
  revenue_amount: number;
  rank: number;
}

interface Participant {
  id: number;
  sales_rep_id: number;
  team_name: string;
  is_team_leader: boolean;
  rep_name: string;
  rep_email: string;
}

interface ContestSectionProps {
  userEmail: string;
  userRole: string;
}

export default function ContestSection({ userEmail, userRole }: ContestSectionProps) {
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myStanding, setMyStanding] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'active' | 'past' | 'all'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [salesReps, setSalesReps] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);

  const isAdmin = userRole === 'admin' || userRole === 'manager';

  // Form state for creating/editing contests
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    contest_type: 'company_wide' as 'company_wide' | 'team_based' | 'individual',
    metric_type: 'both' as 'signups' | 'revenue' | 'both',
    start_date: '',
    end_date: '',
    is_monthly: false,
    prize_description: '',
    rules: '',
    participants: [] as any[]
  });

  useEffect(() => {
    loadContests();
    if (isAdmin) {
      loadSalesReps();
      loadTeams();
    }
  }, [view]);

  const loadContests = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (view === 'active') params.append('active', 'true');
      if (view === 'past') params.append('past', 'true');

      const response = await fetch(`/api/contests?${params}`, {
        headers: { 'x-user-email': userEmail }
      });
      const data = await response.json();

      if (data.success) {
        setContests(data.contests);
      }
    } catch (error) {
      console.error('Error loading contests:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadContestDetails = async (contestId: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/contests/${contestId}`, {
        headers: { 'x-user-email': userEmail }
      });
      const data = await response.json();

      if (data.success) {
        setSelectedContest(data.contest);
        setStandings(data.standings);
        setParticipants(data.participants);
        loadMyStanding(contestId);
      }
    } catch (error) {
      console.error('Error loading contest details:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyStanding = async (contestId: number) => {
    try {
      const response = await fetch(`/api/contests/${contestId}/my-standing`, {
        headers: { 'x-user-email': userEmail }
      });
      const data = await response.json();

      if (data.success) {
        setMyStanding(data);
      }
    } catch (error) {
      console.error('Error loading my standing:', error);
    }
  };

  const loadSalesReps = async () => {
    try {
      const response = await fetch('/api/leaderboard/sales-reps', {
        headers: { 'x-user-email': userEmail }
      });
      const data = await response.json();
      if (data.success) {
        setSalesReps(data.reps);
      }
    } catch (error) {
      console.error('Error loading sales reps:', error);
    }
  };

  const loadTeams = async () => {
    try {
      const response = await fetch('/api/leaderboard/teams', {
        headers: { 'x-user-email': userEmail }
      });
      const data = await response.json();
      if (data.success) {
        setTeams(data.teams);
      }
    } catch (error) {
      console.error('Error loading teams:', error);
    }
  };

  const createContest = async () => {
    try {
      const response = await fetch('/api/admin/contests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        setShowCreateModal(false);
        resetForm();
        loadContests();
        alert('Contest created successfully!');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error creating contest:', error);
      alert('Failed to create contest');
    }
  };

  const deleteContest = async (contestId: number) => {
    if (!confirm('Are you sure you want to delete this contest?')) return;

    try {
      const response = await fetch(`/api/admin/contests/${contestId}`, {
        method: 'DELETE',
        headers: { 'x-user-email': userEmail }
      });

      const data = await response.json();

      if (data.success) {
        loadContests();
        if (selectedContest?.id === contestId) {
          setSelectedContest(null);
        }
        alert('Contest deleted successfully');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting contest:', error);
      alert('Failed to delete contest');
    }
  };

  const refreshStandings = async (contestId: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/contests/${contestId}/refresh-standings`, {
        method: 'POST',
        headers: { 'x-user-email': userEmail }
      });

      const data = await response.json();

      if (data.success) {
        setStandings(data.standings);
        alert('Standings refreshed!');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error refreshing standings:', error);
      alert('Failed to refresh standings');
    } finally {
      setLoading(false);
    }
  };

  const addParticipants = async (contestId: number, newParticipants: any[]) => {
    try {
      const response = await fetch(`/api/admin/contests/${contestId}/participants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail
        },
        body: JSON.stringify({ participants: newParticipants })
      });

      const data = await response.json();

      if (data.success) {
        loadContestDetails(contestId);
        alert(`Added ${data.added_count} participants`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error adding participants:', error);
      alert('Failed to add participants');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      contest_type: 'company_wide',
      metric_type: 'both',
      start_date: '',
      end_date: '',
      is_monthly: false,
      prize_description: '',
      rules: '',
      participants: []
    });
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-6 h-6 text-yellow-400" />;
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 3:
        return <Medal className="w-6 h-6 text-amber-600" />;
      default:
        return <span className="text-gray-400">#{rank}</span>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getContestStatus = (contest: Contest) => {
    const now = new Date();
    const start = new Date(contest.start_date);
    const end = new Date(contest.end_date);

    if (now < start) return { label: 'Upcoming', color: 'blue' };
    if (now > end) return { label: 'Ended', color: 'gray' };
    return { label: 'Active', color: 'green' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trophy className="w-8 h-8 text-yellow-400" />
            Sales Contests
          </h2>
          <p className="text-gray-400 mt-1">
            {isAdmin ? 'Manage competitions and track leaderboards' : 'View active contests and your rankings'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Contest
          </button>
        )}
      </div>

      {/* View Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        {['active', 'past', 'all'].map((tab) => (
          <button
            key={tab}
            onClick={() => setView(tab as any)}
            className={`px-4 py-2 font-medium transition-colors ${
              view === tab
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)} Contests
          </button>
        ))}
      </div>

      {/* Contest List */}
      {loading && !selectedContest ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-2" />
          <p className="text-gray-400">Loading contests...</p>
        </div>
      ) : contests.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-xl border border-gray-700">
          <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">No contests found</p>
          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-blue-400 hover:text-blue-300"
            >
              Create your first contest
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {contests.map((contest) => {
            const status = getContestStatus(contest);
            return (
              <div
                key={contest.id}
                onClick={() => loadContestDetails(contest.id)}
                className="bg-gray-800/50 rounded-xl border border-gray-700 p-6 hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-1">{contest.name}</h3>
                    {contest.description && (
                      <p className="text-gray-400 text-sm mb-2">{contest.description}</p>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      status.color === 'green'
                        ? 'bg-green-500/20 text-green-400'
                        : status.color === 'blue'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-300">
                      {formatDate(contest.start_date)} - {formatDate(contest.end_date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-300">{contest.participant_count} participants</span>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs">
                    {contest.contest_type.replace('_', ' ')}
                  </span>
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">
                    {contest.metric_type === 'both' ? 'Signups + Revenue' : contest.metric_type}
                  </span>
                  {contest.is_monthly && (
                    <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs">
                      Monthly
                    </span>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex gap-2 mt-4 pt-4 border-t border-gray-700">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteContest(contest.id);
                      }}
                      className="flex items-center gap-1 px-3 py-1 text-red-400 hover:text-red-300 text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        refreshStandings(contest.id);
                      }}
                      className="flex items-center gap-1 px-3 py-1 text-blue-400 hover:text-blue-300 text-sm"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Refresh
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Contest Details Modal */}
      {selectedContest && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">{selectedContest.name}</h2>
                  {selectedContest.description && (
                    <p className="text-gray-400">{selectedContest.description}</p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedContest(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              {/* Contest Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Type</div>
                  <div className="text-white font-medium">
                    {selectedContest.contest_type.replace('_', ' ')}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Metric</div>
                  <div className="text-white font-medium">
                    {selectedContest.metric_type === 'both' ? 'Signups + Revenue' : selectedContest.metric_type}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Start</div>
                  <div className="text-white font-medium">{formatDate(selectedContest.start_date)}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">End</div>
                  <div className="text-white font-medium">{formatDate(selectedContest.end_date)}</div>
                </div>
              </div>

              {selectedContest.prize_description && (
                <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-yellow-400 font-medium mb-2">
                    <Award className="w-5 h-5" />
                    Prize
                  </div>
                  <p className="text-gray-300">{selectedContest.prize_description}</p>
                </div>
              )}
            </div>

            {/* My Standing */}
            {myStanding?.standing && (
              <div className="p-6 bg-blue-500/10 border-b border-gray-700">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-400" />
                  Your Standing
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-white mb-1">
                      {getRankIcon(myStanding.standing.rank)}
                    </div>
                    <div className="text-gray-400 text-sm">
                      Rank {myStanding.standing.rank} of {myStanding.total_participants}
                    </div>
                  </div>
                  {selectedContest.metric_type !== 'revenue' && (
                    <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                      <div className="text-3xl font-bold text-green-400 mb-1">
                        {myStanding.standing.signups_count}
                      </div>
                      <div className="text-gray-400 text-sm">Signups</div>
                    </div>
                  )}
                  {selectedContest.metric_type !== 'signups' && (
                    <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                      <div className="text-3xl font-bold text-blue-400 mb-1">
                        {formatCurrency(parseFloat(myStanding.standing.revenue_amount))}
                      </div>
                      <div className="text-gray-400 text-sm">Revenue</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Leaderboard */}
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                Leaderboard
              </h3>

              {standings.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No standings available yet</p>
              ) : (
                <div className="space-y-2">
                  {standings.map((standing) => (
                    <div
                      key={standing.id}
                      className={`flex items-center gap-4 p-4 rounded-lg ${
                        standing.rank <= 3
                          ? 'bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/30'
                          : 'bg-gray-800/50'
                      }`}
                    >
                      <div className="w-12 text-center">
                        {getRankIcon(standing.rank)}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-white">
                          {standing.team_name || standing.rep_name}
                        </div>
                        {standing.rep_email && (
                          <div className="text-sm text-gray-400">{standing.rep_email}</div>
                        )}
                      </div>
                      <div className="flex gap-6 text-right">
                        {selectedContest.metric_type !== 'revenue' && (
                          <div>
                            <div className="text-lg font-bold text-green-400">
                              {standing.signups_count}
                            </div>
                            <div className="text-xs text-gray-400">Signups</div>
                          </div>
                        )}
                        {selectedContest.metric_type !== 'signups' && (
                          <div>
                            <div className="text-lg font-bold text-blue-400">
                              {formatCurrency(parseFloat(standing.revenue_amount.toString()))}
                            </div>
                            <div className="text-xs text-gray-400">Revenue</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Contest Modal */}
      {showCreateModal && isAdmin && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-2xl font-bold text-white">Create New Contest</h2>
            </div>

            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Contest Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  placeholder="January Sales Blitz"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  rows={3}
                  placeholder="Compete for the highest signups this month!"
                />
              </div>

              {/* Contest Type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Contest Type *
                </label>
                <select
                  value={formData.contest_type}
                  onChange={(e) => setFormData({ ...formData, contest_type: e.target.value as any })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                >
                  <option value="company_wide">Company-Wide</option>
                  <option value="team_based">Team-Based</option>
                  <option value="individual">Individual</option>
                </select>
              </div>

              {/* Metric Type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Metric *
                </label>
                <select
                  value={formData.metric_type}
                  onChange={(e) => setFormData({ ...formData, metric_type: e.target.value as any })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                >
                  <option value="signups">Signups Only</option>
                  <option value="revenue">Revenue Only</option>
                  <option value="both">Both (Signups + Revenue)</option>
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
              </div>

              {/* Monthly */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_monthly}
                  onChange={(e) => setFormData({ ...formData, is_monthly: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm text-gray-300">This is a monthly recurring contest</label>
              </div>

              {/* Prize */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Prize Description
                </label>
                <input
                  type="text"
                  value={formData.prize_description}
                  onChange={(e) => setFormData({ ...formData, prize_description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  placeholder="$1,000 bonus + trophy"
                />
              </div>

              {/* Rules */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Rules
                </label>
                <textarea
                  value={formData.rules}
                  onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  rows={3}
                  placeholder="Contest rules and guidelines..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={createContest}
                disabled={!formData.name || !formData.start_date || !formData.end_date}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Contest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
