import React, { useState } from 'react';
import { Target, Calendar, DollarSign, Award, AlertCircle, CheckCircle, Edit2, Trash2, Download, ChevronDown, ChevronUp, Trophy } from 'lucide-react';

// Bonus tier structure - matches server-side calculation
const BONUS_TIERS = [
  { tier: 0, name: 'Rookie', minSignups: 0, maxSignups: 5, color: '#71717a', bonusDisplay: '' },
  { tier: 1, name: 'Bronze', minSignups: 6, maxSignups: 10, color: '#cd7f32', bonusDisplay: '' },
  { tier: 2, name: 'Silver', minSignups: 11, maxSignups: 14, color: '#c0c0c0', bonusDisplay: '' },
  { tier: 3, name: 'Gold', minSignups: 15, maxSignups: 19, color: '#ffd700', bonusDisplay: '$' },
  { tier: 4, name: 'Platinum', minSignups: 20, maxSignups: 24, color: '#e5e4e2', bonusDisplay: '$$' },
  { tier: 5, name: 'Diamond', minSignups: 25, maxSignups: 29, color: '#b9f2ff', bonusDisplay: '$$$' },
  { tier: 6, name: 'Elite', minSignups: 30, maxSignups: 999, color: '#9333ea', bonusDisplay: '$$$$$' }
];

interface LeaderboardGoalsSectionProps {
  salesReps: Array<{ id: number; name: string; email: string }>;
  selectedRepForGoal: string;
  setSelectedRepForGoal: (value: string) => void;
  monthlySignupGoal: string;
  setMonthlySignupGoal: (value: string) => void;
  yearlyRevenueGoal: string;
  setYearlyRevenueGoal: (value: string) => void;
  goalsLoading: boolean;
  allGoals: Array<any>;
  goalProgress: Array<any>;
  editingGoalId: number | null;
  setEditingGoalId: (value: number | null) => void;
  handleSaveGoal: () => void;
  handleDeleteGoal: (goalId: number) => void;
  fetchSalesReps: () => void;
  fetchAllGoals: () => void;
  fetchGoalProgress: () => void;
}

