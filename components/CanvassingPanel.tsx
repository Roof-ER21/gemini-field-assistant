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
  Home,
  Plus,
  X,
  Lightbulb,
  BarChart3,
  Building,
  Building2
} from 'lucide-react';
import {
  canvassingApi,
  CanvassingEntry,
  CanvassingSession,
  CanvassingStats,
  CanvassingStatus,
  NeighborhoodIntel,
  TeamIntelStats
} from '../services/canvassingApi';

const CanvassingPanel: React.FC = () => {
  const [stats, setStats] = useState<CanvassingStats | null>(null);
  const [activeSession, setActiveSession] = useState<CanvassingSession | null>(null);
  const [followUps, setFollowUps] = useState<CanvassingEntry[]>([]);
  const [recentActivity, setRecentActivity] = useState<CanvassingEntry[]>([]);
  const [sessions, setSessions] = useState<CanvassingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'followups' | 'activity' | 'sessions' | 'intel'>('overview');

  // Homeowner data entry modal state
  const [showHomeownerModal, setShowHomeownerModal] = useState(false);
  const [homeownerData, setHomeownerData] = useState({
    address: '',
    status: 'contacted' as CanvassingStatus,
    homeownerName: '',
    phoneNumber: '',
    email: '',
    notes: '',
    propertyNotes: '',
    bestContactTime: '',
    propertyType: 'residential' as 'residential' | 'commercial' | 'multi-family',
    roofType: '',
    roofAgeYears: undefined as number | undefined,
    autoMonitor: true
  });

  // Intel data
  const [neighborhoodIntel, setNeighborhoodIntel] = useState<NeighborhoodIntel | null>(null);
  const [teamIntel, setTeamIntel] = useState<TeamIntelStats | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);

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
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setCurrentLocation({ lat, lng });

          const nearby = await canvassingApi.getNearbyCanvassing({
            lat,
            lng,
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

  const fetchIntelData = async () => {
    if (!currentLocation) return;

    try {
      const [neighborhood, team] = await Promise.all([
        canvassingApi.getNeighborhoodIntel(currentLocation.lat, currentLocation.lng, 0.5),
        canvassingApi.getTeamIntelStats()
      ]);

      setNeighborhoodIntel(neighborhood);
      setTeamIntel(team);
    } catch (error) {
      console.error('Error fetching intel data:', error);
    }
  };

  useEffect(() => {
    if (selectedTab === 'intel' && currentLocation) {
      fetchIntelData();
    }
  }, [selectedTab, currentLocation]);

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

  const handleOpenHomeownerModal = () => {
    // Get current location for auto-filling address
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      });
    }
    setShowHomeownerModal(true);
  };

  const handleSaveHomeownerData = async () => {
    if (!homeownerData.address) {
      alert('Please enter an address');
      return;
    }

    const result = await canvassingApi.markAddress({
      ...homeownerData,
      latitude: currentLocation?.lat,
      longitude: currentLocation?.lng
    });

    if (result) {
      setShowHomeownerModal(false);
      // Reset form
      setHomeownerData({
        address: '',
        status: 'contacted',
        homeownerName: '',
        phoneNumber: '',
        email: '',
        notes: '',
        propertyNotes: '',
        bestContactTime: '',
        propertyType: 'residential',
        roofType: '',
        roofAgeYears: undefined,
        autoMonitor: true
      });
      // Refresh data
      fetchData();
    }
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
          <button
            onClick={handleOpenHomeownerModal}
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
            <Plus className="w-5 h-5" />
            Mark Address
          </button>
          {!activeSession && (
            <button
              onClick={handleStartSession}
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
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-default)', overflowX: 'auto' }}>
          {(['overview', 'followups', 'activity', 'sessions', 'intel'] as const).map((tab) => (
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
                textTransform: 'capitalize',
                whiteSpace: 'nowrap'
              }}
            >
              {tab === 'followups' ? `Follow-Ups (${followUps?.length || 0})` : tab === 'intel' ? 'Intel' : tab.charAt(0).toUpperCase() + tab.slice(1)}
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

        {selectedTab === 'intel' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Lightbulb className="w-5 h-5" style={{ color: 'var(--roof-red)' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                Neighborhood Intelligence
              </h3>
            </div>

            {!currentLocation ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                Enable location services to view neighborhood intel
              </div>
            ) : !neighborhoodIntel ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading intelligence data...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Neighborhood Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                  <div style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    padding: '14px'
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Total Properties</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {neighborhoodIntel.totalProperties}
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    padding: '14px'
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Canvassed</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#3b82f6' }}>
                      {neighborhoodIntel.canvassedProperties}
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    padding: '14px'
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Interested</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981' }}>
                      {neighborhoodIntel.interestedProperties}
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    padding: '14px'
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Active Leads</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--roof-red)' }}>
                      {neighborhoodIntel.leadsCount}
                    </div>
                  </div>
                </div>

                {/* Common Roof Types */}
                {neighborhoodIntel.commonRoofTypes.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Building2 className="w-4 h-4" />
                      Common Roof Types
                    </h4>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {neighborhoodIntel.commonRoofTypes.map((roof, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '6px',
                            padding: '8px 14px',
                            fontSize: '13px'
                          }}
                        >
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{roof.type}</span>
                          <span style={{ color: 'var(--text-tertiary)', marginLeft: '6px' }}>({roof.count})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Team Intel */}
                {teamIntel && (
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users className="w-4 h-4" />
                      Team Performance
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                      <div style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '8px',
                        padding: '12px'
                      }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Team Members</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {teamIntel.totalTeamMembers}
                        </div>
                      </div>
                      <div style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '8px',
                        padding: '12px'
                      }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Active Today</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>
                          {teamIntel.activeToday}
                        </div>
                      </div>
                    </div>
                    {teamIntel.topPerformers.length > 0 && (
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Top Performers</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {teamIntel.topPerformers.slice(0, 3).map((performer, idx) => (
                            <div
                              key={performer.userId}
                              style={{
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '6px',
                                padding: '10px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {idx + 1}. {performer.name}
                              </div>
                              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                <span>{performer.doorsKnocked} doors</span>
                                <span style={{ color: 'var(--roof-red)' }}>{performer.leads} leads</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Recent Activity Hotspots */}
                {neighborhoodIntel.hotspots.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Target className="w-4 h-4" />
                      Activity Hotspots
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {neighborhoodIntel.hotspots.slice(0, 5).map((hotspot, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            padding: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                            {hotspot.address}
                          </div>
                          <div
                            style={{
                              padding: '3px 8px',
                              background: getStatusColor(hotspot.status),
                              color: 'white',
                              borderRadius: '10px',
                              fontSize: '10px',
                              fontWeight: 600
                            }}
                          >
                            {hotspot.status.replace(/_/g, ' ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Homeowner Data Entry Modal */}
      {showHomeownerModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            boxSizing: 'border-box'
          }}
          onClick={() => setShowHomeownerModal(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
              border: '1px solid #333',
              borderRadius: '16px',
              maxWidth: '480px',
              width: 'calc(100% - 32px)',
              maxHeight: 'calc(100vh - 100px)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #262626',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Mark Address
              </h3>
              <button
                onClick={() => setShowHomeownerModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.7)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1 }}>
              {/* Address */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
                  Address *
                </label>
                <input
                  type="text"
                  value={homeownerData.address}
                  onChange={(e) => setHomeownerData({ ...homeownerData, address: e.target.value })}
                  placeholder="123 Main St"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box' as const
                  }}
                />
              </div>

              {/* Status */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
                  Status *
                </label>
                <select
                  value={homeownerData.status}
                  onChange={(e) => setHomeownerData({ ...homeownerData, status: e.target.value as CanvassingStatus })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box' as const
                  }}
                >
                  <option value="contacted">Contacted</option>
                  <option value="no_answer">No Answer</option>
                  <option value="not_interested">Not Interested</option>
                  <option value="interested">Interested</option>
                  <option value="lead">Lead</option>
                  <option value="appointment_set">Appointment Set</option>
                  <option value="return_visit">Return Visit</option>
                  <option value="sold">Sold</option>
                </select>
              </div>

              {/* Homeowner Name */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
                  Homeowner Name
                </label>
                <input
                  type="text"
                  value={homeownerData.homeownerName}
                  onChange={(e) => setHomeownerData({ ...homeownerData, homeownerName: e.target.value })}
                  placeholder="John Doe"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box' as const
                  }}
                />
              </div>

              {/* Phone Number */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={homeownerData.phoneNumber}
                  onChange={(e) => setHomeownerData({ ...homeownerData, phoneNumber: e.target.value })}
                  placeholder="(555) 123-4567"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box' as const
                  }}
                />
              </div>

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={homeownerData.email}
                  onChange={(e) => setHomeownerData({ ...homeownerData, email: e.target.value })}
                  placeholder="john@example.com"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box' as const
                  }}
                />
              </div>

              {/* Property Type */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
                  Property Type
                </label>
                <select
                  value={homeownerData.propertyType}
                  onChange={(e) => setHomeownerData({ ...homeownerData, propertyType: e.target.value as 'residential' | 'commercial' | 'multi-family' })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box' as const
                  }}
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="multi-family">Multi-Family</option>
                </select>
              </div>

              {/* Roof Type */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
                  Roof Type
                </label>
                <input
                  type="text"
                  value={homeownerData.roofType}
                  onChange={(e) => setHomeownerData({ ...homeownerData, roofType: e.target.value })}
                  placeholder="Asphalt Shingles"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box' as const
                  }}
                />
              </div>

              {/* Roof Age */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
                  Roof Age (Years)
                </label>
                <input
                  type="number"
                  value={homeownerData.roofAgeYears || ''}
                  onChange={(e) => setHomeownerData({ ...homeownerData, roofAgeYears: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="10"
                  min="0"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box' as const
                  }}
                />
              </div>

              {/* Best Contact Time */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
                  Best Contact Time
                </label>
                <input
                  type="text"
                  value={homeownerData.bestContactTime}
                  onChange={(e) => setHomeownerData({ ...homeownerData, bestContactTime: e.target.value })}
                  placeholder="Weekdays after 5pm"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box' as const
                  }}
                />
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
                  Notes
                </label>
                <textarea
                  value={homeownerData.notes}
                  onChange={(e) => setHomeownerData({ ...homeownerData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Auto Monitor Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="autoMonitor"
                  checked={homeownerData.autoMonitor}
                  onChange={(e) => setHomeownerData({ ...homeownerData, autoMonitor: e.target.checked })}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer'
                  }}
                />
                <label htmlFor="autoMonitor" style={{ fontSize: '14px', color: '#ffffff', cursor: 'pointer' }}>
                  Auto-monitor for storms
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={() => setShowHomeownerModal(false)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveHomeownerData}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)'
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CanvassingPanel;
