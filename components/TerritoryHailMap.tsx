/**
 * TerritoryHailMap -- Native storm map with dark sidebar.
 *
 * Replaces the previous iframe wrapper with a fully integrated component
 * using the field assistant's own Leaflet map, APIs, and overlays.
 *
 * Features (ported from standalone Storm Maps app):
 *   - Address / ZIP search (Census geocoder, free)
 *   - History range presets (1Y / 2Y / 5Y / 10Y / Since)
 *   - Property history summary, canvassing alerts, GPS tracking
 *   - Hail / Wind event filters, Recent / Impact tabs
 *   - Expandable storm date cards with per-event detail
 *   - MRMS MESH overlay + NHP hail swath polylines
 *   - PDF report generation with date-of-loss picker
 *
 * All styling is inline (no Tailwind). Dark sidebar: #0a0a0f.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import MRMSHailOverlay from './MRMSHailOverlay';
import HailSwathLayer from './HailSwathLayer';
import {
  type HistoryRangePreset, type TabId, type StormEvent, type StormDate,
  type GpsPosition, type EventFilterState, type PropertySearchSummary,
  HAIL_SIZE_CLASSES, DEFAULT_CENTER, DEFAULT_ZOOM,
  getHailSizeClass, getStormDateKey, formatDateLabel, formatHistoryRangeLabel,
  formatStormImpactSummary, getFilterSummaryLabel, rangeToMonths, getEffectiveMonths,
  isDateInRange, geocodeAddress, fetchStormEvents, fetchMeshSwathsByLocation,
  deduplicateEvents, groupEventsByDate, mergeDateLists, computeCanvassingAlert,
  generateStormReport,
} from './stormMapHelpers';

interface TerritoryHailMapProps { isAdmin?: boolean; }

// ---- Map camera sync (child of MapContainer) ----
function MapCameraController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const prev = useRef({ center, zoom });
  useEffect(() => {
    const p = prev.current;
    if (p.center[0] !== center[0] || p.center[1] !== center[1] || p.zoom !== zoom) {
      map.flyTo(center, zoom, { duration: 0.8 });
      prev.current = { center, zoom };
    }
  }, [center, zoom, map]);
  return null;
}

// ---- GPS blue dot (child of MapContainer) ----
function GpsBlueDot({ position }: { position: GpsPosition | null }) {
  if (!position) return null;
  return (
    <>
      <Circle center={[position.lat, position.lng]} radius={position.accuracy}
        pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.08, weight: 1, opacity: 0.3 }} />
      <CircleMarker center={[position.lat, position.lng]} radius={7}
        pathOptions={{ color: '#ffffff', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }} />
    </>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function TerritoryHailMap(_props: TerritoryHailMapProps) {
  // State
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchLabel, setActiveSearchLabel] = useState<string | null>(null);
  const [searchLat, setSearchLat] = useState<number | null>(null);
  const [searchLng, setSearchLng] = useState<number | null>(null);
  const [searchSummary, setSearchSummary] = useState<PropertySearchSummary | null>(null);
  const [historyRange, setHistoryRange] = useState<HistoryRangePreset>('2y');
  const [sinceDate, setSinceDate] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('recent');
  const [eventFilters, setEventFilters] = useState<EventFilterState>({ hail: true, wind: true });
  const [selectedDate, setSelectedDate] = useState<StormDate | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [events, setEvents] = useState<StormEvent[]>([]);
  const [stormDates, setStormDates] = useState<StormDate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsPosition, setGpsPosition] = useState<GpsPosition | null>(null);
  const [gpsTracking, setGpsTracking] = useState(false);
  const gpsWatchRef = useRef<number | null>(null);
  const [mrmsVisible, setMrmsVisible] = useState(false);
  const [swathVisible, setSwathVisible] = useState(true);
  const [showDolModal, setShowDolModal] = useState(false);
  const [selectedDol, setSelectedDol] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derived
  const filteredEvents = useMemo(() => events.filter((e) => {
    if (e.eventType === 'Hail' && !eventFilters.hail) return false;
    if (e.eventType === 'Thunderstorm Wind' && !eventFilters.wind) return false;
    return true;
  }), [events, eventFilters]);

  const filteredStormDates = useMemo(() => {
    if (eventFilters.hail && eventFilters.wind) return stormDates;
    return stormDates.filter((sd) => {
      if (!eventFilters.hail && sd.maxHailInches > 0 && sd.maxWindMph === 0) return false;
      if (!eventFilters.wind && sd.maxWindMph > 0 && sd.maxHailInches === 0) return false;
      return true;
    });
  }, [stormDates, eventFilters]);

  const sortedDates = useMemo(() => {
    const c = [...filteredStormDates];
    return activeTab === 'impact'
      ? c.sort((a, b) => b.maxHailInches - a.maxHailInches || b.date.localeCompare(a.date))
      : c.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredStormDates, activeTab]);

  const latestStorms = useMemo(() => [...stormDates].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2), [stormDates]);
  const canvassingAlert = useMemo(() => computeCanvassingAlert(gpsPosition, filteredEvents), [gpsPosition, filteredEvents]);

  // Data fetching
  const fetchData = useCallback(async () => {
    if (searchLat === null || searchLng === null) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    const months = historyRange === 'since' ? getEffectiveMonths(12, sinceDate || null) : rangeToMonths(historyRange);
    const sd = historyRange === 'since' ? sinceDate || null : null;
    try {
      const [apiEvents, nhpSwaths] = await Promise.allSettled([
        fetchStormEvents(searchLat, searchLng, months, 50, controller.signal),
        fetchMeshSwathsByLocation(searchLat, searchLng, months, 50, sd, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      const all: StormEvent[] = apiEvents.status === 'fulfilled' ? apiEvents.value : [];
      const sanitized = all.filter((e) => isDateInRange(e.beginDate, sd));
      const deduped = deduplicateEvents(sanitized);
      const swathDates: StormDate[] = nhpSwaths.status === 'fulfilled' ? nhpSwaths.value.filter((s) => isDateInRange(s.date, sd)) : [];
      setEvents(deduped);
      setStormDates(mergeDateLists(groupEventsByDate(deduped), swathDates));
      if (apiEvents.status === 'rejected' && nhpSwaths.status === 'rejected') setError('All storm data sources are unavailable.');
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed to fetch storm data');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [searchLat, searchLng, historyRange, sinceDate]);

  useEffect(() => { fetchData(); return () => { abortRef.current?.abort(); }; }, [fetchData]);

  // Search
  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputRef.current?.value.trim() || searchQuery.trim();
    if (!q) return;
    setLoading(true); setError(null);
    const result = await geocodeAddress(q);
    if (!result) { setError('Location not found. Try a different address or ZIP.'); setLoading(false); return; }
    setSearchLat(result.lat); setSearchLng(result.lng); setActiveSearchLabel(result.address);
    setMapCenter([result.lat, result.lng]); setMapZoom(result.resultType === 'postal_code' ? 11 : 14);
    setSearchSummary({ locationLabel: result.address, resultType: result.resultType, radiusMiles: 50, historyPreset: historyRange, sinceDate: historyRange === 'since' ? sinceDate : null });
    setSelectedDate(null); setLoading(false);
  }, [searchQuery, historyRange, sinceDate]);

  // GPS
  const toggleGps = useCallback(() => {
    if (gpsTracking) {
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null; setGpsTracking(false); setGpsPosition(null); return;
    }
    if (!navigator.geolocation) return;
    setGpsTracking(true);
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => setGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed: pos.coords.speed, timestamp: pos.timestamp }),
      () => setGpsTracking(false),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }, [gpsTracking]);

  useEffect(() => () => { if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current); }, []);

  // Report
  const handleGenerateReport = useCallback(async () => {
    if (!selectedDol || !activeSearchLabel || searchLat === null || searchLng === null) return;
    setGeneratingReport(true);
    try { await generateStormReport(activeSearchLabel, searchLat, searchLng, 50, events, selectedDol); setShowDolModal(false); }
    catch (err) { setError(err instanceof Error ? err.message : 'Report generation failed'); }
    finally { setGeneratingReport(false); }
  }, [selectedDol, activeSearchLabel, searchLat, searchLng, events]);

  const openDolModal = useCallback(() => {
    setSelectedDol(selectedDate?.date || latestStorms[0]?.date || '');
    setShowDolModal(true);
  }, [selectedDate, latestStorms]);

  // ============================================================
  // Render
  // ============================================================
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Mobile sidebar toggle */}
      <button onClick={() => setSidebarOpen(!sidebarOpen)} className="storm-sidebar-toggle"
        style={{ display: 'none', position: 'absolute', top: 10, left: sidebarOpen ? 330 : 10, zIndex: 1100, width: 36, height: 36, borderRadius: 8, border: '1px solid #333', background: '#0a0a0f', color: '#fff', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', fontSize: 18, transition: 'left 0.2s ease' }}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}>
        {sidebarOpen ? '\u2190' : '\u2192'}
      </button>

      {/* ============ SIDEBAR ============ */}
      <aside style={{ width: sidebarOpen ? 320 : 0, minWidth: sidebarOpen ? 320 : 0, background: '#0a0a0f', color: '#fff', display: 'flex', flexDirection: 'column', borderRight: sidebarOpen ? '1px solid #1f2937' : 'none', overflow: 'hidden', transition: 'width 0.2s, min-width 0.2s', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {/* Header */}
        <div style={{ padding: 16, borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#ef4444" style={{ flexShrink: 0 }}>
              <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.547a1 1 0 01.64 1.895l-1.04.354L18 10.17V17a1 1 0 01-1 1H3a1 1 0 01-1-1v-6.83l1.847-3.563-1.04-.354a1 1 0 01.64-1.895l1.599.547L9 4.323V3a1 1 0 011-1z" />
            </svg>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Storm Maps</h1>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Property hail history for roofing reps</p>
            </div>
            <button onClick={toggleGps} title={gpsTracking ? 'Stop GPS' : 'Start GPS'}
              style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: gpsTracking ? '#3b82f6' : '#1f2937', color: gpsTracking ? '#fff' : '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
              {gpsTracking ? '\u25C9' : '\u25CB'}
            </button>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ padding: 12, borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <input ref={inputRef} type="text" defaultValue={activeSearchLabel ?? ''} key={activeSearchLabel ?? 'si'} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Address, city, or ZIP..." aria-label="Search location"
              style={{ width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#6b7280', pointerEvents: 'none' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div style={{ marginTop: 12 }}>
            <p style={{ marginBottom: 8, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#6b7280' }}>History Range</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {(['1y', '2y', '5y', '10y', 'since'] as HistoryRangePreset[]).map((r) => (
                <button key={r} type="button" onClick={() => setHistoryRange(r)}
                  style={{ padding: '8px 4px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: historyRange === r ? '#ef4444' : '#111827', color: historyRange === r ? '#fff' : '#d1d5db', transition: 'background 0.15s' }}>
                  {r === 'since' ? 'Since' : r.toUpperCase()}
                </button>
              ))}
            </div>
            {historyRange === 'since' && (
              <input type="date" value={sinceDate} onChange={(e) => setSinceDate(e.target.value)} aria-label="Since date"
                style={{ marginTop: 8, width: '100%', borderRadius: 8, border: '1px solid #374151', background: '#111827', padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            )}
          </div>
        </form>

        {/* Property summary */}
        {searchSummary && (
          <div style={{ borderBottom: '1px solid #1f2937', padding: 12, flexShrink: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#6b7280', margin: 0 }}>Property History</p>
            <p style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: '#fff' }}>{searchSummary.locationLabel}</p>
            <p style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
              {loading ? `Searching within ${searchSummary.radiusMiles} miles...`
                : stormDates.length > 0 ? `${stormDates.length} ${getFilterSummaryLabel(eventFilters, stormDates.length)} within ${searchSummary.radiusMiles} mi for ${formatHistoryRangeLabel(historyRange, sinceDate)}.`
                  : `No ${getFilterSummaryLabel(eventFilters, 0)} found within ${searchSummary.radiusMiles} mi for ${formatHistoryRangeLabel(historyRange, sinceDate)}.`}
            </p>
            {!loading && latestStorms[0] && (
              <p style={{ marginTop: 4, fontSize: 12, color: '#86efac' }}>Last hit {latestStorms[0].label} with {formatStormImpactSummary(latestStorms[0])}</p>
            )}
          </div>
        )}

        {/* Canvassing alert */}
        {canvassingAlert?.inHailZone && (
          <div style={{ margin: 12, padding: 12, background: 'rgba(127,29,29,0.6)', border: '1px solid #b91c1c', borderRadius: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hail Zone Alert</span>
            </div>
            <p style={{ fontSize: 13, color: '#fee2e2', fontWeight: 500, margin: 0 }}>{canvassingAlert.estimatedHailSize}" hail detected nearby</p>
            {canvassingAlert.talkingPoints[0] && <p style={{ fontSize: 12, color: '#fecaca', marginTop: 4 }}>{canvassingAlert.talkingPoints[0]}</p>}
          </div>
        )}

        {/* Event filters */}
        <div style={{ borderBottom: '1px solid #1f2937', padding: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#6b7280', margin: 0 }}>Event Filters</p>
            <span style={{ fontSize: 10, color: '#4b5563' }}>map + dates</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {(['hail', 'wind'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setEventFilters((p) => ({ ...p, [t]: !p[t] }))}
                style={{ padding: '8px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: eventFilters[t] ? '#06b6d4' : '#111827', color: eventFilters[t] ? '#0a0a0f' : '#d1d5db', transition: 'background 0.15s', textTransform: 'capitalize' }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
          {(['recent', 'impact'] as TabId[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} role="tab" aria-selected={activeTab === tab}
              style={{ flex: 1, padding: '10px 0', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid #ef4444' : '2px solid transparent', color: activeTab === tab ? '#fff' : '#6b7280', cursor: 'pointer' }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Storm date list */}
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
          {sortedDates.map((sd) => (
            <StormDateCard key={sd.date} stormDate={sd} isSelected={selectedDate?.date === sd.date} isExpanded={expandedDate === sd.date}
              events={filteredEvents.filter((e) => getStormDateKey(e.beginDate) === sd.date)}
              onClick={() => setSelectedDate((p) => p?.date === sd.date ? null : sd)}
              onToggleExpand={(ev) => { ev.stopPropagation(); setExpandedDate((p) => p === sd.date ? null : sd.date); }} />
          ))}
        </div>

        {/* Report button */}
        <div style={{ borderTop: '1px solid #1f2937', padding: 12, flexShrink: 0 }}>
          <button onClick={openDolModal} disabled={!stormDates.length || generatingReport}
            style={{ width: '100%', borderRadius: 12, border: 'none', padding: '10px 12px', fontSize: 13, fontWeight: 600, cursor: !stormDates.length || generatingReport ? 'not-allowed' : 'pointer', background: !stormDates.length || generatingReport ? '#1f2937' : '#ef4444', color: !stormDates.length || generatingReport ? '#6b7280' : '#fff' }}>
            {generatingReport ? 'Generating Report...' : 'Generate Report'}
          </button>
          <p style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: '#6b7280' }}>Choose the loss date, then download the NOAA-forward PDF.</p>
        </div>

        {/* Footer stats */}
        <div style={{ padding: 12, borderTop: '1px solid #1f2937', fontSize: 12, color: '#6b7280', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{filteredStormDates.length} {getFilterSummaryLabel(eventFilters, filteredStormDates.length)}</span>
            <span>{filteredEvents.length} reports</span>
          </div>
        </div>
      </aside>

      {/* ============ MAP AREA ============ */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <MapContainer center={mapCenter} zoom={mapZoom} style={{ width: '100%', height: '100%' }} zoomControl={true} attributionControl={false}>
          <MapCameraController center={mapCenter} zoom={mapZoom} />
          <TileLayer url="https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" subdomains={['0', '1', '2', '3']} maxZoom={21} />

          {filteredEvents.map((event) => {
            if (event.beginLat === 0 && event.beginLon === 0) return null;
            const sc = getHailSizeClass(event.magnitude);
            const color = sc?.color || '#888';
            const dimmed = selectedDate && getStormDateKey(event.beginDate) !== selectedDate.date;
            return (
              <CircleMarker key={event.id} center={[event.beginLat, event.beginLon]}
                radius={event.eventType === 'Hail' ? Math.max(4, event.magnitude * 5) : 4}
                pathOptions={{ color: dimmed ? '#555' : color, fillColor: dimmed ? '#555' : color, fillOpacity: dimmed ? 0.2 : 0.65, weight: 1, opacity: dimmed ? 0.3 : 0.9 }}>
                <Popup maxWidth={260}>
                  <div style={{ fontFamily: 'system-ui', padding: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                      {event.eventType === 'Hail' ? `${event.magnitude}" Hail` : `${event.magnitude} mph Wind`}
                    </div>
                    <div style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>
                      <div>{formatDateLabel(event.beginDate)}</div>
                      {event.county && <div>{event.county}, {event.state}</div>}
                      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{event.source}</div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          <GpsBlueDot position={gpsPosition} />
          <MRMSHailOverlay visible={mrmsVisible} product="mesh1440" onToggle={() => setMrmsVisible(!mrmsVisible)} />
          <HailSwathLayer visible={swathVisible} selectedDate={selectedDate?.date || null} />
        </MapContainer>

        {/* Swath toggle */}
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={() => setSwathVisible(!swathVisible)} title={swathVisible ? 'Hide hail swaths' : 'Show hail swaths'}
            style={{ width: 36, height: 36, borderRadius: 6, border: '2px solid rgba(0,0,0,0.2)', background: swathVisible ? '#d97706' : '#fff', color: swathVisible ? '#fff' : '#333', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, boxShadow: '0 1px 5px rgba(0,0,0,0.3)' }}>
            S
          </button>
        </div>

        {/* Hail size legend */}
        <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 1000, background: 'rgba(10,10,15,0.88)', backdropFilter: 'blur(6px)', borderRadius: 8, padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.35)', color: '#fff', fontSize: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 6 }}>Hail Size</div>
          {HAIL_SIZE_CLASSES.slice(0, 6).map((cls) => (
            <div key={cls.reference} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <div style={{ width: 12, height: 10, borderRadius: 2, background: cls.color, flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }} />
              <span style={{ color: '#e2e8f0' }}>{cls.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ============ Date of Loss Modal ============ */}
      {showDolModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}
          onClick={() => setShowDolModal(false)}>
          <div style={{ width: '100%', maxWidth: 420, borderRadius: 16, border: '1px solid #1f2937', background: '#0a0a0f', padding: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.5)', color: '#fff' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Select Date of Loss</h3>
              <button onClick={() => setShowDolModal(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, padding: 4 }}>x</button>
            </div>
            <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>Choose the storm date to include as the Date of Loss in the PDF report.</p>
            <div style={{ marginTop: 16, maxHeight: 320, overflowY: 'auto' }}>
              {stormDates.map((sd) => (
                <button key={`dol-${sd.date}`} onClick={() => setSelectedDol(sd.date)}
                  style={{ width: '100%', borderRadius: 12, border: selectedDol === sd.date ? '1px solid #ef4444' : '1px solid #1f2937', background: selectedDol === sd.date ? 'rgba(239,68,68,0.1)' : 'rgba(17,24,39,0.7)', padding: 12, textAlign: 'left', cursor: 'pointer', marginBottom: 8, color: '#fff', display: 'block' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{sd.label}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, margin: 0 }}>{sd.eventCount} event{sd.eventCount === 1 ? '' : 's'} / {formatStormImpactSummary(sd)}</p>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowDolModal(false)} style={{ borderRadius: 8, border: '1px solid #374151', background: 'transparent', padding: '8px 12px', fontSize: 13, color: '#d1d5db', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleGenerateReport} disabled={!selectedDol || generatingReport}
                style={{ borderRadius: 8, border: 'none', background: !selectedDol || generatingReport ? '#374151' : '#ef4444', padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: !selectedDol || generatingReport ? 'not-allowed' : 'pointer' }}>
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

// ============================================================
// StormDateCard
// ============================================================
function StormDateCard({ stormDate, isSelected, isExpanded, events: dateEvents, onClick, onToggleExpand }: {
  stormDate: StormDate; isSelected: boolean; isExpanded: boolean; events: StormEvent[];
  onClick: () => void; onToggleExpand: (e: React.MouseEvent) => void;
}) {
  const sc = getHailSizeClass(stormDate.maxHailInches);
  const color = sc?.color || HAIL_SIZE_CLASSES[0].color;
  return (
    <div onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      role="button" tabIndex={0} aria-pressed={isSelected}
      style={{ borderBottom: '1px solid #1f2937', cursor: 'pointer', borderLeft: isSelected ? '2px solid #ef4444' : '2px solid transparent', background: isSelected ? 'rgba(31,41,55,0.8)' : 'transparent', transition: 'background 0.15s' }}>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: color }} title={sc?.label || 'Unknown'} />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stormDate.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, marginLeft: 18 }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{stormDate.eventCount > 0 ? `${stormDate.eventCount} report${stormDate.eventCount !== 1 ? 's' : ''}` : 'Swath data'}</span>
              {stormDate.statesAffected.length > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>{stormDate.statesAffected.slice(0, 3).join(', ')}</span>}
              {stormDate.maxWindMph > 0 && <span style={{ fontSize: 12, color: '#7dd3fc' }}>{stormDate.maxWindMph.toFixed(0)} mph</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 12, fontWeight: 700, background: `${color}20`, color }}>{stormDate.maxHailInches > 0 ? `${stormDate.maxHailInches}"` : '--'}</span>
            <button onClick={onToggleExpand} aria-label={isExpanded ? 'Collapse' : 'Expand'}
              style={{ padding: 2, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
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
              {dateEvents.slice(0, 10).map((ev) => {
                const ec = getHailSizeClass(ev.magnitude)?.color || '#888';
                return (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: ec, flexShrink: 0 }} />
                    <span style={{ color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {ev.magnitude > 0 ? `${ev.magnitude}"` : ''} {ev.county && `${ev.county},`} {ev.state || ev.source}
                    </span>
                  </div>
                );
              })}
              {dateEvents.length > 10 && <p style={{ fontSize: 12, color: '#4b5563', marginLeft: 14, marginTop: 2 }}>+{dateEvents.length - 10} more</p>}
            </div>
          ) : (
            <p style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>MESH swath data available (no individual reports)</p>
          )}
        </div>
      )}
    </div>
  );
}