const LeaderboardGoalsSection: React.FC<LeaderboardGoalsSectionProps> = ({
  salesReps,
  selectedRepForGoal,
  setSelectedRepForGoal,
  monthlySignupGoal,
  setMonthlySignupGoal,
  yearlyRevenueGoal,
  setYearlyRevenueGoal,
  goalsLoading,
  allGoals,
  goalProgress,
  editingGoalId,
  setEditingGoalId,
  handleSaveGoal,
  handleDeleteGoal,
  fetchSalesReps,
  fetchAllGoals,
  fetchGoalProgress
}) => {
  const [showTierLegend, setShowTierLegend] = useState(false);

  React.useEffect(() => {
    fetchSalesReps();
    fetchAllGoals();
    fetchGoalProgress();
  }, []);

  // Calculate deadline warning
  const currentDay = new Date().getDate();
  const isAfterDeadline = currentDay > 6;
  const deadlineDate = new Date();
  deadlineDate.setDate(6);
  if (isAfterDeadline) {
    deadlineDate.setMonth(deadlineDate.getMonth() + 1);
  }

  // Get current month/year for display
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
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
        <Target style={{ width: '1.25rem', height: '1.25rem', color: '#10b981' }} />
        <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.125rem', fontWeight: '600' }}>
          Leaderboard Goals Management
        </h2>
        <span style={{ color: '#71717a', fontSize: '0.875rem' }}>
          Set and track rep performance goals
        </span>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {/* Deadline Warning */}
        {isAfterDeadline && (
          <div style={{
            background: '#7c2d12',
            border: '1px solid #ea580c',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <AlertCircle style={{ width: '1.25rem', height: '1.25rem', color: '#fb923c' }} />
            <div>
              <div style={{ color: '#ffffff', fontWeight: '500', marginBottom: '0.25rem' }}>
                Goal Setting Deadline Passed
              </div>
              <div style={{ color: '#fdba74', fontSize: '0.875rem' }}>
                Goals for {currentMonth} should have been set by the 6th. Next deadline: {deadlineDate.toLocaleDateString()}
              </div>
            </div>
          </div>
        )}

        {/* Bonus Tier Structure - Collapsible */}
        <div style={{
          background: '#111111',
          borderRadius: '12px',
          border: '1px solid #262626',
          marginBottom: '1.5rem',
          overflow: 'hidden'
        }}>
          <button
            onClick={() => setShowTierLegend(!showTierLegend)}
            style={{
              width: '100%',
              padding: '1rem 1.5rem',
              background: 'transparent',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              color: '#ffffff'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Trophy style={{ width: '1rem', height: '1rem', color: '#ffd700' }} />
              <span style={{ fontWeight: '600' }}>Bonus Tier Structure</span>
              <span style={{ color: '#71717a', fontSize: '0.875rem' }}>
                (Based on monthly signups)
              </span>
            </div>
            {showTierLegend ? (
              <ChevronUp style={{ width: '1rem', height: '1rem', color: '#71717a' }} />
            ) : (
              <ChevronDown style={{ width: '1rem', height: '1rem', color: '#71717a' }} />
            )}
          </button>

          {showTierLegend && (
            <div style={{ padding: '0 1.5rem 1.5rem', borderTop: '1px solid #262626' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '0.75rem',
                marginTop: '1rem'
              }}>
                {BONUS_TIERS.map((tier) => (
                  <div
                    key={tier.tier}
                    style={{
                      background: '#0a0a0a',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      border: `2px solid ${tier.color}`,
                      textAlign: 'center'
                    }}
                  >
                    <div style={{
                      background: tier.color,
                      color: tier.tier >= 4 ? '#000000' : '#ffffff',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      marginBottom: '0.5rem',
                      textTransform: 'uppercase'
                    }}>
                      {tier.name}
                    </div>
                    <div style={{ color: '#ffffff', fontSize: '0.875rem', fontWeight: '600' }}>
                      {tier.minSignups}{tier.maxSignups < 999 ? `-${tier.maxSignups}` : '+'} signups
                    </div>
                    {tier.bonusDisplay && (
                      <div style={{ color: '#10b981', fontSize: '1rem', marginTop: '0.25rem', fontWeight: '700' }}>
                        {tier.bonusDisplay}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ color: '#71717a', fontSize: '0.75rem', marginTop: '1rem', textAlign: 'center' }}>
                Bonuses start at Gold tier (15+ signups). Data syncs from Google Sheets at 8 AM and 8 PM.
              </div>
            </div>
          )}
        </div>

        {/* Goal Setting Interface */}
        <div
          data-goal-form
          style={{
            background: '#111111',
            borderRadius: '12px',
            border: '1px solid #262626',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
          <h3 style={{
            color: '#ffffff',
            fontSize: '1rem',
            fontWeight: '600',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Award style={{ width: '1rem', height: '1rem', color: '#3b82f6' }} />
            {editingGoalId ? 'Edit Goal' : 'Set New Goal'}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            {/* Rep Selection */}
            <div>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Sales Rep
              </label>
              <select
                value={selectedRepForGoal}
                onChange={(e) => setSelectedRepForGoal(e.target.value)}
                disabled={goalsLoading}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: '#1a1a1a',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.9375rem'
                }}
              >
                <option value="">-- Select Rep --</option>
                {salesReps.map(rep => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Monthly Signup Goal */}
            <div>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Monthly Signup Goal
              </label>
              <input
                type="number"
                value={monthlySignupGoal}
                onChange={(e) => setMonthlySignupGoal(e.target.value)}
                disabled={goalsLoading}
                placeholder="e.g., 10"
                min="0"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: '#1a1a1a',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.9375rem'
                }}
              />
            </div>

            {/* Yearly Revenue Goal */}
            <div>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Yearly Revenue Goal
              </label>
              <div style={{ position: 'relative' }}>
                <DollarSign style={{
                  position: 'absolute',
                  left: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '1rem',
                  height: '1rem',
                  color: '#71717a'
                }} />
                <input
                  type="number"
                  value={yearlyRevenueGoal}
                  onChange={(e) => setYearlyRevenueGoal(e.target.value)}
                  disabled={goalsLoading}
                  placeholder="e.g., 250000"
                  min="0"
                  step="1000"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 2.5rem',
                    background: '#1a1a1a',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9375rem'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              onClick={handleSaveGoal}
              disabled={goalsLoading || !selectedRepForGoal || !monthlySignupGoal || !yearlyRevenueGoal}
              style={{
                padding: '0.75rem 1.5rem',
                background: goalsLoading ? '#262626' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: goalsLoading ? 'wait' : 'pointer',
                opacity: (!selectedRepForGoal || !monthlySignupGoal || !yearlyRevenueGoal) ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <CheckCircle style={{ width: '1rem', height: '1rem' }} />
              {editingGoalId ? 'Update Goal' : 'Save Goal'}
            </button>
            {editingGoalId && (
              <button
                onClick={() => {
                  setEditingGoalId(null);
                  setSelectedRepForGoal('');
                  setMonthlySignupGoal('');
                  setYearlyRevenueGoal('');
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'transparent',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  color: '#a1a1aa',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Bulk Goal Management Table */}
        <div style={{
          background: '#111111',
          borderRadius: '12px',
          border: '1px solid #262626',
          overflow: 'hidden',
          marginBottom: '1.5rem'
        }}>
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #262626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <h3 style={{ margin: 0, color: '#ffffff', fontSize: '1rem', fontWeight: '600' }}>
              Current Month Goals ({currentMonth})
            </h3>
            <button
              style={{
                padding: '0.5rem 1rem',
                background: 'transparent',
                border: '1px solid #262626',
                borderRadius: '6px',
                color: '#a1a1aa',
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Download style={{ width: '0.875rem', height: '0.875rem' }} />
              Export
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0a0a0a' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#a1a1aa', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Rep Name
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#a1a1aa', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Monthly Goal
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#a1a1aa', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Yearly Goal
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#a1a1aa', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Status
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#a1a1aa', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {allGoals.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#71717a' }}>
                      No goals set for this month. Set goals above.
                    </td>
                  </tr>
                ) : (
                  allGoals.map((goal: any) => {
                    const progress = goalProgress.find((p: any) => p.repId === goal.repId);
                    const isGoalSet = !!goal.monthlySignupGoal;
                    const isPastDeadline = isAfterDeadline && !isGoalSet;

                    return (
                      <tr key={goal.id} style={{ borderTop: '1px solid #262626' }}>
                        <td style={{ padding: '1rem', color: '#ffffff' }}>
                          {goal.repName || 'Unknown'}
                        </td>
                        <td style={{ padding: '1rem', color: '#ffffff' }}>
                          {goal.monthlySignupGoal || '-'}
                        </td>
                        <td style={{ padding: '1rem', color: '#ffffff' }}>
                          ${(goal.yearlyRevenueGoal || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            background: isPastDeadline ? '#7c2d12' : isGoalSet ? '#064e3b' : '#713f12',
                            color: isPastDeadline ? '#fb923c' : isGoalSet ? '#34d399' : '#fbbf24'
                          }}>
                            {isPastDeadline ? 'Deadline Passed' : isGoalSet ? 'Goal Set' : 'Not Set'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => {
                                setEditingGoalId(goal.id);
                                setSelectedRepForGoal(goal.repId.toString());
                                setMonthlySignupGoal(goal.monthlySignupGoal?.toString() || '');
                                setYearlyRevenueGoal(goal.yearlyRevenueGoal?.toString() || '');
                              }}
                              style={{
                                padding: '0.5rem',
                                background: 'transparent',
                                border: '1px solid #262626',
                                borderRadius: '6px',
                                color: '#3b82f6',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              title="Edit goal"
                            >
                              <Edit2 style={{ width: '0.875rem', height: '0.875rem' }} />
                            </button>
                            <button
                              onClick={() => handleDeleteGoal(goal.id)}
                              style={{
                                padding: '0.5rem',
                                background: 'transparent',
                                border: '1px solid #7c2d12',
                                borderRadius: '6px',
                                color: '#dc2626',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              title="Delete goal"
                            >
                              <Trash2 style={{ width: '0.875rem', height: '0.875rem' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Goal Progress Summary */}
        {goalProgress.length > 0 && (
          <div style={{
            background: '#111111',
            borderRadius: '12px',
            border: '1px solid #262626',
            padding: '1.5rem'
          }}>
            <h3 style={{
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: '600',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Calendar style={{ width: '1rem', height: '1rem', color: '#8b5cf6' }} />
              Progress Summary
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {goalProgress.map((progress: any) => {
                const percentage = progress.goal ? (progress.actual / progress.goal * 100).toFixed(1) : 0;
                const isOnTrack = Number(percentage) >= 80;
                const isSelected = selectedRepForGoal === progress.repId?.toString();

                return (
                  <div
                    key={progress.repId}
                    onClick={() => {
                      // Populate the form with this rep's data for quick editing
                      setSelectedRepForGoal(progress.repId?.toString() || '');
                      setMonthlySignupGoal(progress.goal?.toString() || '15');
                      setYearlyRevenueGoal(progress.yearlyRevenueGoal?.toString() || '1500000');
                      setEditingGoalId(null); // Create new or update existing
                      // Scroll to top of section for editing
                      document.querySelector('[data-goal-form]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    style={{
                      background: isSelected ? '#1a1a1a' : '#0a0a0a',
                      borderRadius: '8px',
                      padding: '1rem',
                      border: `2px solid ${isSelected ? '#3b82f6' : isOnTrack ? '#065f46' : '#7c2d12'}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      transform: isSelected ? 'scale(1.02)' : 'scale(1)'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#111111';
                        e.currentTarget.style.borderColor = '#3b82f6';
                        e.currentTarget.style.transform = 'scale(1.02)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#0a0a0a';
                        e.currentTarget.style.borderColor = isOnTrack ? '#065f46' : '#7c2d12';
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    }}
                    title={`Click to edit ${progress.repName}'s goals`}
                  >
                    <div style={{ color: '#a1a1aa', fontSize: '0.75rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{progress.repName}</span>
                      {isSelected && <span style={{ color: '#3b82f6', fontSize: '0.625rem' }}>EDITING</span>}
                    </div>
                    <div style={{ color: '#ffffff', fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem' }}>
                      {progress.actual} / {progress.goal}
                    </div>
                    <div style={{
                      color: isOnTrack ? '#34d399' : '#fb923c',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      marginBottom: '0.5rem'
                    }}>
                      {percentage}%
                    </div>
                    {/* Tier Badge */}
                    {progress.tier && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <span style={{
                            padding: '0.125rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.625rem',
                            fontWeight: '700',
                            background: progress.tier.color,
                            color: progress.tier.tier >= 4 ? '#000000' : '#ffffff',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            {progress.tier.name}
                          </span>
                          {progress.tier.bonusDisplay && (
                            <span style={{ color: '#10b981', fontSize: '0.625rem', fontWeight: '700' }}>
                              {progress.tier.bonusDisplay}
                            </span>
                          )}
                        </div>
                        {progress.tier.nextTier && (
                          <span style={{ color: '#71717a', fontSize: '0.625rem' }}>
                            +{progress.tier.nextTier.signupsNeeded} → {progress.tier.nextTier.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaderboardGoalsSection;
