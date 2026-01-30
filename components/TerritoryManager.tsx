import React, { useState, useEffect } from 'react';
import { MapPin, Users, Clock, TrendingUp, CheckCircle, XCircle, Activity } from 'lucide-react';
import { getApiBaseUrl } from '../services/config';
import { authService } from '../services/authService';

// Territory interface matching backend
interface Territory {
  id: string;
  name: string;
  description?: string;
  color: string;
  ownerId?: string;
  ownerName?: string;
  isShared: boolean;
  stats: {
    totalAddresses: number;
    addressesCanvassed: number;
    totalLeads: number;
    totalAppointments: number;
    totalSales: number;
    revenueGenerated: number;
    coveragePercent: number;
    leadRate: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Active check-in interface
interface TerritoryCheckIn {
  id: string;
  territoryId: string;
  userId: string;
  checkInTime: Date;
  checkOutTime?: Date;
  doorsKnocked: number;
  contactsMade: number;
  leadsGenerated: number;
  appointmentsSet: number;
  notes?: string;
}

// Leaderboard entry interface
interface LeaderboardEntry {
  territoryId: string;
  territoryName: string;
  color: string;
  ownerName: string;
  stats: {
    totalAddresses: number;
    addressesCanvassed: number;
    totalLeads: number;
    totalAppointments: number;
    totalSales: number;
    revenueGenerated: number;
    coveragePercent: number;
    leadRate: number;
  };
}

const TerritoryManager: React.FC = () => {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activeCheckIn, setActiveCheckIn] = useState<TerritoryCheckIn | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const currentUser = authService.getCurrentUser();
  const apiBaseUrl = getApiBaseUrl();

  // Fetch territories and leaderboard
  useEffect(() => {
    loadTerritories();
    loadLeaderboard();
    loadActiveCheckIn();
  }, []);

  const loadTerritories = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/territories`, {
        headers: {
          'x-user-email': currentUser?.email || ''
        }
      });

      if (!response.ok) throw new Error('Failed to load territories');

      const data = await response.json();
      setTerritories(data.territories || []);
      setError(null);
    } catch (err) {
      console.error('Error loading territories:', err);
      setError('Failed to load territories');
    } finally {
      setLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/territories/leaderboard`);
      if (!response.ok) throw new Error('Failed to load leaderboard');
      const data = await response.json();
      setLeaderboard(data.leaderboard || []);
    } catch (err) {
      console.error('Error loading leaderboard:', err);
    }
  };

  const loadActiveCheckIn = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/territories/active-checkin`, {
        headers: {
          'x-user-email': currentUser?.email || ''
        }
      });

      if (!response.ok) return;

      const data = await response.json();
      setActiveCheckIn(data.checkIn);
    } catch (err) {
      console.error('Error loading active check-in:', err);
    }
  };

  const handleCheckIn = async (territoryId: string) => {
    try {
      setCheckingIn(true);

      // Get current location if available
      let lat: number | undefined;
      let lng: number | undefined;

      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          });
          lat = position.coords.latitude;
          lng = position.coords.longitude;
        } catch (geoErr) {
          console.warn('Location access denied, checking in without location');
        }
      }

      const response = await fetch(`${apiBaseUrl}/territories/${territoryId}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': currentUser?.email || ''
        },
        body: JSON.stringify({ lat, lng })
      });

      if (!response.ok) throw new Error('Failed to check in');

      const data = await response.json();
      setActiveCheckIn(data.checkIn);
      loadTerritories();
    } catch (err) {
      console.error('Error checking in:', err);
      alert('Failed to check in. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    if (!activeCheckIn) return;

    const stats = {
      doorsKnocked: parseInt(prompt('Doors knocked:') || '0'),
      contactsMade: parseInt(prompt('Contacts made:') || '0'),
      leadsGenerated: parseInt(prompt('Leads generated:') || '0'),
      appointmentsSet: parseInt(prompt('Appointments set:') || '0'),
      notes: prompt('Notes (optional):') || ''
    };

    try {
      setCheckingIn(true);

      const response = await fetch(`${apiBaseUrl}/territories/check-out/${activeCheckIn.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': currentUser?.email || ''
        },
        body: JSON.stringify(stats)
      });

      if (!response.ok) throw new Error('Failed to check out');

      setActiveCheckIn(null);
      loadTerritories();
      loadLeaderboard();
    } catch (err) {
      console.error('Error checking out:', err);
      alert('Failed to check out. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  };

  const formatDuration = (checkInTime: Date) => {
    const start = new Date(checkInTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="roof-er-content-area">
        <div className="roof-er-content-scroll" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--roof-red)' }}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Loading territories...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        {/* Header */}
        <div className="roof-er-page-title">
          <MapPin className="w-6 h-6 inline mr-2" style={{ color: 'var(--roof-red)' }} />
          Territory Management
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            background: 'var(--error)',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {/* Active Check-In Banner */}
        {activeCheckIn && (
          <div style={{
            background: 'linear-gradient(135deg, var(--roof-red), var(--roof-red-dark))',
            border: '1px solid var(--glass-border)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            color: 'white'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity className="w-5 h-5" />
                  Active Check-In
                </div>
                <div style={{ fontSize: '14px', opacity: 0.9 }}>
                  Duration: {formatDuration(activeCheckIn.checkInTime)}
                </div>
              </div>
              <button
                onClick={handleCheckOut}
                disabled={checkingIn}
                style={{
                  background: 'white',
                  color: 'var(--roof-red)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  opacity: checkingIn ? 0.6 : 1
                }}
              >
                Check Out
              </button>
            </div>
          </div>
        )}

        {/* Stats Overview */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--roof-red)', marginBottom: '4px' }}>
              {territories.length}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Total Territories
            </div>
          </div>

          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success)', marginBottom: '4px' }}>
              {territories.reduce((sum, t) => sum + t.stats.totalLeads, 0)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Total Leads
            </div>
          </div>

          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--warning)', marginBottom: '4px' }}>
              {territories.reduce((sum, t) => sum + t.stats.totalAppointments, 0)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Appointments
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
          {/* Territory List */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Your Territories
            </h3>

            {territories.length === 0 ? (
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: '12px',
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-tertiary)'
              }}>
                <MapPin className="w-12 h-12 mx-auto mb-4" style={{ opacity: 0.3 }} />
                <p>No territories assigned yet</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {territories.map((territory) => (
                  <div
                    key={territory.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: `1px solid var(--border-default)`,
                      borderLeft: `4px solid ${territory.color}`,
                      borderRadius: '12px',
                      padding: '20px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--roof-red)';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-default)';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    {/* Territory Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {territory.name}
                        </div>
                        {territory.description && (
                          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                            {territory.description}
                          </div>
                        )}
                        <div style={{ fontSize: '12px', color: 'var(--text-disabled)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Users className="w-3 h-3" />
                          {territory.ownerName || 'Unassigned'}
                        </div>
                      </div>

                      {/* Check-in/out button */}
                      {activeCheckIn?.territoryId === territory.id ? (
                        <div style={{
                          background: 'var(--success)',
                          color: 'white',
                          padding: '6px 12px',
                          borderRadius: '9999px',
                          fontSize: '12px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <CheckCircle className="w-4 h-4" />
                          Checked In
                        </div>
                      ) : (
                        <button
                          onClick={() => handleCheckIn(territory.id)}
                          disabled={!!activeCheckIn || checkingIn}
                          style={{
                            background: activeCheckIn ? 'var(--bg-hover)' : 'var(--roof-red)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: activeCheckIn ? 'not-allowed' : 'pointer',
                            opacity: activeCheckIn || checkingIn ? 0.5 : 1,
                            transition: 'all 0.2s'
                          }}
                        >
                          Check In
                        </button>
                      )}
                    </div>

                    {/* Territory Stats */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '12px',
                      background: 'var(--bg-secondary)',
                      padding: '12px',
                      borderRadius: '8px'
                    }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--roof-red)' }}>
                          {territory.stats.coveragePercent}%
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                          Coverage
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {territory.stats.totalLeads}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                          Leads
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {territory.stats.totalAppointments}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                          Appts
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--success)' }}>
                          {territory.stats.leadRate}%
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                          Lead Rate
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Leaderboard Sidebar */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp className="w-5 h-5" style={{ color: 'var(--roof-red)' }} />
              Leaderboard
            </h3>

            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              overflow: 'hidden'
            }}>
              {leaderboard.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  No activity yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {leaderboard.slice(0, 10).map((entry, index) => (
                    <div
                      key={entry.territoryId}
                      style={{
                        padding: '12px 16px',
                        borderBottom: index < leaderboard.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                        background: index === 0 ? 'rgba(196, 30, 58, 0.1)' : 'transparent',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (index !== 0) e.currentTarget.style.background = 'var(--bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        if (index !== 0) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: index === 0 ? 'var(--roof-red)' : 'var(--bg-hover)',
                          color: index === 0 ? 'white' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                          flexShrink: 0
                        }}>
                          {index + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {entry.territoryName}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                            {entry.ownerName}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--roof-red)', fontWeight: 600, marginTop: '4px' }}>
                            {entry.stats.totalLeads} leads • {entry.stats.coveragePercent}% coverage
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TerritoryManager;
