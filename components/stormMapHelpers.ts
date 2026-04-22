/**
 * stormMapHelpers -- Types, utilities, and data-fetching for TerritoryHailMap.
 *
 * Extracted to keep the main component file lean.
 */

import { getApiBaseUrl } from '../services/config';
import { authService } from '../services/authService';

// ============================================================
// Types
// ============================================================

export type HistoryRangePreset = '1y' | '2y' | '5y' | '10y' | 'since';
export type TabId = 'recent' | 'impact';
export type SearchResultType = 'address' | 'postal_code' | 'locality' | 'administrative_area' | 'unknown';

export interface StormEvent {
  id: string;
  eventType: 'Hail' | 'Thunderstorm Wind' | 'Tornado' | 'Flash Flood';
  state: string;
  county: string;
  beginDate: string;
  endDate: string;
  beginLat: number;
  beginLon: number;
  endLat: number;
  endLon: number;
  magnitude: number;
  magnitudeType: string;
  distanceMiles?: number;
  damageProperty: number;
  source: string;
  narrative: string;
}

export interface StormDate {
  date: string;
  label: string;
  eventCount: number;
  maxHailInches: number;
  maxWindMph: number;
  statesAffected: string[];
  closestMiles: number | null;
}

export interface GpsPosition {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface CanvassingAlert {
  inHailZone: boolean;
  estimatedHailSize: number | null;
  stormDate: string | null;
  distanceToSwathMiles: number | null;
  talkingPoints: string[];
}

export interface EventFilterState {
  hail: boolean;
  wind: boolean;
}

export interface PropertySearchSummary {
  locationLabel: string;
  resultType: SearchResultType;
  radiusMiles: number;
  historyPreset: HistoryRangePreset;
  sinceDate: string | null;
}

export interface SearchResult {
  address: string;
  lat: number;
  lng: number;
  placeId: string;
  viewport: BoundingBox | null;
  resultType: SearchResultType;
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface HailSizeClass {
  minInches: number;
  maxInches: number;
  label: string;
  color: string;
  reference: string;
  damageSeverity: number;
}

// ============================================================
// Constants
// ============================================================

export const HAIL_SIZE_CLASSES: HailSizeClass[] = [
  { minInches: 0.25, maxInches: 0.75, label: 'Pea to Penny', reference: 'pea', color: '#00FF00', damageSeverity: 0 },
  { minInches: 0.75, maxInches: 1.0, label: 'Penny to Quarter', reference: 'penny', color: '#FFFF00', damageSeverity: 1 },
  { minInches: 1.0, maxInches: 1.5, label: 'Quarter to Ping Pong', reference: 'quarter', color: '#FFA500', damageSeverity: 2 },
  { minInches: 1.5, maxInches: 1.75, label: 'Ping Pong to Golf Ball', reference: 'ping-pong', color: '#FF6600', damageSeverity: 3 },
  { minInches: 1.75, maxInches: 2.5, label: 'Golf Ball to Tennis Ball', reference: 'golf-ball', color: '#FF0000', damageSeverity: 4 },
  { minInches: 2.5, maxInches: 4.5, label: 'Tennis Ball to Softball', reference: 'tennis-ball', color: '#8B0000', damageSeverity: 5 },
  { minInches: 4.5, maxInches: 99, label: 'Softball+', reference: 'softball', color: '#800080', damageSeverity: 5 },
];

export const DEFAULT_CENTER: [number, number] = [39.0, -77.0];
export const DEFAULT_ZOOM = 8;

const ALERT_RADIUS_MILES = 0.5;
const NHP_FEATURE_SERVER = 'https://services.arcgis.com/rGKxabTU9mcXMw7k/arcgis/rest/services/HailSwathMESH_Lines_view/FeatureServer/0/query';

// ============================================================
// Utility functions
// ============================================================

export function getHailSizeClass(inches: number): HailSizeClass | null {
  return HAIL_SIZE_CLASSES.find((c) => inches >= c.minInches && inches < c.maxInches) ?? null;
}

export function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getStormDateKey(dateStr: string): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const parsed = new Date(`${match[1]}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : match[1];
}

export function formatDateLabel(dateStr: string): string {
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return dateStr;
  const d = new Date(`${match[1]}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function formatHistoryRangeLabel(range: HistoryRangePreset, sinceDate: string): string {
  if (range === 'since' && sinceDate) {
    const p = new Date(`${sinceDate}T12:00:00Z`);
    const label = Number.isNaN(p.getTime()) ? sinceDate : p.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `since ${label}`;
  }
  const map: Record<string, string> = { '10y': 'the last 10 years', '5y': 'the last 5 years', '2y': 'the last 2 years', '1y': 'the last year' };
  return map[range] || 'the last year';
}

export function formatStormImpactSummary(sd: StormDate): string {
  const parts: string[] = [];
  if (sd.maxHailInches > 0) parts.push(`${sd.maxHailInches.toFixed(2)}" hail`);
  if (sd.maxWindMph > 0) parts.push(`${sd.maxWindMph.toFixed(0)} mph wind`);
  return parts.join(' / ') || 'no measured hail or wind';
}

export function getFilterSummaryLabel(filters: EventFilterState, count: number): string {
  if (filters.hail && filters.wind) return `storm date${count === 1 ? '' : 's'}`;
  if (filters.wind) return `wind date${count === 1 ? '' : 's'}`;
  return `hail date${count === 1 ? '' : 's'}`;
}

export function rangeToMonths(range: HistoryRangePreset): number {
  const map: Record<string, number> = { '1y': 12, '2y': 24, '5y': 60, '10y': 120, since: 12 };
  return map[range] || 12;
}

export function getEffectiveMonths(months: number, sinceDate: string | null): number {
  if (!sinceDate) return months;
  const startMs = Date.parse(`${sinceDate}T00:00:00Z`);
  if (Number.isNaN(startMs)) return months;
  return Math.max(months, Math.ceil((Date.now() - startMs) / (30 * 24 * 60 * 60 * 1000)), 1);
}

export function isDateInRange(dateStr: string, sinceDate: string | null): boolean {
  const dateKey = getStormDateKey(dateStr);
  if (!dateKey) return false;
  return !sinceDate || dateKey >= sinceDate;
}

// ============================================================
// Geocoding (US Census Bureau -- free)
// ============================================================

function isZipCode(q: string): boolean { return /^\d{5}(-\d{4})?$/.test(q.trim()); }

export async function geocodeAddress(query: string): Promise<SearchResult | null> {
  if (!query?.trim()) return null;
  const cleaned = query.trim();
  const apiBase = getApiBaseUrl();
  try {
    // Use server-side proxy to avoid CORS issues with Census Bureau
    const res = await fetch(`${apiBase}/hail/geocode?q=${encodeURIComponent(cleaned)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.lat || !data.lng) return null;
    const { lat, lng, address } = data;
    const pad = isZipCode(cleaned) ? 0.08 : 0.01;
    return { address: address || cleaned, lat, lng, placeId: `geocode-${lat}-${lng}`, viewport: { north: lat + pad, south: lat - pad, east: lng + pad, west: lng - pad }, resultType: isZipCode(cleaned) ? 'postal_code' : 'address' };
  } catch { return null; }
}

export async function reverseGeocodeLatLng(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(`${apiBase}/hail/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.address === 'string' && data.address.trim() ? data.address : null;
  } catch {
    return null;
  }
}

// ============================================================
// Data fetching
// ============================================================

interface Sa21Response {
  events?: Array<{ id?: string | number; date?: string; latitude?: number; longitude?: number; hailSize?: number; severity?: string; source?: string }>;
  noaaEvents?: Array<{ id?: string | number; eventType?: string; date?: string; latitude?: number; longitude?: number; magnitude?: number; state?: string; source?: string; narrative?: string; location?: string }>;
}

function mapNoaaType(t?: string): StormEvent['eventType'] | null {
  const n = t?.toLowerCase().trim();
  if (n === 'hail') return 'Hail';
  if (n === 'wind' || n === 'thunderstorm wind') return 'Thunderstorm Wind';
  return null;
}

export async function fetchStormEvents(lat: number, lng: number, months: number, radiusMiles: number, signal?: AbortSignal): Promise<StormEvent[]> {
  const apiBase = getApiBaseUrl();
  const email = authService.getCurrentUser()?.email || localStorage.getItem('userEmail') || 'storm-maps@roofer21.com';
  const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString(), months: months.toString(), radius: radiusMiles.toString() });
  try {
    const res = await fetch(`${apiBase}/hail/search?${params}`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      headers: { 'x-user-email': email },
    });
    if (!res.ok) return [];
    const data: Sa21Response = await res.json();
    const events: StormEvent[] = [];
    for (const [i, e] of (data.events || []).entries()) {
      const eLat = e.latitude || 0;
      const eLon = e.longitude || 0;
      events.push({ id: `ihm-${e.id || i}`, eventType: 'Hail', state: '', county: '', beginDate: e.date || '', endDate: e.date || '', beginLat: eLat, beginLon: eLon, endLat: eLat, endLon: eLon, magnitude: e.hailSize || 0, magnitudeType: 'inches', damageProperty: 0, source: e.source || 'Storm Database', narrative: `Hail ${e.hailSize}" - ${e.severity || 'unknown'} severity`, distanceMiles: e.distanceMiles ?? (eLat ? haversineDistanceMiles(lat, lng, eLat, eLon) : undefined) });
    }
    for (const [i, e] of (data.noaaEvents || []).entries()) {
      const et = mapNoaaType(e.eventType);
      if (!et) continue;
      const eLat = e.latitude || 0;
      const eLon = e.longitude || 0;
      events.push({ id: `noaa-${e.id || i}`, eventType: et, state: e.state || '', county: '', beginDate: e.date || '', endDate: e.date || '', beginLat: eLat, beginLon: eLon, endLat: eLat, endLon: eLon, magnitude: e.magnitude || 0, magnitudeType: et === 'Thunderstorm Wind' ? 'mph' : 'inches', damageProperty: 0, source: e.source || 'NOAA', narrative: e.narrative || `${e.eventType} - ${e.location || ''}`, distanceMiles: e.distanceMiles ?? (eLat ? haversineDistanceMiles(lat, lng, eLat, eLon) : undefined) });
    }
    return events;
  } catch { return []; }
}

function estimateMeshInches(w: number): number {
  if (w >= 30) return 3.5; if (w >= 22) return 2.75; if (w >= 15) return 2.0;
  if (w >= 10) return 1.75; if (w >= 6) return 1.5; if (w >= 3) return 1.0;
  return 0.75;
}

export async function fetchMeshSwathsByLocation(lat: number, lng: number, months: number, radiusMiles: number, sinceDate: string | null, signal?: AbortSignal): Promise<StormDate[]> {
  const deg = radiusMiles / 69;
  const bounds = { north: lat + deg, south: lat - deg, east: lng + deg / Math.cos((lat * Math.PI) / 180), west: lng - deg / Math.cos((lat * Math.PI) / 180) };
  const start = sinceDate ? new Date(`${sinceDate}T00:00:00Z`) : new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime())) return [];
  const where = `Start_Date >= DATE '${start.toISOString().slice(0, 10)} 00:00:00'`;
  const p: Record<string, string> = {
    where, outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'geojson', resultRecordCount: '500',
    geometry: JSON.stringify({ xmin: bounds.west, ymin: bounds.south, xmax: bounds.east, ymax: bounds.north, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects', inSR: '4326',
  };
  try {
    const res = await fetch(`${NHP_FEATURE_SERVER}?${new URLSearchParams(p)}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.features?.length) return [];
    return data.features.filter((f: any) => f.geometry).map((f: any) => {
      const props = f.properties || {};
      const epoch = props.Start_Date ? Number(props.Start_Date) : null;
      let dateStr = '';
      if (epoch) { const d = new Date(epoch); dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
      const mesh = estimateMeshInches(props.MaxWidth__ || 0);
      return { date: dateStr, label: formatDateLabel(dateStr), eventCount: 0, maxHailInches: mesh, maxWindMph: 0, statesAffected: (props.Province || props.States || '').split(',').map((s: string) => s.trim()).filter(Boolean), closestMiles: null };
    });
  } catch { return []; }
}

// ============================================================
// Grouping / dedup
// ============================================================

export function deduplicateEvents(events: StormEvent[]): StormEvent[] {
  const seen = new Map<string, StormEvent>();
  for (const e of events) {
    const dk = getStormDateKey(e.beginDate);
    if (!dk) continue;
    const key = `${dk}-${Math.round(e.beginLat * 100)}-${Math.round(e.beginLon * 100)}`;
    const ex = seen.get(key);
    if (!ex || e.narrative.length > ex.narrative.length) seen.set(key, e);
  }
  return Array.from(seen.values());
}

export function groupEventsByDate(events: StormEvent[]): StormDate[] {
  const map = new Map<string, { events: StormEvent[]; states: Set<string> }>();
  for (const e of events) {
    const dk = getStormDateKey(e.beginDate);
    if (!dk) continue;
    if (!map.has(dk)) map.set(dk, { events: [], states: new Set() });
    const g = map.get(dk)!;
    g.events.push(e);
    if (e.state) g.states.add(e.state);
  }
  return Array.from(map.entries()).map(([date, { events: evts, states }]) => {
    const distances = evts.map((e) => e.distanceMiles).filter((d): d is number => d != null && Number.isFinite(d));
    return {
      date,
      label: formatDateLabel(date),
      eventCount: evts.length,
      maxHailInches: Math.max(0, ...evts.filter((e) => e.eventType === 'Hail').map((e) => e.magnitude)),
      maxWindMph: Math.max(0, ...evts.filter((e) => e.eventType === 'Thunderstorm Wind').map((e) => e.magnitude)),
      statesAffected: [...states],
      closestMiles: distances.length > 0 ? Math.min(...distances) : null,
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export function mergeDateLists(eventDates: StormDate[], swathDates: StormDate[]): StormDate[] {
  const map = new Map<string, StormDate>();
  for (const sd of eventDates) map.set(sd.date, sd);
  for (const sd of swathDates) {
    const dk = getStormDateKey(sd.date);
    if (!dk) continue;
    const norm = { ...sd, date: dk, label: formatDateLabel(dk), closestMiles: sd.closestMiles ?? null };
    const ex = map.get(dk);
    if (ex) {
      ex.maxHailInches = Math.max(ex.maxHailInches, norm.maxHailInches);
      ex.maxWindMph = Math.max(ex.maxWindMph, norm.maxWindMph);
      ex.statesAffected = [...new Set([...ex.statesAffected, ...norm.statesAffected])];
      if (norm.closestMiles != null) {
        ex.closestMiles = ex.closestMiles != null ? Math.min(ex.closestMiles, norm.closestMiles) : norm.closestMiles;
      }
    } else { map.set(dk, norm); }
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

// ============================================================
// Canvassing alert
// ============================================================

export function computeCanvassingAlert(position: GpsPosition | null, events: StormEvent[]): CanvassingAlert | null {
  if (!position || !events.length) return null;
  let closestEvent: StormEvent | null = null, closestDist = Infinity;
  for (const e of events) {
    if (e.eventType !== 'Hail' || e.magnitude < 0.75) continue;
    const d = haversineDistanceMiles(position.lat, position.lng, e.beginLat, e.beginLon);
    if (d < closestDist) { closestDist = d; closestEvent = e; }
  }
  if (!closestEvent) return null;
  if (closestDist > ALERT_RADIUS_MILES) {
    return closestDist <= 5 ? { inHailZone: false, estimatedHailSize: null, stormDate: null, distanceToSwathMiles: Math.round(closestDist * 100) / 100, talkingPoints: [] } : null;
  }
  const sd = closestEvent.beginDate.slice(0, 10);
  const sc = getHailSizeClass(closestEvent.magnitude);
  let dl = sd;
  try { const d = new Date(sd + 'T12:00:00Z'); dl = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch { /* keep raw */ }
  const pts = [`This area was hit by ${closestEvent.magnitude}" hail on ${dl}.`];
  if (sc) pts.push(`That's ${sc.label} size -- damage severity level ${sc.damageSeverity}/5.`);
  if (closestEvent.magnitude >= 1.0) { pts.push('Hail this size commonly damages shingles, gutters, and siding.'); pts.push('Most homeowner insurance policies cover hail damage with no out-of-pocket cost.'); }
  if (closestEvent.magnitude >= 1.75) pts.push('Golf ball+ hail almost always requires a full roof replacement.');
  return { inHailZone: true, estimatedHailSize: closestEvent.magnitude, stormDate: sd, distanceToSwathMiles: Math.round(closestDist * 1000) / 1000, talkingPoints: pts };
}

// ============================================================
// Report generation
// ============================================================

function getResponseFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get('content-disposition');
  if (!disposition) return fallback;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = disposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || fallback;
}

function downloadBlob(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);

  // Give the browser a full frame to register the link before clicking it.
  window.requestAnimationFrame(() => {
    link.click();
  });

  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(blobUrl);
  }, 60_000);
}

