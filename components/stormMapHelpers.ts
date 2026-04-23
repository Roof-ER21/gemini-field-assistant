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
  // Optional traceability + machine-readable tags the PDF needs.
  comments?: string;                 // source-tag string for PDF regex matching
  noaaEventId?: string;
  spcOmId?: string;
  radarSite?: string;
  nwsForecastOffice?: string;
  cocorahsStation?: string;
  verificationCount?: number;
}

export interface StormDate {
  date: string;
  label: string;
  eventCount: number;
  maxHailInches: number;
  maxWindMph: number;
  statesAffected: string[];
  closestMiles: number | null;
  /**
   * Closest hail observation (miles). Use this for "Direct Hit" labeling —
   * wind proximity shouldn't trigger a hail-framed badge.
   */
  closestHailMiles?: number | null;
  /** Closest wind observation — kept for future wind-specific UI. */
  closestWindMiles?: number | null;
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

// HAIL_SIZE_CLASSES is now derived from the canonical palette (hailPalette.ts).
// Kept as an exported alias so every call site that imports HAIL_SIZE_CLASSES
// (legend, storm cards, markers) continues to work unchanged.
import { HAIL_LEVELS as CANONICAL_HAIL_LEVELS } from './hailPalette';

const SEVERITY_TO_SCORE: Record<string, number> = {
  trace: 0, minor: 1, moderate: 2, severe: 3, very_severe: 4, extreme: 5,
};

export const HAIL_SIZE_CLASSES: HailSizeClass[] = CANONICAL_HAIL_LEVELS.map((l) => ({
  minInches: l.minInches,
  maxInches: l.maxInches,
  label: l.longLabel,
  reference: l.reference,
  color: l.color,
  damageSeverity: SEVERITY_TO_SCORE[l.severity] ?? 0,
}));

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

/**
 * All storm dates in the UI are bucketed and displayed in Eastern Time.
 * Why: reps and adjusters in DMV/PA think in ET; NOAA archives use UTC, which
 * shifts late-evening ET storms into the next day and confuses "which storm"
 * conversations. The server's verified_hail_events.event_date is already
 * ET-bucketed, but client-side event payloads still arrive with UTC timestamps
 * (NOAA /search, IEM, MRMS) — we bucket those to ET here.
 */
const ET_ZONE = 'America/New_York';

/**
 * Return a YYYY-MM-DD string representing the ET local day that contains the
 * given instant. Accepts either a bare YYYY-MM-DD (assumed already ET-bucketed)
 * or a full ISO timestamp (converted to ET).
 */
export function getStormDateKey(dateStr: string): string | null {
  if (!dateStr) return null;
  // Bare date strings — already in ET calendar by convention.
  const dateOnly = dateStr.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return dateOnly[1];
  // Anything else: parse and convert to ET local date.
  const ms = Date.parse(dateStr);
  if (Number.isNaN(ms)) {
    // Fall back to first 10 chars if the string looks date-ish.
    const fallback = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    return fallback ? fallback[1] : null;
  }
  return etLocalDateOf(new Date(ms));
}

/** YYYY-MM-DD for the ET local day the given Date instant falls in. */
function etLocalDateOf(d: Date): string {
  // Intl produces localized parts; pick year/month/day for ET.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function formatDateLabel(dateStr: string): string {
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return dateStr;
  // Noon ET on the given day — guarantees we display the date the rep expects.
  const d = new Date(`${match[1]}T17:00:00Z`);  // 17:00 UTC = 1 PM EDT / noon EST
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: ET_ZONE });
}

export function formatHistoryRangeLabel(range: HistoryRangePreset, sinceDate: string): string {
  if (range === 'since' && sinceDate) {
    const p = new Date(`${sinceDate}T17:00:00Z`);
    const label = Number.isNaN(p.getTime())
      ? sinceDate
      : p.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: ET_ZONE });
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
  noaaEvents?: Array<{
    id?: string | number; eventType?: string; date?: string;
    latitude?: number; longitude?: number; magnitude?: number;
    state?: string; source?: string; narrative?: string; location?: string;
    distanceMiles?: number;
    comments?: string;
    noaaEventId?: string; spcOmId?: string; radarSite?: string;
    nwsForecastOffice?: string; cocorahsStation?: string;
    verificationCount?: number;
  }>;
}

function mapNoaaType(t?: string): StormEvent['eventType'] | null {
  const n = t?.toLowerCase().trim();
  if (n === 'hail') return 'Hail';
  if (n === 'wind' || n === 'thunderstorm wind') return 'Thunderstorm Wind';
  return null;
}

// ============================================================
// Address Impact — swath-first Direct Hit / Near Miss / Area Impact report
// ============================================================
// Backed by /api/hail/address-impact which runs point-in-polygon against
// cached MRMS swath bands FIRST, then falls back to point-report distance.
// Fixes "1.7 miles away" lookups that hid a property sitting inside a swath.

export interface AddressImpactTier {
  date: string;
  maxHailInches: number | null;
  sizeLabel?: string | null;
  severity?: string | null;
  nearestMiles?: number;
  confirmingReportCount: number;
  noaaConfirmed: boolean;
  sources: string[];
  state?: string | null;
}

