import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import MRMSHailOverlay from './MRMSHailOverlay';
import HailSwathLayer from './HailSwathLayer';
import NexradRadarLayer from './NexradRadarLayer';
import {
  type BoundingBox,
  type HistoryRangePreset,
  type TabId,
  type StormEvent,
  type StormDate,
  type GpsPosition,
  type EventFilterState,
  type PropertySearchSummary,
  type SearchResultType,
  HAIL_SIZE_CLASSES,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  getHailSizeClass,
  getStormDateKey,
  formatDateLabel,
  formatHistoryRangeLabel,
  formatStormImpactSummary,
  getFilterSummaryLabel,
  rangeToMonths,
  getEffectiveMonths,
  isDateInRange,
  geocodeAddress,
  fetchStormEvents,
  fetchMeshSwathsByLocation,
  deduplicateEvents,
  groupEventsByDate,
  mergeDateLists,
  computeCanvassingAlert,
  generateStormReport,
} from './stormMapHelpers';

interface TerritoryHailMapProps {
  isAdmin?: boolean;
}

interface FitBoundsRequest {
  id: number;
  bounds: BoundingBox;
  maxZoom: number;
}

function MapCameraController({
  center,
  zoom,
  fitBoundsRequest,
}: {
  center: [number, number];
  zoom: number;
  fitBoundsRequest: FitBoundsRequest | null;
}) {
  const map = useMap();
  const previousRef = useRef({
    center,
    zoom,
    fitBoundsId: 0,
  });

  useEffect(() => {
    if (fitBoundsRequest && previousRef.current.fitBoundsId !== fitBoundsRequest.id) {
      map.fitBounds(
        [
          [fitBoundsRequest.bounds.south, fitBoundsRequest.bounds.west],
          [fitBoundsRequest.bounds.north, fitBoundsRequest.bounds.east],
        ],
        {
          padding: [32, 32],
          maxZoom: fitBoundsRequest.maxZoom,
          animate: true,
        },
      );
      previousRef.current = { center, zoom, fitBoundsId: fitBoundsRequest.id };
      return;
    }

    const previous = previousRef.current;
    if (
      previous.center[0] !== center[0] ||
      previous.center[1] !== center[1] ||
      previous.zoom !== zoom
    ) {
      map.flyTo(center, zoom, { duration: 0.8 });
      previousRef.current = { center, zoom, fitBoundsId: previous.fitBoundsId };
    }
  }, [center, fitBoundsRequest, map, zoom]);

  return null;
}

function GpsBlueDot({ position }: { position: GpsPosition | null }) {
  if (!position) return null;

  return (
    <>
      <Circle
        center={[position.lat, position.lng]}
        radius={position.accuracy}
        pathOptions={{
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.08,
          weight: 1,
          opacity: 0.3,
        }}
      />
      <CircleMarker
        center={[position.lat, position.lng]}
        radius={7}
        pathOptions={{
          color: '#ffffff',
          fillColor: '#3b82f6',
          fillOpacity: 1,
          weight: 2,
        }}
      />
    </>
  );
}

function extendBounds(
  bounds: BoundingBox | null,
  lat: number,
  lng: number,
): BoundingBox {
  if (!bounds) {
    return {
      north: lat,
      south: lat,
      east: lng,
      west: lng,
    };
  }

  return {
    north: Math.max(bounds.north, lat),
    south: Math.min(bounds.south, lat),
    east: Math.max(bounds.east, lng),
    west: Math.min(bounds.west, lng),
  };
}

function padBounds(bounds: BoundingBox | null, factor = 0.2): BoundingBox | null {
  if (!bounds) {
    return null;
  }

  const latSpan = Math.max(0.04, bounds.north - bounds.south);
  const lngSpan = Math.max(0.04, bounds.east - bounds.west);
  const latPad = latSpan * factor;
  const lngPad = lngSpan * factor;

  return {
    north: bounds.north + latPad,
    south: bounds.south - latPad,
    east: bounds.east + lngPad,
    west: bounds.west - lngPad,
  };
}

function getBoundsCenter(bounds: BoundingBox | null, fallback: [number, number]): [number, number] {
  if (!bounds) {
    return fallback;
  }

  return [
    (bounds.north + bounds.south) / 2,
    (bounds.east + bounds.west) / 2,
  ];
}

