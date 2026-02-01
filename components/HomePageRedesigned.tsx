import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Image,
  Mail,
  Building2,
  Briefcase,
  Target,
  TrendingUp,
  Trophy,
  Calendar,
  Clock,
  ChevronRight,
  Zap,
  Award,
  BarChart3,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type PanelType = 'chat' | 'image' | 'transcribe' | 'email' | 'maps' | 'live' | 'knowledge' | 'agnes' | 'documentjob';

interface HomePageRedesignedProps {
  setActivePanel: (panel: PanelType) => void;
  userEmail?: string;
}

interface GoalProgress {
  monthly: {
    signups: {
      current: number;
      goal: number;
      percentage: number;
      remaining: number;
      status: 'completed' | 'ahead' | 'on-track' | 'behind';
    };
    revenue: {
      current: number;
      goal: number;
      percentage: number;
      remaining: number;
    };
  };
  yearly: {
    signups: {
      current: number;
      goal: number;
      percentage: number;
      remaining: number;
      monthlyAverageNeeded: number;
    };
    revenue: {
      current: number;
      goal: number;
      percentage: number;
      remaining: number;
      monthlyAverageNeeded: number;
    };
  };
  calendar: {
    year: number;
    month: number;
    daysInMonth: number;
    currentDay: number;
    daysRemaining: number;
  };
  leaderboard: {
    rank: number;
    percentile: number;
  };
}

interface MonthlyHistory {
  year: number;
  month: number;
  signups: number;
  revenue: number;
}

