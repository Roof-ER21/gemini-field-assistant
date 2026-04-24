import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import MRMSHailOverlay from './MRMSHailOverlay';
import MRMSSwathPolygonLayer from './MRMSSwathPolygonLayer';
import LiveMrmsPolygonLayer from './LiveMrmsPolygonLayer';
import PropertyImpactPanel from './PropertyImpactPanel';
import { impactedAssetApi } from '../services/impactedAssetApi';
import { authService } from '../services/authService';
import HailSwathLayer from './HailSwathLayer';
import HailContourLayer from './HailContourLayer';
import {
  type BoundingBox,
  type HistoryRangePreset,
  type TabId,
  type StormEvent,
  type StormDate,
  type GpsPosition,
  type CanvassingAlert,
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
  haversineDistanceMiles,
  isDateInRange,
  geocodeAddress,
  reverseGeocodeLatLng,
  fetchStormEvents,
  fetchStormDays,
  fetchMeshSwathsByLocation,
  fetchAddressImpact,
  formatHailTier,
  verifyDate,
  type AddressImpactReport,
  type VerifyDateResult,
  deduplicateEvents,
  groupEventsByDate,
  mergeDateLists,
  computeCanvassingAlert,
  generateStormReport,
} from './stormMapHelpers';

interface TerritoryHailMapProps {
  isAdmin?: boolean;
  setActivePanel?: (panel: string) => void;
}

interface FitBoundsRequest {
  id: number;
  bounds: BoundingBox;
  maxZoom: number;
}

interface MapClickInsight {
  lat: number;
  lng: number;
  nearestEvent: StormEvent | null;
  distanceMiles: number | null;
}

interface RouteSummary {
  eventCount: number;
  maxHailInches: number;
  maxWindMph: number;
  dateKeys: string[];
}

interface RouteData {
  coordinates: [number, number][];
  distanceMiles: number;
  durationMinutes: number | null;
  summary: RouteSummary;
  destination: [number, number];
}

function formatLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

const CANVASSING_ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const CANVASSING_ALERT_AUTO_DISMISS_MS = 8 * 1000;
const GPS_FOCUS_PAD_DEGREES = 0.008;

async function showStormMapNotification(alert: CanvassingAlert): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const title = alert.estimatedHailSize && alert.estimatedHailSize >= 1
    ? 'Storm Maps: Knock Here'
    : 'Storm Maps: Nearby Hail Zone';
  const body = alert.stormDate
    ? `You're in a zone hit by ${alert.estimatedHailSize}" hail on ${formatDateLabel(alert.stormDate)}.`
    : 'You entered a nearby hail zone.';

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        tag: `storm-map-${alert.stormDate ?? 'hail-zone'}`,
        renotify: true,
        data: { type: 'storm_alert' },
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      });
      return;
    }
  } catch {
    // Fall back to the page context notification below.
  }

  new Notification(title, {
    body,
    tag: `storm-map-${alert.stormDate ?? 'hail-zone'}`,
  });
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

function MapInteractionHandler({
  routeMode,
  onMapClick,
}: {
  routeMode: boolean;
  onMapClick: (lat: number, lng: number, routeMode: boolean) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = routeMode ? 'crosshair' : '';
    return () => {
      container.style.cursor = '';
    };
  }, [map, routeMode]);

  useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng, routeMode);
    },
  });

  return null;
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

  const MIN_SPAN_DEG = 1.0; // ~69 miles — ensures MRMS always has a meaningful search area

  const latSpan = Math.max(MIN_SPAN_DEG, bounds.north - bounds.south);
  const lngSpan = Math.max(MIN_SPAN_DEG, bounds.east - bounds.west);
  const latPad = latSpan * factor;
  const lngPad = lngSpan * factor;

  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;

  // Ensure final span is at least MIN_SPAN_DEG, then add padding on top
  const halfLat = Math.max(MIN_SPAN_DEG / 2, (bounds.north - bounds.south) / 2) + latPad;
  const halfLng = Math.max(MIN_SPAN_DEG / 2, (bounds.east - bounds.west) / 2) + lngPad;

  return {
    north: centerLat + halfLat,
    south: centerLat - halfLat,
    east: centerLng + halfLng,
    west: centerLng - halfLng,
  };
}

function getCoordinateBounds(coordinates: [number, number][]): BoundingBox | null {
  let bounds: BoundingBox | null = null;

  for (const [lat, lng] of coordinates) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    bounds = extendBounds(bounds, lat, lng);
  }

  return bounds;
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

function findNearestStormEvent(
  lat: number,
  lng: number,
  events: StormEvent[],
): { nearestEvent: StormEvent | null; distanceMiles: number | null } {
  let nearestEvent: StormEvent | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const event of events) {
    if (!Number.isFinite(event.beginLat) || !Number.isFinite(event.beginLon)) {
      continue;
    }

    const distance = haversineDistanceMiles(lat, lng, event.beginLat, event.beginLon);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestEvent = event;
    }
  }

  if (!nearestEvent || !Number.isFinite(nearestDistance)) {
    return { nearestEvent: null, distanceMiles: null };
  }

  return {
    nearestEvent,
    distanceMiles: nearestDistance,
  };
}

function toPlanarMiles(point: [number, number], originLat: number): [number, number] {
  const milesPerLat = 69;
  const milesPerLng = Math.cos((originLat * Math.PI) / 180) * 69;
  return [point[1] * milesPerLng, point[0] * milesPerLat];
}

function distancePointToSegmentMiles(
  point: [number, number],
  segmentStart: [number, number],
  segmentEnd: [number, number],
): number {
  const originLat = (point[0] + segmentStart[0] + segmentEnd[0]) / 3;
  const [px, py] = toPlanarMiles(point, originLat);
  const [ax, ay] = toPlanarMiles(segmentStart, originLat);
  const [bx, by] = toPlanarMiles(segmentEnd, originLat);
  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const projection = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  const t = Math.max(0, Math.min(1, projection));
  const closestX = ax + dx * t;
  const closestY = ay + dy * t;
  return Math.hypot(px - closestX, py - closestY);
}

function distancePointToRouteMiles(point: [number, number], routeCoordinates: [number, number][]): number {
  if (routeCoordinates.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (routeCoordinates.length === 1) {
    return haversineDistanceMiles(point[0], point[1], routeCoordinates[0][0], routeCoordinates[0][1]);
  }

  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < routeCoordinates.length - 1; index += 1) {
    nearest = Math.min(
      nearest,
      distancePointToSegmentMiles(point, routeCoordinates[index], routeCoordinates[index + 1]),
    );
  }
  return nearest;
}

function summarizeRouteEvents(routeCoordinates: [number, number][], events: StormEvent[], corridorMiles = 1): RouteSummary {
  const dateKeys = new Set<string>();
  let eventCount = 0;
  let maxHailInches = 0;
  let maxWindMph = 0;

  for (const event of events) {
    if (!Number.isFinite(event.beginLat) || !Number.isFinite(event.beginLon)) {
      continue;
    }

    const distanceToRoute = distancePointToRouteMiles(
      [event.beginLat, event.beginLon],
      routeCoordinates,
    );

    if (distanceToRoute > corridorMiles) {
      continue;
    }

    eventCount += 1;
    const dateKey = getStormDateKey(event.beginDate);
    if (dateKey) {
      dateKeys.add(dateKey);
    }
    if (event.eventType === 'Hail') {
      maxHailInches = Math.max(maxHailInches, event.magnitude);
    }
    if (event.eventType === 'Thunderstorm Wind') {
      maxWindMph = Math.max(maxWindMph, event.magnitude);
    }
  }

  return {
    eventCount,
    maxHailInches,
    maxWindMph,
    dateKeys: Array.from(dateKeys).sort((a, b) => b.localeCompare(a)),
  };
}

async function fetchRouteData(
  origin: [number, number],
  destination: [number, number],
  events: StormEvent[],
  signal?: AbortSignal,
): Promise<RouteData> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${origin[1]},${origin[0]};${destination[1]},${destination[0]}` +
    `?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`OSRM returned ${response.status}`);
    }

    const data = await response.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) {
      throw new Error('No route geometry returned');
    }

    const coordinates = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
    );

    return {
      coordinates,
      distanceMiles: Number(route.distance || 0) / 1609.344,
      durationMinutes: route.duration ? Number(route.duration) / 60 : null,
      summary: summarizeRouteEvents(coordinates, events),
      destination,
    };
  } catch {
    const fallbackCoordinates: [number, number][] = [origin, destination];
    return {
      coordinates: fallbackCoordinates,
      distanceMiles: haversineDistanceMiles(origin[0], origin[1], destination[0], destination[1]),
      durationMinutes: null,
      summary: summarizeRouteEvents(fallbackCoordinates, events),
      destination,
    };
  }
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