function hasUsableStormTime(timestamp: string): boolean {
  const match = timestamp.match(/T(\d{2}):(\d{2})/);
  if (!match) {
    return false;
  }

  return !(match[1] === '00' && match[2] === '00');
}

function getSelectedStormRadarTimestamp(selectedStormDate: string, dateEvents: StormEvent[]): string {
  const strongestTimedEvent = [...dateEvents]
    .filter((event) => event.eventType === 'Hail' && hasUsableStormTime(event.beginDate))
    .sort(
      (a, b) =>
        b.magnitude - a.magnitude ||
        new Date(b.beginDate).getTime() - new Date(a.beginDate).getTime(),
    )[0];

  if (strongestTimedEvent) {
    return strongestTimedEvent.beginDate;
  }

  const localNoon = new Date(`${selectedStormDate}T12:00:00`);
  if (!Number.isNaN(localNoon.getTime())) {
    return localNoon.toISOString();
  }

  return `${selectedStormDate}T16:00:00Z`;
}

function buildFallbackStormDayRadarTimestamps(selectedStormDate: string): string[] {
  const localHours = [14, 16, 18, 20, 22];
  const timestamps: string[] = [];

  for (const hour of localHours) {
    const localFrame = new Date(`${selectedStormDate}T${String(hour).padStart(2, '0')}:00:00`);
    if (!Number.isNaN(localFrame.getTime())) {
      timestamps.push(localFrame.toISOString());
    }
  }

  return timestamps;
}

function getHistoricalRadarTimestamps(dateEvents: StormEvent[], selectedStormDate: string | null): string[] {
  const rankedTimestamps = new globalThis.Map<string, number>();

  for (const event of dateEvents) {
    if (event.eventType !== 'Hail' || !hasUsableStormTime(event.beginDate)) {
      continue;
    }

    const parsed = new Date(event.beginDate);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }

    parsed.setUTCMinutes(Math.round(parsed.getUTCMinutes() / 15) * 15, 0, 0);
    const roundedIso = parsed.toISOString();
    const existingMagnitude = rankedTimestamps.get(roundedIso) ?? 0;
    rankedTimestamps.set(roundedIso, Math.max(existingMagnitude, event.magnitude));
  }

  if (rankedTimestamps.size === 0) {
    return selectedStormDate ? buildFallbackStormDayRadarTimestamps(selectedStormDate) : [];
  }

  return Array.from(rankedTimestamps.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([timestamp]) => timestamp)
    .sort((a, b) => a.localeCompare(b));
}

function getFallbackZoom(resultType: SearchResultType): number {
  switch (resultType) {
    case 'address':
      return 16;
    case 'postal_code':
      return 12;
    case 'locality':
      return 10;
    case 'administrative_area':
      return 8;
    default:
      return 14;
  }
}

function getSearchMaxZoom(resultType: SearchResultType): number {
  switch (resultType) {
    case 'address':
      return 17;
    case 'postal_code':
      return 13;
    case 'locality':
      return 11;
    case 'administrative_area':
      return 9;
    default:
      return 15;
  }
}

function getSearchRadiusMiles(resultType: SearchResultType): number {
  switch (resultType) {
    case 'address':
      return 15;
    case 'postal_code':
      return 20;
    case 'locality':
      return 30;
    case 'administrative_area':
      return 60;
    default:
      return 25;
  }
}

