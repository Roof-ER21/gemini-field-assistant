import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Rectangle, CircleMarker, Popup, useMap, Polygon, Circle } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getApiBaseUrl } from '../services/config';
import { Cloud, Calendar, MapPin, AlertTriangle, Filter, RefreshCw, Search, Save, ChevronLeft, ChevronRight, Trash2, BarChart3, X } from 'lucide-react';

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

  // Default center: Mid-Atlantic region
  const defaultCenter: [number, number] = [39.5, -77.5];
  const defaultZoom = 6;

  return (
    <div className="roof-er-content-area" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
                Territory hail history from IHM & NOAA
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(hailEvents.length > 0 || noaaEvents.length > 0) && (
              <button
                onClick={() => setShowHailDates(!showHailDates)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  background: showHailDates ? 'var(--roof-red)' : 'var(--bg-primary)',
                  color: showHailDates ? 'white' : 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <Calendar className="w-4 h-4" />
                Event Dates
              </button>
            )}
            <button
              onClick={() => setSearchPanelOpen(!searchPanelOpen)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                background: searchPanelOpen ? 'var(--roof-red)' : 'var(--bg-primary)',
                color: searchPanelOpen ? 'white' : 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              <Search className="w-4 h-4" />
              Advanced Search
            </button>
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

      {/* Main Content Area - Map + Search Panel */}
      <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
        {/* Search Panel */}
        {searchPanelOpen && (
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

          {/* IHM Hail Event Markers */}
          {hailEvents.map((event, idx) => (
            <CircleMarker
              key={`ihm-${event.id || idx}`}
              center={[event.latitude, event.longitude]}
              radius={8 + (event.hailSize || 0) * 3}
              pathOptions={{
                color: getSeverityColor(event.severity),
                fillColor: getSeverityColor(event.severity),
                fillOpacity: 0.7,
                weight: 2
              }}
            >
              <Popup>
                <div style={{ minWidth: '160px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Calendar className="w-4 h-4" style={{ color: '#666' }} />
                    <strong>{formatDate(event.date)}</strong>
                  </div>
                  <div style={{ fontSize: '13px', color: '#333' }}>
                    <p style={{ margin: '4px 0' }}>
                      <span style={{ fontWeight: 600 }}>Hail Size:</span> {event.hailSize ? `${event.hailSize}"` : 'Unknown'}
                    </p>
                    <p style={{ margin: '4px 0' }}>
                      <span style={{ fontWeight: 600 }}>Severity:</span>{' '}
                      <span style={{
                        color: getSeverityColor(event.severity),
                        fontWeight: 600,
                        textTransform: 'capitalize'
                      }}>
                        {event.severity}
                      </span>
                    </p>
                    <p style={{ margin: '4px 0', fontSize: '11px', color: '#666' }}>
                      Source: {event.source}
                    </p>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* NOAA Event Markers */}
          {noaaEvents.map((event, idx) => (
            <CircleMarker
              key={`noaa-${event.id || idx}`}
              center={[event.latitude, event.longitude]}
              radius={6}
              pathOptions={{
                color: getEventTypeColor(event.eventType),
                fillColor: getEventTypeColor(event.eventType),
                fillOpacity: 0.6,
                weight: 2
              }}
            >
              <Popup>
                <div style={{ minWidth: '160px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Calendar className="w-4 h-4" style={{ color: '#666' }} />
                    <strong>{formatDate(event.date)}</strong>
                  </div>
                  <div style={{ fontSize: '13px', color: '#333' }}>
                    <p style={{ margin: '4px 0' }}>
                      <span style={{ fontWeight: 600 }}>Type:</span>{' '}
                      <span style={{ textTransform: 'capitalize' }}>{event.eventType}</span>
                    </p>
                    {event.magnitude && (
                      <p style={{ margin: '4px 0' }}>
                        <span style={{ fontWeight: 600 }}>Magnitude:</span> {event.magnitude}
                        {event.eventType === 'hail' ? '"' : ' knots'}
                      </p>
                    )}
                    <p style={{ margin: '4px 0', fontSize: '11px', color: '#666' }}>
                      {event.location}
                    </p>
                    <p style={{ margin: '4px 0', fontSize: '11px', color: '#0066cc' }}>
                      Source: NOAA (Official)
                    </p>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

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
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>IHM Severity:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></span>
            Severe
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316' }}></span>
            Moderate
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308' }}></span>
            Minor
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>NOAA:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }}></span>
            Hail
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#8b5cf6' }}></span>
            Wind
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></span>
            Tornado
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
  );
}