export default function TerritoryHailMap({ setActivePanel }: TerritoryHailMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  const [fitBoundsRequest, setFitBoundsRequest] = useState<FitBoundsRequest | null>(null);
  const [baseMap, setBaseMap] = useState<'map' | 'satellite'>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchLabel, setActiveSearchLabel] = useState<string | null>(null);
  const [searchLat, setSearchLat] = useState<number | null>(DEFAULT_CENTER[0]);
  const [searchLng, setSearchLng] = useState<number | null>(DEFAULT_CENTER[1]);
  const [searchSummary, setSearchSummary] = useState<PropertySearchSummary | null>(null);
  // Default widened from '2y' to '5y' after the NOAA NCEI historical backfill
  // extended our tagged coverage back to 2015. Reps asking "did this address
  // ever get hit?" now see 5 years by default; the picker still goes up to 10y.
  const [historyRange, setHistoryRange] = useState<HistoryRangePreset>('5y');
  const [sinceDate, setSinceDate] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('recent');
  const [eventFilters, setEventFilters] = useState<EventFilterState>({ hail: true, wind: false });
  const [selectedDate, setSelectedDate] = useState<StormDate | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [events, setEvents] = useState<StormEvent[]>([]);
  const [stormDates, setStormDates] = useState<StormDate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Swath-first tiered impact for the searched address — shipped 2026-04-23
  // after Cub Stream Dr "1.7 miles away" bug. Populates when the search is
  // an address/postal-code and we get lat+lng back.
  const [addressImpact, setAddressImpact] = useState<AddressImpactReport | null>(null);
  const [addressImpactLoading, setAddressImpactLoading] = useState(false);
  // Show light-hail (<0.5") direct hits? Default off — radar-band edges dilute
  // the headline. Rep can toggle on for full transparency.
  const [showLightHail, setShowLightHail] = useState(false);
  // Distance range for result filtering. Default 3 mi (direct + near-miss only).
  // Drag up to 15 mi to include neighborhood-area context.
  const [maxDistanceMi, setMaxDistanceMi] = useState<number>(3);
  // Verify-date: rep types a date from HailTrace/Hail Recon, we check on-demand.
  const [verifyDateInput, setVerifyDateInput] = useState<string>('');
  const [verifyResult, setVerifyResult] = useState<VerifyDateResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [gpsPosition, setGpsPosition] = useState<GpsPosition | null>(null);
  const [gpsTracking, setGpsTracking] = useState(false);
  const [canvassingBanner, setCanvassingBanner] = useState<CanvassingAlert | null>(null);
  const [mrmsVisible, setMrmsVisible] = useState(false);
  // Live MRMS radar is always ON — reps always want current hail visibility.
  // Previously a toggle; user feedback: "live should not be a button, it should just be on."
  const [liveMrmsVisible] = useState(true);
  const [liveMrmsInfo, setLiveMrmsInfo] = useState<{ hasFeatures: boolean; maxInches: number; refTime: string } | null>(null);
  const [swathVisible, setSwathVisible] = useState(true);
  const [routeMode, setRouteMode] = useState(false);
  const [mapClickInsight, setMapClickInsight] = useState<MapClickInsight | null>(null);
  const [mapClickAddress, setMapClickAddress] = useState<string | null>(null);
  const [mapClickAddressLoading, setMapClickAddressLoading] = useState(false);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [routePendingDestination, setRoutePendingDestination] = useState<[number, number] | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [showDolModal, setShowDolModal] = useState(false);
  // Legacy single-date state kept for back-compat with places that still read it.
  const [selectedDol, setSelectedDol] = useState('');
  const [customerNameInput, setCustomerNameInput] = useState('');
  // Multi-date report mode: 'single' | 'multi' | 'range' | 'lifetime'.
  // Wired to the backend /hail/generate-report which accepts any of
  // { dateOfLoss } | { datesOfLoss[] } | { fromDate, toDate } | {} (lifetime).
  const [reportMode, setReportMode] = useState<'single' | 'multi' | 'range' | 'lifetime'>('single');
  const [selectedDolMulti, setSelectedDolMulti] = useState<string[]>([]);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [trackingProperty, setTrackingProperty] = useState(false);
  const [propertyTracked, setPropertyTracked] = useState(false);
  const gpsWatchRef = useRef<number | null>(null);
  const gpsAutoCenteredRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const routeOriginRef = useRef<[number, number] | null>(null);
  const canvassingCooldownRef = useRef(new Map<string, number>());
  const canvassingDismissRef = useRef<number | null>(null);
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

  // Swath-direct-hit date keys — if an address is searched AND the property
  // sits inside the MRMS swath polygon for that date, it's authoritatively a
  // HAIL date even if the stormDate aggregate doesn't carry a size (can happen
  // when only NHP line data or radar-only evidence is available).
  const directHitDateKeys = useMemo(() => {
    const s = new Set<string>();
    for (const d of addressImpact?.directHits || []) {
      const k = getStormDateKey(d.date);
      if (k) s.add(k);
    }
    return s;
  }, [addressImpact]);

  const filteredStormDates = useMemo(() => {
    let sourceDates = eventFilters.hail && eventFilters.wind
      ? stormDates
      : stormDates.filter((stormDate) => {
        // Swath direct hit IS hail — always pass Hail filter regardless of
        // aggregated point-report size. This fixes the "5/16 shows under
        // Wind but not Hail" bug when the swath covers the property but
        // the hail point reports are too small / distant to populate
        // maxHailInches.
        const hasHail = stormDate.maxHailInches > 0 || directHitDateKeys.has(stormDate.date);
        const hasWind = stormDate.maxWindMph > 0;
        return (eventFilters.hail && hasHail) || (eventFilters.wind && hasWind);
      });

    // When an address or ZIP is searched, only show dates with events that actually
    // affected the property. Swath-direct-hits always pass (property is in the
    // polygon regardless of nearest-point distance). For non-direct dates,
    // honor the user's distance-slider setting.
    if (searchSummary && (searchSummary.resultType === 'address' || searchSummary.resultType === 'postal_code')) {
      sourceDates = sourceDates.filter((sd) => {
        if (directHitDateKeys.has(sd.date)) return true; // always keep direct hits
        const m = sd.closestHailMiles ?? sd.closestMiles;
        return m != null && m <= maxDistanceMi;
      });
    }

    return sourceDates.sort((a, b) => b.date.localeCompare(a.date));
  }, [eventFilters.hail, eventFilters.wind, searchSummary, stormDates, directHitDateKeys, maxDistanceMi]);

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

  // Apply rep-facing filters (light-hail toggle + distance slider) to the
  // swath-based tiered impact before anything renders. directHits are
  // swath-based (no distance) so only the light-hail filter applies; near-miss
  // and area-impact respect the distance slider.
  const filteredAddressImpact = useMemo<AddressImpactReport | null>(() => {
    if (!addressImpact) return null;
    const keepDirect = (e: { maxHailInches: number | null }) =>
      showLightHail || (e.maxHailInches ?? 0) >= 0.5;
    const keepByDistance = (e: { nearestMiles?: number; maxHailInches: number | null }) =>
      (e.nearestMiles ?? 999) <= maxDistanceMi && (showLightHail || (e.maxHailInches ?? 0) >= 0.5);
    const dh = addressImpact.directHits.filter(keepDirect);
    const nm = addressImpact.nearMiss.filter(keepByDistance);
    const ai = addressImpact.areaImpact.filter(keepByDistance);
    return {
      ...addressImpact,
      directHits: dh,
      nearMiss: nm,
      areaImpact: ai,
      summary: {
        ...addressImpact.summary,
        directHitCount: dh.length,
        nearMissCount: nm.length,
        areaImpactCount: ai.length,
      },
    };
  }, [addressImpact, showLightHail, maxDistanceMi]);

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

    // Fallback: if we have a selectedDate but ZERO events for it in the
    // currently-loaded window (because /search is capped at 5000 and the
    // date came from the storm-days MV aggregate), we'd have no bounds
    // and the swath layer would never fetch. Use a ~25mi box around the
    // searched address (or map center) so the swath query has SOMETHING
    // to query against. The backend trims to the actual storm footprint.
    if (!bounds && Number.isFinite(searchLat) && Number.isFinite(searchLng)) {
      const deg = 0.4; // ~28 mi lat; lng narrows naturally at this latitude
      bounds = {
        north: searchLat + deg,
        south: searchLat - deg,
        east: searchLng + deg,
        west: searchLng - deg,
      };
    }

    return padBounds(bounds, 0.22);
  }, [selectedDate, selectedStormEvents, searchLat, searchLng]);

  const selectedStormCenter = useMemo(
    () => getBoundsCenter(selectedStormBounds, mapCenter),
    [mapCenter, selectedStormBounds],
  );

  const showHistoricalHailOverlay = Boolean(swathVisible && selectedDate && selectedStormBounds);
  // When vector swath polygons are available, hide the blurry raster overlay beneath them.
  // While vectors are loading (vectorSwathLoaded=false), the raster stays visible so reps
  // aren't staring at an empty map for 2-5s during the GRIB decode.
  const [vectorSwathLoaded, setVectorSwathLoaded] = useState(false);
  const historicalMrmsLayerVisible = showHistoricalHailOverlay && !vectorSwathLoaded;
  const mrmsLayerVisible = mrmsVisible || historicalMrmsLayerVisible;

  const routeOrigin = useMemo<[number, number] | null>(() => {
    if (gpsPosition) {
      return [gpsPosition.lat, gpsPosition.lng];
    }
    if (searchLat !== null && searchLng !== null) {
      return [searchLat, searchLng];
    }
    return mapCenter;
  }, [gpsPosition, mapCenter, searchLat, searchLng]);

  const selectedStormRadarTimestamp = useMemo(() => {
    if (!selectedDate) {
      return new Date().toISOString();
    }

    return getSelectedStormRadarTimestamp(selectedDate.date, selectedStormEvents);
  }, [selectedDate, selectedStormEvents]);

  const mapClickLocationLabel = useMemo(() => {
    if (!mapClickInsight) {
      return null;
    }
    if (mapClickAddress) {
      return mapClickAddress;
    }
    if (mapClickInsight.nearestEvent?.county) {
      return `${mapClickInsight.nearestEvent.county}, ${mapClickInsight.nearestEvent.state}`;
    }
    if (mapClickInsight.nearestEvent?.source) {
      return `Near ${mapClickInsight.nearestEvent.source}`;
    }
    return 'Address unavailable';
  }, [mapClickAddress, mapClickInsight]);

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
      // Three parallel fetches:
      //   1. /hail/search       — row-level events (for markers), capped at
      //                           5000 rows → good for ≤24mo windows
      //   2. NHP MESH swaths    — track-geometry overlay
      //   3. /hail/storm-days   — aggregate date list covering the full
      //                           window (5-10+ years) so the side panel
      //                           lists every storm day without pulling
      //                           hundreds of thousands of rows
      const [apiEvents, nhpSwaths, stormDayAggregate] = await Promise.allSettled([
        fetchStormEvents(searchLat, searchLng, months, activeRadiusMiles, controller.signal),
        fetchMeshSwathsByLocation(searchLat, searchLng, months, activeRadiusMiles, effectiveSinceDate, controller.signal),
        fetchStormDays(searchLat, searchLng, months, activeRadiusMiles, controller.signal),
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

      // Convert the /storm-days aggregate into the StormDate shape the side
      // panel already renders. One StormDate per unique date (dedup across
      // state/bucket rows that share a date).
      const aggregateDates: StormDate[] = (() => {
        if (stormDayAggregate.status !== 'fulfilled' || !stormDayAggregate.value) return [];
        const byDate = new Map<string, { maxHail: number; maxWind: number; count: number; states: Set<string> }>();
        for (const d of stormDayAggregate.value.storm_days) {
          if (!isDateInRange(d.date, effectiveSinceDate)) continue;
          const agg = byDate.get(d.date) || { maxHail: 0, maxWind: 0, count: 0, states: new Set<string>() };
          agg.maxHail = Math.max(agg.maxHail, Number(d.max_hail) || 0);
          agg.maxWind = Math.max(agg.maxWind, Number(d.max_wind) || 0);
          agg.count += Number(d.report_count) || 0;
          if (d.state) agg.states.add(d.state);
          byDate.set(d.date, agg);
        }
        return Array.from(byDate.entries()).map(([date, agg]): StormDate => ({
          date,
          label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
            timeZone: 'America/New_York',
          }),
          eventCount: agg.count,
          maxHailInches: agg.maxHail,
          maxWindMph: agg.maxWind,
          statesAffected: Array.from(agg.states),
          closestMiles: null,
          closestHailMiles: null,
          closestWindMiles: null,
        }));
      })();

      setEvents(dedupedEvents);
      setStormDates(mergeDateLists(
        mergeDateLists(groupEventsByDate(dedupedEvents), swathDates),
        aggregateDates,
      ));

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

  // Swath-first tiered impact for the searched address. Only fires for
  // address / postal-code searches — for city/region searches, the tiered
  // lookup isn't meaningful (the centroid isn't the rep's property).
  useEffect(() => {
    if (!searchSummary || !searchLat || !searchLng) {
      setAddressImpact(null);
      return;
    }
    if (searchSummary.resultType !== 'address' && searchSummary.resultType !== 'postal_code') {
      setAddressImpact(null);
      return;
    }
    const controller = new AbortController();
    setAddressImpactLoading(true);
    setAddressImpact(null);
    const months =
      historyRange === 'since'
        ? getEffectiveMonths(12, sinceDate || null)
        : rangeToMonths(historyRange);
    void (async () => {
      const report = await fetchAddressImpact(searchLat, searchLng, months, controller.signal);
      if (!controller.signal.aborted) {
        setAddressImpact(report);
        setAddressImpactLoading(false);
      }
    })();
    return () => controller.abort();
  }, [searchLat, searchLng, searchSummary?.resultType, historyRange, sinceDate]);

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
      setPropertyTracked(false);
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
      gpsAutoCenteredRef.current = false;
      setGpsTracking(false);
      setGpsPosition(null);
      setCanvassingBanner(null);
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

    setGpsTracking(true);
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }
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
      if (canvassingDismissRef.current !== null) {
        window.clearTimeout(canvassingDismissRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!gpsTracking || !gpsPosition || gpsAutoCenteredRef.current) {
      return;
    }

    gpsAutoCenteredRef.current = true;
    const bounds = {
      north: gpsPosition.lat + GPS_FOCUS_PAD_DEGREES,
      south: gpsPosition.lat - GPS_FOCUS_PAD_DEGREES,
      east: gpsPosition.lng + GPS_FOCUS_PAD_DEGREES,
      west: gpsPosition.lng - GPS_FOCUS_PAD_DEGREES,
    };

    setMapCenter([gpsPosition.lat, gpsPosition.lng]);
    setMapZoom(15);
    setFitBoundsRequest({
      id: Date.now(),
      bounds,
      maxZoom: 16,
    });
  }, [gpsPosition, gpsTracking]);

  useEffect(() => {
    if (!canvassingAlert?.inHailZone) {
      return;
    }

    const alertKey = `${canvassingAlert.stormDate ?? 'unknown'}:${canvassingAlert.estimatedHailSize ?? 'na'}`;
    const now = Date.now();
    const lastShownAt = canvassingCooldownRef.current.get(alertKey) ?? 0;
    if (now - lastShownAt < CANVASSING_ALERT_COOLDOWN_MS) {
      return;
    }

    canvassingCooldownRef.current.set(alertKey, now);
    setCanvassingBanner(canvassingAlert);

    if (canvassingDismissRef.current !== null) {
      window.clearTimeout(canvassingDismissRef.current);
    }
    canvassingDismissRef.current = window.setTimeout(() => {
      setCanvassingBanner((current) => (current?.stormDate === canvassingAlert.stormDate ? null : current));
    }, CANVASSING_ALERT_AUTO_DISMISS_MS);

    void showStormMapNotification(canvassingAlert);
  }, [canvassingAlert]);

  const handleGenerateReport = useCallback(async () => {
    if (searchLat === null || searchLng === null) {
      return;
    }

    // Translate mode state → a single options object the helper understands.
    const reportOptions: import('./stormMapHelpers').GenerateStormReportOptions = { customerName: customerNameInput };
    if (reportMode === 'single') {
      if (!selectedDol) return;
      reportOptions.dateOfLoss = selectedDol;
    } else if (reportMode === 'multi') {
      if (selectedDolMulti.length === 0) return;
      if (selectedDolMulti.length === 1) {
        reportOptions.dateOfLoss = selectedDolMulti[0];
      } else {
        reportOptions.datesOfLoss = selectedDolMulti.slice().sort();
      }
    } else if (reportMode === 'range') {
      if (!rangeFrom || !rangeTo) return;
      if (rangeFrom > rangeTo) {
        setError('Range start must be before end.');
        return;
      }
      reportOptions.fromDate = rangeFrom;
      reportOptions.toDate = rangeTo;
    } else if (reportMode === 'lifetime') {
      reportOptions.lifetime = true;
    }

    const reportAddress = activeSearchLabel || searchSummary?.locationLabel || 'DMV Region';

    setGeneratingReport(true);
    setError(null);
    setReportMessage(null);
    try {
      await generateStormReport(
        reportAddress,
        searchLat,
        searchLng,
        activeRadiusMiles,
        events,
        reportOptions,
      );
      setReportMessage('PDF ready. Check your browser downloads if it did not open automatically.');
      setShowDolModal(false);
    } catch (reportError) {
      setReportMessage(null);
      setError(reportError instanceof Error ? reportError.message : 'Report generation failed');
    } finally {
      setGeneratingReport(false);
    }
  }, [
    activeRadiusMiles, activeSearchLabel, customerNameInput, events,
    rangeFrom, rangeTo, reportMode, searchLat, searchLng,
    searchSummary?.locationLabel, selectedDol, selectedDolMulti,
  ]);

  const openDolModal = useCallback(() => {
    setReportMessage(null);
    const primary = selectedDate?.date || latestStorms[0]?.date || '';
    setSelectedDol(primary);
    setSelectedDolMulti(primary ? [primary] : []);
    setReportMode('single');
    setRangeFrom('');
    setRangeTo('');
    setCustomerNameInput('');
    setShowDolModal(true);
  }, [latestStorms, selectedDate]);

  const centerOnGps = useCallback(() => {
    if (!gpsPosition) {
      return;
    }

    const bounds = {
      north: gpsPosition.lat + GPS_FOCUS_PAD_DEGREES,
      south: gpsPosition.lat - GPS_FOCUS_PAD_DEGREES,
      east: gpsPosition.lng + GPS_FOCUS_PAD_DEGREES,
      west: gpsPosition.lng - GPS_FOCUS_PAD_DEGREES,
    };

    setMapCenter([gpsPosition.lat, gpsPosition.lng]);
    setMapZoom(15);
    setFitBoundsRequest({
      id: Date.now(),
      bounds,
      maxZoom: 17,
    });
  }, [gpsPosition]);

  const handleEventFilterSelect = useCallback((type: 'hail' | 'wind') => {
    setEventFilters(type === 'hail' ? { hail: true, wind: false } : { hail: false, wind: true });
    setSelectedDate(null);
    setExpandedDate(null);
    setMapClickInsight(null);
  }, []);

  const handleBuildRoute = useCallback(
    async (destination: [number, number]) => {
      if (!routeOrigin) {
        setRouteError('Route mode needs GPS or a searched location as the starting point.');
        return;
      }

      routeAbortRef.current?.abort();
      const controller = new AbortController();
      routeAbortRef.current = controller;
      routeOriginRef.current = routeOrigin;
      setRoutePendingDestination(destination);
      setRouteLoading(true);
      setRouteError(null);

      try {
        const nextRoute = await fetchRouteData(routeOrigin, destination, filteredEvents, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setRouteData(nextRoute);
        setRoutePendingDestination(null);
        const routeBounds = padBounds(getCoordinateBounds(nextRoute.coordinates), 0.12);
        if (routeBounds) {
          setFitBoundsRequest({
            id: Date.now(),
            bounds: routeBounds,
            maxZoom: 13,
          });
        }
      } catch (routeFetchError) {
        if (!controller.signal.aborted) {
          setRouteError(routeFetchError instanceof Error ? routeFetchError.message : 'Failed to build route');
        }
      } finally {
        if (!controller.signal.aborted) {
          setRouteLoading(false);
          setRoutePendingDestination(null);
        }
      }
    },
    [filteredEvents, routeOrigin],
  );

  const handleMapInteraction = useCallback(
    (lat: number, lng: number, routeModeEnabled: boolean) => {
      if (routeModeEnabled) {
        void handleBuildRoute([lat, lng]);
        setMapClickInsight(null);
        return;
      }

      const { nearestEvent, distanceMiles } = findNearestStormEvent(lat, lng, filteredEvents);
      setMapClickInsight({
        lat,
        lng,
        nearestEvent,
        distanceMiles,
      });

      const selectedDateKey = nearestEvent ? getStormDateKey(nearestEvent.beginDate) : null;
      if (selectedDateKey) {
        const matchingStormDate = stormDates.find((stormDate) => stormDate.date === selectedDateKey) || null;
        setSelectedDate(matchingStormDate);
      }
    },
    [filteredEvents, handleBuildRoute, stormDates],
  );

  useEffect(() => {
    if (!mapClickInsight || routeMode) {
      setMapClickAddress(null);
      setMapClickAddressLoading(false);
      return;
    }

    let cancelled = false;
    setMapClickAddress(null);
    setMapClickAddressLoading(true);

    void reverseGeocodeLatLng(mapClickInsight.lat, mapClickInsight.lng)
      .then((address) => {
        if (!cancelled) {
          setMapClickAddress(address);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMapClickAddressLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mapClickInsight, routeMode]);

  useEffect(() => {
    if (!routeMode || !routeData || !routeOrigin || !gpsPosition) {
      return;
    }

    const previousOrigin = routeOriginRef.current;
    if (
      previousOrigin &&
      haversineDistanceMiles(previousOrigin[0], previousOrigin[1], routeOrigin[0], routeOrigin[1]) < 0.15
    ) {
      return;
    }

    void handleBuildRoute(routeData.destination);
  }, [gpsPosition, handleBuildRoute, routeData, routeMode, routeOrigin]);

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
          height: '100%',
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

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
        <form onSubmit={handleSearch} style={{ padding: 12, borderBottom: '1px solid #1f2937' }}>
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
          {/* Distance slider + small-hail toggle — apply to address-impact panels
              so reps can dial from "at the property" to "neighborhood area". */}
          {searchSummary && (searchSummary.resultType === 'address' || searchSummary.resultType === 'postal_code') && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#6b7280' }}>Distance Range</p>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#d1d5db' }}>{maxDistanceMi <= 1 ? 'at property' : `≤ ${maxDistanceMi} mi`}</span>
              </div>
              <input
                type="range"
                min={1}
                max={15}
                step={1}
                value={maxDistanceMi}
                onChange={(e) => setMaxDistanceMi(Number(e.target.value))}
                aria-label="Maximum distance from property"
                style={{ width: '100%', accentColor: '#ef4444' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 9, color: '#4b5563' }}>
                <span>1</span><span>3</span><span>5</span><span>10</span><span>15</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontSize: 12, color: '#d1d5db' }}>
                <input
                  type="checkbox"
                  checked={showLightHail}
                  onChange={(e) => setShowLightHail(e.target.checked)}
                  style={{ accentColor: '#ef4444' }}
                />
                Show light hail (&lt; 0.5&quot;)
                <span style={{ fontSize: 10, color: '#6b7280' }}>
                  — radar-band edges
                </span>
              </label>
            </div>
          )}
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
            {!loading && (() => {
              // Prefer DIRECT HIT from swath-based tiered impact over nearest-point
              // distance. Reps need the authoritative "property got hit" signal
              // first — the old "Last hit X mi away" was losing claims.
              // Rank by hail size DESC so the biggest direct hit always leads,
              // then most-recent as tiebreak. 3" softball beats recent 0.5" drizzle.
              const bestDirectHit = [...(filteredAddressImpact?.directHits || [])]
                .sort((a, b) => (b.maxHailInches || 0) - (a.maxHailInches || 0) || b.date.localeCompare(a.date))[0];
              if (bestDirectHit) {
                const dateLabel = formatDateLabel(bestDirectHit.date);
                return (
                  <p style={{ marginTop: 4, fontSize: 12, color: '#10b981', fontWeight: 600 }}>
                    🎯 DIRECT HIT {dateLabel} · {formatHailTier(bestDirectHit.maxHailInches)} MRMS swath
                    {bestDirectHit.noaaConfirmed ? ' · NOAA ✓' : ''}
                  </p>
                );
              }
              if (latestStorms[0]) {
                return (
                  <p style={{ marginTop: 4, fontSize: 12, color: '#fcd34d' }}>
                    Nearest verified: {latestStorms[0].label} · {formatStormImpactSummary(latestStorms[0])}
                  </p>
                );
              }
              return null;
            })()}
          </div>
        )}

        {/* Swath-first tiered impact — Direct Hit / Near Miss / Area Impact.
            Shipped 2026-04-23 after Cub Stream Dr "1.7 miles away" incident. */}
        {searchSummary && (searchSummary.resultType === 'address' || searchSummary.resultType === 'postal_code') && (addressImpactLoading || addressImpact) && (
          <div style={{ borderBottom: '1px solid #1f2937', padding: 12, flexShrink: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#6b7280', margin: 0 }}>
              Swath Impact Analysis
            </p>
            {addressImpactLoading && (
              <p style={{ marginTop: 6, fontSize: 12, color: '#9ca3af' }}>
                Checking MRMS swath polygons at this property...
              </p>
            )}
            {filteredAddressImpact && !addressImpactLoading && (
              <>
                {filteredAddressImpact.directHits.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', letterSpacing: '0.08em' }}>🎯 DIRECT HITS</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>({filteredAddressImpact.directHits.length})</span>
                    </div>
                    {filteredAddressImpact.directHits.slice(0, 6).map((d) => (
                      <button
                        key={`dh-${d.date}`}
                        onClick={() => {
                          const key = getStormDateKey(d.date);
                          if (!key) return;
                          const match = stormDates.find((sd) => getStormDateKey(sd.date) === key);
                          if (match) setSelectedDate(match);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 8px',
                          marginTop: 4,
                          background: 'rgba(16, 185, 129, 0.08)',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          borderRadius: 4,
                          color: '#d1fae5',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          {formatDateLabel(d.date)} — {formatHailTier(d.maxHailInches)} MRMS swath
                        </div>
                        <div style={{ fontSize: 11, color: '#86efac', marginTop: 2 }}>
                          {d.confirmingReportCount} confirming report{d.confirmingReportCount === 1 ? '' : 's'} within 2mi
                          {d.noaaConfirmed ? ' · NOAA ✓' : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {filteredAddressImpact.nearMiss.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.08em' }}>AT LOCATION</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>({filteredAddressImpact.nearMiss.length})</span>
                      <span style={{ fontSize: 10, color: '#6b7280' }}>≤{maxDistanceMi}mi, no swath</span>
                    </div>
                    {filteredAddressImpact.nearMiss.slice(0, 4).map((n) => (
                      <div key={`nm-${n.date}`} style={{ padding: '4px 8px', marginTop: 3, fontSize: 12, color: '#fcd34d' }}>
                        {formatDateLabel(n.date)} — up to {formatHailTier(n.maxHailInches)} at {n.nearestMiles?.toFixed(1) ?? '-'}mi
                        {n.noaaConfirmed ? ' · NOAA ✓' : ''}
                      </div>
                    ))}
                  </div>
                )}
                {filteredAddressImpact.areaImpact.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em' }}>AREA IMPACT</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>({filteredAddressImpact.areaImpact.length})</span>
                      <span style={{ fontSize: 10, color: '#6b7280' }}>3–{maxDistanceMi}mi context</span>
                    </div>
                    {filteredAddressImpact.areaImpact.slice(0, 3).map((a) => (
                      <div key={`ai-${a.date}`} style={{ padding: '3px 8px', marginTop: 2, fontSize: 11, color: '#94a3b8' }}>
                        {formatDateLabel(a.date)} — up to {formatHailTier(a.maxHailInches)} at {a.nearestMiles?.toFixed(1) ?? '-'}mi
                      </div>
                    ))}
                  </div>
                )}
                {filteredAddressImpact.directHits.length === 0 && filteredAddressImpact.nearMiss.length === 0 && filteredAddressImpact.areaImpact.length === 0 && (
                  <p style={{ marginTop: 6, fontSize: 12, color: '#9ca3af' }}>
                    {addressImpact && (addressImpact.directHits.length + addressImpact.nearMiss.length + addressImpact.areaImpact.length) > 0
                      ? `All hits are ${showLightHail ? '' : '< 0.5" or '}outside ${maxDistanceMi} mi — widen the distance or enable light hail to see more.`
                      : `No verified hail at or near this property in our NOAA/NWS/NEXRAD/MRMS database for the last ${addressImpact?.monthsBack ?? 24} months.`}
                  </p>
                )}
                {(() => {
                  // Footnote hidden items so reps know the filters are active
                  if (!addressImpact) return null;
                  const hiddenLight = !showLightHail
                    ? addressImpact.directHits.filter((d) => (d.maxHailInches ?? 0) < 0.5).length +
                      addressImpact.nearMiss.filter((n) => (n.maxHailInches ?? 0) < 0.5).length +
                      addressImpact.areaImpact.filter((a) => (a.maxHailInches ?? 0) < 0.5).length
                    : 0;
                  const hiddenDistance =
                    addressImpact.nearMiss.filter((n) => (n.nearestMiles ?? 999) > maxDistanceMi).length +
                    addressImpact.areaImpact.filter((a) => (a.nearestMiles ?? 999) > maxDistanceMi).length;
                  if (hiddenLight === 0 && hiddenDistance === 0) return null;
                  return (
                    <p style={{ marginTop: 6, fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>
                      Hidden by filters:{' '}
                      {hiddenLight > 0 && <>{hiddenLight} light hail day{hiddenLight === 1 ? '' : 's'} (&lt; 1/2&quot;)</>}
                      {hiddenLight > 0 && hiddenDistance > 0 && ', '}
                      {hiddenDistance > 0 && <>{hiddenDistance} beyond {maxDistanceMi} mi</>}
                      . Toggle filters above.
                    </p>
                  );
                })()}
                {addressImpact && (addressImpact.cacheStats.swathColdFetches > 0 || addressImpact.cacheStats.swathSkippedDueToCap > 0) && (
                  <p style={{ marginTop: 6, fontSize: 10, color: '#6b7280' }}>
                    {addressImpact.cacheStats.swathCacheHits} cached · {addressImpact.cacheStats.swathColdFetches} fetched · {addressImpact.cacheStats.swathSkippedDueToCap} deferred
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Verify-date: rep pastes a date from HailTrace/Hail Recon and we
            check authoritatively, triggering an on-demand swath fetch if that
            date isn't cached yet. Closes the "HailTrace says yes, we say no"
            complaint loop. */}
        {searchSummary && searchLat && searchLng && (searchSummary.resultType === 'address' || searchSummary.resultType === 'postal_code') && (
          <div style={{ borderBottom: '1px solid #1f2937', padding: 12, flexShrink: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#6b7280', margin: '0 0 6px 0' }}>
              Verify Another Source's Date
            </p>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 6px 0' }}>
              Rep brought you a date from HailTrace / Hail Recon? Drop it here and we'll check every source.
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="date"
                value={verifyDateInput}
                onChange={(e) => setVerifyDateInput(e.target.value)}
                aria-label="Date to verify"
                style={{
                  flex: 1,
                  borderRadius: 6,
                  border: '1px solid #374151',
                  background: '#111827',
                  color: '#fff',
                  padding: '6px 8px',
                  fontSize: 12,
                }}
              />
              <button
                type="button"
                disabled={!verifyDateInput || verifyLoading}
                onClick={async () => {
                  if (!verifyDateInput || !searchLat || !searchLng) return;
                  setVerifyLoading(true);
                  setVerifyResult(null);
                  const r = await verifyDate(searchLat, searchLng, verifyDateInput);
                  setVerifyResult(r);
                  setVerifyLoading(false);
                }}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: 'none',
                  cursor: !verifyDateInput || verifyLoading ? 'not-allowed' : 'pointer',
                  background: !verifyDateInput || verifyLoading ? '#1f2937' : '#ef4444',
                  color: '#fff',
                }}
              >
                {verifyLoading ? '...' : 'Check'}
              </button>
            </div>
            {verifyResult && (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 6,
                  fontSize: 12,
                  background:
                    verifyResult.confidence === 'high' ? 'rgba(16,185,129,0.1)'
                    : verifyResult.confidence === 'medium' ? 'rgba(251,191,36,0.1)'
                    : verifyResult.confidence === 'low' ? 'rgba(148,163,184,0.1)'
                    : 'rgba(156,163,175,0.05)',
                  border: `1px solid ${
                    verifyResult.confidence === 'high' ? 'rgba(16,185,129,0.4)'
                    : verifyResult.confidence === 'medium' ? 'rgba(251,191,36,0.4)'
                    : verifyResult.confidence === 'low' ? 'rgba(148,163,184,0.3)'
                    : 'rgba(75,85,99,0.3)'
                  }`,
                  color:
                    verifyResult.confidence === 'high' ? '#d1fae5'
                    : verifyResult.confidence === 'medium' ? '#fef3c7'
                    : verifyResult.confidence === 'low' ? '#e2e8f0'
                    : '#9ca3af',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{verifyResult.verdict}</div>
                {verifyResult.sources.length > 0 && (
                  <div style={{ fontSize: 11, opacity: 0.8 }}>
                    Sources: {verifyResult.sources.join(', ')}
                  </div>
                )}
                {verifyResult.topPointReports.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
                    Closest: {verifyResult.topPointReports[0].distanceMi}mi — {verifyResult.topPointReports[0].hail ? `${verifyResult.topPointReports[0].hail}" hail` : ''}
                    {verifyResult.topPointReports[0].wind ? ` ${verifyResult.topPointReports[0].wind}mph wind` : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {searchSummary && searchLat && searchLng && !loading && (
          <div style={{ padding: '0 12px 12px', flexShrink: 0 }}>
            <button
              onClick={async () => {
                if (propertyTracked || trackingProperty) return;
                setTrackingProperty(true);
                try {
                  const label = searchSummary.locationLabel || activeSearchLabel || '';
                  const parts = label.split(',').map(s => s.trim());
                  const result = await impactedAssetApi.addProperty({
                    customerName: customerNameInput || 'Property Owner',
                    address: parts[0] || label,
                    city: parts[1] || '',
                    state: searchSummary.resultType === 'postal_code' ? '' : (parts[2]?.split(' ')[0] || ''),
                    zipCode: parts[parts.length - 1]?.match(/\d{5}/)?.[0] || '',
                    latitude: searchLat!,
                    longitude: searchLng!,
                    notifyOnHail: true,
                    notifyOnWind: true,
                    notifyRadiusMiles: 10,
                  });
                  if (result) setPropertyTracked(true);
                } catch { /* silent */ }
                setTrackingProperty(false);
              }}
              disabled={trackingProperty || propertyTracked}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: propertyTracked ? '1px solid #22c55e' : '1px solid #374151',
                background: propertyTracked ? 'rgba(34,197,94,0.12)' : '#111827',
                color: propertyTracked ? '#86efac' : '#d1d5db',
                fontSize: 13,
                fontWeight: 600,
                cursor: propertyTracked ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s',
              }}
            >
              {propertyTracked ? (
                <><span style={{ fontSize: 16 }}>&#10003;</span> Property Tracked — Storm Alerts Active</>
              ) : trackingProperty ? (
                'Saving...'
              ) : (
                <><span style={{ fontSize: 16 }}>&#9888;</span> Track Property for Storm Alerts</>
              )}
            </button>
          </div>
        )}

        {canvassingBanner?.inHailZone && (
          <div
            style={{
              margin: 12,
              padding: 12,
              background: canvassingBanner.estimatedHailSize && canvassingBanner.estimatedHailSize >= 1 ? 'rgba(146,64,14,0.7)' : 'rgba(20,83,45,0.65)',
              border: canvassingBanner.estimatedHailSize && canvassingBanner.estimatedHailSize >= 1 ? '1px solid #f59e0b' : '1px solid #22c55e',
              borderRadius: 8,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: canvassingBanner.estimatedHailSize && canvassingBanner.estimatedHailSize >= 1 ? '#f59e0b' : '#4ade80', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: canvassingBanner.estimatedHailSize && canvassingBanner.estimatedHailSize >= 1 ? '#fde68a' : '#bbf7d0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hail Zone Alert</span>
            </div>
            <p style={{ fontSize: 13, color: '#fff7ed', fontWeight: 500, margin: 0 }}>
              You&apos;re in a zone hit by {canvassingBanner.estimatedHailSize}" hail on {canvassingBanner.stormDate ? formatDateLabel(canvassingBanner.stormDate) : 'a recent storm'}.
            </p>
            {canvassingBanner.talkingPoints[0] && (
              <p style={{ fontSize: 12, color: canvassingBanner.estimatedHailSize && canvassingBanner.estimatedHailSize >= 1 ? '#ffedd5' : '#dcfce7', marginTop: 4 }}>{canvassingBanner.talkingPoints[0]}</p>
            )}
          </div>
        )}

        {(() => {
          // Priority: DIRECT HITS (swath-based, largest first) > near-miss ≤3mi
          // from the old distance-based latestStorms list > nothing.
          // 3-15mi events are relegated to the full storm-date list below; they
          // are NOT the headline for the property.
          const direct = filteredAddressImpact?.directHits || [];
          const topDirect = [...direct]
            .sort((a, b) => (b.maxHailInches || 0) - (a.maxHailInches || 0))
            .slice(0, 2);
          // Count hidden light-hail events so we can footnote the rep
          const hiddenLight = !showLightHail && addressImpact
            ? addressImpact.directHits.filter((d) => (d.maxHailInches ?? 0) < 0.5).length
            : 0;

          if (topDirect.length > 0) {
            return (
              <div style={{ borderBottom: '1px solid #1f2937', padding: 12, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#10b981' }}>🎯 Direct Hits at Property</p>
                  <span style={{ fontSize: 10, color: '#4b5563' }}>biggest first</span>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {topDirect.map((d) => {
                    const key = getStormDateKey(d.date);
                    const matchingStormDate = stormDates.find((sd) => getStormDateKey(sd.date) === key);
                    const isSelected = selectedDate?.date === matchingStormDate?.date;
                    return (
                      <button
                        key={`dh-main-${d.date}`}
                        type="button"
                        onClick={() => {
                          if (matchingStormDate) {
                            setSelectedDate(isSelected ? null : matchingStormDate);
                          }
                        }}
                        style={{
                          borderRadius: 12,
                          border: isSelected ? '1px solid #10b981' : '1px solid rgba(16,185,129,0.4)',
                          background: isSelected ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.06)',
                          padding: '10px 12px',
                          textAlign: 'left',
                          cursor: matchingStormDate ? 'pointer' : 'default',
                        }}
                      >
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', margin: 0 }}>{formatDateLabel(d.date)}</p>
                        <p style={{ fontSize: 12, color: '#86efac', margin: '4px 0 0 0' }}>
                          <span style={{ fontWeight: 600 }}>DIRECT HIT</span> · {formatHailTier(d.maxHailInches)} MRMS swath · {d.confirmingReportCount} confirming{d.confirmingReportCount === 1 ? '' : 's'}
                          {d.noaaConfirmed ? ' · NOAA ✓' : ''}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {direct.length > 2 && (
                  <p style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
                    +{direct.length - 2} more direct hit{direct.length - 2 === 1 ? '' : 's'} — see full list below
                  </p>
                )}
                {hiddenLight > 0 && (
                  <p style={{ marginTop: 4, fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>
                    +{hiddenLight} light hail day{hiddenLight === 1 ? '' : 's'} (&lt; 1/2&quot;) hidden — toggle &quot;Show light hail&quot; above to include.
                  </p>
                )}
              </div>
            );
          }

          // Fallback: show nearest-point "latest two" only when they're within the
          // user's distance-slider setting (default 3mi, up to 15).
          const meaningfulLatest = latestStorms.filter((s) => {
            const m = s.closestHailMiles ?? s.closestMiles;
            return m != null && m <= maxDistanceMi;
          });
          if (meaningfulLatest.length === 0) return null;
          return (
            <div style={{ borderBottom: '1px solid #1f2937', padding: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#fcd34d' }}>At Location (≤{maxDistanceMi} mi)</p>
                <span style={{ fontSize: 10, color: '#4b5563' }}>no swath hit</span>
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {meaningfulLatest.map((stormDate) => (
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
                    <p style={{ fontSize: 12, color: '#fcd34d', margin: '4px 0 0 0' }}>
                      {stormDate.closestHailMiles != null && stormDate.closestHailMiles <= 1
                        ? <span style={{ fontWeight: 600 }}>Direct Hit (point)</span>
                        : stormDate.closestHailMiles != null
                          ? <span>{stormDate.closestHailMiles.toFixed(1)} mi</span>
                          : stormDate.closestMiles != null
                            ? <span>{stormDate.closestMiles.toFixed(1)} mi</span>
                            : null}
                      {(stormDate.closestHailMiles ?? stormDate.closestMiles) != null ? ' · ' : ''}{formatStormImpactSummary(stormDate)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

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
                onClick={() => handleEventFilterSelect(type)}
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

        <div>
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
          {reportMessage && (
            <div style={{ margin: 12, padding: 12, background: 'rgba(20,83,45,0.3)', border: '1px solid #166534', borderRadius: 8 }}>
              <p style={{ fontSize: 12, color: '#86efac', margin: 0 }}>{reportMessage}</p>
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
          {sortedDates.map((stormDate) => {
            // Cross-reference this date against the swath-first tiered impact
            // so the card shows "🎯 Direct Hit" when the property sits inside
            // the swath polygon for that date — regardless of what the
            // nearest point-report distance is saying.
            const sdKey = getStormDateKey(stormDate.date);
            const matchDirect = addressImpact?.directHits.find((d) => getStormDateKey(d.date) === sdKey);
            const matchNear = addressImpact?.nearMiss.find((n) => getStormDateKey(n.date) === sdKey);
            const matchArea = addressImpact?.areaImpact.find((a) => getStormDateKey(a.date) === sdKey);
            const impactTier: StormDateImpactTier = matchDirect
              ? 'direct-hit'
              : matchNear
                ? 'at-location'
                : matchArea
                  ? 'area'
                  : null;
            return (
              <StormDateCard
                key={stormDate.date}
                stormDate={stormDate}
                isSelected={selectedDate?.date === stormDate.date}
                isExpanded={expandedDate === stormDate.date}
                events={filteredEvents.filter((event) => getStormDateKey(event.beginDate) === stormDate.date)}
                impactTier={impactTier}
                swathSizeInches={matchDirect?.maxHailInches ?? null}
                onClick={() => setSelectedDate((previous) => previous?.date === stormDate.date ? null : stormDate)}
                onToggleExpand={(event) => {
                  event.stopPropagation();
                  setExpandedDate((previous) => previous === stormDate.date ? null : stormDate.date);
                }}
              />
            );
          })}
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
          {selectedDate && setActivePanel && (
            <button
              onClick={() => {
                const context = [
                  `I already looked up the storm data — don't run a hail lookup.`,
                  `Storm date: ${selectedDate.label}.`,
                  selectedDate.maxHailInches > 0 ? `Hail: ${selectedDate.maxHailInches}" confirmed.` : null,
                  selectedDate.maxWindMph > 0 ? `Wind: ${selectedDate.maxWindMph} mph.` : null,
                  `${selectedDate.eventCount} verified report${selectedDate.eventCount !== 1 ? 's' : ''} in ${selectedDate.statesAffected.join(', ')}.`,
                  activeSearchLabel ? `Area: near ${activeSearchLabel.split(',').slice(0, 2).join(',')}.` : null,
                  'Search the knowledge base for our door-knocking scripts and storm pitch talking points, then give me what to say at the door based on this specific storm data.',
                ].filter(Boolean).join(' ');
                localStorage.setItem('susan_storm_context', context);
                setActivePanel('chat');
              }}
              style={{
                width: '100%',
                marginTop: 8,
                borderRadius: 12,
                border: '1px solid #7c3aed',
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                background: 'transparent',
                color: '#a78bfa',
              }}
            >
              Ask Susan About This Storm
            </button>
          )}

          {selectedDate && (
            <div style={{ marginTop: 12 }}>
              <PropertyImpactPanel
                selectedDate={selectedDate.date}
                anchorTimestamp={selectedStormRadarTimestamp}
                userEmail={authService.getCurrentUser()?.email || null}
                onPropertyClick={(property) => {
                  setMapCenter([property.lat, property.lng]);
                  setMapZoom(17);
                  setFitBoundsRequest({
                    id: Date.now(),
                    bounds: {
                      north: property.lat + 0.005,
                      south: property.lat - 0.005,
                      east: property.lng + 0.005,
                      west: property.lng - 0.005,
                    },
                  });
                }}
              />
            </div>
          )}
        </div>
        </div>{/* end scrollable wrapper */}

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
          <MapInteractionHandler routeMode={routeMode} onMapClick={handleMapInteraction} />
          <TileLayer url={mapTileUrl} subdomains={['0', '1', '2', '3']} maxZoom={21} />

          {/* Hail Swath Contours — clustered convex hull polygons from ground reports.
              Shown ONLY when the vector swath polygons haven't loaded yet OR when
              we have no MRMS data for the selected date. Prevents the old "two
              overlapping differently-colored blobs" look. Palette now shared with
              the vector layer via hailPalette.ts so when contours and polygons do
              briefly co-exist, they agree on colors. */}
          <HailContourLayer
            visible={!!selectedDate && !vectorSwathLoaded}
            events={visibleEvents}
          />

          {/* Event markers */}
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
          {routeOrigin ? (
            <CircleMarker
              center={routeOrigin}
              radius={routeMode ? 6 : 5}
              pathOptions={{
                color: '#ffffff',
                fillColor: '#2563eb',
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Popup>Route origin</Popup>
            </CircleMarker>
          ) : null}
          {routeData ? (
            <>
              <CircleMarker
                center={routeData.destination}
                radius={7}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: '#ef4444',
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Popup>Route destination</Popup>
              </CircleMarker>
              <Polyline
                positions={routeData.coordinates}
                pathOptions={{
                  color: '#2563eb',
                  weight: 5,
                  opacity: 0.82,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </>
          ) : null}
          {routePendingDestination && !routeData ? (
            <CircleMarker
              center={routePendingDestination}
              radius={7}
              pathOptions={{
                color: '#ffffff',
                fillColor: '#ef4444',
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ) : null}
          {mapClickInsight ? (
            <CircleMarker
              center={[mapClickInsight.lat, mapClickInsight.lng]}
              radius={6}
              pathOptions={{
                color: '#ffffff',
                fillColor: '#ef4444',
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ) : null}
          <MRMSHailOverlay
            visible={mrmsLayerVisible}
            product="mesh1440"
            onToggle={() => setMrmsVisible((previous) => !previous)}
            selectedDate={selectedDate?.date ?? null}
            historicalBounds={selectedStormBounds}
            anchorTimestamp={selectedStormRadarTimestamp}
          />
          <MRMSSwathPolygonLayer
            visible={showHistoricalHailOverlay}
            selectedDate={selectedDate?.date ?? null}
            stormBounds={selectedStormBounds}
            anchorTimestamp={selectedStormRadarTimestamp}
            onDataLoaded={setVectorSwathLoaded}
          />
          <LiveMrmsPolygonLayer
            visible={liveMrmsVisible}
            product="mesh60"
            onDataLoaded={setLiveMrmsInfo}
          />
          {/* HailtraceValidationLayer removed per feedback — HT button was adding clutter
              without enough value. Swath + multi-source verification now comes from the
              backend verified_hail_events pipeline instead. */}
          <HailSwathLayer
            visible={swathVisible && !selectedDate}
            selectedDate={selectedDate?.date || null}
          />
        </MapContainer>

        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {/*
              Single toggle: basemap cycles Map ↔ Sat. Button labels show the
              mode you'd switch TO, mirroring Google Maps' layer pill.
              LIVE radar is always on (see liveMrmsVisible default). HT removed.
            */}
            <button
              onClick={() => setBaseMap(baseMap === 'map' ? 'satellite' : 'map')}
              title={baseMap === 'map' ? 'Switch to satellite view' : 'Switch to map view'}
              style={{
                width: 56,
                height: 28,
                borderRadius: 6,
                border: '2px solid rgba(0,0,0,0.2)',
                background: '#2563eb',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                boxShadow: '0 1px 5px rgba(0,0,0,0.3)',
              }}
            >
              {baseMap === 'map' ? 'Sat' : 'Map'}
            </button>
            {/*
              LIVE indicator pill — not a toggle. Shows green when quiet and
              red-pulsing when active hail is falling within ~5min of now.
            */}
            <div
              title={
                liveMrmsInfo?.hasFeatures
                  ? `Live radar: ${liveMrmsInfo.maxInches.toFixed(2)}" max hail detected`
                  : 'Live radar: monitoring (no active hail)'
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                height: 28,
                padding: '0 8px',
                borderRadius: 6,
                border: '2px solid rgba(0,0,0,0.2)',
                background: liveMrmsInfo?.hasFeatures ? '#dc2626' : '#475569',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                boxShadow: '0 1px 5px rgba(0,0,0,0.3)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#fff',
                  animation: liveMrmsInfo?.hasFeatures ? 'pulse 1.2s ease-in-out infinite' : 'none',
                }}
              />
              LIVE
            </div>
          </div>
            <button
              onClick={() => {
                setRouteMode((previous) => !previous);
                setMapClickInsight(null);
              }}
              style={{
                width: 60,
                height: 28,
                borderRadius: 6,
                border: '2px solid rgba(0,0,0,0.2)',
                background: routeMode ? '#059669' : '#fff',
                color: routeMode ? '#fff' : '#333',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                boxShadow: '0 1px 5px rgba(0,0,0,0.3)',
              }}
            >
              Route
            </button>
            <button
              onClick={centerOnGps}
              disabled={!gpsPosition}
              title={gpsPosition ? 'Center on your live GPS location' : 'Turn on GPS to center on your location'}
              style={{
                width: 44,
                height: 28,
                borderRadius: 6,
                border: '2px solid rgba(0,0,0,0.2)',
                background: gpsPosition ? '#2563eb' : '#fff',
                color: gpsPosition ? '#fff' : '#9ca3af',
                cursor: gpsPosition ? 'pointer' : 'not-allowed',
                fontSize: 11,
                fontWeight: 700,
                boxShadow: '0 1px 5px rgba(0,0,0,0.3)',
              }}
            >
              Me
            </button>
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

        {(routeMode || routeData || routeLoading || routeError) && (
          <div
            style={{
              position: 'absolute',
              top: 96,
              left: 12,
              zIndex: 1000,
              width: 320,
              maxWidth: 'calc(100% - 24px)',
              background: 'rgba(10,10,15,0.9)',
              backdropFilter: 'blur(6px)',
              borderRadius: 12,
              padding: 12,
              boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#86efac' }}>
                Route Mode
              </div>
              <button
                onClick={() => {
                  setRouteMode(false);
                  setRouteData(null);
                  setRouteError(null);
                  routeAbortRef.current?.abort();
                }}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}
              >
                Clear
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#d1d5db', lineHeight: 1.5 }}>
              Click the map to set a destination. The app will route from your GPS location, or from the searched property if GPS is off.
            </div>
            {routePendingDestination ? (
              <div style={{ marginTop: 8, fontSize: 12, color: '#fca5a5' }}>
                Destination: {formatLatLng(routePendingDestination[0], routePendingDestination[1])}
              </div>
            ) : null}
            {routeLoading ? (
              <div style={{ marginTop: 8, fontSize: 12, color: '#93c5fd' }}>Building route...</div>
            ) : null}
            {routeError ? (
              <div style={{ marginTop: 8, fontSize: 12, color: '#fca5a5' }}>{routeError}</div>
            ) : null}
            {routeData ? (
              <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.55 }}>
                <div>
                  <strong>{routeData.distanceMiles.toFixed(1)} mi route</strong>
                  {routeData.durationMinutes !== null ? ` • ${Math.round(routeData.durationMinutes)} min` : ''}
                </div>
                <div style={{ marginTop: 4 }}>
                  {routeData.summary.eventCount} storm report{routeData.summary.eventCount === 1 ? '' : 's'} within 1 mile of route
                </div>
                {routeData.summary.maxHailInches > 0 ? (
                  <div>Max hail along route: {routeData.summary.maxHailInches.toFixed(2)}"</div>
                ) : null}
                {routeData.summary.maxWindMph > 0 ? (
                  <div>Max wind along route: {routeData.summary.maxWindMph.toFixed(0)} mph</div>
                ) : null}
                {routeData.summary.dateKeys.length > 0 ? (
                  <div style={{ marginTop: 4, color: '#93c5fd' }}>
                    Recent dates: {routeData.summary.dateKeys.slice(0, 3).join(', ')}
                  </div>
                ) : null}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${routeData.destination[0]},${routeData.destination[1]}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    marginTop: 8,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: '#2563eb',
                    color: '#fff',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  Open Turn-by-Turn
                </a>
              </div>
            ) : null}
          </div>
        )}

        {mapClickInsight && !routeMode && (
          <div
            style={{
              position: 'absolute',
              top: 96,
              right: 92,
              zIndex: 1000,
              width: 300,
              maxWidth: 'calc(100% - 116px)',
              background: 'rgba(10,10,15,0.92)',
              backdropFilter: 'blur(6px)',
              borderRadius: 12,
              padding: 12,
              boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#fca5a5' }}>
                Map Click
              </div>
              <button
                onClick={() => setMapClickInsight(null)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}
              >
                Clear
              </button>
            </div>
            {mapClickInsight.nearestEvent ? (
              <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Nearest storm hit</div>
                <div>
                  {mapClickInsight.nearestEvent.eventType === 'Hail'
                    ? `${mapClickInsight.nearestEvent.magnitude}" hail`
                    : `${mapClickInsight.nearestEvent.magnitude} mph wind`}
                </div>
                <div>{formatDateLabel(mapClickInsight.nearestEvent.beginDate)}</div>
                <div>
                  {mapClickInsight.distanceMiles !== null
                    ? `${mapClickInsight.distanceMiles.toFixed(2)} mi away`
                    : 'Distance unavailable'}
                </div>
                <div style={{ marginTop: 4, color: '#d1d5db' }}>
                  {mapClickInsight.nearestEvent.county
                    ? `${mapClickInsight.nearestEvent.county}, ${mapClickInsight.nearestEvent.state}`
                    : mapClickInsight.nearestEvent.source}
                </div>
                <div style={{ marginTop: 6, color: '#93c5fd' }}>
                  {mapClickAddressLoading
                    ? 'Finding address...'
                    : mapClickLocationLabel}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>No nearby storm hit</div>
                <div>No nearby storm events found for the current filters.</div>
                <div style={{ marginTop: 6, color: '#93c5fd' }}>
                  {mapClickAddressLoading
                    ? 'Finding address...'
                    : mapClickLocationLabel}
                </div>
              </div>
            )}
          </div>
        )}

        {!mrmsLayerVisible && (
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
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Generate PDF Report</h3>
              <button onClick={() => setShowDolModal(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, padding: 4 }}>x</button>
            </div>
            <p style={{ marginTop: 6, fontSize: 12, color: '#9ca3af' }}>Pick one date, multiple dates, a range, or the full history.</p>

            {/* Mode selector: 4 pills mirror the 4 backend filter shapes. */}
            <div style={{ marginTop: 12, display: 'flex', gap: 6, padding: 4, background: 'rgba(17,24,39,0.55)', border: '1px solid #1f2937', borderRadius: 10 }}>
              {([
                { key: 'single',   label: 'One Date' },
                { key: 'multi',    label: 'Multi' },
                { key: 'range',    label: 'Range' },
                { key: 'lifetime', label: 'All' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setReportMode(tab.key)}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: 6,
                    border: 'none',
                    background: reportMode === tab.key ? '#ef4444' : 'transparent',
                    color: reportMode === tab.key ? '#fff' : '#9ca3af',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Body: different UI per mode */}
            {reportMode === 'single' && (
              <div style={{ marginTop: 12, maxHeight: 280, overflowY: 'auto', borderRadius: 14, border: '1px solid #1f2937', background: 'rgba(17,24,39,0.55)' }}>
                {stormDates.length === 0 ? (
                  <p style={{ padding: 16, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>No storm dates loaded. Search an address first.</p>
                ) : stormDates.map((stormDate, index) => (
                  <button
                    key={`dol-${stormDate.date}`}
                    onClick={() => setSelectedDol(stormDate.date)}
                    style={{
                      width: '100%', borderRadius: 0, border: 'none',
                      borderBottom: index === stormDates.length - 1 ? 'none' : '1px solid rgba(31,41,55,0.9)',
                      background: selectedDol === stormDate.date ? 'rgba(239,68,68,0.12)' : 'transparent',
                      boxShadow: selectedDol === stormDate.date ? 'inset 3px 0 0 #ef4444' : 'none',
                      padding: 12, textAlign: 'left', cursor: 'pointer', color: '#fff', display: 'block',
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{stormDate.label}</p>
                    <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, margin: 0 }}>{stormDate.eventCount} event{stormDate.eventCount === 1 ? '' : 's'} / {formatStormImpactSummary(stormDate)}</p>
                  </button>
                ))}
              </div>
            )}

            {reportMode === 'multi' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, padding: '0 2px' }}>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    {selectedDolMulti.length} selected
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setSelectedDolMulti(stormDates.map((s) => s.date))}
                      disabled={stormDates.length === 0}
                      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', color: '#d1d5db', cursor: stormDates.length === 0 ? 'not-allowed' : 'pointer' }}
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setSelectedDolMulti([])}
                      disabled={selectedDolMulti.length === 0}
                      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', color: '#d1d5db', cursor: selectedDolMulti.length === 0 ? 'not-allowed' : 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 6, maxHeight: 260, overflowY: 'auto', borderRadius: 14, border: '1px solid #1f2937', background: 'rgba(17,24,39,0.55)' }}>
                  {stormDates.length === 0 ? (
                    <p style={{ padding: 16, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>No storm dates loaded. Search an address first.</p>
                  ) : stormDates.map((stormDate, index) => {
                    const checked = selectedDolMulti.includes(stormDate.date);
                    return (
                      <button
                        key={`dolm-${stormDate.date}`}
                        onClick={() => setSelectedDolMulti((prev) => (
                          prev.includes(stormDate.date)
                            ? prev.filter((d) => d !== stormDate.date)
                            : [...prev, stormDate.date]
                        ))}
                        style={{
                          width: '100%', borderRadius: 0, border: 'none',
                          borderBottom: index === stormDates.length - 1 ? 'none' : '1px solid rgba(31,41,55,0.9)',
                          background: checked ? 'rgba(239,68,68,0.12)' : 'transparent',
                          padding: 12, textAlign: 'left', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 10,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 16, height: 16, borderRadius: 4,
                            border: checked ? 'none' : '2px solid #4b5563',
                            background: checked ? '#ef4444' : 'transparent',
                            flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 11, fontWeight: 900,
                          }}
                        >
                          {checked ? 'x' : ''}
                        </span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{stormDate.label}</p>
                          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, margin: 0 }}>{stormDate.eventCount} event{stormDate.eventCount === 1 ? '' : 's'} / {formatStormImpactSummary(stormDate)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {reportMode === 'range' && (
              <div style={{ marginTop: 12, padding: 14, borderRadius: 14, border: '1px solid #1f2937', background: 'rgba(17,24,39,0.55)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>From</label>
                    <input
                      type="date"
                      value={rangeFrom}
                      onChange={(e) => setRangeFrom(e.target.value)}
                      style={{ width: '100%', borderRadius: 8, border: '1px solid #374151', background: '#111827', padding: '8px 10px', fontSize: 13, color: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>To</label>
                    <input
                      type="date"
                      value={rangeTo}
                      onChange={(e) => setRangeTo(e.target.value)}
                      style={{ width: '100%', borderRadius: 8, border: '1px solid #374151', background: '#111827', padding: '8px 10px', fontSize: 13, color: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <p style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>
                  PDF will include every verified hail/wind event at this address between these dates.
                </p>
              </div>
            )}

            {reportMode === 'lifetime' && (
              <div style={{ marginTop: 12, padding: 14, borderRadius: 14, border: '1px solid #1f2937', background: 'rgba(17,24,39,0.55)' }}>
                <p style={{ fontSize: 13, color: '#e5e7eb', margin: 0 }}>
                  Full history report — every verified hail/wind event at this address from 2015 to today.
                </p>
                <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6, marginBottom: 0 }}>
                  Best for re-roof sales where you want to show repeated storm exposure over years.
                </p>
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <label htmlFor="customer-name-input" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#d1d5db', marginBottom: 6 }}>
                Homeowner Info
                <span style={{ color: '#6b7280', fontWeight: 500 }}> (optional)</span>
              </label>
              <input
                id="customer-name-input"
                type="text"
                value={customerNameInput}
                onChange={(event) => setCustomerNameInput(event.target.value)}
                placeholder="Homeowner / property owner name"
                style={{
                  width: '100%',
                  borderRadius: 10,
                  border: '1px solid #374151',
                  background: '#111827',
                  padding: '10px 12px',
                  fontSize: 13,
                  color: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowDolModal(false)} style={{ borderRadius: 8, border: '1px solid #374151', background: 'transparent', padding: '8px 12px', fontSize: 13, color: '#d1d5db', cursor: 'pointer' }}>Cancel</button>
              {(() => {
                // Generate button enabled only when the current mode has valid input.
                const modeReady =
                  (reportMode === 'single' && !!selectedDol) ||
                  (reportMode === 'multi' && selectedDolMulti.length > 0) ||
                  (reportMode === 'range' && !!rangeFrom && !!rangeTo) ||
                  (reportMode === 'lifetime');
                const disabled = !modeReady || generatingReport;
                return (
                  <button
                    onClick={handleGenerateReport}
                    disabled={disabled}
                    style={{
                      borderRadius: 8, border: 'none',
                      background: disabled ? '#374151' : '#ef4444',
                      padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#fff',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {generatingReport
                      ? 'Generating...'
                      : reportMode === 'lifetime'
                        ? 'Generate Full-History PDF'
                        : reportMode === 'multi' && selectedDolMulti.length > 1
                          ? `Generate Multi-Storm PDF (${selectedDolMulti.length})`
                          : reportMode === 'range'
                            ? 'Generate Range PDF'
                            : 'Generate PDF Report'}
                  </button>
                );
              })()}
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

// Swath-authoritative impact tier for a storm date at the searched property.
// When set, overrides the raw point-distance badge in the card footer —
// "3.3 mi" becomes "🎯 Direct Hit" if the property sits inside the swath.
type StormDateImpactTier = 'direct-hit' | 'at-location' | 'area' | null;

function StormDateCard({
  stormDate,
  isSelected,
  isExpanded,
  events: dateEvents,
  impactTier,
  swathSizeInches,
  onClick,
  onToggleExpand,
}: {
  stormDate: StormDate;
  isSelected: boolean;
  isExpanded: boolean;
  events: StormEvent[];
  impactTier?: StormDateImpactTier;
  /** If impactTier === 'direct-hit', this is the swath band size that contains the property */
  swathSizeInches?: number | null;
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, marginLeft: 18, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{stormDate.eventCount > 0 ? `${stormDate.eventCount} report${stormDate.eventCount !== 1 ? 's' : ''}` : 'Swath data'}</span>
              {(() => {
                // Swath-authoritative tier FIRST — if the property sits in the
                // swath polygon for this date, that's a direct hit regardless
                // of what the nearest point report's distance says. Otherwise
                // fall back to hail proximity (what was here before).
                if (impactTier === 'direct-hit') {
                  return <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981' }}>🎯 Direct Hit</span>;
                }
                if (impactTier === 'at-location') {
                  const hailMi = stormDate.closestHailMiles;
                  return <span style={{ fontSize: 11, fontWeight: 600, color: '#fbbf24' }}>
                    At Location{hailMi != null ? ` (${hailMi.toFixed(1)} mi)` : ''}
                  </span>;
                }
                // Legacy point-distance path (no address-impact data available)
                const hailMi = stormDate.closestHailMiles;
                const fallbackMi = stormDate.closestMiles;
                if (hailMi != null) {
                  const c = hailMi <= 1 ? '#4ade80' : hailMi <= 3 ? '#fbbf24' : '#9ca3af';
                  const label = hailMi <= 1 ? '● Direct Hit' : `${hailMi.toFixed(1)} mi`;
                  return <span style={{ fontSize: 11, fontWeight: hailMi <= 1 ? 600 : 400, color: c }}>{label}</span>;
                }
                if (fallbackMi != null) {
                  return <span style={{ fontSize: 11, color: '#9ca3af' }}>{fallbackMi.toFixed(1)} mi</span>;
                }
                return null;
              })()}
              {stormDate.statesAffected.length > 0 ? <span style={{ fontSize: 12, color: '#6b7280' }}>{stormDate.statesAffected.slice(0, 3).join(', ')}</span> : null}
              {stormDate.maxWindMph > 0 ? <span style={{ fontSize: 12, color: '#7dd3fc' }}>{stormDate.maxWindMph.toFixed(0)} mph</span> : null}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 12, fontWeight: 700, background: `${color}20`, color }}>
              {(() => {
                // Prefer the swath band size when the property is inside the
                // swath — that's the authoritative reading "at the house".
                // Otherwise fall back to the maxHailInches from the storm
                // date's aggregated reports, rounded to an adjuster tier.
                if (impactTier === 'direct-hit' && (swathSizeInches ?? 0) > 0) {
                  return formatHailTier(swathSizeInches);
                }
                return stormDate.maxHailInches > 0 ? formatHailTier(stormDate.maxHailInches) : '--';
              })()}
            </span>
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
