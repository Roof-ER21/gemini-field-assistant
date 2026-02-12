import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Rectangle, CircleMarker, Popup, useMap, Polygon, Circle } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getApiBaseUrl } from '../services/config';
import { Cloud, Calendar, MapPin, AlertTriangle, Filter, RefreshCw, Search, Save, ChevronLeft, ChevronRight, Trash2, BarChart3, X, Star, ChevronDown, Wind, Home, FileDown, Settings, User, Phone, Mail, Building2 } from 'lucide-react';
import NexradRadarLayer from './NexradRadarLayer';
import { downloadBlob } from '../services/pdfService';

interface Territory {
  id: string;
  name: string;
  description: string;
  color: string;
  northLat: number;
  southLat: number;
  eastLng: number;
  westLng: number;
  centerLat: number;
  centerLng: number;
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

interface HotZone {
  id: string;
  centerLat: number;
  centerLng: number;
  intensity: number;
  eventCount: number;
  avgHailSize: number | null;
  maxHailSize: number | null;
  lastEventDate: string;
  recommendation: string;
  events: Array<HailEvent | NOAAEvent>;
  radius: number;
  score?: number;
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

interface DamageScore {
  score: number;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  factors: any;
  summary: string;
  color: string;
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
      // Validate search location coordinates
      if (!searchLocation.lat || !searchLocation.lng ||
          isNaN(searchLocation.lat) || isNaN(searchLocation.lng)) {
        console.warn('Invalid search location coordinates:', searchLocation);
        return;
      }
      // Auto-zoom to search location
      map.flyTo(
        [searchLocation.lat, searchLocation.lng],
        searchLocation.zoom || 13,
        { duration: 1.5, easeLinearity: 0.25 }
      );
    } else if (selectedTerritory) {
      // Validate territory bounds
      if (!selectedTerritory.southLat || !selectedTerritory.northLat ||
          !selectedTerritory.westLng || !selectedTerritory.eastLng ||
          isNaN(selectedTerritory.southLat) || isNaN(selectedTerritory.northLat) ||
          isNaN(selectedTerritory.westLng) || isNaN(selectedTerritory.eastLng)) {
        console.warn('Invalid territory bounds:', selectedTerritory);
        return;
      }
      const bounds = new LatLngBounds(
        [selectedTerritory.southLat, selectedTerritory.westLng],
        [selectedTerritory.northLat, selectedTerritory.eastLng]
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
const groupEventsByLocation = (events: Array<{ event: HailEvent | NOAAEvent; type: 'ihm' | 'noaa' | 'hailtrace' }>) => {
  const groups: Array<{
    lat: number;
    lng: number;
    events: Array<{ event: HailEvent | NOAAEvent; type: 'ihm' | 'noaa' | 'hailtrace' }>;
  }> = [];

  events.forEach(item => {
    const lat = item.event.latitude;
    const lng = item.event.longitude;

    // Validate coordinates before grouping
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      console.warn('Skipping event with invalid coordinates:', item.event.id);
      return;
    }

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

interface TerritoryHailMapProps {
  isAdmin?: boolean;
}

export default function TerritoryHailMap({ isAdmin }: TerritoryHailMapProps) {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [hailEvents, setHailEvents] = useState<HailEvent[]>([]);
  const [noaaEvents, setNoaaEvents] = useState<NOAAEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [months, setMonths] = useState(24);
  const [error, setError] = useState<string | null>(null);

  // Search panel state
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

  // Damage Score
  const [damageScore, setDamageScore] = useState<DamageScore | null>(null);
  const [loadingDamageScore, setLoadingDamageScore] = useState(false);

  // Map auto-navigation state
  const [searchLocation, setSearchLocation] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  // Hail dates panel state
  const [showHailDates, setShowHailDates] = useState(false);

  // Sidebar tab state - NEW: Recent / Impact / Saved / Hot Zones
  const [activeTab, setActiveTab] = useState<'recent' | 'impact' | 'saved' | 'hotzones'>('recent');

  // Checked events state (replaces bookmarked - for tracking/selecting)
  const [checkedEvents, setCheckedEvents] = useState<Set<string>>(new Set());

  // Selected event for highlighting
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Search panel collapsed state
  const [searchCollapsed, setSearchCollapsed] = useState(true);

  // Storm paths state
  const [stormPaths, setStormPaths] = useState<StormPath[]>([]);
  const [hoveredStorm, setHoveredStorm] = useState<StormPath | null>(null);

  // Filter state
  const [eventTypeFilter, setEventTypeFilter] = useState<'all' | 'hail' | 'wind' | 'tornado'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'ihm' | 'noaa'>('all');

  // Hot Zones state
  const [showHotZones, setShowHotZones] = useState(false);
  const [hotZones, setHotZones] = useState<HotZone[]>([]);
  const [loadingHotZones, setLoadingHotZones] = useState(false);

  // PDF Report Options state
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [pdfOptions, setPdfOptions] = useState({
    includeRepInfo: false,
    repName: '',
    repPhone: '',
    repEmail: '',
    companyName: 'SA21 Storm Intelligence System'
  });
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfReportFilter, setPdfReportFilter] = useState<'all' | 'hail-only' | 'hail-wind' | 'ihm-only' | 'noaa-only'>('all');

  // NEXRAD radar visibility
  const [showNexrad, setShowNexrad] = useState(false);

  // Last updated timestamp
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filtered events based on event type and source filters
  const filteredHailEvents = useMemo(() => {
    // IHM events are always hail type
    if (sourceFilter === 'noaa') return [];
    if (eventTypeFilter === 'all' || eventTypeFilter === 'hail') {
      return hailEvents;
    }
    return [];
  }, [hailEvents, eventTypeFilter, sourceFilter]);

  const filteredNoaaEvents = useMemo(() => {
    if (sourceFilter === 'ihm') return [];
    if (eventTypeFilter === 'all') {
      return noaaEvents;
    }
    return noaaEvents.filter(e => e.eventType === eventTypeFilter);
  }, [noaaEvents, eventTypeFilter, sourceFilter]);

  // Get filtered events for PDF based on report filter
  const getFilteredEventsForPdf = () => {
    let pdfHailEvents = filteredHailEvents;
    let pdfNoaaEvents = filteredNoaaEvents;

    switch (pdfReportFilter) {
      case 'hail-only':
        pdfNoaaEvents = filteredNoaaEvents.filter(e => e.eventType === 'hail');
        break;
      case 'hail-wind':
        pdfNoaaEvents = filteredNoaaEvents.filter(e => e.eventType === 'hail' || e.eventType === 'wind');
        break;
      case 'ihm-only':
        pdfNoaaEvents = [];
        break;
      case 'noaa-only':
        pdfHailEvents = [];
        break;
      case 'all':
      default:
        // No filtering
        break;
    }

    return { pdfHailEvents, pdfNoaaEvents };
  };

  // Check if events contain HailTrace data
  const hasHailTraceData = useMemo(() => {
    return hailEvents.some(e => e.source && e.source.toLowerCase().includes('hailtrace'));
  }, [hailEvents]);

  // Fetch territories and saved reports on mount
  useEffect(() => {
    fetchTerritories();
    fetchSavedReports();
  }, []);

  const fetchTerritories = async () => {
    try {
      // Get user email from localStorage for auth header
      const authUser = localStorage.getItem('s21_auth_user');
      const userEmail = authUser ? JSON.parse(authUser).email : null;

      if (!userEmail) {
        console.error('No user email found for territories fetch');
        return;
      }

      const res = await fetch(`${getApiBaseUrl()}/territories`, {
        headers: {
          'x-user-email': userEmail
        }
      });

      if (res.ok) {
        const data = await res.json();
        setTerritories(data.territories || []);
      } else {
        console.error('Failed to fetch territories:', res.status, res.statusText);
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
        `${getApiBaseUrl()}/hail/search?lat=${territory.centerLat}&lng=${territory.centerLng}&months=${months}&radius=50`
      );
      if (res.ok) {
        const data = await res.json();
        setHailEvents(data.events || []);
        setNoaaEvents(data.noaaEvents || []);
        setLastUpdated(new Date());
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
    setDamageScore(null);
    setSearchLocation(null);
    setShowHailDates(false);
    fetchHailData(territory);

    // Fetch hot zones if enabled
    if (showHotZones) {
      fetchHotZones(territory);
    }
  };

  // Fetch hot zones for a territory
  const fetchHotZones = async (territory: Territory) => {
    setLoadingHotZones(true);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/hail/hot-zones?north=${territory.northLat}&south=${territory.southLat}&east=${territory.eastLng}&west=${territory.westLng}`
      );

      if (res.ok) {
        const data = await res.json();
        setHotZones(data.hotZones || []);
        console.log(`🔥 Loaded ${data.hotZones?.length || 0} hot zones`);
      } else {
        console.error('Failed to load hot zones:', res.status);
        setHotZones([]);
      }
    } catch (err) {
      console.error('Failed to fetch hot zones:', err);
      setHotZones([]);
    } finally {
      setLoadingHotZones(false);
    }
  };

  // Fetch hot zones for a search location
  const fetchHotZonesForLocation = async (lat: number, lng: number, radius: number = 50) => {
    setLoadingHotZones(true);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/hail/hot-zones?lat=${lat}&lng=${lng}&radius=${radius}`
      );

      if (res.ok) {
        const data = await res.json();
        setHotZones(data.hotZones || []);
        console.log(`🔥 Loaded ${data.hotZones?.length || 0} hot zones for location`);
      } else {
        console.error('Failed to load hot zones:', res.status);
        setHotZones([]);
      }
    } catch (err) {
      console.error('Failed to fetch hot zones:', err);
      setHotZones([]);
    } finally {
      setLoadingHotZones(false);
    }
  };

  // Toggle hot zones display
  const toggleHotZones = () => {
    const newState = !showHotZones;
    setShowHotZones(newState);

    if (newState) {
      if (currentSearch?.latitude && currentSearch?.longitude) {
        fetchHotZonesForLocation(currentSearch.latitude, currentSearch.longitude, currentSearch.radius || 50);
      } else if (selectedTerritory) {
        fetchHotZones(selectedTerritory);
      }
    } else {
      setHotZones([]);
    }
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

  // Calculate damage score
  const fetchDamageScore = async (lat: number, lng: number, address: string, events: HailEvent[], noaaEvs: NOAAEvent[]) => {
    setLoadingDamageScore(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/hail/damage-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          address,
          events,
          noaaEvents: noaaEvs
        })
      });

      if (res.ok) {
        const data = await res.json();
        setDamageScore(data);
      } else {
        console.error('Failed to calculate damage score:', res.status);
      }
    } catch (err) {
      console.error('Failed to calculate damage score:', err);
    } finally {
      setLoadingDamageScore(false);
    }
  };

  // Handle advanced search
  const handleAdvancedSearch = async () => {
    setLoading(true);
    setError(null);
    setSelectedTerritory(null);
    setDamageScore(null);

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
        setLastUpdated(new Date());

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

        // Calculate damage score
        if (data.searchCriteria?.latitude && data.searchCriteria?.longitude) {
          const address = data.searchCriteria.address ||
            `${data.searchCriteria.city || ''}${data.searchCriteria.city && data.searchCriteria.state ? ', ' : ''}${data.searchCriteria.state || ''}`;

          await fetchDamageScore(
            data.searchCriteria.latitude,
            data.searchCriteria.longitude,
            address,
            data.events || [],
            data.noaaEvents || []
          );
        }

        // Auto-zoom to search location
        if (data.searchCriteria?.latitude && data.searchCriteria?.longitude) {
          setSearchLocation({
            lat: data.searchCriteria.latitude,
            lng: data.searchCriteria.longitude,
            zoom: 13
          });
          // Show hail dates panel after successful search
          setShowHailDates(true);

          // Fetch hot zones if enabled
          if (showHotZones) {
            fetchHotZonesForLocation(
              data.searchCriteria.latitude,
              data.searchCriteria.longitude,
              data.searchCriteria.radius || 50
            );
          }
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
    setDamageScore(null);

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
        setLastUpdated(new Date());

        setSearchStats({
          totalEvents: report.results_count,
          maxHailSize: report.max_hail_size,
          avgHailSize: report.avg_hail_size
        });

        // Calculate damage score
        if (report.search_criteria?.latitude && report.search_criteria?.longitude) {
          const address = report.search_criteria.address ||
            `${report.search_criteria.city || ''}${report.search_criteria.city && report.search_criteria.state ? ', ' : ''}${report.search_criteria.state || ''}`;

          await fetchDamageScore(
            report.search_criteria.latitude,
            report.search_criteria.longitude,
            address,
            data.events || [],
            data.noaaEvents || []
          );
        }

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
    return date.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatDateLong = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTimestamp = (date: Date): string => {
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  // Generate PDF Report with options
  const handleGeneratePDF = async () => {
    if (!currentSearch || !searchStats) {
      alert('No search data available to generate report');
      return;
    }

    setGeneratingPdf(true);

    try {
      // Get filtered events based on report filter
      const { pdfHailEvents, pdfNoaaEvents } = getFilteredEventsForPdf();

      // Build address string
      const address = currentSearch.address ||
        `${currentSearch.city || ''}${currentSearch.city && currentSearch.state ? ', ' : ''}${currentSearch.state || ''}${currentSearch.zip ? ' ' + currentSearch.zip : ''}` ||
        `${currentSearch.latitude?.toFixed(6)}, ${currentSearch.longitude?.toFixed(6)}`;

      // Use server-side Curran-style PDF generation
      const response = await fetch(`${getApiBaseUrl()}/api/hail/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          city: currentSearch.city,
          state: currentSearch.state,
          lat: currentSearch.latitude,
          lng: currentSearch.longitude,
          radius: currentSearch.radius || 50,
          events: pdfHailEvents,
          noaaEvents: pdfNoaaEvents,
          damageScore: damageScore || { score: 0, riskLevel: 'Low', summary: 'No data', color: '#22c55e' },
          filter: pdfReportFilter,
          includeNexrad: true,
          includeMap: true,
          includeWarnings: true,
          ...pdfOptions
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const blob = await response.blob();
      const filename = `Storm_Report_${address.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      downloadBlob(blob, filename);

      console.log('✅ PDF Report generated successfully');
    } catch (error) {
      console.error('❌ Failed to generate PDF:', error);
      alert('Failed to generate PDF report. Please try again.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleEventCardClick = (event: HailEvent | NOAAEvent, lat: number, lng: number) => {
    const eventId = 'eventType' in event ? `noaa-${event.id}` : `ihm-${event.id}`;
    setSelectedEventId(eventId);
    setSearchLocation({ lat, lng, zoom: 12 });
  };

  // Get event source type (ihm, noaa, or hailtrace)
  const getEventSourceType = (event: HailEvent): 'ihm' | 'hailtrace' => {
    if (event.source && event.source.toLowerCase().includes('hailtrace')) {
      return 'hailtrace';
    }
    return 'ihm';
  };

  // Combine and sort events based on active tab
  const getSortedEvents = (): Array<{ type: 'ihm' | 'noaa' | 'hailtrace'; event: HailEvent | NOAAEvent }> => {
    const combined = [
      ...filteredHailEvents.map(e => ({ type: getEventSourceType(e) as 'ihm' | 'hailtrace', event: e })),
      ...filteredNoaaEvents.map(e => ({ type: 'noaa' as const, event: e }))
    ];

    if (activeTab === 'recent') {
      return combined.sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime());
    } else if (activeTab === 'impact') {
      // Sort by hail size (impact severity)
      return combined.sort((a, b) => {
        const getSeverityScore = (item: { type: 'ihm' | 'noaa' | 'hailtrace'; event: HailEvent | NOAAEvent }) => {
          if (item.type === 'ihm' || item.type === 'hailtrace') {
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
          const id = item.type === 'noaa' ? `noaa-${item.event.id}` : `ihm-${item.event.id}`;
          return checkedEvents.has(id);
        })
        .sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime());
    }
  };

  const getSeverityLevel = (event: HailEvent | NOAAEvent, type: 'ihm' | 'noaa' | 'hailtrace'): 'severe' | 'moderate' | 'minor' => {
    if (type === 'ihm' || type === 'hailtrace') {
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
      // Validate event coordinates before adding
      if (!event.latitude || !event.longitude || isNaN(event.latitude) || isNaN(event.longitude)) {
        console.warn('Skipping IHM event with invalid coordinates in storm path:', event.id);
        return;
      }
      const dateKey = event.date.split('T')[0];
      if (!eventsByDate.has(dateKey)) {
        eventsByDate.set(dateKey, []);
      }
      eventsByDate.get(dateKey)!.push(event);
    });

    noaaEvs.forEach(event => {
      // Validate event coordinates before adding
      if (!event.latitude || !event.longitude || isNaN(event.latitude) || isNaN(event.longitude)) {
        console.warn('Skipping NOAA event with invalid coordinates in storm path:', event.id);
        return;
      }
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
      // Skip if no valid events for this date
      if (events.length === 0) return;

      // Calculate center point (average of all events on this date)
      const centerLat = events.reduce((sum, e) => sum + e.latitude, 0) / events.length;
      const centerLng = events.reduce((sum, e) => sum + e.longitude, 0) / events.length;

      // Validate calculated center
      if (!centerLat || !centerLng || isNaN(centerLat) || isNaN(centerLng)) {
        console.warn('Skipping storm path with invalid center:', dateKey);
        return;
      }

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

  // Get marker color based on source type
  const getMarkerColorBySource = (sourceType: 'ihm' | 'noaa' | 'hailtrace'): string => {
    switch (sourceType) {
      case 'hailtrace': return '#10b981'; // green for HailTrace
      case 'ihm': return '#3b82f6'; // blue for IHM
      case 'noaa': return '#8b5cf6'; // purple for NOAA
      default: return '#6b7280';
    }
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
          {/* HailTrace Data Badge */}
          {hasHailTraceData && (
            <div style={{
              padding: '6px 12px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
            }}>
              HailTrace Data Available
            </div>
          )}
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

        {/* Source Filter (IHM vs NOAA) */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: 'auto' }}>
          {(['all', 'ihm', 'noaa'] as const).map(source => {
            const isActive = sourceFilter === source;
            const activeColor = source === 'ihm' ? 'var(--roof-blue)' : source === 'noaa' ? 'var(--roof-orange)' : 'var(--roof-red)';
            return (
              <button
                key={source}
                onClick={() => setSourceFilter(source)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: isActive ? `2px solid ${activeColor}` : '2px solid transparent',
                  background: isActive ? activeColor : 'var(--bg-elevated)',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                  boxShadow: isActive ? `0 0 8px ${activeColor}40` : 'none'
                }}
              >
                {source === 'all' ? 'All Sources' : source.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Event Type Filter */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {(['all', 'hail', 'wind', 'tornado'] as const).map(type => (
            <button
              key={type}
              onClick={() => setEventTypeFilter(type)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: eventTypeFilter === type ? '2px solid var(--roof-red)' : '2px solid transparent',
                background: eventTypeFilter === type ? 'var(--roof-red)' : 'var(--bg-elevated)',
                color: eventTypeFilter === type ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '600',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: eventTypeFilter === type ? '0 0 8px rgba(196, 30, 58, 0.3)' : 'none'
              }}
            >
              {type === 'wind' && <Wind className="w-3 h-3" />}
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        {/* Month Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setSearchCollapsed(!searchCollapsed)}
            title={searchCollapsed ? "Expand search" : "Collapse search"}
            style={{
              background: searchCollapsed ? 'var(--bg-elevated)' : 'var(--roof-red)',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              padding: '6px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s'
            }}
          >
            <Filter className="w-4 h-4" style={{ color: searchCollapsed ? 'var(--text-secondary)' : 'white' }} />
            <span style={{ fontSize: '12px', color: searchCollapsed ? 'var(--text-secondary)' : 'white' }}>
              Search
            </span>
          </button>

          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <option value={6}>6 months</option>
            <option value={12}>12 months</option>
            <option value={24}>24 months</option>
            <option value={36}>36 months</option>
          </select>

          {/* Hot Zones Toggle */}
          <button
            onClick={toggleHotZones}
            disabled={loadingHotZones}
            title="Show best canvassing areas based on storm activity"
            style={{
              background: showHotZones ? 'var(--roof-orange)' : 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: loadingHotZones ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
              opacity: loadingHotZones ? 0.6 : 1
            }}
          >
            <span style={{ fontSize: '16px' }}>🔥</span>
            <span style={{
              fontSize: '12px',
              fontWeight: 600,
              color: showHotZones ? 'white' : 'var(--text-primary)'
            }}>
              Hot Zones
            </span>
            {showHotZones && hotZones.length > 0 && (
              <span style={{
                fontSize: '11px',
                background: 'rgba(255,255,255,0.2)',
                padding: '2px 6px',
                borderRadius: '10px',
                fontWeight: 700
              }}>
                {hotZones.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setSearchCollapsed(!searchCollapsed)}
            style={{
              background: searchCollapsed ? 'var(--roof-red)' : 'var(--roof-red-dark)',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'white',
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            <Search className="w-4 h-4" />
            Advanced Search
          </button>
        </div>
      </div>

      {/* Search Panel Expanded */}
      {!searchCollapsed && (
        <div style={{
          padding: '16px 20px',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-default)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Address
              </label>
              <input
                type="text"
                placeholder="123 Main St"
                value={searchCriteria.address || ''}
                onChange={(e) => setSearchCriteria({ ...searchCriteria, address: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                City
              </label>
              <input
                type="text"
                placeholder="Baltimore"
                value={searchCriteria.city || ''}
                onChange={(e) => setSearchCriteria({ ...searchCriteria, city: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-elevated)',
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
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: '13px'
                }}
              />
            </div>

            <div>
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
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Radius (miles)
              </label>
              <input
                type="number"
                placeholder="50"
                value={searchCriteria.radius || ''}
                onChange={(e) => setSearchCriteria({ ...searchCriteria, radius: Number(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Min Hail Size (inches)
              </label>
              <input
                type="number"
                step="0.25"
                placeholder="1.0"
                value={searchCriteria.minHailSize || ''}
                onChange={(e) => setSearchCriteria({ ...searchCriteria, minHailSize: Number(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setSearchCollapsed(true)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdvancedSearch}
              disabled={loading}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--roof-red)',
                color: 'white',
                fontSize: '13px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ position: 'relative', height: 'calc(100vh - 200px)' }}>
        {/* Left Sidebar - Events List */}
        {showHailDates && (
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '320px',
            background: 'var(--bg-primary)',
            borderRight: '1px solid var(--border-default)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Sidebar Header */}
            <div style={{
              padding: '12px 16px',
              background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar className="w-5 h-5" style={{ color: 'var(--roof-red)' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Storm Events
                </span>
              </div>
              <button
                onClick={() => setShowHailDates(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable content: stats + events list */}
            <div style={{ flex: 1, overflow: 'auto' }}>
            {/* Stats Summary with Damage Score */}
            {searchStats && (
              <div style={{
                padding: '12px 16px',
                background: 'var(--bg-primary)',
                borderBottom: '1px solid var(--border-default)',
                fontSize: '12px'
              }}>
                {/* Damage Score Display */}
                {damageScore && (
                  <div style={{
                    marginBottom: '16px',
                    padding: '16px',
                    background: `linear-gradient(135deg, ${damageScore.color}15, ${damageScore.color}05)`,
                    borderRadius: '12px',
                    border: `2px solid ${damageScore.color}`,
                    textAlign: 'center'
                  }}>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '8px'
                    }}>
                      Damage Risk Score
                    </div>
                    <div style={{
                      fontSize: '48px',
                      fontWeight: 800,
                      color: damageScore.color,
                      lineHeight: 1,
                      marginBottom: '8px'
                    }}>
                      {damageScore.score}
                    </div>
                    <div style={{
                      display: 'inline-block',
                      padding: '6px 12px',
                      background: damageScore.color,
                      color: 'white',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '12px'
                    }}>
                      {damageScore.riskLevel} Risk
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      lineHeight: '1.5',
                      marginTop: '8px'
                    }}>
                      {damageScore.summary}
                    </div>
                  </div>
                )}

                {loadingDamageScore && (
                  <div style={{
                    marginBottom: '16px',
                    padding: '16px',
                    background: 'var(--bg-elevated)',
                    borderRadius: '12px',
                    textAlign: 'center'
                  }}>
                    <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--roof-red)', margin: '0 auto 8px' }} />
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Calculating damage score...
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
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

                {/* Last Updated Timestamp */}
                {lastUpdated && (
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--text-secondary)',
                    marginTop: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border-default)',
                    fontStyle: 'italic'
                  }}>
                    Last updated: {formatTimestamp(lastUpdated)}
                  </div>
                )}

                {/* PDF Report Section - Admin only */}
                {isAdmin && (
                  <>
                    {/* PDF Report Filter Dropdown */}
                    <div style={{ marginTop: '12px', marginBottom: '8px' }}>
                      <label style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        display: 'block',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Report Filter
                      </label>
                      <select
                        value={pdfReportFilter}
                        onChange={(e) => setPdfReportFilter(e.target.value as any)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-default)',
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <option value="all">All Events</option>
                        <option value="hail-only">Hail Only</option>
                        <option value="hail-wind">Hail + Wind</option>
                        <option value="ihm-only">IHM Only</option>
                        <option value="noaa-only">NOAA Only</option>
                      </select>
                    </div>

                    {/* Download PDF Buttons */}
                    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                      <button
                        onClick={handleGeneratePDF}
                        disabled={generatingPdf}
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          background: generatingPdf ? 'var(--bg-tertiary)' : 'var(--roof-red)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: generatingPdf ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'all 0.2s ease',
                          opacity: generatingPdf ? 0.6 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!generatingPdf) {
                            e.currentTarget.style.background = '#b91c1c';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.3)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!generatingPdf) {
                            e.currentTarget.style.background = 'var(--roof-red)';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }
                        }}
                      >
                        {generatingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                        {generatingPdf ? 'Generating...' : 'Download Report'}
                      </button>
                      <button
                        onClick={() => setShowPdfOptions(true)}
                        disabled={generatingPdf}
                        style={{
                          padding: '10px 12px',
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-default)',
                          borderRadius: '8px',
                          cursor: generatingPdf ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s ease',
                          opacity: generatingPdf ? 0.6 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!generatingPdf) {
                            e.currentTarget.style.background = 'var(--bg-tertiary)';
                            e.currentTarget.style.borderColor = 'var(--roof-red)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!generatingPdf) {
                            e.currentTarget.style.background = 'var(--bg-elevated)';
                            e.currentTarget.style.borderColor = 'var(--border-default)';
                          }
                        }}
                        title="PDF Options"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Events List */}
            <div style={{ padding: '8px' }}>
              {/* IHM Events */}
              {filteredHailEvents.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    padding: '8px 8px 4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    IHM Hail Events ({filteredHailEvents.length})
                  </div>
                  {filteredHailEvents
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((event, idx) => {
                      const eventId = `ihm-${event.id}`;
                      const isSelected = selectedEventId === eventId;
                      const sourceType = getEventSourceType(event);
                      const isHailTrace = sourceType === 'hailtrace';

                      return (
                      <div
                        key={`ihm-${event.id || idx}`}
                        onClick={() => {
                          setSelectedEventId(eventId);
                          setSearchLocation({ lat: event.latitude, lng: event.longitude, zoom: 14 });
                        }}
                        style={{
                          padding: '12px',
                          margin: '4px 0',
                          background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-primary)',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid var(--roof-red)' : `1px solid ${getSeverityColor(event.severity)}20`,
                          borderLeft: `4px solid ${isHailTrace ? '#10b981' : getSeverityColor(event.severity)}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          position: 'relative'
                        }}
                      >
                        {isHailTrace && (
                          <div style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            padding: '2px 6px',
                            background: '#10b981',
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '9px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            HailTrace
                          </div>
                        )}
                        <div style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          marginBottom: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <Calendar className="w-4 h-4" style={{ color: isHailTrace ? '#10b981' : getSeverityColor(event.severity) }} />
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
                    )})}
                </div>
              )}

              {/* NOAA Events */}
              {filteredNoaaEvents.length > 0 && (
                <div>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    padding: '8px 8px 4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    NOAA Events ({filteredNoaaEvents.length})
                  </div>
                  {filteredNoaaEvents
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((event, idx) => {
                      const eventId = `noaa-${event.id}`;
                      const isSelected = selectedEventId === eventId;
                      return (
                      <div
                        key={`noaa-${event.id || idx}`}
                        onClick={() => {
                          setSelectedEventId(eventId);
                          setSearchLocation({ lat: event.latitude, lng: event.longitude, zoom: 14 });
                        }}
                        style={{
                          padding: '12px',
                          margin: '4px 0',
                          background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-primary)',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid var(--roof-red)' : `1px solid ${getEventTypeColor(event.eventType)}20`,
                          borderLeft: `4px solid ${getEventTypeColor(event.eventType)}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
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
                    )})}
                </div>
              )}

              {filteredHailEvents.length === 0 && filteredNoaaEvents.length === 0 && (
                <div style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px'
                }}>
                  No events match the current filter
                </div>
              )}
            </div>
            </div>{/* end scrollable content wrapper */}
          </div>
        )}

        {/* PDF Options Modal - Admin only */}
        {isAdmin && showPdfOptions && (
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
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
                PDF Report Options
              </h3>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={pdfOptions.includeRepInfo}
                    onChange={(e) => setPdfOptions({ ...pdfOptions, includeRepInfo: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Include Representative Information
                  </span>
                </label>
              </div>

              {pdfOptions.includeRepInfo && (
                <div style={{ marginLeft: '24px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Representative Name
                    </label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={pdfOptions.repName}
                      onChange={(e) => setPdfOptions({ ...pdfOptions, repName: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
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
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={pdfOptions.repPhone}
                      onChange={(e) => setPdfOptions({ ...pdfOptions, repPhone: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
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
                      Email
                    </label>
                    <input
                      type="email"
                      placeholder="john@example.com"
                      value={pdfOptions.repEmail}
                      onChange={(e) => setPdfOptions({ ...pdfOptions, repEmail: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Company Name
                </label>
                <input
                  type="text"
                  placeholder="SA21 Storm Intelligence System"
                  value={pdfOptions.companyName}
                  onChange={(e) => setPdfOptions({ ...pdfOptions, companyName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
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
                  onClick={() => setShowPdfOptions(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowPdfOptions(false);
                    handleGeneratePDF();
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--roof-red)',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FileDown className="w-4 h-4" />
                  Generate PDF
                </button>
              </div>
            </div>
          </div>
        )}

        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapController selectedTerritory={selectedTerritory} searchLocation={searchLocation} />

          {/* NEXRAD Radar Overlay */}
          <NexradRadarLayer
            visible={showNexrad}
            onToggle={() => setShowNexrad(!showNexrad)}
            stormDate={
              hailEvents.length > 0 ? hailEvents[0].date :
              noaaEvents.length > 0 ? noaaEvents[0].date :
              undefined
            }
          />

          {/* Territory Rectangles */}
          {territories.map(t => (
            <Rectangle
              key={t.id}
              bounds={[
                [t.southLat, t.westLng],
                [t.northLat, t.eastLng]
              ]}
              pathOptions={{
                color: t.color,
                weight: selectedTerritory?.id === t.id ? 3 : 2,
                fillOpacity: selectedTerritory?.id === t.id ? 0.1 : 0.05
              }}
            >
              <Popup>
                <div style={{ padding: '8px' }}>
                  <strong style={{ color: t.color }}>{t.name}</strong>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>{t.description}</div>
                </div>
              </Popup>
            </Rectangle>
          ))}

          {/* Storm Path Polygons */}
          {stormPaths.map(path => (
            <Polygon
              key={path.id}
              positions={path.path}
              pathOptions={{
                color: path.color,
                fillColor: path.color,
                fillOpacity: hoveredStorm?.id === path.id ? 0.5 : 0.2,
                weight: 2,
                opacity: 0.8
              }}
              eventHandlers={{
                mouseover: () => setHoveredStorm(path),
                mouseout: () => setHoveredStorm(null)
              }}
            >
              <Popup>
                <div style={{ padding: '8px', minWidth: '200px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '14px' }}>
                    Storm Path - {formatDate(path.date)}
                  </div>
                  <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                    <strong>Severity:</strong> <span style={{ color: getSeverityColor(path.severity), textTransform: 'capitalize' }}>{path.severity}</span>
                  </div>
                  <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                    <strong>Events in path:</strong> {path.events.length}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Click events in the sidebar to view details
                  </div>
                </div>
              </Popup>
            </Polygon>
          ))}

          {/* Hot Zones - Best Canvassing Areas */}
          {showHotZones && hotZones.map((zone) => {
            // Determine color based on intensity/score
            let fillColor: string;
            let strokeColor: string;
            const score = zone.score || zone.intensity;

            if (score >= 80) {
              fillColor = 'rgba(220, 38, 38, 0.3)'; // red
              strokeColor = '#dc2626';
            } else if (score >= 60) {
              fillColor = 'rgba(249, 115, 22, 0.3)'; // orange
              strokeColor = '#f97316';
            } else if (score >= 40) {
              fillColor = 'rgba(234, 179, 8, 0.3)'; // yellow
              strokeColor = '#eab308';
            } else {
              fillColor = 'rgba(34, 197, 94, 0.3)'; // green
              strokeColor = '#22c55e';
            }

            return (
              <Circle
                key={zone.id}
                center={[zone.centerLat, zone.centerLng]}
                radius={zone.radius * 1609.34} // Convert miles to meters
                pathOptions={{
                  fillColor,
                  color: strokeColor,
                  weight: 2,
                  opacity: 0.8,
                  fillOpacity: 0.3
                }}
              >
                <Popup>
                  <div style={{ padding: '12px', minWidth: '250px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '12px',
                      fontSize: '16px',
                      fontWeight: 700
                    }}>
                      <span style={{ fontSize: '20px' }}>🔥</span>
                      Hot Zone
                      <span style={{
                        fontSize: '12px',
                        padding: '4px 8px',
                        background: strokeColor,
                        color: 'white',
                        borderRadius: '12px',
                        fontWeight: 700
                      }}>
                        Score: {score}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                      <div style={{ marginBottom: '6px' }}>
                        <strong>Events:</strong> {zone.eventCount}
                      </div>
                      {zone.maxHailSize && (
                        <div style={{ marginBottom: '6px' }}>
                          <strong>Max Hail:</strong> {zone.maxHailSize}"
                        </div>
                      )}
                      {zone.avgHailSize && (
                        <div style={{ marginBottom: '6px' }}>
                          <strong>Avg Hail:</strong> {zone.avgHailSize.toFixed(2)}"
                        </div>
                      )}
                      <div style={{ marginBottom: '6px' }}>
                        <strong>Last Event:</strong> {formatDate(zone.lastEventDate)}
                      </div>
                    </div>

                    <div style={{
                      padding: '10px',
                      background: 'rgba(220, 38, 38, 0.1)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      lineHeight: '1.5',
                      color: '#dc2626',
                      fontWeight: 600
                    }}>
                      <strong>Recommendation:</strong><br />
                      {zone.recommendation}
                    </div>
                  </div>
                </Popup>
              </Circle>
            );
          })}

          {/* Event Markers with source-specific colors */}
          {groupEventsByLocation([
            ...filteredHailEvents.map(e => ({ event: e, type: getEventSourceType(e) as 'ihm' | 'hailtrace' })),
            ...filteredNoaaEvents.map(e => ({ event: e, type: 'noaa' as const }))
          ]).map((group, idx) => {
            // Use the first event for color determination
            const firstItem = group.events[0];
            const markerColor = getMarkerColorBySource(firstItem.type);

            return (
              <CircleMarker
                key={`marker-${idx}`}
                center={[group.lat, group.lng]}
                radius={8}
                pathOptions={{
                  fillColor: markerColor,
                  color: '#fff',
                  weight: 2,
                  opacity: 1,
                  fillOpacity: 0.8
                }}
              >
                <Popup>
                  <div style={{ padding: '8px', maxWidth: '300px' }}>
                    {group.events.length === 1 ? (
                      // Single event
                      <div>
                        {firstItem.type === 'noaa' ? (
                          <>
                            <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '14px' }}>
                              {formatDate(firstItem.event.date)}
                            </div>
                            <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
                              <div><strong>Type:</strong> {(firstItem.event as NOAAEvent).eventType}</div>
                              {(firstItem.event as NOAAEvent).magnitude && (
                                <div><strong>Magnitude:</strong> {(firstItem.event as NOAAEvent).magnitude}</div>
                              )}
                              <div><strong>Location:</strong> {(firstItem.event as NOAAEvent).location}</div>
                              <div style={{ marginTop: '4px', fontSize: '11px', color: '#8b5cf6' }}>Source: NOAA</div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '14px' }}>
                              {formatDate(firstItem.event.date)}
                            </div>
                            <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
                              <div><strong>Hail Size:</strong> {(firstItem.event as HailEvent).hailSize}"</div>
                              <div><strong>Severity:</strong> {(firstItem.event as HailEvent).severity}</div>
                              <div style={{ marginTop: '4px', fontSize: '11px', color: firstItem.type === 'hailtrace' ? '#10b981' : '#3b82f6' }}>
                                Source: {firstItem.type === 'hailtrace' ? 'HailTrace' : 'IHM'}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      // Multiple events at same location
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '14px' }}>
                          {group.events.length} Events at this location
                        </div>
                        <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                          {group.events.map((item, i) => (
                            <div key={i} style={{
                              marginBottom: '8px',
                              paddingBottom: '8px',
                              borderBottom: i < group.events.length - 1 ? '1px solid #e5e7eb' : 'none'
                            }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                {formatDate(item.event.date)}
                              </div>
                              <div style={{ fontSize: '11px', lineHeight: '1.5' }}>
                                {item.type === 'noaa' ? (
                                  <>
                                    <div>Type: {(item.event as NOAAEvent).eventType}</div>
                                    {(item.event as NOAAEvent).magnitude && (
                                      <div>Magnitude: {(item.event as NOAAEvent).magnitude}</div>
                                    )}
                                    <div style={{ fontSize: '10px', color: '#8b5cf6' }}>NOAA</div>
                                  </>
                                ) : (
                                  <>
                                    <div>Hail: {(item.event as HailEvent).hailSize}"</div>
                                    <div>Severity: {(item.event as HailEvent).severity}</div>
                                    <div style={{ fontSize: '10px', color: item.type === 'hailtrace' ? '#10b981' : '#3b82f6' }}>
                                      {item.type === 'hailtrace' ? 'HailTrace' : 'IHM'}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      </div>
    </div>
  );
}