/**
 * Round a raw hail size UP to the nearest standard adjuster tier.
 * Raw measurements (0.38", 0.659") are confusing to homeowners and
 * adjusters — they're used to hearing 1/2", 3/4", penny/quarter/golfball.
 * We only round UP so we never under-report a real hit.
 * Pass-through for null/undefined so callers can chain safely.
 */
const HAIL_DISPLAY_TIERS = [
  0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.5, 4.0, 4.5, 5.0,
];
export function roundHailToTier(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  if (raw <= 0) return 0;
  for (const tier of HAIL_DISPLAY_TIERS) {
    if (raw <= tier + 1e-6) return tier;
  }
  // Anything larger than our table (rare), return rounded to .25"
  return Math.ceil(raw * 4) / 4;
}
/** Format a tier-rounded hail size for display ("1/2"", "3/4"", "1 1/4""). */
export function formatHailTier(raw: number | null | undefined): string {
  const tier = roundHailToTier(raw);
  if (tier === null) return '-';
  // Use fraction display for under-1 values (matches adjuster vocabulary)
  if (tier === 0.25) return '1/4"';
  if (tier === 0.5) return '1/2"';
  if (tier === 0.75) return '3/4"';
  if (tier === 1.0) return '1"';
  if (tier === 1.25) return '1 1/4"';
  if (tier === 1.5) return '1 1/2"';
  if (tier === 1.75) return '1 3/4"';
  if (tier === 2.0) return '2"';
  if (tier === 2.25) return '2 1/4"';
  if (tier === 2.5) return '2 1/2"';
  if (tier === 2.75) return '2 3/4"';
  if (tier === 3.0) return '3"';
  return `${tier}"`;
}

export interface AddressImpactReport {
  lat: number;
  lng: number;
  monthsBack: number;
  directHits: AddressImpactTier[];
  nearMiss: AddressImpactTier[];
  areaImpact: AddressImpactTier[];
  summary: {
    directHitCount: number;
    nearMissCount: number;
    areaImpactCount: number;
    datesExamined: number;
  };
  cacheStats: {
    swathCacheHits: number;
    swathColdFetches: number;
    swathSkippedDueToCap: number;
  };
}

// Verify-date — rep brings us a HailTrace/Hail Recon date, we check on-demand.
// Triggers a swath cache fill if the date isn't cached yet.
export interface VerifyDateResult {
  date: string;
  lat: number;
  lng: number;
  verdict: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
  swathHit: { directHit: boolean; maxInches: number | null; label: string | null };
  pointReportCount: number;
  closestDistanceMi: number | null;
  maxHailInches: number | null;
  sources: string[];
  topPointReports: Array<{ distanceMi: string; hail: number | null; wind: number | null; state: string }>;
}

export async function verifyDate(
  lat: number,
  lng: number,
  date: string,
  signal?: AbortSignal,
): Promise<VerifyDateResult | null> {
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(`${apiBase}/hail/verify-date`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, date }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(90_000)])
        : AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as VerifyDateResult;
  } catch {
    return null;
  }
}

