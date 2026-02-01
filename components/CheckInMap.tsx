/**
 * CheckInMap - Map view showing team check-ins and hail events
 * Displays active team check-ins as markers with hail event circles
 */

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Clock, Cloud, Calendar, User } from 'lucide-react';
import { getApiBaseUrl } from '../services/config';
import { authService } from '../services/authService';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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

interface HailEvent {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  hailSize: number | null;
  severity: 'minor' | 'moderate' | 'severe';
  source: string;
}

interface CheckInMapProps {
  checkIns: CheckIn[];
}

// Custom marker icon for check-ins
const createCheckInIcon = (isCurrentUser: boolean) => {
  const color = isCurrentUser ? '#dc2626' : '#22c55e';
  const svg = `
    <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="16" cy="16" r="6" fill="#fff"/>
    </svg>
  `;

  return L.divIcon({
    html: svg,
    className: 'custom-marker-icon',
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -42]
  });
};

// Map bounds controller
function MapBoundsController({ checkIns }: { checkIns: CheckIn[] }) {
  const map = useMap();

  useEffect(() => {
    const validCheckIns = checkIns.filter(c => c.location_lat && c.location_lng);

    if (validCheckIns.length > 0) {
      const bounds = L.latLngBounds(
        validCheckIns.map(c => [c.location_lat!, c.location_lng!])
      );

      // Add some padding
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    } else {
      // Default to US center if no check-ins
      map.setView([39.8283, -98.5795], 4);
    }
  }, [checkIns, map]);

  return null;
}

