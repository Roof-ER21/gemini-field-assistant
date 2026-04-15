/**
 * Server-side Storm Contour Overlay Renderer
 *
 * Ports the HailContourLayer algorithm (organic shapes, Chaikin smoothing,
 * deterministic noise) to Node.js. Generates an SVG overlay of hail contour
 * polygons, then composites it onto a base map image using sharp.
 *
 * Used by pdfReportServiceV2 to embed hail swath visualizations in PDF reports.
 */

import sharp from 'sharp';

interface ContourEvent {
  beginLat: number;
  beginLon: number;
  endLat: number;
  endLon: number;
  magnitude: number;
  eventType: string;
}

interface Point {
  x: number;
  y: number;
}

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// ============================================================
// Ported from components/HailContourLayer.tsx — same algorithms
// ============================================================

function getRadiusMiles(magnitudeInches: number): number {
  const mag = Number(magnitudeInches) || 0;
  if (mag >= 3) return 8;
  if (mag >= 2.5) return 6;
  if (mag >= 2) return 5;
  if (mag >= 1.5) return 4;
  if (mag >= 1) return 3.5;
  return 3;
}

function getHailColor(magnitudeInches: number): string {
  if (magnitudeInches >= 4.5) return '#800080';
  if (magnitudeInches >= 2.5) return '#8B0000';
  if (magnitudeInches >= 1.75) return '#FF0000';
  if (magnitudeInches >= 1.5) return '#FF6600';
  if (magnitudeInches >= 1.0) return '#FF9900';
  if (magnitudeInches >= 0.75) return '#FFFF00';
  if (magnitudeInches >= 0.25) return '#00FF00';
  return '#90EE90';
}