export default function TerritoryHailMap(_props: TerritoryHailMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  const [fitBoundsRequest, setFitBoundsRequest] = useState<FitBoundsRequest | null>(null);
  const [baseMap, setBaseMap] = useState<'map' | 'satellite'>('satellite');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchLabel, setActiveSearchLabel] = useState<string | null>(null);
  const [searchLat, setSearchLat] = useState<number | null>(DEFAULT_CENTER[0]);
  const [searchLng, setSearchLng] = useState<number | null>(DEFAULT_CENTER[1]);
  const [searchSummary, setSearchSummary] = useState<PropertySearchSummary | null>(null);
  const [historyRange, setHistoryRange] = useState<HistoryRangePreset>('2y');
  const [sinceDate, setSinceDate] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('recent');
  const [eventFilters, setEventFilters] = useState<EventFilterState>({ hail: true, wind: false });
  const [selectedDate, setSelectedDate] = useState<StormDate | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [events, setEvents] = useState<StormEvent[]>([]);
  const [stormDates, setStormDates] = useState<StormDate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsPosition, setGpsPosition] = useState<GpsPosition | null>(null);
  const [gpsTracking, setGpsTracking] = useState(false);
  const [radarVisible, setRadarVisible] = useState(false);
  const [mrmsVisible, setMrmsVisible] = useState(false);
  const [swathVisible, setSwathVisible] = useState(true);
  const [showDolModal, setShowDolModal] = useState(false);
  const [selectedDol, setSelectedDol] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const gpsWatchRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeRadiusMiles = searchSummary?.radiusMiles ?? 35;

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (event.eventType === 'Hail') {
          return eventFilters.hail;
        }
        if (event.eventType === 'Thunderstorm Wind') {
          return eventFilters.wind;
        }
        return false;
      }),
    [eventFilters, events],
  );

  const visibleEvents = useMemo(() => {
    if (!selectedDate) {
      return filteredEvents;
    }

    return filteredEvents.filter(
      (event) => getStormDateKey(event.beginDate) === selectedDate.date,
    );
  }, [filteredEvents, selectedDate]);

  const filteredStormDates = useMemo(() => {
    const sourceDates = eventFilters.hail && eventFilters.wind
      ? stormDates
      : stormDates.filter((stormDate) => {
        const hasHail = stormDate.maxHailInches > 0;
        const hasWind = stormDate.maxWindMph > 0;
        return (eventFilters.hail && hasHail) || (eventFilters.wind && hasWind);
      });

    return sourceDates.sort((a, b) => b.date.localeCompare(a.date));
  }, [eventFilters.hail, eventFilters.wind, stormDates]);

  const sortedDates = useMemo(() => {
    const candidates = [...filteredStormDates];
    return activeTab === 'impact'
      ? candidates.sort((a, b) => b.maxHailInches - a.maxHailInches || b.date.localeCompare(a.date))
      : candidates.sort((a, b) => b.date.localeCompare(a.date));
  }, [activeTab, filteredStormDates]);

  const latestStorms = useMemo(
    () => [...filteredStormDates].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2),
    [filteredStormDates],
  );

  const canvassingAlert = useMemo(
    () => computeCanvassingAlert(gpsPosition, filteredEvents),
    [filteredEvents, gpsPosition],
  );

  const selectedStormEvents = useMemo(() => {
    if (!selectedDate) {
      return [];
    }

    return events.filter((event) => getStormDateKey(event.beginDate) === selectedDate.date);
  }, [events, selectedDate]);

  const selectedStormBounds = useMemo(() => {
    if (!selectedDate) {
      return null;
    }

    let bounds: BoundingBox | null = null;
    for (const event of selectedStormEvents) {
      if (!Number.isFinite(event.beginLat) || !Number.isFinite(event.beginLon)) {
        continue;
      }
      bounds = extendBounds(bounds, event.beginLat, event.beginLon);
    }

    return padBounds(bounds, 0.22);
  }, [selectedDate, selectedStormEvents]);

  const selectedStormCenter = useMemo(
    () => getBoundsCenter(selectedStormBounds, mapCenter),
    [mapCenter, selectedStormBounds],
  );

  const selectedStormRadarTimestamp = useMemo(() => {
    if (!selectedDate) {
      return new Date().toISOString();
    }

    return getSelectedStormRadarTimestamp(selectedDate.date, selectedStormEvents);
  }, [selectedDate, selectedStormEvents]);

  const historicalRadarTimestamps = useMemo(
    () => getHistoricalRadarTimestamps(selectedStormEvents, selectedDate?.date ?? null),
    [selectedDate?.date, selectedStormEvents],
  );

  const fetchData = useCallback(async () => {
    if (searchLat === null || searchLng === null) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const months =
      historyRange === 'since'
        ? getEffectiveMonths(12, sinceDate || null)
        : rangeToMonths(historyRange);
    const effectiveSinceDate = historyRange === 'since' ? sinceDate || null : null;

    try {
      const [apiEvents, nhpSwaths] = await Promise.allSettled([
        fetchStormEvents(searchLat, searchLng, months, activeRadiusMiles, controller.signal),
        fetchMeshSwathsByLocation(searchLat, searchLng, months, activeRadiusMiles, effectiveSinceDate, controller.signal),
      ]);

      if (controller.signal.aborted) {
        return;
      }

      const allEvents: StormEvent[] = apiEvents.status === 'fulfilled' ? apiEvents.value : [];
      const sanitizedEvents = allEvents.filter((event) =>
        isDateInRange(event.beginDate, effectiveSinceDate),
      );
      const dedupedEvents = deduplicateEvents(sanitizedEvents);
      const swathDates =
        nhpSwaths.status === 'fulfilled'
          ? nhpSwaths.value.filter((stormDate) => isDateInRange(stormDate.date, effectiveSinceDate))
          : [];

      setEvents(dedupedEvents);
      setStormDates(mergeDateLists(groupEventsByDate(dedupedEvents), swathDates));

      if (apiEvents.status === 'rejected' && nhpSwaths.status === 'rejected') {
        setError('All storm data sources are unavailable.');
      }
    } catch (fetchError) {
      if (!controller.signal.aborted) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch storm data');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [activeRadiusMiles, historyRange, searchLat, searchLng, sinceDate]);

  useEffect(() => {
    void fetchData();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchData]);

  const handleSearch = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const query = inputRef.current?.value.trim() || searchQuery.trim();
      if (!query) {
        return;
      }

      setLoading(true);
      setError(null);

      const result = await geocodeAddress(query);
      if (!result) {
        setError('Location not found. Try a different address, city, or ZIP.');
        setLoading(false);
        return;
      }

      const radiusMiles = getSearchRadiusMiles(result.resultType);

      setSearchLat(result.lat);
      setSearchLng(result.lng);
      setActiveSearchLabel(result.address);
      setMapCenter([result.lat, result.lng]);
      setMapZoom(getFallbackZoom(result.resultType));
      setSearchSummary({
        locationLabel: result.address,
        resultType: result.resultType,
        radiusMiles,
        historyPreset: historyRange,
        sinceDate: historyRange === 'since' ? sinceDate : null,
      });
      setSelectedDate(null);

      if (result.viewport) {
        setFitBoundsRequest({
          id: Date.now(),
          bounds: result.viewport,
          maxZoom: getSearchMaxZoom(result.resultType),
        });
      }

      setLoading(false);
    },
    [historyRange, searchQuery, sinceDate],
  );

  const toggleGps = useCallback(() => {
    if (gpsTracking) {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
      }
      gpsWatchRef.current = null;
      setGpsTracking(false);
      setGpsPosition(null);
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

    setGpsTracking(true);
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setGpsPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp,
        });
      },
      () => setGpsTracking(false),
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    );
  }, [gpsTracking]);

  useEffect(
    () => () => {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
      }
    },
    [],
  );

  const handleGenerateReport = useCallback(async () => {
    if (!selectedDol || !activeSearchLabel || searchLat === null || searchLng === null) {
      return;
    }

    setGeneratingReport(true);
    try {
      await generateStormReport(activeSearchLabel, searchLat, searchLng, activeRadiusMiles, events, selectedDol);
      setShowDolModal(false);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Report generation failed');
    } finally {
      setGeneratingReport(false);
    }
  }, [activeRadiusMiles, activeSearchLabel, events, searchLat, searchLng, selectedDol]);

  const openDolModal = useCallback(() => {
    setSelectedDol(selectedDate?.date || latestStorms[0]?.date || '');
    setShowDolModal(true);
  }, [latestStorms, selectedDate]);

  const mapTileUrl =
    baseMap === 'map'
      ? 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
      : 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', position: 'relative', overflow: 'hidden' }}>
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="storm-sidebar-toggle"
        style={{
          display: 'none',
          position: 'absolute',
          top: 10,
          left: sidebarOpen ? 330 : 10,
          zIndex: 1100,
          width: 36,
          height: 36,
          borderRadius: 8,
          border: '1px solid #333',
          background: '#0a0a0f',
          color: '#fff',
          cursor: 'pointer',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          transition: 'left 0.2s ease',
        }}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? '\u2190' : '\u2192'}
      </button>

      <aside
        style={{
          width: sidebarOpen ? 320 : 0,
          minWidth: sidebarOpen ? 320 : 0,
          background: '#0a0a0f',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          borderRight: sidebarOpen ? '1px solid #1f2937' : 'none',
          overflow: 'hidden',
          transition: 'width 0.2s, min-width 0.2s',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ padding: 16, borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#ef4444" style={{ flexShrink: 0 }}>
              <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.547a1 1 0 01.64 1.895l-1.04.354L18 10.17V17a1 1 0 01-1 1H3a1 1 0 01-1-1v-6.83l1.847-3.563-1.04-.354a1 1 0 01.64-1.895l1.599.547L9 4.323V3a1 1 0 011-1z" />
            </svg>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Storm Maps</h1>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Property hail history for roofing reps</p>
            </div>
            <a
              href="https://appealing-bravery-production-d7d6.up.railway.app"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                color: '#9ca3af',
                background: '#1f2937',
                padding: '5px 10px',
                borderRadius: 6,
                textDecoration: 'none',
                flexShrink: 0,
                fontWeight: 600,
              }}
            >
              Full Map
            </a>
            <button
              onClick={toggleGps}
              title={gpsTracking ? 'Stop GPS' : 'Start GPS'}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: 'none',
                background: gpsTracking ? '#3b82f6' : '#1f2937',
                color: gpsTracking ? '#fff' : '#9ca3af',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {gpsTracking ? '\u25C9' : '\u25CB'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSearch} style={{ padding: 12, borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              type="text"
              defaultValue={activeSearchLabel ?? ''}
              key={activeSearchLabel ?? 'search-location'}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Address, city, or ZIP..."
              aria-label="Search location"
              style={{
                width: '100%',
                paddingLeft: 36,
                paddingRight: 12,
                paddingTop: 8,
                paddingBottom: 8,
                background: '#111827',
                border: '1px solid #374151',
                borderRadius: 8,
                fontSize: 13,
                color: '#fff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#6b7280', pointerEvents: 'none' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div style={{ marginTop: 12 }}>
            <p style={{ marginBottom: 8, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#6b7280' }}>History Range</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {(['1y', '2y', '5y', '10y', 'since'] as HistoryRangePreset[]).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setHistoryRange(range)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 8,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: historyRange === range ? '#ef4444' : '#111827',
                    color: historyRange === range ? '#fff' : '#d1d5db',
                    transition: 'background 0.15s',
                  }}
                >
                  {range === 'since' ? 'Since' : range.toUpperCase()}
                </button>
              ))}
            </div>
            {historyRange === 'since' && (
              <input
                type="date"
                value={sinceDate}
                onChange={(event) => setSinceDate(event.target.value)}
                aria-label="Since date"
                style={{
                  marginTop: 8,
                  width: '100%',
                  borderRadius: 8,
                  border: '1px solid #374151',
                  background: '#111827',
                  padding: '8px 12px',
                  fontSize: 13,
                  color: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            )}
          </div>
        </form>

        {searchSummary && (
          <div style={{ borderBottom: '1px solid #1f2937', padding: 12, flexShrink: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#6b7280', margin: 0 }}>Property History</p>
            <p style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: '#fff' }}>{searchSummary.locationLabel}</p>
            <p style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
              {loading
                ? `Searching within ${searchSummary.radiusMiles} miles...`
                : filteredStormDates.length > 0
                  ? `${filteredStormDates.length} ${getFilterSummaryLabel(eventFilters, filteredStormDates.length)} within ${searchSummary.radiusMiles} mi for ${formatHistoryRangeLabel(historyRange, sinceDate)}.`
                  : `No ${getFilterSummaryLabel(eventFilters, 0)} found within ${searchSummary.radiusMiles} mi for ${formatHistoryRangeLabel(historyRange, sinceDate)}.`}
            </p>
            {!loading && latestStorms[0] && (
              <p style={{ marginTop: 4, fontSize: 12, color: '#86efac' }}>
                Last hit {latestStorms[0].label} with {formatStormImpactSummary(latestStorms[0])}
              </p>
            )}
          </div>
        )}

        {canvassingAlert?.inHailZone && (
          <div style={{ margin: 12, padding: 12, background: 'rgba(127,29,29,0.6)', border: '1px solid #b91c1c', borderRadius: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hail Zone Alert</span>
            </div>
            <p style={{ fontSize: 13, color: '#fee2e2', fontWeight: 500, margin: 0 }}>{canvassingAlert.estimatedHailSize}" hail detected nearby</p>
            {canvassingAlert.talkingPoints[0] && (
              <p style={{ fontSize: 12, color: '#fecaca', marginTop: 4 }}>{canvassingAlert.talkingPoints[0]}</p>
            )}
          </div>
        )}

        {latestStorms.length > 0 && (
          <div style={{ borderBottom: '1px solid #1f2937', padding: 12, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#6b7280' }}>Latest Two Hits</p>
              <span style={{ fontSize: 10, color: '#4b5563' }}>newest first</span>
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {latestStorms.map((stormDate) => (
                <button
                  key={`latest-${stormDate.date}`}
                  type="button"
                  onClick={() => setSelectedDate((previous) => previous?.date === stormDate.date ? null : stormDate)}
                  style={{
                    borderRadius: 12,
                    border: selectedDate?.date === stormDate.date ? '1px solid #ef4444' : '1px solid #1f2937',
                    background: selectedDate?.date === stormDate.date ? 'rgba(239,68,68,0.1)' : 'rgba(17,24,39,0.7)',
                    padding: '10px 12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', margin: 0 }}>{stormDate.label}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
                    {stormDate.eventCount} report{stormDate.eventCount === 1 ? '' : 's'} / {formatStormImpactSummary(stormDate)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ borderBottom: '1px solid #1f2937', padding: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#6b7280', margin: 0 }}>Event Filters</p>
            <span style={{ fontSize: 10, color: '#4b5563' }}>map + dates</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {(['hail', 'wind'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setEventFilters((previous) => ({ ...previous, [type]: !previous[type] }))}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: eventFilters[type] ? '#06b6d4' : '#111827',
                  color: eventFilters[type] ? '#0a0a0f' : '#d1d5db',
                  transition: 'background 0.15s',
                  textTransform: 'capitalize',
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
          {(['recent', 'impact'] as TabId[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              role="tab"
              aria-selected={activeTab === tab}
              style={{
                flex: 1,
                padding: '10px 0',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #ef4444' : '2px solid transparent',
                color: activeTab === tab ? '#fff' : '#6b7280',
                cursor: 'pointer',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ display: 'inline-block', width: 20, height: 20, border: '2px solid #374151', borderTop: '2px solid #ef4444', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Loading storm data...</p>
            </div>
          )}
          {error && (
            <div style={{ margin: 12, padding: 12, background: 'rgba(127,29,29,0.3)', border: '1px solid #7f1d1d', borderRadius: 8 }}>
              <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{error}</p>
            </div>
          )}
          {!loading && !error && sortedDates.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#6b7280' }}>No storm dates found</p>
              <p style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>
                {searchSummary ? 'Try a wider history window or a broader location.' : 'Search an address, city, or ZIP to load nearby hail dates.'}
              </p>
            </div>
          )}
          {sortedDates.map((stormDate) => (
            <StormDateCard
              key={stormDate.date}
              stormDate={stormDate}
              isSelected={selectedDate?.date === stormDate.date}
              isExpanded={expandedDate === stormDate.date}
              events={filteredEvents.filter((event) => getStormDateKey(event.beginDate) === stormDate.date)}
              onClick={() => setSelectedDate((previous) => previous?.date === stormDate.date ? null : stormDate)}
              onToggleExpand={(event) => {
                event.stopPropagation();
                setExpandedDate((previous) => previous === stormDate.date ? null : stormDate.date);
              }}
            />
          ))}
        </div>

        <div style={{ borderTop: '1px solid #1f2937', padding: 12, flexShrink: 0 }}>
          <button
            onClick={openDolModal}
            disabled={!stormDates.length || generatingReport}
            style={{
              width: '100%',
              borderRadius: 12,
              border: 'none',
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 600,
              cursor: !stormDates.length || generatingReport ? 'not-allowed' : 'pointer',
              background: !stormDates.length || generatingReport ? '#1f2937' : '#ef4444',
              color: !stormDates.length || generatingReport ? '#6b7280' : '#fff',
            }}
          >
            {generatingReport ? 'Generating Report...' : 'Generate Report'}
          </button>
          <p style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: '#6b7280' }}>Choose the loss date, then download the NOAA-forward PDF.</p>
        </div>

        <div style={{ padding: 12, borderTop: '1px solid #1f2937', fontSize: 12, color: '#6b7280', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{filteredStormDates.length} {getFilterSummaryLabel(eventFilters, filteredStormDates.length)}</span>
            <span>{filteredEvents.length} reports</span>
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <MapContainer center={mapCenter} zoom={mapZoom} style={{ width: '100%', height: '100%' }} zoomControl={true} attributionControl={false}>
          <MapCameraController center={mapCenter} zoom={mapZoom} fitBoundsRequest={fitBoundsRequest} />
          <TileLayer url={mapTileUrl} subdomains={['0', '1', '2', '3']} maxZoom={21} />

          {visibleEvents.map((event) => {
            if (!Number.isFinite(event.beginLat) || !Number.isFinite(event.beginLon) || (event.beginLat === 0 && event.beginLon === 0)) {
              return null;
            }
            const sizeClass = getHailSizeClass(event.magnitude);
            const color = sizeClass?.color || (event.eventType === 'Thunderstorm Wind' ? '#38bdf8' : '#888');
            return (
              <CircleMarker
                key={event.id}
                center={[event.beginLat, event.beginLon]}
                radius={event.eventType === 'Hail' ? Math.max(4, event.magnitude * 5) : 4}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.7,
                  weight: 1,
                  opacity: 0.95,
                }}
              >
                <Popup maxWidth={260}>
                  <div style={{ fontFamily: 'system-ui', padding: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                      {event.eventType === 'Hail' ? `${event.magnitude}" Hail` : `${event.magnitude} mph Wind`}
                    </div>
                    <div style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>
                      <div>{formatDateLabel(event.beginDate)}</div>
                      {event.county ? <div>{event.county}, {event.state}</div> : null}
                      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{event.source}</div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          <GpsBlueDot position={gpsPosition} />
          <NexradRadarLayer
            visible={radarVisible}
            onToggle={() => setRadarVisible((previous) => !previous)}
            stormDate={selectedDate?.date ?? null}
            stormLocation={{ lat: selectedStormCenter[0], lng: selectedStormCenter[1] }}
            stormBounds={selectedStormBounds}
            historicalTimestamps={historicalRadarTimestamps}
          />
          <MRMSHailOverlay
            visible={mrmsVisible}
            product="mesh1440"
            onToggle={() => setMrmsVisible((previous) => !previous)}
            selectedDate={selectedDate?.date ?? null}
            historicalBounds={selectedStormBounds}
            anchorTimestamp={selectedStormRadarTimestamp}
          />
          <HailSwathLayer visible={swathVisible} selectedDate={selectedDate?.date || null} />
        </MapContainer>

        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setBaseMap('map')}
              style={{
                width: 44,
                height: 28,
                borderRadius: 6,
                border: '2px solid rgba(0,0,0,0.2)',
                background: baseMap === 'map' ? '#2563eb' : '#fff',
                color: baseMap === 'map' ? '#fff' : '#333',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                boxShadow: '0 1px 5px rgba(0,0,0,0.3)',
              }}
            >
              Map
            </button>
            <button
              onClick={() => setBaseMap('satellite')}
              style={{
                width: 44,
                height: 28,
                borderRadius: 6,
                border: '2px solid rgba(0,0,0,0.2)',
                background: baseMap === 'satellite' ? '#2563eb' : '#fff',
                color: baseMap === 'satellite' ? '#fff' : '#333',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                boxShadow: '0 1px 5px rgba(0,0,0,0.3)',
              }}
            >
              Sat
            </button>
          </div>
          <button
            onClick={() => setSwathVisible((previous) => !previous)}
            title={swathVisible ? 'Hide hail swaths' : 'Show hail swaths'}
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              border: '2px solid rgba(0,0,0,0.2)',
              background: swathVisible ? '#d97706' : '#fff',
              color: swathVisible ? '#fff' : '#333',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              boxShadow: '0 1px 5px rgba(0,0,0,0.3)',
            }}
          >
            SW
          </button>
        </div>

        {!mrmsVisible && (
          <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 1000, background: 'rgba(10,10,15,0.88)', backdropFilter: 'blur(6px)', borderRadius: 8, padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.35)', color: '#fff', fontSize: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 6 }}>Hail Size</div>
            {HAIL_SIZE_CLASSES.map((sizeClass) => (
              <div key={sizeClass.reference} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{ width: 12, height: 10, borderRadius: 2, background: sizeClass.color, flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }} />
                <span style={{ color: '#e2e8f0' }}>{sizeClass.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDolModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}
          onClick={() => setShowDolModal(false)}
        >
          <div
            style={{ width: '100%', maxWidth: 420, borderRadius: 16, border: '1px solid #1f2937', background: '#0a0a0f', padding: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.5)', color: '#fff' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Select Date of Loss</h3>
              <button onClick={() => setShowDolModal(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, padding: 4 }}>x</button>
            </div>
            <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>Choose the storm date to include as the Date of Loss in the PDF report.</p>
            <div style={{ marginTop: 16, maxHeight: 320, overflowY: 'auto' }}>
              {stormDates.map((stormDate) => (
                <button
                  key={`dol-${stormDate.date}`}
                  onClick={() => setSelectedDol(stormDate.date)}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: selectedDol === stormDate.date ? '1px solid #ef4444' : '1px solid #1f2937',
                    background: selectedDol === stormDate.date ? 'rgba(239,68,68,0.1)' : 'rgba(17,24,39,0.7)',
                    padding: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    marginBottom: 8,
                    color: '#fff',
                    display: 'block',
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{stormDate.label}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, margin: 0 }}>{stormDate.eventCount} event{stormDate.eventCount === 1 ? '' : 's'} / {formatStormImpactSummary(stormDate)}</p>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowDolModal(false)} style={{ borderRadius: 8, border: '1px solid #374151', background: 'transparent', padding: '8px 12px', fontSize: 13, color: '#d1d5db', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleGenerateReport}
                disabled={!selectedDol || generatingReport}
                style={{
                  borderRadius: 8,
                  border: 'none',
                  background: !selectedDol || generatingReport ? '#374151' : '#ef4444',
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  cursor: !selectedDol || generatingReport ? 'not-allowed' : 'pointer',
                }}
              >
                {generatingReport ? 'Generating...' : 'Generate PDF Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @media (max-width: 768px) { .storm-sidebar-toggle { display: flex !important; } }
      `}</style>
    </div>
  );
}

function StormDateCard({
  stormDate,
  isSelected,
  isExpanded,
  events: dateEvents,
  onClick,
  onToggleExpand,
}: {
  stormDate: StormDate;
  isSelected: boolean;
  isExpanded: boolean;
  events: StormEvent[];
  onClick: () => void;
  onToggleExpand: (event: React.MouseEvent) => void;
}) {
  const sizeClass = getHailSizeClass(stormDate.maxHailInches);
  const color = sizeClass?.color || HAIL_SIZE_CLASSES[0].color;

  return (
    <div
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      style={{
        borderBottom: '1px solid #1f2937',
        cursor: 'pointer',
        borderLeft: isSelected ? '2px solid #ef4444' : '2px solid transparent',
        background: isSelected ? 'rgba(31,41,55,0.8)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: color }} title={sizeClass?.label || 'Unknown'} />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stormDate.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, marginLeft: 18 }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{stormDate.eventCount > 0 ? `${stormDate.eventCount} report${stormDate.eventCount !== 1 ? 's' : ''}` : 'Swath data'}</span>
              {stormDate.statesAffected.length > 0 ? <span style={{ fontSize: 12, color: '#6b7280' }}>{stormDate.statesAffected.slice(0, 3).join(', ')}</span> : null}
              {stormDate.maxWindMph > 0 ? <span style={{ fontSize: 12, color: '#7dd3fc' }}>{stormDate.maxWindMph.toFixed(0)} mph</span> : null}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 12, fontWeight: 700, background: `${color}20`, color }}>{stormDate.maxHailInches > 0 ? `${stormDate.maxHailInches}"` : '--'}</span>
            <button
              onClick={onToggleExpand}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              style={{ padding: 2, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {isExpanded && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid rgba(31,41,55,0.5)' }}>
          {dateEvents.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              {dateEvents.slice(0, 10).map((event) => {
                const eventColor = getHailSizeClass(event.magnitude)?.color || '#888';
                return (
                  <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: eventColor, flexShrink: 0 }} />
                    <span style={{ color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {event.magnitude > 0 ? `${event.magnitude}"` : ''} {event.county ? `${event.county},` : ''} {event.state || event.source}
                    </span>
                  </div>
                );
              })}
              {dateEvents.length > 10 ? <p style={{ fontSize: 12, color: '#4b5563', marginLeft: 14, marginTop: 2 }}>+{dateEvents.length - 10} more</p> : null}
            </div>
          ) : (
            <p style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>MESH swath data available (no individual reports)</p>
          )}
        </div>
      )}
    </div>
  );
}
