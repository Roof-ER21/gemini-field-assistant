/**
 * CheckInSection - Team check-in/check-out functionality
 * Shows active check-ins with stats tracking and location
 * Company-wide visibility for all team members
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MapPin,
  Clock,
  LogIn,
  LogOut,
  RefreshCw,
  Users,
  Activity,
  Map as MapIcon,
  List,
  Edit3,
  CheckCircle2
} from 'lucide-react';
import { authService } from '../services/authService';
import { getApiBaseUrl } from '../services/config';
import CheckInMap from './CheckInMap';
import { messagingService } from '../services/messagingService';

interface CheckIn {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  checkin_time: string;
  checkout_time: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_name: string | null;
  notes: string | null;
  doors_knocked: number | null;
  contacts_made: number | null;
  leads_generated: number | null;
  appointments_set: number | null;
}

interface CheckInStats {
  doors_knocked: string;
  contacts_made: string;
  leads_generated: string;
  appointments_set: string;
}

const CheckInSection: React.FC = () => {
  const [activeCheckIns, setActiveCheckIns] = useState<CheckIn[]>([]);
  const [myCheckIn, setMyCheckIn] = useState<CheckIn | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [notes, setNotes] = useState('');
  const [stats, setStats] = useState<CheckInStats>({
    doors_knocked: '0',
    contacts_made: '0',
    leads_generated: '0',
    appointments_set: '0'
  });
  const [duration, setDuration] = useState<string>('0m');
  const [error, setError] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentUser = authService.getCurrentUser();

  // Fetch active check-ins
  const fetchCheckIns = useCallback(async () => {
    if (!currentUser) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/checkins/active`, {
        headers: {
          'Authorization': `Bearer ${currentUser.token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch check-ins');

      const data = await response.json();
      setActiveCheckIns(data.checkIns || []);

      // Find current user's check-in
      const mine = data.checkIns?.find((c: CheckIn) => c.user_id === currentUser.id);
      setMyCheckIn(mine || null);

      if (mine) {
        setNotes(mine.notes || '');
        setStats({
          doors_knocked: (mine.doors_knocked || 0).toString(),
          contacts_made: (mine.contacts_made || 0).toString(),
          leads_generated: (mine.leads_generated || 0).toString(),
          appointments_set: (mine.appointments_set || 0).toString()
        });
      }
    } catch (err) {
      console.error('Error fetching check-ins:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchCheckIns();
    // Refresh every 30 seconds
    const interval = setInterval(fetchCheckIns, 30000);

    // Listen for WebSocket broadcast events
    const unsubscribe = messagingService.onBroadcastEvent((event) => {
      if (event.type === 'checkin_start') {
        // Add new check-in to the list
        const newCheckIn: CheckIn = {
          id: event.data.id,
          user_id: event.data.userId,
          user_name: event.data.userName,
          user_email: event.data.userEmail,
          checkin_time: event.data.checkInTime,
          checkout_time: event.data.checkOutTime || null,
          location_lat: event.data.checkInLat || null,
          location_lng: event.data.checkInLng || null,
          location_name: null,
          notes: event.data.notes || null,
          doors_knocked: event.data.doorsKnocked || null,
          contacts_made: event.data.contactsMade || null,
          leads_generated: event.data.leadsGenerated || null,
          appointments_set: event.data.appointmentsSet || null
        };

        setActiveCheckIns(prev => {
          // Check if already exists (avoid duplicates)
          if (prev.some(c => c.id === newCheckIn.id)) {
            return prev;
          }
          return [newCheckIn, ...prev];
        });

        // If it's current user's check-in, update myCheckIn
        if (currentUser && event.data.userId === currentUser.id) {
          setMyCheckIn(newCheckIn);
          setNotes(event.data.notes || '');
        }
      } else if (event.type === 'checkin_end') {
        // Remove check-in from the list
        setActiveCheckIns(prev => prev.filter(c => c.id !== event.data.id));

        // If it's current user's check-in, clear myCheckIn
        if (currentUser && event.data.userId === currentUser.id) {
          setMyCheckIn(null);
          setNotes('');
          setStats({
            doors_knocked: '0',
            contacts_made: '0',
            leads_generated: '0',
            appointments_set: '0'
          });
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [fetchCheckIns, currentUser]);

  // Update duration display
  useEffect(() => {
    if (myCheckIn && !myCheckIn.checkout_time) {
      const updateDuration = () => {
        const start = new Date(myCheckIn.checkin_time).getTime();
        const now = Date.now();
        const diffMs = now - start;
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;

        if (hours > 0) {
          setDuration(`${hours}h ${mins}m`);
        } else {
          setDuration(`${mins}m`);
        }
      };

      updateDuration();
      durationIntervalRef.current = setInterval(updateDuration, 60000); // Update every minute

      return () => {
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
        }
      };
    } else {
      setDuration('0m');
    }
  }, [myCheckIn]);

  // Check in
  const handleCheckIn = async () => {
    if (!currentUser) return;

    setCheckingIn(true);
    setError(null);

    try {
      // Get location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
          return;
        }

        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const { latitude, longitude } = position.coords;

      // Check in
      const response = await fetch(`${getApiBaseUrl()}/api/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.token}`
        },
        body: JSON.stringify({
          location_lat: latitude,
          location_lng: longitude,
          notes: ''
        })
      });

      if (!response.ok) throw new Error('Failed to check in');

      await fetchCheckIns();
    } catch (err: any) {
      console.error('Error checking in:', err);
      setError(err.message || 'Failed to check in. Please enable location services.');
    } finally {
      setCheckingIn(false);
    }
  };

  // Update notes
  const handleUpdateNotes = async () => {
    if (!currentUser || !myCheckIn) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/checkin/${myCheckIn.id}/notes`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.token}`
        },
        body: JSON.stringify({ notes })
      });

      if (!response.ok) throw new Error('Failed to update notes');

      setEditingNotes(false);
      await fetchCheckIns();
    } catch (err) {
      console.error('Error updating notes:', err);
    }
  };

  // Check out
  const handleCheckOut = async () => {
    if (!currentUser || !myCheckIn) return;

    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.token}`
        },
        body: JSON.stringify({
          doors_knocked: parseInt(stats.doors_knocked) || 0,
          contacts_made: parseInt(stats.contacts_made) || 0,
          leads_generated: parseInt(stats.leads_generated) || 0,
          appointments_set: parseInt(stats.appointments_set) || 0
        })
      });

      if (!response.ok) throw new Error('Failed to check out');

      // Reset state
      setMyCheckIn(null);
      setNotes('');
      setStats({
        doors_knocked: '0',
        contacts_made: '0',
        leads_generated: '0',
        appointments_set: '0'
      });

      await fetchCheckIns();
    } catch (err) {
      console.error('Error checking out:', err);
      setError('Failed to check out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Format time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Calculate duration for other users
  const calculateDuration = (checkinTime: string) => {
    const start = new Date(checkinTime).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <div style={{ padding: '1rem' }}>
      {/* View Toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity style={{ width: '20px', height: '20px', color: 'var(--roof-red)' }} />
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-primary)' }}>
            Team Check-Ins
          </h3>
          <span
            style={{
              background: 'rgba(220, 38, 38, 0.2)',
              color: 'var(--roof-red)',
              fontSize: '0.75rem',
              fontWeight: '600',
              padding: '2px 8px',
              borderRadius: '12px'
            }}
          >
            {activeCheckIns.length} active
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'list' ? 'var(--roof-red)' : 'var(--bg-secondary)',
              color: viewMode === 'list' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              minHeight: '44px'
            }}
          >
            <List style={{ width: '16px', height: '16px' }} />
            List
          </button>
          <button
            onClick={() => setViewMode('map')}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'map' ? 'var(--roof-red)' : 'var(--bg-secondary)',
              color: viewMode === 'map' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              minHeight: '44px'
            }}
          >
            <MapIcon style={{ width: '16px', height: '16px' }} />
            Map
          </button>
          <button
            onClick={fetchCheckIns}
            disabled={loading}
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              cursor: loading ? 'not-allowed' : 'pointer',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <RefreshCw
              style={{
                width: '18px',
                height: '18px',
                animation: loading ? 'spin 1s linear infinite' : 'none'
              }}
            />
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: '0.875rem',
            marginBottom: '1rem'
          }}
        >
          {error}
        </div>
      )}

      {viewMode === 'map' ? (
        <CheckInMap checkIns={activeCheckIns} />
      ) : (
        <>
          {/* My Check-In Status */}
          {!myCheckIn ? (
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: '12px',
                border: 'none',
                background: checkingIn
                  ? 'var(--bg-secondary)'
                  : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: 'white',
                fontSize: '1.125rem',
                fontWeight: '600',
                cursor: checkingIn ? 'not-allowed' : 'pointer',
                marginBottom: '1rem',
                minHeight: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
              }}
            >
              <LogIn style={{ width: '24px', height: '24px' }} />
              {checkingIn ? 'Checking in...' : 'Check In'}
            </button>
          ) : (
            <div
              style={{
                padding: '1rem',
                borderRadius: '12px',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                marginBottom: '1rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 style={{ width: '20px', height: '20px', color: '#22c55e' }} />
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '1rem' }}>
                    Checked In
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  <Clock style={{ width: '16px', height: '16px' }} />
                  <span>{duration}</span>
                </div>
              </div>

              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Started at {formatTime(myCheckIn.checkin_time)}
                {myCheckIn.location_lat && myCheckIn.location_lng && (
                  <span style={{ marginLeft: '0.5rem' }}>
                    • <MapPin style={{ width: '12px', height: '12px', display: 'inline', marginRight: '2px' }} />
                    {myCheckIn.location_lat.toFixed(4)}, {myCheckIn.location_lng.toFixed(4)}
                  </span>
                )}
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-primary)' }}>
                    Notes
                  </label>
                  {!editingNotes && (
                    <button
                      onClick={() => setEditingNotes(true)}
                      style={{
                        padding: '0.25rem',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <Edit3 style={{ width: '14px', height: '14px' }} />
                    </button>
                  )}
                </div>
                {editingNotes ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add notes about your work today..."
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.875rem',
                        resize: 'vertical',
                        minHeight: '60px'
                      }}
                    />
                    <button
                      onClick={handleUpdateNotes}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'var(--roof-red)',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div style={{
                    padding: '0.5rem',
                    borderRadius: '8px',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    fontStyle: notes ? 'normal' : 'italic'
                  }}>
                    {notes || 'No notes yet'}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {[
                  { label: 'Doors Knocked', key: 'doors_knocked' },
                  { label: 'Contacts', key: 'contacts_made' },
                  { label: 'Leads', key: 'leads_generated' },
                  { label: 'Appointments', key: 'appointments_set' }
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '0.25rem'
                    }}>
                      {label}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={stats[key as keyof CheckInStats]}
                      onChange={(e) => setStats({ ...stats, [key]: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Check Out Button */}
              <button
                onClick={handleCheckOut}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: loading
                    ? 'var(--bg-secondary)'
                    : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  minHeight: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                <LogOut style={{ width: '20px', height: '20px' }} />
                {loading ? 'Checking out...' : 'Check Out'}
              </button>
            </div>
          )}

          {/* Team Check-Ins List */}
          <div>
            <h4 style={{
              margin: '0 0 0.75rem 0',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Active Team Members ({activeCheckIns.filter(c => c.user_id !== currentUser?.id).length})
            </h4>

            {activeCheckIns.filter(c => c.user_id !== currentUser?.id).length === 0 ? (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '0.875rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px'
                }}
              >
                <Users style={{ width: '48px', height: '48px', margin: '0 auto 0.5rem', opacity: 0.5 }} />
                No other team members checked in
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {activeCheckIns
                  .filter(c => c.user_id !== currentUser?.id)
                  .map(checkIn => (
                    <div
                      key={checkIn.id}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '8px',
                        background: 'rgba(12, 12, 12, 0.35)',
                        border: '1px solid var(--glass-border)',
                        backdropFilter: 'blur(10px) saturate(120%)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontWeight: '600',
                              fontSize: '0.875rem'
                            }}
                          >
                            {checkIn.user_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                              {checkIn.user_name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {formatTime(checkIn.checkin_time)}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          <Clock style={{ width: '14px', height: '14px' }} />
                          <span>{calculateDuration(checkIn.checkin_time)}</span>
                        </div>
                      </div>

                      {checkIn.location_lat && checkIn.location_lng && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                          <MapPin style={{ width: '14px', height: '14px' }} />
                          <span>
                            {checkIn.location_name || `${checkIn.location_lat.toFixed(4)}, ${checkIn.location_lng.toFixed(4)}`}
                          </span>
                        </div>
                      )}

                      {checkIn.notes && (
                        <div
                          style={{
                            padding: '0.5rem',
                            borderRadius: '6px',
                            background: 'var(--bg-secondary)',
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                            fontStyle: 'italic'
                          }}
                        >
                          {checkIn.notes}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default CheckInSection;
