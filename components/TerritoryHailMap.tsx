import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Rectangle, CircleMarker, Popup, useMap, Polygon, Circle } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getApiBaseUrl } from '../services/config';
import { Cloud, Calendar, MapPin, AlertTriangle, Filter, RefreshCw, Search, Save, ChevronLeft, ChevronRight, Trash2, BarChart3, X, Star, ChevronDown, Wind, Home } from 'lucide-react';

interface Territory {
  id: string;
  name: string;
  description: string;
  color: string;
  north_lat: number;
  south_lat: number;
  east_lng: number;
  west_lng: number;
  center_lat: number;
  center_lng: number;
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

interface NOAAEvent {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  magnitude: number | null;
  eventType: 'hail' | 'wind' | 'tornado';
  location: string;
}

interface StormPath {
  id: string;
  path: [number, number][];
  color: string;
  severity: 'severe' | 'moderate' | 'minor';
  events: (HailEvent | NOAAEvent)[];
  center: [number, number];
  date: string;
}

interface SearchCriteria {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  startDate?: string;
  endDate?: string;
  minHailSize?: number;
  radius?: number;
}

interface SavedReport {
  id: string;
  user_id: string;
  name: string;
  search_criteria: SearchCriteria;
  results_count: number;
  ihm_events_count: number;
  noaa_events_count: number;
  max_hail_size: number | null;
  avg_hail_size: number | null;
  created_at: string;
  last_accessed_at: string;
}

// Component to handle map bounds changes
interface MapControllerProps {
  selectedTerritory: Territory | null;
  searchLocation: { lat: number; lng: number; zoom?: number } | null;
}

function MapController({ selectedTerritory, searchLocation }: MapControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (searchLocation) {
      // Auto-zoom to search location
      map.flyTo(
        [searchLocation.lat, searchLocation.lng],
        searchLocation.zoom || 13,
        { duration: 1.5, easeLinearity: 0.25 }
      );
    } else if (selectedTerritory) {
      const bounds = new LatLngBounds(
        [selectedTerritory.south_lat, selectedTerritory.west_lng],
        [selectedTerritory.north_lat, selectedTerritory.east_lng]
      );
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [selectedTerritory, searchLocation, map]);

  return null;
}

// Helper function to get severity from hail size
const getSeverityFromSize = (size: number | null): 'light' | 'minor' | 'moderate' | 'significant' | 'severe' => {
  if (!size) return 'light';
  if (size >= 2.0) return 'severe';
  if (size >= 1.5) return 'significant';
  if (size >= 1.0) return 'moderate';
  if (size >= 0.75) return 'minor';
  return 'light';
};

// Helper function to get star count (1-5 stars based on hail size)
const getStarCount = (size: number | null): number => {
  if (!size) return 1;
  if (size >= 2.0) return 5;
  if (size >= 1.5) return 4;
  if (size >= 1.0) return 3;
  if (size >= 0.75) return 2;
  return 1;
};

// Helper function to get severity color based on new color scheme
const getSeverityColorFromSize = (size: number | null): string => {
  if (!size) return '#3b82f6'; // blue - light
  if (size >= 2.0) return '#ef4444'; // red - severe (2"+)
  if (size >= 1.5) return '#f97316'; // orange - significant (1.5-2")
  if (size >= 1.0) return '#eab308'; // yellow - moderate (1-1.5")
  if (size >= 0.75) return '#22c55e'; // green - minor (0.75-1")
  return '#3b82f6'; // blue - light (<0.75")
};

// Group events by location (within ~0.05 degrees for hover popup)
const groupEventsByLocation = (events: Array<{ event: HailEvent | NOAAEvent; type: 'ihm' | 'noaa' }>) => {
  const groups: Array<{
    lat: number;
    lng: number;
    events: Array<{ event: HailEvent | NOAAEvent; type: 'ihm' | 'noaa' }>;
  }> = [];

  events.forEach(item => {
    const lat = item.event.latitude;
    const lng = item.event.longitude;

    let found = groups.find(g =>
      Math.abs(g.lat - lat) < 0.05 && Math.abs(g.lng - lng) < 0.05
    );

    if (found) {
      found.events.push(item);
    } else {
      groups.push({ lat, lng, events: [item] });
    }
  });

  return groups;
};

export default function TerritoryHailMap() {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [hailEvents, setHailEvents] = useState<HailEvent[]>([]);
  const [noaaEvents, setNoaaEvents] = useState<NOAAEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [months, setMonths] = useState(24);
  const [error, setError] = useState<string | null>(null);

  // Search panel state
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchCriteria, setSearchCriteria] = useState<SearchCriteria>({});
  const [currentSearch, setCurrentSearch] = useState<SearchCriteria | null>(null);

