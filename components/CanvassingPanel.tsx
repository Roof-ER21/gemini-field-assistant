/**
 * CanvassingPanel - Door-to-door canvassing management
 * Track addresses, follow-ups, and session statistics
 */

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  Users,
  Clock,
  Target,
  PlayCircle,
  StopCircle,
  RefreshCw,
  MessageCircle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Home
} from 'lucide-react';
import {
  canvassingApi,
  CanvassingEntry,
  CanvassingSession,
  CanvassingStats,
  CanvassingStatus
} from '../services/canvassingApi';

const CanvassingPanel: React.FC = () => {
  const [stats, setStats] = useState<CanvassingStats | null>(null);
  const [activeSession, setActiveSession] = useState<CanvassingSession | null>(null);
  const [followUps, setFollowUps] = useState<CanvassingEntry[]>([]);
  const [recentActivity, setRecentActivity] = useState<CanvassingEntry[]>([]);
  const [sessions, setSessions] = useState<CanvassingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'followups' | 'activity' | 'sessions'>('overview');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsData, followUpsData, sessionsData] = await Promise.all([
        canvassingApi.getUserStats(30),
        canvassingApi.getFollowUps(),
        canvassingApi.getSessionHistory(10)
      ]);

      setStats(statsData);
      setFollowUps(followUpsData);
      setSessions(sessionsData);

      // Check if there's an active session (no end time)
      const active = sessionsData.find(s => !s.endTime);
      setActiveSession(active || null);

      // Get recent activity from nearby (if geolocation available)
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const nearby = await canvassingApi.getNearbyCanvassing({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            radiusMiles: 5
          });
          setRecentActivity(nearby.slice(0, 10));
        });
      }
    } catch (error) {
      console.error('Error fetching canvassing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const session = await canvassingApi.startSession({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        if (session) {
          setActiveSession(session);
          fetchData();
        }
      });
    } else {
      const session = await canvassingApi.startSession({});
      if (session) {
        setActiveSession(session);
        fetchData();
      }
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        await canvassingApi.endSession(activeSession.id, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setActiveSession(null);
        fetchData();
      });
    } else {
      await canvassingApi.endSession(activeSession.id);
      setActiveSession(null);
      fetchData();
    }
  };

  const handleCallContact = (phoneNumber: string) => {
    window.location.href = `tel:${phoneNumber.replace(/[^0-9]/g, '')}`;
  };

  const handleTextContact = (phoneNumber: string) => {
    window.location.href = `sms:${phoneNumber.replace(/[^0-9]/g, '')}`;
  };

  const getStatusColor = (status: CanvassingStatus): string => {
    const colors: Record<CanvassingStatus, string> = {
      'sold': '#10b981',
      'appointment_set': '#3b82f6',
      'lead': '#8b5cf6',
      'interested': '#06b6d4',
      'not_interested': '#ef4444',
      'return_visit': '#f59e0b',
      'no_answer': '#6b7280',
      'contacted': '#14b8a6',
      'not_contacted': '#9ca3af'
    };
    return colors[status] || '#6b7280';
  };

  const getStatusIcon = (status: CanvassingStatus) => {
    switch (status) {
      case 'sold':
        return <CheckCircle className="w-4 h-4" />;
      case 'not_interested':
        return <XCircle className="w-4 h-4" />;
      case 'return_visit':
      case 'lead':
      case 'interested':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Home className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="roof-er-content-area">
        <div className="roof-er-content-scroll">
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            Loading canvassing data...
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
          Canvassing Tracker
        </div>

        {/* Active Session Banner */}
        {activeSession && (
          <div style={{
            background: 'linear-gradient(135deg, var(--roof-red) 0%, #dc2626 100%)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
            color: 'white'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PlayCircle className="w-5 h-5" />
                  Active Session
                </div>
                <div style={{ fontSize: '14px', opacity: 0.9 }}>
                  Duration: {formatDuration(activeSession.startTime)}
                </div>
                <div style={{ fontSize: '14px', opacity: 0.9, marginTop: '4px' }}>
                  Doors: {activeSession.doorsKnocked} | Contacts: {activeSession.contacts} | Leads: {activeSession.leads}
                </div>
              </div>
              <button
                onClick={handleEndSession}
                style={{
                  padding: '10px 20px',
                  background: 'white',
                  color: 'var(--roof-red)',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <StopCircle className="w-4 h-4" />
                End Session
              </button>
            </div>
          </div>
        )}

        {/* Stats Dashboard */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Doors Knocked
              </div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--roof-red)' }}>
                {stats.totalDoors}
              </div>
            </div>

            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Contacts Made
              </div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#3b82f6' }}>
                {stats.totalContacts}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {stats.contactRate.toFixed(1)}% contact rate
              </div>
            </div>

            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Leads Generated
              </div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#8b5cf6' }}>
                {stats.totalLeads}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {stats.leadRate.toFixed(1)}% lead rate
              </div>
            </div>

            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Sales Closed
              </div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>
                {stats.totalSales}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {stats.conversionRate.toFixed(1)}% conversion
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          {!activeSession && (
            <button
              onClick={handleStartSession}
              style={{
                flex: 1,
                padding: '14px',
                background: 'var(--roof-red)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <PlayCircle className="w-5 h-5" />
              Start Session
            </button>
          )}
          <button
            onClick={fetchData}
            style={{
              flex: 1,
              padding: '14px',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <RefreshCw className="w-5 h-5" />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-default)' }}>
          {(['overview', 'followups', 'activity', 'sessions'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              style={{
                padding: '12px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: selectedTab === tab ? '2px solid var(--roof-red)' : '2px solid transparent',
                color: selectedTab === tab ? 'var(--roof-red)' : 'var(--text-secondary)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {tab === 'followups' ? `Follow-ups (${followUps.length})` : tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {selectedTab === 'overview' && stats && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Status Breakdown
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              {Object.entries(stats.statusBreakdown).map(([status, count]) => (
                <div
                  key={status}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${getStatusColor(status as CanvassingStatus)}`,
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <div style={{ color: getStatusColor(status as CanvassingStatus) }}>
                    {getStatusIcon(status as CanvassingStatus)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: getStatusColor(status as CanvassingStatus) }}>
                      {count}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                      {status.replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedTab === 'followups' && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Addresses Needing Follow-up
            </h3>
            {followUps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                No follow-ups needed right now!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {followUps.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '12px',
                      padding: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {entry.address}
                        </div>
                        {entry.homeownerName && (
                          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            {entry.homeownerName}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          padding: '4px 12px',
                          background: getStatusColor(entry.status),
                          color: 'white',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 600
                        }}
                      >
                        {entry.status.replace(/_/g, ' ')}
                      </div>
                    </div>

                    {entry.notes && (
                      <div style={{
                        fontSize: '13px',
                        color: 'var(--text-tertiary)',
                        padding: '12px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '6px',
                        marginBottom: '12px'
                      }}>
                        {entry.notes}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {entry.phoneNumber && (
                        <>
                          <button
                            onClick={() => handleCallContact(entry.phoneNumber!)}
                            style={{
                              padding: '8px 14px',
                              background: 'var(--roof-red)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Phone className="w-4 h-4" />
                            Call
                          </button>
                          <button
                            onClick={() => handleTextContact(entry.phoneNumber!)}
                            style={{
                              padding: '8px 14px',
                              background: 'var(--bg-hover)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-default)',
                              borderRadius: '6px',
                              fontSize: '13px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <MessageCircle className="w-4 h-4" />
                            Text
                          </button>
                        </>
                      )}
                      {entry.followUpDate && (
                        <div style={{
                          padding: '8px 14px',
                          background: 'var(--bg-secondary)',
                          borderRadius: '6px',
                          fontSize: '13px',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <Calendar className="w-4 h-4" />
                          Follow up: {new Date(entry.followUpDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedTab === 'activity' && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Recent Activity
            </h3>
            {recentActivity.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                No recent activity in your area
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentActivity.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {entry.address}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                        {entry.contactedBy} • {formatDate(entry.contactDate || entry.createdAt)}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '4px 10px',
                        background: getStatusColor(entry.status),
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600
                      }}
                    >
                      {entry.status.replace(/_/g, ' ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedTab === 'sessions' && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Session History
            </h3>
            {sessions.filter(s => s.endTime).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                No completed sessions yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sessions.filter(s => s.endTime).map((session) => (
                  <div
                    key={session.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '12px',
                      padding: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {new Date(session.startTime).toLocaleDateString()}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                          <Clock className="w-3 h-3 inline mr-1" />
                          {formatDuration(session.startTime, session.endTime)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--roof-red)' }}>
                          {session.doorsKnocked}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Doors</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#3b82f6' }}>
                          {session.contacts}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Contacts</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#8b5cf6' }}>
                          {session.leads}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Leads</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>
                          {session.appointments}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Appts</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CanvassingPanel;
