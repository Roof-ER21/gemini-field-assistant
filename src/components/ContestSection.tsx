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
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

  const isAdmin = userRole === 'admin' || userRole === 'manager';

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const isMobile = windowWidth < 768;
  const isPortrait = windowWidth < 480;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center" style={{
        flexDirection: isPortrait ? 'column' : 'row',
        alignItems: isPortrait ? 'flex-start' : 'center',
        gap: isPortrait ? '1rem' : '0'
      }}>
        <div style={{ width: isPortrait ? '100%' : 'auto' }}>
          <h2 className="text-white flex items-center gap-2" style={{
            fontSize: isPortrait ? '1.25rem' : isMobile ? '1.5rem' : '1.875rem',
            fontWeight: 'bold'
          }}>
            <Trophy className="text-yellow-400" style={{
              width: isPortrait ? '1.25rem' : '2rem',
              height: isPortrait ? '1.25rem' : '2rem'
            }} />
            Sales Contests
          </h2>
          <p className="text-gray-400 mt-1" style={{
            fontSize: isPortrait ? '0.8125rem' : '0.875rem'
          }}>
            {isAdmin ? 'Manage competitions and track leaderboards' : 'View active contests and your rankings'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            style={{
              padding: isPortrait ? '0.625rem 1rem' : '0.5rem 1rem',
              fontSize: isPortrait ? '0.8125rem' : '0.875rem',
              width: isPortrait ? '100%' : 'auto',
              justifyContent: 'center',
              minHeight: '44px'
            }}
          >
            <Plus style={{ width: '1.25rem', height: '1.25rem' }} />
            {isPortrait ? 'Create' : 'Create Contest'}
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
          gap: '1rem'
        }}>
          {contests.map((contest) => {
            const status = getContestStatus(contest);
            return (
              <div
                key={contest.id}
                onClick={() => loadContestDetails(contest.id)}
                className="bg-gray-800/50 rounded-xl border border-gray-700 hover:bg-gray-800 cursor-pointer transition-colors"
                style={{
                  padding: isPortrait ? '1rem' : '1.5rem'
                }}
              >
                <div className="flex justify-between items-start mb-4" style={{
                  flexDirection: isPortrait ? 'column' : 'row',
                  gap: isPortrait ? '0.5rem' : '0'
                }}>
                  <div className="flex-1" style={{ width: '100%' }}>
                    <h3 className="font-bold text-white mb-1" style={{
                      fontSize: isPortrait ? '1rem' : '1.25rem'
                    }}>{contest.name}</h3>
                    {contest.description && (
                      <p className="text-gray-400 mb-2" style={{
                        fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                      }}>{contest.description}</p>
                    )}
                  </div>
                  <span
                    className={`rounded-full font-medium ${
                      status.color === 'green'
                        ? 'bg-green-500/20 text-green-400'
                        : status.color === 'blue'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                    style={{
                      padding: isPortrait ? '0.375rem 0.75rem' : '0.25rem 0.75rem',
                      fontSize: '0.75rem',
                      alignSelf: isPortrait ? 'flex-start' : 'center',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {status.label}
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isPortrait ? '1fr' : 'repeat(2, 1fr)',
                  gap: isPortrait ? '0.75rem' : '1rem',
                  marginBottom: '1rem'
                }}>
                  <div className="flex items-center gap-2" style={{
                    fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                  }}>
                    <Calendar style={{ width: '1rem', height: '1rem' }} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-300" style={{
                      fontSize: isPortrait ? '0.75rem' : '0.875rem',
                      lineHeight: '1.2'
                    }}>
                      {formatDate(contest.start_date)} - {formatDate(contest.end_date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2" style={{
                    fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                  }}>
                    <Users style={{ width: '1rem', height: '1rem' }} className="text-gray-400 flex-shrink-0" />
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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" style={{
          padding: isPortrait ? '0.5rem' : '1rem'
        }}>
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-h-[90vh] overflow-y-auto" style={{
            maxWidth: isMobile ? '100%' : '56rem'
          }}>
            {/* Header */}
            <div className="sticky top-0 bg-gray-900 border-b border-gray-700" style={{
              padding: isPortrait ? '1rem' : '1.5rem'
            }}>
              <div className="flex justify-between items-start" style={{
                gap: isPortrait ? '0.5rem' : '1rem'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 className="font-bold text-white mb-2" style={{
                    fontSize: isPortrait ? '1.125rem' : isMobile ? '1.5rem' : '1.875rem',
                    wordBreak: 'break-word'
                  }}>{selectedContest.name}</h2>
                  {selectedContest.description && (
                    <p className="text-gray-400" style={{
                      fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                    }}>{selectedContest.description}</p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedContest(null)}
                  className="text-gray-400 hover:text-white flex-shrink-0"
                  style={{
                    minWidth: '44px',
                    minHeight: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <XCircle style={{
                    width: isPortrait ? '1.25rem' : '1.5rem',
                    height: isPortrait ? '1.25rem' : '1.5rem'
                  }} />
                </button>
              </div>

              {/* Contest Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isPortrait ? '1fr 1fr' : isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: isPortrait ? '0.5rem' : '1rem',
                marginTop: '1rem'
              }}>
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
              <div className="bg-blue-500/10 border-b border-gray-700" style={{
                padding: isPortrait ? '1rem' : '1.5rem'
              }}>
                <h3 className="font-bold text-white mb-3 flex items-center gap-2" style={{
                  fontSize: isPortrait ? '1rem' : '1.125rem'
                }}>
                  <Target style={{
                    width: isPortrait ? '1rem' : '1.25rem',
                    height: isPortrait ? '1rem' : '1.25rem'
                  }} className="text-blue-400" />
                  Your Standing
                </h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isPortrait ? '1fr' : 'repeat(3, 1fr)',
                  gap: isPortrait ? '0.75rem' : '1rem'
                }}>
                  <div className="bg-gray-800/50 rounded-lg text-center" style={{
                    padding: isPortrait ? '0.75rem' : '1rem'
                  }}>
                    <div className="font-bold text-white mb-1" style={{
                      fontSize: isPortrait ? '1.5rem' : '1.875rem'
                    }}>
                      {getRankIcon(myStanding.standing.rank)}
                    </div>
                    <div className="text-gray-400" style={{
                      fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                    }}>
                      Rank {myStanding.standing.rank} of {myStanding.total_participants}
                    </div>
                  </div>
                  {selectedContest.metric_type !== 'revenue' && (
                    <div className="bg-gray-800/50 rounded-lg text-center" style={{
                      padding: isPortrait ? '0.75rem' : '1rem'
                    }}>
                      <div className="font-bold text-green-400 mb-1" style={{
                        fontSize: isPortrait ? '1.5rem' : '1.875rem'
                      }}>
                        {myStanding.standing.signups_count}
                      </div>
                      <div className="text-gray-400" style={{
                        fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                      }}>Signups</div>
                    </div>
                  )}
                  {selectedContest.metric_type !== 'signups' && (
                    <div className="bg-gray-800/50 rounded-lg text-center" style={{
                      padding: isPortrait ? '0.75rem' : '1rem'
                    }}>
                      <div className="font-bold text-blue-400 mb-1" style={{
                        fontSize: isPortrait ? '1.125rem' : '1.875rem',
                        wordBreak: 'break-all'
                      }}>
                        {formatCurrency(parseFloat(myStanding.standing.revenue_amount))}
                      </div>
                      <div className="text-gray-400" style={{
                        fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                      }}>Revenue</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Leaderboard */}
            <div style={{
              padding: isPortrait ? '1rem' : '1.5rem'
            }}>
              <h3 className="font-bold text-white mb-4 flex items-center gap-2" style={{
                fontSize: isPortrait ? '1rem' : '1.125rem'
              }}>
                <TrendingUp style={{
                  width: isPortrait ? '1rem' : '1.25rem',
                  height: isPortrait ? '1rem' : '1.25rem'
                }} className="text-blue-400" />
                Leaderboard
              </h3>

              {standings.length === 0 ? (
                <p className="text-gray-400 text-center py-8" style={{
                  fontSize: isPortrait ? '0.875rem' : '1rem'
                }}>No standings available yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {standings.map((standing) => (
                    <div
                      key={standing.id}
                      className={`rounded-lg ${
                        standing.rank <= 3
                          ? 'bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/30'
                          : 'bg-gray-800/50'
                      }`}
                      style={{
                        padding: isPortrait ? '0.75rem' : '1rem',
                        display: 'flex',
                        flexDirection: isPortrait ? 'column' : 'row',
                        alignItems: isPortrait ? 'flex-start' : 'center',
                        gap: isPortrait ? '0.75rem' : '1rem'
                      }}
                    >
                      <div style={{
                        width: isPortrait ? '100%' : '3rem',
                        textAlign: isPortrait ? 'left' : 'center',
                        display: 'flex',
                        alignItems: 'center',
                        gap: isPortrait ? '0.5rem' : '0'
                      }}>
                        {getRankIcon(standing.rank)}
                        {isPortrait && (
                          <div className="flex-1">
                            <div className="font-medium text-white" style={{
                              fontSize: '0.9375rem'
                            }}>
                              {standing.team_name || standing.rep_name}
                            </div>
                            {standing.rep_email && (
                              <div className="text-gray-400" style={{
                                fontSize: '0.75rem'
                              }}>{standing.rep_email}</div>
                            )}
                          </div>
                        )}
                      </div>
                      {!isPortrait && (
                        <div className="flex-1">
                          <div className="font-medium text-white">
                            {standing.team_name || standing.rep_name}
                          </div>
                          {standing.rep_email && (
                            <div className="text-gray-400" style={{
                              fontSize: '0.875rem'
                            }}>{standing.rep_email}</div>
                          )}
                        </div>
                      )}
                      <div style={{
                        display: 'flex',
                        gap: isPortrait ? '1rem' : '1.5rem',
                        textAlign: isPortrait ? 'left' : 'right',
                        width: isPortrait ? '100%' : 'auto',
                        justifyContent: isPortrait ? 'space-around' : 'flex-end'
                      }}>
                        {selectedContest.metric_type !== 'revenue' && (
                          <div>
                            <div className="font-bold text-green-400" style={{
                              fontSize: isPortrait ? '1.125rem' : '1.25rem'
                            }}>
                              {standing.signups_count}
                            </div>
                            <div className="text-gray-400" style={{
                              fontSize: '0.75rem'
                            }}>Signups</div>
                          </div>
                        )}
                        {selectedContest.metric_type !== 'signups' && (
                          <div>
                            <div className="font-bold text-blue-400" style={{
                              fontSize: isPortrait ? '0.9375rem' : '1.125rem',
                              wordBreak: 'break-all'
                            }}>
                              {formatCurrency(parseFloat(standing.revenue_amount.toString()))}
                            </div>
                            <div className="text-gray-400" style={{
                              fontSize: '0.75rem'
                            }}>Revenue</div>
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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" style={{
          padding: isPortrait ? '0.5rem' : '1rem'
        }}>
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-h-[90vh] overflow-y-auto" style={{
            maxWidth: isMobile ? '100%' : '42rem'
          }}>
            <div className="border-b border-gray-700" style={{
              padding: isPortrait ? '1rem' : '1.5rem'
            }}>
              <h2 className="font-bold text-white" style={{
                fontSize: isPortrait ? '1.25rem' : '1.5rem'
              }}>Create New Contest</h2>
            </div>

            <div style={{
              padding: isPortrait ? '1rem' : '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              {/* Name */}
              <div>
                <label className="block font-medium text-gray-300 mb-2" style={{
                  fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                }}>
                  Contest Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white"
                  style={{
                    padding: isPortrait ? '0.875rem 1rem' : '0.5rem 1rem',
                    fontSize: isPortrait ? '1rem' : '0.9375rem',
                    minHeight: '44px'
                  }}
                  placeholder="January Sales Blitz"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block font-medium text-gray-300 mb-2" style={{
                  fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                }}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white"
                  rows={isPortrait ? 2 : 3}
                  style={{
                    padding: isPortrait ? '0.875rem 1rem' : '0.5rem 1rem',
                    fontSize: isPortrait ? '1rem' : '0.9375rem'
                  }}
                  placeholder="Compete for the highest signups this month!"
                />
              </div>

              {/* Contest Type */}
              <div>
                <label className="block font-medium text-gray-300 mb-2" style={{
                  fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                }}>
                  Contest Type *
                </label>
                <select
                  value={formData.contest_type}
                  onChange={(e) => setFormData({ ...formData, contest_type: e.target.value as any })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white"
                  style={{
                    padding: isPortrait ? '0.875rem 1rem' : '0.5rem 1rem',
                    fontSize: isPortrait ? '1rem' : '0.9375rem',
                    minHeight: '44px'
                  }}
                >
                  <option value="company_wide">Company-Wide</option>
                  <option value="team_based">Team-Based</option>
                  <option value="individual">Individual</option>
                </select>
              </div>

              {/* Metric Type */}
              <div>
                <label className="block font-medium text-gray-300 mb-2" style={{
                  fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                }}>
                  Metric *
                </label>
                <select
                  value={formData.metric_type}
                  onChange={(e) => setFormData({ ...formData, metric_type: e.target.value as any })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white"
                  style={{
                    padding: isPortrait ? '0.875rem 1rem' : '0.5rem 1rem',
                    fontSize: isPortrait ? '1rem' : '0.9375rem',
                    minHeight: '44px'
                  }}
                >
                  <option value="signups">Signups Only</option>
                  <option value="revenue">Revenue Only</option>
                  <option value="both">Both (Signups + Revenue)</option>
                </select>
              </div>

              {/* Dates */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isPortrait ? '1fr' : 'repeat(2, 1fr)',
                gap: '1rem'
              }}>
                <div>
                  <label className="block font-medium text-gray-300 mb-2" style={{
                    fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                  }}>
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white"
                    style={{
                      padding: isPortrait ? '0.875rem 1rem' : '0.5rem 1rem',
                      fontSize: isPortrait ? '1rem' : '0.9375rem',
                      minHeight: '44px'
                    }}
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-300 mb-2" style={{
                    fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                  }}>
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white"
                    style={{
                      padding: isPortrait ? '0.875rem 1rem' : '0.5rem 1rem',
                      fontSize: isPortrait ? '1rem' : '0.9375rem',
                      minHeight: '44px'
                    }}
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
                <label className="block font-medium text-gray-300 mb-2" style={{
                  fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                }}>
                  Prize Description
                </label>
                <input
                  type="text"
                  value={formData.prize_description}
                  onChange={(e) => setFormData({ ...formData, prize_description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white"
                  style={{
                    padding: isPortrait ? '0.875rem 1rem' : '0.5rem 1rem',
                    fontSize: isPortrait ? '1rem' : '0.9375rem',
                    minHeight: '44px'
                  }}
                  placeholder="$1,000 bonus + trophy"
                />
              </div>

              {/* Rules */}
              <div>
                <label className="block font-medium text-gray-300 mb-2" style={{
                  fontSize: isPortrait ? '0.8125rem' : '0.875rem'
                }}>
                  Rules
                </label>
                <textarea
                  value={formData.rules}
                  onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-white"
                  rows={isPortrait ? 2 : 3}
                  style={{
                    padding: isPortrait ? '0.875rem 1rem' : '0.5rem 1rem',
                    fontSize: isPortrait ? '1rem' : '0.9375rem'
                  }}
                  placeholder="Contest rules and guidelines..."
                />
              </div>
            </div>

            <div className="border-t border-gray-700 flex gap-3" style={{
              padding: isPortrait ? '1rem' : '1.5rem',
              flexDirection: isPortrait ? 'column-reverse' : 'row',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-white"
                style={{
                  padding: isPortrait ? '0.75rem 1rem' : '0.5rem 1rem',
                  fontSize: isPortrait ? '1rem' : '0.875rem',
                  minHeight: '44px',
                  borderRadius: '0.5rem',
                  border: isPortrait ? '1px solid #374151' : 'none'
                }}
              >
                Cancel
              </button>
              <button
                onClick={createContest}
                disabled={!formData.name || !formData.start_date || !formData.end_date}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  padding: isPortrait ? '0.75rem 1rem' : '0.5rem 1rem',
                  fontSize: isPortrait ? '1rem' : '0.875rem',
                  minHeight: '44px'
                }}
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