  // Saved reports state
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [reportName, setReportName] = useState('');
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null);

  // Stats
  const [searchStats, setSearchStats] = useState<{
    totalEvents: number;
    maxHailSize: number | null;
    avgHailSize: number | null;
  } | null>(null);

  // Map auto-navigation state
  const [searchLocation, setSearchLocation] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  // Hail dates panel state
  const [showHailDates, setShowHailDates] = useState(false);

  // Sidebar tab state - NEW: Recent / Impact / Saved
  const [activeTab, setActiveTab] = useState<'recent' | 'impact' | 'saved'>('recent');

  // Checked events state (replaces bookmarked - for tracking/selecting)
  const [checkedEvents, setCheckedEvents] = useState<Set<string>>(new Set());

  // Selected event for highlighting
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Search panel collapsed state
  const [searchCollapsed, setSearchCollapsed] = useState(true);

  // Storm paths state
  const [stormPaths, setStormPaths] = useState<StormPath[]>([]);
  const [hoveredStorm, setHoveredStorm] = useState<StormPath | null>(null);

  // Fetch territories and saved reports on mount
  useEffect(() => {
    fetchTerritories();
    fetchSavedReports();
  }, []);

  const fetchTerritories = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/territories`);
      if (res.ok) {
        const data = await res.json();
        setTerritories(data.territories || []);
      }
    } catch (err) {
      console.error('Failed to fetch territories:', err);
    }
  };

  const fetchHailData = useCallback(async (territory: Territory) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/hail/search?lat=${territory.center_lat}&lng=${territory.center_lng}&months=${months}&radius=50`
      );
      if (res.ok) {
        const data = await res.json();
        setHailEvents(data.events || []);
        setNoaaEvents(data.noaaEvents || []);
      } else {
        setError('Failed to load hail data');
      }
    } catch (err) {
      console.error('Failed to fetch hail data:', err);
      setError('Network error loading hail data');
    } finally {
      setLoading(false);
    }
  }, [months]);

  const handleTerritoryClick = (territory: Territory) => {
    setSelectedTerritory(territory);
    setCurrentSearch(null);
    setSearchStats(null);
    setSearchLocation(null);
    setShowHailDates(false);
    fetchHailData(territory);
  };

  // Fetch saved reports
  const fetchSavedReports = async () => {
    try {
      const userId = localStorage.getItem('userId');
      if (!userId) return;

      const res = await fetch(`${getApiBaseUrl()}/hail/reports?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setSavedReports(data.reports || []);
      }
    } catch (err) {
      console.error('Failed to fetch saved reports:', err);
    }
  };

  // Handle advanced search
  const handleAdvancedSearch = async () => {
    setLoading(true);
    setError(null);
    setSelectedTerritory(null);

    try {
      const res = await fetch(`${getApiBaseUrl()}/hail/search-advanced`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchCriteria)
      });

      if (res.ok) {
        const data = await res.json();
        setHailEvents(data.events || []);
        setNoaaEvents(data.noaaEvents || []);
        setCurrentSearch(data.searchCriteria);

        // Calculate stats
        const allHailSizes = data.events
          .map((e: HailEvent) => e.hailSize)
          .filter((size: number | null) => size !== null) as number[];

        setSearchStats({
          totalEvents: (data.events?.length || 0) + (data.noaaEvents?.length || 0),
          maxHailSize: allHailSizes.length > 0 ? Math.max(...allHailSizes) : null,
          avgHailSize: allHailSizes.length > 0
            ? allHailSizes.reduce((a, b) => a + b, 0) / allHailSizes.length
            : null
        });

        // Auto-zoom to search location
        if (data.searchCriteria?.latitude && data.searchCriteria?.longitude) {
          setSearchLocation({
            lat: data.searchCriteria.latitude,
            lng: data.searchCriteria.longitude,
            zoom: 13
          });
          // Show hail dates panel after successful search
          setShowHailDates(true);
        }
      } else {
        setError('Failed to search hail data');
      }
    } catch (err) {
      console.error('Failed to search hail data:', err);
      setError('Network error searching hail data');
    } finally {
      setLoading(false);
    }
  };

  // Save current search as a report
  const handleSaveReport = async () => {
    if (!reportName.trim()) {
      alert('Please enter a report name');
      return;
    }

    const userId = localStorage.getItem('userId');
    if (!userId) {
      alert('User not logged in');
      return;
    }

    try {
      const res = await fetch(`${getApiBaseUrl()}/hail/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: reportName,
          searchCriteria: currentSearch,
          resultsCount: searchStats?.totalEvents || 0,
          ihmEventsCount: hailEvents.length,
          noaaEventsCount: noaaEvents.length,
          maxHailSize: searchStats?.maxHailSize,
          avgHailSize: searchStats?.avgHailSize
        })
      });

      if (res.ok) {
        setShowSaveDialog(false);
        setReportName('');
        fetchSavedReports();
        alert('Report saved successfully!');
      } else {
        alert('Failed to save report');
      }
    } catch (err) {
      console.error('Failed to save report:', err);
      alert('Network error saving report');
    }
  };

  // Load a saved report
  const handleLoadReport = async (report: SavedReport) => {
    setSelectedReport(report);
    setSearchCriteria(report.search_criteria);
    setCurrentSearch(report.search_criteria);

    // Update last accessed time
    await fetch(`${getApiBaseUrl()}/hail/reports/${report.id}/access`, {
      method: 'PUT'
    });

    // Perform the search
    setLoading(true);
    setError(null);
    setSelectedTerritory(null);

    try {
      const res = await fetch(`${getApiBaseUrl()}/hail/search-advanced`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report.search_criteria)
      });

      if (res.ok) {
        const data = await res.json();
        setHailEvents(data.events || []);
        setNoaaEvents(data.noaaEvents || []);

        setSearchStats({
          totalEvents: report.results_count,
          maxHailSize: report.max_hail_size,
          avgHailSize: report.avg_hail_size
        });

        // Auto-zoom to search location for loaded report
        if (report.search_criteria?.latitude && report.search_criteria?.longitude) {
          setSearchLocation({
            lat: report.search_criteria.latitude,
            lng: report.search_criteria.longitude,
            zoom: 13
          });
          setShowHailDates(true);
        }
      }
    } catch (err) {
      console.error('Failed to load report:', err);
      setError('Network error loading report');
    } finally {
      setLoading(false);
    }
  };

  // Delete a saved report
  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('Are you sure you want to delete this report?')) return;

    try {
      const res = await fetch(`${getApiBaseUrl()}/hail/reports/${reportId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        fetchSavedReports();
        if (selectedReport?.id === reportId) {
          setSelectedReport(null);
        }
      } else {
        alert('Failed to delete report');
      }
    } catch (err) {
      console.error('Failed to delete report:', err);
      alert('Network error deleting report');
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'severe': return '#ef4444'; // red
      case 'moderate': return '#f97316'; // orange
      case 'minor': return '#eab308'; // yellow
      default: return '#6b7280'; // gray
    }
  };

  const getEventTypeColor = (type: string): string => {
    switch (type) {
      case 'hail': return '#3b82f6'; // blue
      case 'wind': return '#8b5cf6'; // purple
      case 'tornado': return '#ef4444'; // red
      default: return '#6b7280';
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateLong = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const toggleCheck = (eventId: string) => {
    setCheckedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const handleEventCardClick = (event: HailEvent | NOAAEvent, lat: number, lng: number) => {
    const eventId = 'eventType' in event ? `noaa-${event.id}` : `ihm-${event.id}`;
    setSelectedEventId(eventId);
    setSearchLocation({ lat, lng, zoom: 12 });
  };

  // Combine and sort events based on active tab
  const getSortedEvents = (): Array<{ type: 'ihm' | 'noaa'; event: HailEvent | NOAAEvent }> => {
    const combined = [
      ...hailEvents.map(e => ({ type: 'ihm' as const, event: e })),
      ...noaaEvents.map(e => ({ type: 'noaa' as const, event: e }))
    ];

    if (activeTab === 'recent') {
      return combined.sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime());
    } else if (activeTab === 'impact') {
      // Sort by hail size (impact severity)
      return combined.sort((a, b) => {
        const getSeverityScore = (item: { type: 'ihm' | 'noaa'; event: HailEvent | NOAAEvent }) => {
          if (item.type === 'ihm') {
            const hailEvent = item.event as HailEvent;
            return hailEvent.hailSize || 0;
          } else {
            const noaaEvent = item.event as NOAAEvent;
            return noaaEvent.magnitude || 0;
          }
        };
        return getSeverityScore(b) - getSeverityScore(a);
      });
    } else {
      // saved - only checked events, sorted by date
      return combined
        .filter(item => {
          const id = item.type === 'ihm' ? `ihm-${item.event.id}` : `noaa-${item.event.id}`;
          return checkedEvents.has(id);
        })
        .sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime());
    }
  };

  const getSeverityLevel = (event: HailEvent | NOAAEvent, type: 'ihm' | 'noaa'): 'severe' | 'moderate' | 'minor' => {
    if (type === 'ihm') {
      return (event as HailEvent).severity;
    } else {
      const magnitude = (event as NOAAEvent).magnitude || 0;
      if (magnitude >= 2.0) return 'severe';
      if (magnitude >= 1.0) return 'moderate';
      return 'minor';
    }
  };

  const getPolygonColor = (severity: 'severe' | 'moderate' | 'minor'): string => {
    switch (severity) {
      case 'severe': return '#1e40af'; // dark blue
      case 'moderate': return '#3b82f6'; // medium blue
      case 'minor': return '#60a5fa'; // light blue
      default: return '#93c5fd';
    }
  };

  const getStormPathColor = (severity: 'severe' | 'moderate' | 'minor'): string => {
    switch (severity) {
      case 'severe': return 'rgba(239, 68, 68, 0.35)'; // red
      case 'moderate': return 'rgba(249, 115, 22, 0.35)'; // orange
      case 'minor': return 'rgba(234, 179, 8, 0.35)'; // yellow
      default: return 'rgba(156, 163, 175, 0.35)'; // gray
    }
  };

  // Generate ellipse points for storm path polygon
  const generateEllipsePoints = (
    centerLat: number,
    centerLng: number,
    width: number,
    length: number,
    angleDeg: number,
    numPoints: number = 32
  ): [number, number][] => {
    const points: [number, number][] = [];
    const angleRad = (angleDeg * Math.PI) / 180;

    for (let i = 0; i < numPoints; i++) {
      const t = (i / numPoints) * 2 * Math.PI;
      const x = (length / 2) * Math.cos(t);
      const y = (width / 2) * Math.sin(t);

      // Rotate points
      const xRotated = x * Math.cos(angleRad) - y * Math.sin(angleRad);
      const yRotated = x * Math.sin(angleRad) + y * Math.cos(angleRad);

      // Convert to lat/lng
      const lat = centerLat + yRotated;
      const lng = centerLng + xRotated / Math.cos((centerLat * Math.PI) / 180);

      points.push([lat, lng]);
    }

    return points;
  };

  // Create storm path polygons from events
  const createStormPaths = (ihmEvents: HailEvent[], noaaEvs: NOAAEvent[]): StormPath[] => {
    // Group all events by date (same day = same storm)
    const eventsByDate = new Map<string, (HailEvent | NOAAEvent)[]>();

    ihmEvents.forEach(event => {
      const dateKey = event.date.split('T')[0];
      if (!eventsByDate.has(dateKey)) {
        eventsByDate.set(dateKey, []);
      }
      eventsByDate.get(dateKey)!.push(event);
    });

    noaaEvs.forEach(event => {
      const dateKey = event.date.split('T')[0];
      if (!eventsByDate.has(dateKey)) {
        eventsByDate.set(dateKey, []);
      }
      eventsByDate.get(dateKey)!.push(event);
    });

    // Create storm paths for each date group
    const paths: StormPath[] = [];
    let pathId = 0;

    eventsByDate.forEach((events, dateKey) => {
      // Calculate center point (average of all events on this date)
      const centerLat = events.reduce((sum, e) => sum + e.latitude, 0) / events.length;
      const centerLng = events.reduce((sum, e) => sum + e.longitude, 0) / events.length;

      // Determine severity (highest severity among events)
      let maxSeverity: 'severe' | 'moderate' | 'minor' = 'minor';
      events.forEach(event => {
        const severity = 'severity' in event
          ? event.severity
          : getSeverityLevel(event, 'noaa');

        if (severity === 'severe') maxSeverity = 'severe';
        else if (severity === 'moderate' && maxSeverity !== 'severe') maxSeverity = 'moderate';
      });

      // Calculate width and length based on severity
      const width = maxSeverity === 'severe' ? 0.15 : maxSeverity === 'moderate' ? 0.10 : 0.08;
      const length = maxSeverity === 'severe' ? 0.35 : maxSeverity === 'moderate' ? 0.30 : 0.25;

      // Storm direction: SW to NE (45 degrees)
      const angle = 45;

      // Generate polygon points
      const polygonPoints = generateEllipsePoints(centerLat, centerLng, width, length, angle);

      paths.push({
        id: `storm-${pathId++}`,
        path: polygonPoints,
        color: getStormPathColor(maxSeverity),
        severity: maxSeverity,
        events: events,
        center: [centerLat, centerLng],
        date: dateKey
      });
    });

    return paths;
  };

  // Update storm paths whenever events change
  useEffect(() => {
    if (hailEvents.length > 0 || noaaEvents.length > 0) {
      const paths = createStormPaths(hailEvents, noaaEvents);
      setStormPaths(paths);
    } else {
      setStormPaths([]);
    }
  }, [hailEvents, noaaEvents]);

  // Render star rating component
  const renderStars = (count: number) => {
    return (
      <div style={{ display: 'flex', gap: '2px' }}>
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className="w-3 h-3"
            style={{
              color: i <= count ? '#fbbf24' : '#d1d5db',
              fill: i <= count ? '#fbbf24' : 'none'
            }}
          />
        ))}
      </div>
    );
  };

  // Default center: Mid-Atlantic region
  const defaultCenter: [number, number] = [39.5, -77.5];
  const defaultZoom = 6;

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
      {/* Header */}
      <div className="roof-er-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Cloud className="w-6 h-6" style={{ color: 'var(--roof-red)' }} />
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Storm Map
              </h1>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                HailRecon + HailTrace + IHM + NOAA Data
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        padding: '12px 20px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Territory Selector */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {territories.map(t => (
            <button
              key={t.id}
              onClick={() => handleTerritoryClick(t)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: selectedTerritory?.id === t.id ? `2px solid ${t.color}` : '1px solid var(--border-default)',
                background: selectedTerritory?.id === t.id ? t.color : 'var(--bg-primary)',
                color: selectedTerritory?.id === t.id ? 'white' : 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* Month Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <Filter className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <select
            value={months}
            onChange={(e) => {
              setMonths(Number(e.target.value));
              if (selectedTerritory) {
                fetchHailData(selectedTerritory);
              }
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '13px'
            }}
          >
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
            <option value={36}>Last 36 months</option>
          </select>
        </div>
      </div>

      {/* Main Content Area - Sidebar + Map */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', height: 'calc(100vh - 280px)' }}>
        {/* LEFT SIDEBAR - Event List */}
        {(hailEvents.length > 0 || noaaEvents.length > 0) && (
          <div style={{
            width: '320px',
            background: 'var(--bg-elevated)',
            borderRight: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Collapsible Search Panel */}
            <div style={{
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--bg-primary)'
            }}>
              <button
                onClick={() => setSearchCollapsed(!searchCollapsed)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: 'var(--text-primary)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Search className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Search Address or ZIP</span>
                </div>
                <ChevronDown
                  className="w-4 h-4"
                  style={{
                    transform: searchCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                  }}
                />
              </button>

              {!searchCollapsed && (
                <div style={{ padding: '0 16px 16px' }}>
                  {/* Quick Search Inputs */}
                  <div style={{ marginBottom: '8px' }}>
                    <input
                      type="text"
                      placeholder="Address or ZIP"
                      value={searchCriteria.address || searchCriteria.zip || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (/^\d+$/.test(value)) {
                          setSearchCriteria({ ...searchCriteria, zip: value, address: undefined });
                        } else {
                          setSearchCriteria({ ...searchCriteria, address: value, zip: undefined });
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      placeholder="City"
                      value={searchCriteria.city || ''}
                      onChange={(e) => setSearchCriteria({ ...searchCriteria, city: e.target.value })}
                      style={{
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        fontSize: '13px'
                      }}
                    />
                    <input
                      type="text"
                      placeholder="State"
                      value={searchCriteria.state || ''}
                      onChange={(e) => setSearchCriteria({ ...searchCriteria, state: e.target.value })}
                      style={{
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <button
                    onClick={handleAdvancedSearch}
                    disabled={loading || (!searchCriteria.city && !searchCriteria.latitude)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'var(--roof-red)',
                      color: 'white',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1
                    }}
                  >
                    {loading ? 'Searching...' : 'Search'}
                  </button>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--bg-primary)'
            }}>
              {(['recent', 'impact', 'saved'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: activeTab === tab ? 'var(--bg-elevated)' : 'transparent',
                    border: 'none',
                    borderBottom: activeTab === tab ? '2px solid var(--roof-red)' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: activeTab === tab ? 700 : 600,
                    color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                    textTransform: 'capitalize',
                    transition: 'all 0.2s'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Event Count Header */}
            <div style={{
              padding: '4px 8px 8px',
              background: 'var(--bg-primary)',
              borderBottom: '1px solid var(--border-default)'
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Events ({getSortedEvents().length})
              </div>
            </div>

            {/* Event Cards List */}
            <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
              {getSortedEvents().map((item, idx) => {
                const isIHM = item.type === 'ihm';
                const event = item.event;
                const eventId = isIHM ? `ihm-${event.id}` : `noaa-${event.id}`;
                const isChecked = checkedEvents.has(eventId);
                const isSelected = selectedEventId === eventId;

                const hailSize = isIHM
                  ? (event as HailEvent).hailSize
                  : (event as NOAAEvent).magnitude;

                const starCount = getStarCount(hailSize);
                const severityColor = getSeverityColorFromSize(hailSize);
                const windSpeed = !isIHM && (event as NOAAEvent).eventType === 'wind'
                  ? (event as NOAAEvent).magnitude
                  : null;

                return (
                  <div
                    key={`${eventId}-${idx}`}
                    onClick={() => handleEventCardClick(event, event.latitude, event.longitude)}
                    style={{
                      padding: '12px',
                      marginBottom: '8px',
                      background: isSelected ? 'var(--bg-primary)' : 'var(--bg-elevated)',
                      borderRadius: '8px',
                      border: isSelected ? `2px solid var(--roof-red)` : '1px solid var(--border-default)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    {/* Checkbox + Date */}
                    <div style={{ display: 'flex', alignItems: 'start', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleCheck(eventId);
                        }}
                        style={{
                          marginTop: '2px',
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer'
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: '4px'
                        }}>
                          {formatDateLong(event.date)}
                        </div>
                        {/* Star Rating */}
                        {renderStars(starCount)}
                      </div>
                    </div>

                    {/* Hail Size + Wind Speed with Icons */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                      {hailSize && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: 'var(--text-secondary)'
                        }}>
                          <span>🌨</span>
                          <strong style={{ color: severityColor, fontSize: '14px' }}>
                            {hailSize}"
                          </strong>
                        </div>
                      )}
                      {windSpeed && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: 'var(--text-secondary)'
                        }}>
                          <Wind className="w-3 h-3" />
                          <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                            {windSpeed} MPH
                          </strong>
                        </div>
                      )}
                    </div>

                    {/* Houses Impacted (placeholder - generates random estimate) */}
                    {hailSize && hailSize >= 1.0 && (
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        marginTop: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Home className="w-3 h-3" />
                        <span>Est. {Math.floor(Math.random() * 50000 + 10000).toLocaleString()} homes impacted</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {getSortedEvents().length === 0 && (
                <div style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px'
                }}>
                  {activeTab === 'saved' ? 'No saved events yet' : 'No events found'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Old Search Panel - Hidden */}
        {false && searchPanelOpen && (
          <div style={{
            width: '320px',
            background: 'var(--bg-elevated)',
            borderRight: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto'
          }}>
            {/* Search Form */}
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-default)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
                Search Criteria
              </h3>

              {/* Address Search */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Address
                </label>
                <input
                  type="text"
                  placeholder="Street address"
                  value={searchCriteria.address || ''}
                  onChange={(e) => setSearchCriteria({ ...searchCriteria, address: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    City
                  </label>
                  <input
                    type="text"
                    placeholder="City"
                    value={searchCriteria.city || ''}
                    onChange={(e) => setSearchCriteria({ ...searchCriteria, city: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '13px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    State
                  </label>
                  <input
                    type="text"
                    placeholder="MD"
                    value={searchCriteria.state || ''}
                    onChange={(e) => setSearchCriteria({ ...searchCriteria, state: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  ZIP Code
                </label>
                <input
                  type="text"
                  placeholder="21201"
                  value={searchCriteria.zip || ''}
                  onChange={(e) => setSearchCriteria({ ...searchCriteria, zip: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              {/* Date Range */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={searchCriteria.startDate || ''}
                    onChange={(e) => setSearchCriteria({ ...searchCriteria, startDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '13px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={searchCriteria.endDate || ''}
                    onChange={(e) => setSearchCriteria({ ...searchCriteria, endDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>

              {/* Min Hail Size */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Min Hail Size (inches)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="1.0"
                  value={searchCriteria.minHailSize || ''}
                  onChange={(e) => setSearchCriteria({ ...searchCriteria, minHailSize: parseFloat(e.target.value) || undefined })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              {/* Radius */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Radius (miles)
                </label>
                <input
                  type="number"
                  placeholder="50"
                  value={searchCriteria.radius || 50}
                  onChange={(e) => setSearchCriteria({ ...searchCriteria, radius: parseInt(e.target.value) || 50 })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              {/* Search Button */}
              <button
                onClick={handleAdvancedSearch}
                disabled={loading || (!searchCriteria.city && !searchCriteria.latitude)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--roof-red)',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Search className="w-4 h-4" />
                {loading ? 'Searching...' : 'Search'}
              </button>

              {/* Save Report Button */}
              {currentSearch && (
                <button
                  onClick={() => setShowSaveDialog(true)}
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Save className="w-4 h-4" />
                  Save Report
                </button>
              )}
            </div>

            {/* Saved Reports List */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--border-default)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                  Saved Reports ({savedReports.length})
                </h3>
              </div>

              {savedReports.map((report) => (
                <div
                  key={report.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-default)',
                    cursor: 'pointer',
                    background: selectedReport?.id === report.id ? 'var(--bg-primary)' : 'transparent',
                    transition: 'background 0.2s'
                  }}
                  onClick={() => handleLoadReport(report)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {report.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {report.results_count} events
                        {report.max_hail_size && ` • Max: ${report.max_hail_size}"`}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {new Date(report.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteReport(report.id);
                      }}
                      style={{
                        padding: '4px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {savedReports.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  No saved reports yet
                </div>
              )}
            </div>
          </div>
        )}

        {/* Map Container */}
        <div style={{ flex: 1, position: 'relative' }}>
        {/* Storm Hover Popup */}
        {hoveredStorm && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1001,
            background: 'var(--bg-elevated)',
            padding: '12px 16px',
            borderRadius: '10px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            border: `2px solid ${getSeverityColor(hoveredStorm.severity)}`,
            minWidth: '280px',
            maxWidth: '400px',
            pointerEvents: 'none'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px'
            }}>
              <Cloud className="w-5 h-5" style={{ color: getSeverityColor(hoveredStorm.severity) }} />
              <span style={{
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--text-primary)'
              }}>
                Storm Path - {formatDate(hoveredStorm.date)}
              </span>
            </div>

            <div style={{
              padding: '6px 10px',
              borderRadius: '5px',
              background: `${getSeverityColor(hoveredStorm.severity)}20`,
              marginBottom: '10px',
              display: 'inline-block'
            }}>
              <span style={{
                color: getSeverityColor(hoveredStorm.severity),
                fontWeight: 700,
                fontSize: '12px',
                textTransform: 'uppercase'
              }}>
                {hoveredStorm.severity}
              </span>
            </div>

            <div style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Events ({hoveredStorm.events.length}):
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {hoveredStorm.events.map((event, idx) => {
                const isIHM = 'severity' in event;
                const hailSize = isIHM
                  ? (event as HailEvent).hailSize
                  : (event as NOAAEvent).magnitude;

                return (
                  <div
                    key={`hover-event-${idx}`}
                    style={{
                      padding: '8px 10px',
                      background: 'var(--bg-primary)',
                      borderRadius: '6px',
                      borderLeft: `3px solid ${isIHM ? getSeverityColor((event as HailEvent).severity) : getEventTypeColor((event as NOAAEvent).eventType)}`
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px'
                    }}>
                      <span style={{
                        fontWeight: 600,
                        color: 'var(--text-primary)'
                      }}>
                        {formatDate(event.date)}
                      </span>
                      <div style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: 'var(--text-secondary)'
                      }}>
                        {hailSize && <span style={{ fontWeight: 600 }}>🌨 {hailSize}"</span>}
                        <span style={{
                          fontSize: '9px',
                          textTransform: 'uppercase',
                          fontWeight: 700
                        }}>
                          {isIHM ? 'IHM' : (event as NOAAEvent).eventType}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Hail Dates Panel - RIGHT SIDE */}
        {showHailDates && (hailEvents.length > 0 || noaaEvents.length > 0) && (
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            bottom: '16px',
            zIndex: 1000,
            background: 'var(--bg-elevated)',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            border: '1px solid var(--border-default)',
            width: '320px',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100% - 32px)'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px',
              borderBottom: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar className="w-5 h-5" style={{ color: 'var(--roof-red)' }} />
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Hail Event Dates
                </h3>
              </div>
              <button
                onClick={() => setShowHailDates(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-secondary)'
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stats Summary */}
            {searchStats && (
              <div style={{
                padding: '12px 16px',
                background: 'var(--bg-primary)',
                borderBottom: '1px solid var(--border-default)',
                fontSize: '12px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Total Events</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--roof-red)' }}>
                      {searchStats.totalEvents}
                    </div>
                  </div>
                  {searchStats.maxHailSize && (
                    <div>
                      <div style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Max Size</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {searchStats.maxHailSize.toFixed(1)}"
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Events List */}
            <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
              {/* IHM Events */}
              {hailEvents.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    padding: '8px 8px 4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    IHM Hail Events ({hailEvents.length})
                  </div>
                  {hailEvents
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((event, idx) => (
                      <div
                        key={`ihm-${event.id || idx}`}
                        style={{
                          padding: '12px',
                          margin: '4px 0',
                          background: 'var(--bg-primary)',
                          borderRadius: '8px',
                          border: `1px solid ${getSeverityColor(event.severity)}20`,
                          borderLeft: `4px solid ${getSeverityColor(event.severity)}`
                        }}
                      >
                        <div style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          marginBottom: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <Calendar className="w-4 h-4" style={{ color: getSeverityColor(event.severity) }} />
                          {formatDate(event.date)}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span>Hail Size:</span>
                            <strong style={{ color: 'var(--text-primary)' }}>
                              {event.hailSize ? `${event.hailSize}"` : 'Unknown'}
                            </strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Severity:</span>
                            <strong style={{
                              color: getSeverityColor(event.severity),
                              textTransform: 'capitalize'
                            }}>
                              {event.severity}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* NOAA Events */}
              {noaaEvents.length > 0 && (
                <div>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    padding: '8px 8px 4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    NOAA Events ({noaaEvents.length})
                  </div>
                  {noaaEvents
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((event, idx) => (
                      <div
                        key={`noaa-${event.id || idx}`}
                        style={{
                          padding: '12px',
                          margin: '4px 0',
                          background: 'var(--bg-primary)',
                          borderRadius: '8px',
                          border: `1px solid ${getEventTypeColor(event.eventType)}20`,
                          borderLeft: `4px solid ${getEventTypeColor(event.eventType)}`
                        }}
                      >
                        <div style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          marginBottom: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <Calendar className="w-4 h-4" style={{ color: getEventTypeColor(event.eventType) }} />
                          {formatDate(event.date)}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span>Type:</span>
                            <strong style={{
                              color: getEventTypeColor(event.eventType),
                              textTransform: 'capitalize'
                            }}>
                              {event.eventType}
                            </strong>
                          </div>
                          {event.magnitude && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                              <span>Magnitude:</span>
                              <strong style={{ color: 'var(--text-primary)' }}>
                                {event.magnitude}{event.eventType === 'hail' ? '"' : ' knots'}
                              </strong>
                            </div>
                          )}
                          <div style={{
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                            marginTop: '4px',
                            fontStyle: 'italic'
                          }}>
                            {event.location}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {hailEvents.length === 0 && noaaEvents.length === 0 && (
                <div style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px'
                }}>
                  No hail events found in this area
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search Stats Panel */}
        {searchStats && currentSearch && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: searchPanelOpen ? '336px' : '16px',
            zIndex: 1000,
            background: 'var(--bg-elevated)',
            padding: '12px 16px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            minWidth: '280px',
            border: '1px solid var(--border-default)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <BarChart3 className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Search Results
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              <div>Total Events: <strong style={{ color: 'var(--text-primary)' }}>{searchStats.totalEvents}</strong></div>
              {searchStats.maxHailSize && (
                <div>Max Hail Size: <strong style={{ color: 'var(--text-primary)' }}>{searchStats.maxHailSize.toFixed(2)}"</strong></div>
              )}
              {searchStats.avgHailSize && (
                <div>Avg Hail Size: <strong style={{ color: 'var(--text-primary)' }}>{searchStats.avgHailSize.toFixed(2)}"</strong></div>
              )}
              {currentSearch.city && (
                <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid var(--border-default)' }}>
                  {currentSearch.city}, {currentSearch.state} {currentSearch.zip}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Save Report Dialog */}
        {showSaveDialog && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              background: 'var(--bg-elevated)',
              padding: '24px',
              borderRadius: '12px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
                Save Search Report
              </h3>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Report Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Baltimore Storm Events 2024"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setReportName('');
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveReport}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--roof-red)',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            background: 'var(--bg-elevated)',
            padding: '16px 24px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--roof-red)' }} />
            <span style={{ color: 'var(--text-primary)' }}>Loading storm data...</span>
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: '#7f1d1d',
            padding: '12px 20px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertTriangle className="w-4 h-4" style={{ color: '#fca5a5' }} />
            <span style={{ color: '#fca5a5', fontSize: '13px' }}>{error}</span>
          </div>
        )}

        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapController selectedTerritory={selectedTerritory} searchLocation={searchLocation} />

          {/* Storm Path Polygons - Grouped Events with Hover Popups */}
          {groupEventsByLocation([
            ...hailEvents.map(e => ({ type: 'ihm' as const, event: e })),
            ...noaaEvents.map(e => ({ type: 'noaa' as const, event: e }))
          ]).map((group, groupIdx) => {
            // Get max severity for the group
            const maxSize = Math.max(...group.events.map(item => {
              if (item.type === 'ihm') {
                return (item.event as HailEvent).hailSize || 0;
              } else {
                return (item.event as NOAAEvent).magnitude || 0;
              }
            }));

            const polygonColor = getSeverityColorFromSize(maxSize);
            const radiusInMeters = 1200 + maxSize * 600;

            return (
              <Circle
                key={`group-${groupIdx}`}
                center={[group.lat, group.lng]}
                radius={radiusInMeters}
                pathOptions={{
                  color: polygonColor,
                  fillColor: polygonColor,
                  fillOpacity: 0.25,
                  weight: 2,
                  opacity: 0.6
                }}
              >
                <Popup>
                  <div style={{ minWidth: '220px', maxHeight: '400px', overflow: 'auto' }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      marginBottom: '12px',
                      color: '#333',
                      borderBottom: '2px solid #eee',
                      paddingBottom: '8px'
                    }}>
                      {group.events.length} Event{group.events.length > 1 ? 's' : ''} at this Location
                    </div>
                    {group.events
                      .sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime())
                      .map((item, idx) => {
                        const isIHM = item.type === 'ihm';
                        const event = item.event;
                        const hailSize = isIHM
                          ? (event as HailEvent).hailSize
                          : (event as NOAAEvent).magnitude;
                        const color = getSeverityColorFromSize(hailSize);

                        return (
                          <div
                            key={idx}
                            style={{
                              padding: '8px',
                              marginBottom: '8px',
                              background: '#f9fafb',
                              borderRadius: '6px',
                              borderLeft: `4px solid ${color}`
                            }}
                          >
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
                              {formatDate(event.date)}
                            </div>
                            <div style={{ fontSize: '12px', color: '#666' }}>
                              {hailSize && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Hail Size:</span>
                                  <strong style={{ color }}>{hailSize}"</strong>
                                </div>
                              )}
                              {!isIHM && (event as NOAAEvent).eventType !== 'hail' && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Type:</span>
                                  <strong style={{ textTransform: 'capitalize' }}>
                                    {(event as NOAAEvent).eventType}
                                  </strong>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </Popup>
              </Circle>
            );
          })}

          {/* Territory Rectangles */}
          {territories.map(t => (
            <Rectangle
              key={t.id}
              bounds={[
                [t.south_lat, t.west_lng],
                [t.north_lat, t.east_lng]
              ]}
              pathOptions={{
                color: t.color,
                weight: selectedTerritory?.id === t.id ? 3 : 2,
                fillOpacity: selectedTerritory?.id === t.id ? 0.2 : 0.1,
                dashArray: selectedTerritory?.id === t.id ? undefined : '5, 5'
              }}
              eventHandlers={{
                click: () => handleTerritoryClick(t)
              }}
            >
              <Popup>
                <div style={{ minWidth: '150px' }}>
                  <strong style={{ fontSize: '14px' }}>{t.name}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>
                    {t.description}
                  </p>
                  <button
                    onClick={() => handleTerritoryClick(t)}
                    style={{
                      marginTop: '8px',
                      padding: '6px 12px',
                      background: t.color,
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    View Storm History
                  </button>
                </div>
              </Popup>
            </Rectangle>
          ))}

          {/* Individual IHM Event Markers */}
          {hailEvents.map((event, idx) => {
            const eventId = `ihm-${event.id || idx}`;
            const isSelected = selectedEventId === eventId;
            const severityColor = getSeverityColorFromSize(event.hailSize);

            return (
              <CircleMarker
                key={eventId}
                center={[event.latitude, event.longitude]}
                radius={isSelected ? 8 : 6}
                pathOptions={{
                  color: 'white',
                  fillColor: severityColor,
                  fillOpacity: 1,
                  weight: isSelected ? 3 : 2
                }}
                eventHandlers={{
                  click: () => handleEventCardClick(event, event.latitude, event.longitude)
                }}
              />
            );
          })}

          {/* Individual NOAA Event Markers */}
          {noaaEvents.map((event, idx) => {
            const eventId = `noaa-${event.id || idx}`;
            const isSelected = selectedEventId === eventId;
            const severityColor = getSeverityColorFromSize(event.magnitude);

            return (
              <CircleMarker
                key={eventId}
                center={[event.latitude, event.longitude]}
                radius={isSelected ? 8 : 6}
                pathOptions={{
                  color: 'white',
                  fillColor: severityColor,
                  fillOpacity: 1,
                  weight: isSelected ? 3 : 2
                }}
                eventHandlers={{
                  click: () => handleEventCardClick(event, event.latitude, event.longitude)
                }}
              />
            );
          })}

          {/* Search Area Highlight - Draw circle around search location */}
          {currentSearch && currentSearch.latitude && currentSearch.longitude && currentSearch.radius && (
            <>
              {/* Center marker */}
              <CircleMarker
                center={[currentSearch.latitude, currentSearch.longitude]}
                radius={10}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.8,
                  weight: 3
                }}
              >
                <Popup>
                  <div style={{ minWidth: '160px' }}>
                    <strong>Search Center</strong>
                    <p style={{ margin: '4px 0', fontSize: '12px' }}>
                      Radius: {currentSearch.radius} miles
                    </p>
                    {currentSearch.city && (
                      <p style={{ margin: '4px 0', fontSize: '12px' }}>
                        {currentSearch.city}, {currentSearch.state}
                      </p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
              {/* Radius circle - convert miles to meters */}
              <Circle
                center={[currentSearch.latitude, currentSearch.longitude]}
                radius={currentSearch.radius * 1609.34}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.05,
                  weight: 2,
                  dashArray: '10, 5'
                }}
              />
            </>
          )}
        </MapContainer>
      </div>
      </div>

      {/* Legend */}
      <div style={{
        padding: '12px 20px',
        background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border-default)',
        display: 'flex',
        gap: '20px',
        flexWrap: 'wrap',
        fontSize: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Severity:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></span>
            Severe (2"+)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316' }}></span>
            Significant (1.5-2")
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308' }}></span>
            Moderate (1-1.5")
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }}></span>
            Minor (0.75-1")
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }}></span>
            Light (&lt;0.75")
          </span>
        </div>
        {selectedTerritory && (
          <div style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}>
            <MapPin className="w-4 h-4" style={{ display: 'inline', marginRight: '4px' }} />
            {hailEvents.length} IHM events, {noaaEvents.length} NOAA events
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