const HomePageRedesigned: React.FC<HomePageRedesignedProps> = ({ setActivePanel, userEmail }) => {
  const [progress, setProgress] = useState<GoalProgress | null>(null);
  const [history, setHistory] = useState<MonthlyHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userEmail) {
      setLoading(false);
      return;
    }

    const fetchGoalProgress = async () => {
      try {
        const response = await fetch('/api/rep/goals/progress', {
          headers: {
            'x-user-email': userEmail
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch goal progress');
        }

        const data = await response.json();
        if (data.success) {
          setProgress(data.progress);
          setHistory(data.history || []);
        } else {
          setError(data.error || 'Failed to load goals');
        }
      } catch (err) {
        console.error('Error fetching goal progress:', err);
        setError('Unable to load goal data');
      } finally {
        setLoading(false);
      }
    };

    fetchGoalProgress();
  }, [userEmail]);

  const quickActions = [
    {
      id: 'chat',
      title: 'Start Chat',
      description: 'Get instant AI assistance',
      icon: MessageSquare,
      gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
    },
    {
      id: 'image',
      title: 'Upload & Analyze',
      description: 'Docs, approvals, denials, photos',
      icon: Image,
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
    },
    {
      id: 'email',
      title: 'Generate Email',
      description: 'Professional communication',
      icon: Mail,
      gradient: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
    },
    {
      id: 'maps',
      title: 'Hail + Insurance',
      description: 'Hail history & adjuster contacts',
      icon: Building2,
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
    },
    {
      id: 'documentjob',
      title: 'Manage Jobs',
      description: 'Track your roofing projects',
      icon: Briefcase,
      gradient: 'linear-gradient(135deg, #52525b 0%, #3f3f46 100%)'
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'ahead': return '#3b82f6';
      case 'on-track': return '#10b981';
      case 'behind': return '#ef4444';
      default: return '#71717a';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return Trophy;
      case 'ahead': return ArrowUp;
      case 'on-track': return Minus;
      case 'behind': return ArrowDown;
      default: return Target;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Goal Complete!';
      case 'ahead': return 'Ahead of Pace';
      case 'on-track': return 'On Track';
      case 'behind': return 'Behind Pace';
      default: return 'No Data';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getMonthName = (month: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1] || '';
  };

  // Prepare chart data
  const chartData = history
    .slice()
    .reverse()
    .map(h => ({
      name: getMonthName(h.month),
      signups: h.signups,
      goal: progress?.monthly.signups.goal || 15
    }));

  const CircularProgress: React.FC<{
    percentage: number;
    current: number;
    goal: number;
    status: string;
    size?: number;
  }> = ({ percentage, current, goal, status, size = 180 }) => {
    const circumference = 2 * Math.PI * (size / 2 - 15);
    const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
    const statusColor = getStatusColor(status);

    return (
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 15}
            fill="none"
            stroke="#1a1a1a"
            strokeWidth="12"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 15}
            fill="none"
            stroke={statusColor}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 0.5s ease',
              filter: 'drop-shadow(0 0 8px rgba(220, 38, 38, 0.5))'
            }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#ffffff', lineHeight: '1' }}>
            {current}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#71717a', marginTop: '0.25rem' }}>
            of {goal}
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '600', color: statusColor, marginTop: '0.5rem' }}>
            {Math.round(percentage)}%
          </div>
        </div>
      </div>
    );
  };

  if (!userEmail) {
    // Show generic home page for non-logged in users
    return (
      <div style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        background: 'var(--bg-primary)',
        padding: '1.5rem'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          background: '#0a0a0a',
          borderRadius: '16px',
          border: '1px solid #1a1a1a'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#ffffff', marginBottom: '1rem' }}>
            Welcome to Susan 21
          </h2>
          <p style={{ fontSize: '1rem', color: '#71717a' }}>
            Please log in to view your personalized dashboard
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid #1a1a1a',
            borderTopColor: '#dc2626',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          <p style={{ fontSize: '1rem', color: '#71717a' }}>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !progress) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        padding: '1.5rem'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          background: '#0a0a0a',
          borderRadius: '16px',
          border: '1px solid #1a1a1a',
          maxWidth: '500px'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem'
          }}>
            <Target style={{ width: '32px', height: '32px', color: '#ef4444' }} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.5rem' }}>
            Goal Data Unavailable
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#71717a', marginBottom: '1.5rem' }}>
            {error || 'Unable to load your goal progress. You may not be synced from Google Sheets yet.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              border: 'none',
              borderRadius: '8px',
              padding: '0.75rem 1.5rem',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const StatusIcon = getStatusIcon(progress.monthly.signups.status);
  const statusColor = getStatusColor(progress.monthly.signups.status);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      background: 'var(--bg-primary)',
      padding: '0',
      boxSizing: 'border-box'
    }}>
      {/* Hero Section with Status Badge */}
      <div style={{
        background: 'linear-gradient(135deg, #0a0a0a 0%, #000000 100%)',
        borderBottom: '1px solid #262626',
        padding: '1.5rem 1rem',
        textAlign: 'center'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: `rgba(${statusColor === '#10b981' ? '16, 185, 129' : statusColor === '#3b82f6' ? '59, 130, 246' : '239, 68, 68'}, 0.1)`,
          padding: '0.5rem 1rem',
          borderRadius: '50px',
          marginBottom: '1rem',
          border: `1px solid rgba(${statusColor === '#10b981' ? '16, 185, 129' : statusColor === '#3b82f6' ? '59, 130, 246' : '239, 68, 68'}, 0.3)`
        }}>
          <StatusIcon style={{ width: '16px', height: '16px', color: statusColor }} />
          <span style={{ fontSize: '0.875rem', color: '#d4d4d8', fontWeight: '500' }}>
            {getStatusLabel(progress.monthly.signups.status)}
          </span>
        </div>

        <h1 style={{
          fontSize: 'clamp(1.5rem, 5vw, 2rem)',
          fontWeight: '700',
          color: '#ffffff',
          marginBottom: '0.5rem'
        }}>
          Your Dashboard
        </h1>

        <p style={{
          fontSize: 'clamp(0.875rem, 3vw, 1rem)',
          color: '#a1a1aa',
          marginBottom: '1.5rem'
        }}>
          Track your goals, analyze performance, and drive success
        </p>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {/* Goal Progress Section */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#ffffff',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Target style={{ width: '1.25rem', height: '1.25rem', color: '#dc2626' }} />
            Goal Progress
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.5rem'
          }}>
            {/* Monthly Signup Goal Card */}
            <div style={{
              background: 'linear-gradient(135deg, #0a0a0a 0%, #171717 100%)',
              border: '1px solid #262626',
              borderRadius: '16px',
              padding: '1.5rem',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '1.5rem'
              }}>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.25rem' }}>
                    Monthly Signups
                  </h3>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    color: '#71717a'
                  }}>
                    <Calendar style={{ width: '14px', height: '14px' }} />
                    <span>{getMonthName(progress.calendar.month)} {progress.calendar.year}</span>
                  </div>
                </div>
                <div style={{
                  background: `rgba(${statusColor === '#10b981' ? '16, 185, 129' : statusColor === '#3b82f6' ? '59, 130, 246' : '239, 68, 68'}, 0.1)`,
                  padding: '0.5rem',
                  borderRadius: '8px',
                  border: `1px solid rgba(${statusColor === '#10b981' ? '16, 185, 129' : statusColor === '#3b82f6' ? '59, 130, 246' : '239, 68, 68'}, 0.2)`
                }}>
                  <StatusIcon style={{ width: '20px', height: '20px', color: statusColor }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <CircularProgress
                  percentage={progress.monthly.signups.percentage}
                  current={progress.monthly.signups.current}
                  goal={progress.monthly.signups.goal}
                  status={progress.monthly.signups.status}
                />
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid #262626'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '0.25rem' }}>
                    Remaining
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '600', color: '#ffffff' }}>
                    {progress.monthly.signups.remaining}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '0.25rem' }}>
                    Days Left
                  </div>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    <Clock style={{ width: '18px', height: '18px', color: '#dc2626' }} />
                    {progress.calendar.daysRemaining}
                  </div>
                </div>
              </div>
            </div>

            {/* Yearly Revenue Goal Card */}
            <div style={{
              background: 'linear-gradient(135deg, #0a0a0a 0%, #171717 100%)',
              border: '1px solid #262626',
              borderRadius: '16px',
              padding: '1.5rem',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '1.5rem'
              }}>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.25rem' }}>
                    Yearly Revenue
                  </h3>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    color: '#71717a'
                  }}>
                    <Trophy style={{ width: '14px', height: '14px' }} />
                    <span>{progress.calendar.year} Goal</span>
                  </div>
                </div>
                <div style={{
                  background: 'rgba(139, 92, 246, 0.1)',
                  padding: '0.5rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(139, 92, 246, 0.2)'
                }}>
                  <Award style={{ width: '20px', height: '20px', color: '#8b5cf6' }} />
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ fontSize: '0.875rem', color: '#71717a' }}>Progress</span>
                  <span style={{ fontSize: '1.125rem', fontWeight: '600', color: '#8b5cf6' }}>
                    {Math.round(progress.yearly.revenue.percentage)}%
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '12px',
                  background: '#1a1a1a',
                  borderRadius: '6px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.min(progress.yearly.revenue.percentage, 100)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%)',
                    borderRadius: '6px',
                    transition: 'width 0.5s ease',
                    boxShadow: '0 0 12px rgba(139, 92, 246, 0.5)'
                  }} />
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid #262626'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '0.25rem' }}>
                    Current
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: '600', color: '#10b981' }}>
                    {formatCurrency(progress.yearly.revenue.current)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '0.25rem' }}>
                    Target
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: '600', color: '#ffffff' }}>
                    {formatCurrency(progress.yearly.revenue.goal)}
                  </div>
                </div>
              </div>

              {progress.yearly.revenue.monthlyAverageNeeded > 0 && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  background: 'rgba(139, 92, 246, 0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(139, 92, 246, 0.1)'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '0.25rem' }}>
                    Monthly Avg Needed
                  </div>
                  <div style={{ fontSize: '1.125rem', fontWeight: '600', color: '#8b5cf6' }}>
                    {formatCurrency(progress.yearly.revenue.monthlyAverageNeeded)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Analytics Section */}
        {chartData.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#ffffff',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <BarChart3 style={{ width: '1.25rem', height: '1.25rem', color: '#dc2626' }} />
              Performance Trends
            </h2>

            <div style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: '16px',
              padding: '1.5rem'
            }}>
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.25rem' }}>
                  Monthly Signups (Last 6 Months)
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#71717a' }}>
                  Track your signup trends against your goal
                </p>
              </div>

              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="name" stroke="#71717a" style={{ fontSize: '0.75rem' }} />
                  <YAxis stroke="#71717a" style={{ fontSize: '0.75rem' }} />
                  <Tooltip
                    contentStyle={{
                      background: '#171717',
                      border: '1px solid #262626',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      fontSize: '0.875rem'
                    }}
                  />
                  <Bar dataKey="signups" radius={[8, 8, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.signups >= entry.goal ? '#10b981' : '#dc2626'}
                      />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="goal"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Performance Stats */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#ffffff',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <TrendingUp style={{ width: '1.25rem', height: '1.25rem', color: '#dc2626' }} />
            Performance Stats
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem'
          }}>
            <div style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: '12px',
              padding: '1.25rem'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.75rem'
              }}>
                <div style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '0.5rem',
                  borderRadius: '8px'
                }}>
                  <Target style={{ width: '18px', height: '18px', color: '#10b981' }} />
                </div>
                <span style={{ fontSize: '0.875rem', color: '#71717a' }}>This Month</span>
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.25rem' }}>
                {progress.monthly.signups.current}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#10b981' }}>
                Signups
              </div>
            </div>

            <div style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: '12px',
              padding: '1.25rem'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.75rem'
              }}>
                <div style={{
                  background: 'rgba(139, 92, 246, 0.1)',
                  padding: '0.5rem',
                  borderRadius: '8px'
                }}>
                  <Trophy style={{ width: '18px', height: '18px', color: '#8b5cf6' }} />
                </div>
                <span style={{ fontSize: '0.875rem', color: '#71717a' }}>This Year</span>
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.25rem' }}>
                {progress.yearly.signups.current}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8b5cf6' }}>
                Total Signups
              </div>
            </div>

            <div style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: '12px',
              padding: '1.25rem'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.75rem'
              }}>
                <div style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  padding: '0.5rem',
                  borderRadius: '8px'
                }}>
                  <Award style={{ width: '18px', height: '18px', color: '#f59e0b' }} />
                </div>
                <span style={{ fontSize: '0.875rem', color: '#71717a' }}>Leaderboard</span>
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.25rem' }}>
                #{progress.leaderboard.rank}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#f59e0b' }}>
                Current Rank
              </div>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#ffffff',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Zap style={{ width: '1.25rem', height: '1.25rem', color: '#dc2626' }} />
            Quick Actions
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem'
          }}>
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => setActivePanel(action.id as PanelType)}
                  style={{
                    background: action.gradient,
                    border: 'none',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(220, 38, 38, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                  }}
                >
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(10px)',
                    padding: '0.75rem',
                    borderRadius: '10px'
                  }}>
                    <Icon style={{ width: '1.5rem', height: '1.5rem', color: '#ffffff' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.25rem' }}>
                      {action.title}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.9)' }}>
                      {action.description}
                    </div>
                  </div>
                  <ChevronRight style={{ width: '1.25rem', height: '1.25rem', color: 'rgba(255, 255, 255, 0.8)' }} />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <style>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default HomePageRedesigned;