function seededNoise(seed: number, index: number): number {
  const x = Math.sin(seed * 127.1 + index * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function organicRadius(baseRadius: number, angle: number, seed: number): number {
  const n1 = Math.sin(angle * 2.3 + seed * 1.7) * 0.12;
  const n2 = Math.sin(angle * 4.1 + seed * 3.2) * 0.08;
  const n3 = Math.sin(angle * 7.9 + seed * 0.3) * 0.05;
  return baseRadius * (1.0 + n1 + n2 + n3);
}

function toProjected(lat: number, lng: number, refLat: number, refLng: number): Point {
  const milesPerLat = 69;
  const milesPerLng = 69 * Math.cos((refLat * Math.PI) / 180);
  return { x: (lng - refLng) * milesPerLng, y: (lat - refLat) * milesPerLat };
}

function getDistanceMiles(a: ContourEvent, b: ContourEvent): number {
  const meanLat = ((a.beginLat + b.beginLat) / 2) * (Math.PI / 180);
  const dx = (a.beginLon - b.beginLon) * 69 * Math.cos(meanLat);
  const dy = (a.beginLat - b.beginLat) * 69;
  return Math.hypot(dx, dy);
}

function clusterEvents(events: ContourEvent[]): Array<Array<ContourEvent & { radiusMiles: number }>> {
  const clusters: Array<Array<ContourEvent & { radiusMiles: number }>> = [];
  const visited = new Set<number>();

  for (let idx = 0; idx < events.length; idx++) {
    if (visited.has(idx)) continue;
    const event = events[idx];
    const seed: ContourEvent & { radiusMiles: number } = { ...event, radiusMiles: getRadiusMiles(event.magnitude) };
    const cluster = [seed];
    visited.add(idx);

    let expanded = true;
    while (expanded) {
      expanded = false;
      for (let ci = 0; ci < events.length; ci++) {
        if (visited.has(ci)) continue;
        const candidate = events[ci];
        const candidateRadius = getRadiusMiles(candidate.magnitude);
        const threshold = Math.max(10, candidateRadius * 2.5);
        if (cluster.some((member) => getDistanceMiles(member, candidate) <= threshold)) {
          cluster.push({ ...candidate, radiusMiles: candidateRadius });
          visited.add(ci);
          expanded = true;
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function sampleFootprint(event: ContourEvent & { radiusMiles: number }, refLat: number, refLng: number): Point[] {
  const begin = toProjected(event.beginLat, event.beginLon, refLat, refLng);
  const seed = Math.abs(event.beginLat * 1000 + event.beginLon * 777);

  const hasEnd = Number.isFinite(event.endLat) && Number.isFinite(event.endLon) &&
    (Math.abs(event.endLat - event.beginLat) > 0.001 || Math.abs(event.endLon - event.beginLon) > 0.001);

  const elongAngle = hasEnd
    ? Math.atan2(event.endLat - event.beginLat, event.endLon - event.beginLon)
    : seededNoise(seed, 0) * Math.PI * 2;
  const elongation = 1.2 + seededNoise(seed, 1) * 0.4;

  if (!hasEnd) {
    const ring: Point[] = [];
    const steps = 28;
    for (let i = 0; i < steps; i++) {
      const angle = (Math.PI * 2 * i) / steps;
      const r = organicRadius(event.radiusMiles, angle, seed);
      const cosA = Math.cos(angle - elongAngle);
      const sinA = Math.sin(angle - elongAngle);
      const rE = r * Math.sqrt((elongation * cosA) ** 2 + sinA ** 2) / Math.sqrt(cosA ** 2 + sinA ** 2);
      ring.push({ x: begin.x + Math.cos(angle) * rE, y: begin.y + Math.sin(angle) * rE });
    }
    return ring;
  }

  const end = toProjected(event.endLat, event.endLon, refLat, refLng);
  const pathAngle = Math.atan2(end.y - begin.y, end.x - begin.x);
  const halfWidth = event.radiusMiles;
  const points: Point[] = [];
  const arcSteps = 14;

  for (let i = 0; i <= arcSteps; i++) {
    const a = pathAngle + Math.PI / 2 + (Math.PI * i) / arcSteps;
    const r = organicRadius(halfWidth, a, seed);
    points.push({ x: begin.x + Math.cos(a) * r, y: begin.y + Math.sin(a) * r });
  }
  for (let i = 0; i <= arcSteps; i++) {
    const a = pathAngle - Math.PI / 2 + (Math.PI * i) / arcSteps;
    const r = organicRadius(halfWidth, a, seed + 100);
    points.push({ x: end.x + Math.cos(a) * r, y: end.y + Math.sin(a) * r });
  }
  return points;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function buildConvexHull(points: Point[]): Point[] {
  if (points.length <= 1) return points;
  const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  return chaikinSmooth(chaikinSmooth(hull));
}

function chaikinSmooth(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    result.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    result.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  return result;
}

// ============================================================
// SVG generation + sharp compositing
// ============================================================

function milesToPixel(point: Point, bounds: MapBounds, imgWidth: number, imgHeight: number, refLat: number, refLng: number): { px: number; py: number } {
  const milesPerLat = 69;
  const milesPerLng = 69 * Math.cos((refLat * Math.PI) / 180);
  const lat = refLat + point.y / milesPerLat;
  const lng = refLng + point.x / milesPerLng;

  const px = ((lng - bounds.west) / (bounds.east - bounds.west)) * imgWidth;
  const py = ((bounds.north - lat) / (bounds.north - bounds.south)) * imgHeight;
  return { px, py };
}

function buildContourSVG(events: ContourEvent[], bounds: MapBounds, imgWidth: number, imgHeight: number): string {
  const hailEvents = events
    .filter(e => e.eventType?.toLowerCase().includes('hail') && Number.isFinite(e.beginLat) && e.beginLat !== 0)
    .map(e => ({
      ...e,
      beginLat: Number(e.beginLat),
      beginLon: Number(e.beginLon),
      endLat: Number(e.endLat) || Number(e.beginLat),
      endLon: Number(e.endLon) || Number(e.beginLon),
      magnitude: Number(e.magnitude) || 0,
    }));

  if (hailEvents.length === 0) return '';

  const refLat = (bounds.north + bounds.south) / 2;
  const refLng = (bounds.east + bounds.west) / 2;

  const paths: string[] = [];
  for (const cluster of clusterEvents(hailEvents)) {
    if (cluster.length === 0) continue;

    const cRefLat = cluster.reduce((s, e) => s + e.beginLat, 0) / cluster.length;
    const cRefLng = cluster.reduce((s, e) => s + e.beginLon, 0) / cluster.length;
    const sampled = cluster.flatMap(e => sampleFootprint(e, cRefLat, cRefLng));
    const hull = buildConvexHull(sampled);
    if (hull.length < 3) continue;

    const maxMag = Math.max(...cluster.map(e => e.magnitude));
    const color = getHailColor(maxMag);

    // Convert projected miles back to lat/lng, then to pixel coords
    const milesPerLat = 69;
    const milesPerLng = 69 * Math.cos((cRefLat * Math.PI) / 180);
    const pixelPoints = hull.map(p => {
      const lat = cRefLat + p.y / milesPerLat;
      const lng = cRefLng + p.x / milesPerLng;
      const px = ((lng - bounds.west) / (bounds.east - bounds.west)) * imgWidth;
      const py = ((bounds.north - lat) / (bounds.north - bounds.south)) * imgHeight;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    });

    paths.push(`<polygon points="${pixelPoints.join(' ')}" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-opacity="0.6" stroke-width="1.5"/>`);
  }

  if (paths.length === 0) return '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight}" viewBox="0 0 ${imgWidth} ${imgHeight}">${paths.join('')}</svg>`;
}

/**
 * Render organic hail contours onto a base map image.
 * Returns a new PNG buffer with the contour overlay composited.
 */
export async function compositeContourOverlay(
  baseMapBuffer: Buffer,
  events: ContourEvent[],
  center: { lat: number; lng: number },
  zoom: number,
  imgWidth = 600,
  imgHeight = 300,
): Promise<Buffer> {
  // Calculate map bounds from center + zoom (Web Mercator approximation)
  const metersPerPixel = (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / (2 ** zoom);
  const halfWidthDeg = (metersPerPixel * imgWidth / 2) / 111320;
  const halfHeightDeg = (metersPerPixel * imgHeight / 2) / 110574;

  const bounds: MapBounds = {
    north: center.lat + halfHeightDeg,
    south: center.lat - halfHeightDeg,
    east: center.lng + halfWidthDeg,
    west: center.lng - halfWidthDeg,
  };

  const svg = buildContourSVG(events, bounds, imgWidth, imgHeight);
  if (!svg) return baseMapBuffer;

  const overlayBuffer = Buffer.from(svg);

  return sharp(baseMapBuffer)
    .resize(imgWidth, imgHeight, { fit: 'cover' })
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