const CheckInMap: React.FC<CheckInMapProps> = ({ checkIns }) => {
  const [hailEvents, setHailEvents] = useState<HailEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHailEvents, setShowHailEvents] = useState(true);

  const currentUser = authService.getCurrentUser();
  const validCheckIns = checkIns.filter(c => c.location_lat && c.location_lng);

  // Fetch hail events near check-ins
  useEffect(() => {
    const fetchHailEvents = async () => {
      if (validCheckIns.length === 0) return;

      setLoading(true);
      try {
        // Get bounding box from all check-ins
        const lats = validCheckIns.map(c => c.location_lat!);
        const lngs = validCheckIns.map(c => c.location_lng!);
        const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

        const response = await fetch(
          `${getApiBaseUrl()}/api/hail/search?lat=${centerLat}&lng=${centerLng}&radius=50&months=6`,
          {
            headers: {
              'Authorization': `Bearer ${currentUser?.token}`
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          setHailEvents(data.events || []);
        }
      } catch (err) {
        console.error('Error fetching hail events:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHailEvents();
  }, [validCheckIns, currentUser]);

  // Format time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Calculate duration
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

  // Get hail event color and radius
  const getHailCircle = (event: HailEvent) => {
    let color = '#3b82f6'; // blue
    let radius = 500; // meters

    if (event.hailSize) {
      if (event.hailSize >= 2.0) {
        color = '#ef4444'; // red
        radius = 2000;
      } else if (event.hailSize >= 1.5) {
        color = '#f97316'; // orange
        radius = 1500;
      } else if (event.hailSize >= 1.0) {
        color = '#eab308'; // yellow
        radius = 1000;
      } else if (event.hailSize >= 0.75) {
        color = '#22c55e'; // green
        radius = 750;
      }
    }

    return { color, radius };
  };

  // Format hail date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Default center (US)
  const defaultCenter: [number, number] = [39.8283, -98.5795];
  const defaultZoom = 4;

  return (
    <div style={{ height: '600px', width: '100%', position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Controls */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        right: '1rem',
        zIndex: 1000,
        background: 'rgba(10, 10, 10, 0.9)',
        padding: '0.75rem',
        borderRadius: '8px',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--border-color)'
      }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          cursor: 'pointer',
          fontSize: '0.875rem',
          color: 'var(--text-primary)'
        }}>
          <input
            type="checkbox"
            checked={showHailEvents}
            onChange={(e) => setShowHailEvents(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <Cloud style={{ width: '16px', height: '16px' }} />
          Show Hail Events ({hailEvents.length})
        </label>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          zIndex: 1000,
          background: 'rgba(10, 10, 10, 0.9)',
          padding: '0.5rem 0.75rem',
          borderRadius: '8px',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          fontSize: '0.875rem'
        }}>
          Loading hail data...
        </div>
      )}

      {/* Map */}
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBoundsController checkIns={validCheckIns} />

        {/* Check-in Markers */}
        {validCheckIns.map(checkIn => (
          <Marker
            key={checkIn.id}
            position={[checkIn.location_lat!, checkIn.location_lng!]}
            icon={createCheckInIcon(checkIn.user_id === currentUser?.id)}
          >
            <Popup>
              <div style={{ minWidth: '200px', padding: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <User style={{ width: '16px', height: '16px', color: 'var(--roof-red)' }} />
                  <strong style={{ fontSize: '0.875rem' }}>
                    {checkIn.user_name}
                    {checkIn.user_id === currentUser?.id && ' (You)'}
                  </strong>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                    <Clock style={{ width: '12px', height: '12px' }} />
                    <span>Checked in at {formatTime(checkIn.checkin_time)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                    <Clock style={{ width: '12px', height: '12px' }} />
                    <span>Duration: {calculateDuration(checkIn.checkin_time)}</span>
                  </div>
                  {checkIn.location_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <MapPin style={{ width: '12px', height: '12px' }} />
                      <span>{checkIn.location_name}</span>
                    </div>
                  )}
                </div>

                {checkIn.notes && (
                  <div style={{
                    padding: '0.5rem',
                    background: '#f3f4f6',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    color: '#666',
                    fontStyle: 'italic',
                    marginTop: '0.5rem'
                  }}>
                    {checkIn.notes}
                  </div>
                )}

                {/* Stats if available */}
                {(checkIn.doors_knocked || checkIn.contacts_made || checkIn.leads_generated || checkIn.appointments_set) && (
                  <div style={{
                    marginTop: '0.5rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid #e5e7eb',
                    fontSize: '0.75rem'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>Stats:</div>
                    {checkIn.doors_knocked !== null && <div>Doors: {checkIn.doors_knocked}</div>}
                    {checkIn.contacts_made !== null && <div>Contacts: {checkIn.contacts_made}</div>}
                    {checkIn.leads_generated !== null && <div>Leads: {checkIn.leads_generated}</div>}
                    {checkIn.appointments_set !== null && <div>Appointments: {checkIn.appointments_set}</div>}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Hail Event Circles */}
        {showHailEvents && hailEvents.map(event => {
          const { color, radius } = getHailCircle(event);
          return (
            <Circle
              key={event.id}
              center={[event.latitude, event.longitude]}
              radius={radius}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 0.15,
                weight: 2,
                opacity: 0.5
              }}
            >
              <Popup>
                <div style={{ minWidth: '180px', padding: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <Cloud style={{ width: '16px', height: '16px', color: color }} />
                    <strong style={{ fontSize: '0.875rem' }}>Hail Event</strong>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#666' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                      <Calendar style={{ width: '12px', height: '12px' }} />
                      <span>{formatDate(event.date)}</span>
                    </div>
                    {event.hailSize && (
                      <div style={{ marginBottom: '0.25rem' }}>
                        <strong>Size:</strong> {event.hailSize.toFixed(2)}"
                      </div>
                    )}
                    <div style={{ marginBottom: '0.25rem' }}>
                      <strong>Severity:</strong> {event.severity}
                    </div>
                    <div style={{ marginBottom: '0.25rem' }}>
                      <strong>Source:</strong> {event.source}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <MapPin style={{ width: '12px', height: '12px' }} />
                      <span>{event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default CheckInMap;