export async function fetchAddressImpact(
  lat: number,
  lng: number,
  months: number,
  signal?: AbortSignal,
): Promise<AddressImpactReport | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const apiBase = getApiBaseUrl();
  const params = new URLSearchParams({
    lat: lat.toString(),
    lng: lng.toString(),
    months: Math.max(1, Math.min(60, Math.round(months))).toString(),
  });
  try {
    const res = await fetch(`${apiBase}/hail/address-impact?${params}`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AddressImpactReport;
    if (!data || typeof data !== 'object' || !Array.isArray(data.directHits)) return null;
    return data;
  } catch {
    return null;
  }
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
      events.push({
        id: `noaa-${e.id || i}`,
        eventType: et,
        state: e.state || '',
        county: '',
        beginDate: e.date || '',
        endDate: e.date || '',
        beginLat: eLat, beginLon: eLon, endLat: eLat, endLon: eLon,
        magnitude: e.magnitude || 0,
        magnitudeType: et === 'Thunderstorm Wind' ? 'mph' : 'inches',
        damageProperty: 0,
        source: e.source || 'NOAA',
        narrative: e.narrative || `${e.eventType} - ${e.location || ''}`,
        distanceMiles: e.distanceMiles ?? (eLat ? haversineDistanceMiles(lat, lng, eLat, eLon) : undefined),
        // Preserve traceability IDs + machine-tags through the client boundary.
        comments: e.comments,
        noaaEventId: e.noaaEventId,
        spcOmId: e.spcOmId,
        radarSite: e.radarSite,
        nwsForecastOffice: e.nwsForecastOffice,
        cocorahsStation: e.cocorahsStation,
        verificationCount: e.verificationCount,
      });
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
      // NHP feature server returns epoch ms; bucket to ET local date so DMV reps
      // see the calendar day they expect (not browser locale / UTC day).
      if (epoch) dateStr = etLocalDateOf(new Date(epoch));
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
    // closestMiles must reflect HAIL proximity only. If we mix wind in, a wind
    // gust within 1mi ends up labeled "Direct Hit" even when the closest hail
    // was 2+mi — confusing for roofing reps because wind-only events don't
    // sell roofs the way hail damage does. Kept "closestWindMiles" available
    // separately if we ever need it in the UI.
    const hailDistances = evts
      .filter((e) => e.eventType === 'Hail')
      .map((e) => e.distanceMiles)
      .filter((d): d is number => d != null && Number.isFinite(d));
    const windDistances = evts
      .filter((e) => e.eventType === 'Thunderstorm Wind')
      .map((e) => e.distanceMiles)
      .filter((d): d is number => d != null && Number.isFinite(d));
    const closestHailMiles = hailDistances.length > 0 ? Math.min(...hailDistances) : null;
    const closestWindMiles = windDistances.length > 0 ? Math.min(...windDistances) : null;
    return {
      date,
      label: formatDateLabel(date),
      eventCount: evts.length,
      maxHailInches: Math.max(0, ...evts.filter((e) => e.eventType === 'Hail').map((e) => e.magnitude)),
      maxWindMph: Math.max(0, ...evts.filter((e) => e.eventType === 'Thunderstorm Wind').map((e) => e.magnitude)),
      statesAffected: [...states],
      // For backwards-compat, closestMiles prefers hail (the direct-hit label).
      // Falls back to wind only when a day is wind-only (rare).
      closestMiles: closestHailMiles ?? closestWindMiles,
      closestHailMiles,
      closestWindMiles,
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
  try { const d = new Date(sd + 'T17:00:00Z'); dl = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: ET_ZONE }); } catch { /* keep raw */ }
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
    // When source tags are present (e.comments), prefer them over county/state
    // for the PDF's "Data Source" column — the dataSourceLabel regex matches
    // on tag codes (NOAA, NEXRAD, SPC, etc.). Fall back to county/state.
    const tagString = e.comments || '';
    const location = tagString || [e.county, e.state].filter(Boolean).join(', ');
    const c = {
      id: e.id,
      date: e.beginDate,
      latitude: e.beginLat,
      longitude: e.beginLon,
      distanceMiles,
      location,
      // `comments` carries the machine tags the PDF regex reads.
      comments: tagString || e.narrative || undefined,
      source: e.source,
      // Traceability IDs — preserved through client boundary for PDF rendering.
      noaaEventId: e.noaaEventId,
      spcOmId: e.spcOmId,
      radarSite: e.radarSite,
      nwsForecastOffice: e.nwsForecastOffice,
      cocorahsStation: e.cocorahsStation,
      verificationCount: e.verificationCount,
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

  // Async queue mode: the server enqueues a pdf_jobs row and returns {jobId}.
  // We poll /api/hail/report/:id every 2s until status='done', then GET the
  // /download endpoint to stream the bytes. Replaces the old inline-render
  // request which blocked the web container for 30-60s and caused 502s.
  const enqueueResponse = await fetch(`${apiBase}/hail/generate-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-email': email },
    body: JSON.stringify(payload),
  });
  if (!enqueueResponse.ok) throw new Error(`Report enqueue returned ${enqueueResponse.status}`);
  const enqueueJson = await enqueueResponse.json() as { jobId?: string; status?: string; pollUrl?: string; error?: string };
  if (!enqueueJson.jobId) throw new Error(enqueueJson.error || 'enqueue returned no jobId');

  const jobId = enqueueJson.jobId;
  const pollDeadline = Date.now() + 120_000; // 2 min ceiling; typical report renders in 3-10s
  let pollJson: any = null;
  while (Date.now() < pollDeadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollResp = await fetch(`${apiBase}/hail/report/${jobId}`, { headers: { 'x-user-email': email } });
    if (!pollResp.ok) continue;
    pollJson = await pollResp.json();
    if (pollJson.status === 'done') break;
    if (pollJson.status === 'error') throw new Error(pollJson.error || 'report render failed');
  }
  if (!pollJson || pollJson.status !== 'done') throw new Error('Report render timed out after 2 minutes — try again.');

  // Stream the finished PDF.
  const downloadResp = await fetch(`${apiBase}${pollJson.url}`, { headers: { 'x-user-email': email } });
  if (!downloadResp.ok) throw new Error(`Report download returned ${downloadResp.status}`);
  const blob = await downloadResp.blob();
  const dateTag = opts.dateOfLoss
    || (opts.datesOfLoss && opts.datesOfLoss.length > 0 ? `multi_${opts.datesOfLoss.length}_dates` : '')
    || (opts.fromDate && opts.toDate ? `${opts.fromDate}_to_${opts.toDate}` : '')
    || (opts.lifetime ? 'all-history' : 'report');
  const fallbackFilename = `Storm_Report_${address.replace(/[^a-zA-Z0-9]/g, '_')}_${dateTag}.pdf`;
  downloadBlob(blob, getResponseFilename(downloadResp, fallbackFilename));
}