/**
 * Four date-filter modes (pick one — rest are ignored):
 *  - dateOfLoss: "YYYY-MM-DD"             → single-storm PDF
 *  - datesOfLoss: string[]                → multi-storm combined PDF
 *  - fromDate + toDate: "YYYY-MM-DD"      → range PDF
 *  - lifetime: true                       → all-history PDF (no date filter)
 * The server accepts the same shapes on /hail/generate-report.
 */
export interface GenerateStormReportOptions {
  dateOfLoss?: string;
  datesOfLoss?: string[];
  fromDate?: string;
  toDate?: string;
  lifetime?: boolean;
  customerName?: string;
}

export async function generateStormReport(
  address: string,
  lat: number,
  lng: number,
  radiusMiles: number,
  events: StormEvent[],
  dateOfLossOrOptions: string | GenerateStormReportOptions,
  customerNameLegacy?: string,
): Promise<void> {
  // Back-compat: legacy callers pass (address, lat, lng, radius, events, "YYYY-MM-DD", customerName)
  const opts: GenerateStormReportOptions =
    typeof dateOfLossOrOptions === 'string'
      ? { dateOfLoss: dateOfLossOrOptions, customerName: customerNameLegacy }
      : dateOfLossOrOptions;

  const apiBase = getApiBaseUrl();
  const email = authService.getCurrentUser()?.email || localStorage.getItem('userEmail') || 'storm-maps@roofer21.com';

  // Build the set of date keys the PDF should include events for.
  // (Lifetime/range mode: server will re-query its own data so we send all we have locally.)
  const wantedDates: Set<string> | null = opts.lifetime
    ? null
    : opts.datesOfLoss && opts.datesOfLoss.length > 0
      ? new Set(opts.datesOfLoss)
      : opts.dateOfLoss
        ? new Set([opts.dateOfLoss])
        : null; // range or lifetime → let server filter
  const inWantedRange = (dateKey: string) => {
    if (wantedDates) return wantedDates.has(dateKey);
    if (opts.fromDate && dateKey < opts.fromDate) return false;
    if (opts.toDate && dateKey > opts.toDate) return false;
    return true;
  };

  // Split by source: IHM events → payload.events (NEXRAD), NOAA → payload.noaaEvents
  const ihmAll = events.filter(e => e.id.startsWith('ihm-'));
  const noaaAll = events.filter(e => !e.id.startsWith('ihm-'));
  const ihmDated = ihmAll.filter(e => inWantedRange(getStormDateKey(e.beginDate) || ''));
  const noaaDated = noaaAll.filter(e => inWantedRange(getStormDateKey(e.beginDate) || ''));
  const ihmHail = ihmDated.filter(e => e.eventType === 'Hail');
  const noaaHail = noaaDated.filter(e => e.eventType === 'Hail');
  const windEvts = noaaDated.filter(e => e.eventType === 'Thunderstorm Wind');
  const hailEvts = [...ihmHail, ...noaaHail];
  const datedEvents = [...ihmDated, ...noaaDated];
  const historyHailEvents = [...ihmAll, ...noaaAll].filter(e => e.eventType === 'Hail');
  if (!hailEvts.length && !windEvts.length && !opts.lifetime) {
    throw new Error('No events in the selected date window.');
  }
  let maxHailSize = 0;
  for (const e of hailEvts) if (e.magnitude > maxHailSize) maxHailSize = e.magnitude;
  const cumulative = hailEvts.reduce((s, e) => s + e.magnitude, 0);
  const score = Math.max(0, Math.min(100, Math.round(hailEvts.length * 8 + windEvts.length * 5 + maxHailSize * 18 + cumulative * 4)));
  const riskLevel = score >= 76 ? 'Critical' : score >= 51 ? 'High' : score >= 26 ? 'Moderate' : 'Low';
  const riskColor = { Critical: '#b91c1c', High: '#ea580c', Moderate: '#ca8a04', Low: '#16a34a' }[riskLevel];

  const getDistanceMiles = (e: StormEvent) => {
    if (!Number.isFinite(e.beginLat) || !Number.isFinite(e.beginLon)) return undefined;
    return haversineDistanceMiles(lat, lng, e.beginLat, e.beginLon);
  };

  const toRE = (e: StormEvent) => {
    const distanceMiles = getDistanceMiles(e);
    const location = [e.county, e.state].filter(Boolean).join(', ');
    const comments = e.narrative || undefined;
    const c = {
      id: e.id,
      date: e.beginDate,
      latitude: e.beginLat,
      longitude: e.beginLon,
      distanceMiles,
      location,
      comments,
      source: e.source,
    };

    if (e.eventType === 'Hail') {
      return {
        ...c,
        magnitude: e.magnitude,
        hailSize: e.magnitude,
        eventType: 'hail',
        severity: e.magnitude >= 1.75 ? 'severe' : e.magnitude >= 1 ? 'moderate' : 'minor',
      };
    }

    return {
      ...c,
      magnitude: e.magnitude,
      eventType: 'wind',
    };
  };

  const payload = {
    address,
    lat,
    lng,
    radius: radiusMiles,
    events: ihmHail.map(toRE),
    noaaEvents: [...noaaHail, ...windEvts].map(toRE),
    historyEvents: historyHailEvents.map(toRE),
    damageScore: { score, riskLevel, summary: score >= 60 ? 'Documented storm activity supports a high-likelihood roof damage conversation.' : score >= 30 ? 'Documented storm history supports a moderate damage review.' : 'Limited storm history was found for this loss date.', color: riskColor, factors: { eventCount: datedEvents.length, stormSystemCount: 1, maxHailSize, recentActivity: datedEvents.length, cumulativeExposure: cumulative, severityDistribution: { severe: hailEvts.filter((e) => e.magnitude >= 1.75).length, moderate: hailEvts.filter((e) => e.magnitude >= 1 && e.magnitude < 1.75).length, minor: hailEvts.filter((e) => e.magnitude < 1).length }, recencyScore: 0, documentedDamage: 0, windEvents: windEvts.length } },
    filter: 'hail-wind', includeNexrad: true, includeMap: true, includeWarnings: true,
    // Date-filter: send whichever mode was selected. Server uses the first non-empty.
    dateOfLoss: opts.dateOfLoss,
    datesOfLoss: opts.datesOfLoss && opts.datesOfLoss.length > 0 ? opts.datesOfLoss : undefined,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    template: 'noaa-forward',
    customerName: opts.customerName?.trim() || undefined,
  };

  const response = await fetch(`${apiBase}/hail/generate-report`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-email': email }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Report API returned ${response.status}`);
  const blob = await response.blob();
  // Build a filename hint from the mode — multi/range/lifetime shouldn't end in "undefined"
  const dateTag = opts.dateOfLoss
    || (opts.datesOfLoss && opts.datesOfLoss.length > 0 ? `multi_${opts.datesOfLoss.length}_dates` : '')
    || (opts.fromDate && opts.toDate ? `${opts.fromDate}_to_${opts.toDate}` : '')
    || (opts.lifetime ? 'all-history' : 'report');
  const fallbackFilename = `Storm_Report_${address.replace(/[^a-zA-Z0-9]/g, '_')}_${dateTag}.pdf`;
  downloadBlob(blob, getResponseFilename(response, fallbackFilename));
}
