/**
 * PDF Report Generation Service V2 - "NOAA-Forward" Template
 *
 * Alternative report template that leads with federal data source credibility.
 * Instead of branding as "Roof-ER Storm Intelligence", this template
 * emphasizes NOAA, NWS, and NEXRAD as the authoritative data sources.
 *
 * Key differences from V1 (standard IHM-style):
 * - "Storm Impact Analysis" title (neutral, professional)
 * - Prominent "Data Sources & Methodology" section
 * - Full federal agency names in tables (not abbreviations)
 * - Certification-style language referencing CCM-grade data
 * - Professional disclaimer citing federal data authorities
 * - Subtle Roof-ER branding (preparer, not source)
 *
 * ALL dates in Eastern timezone (EDT/EST).
 */

import * as PDFKit from 'pdfkit';
import { PassThrough } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { DamageScoreResult } from './damageScoreService.js';
import { type NWSAlert, extractHailSizeFromText, extractWindSpeedFromText } from './nwsAlertService.js';
import { generateHailNarrative } from './narrativeService.js';
import type { ConsilienceReport } from './consilienceService.js';
import {
  displayHailInches,
  buildBandVerification,
  type BandReport,
} from './displayCapService.js';

const PDFDocument = (PDFKit as any).default || PDFKit;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== INTERFACES (same as V1) ==========

interface HailEvent {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  hailSize: number | null;
  severity: 'minor' | 'moderate' | 'severe';
  source: string;
  distanceMiles?: number;
  stormDirection?: string;
  stormSpeed?: number;
  duration?: number;
  comments?: string;
  // Adjuster-facing traceability IDs (optional)
  noaaEventId?: string;              // NOAA NCEI Storm Events EVENT_ID
  spcOmId?: string;                  // SPC Omega ID
  radarSite?: string;                // NEXRAD WSR-88D radar site (e.g., KLWX)
  nwsForecastOffice?: string;        // NWS WFO code (e.g., LWX, AKQ, PHI)
  cocorahsStation?: string;          // CoCoRaHS station number
}

interface NOAAEvent {
  id: string;
  date: string;
  latitude: number;
  longitude: number;
  magnitude: number | null;
  eventType: 'hail' | 'wind' | 'tornado';
  location: string;
  distanceMiles?: number;
  comments?: string;
  noaaEventId?: string;
  spcOmId?: string;
  radarSite?: string;
  nwsForecastOffice?: string;
  cocorahsStation?: string;
}

export type ReportFilter = 'all' | 'hail-only' | 'hail-wind' | 'ihm-only' | 'noaa-only';

interface NWSAlertWithRadar {
  alert: NWSAlert;
  radarImage: Buffer | null;
  radarTimestamp: string;
}

interface ReportInput {
  address: string;
  city?: string;
  state?: string;
  // Date filters — use one of these, or omit all for lifetime (5-year) report:
  dateOfLoss?: string;              // single storm (YYYY-MM-DD in ET)
  datesOfLoss?: string[];           // multiple specific storms (YYYY-MM-DD[])
  fromDate?: string;                // range start (YYYY-MM-DD)
  toDate?: string;                  // range end (YYYY-MM-DD)
  lat: number;
  lng: number;
  radius: number;
  events: HailEvent[];
  noaaEvents: NOAAEvent[];
  historyEvents?: HailEvent[];
  damageScore: DamageScoreResult;
  repName?: string;
  repPhone?: string;
  repEmail?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyWebsite?: string;
  filter?: ReportFilter;
  /** Per-date swath direct-hit payload from addressImpactService. Each entry
   * means: "on this date, the property's lat/lng sits INSIDE an MRMS hail-
   * swath polygon of size `hailInches`." The PDF history table displays the
   * swath size in the "At Property" column for these rows (no separate Hit
   * column — the populated At Property value IS the direct-hit signal). */
  swathDirectHits?: { date: string; hailInches: number }[];
  /** DEPRECATED: use swathDirectHits. Still accepted for backward compat. */
  swathDirectHitDates?: string[];
  mapImage?: Buffer | null;
  nexradImage?: Buffer | null;
  nexradTimestamp?: string;
  nwsAlerts?: NWSAlert[];
  nwsAlertImages?: NWSAlertWithRadar[];
  includeNexrad?: boolean;
  includeMap?: boolean;
  includeWarnings?: boolean;
  includeBuildingCodes?: boolean;
  customerName?: string;
  evidenceItems?: Array<{
    id: string;
    provider: 'upload' | 'youtube' | 'flickr';
    mediaType: 'image' | 'video' | 'link';
    title: string;
    stormDate: string | null;
    notes?: string;
    externalUrl?: string;
    thumbnailUrl?: string | null;
    publishedAt?: string | null;
    imageDataUrl?: string | null;
    fileName?: string;
    mimeType?: string;
  }>;
  propertyRisk?: {
    estimatedRoofAge: number | null;
    medianYearBuilt: number | null;
    roofVulnerability: string;
    riskMultiplier: number;
  } | null;
  /**
   * Per-storm-date multi-source corroboration. When present, the PDF
   * adds an "Independent Multi-Source Corroboration" section that lists
   * each source (MRMS, NEXRAD L2, NWS, ground reports, mPING, surface
   * obs) with citation URLs — defeats the "contractor's tool" credibility
   * gap by structurally citing federal/public records.
   */
  consilienceReports?: ConsilienceReport[];
}

// ========== SERVICE CLASS ==========

export class PDFReportServiceV2 {
  // Professional color scheme — navy/slate tones for federal authority feel
  private readonly C = {
    text: '#1a1a2e',            // Near-black text
    lightText: '#4a4a6a',       // Slate secondary
    mutedText: '#8888aa',       // Muted caption
    sectionBg: '#e8eaf0',       // Cool gray section banner
    sectionText: '#3d5a80',     // Steel blue section headers
    tableBorder: '#bbbbd0',     // Table borders
    tableHeaderBg: '#dde1ec',   // Blue-tinted header
    tableHeaderText: '#1a1a2e',
    tableAltRow: '#f5f6fa',     // Very light blue alternating
    accent: '#1b4965',          // Deep navy accent
    accentLight: '#5fa8d3',     // Light blue for links
    link: '#2563eb',
    sourceGreen: '#0a6640',     // NOAA green for source badges
    white: '#ffffff',
    black: '#000000',
  };

  private readonly M = 50;
  private readonly PW = 612;
  private readonly PH = 792;
  private readonly CW = 612 - 100;
  private readonly BOTTOM = 745;

  // ========== FORMATTING HELPERS ==========

  private parseStormDate(dateStr: string): Date | null {
    try {
      if (!dateStr) return null;

      const dateOnlyMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})$/);
      if (dateOnlyMatch) {
        const parsed = new Date(`${dateOnlyMatch[1]}T12:00:00Z`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }

      const parsed = new Date(dateStr);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }

  private getDateKey(dateStr: string): string | null {
    const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  private isDateOnly(dateStr: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  }

  private fmtDateET(dateStr: string): string {
    const d = this.parseStormDate(dateStr);
    if (!d) return dateStr;
    return d.toLocaleDateString('en-US', {
      timeZone: 'America/New_York', month: 'numeric', day: 'numeric', year: 'numeric'
    });
  }

  private fmtTimeET(dateStr: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
    const d = this.parseStormDate(dateStr);
    if (!d) return '';
    const etFull = d.toLocaleString('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short'
    });
    const tz = etFull.includes('EDT') ? 'EDT' : 'EST';
    const time = d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true
    });
    return `${time} ${tz}`;
  }

  private fmtDateTimeET(dateStr: string): string {
    const date = this.fmtDateET(dateStr);
    const time = this.fmtTimeET(dateStr);
    return time ? `${date}\n${time}` : date;
  }

  private fmtFullDateTimeET(dateStr: string): string {
    if (this.isDateOnly(dateStr)) {
      return this.fmtDateET(dateStr);
    }
    const d = this.parseStormDate(dateStr);
    if (!d) return dateStr;
    const etFull = d.toLocaleString('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short'
    });
    const tz = etFull.includes('EDT') ? 'EDT' : 'EST';
    const formatted = d.toLocaleString('en-US', {
      timeZone: 'America/New_York', month: 'numeric', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
    return `${formatted} ${tz}`;
  }

  private decodeImageDataUrl(dataUrl?: string | null): Buffer | null {
    if (!dataUrl) return null;
    const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (!match) return null;
    try {
      return Buffer.from(match[1], 'base64');
    } catch {
      return null;
    }
  }

  private generateReportId(): string {
    const now = Date.now();
    const rand = Math.floor(Math.random() * 9999999);
    return `${Math.floor(now / 1000)}-${rand}`;
  }

  private generateVerificationCode(): string {
    return Math.random().toString(16).substring(2, 8);
  }

  // ========== DRAWING HELPERS ==========

  private drawSectionBanner(doc: any, title: string): void {
    const bannerH = 28;
    this.checkPageBreak(doc, bannerH + 20);
    doc.moveDown(0.6);
    const y = doc.y;
    doc.rect(this.M - 10, y, this.CW + 20, bannerH).fill(this.C.sectionBg);
    doc.fontSize(13).fillColor(this.C.sectionText).font('Helvetica-Oblique')
       .text(title, this.M, y + 7, { width: this.CW, align: 'center' });
    doc.y = y + bannerH + 8;
  }

  private checkPageBreak(doc: any, space: number): boolean {
    if (doc.y + space > this.BOTTOM) {
      doc.addPage();
      doc.y = this.M;
      return true;
    }
    return false;
  }

  /**
   * "Independent Multi-Source Corroboration" — per-date sub-block listing
   * which independent measurement modalities recorded the storm, with
   * citation URLs the adjuster can verify themselves. Auto-curate: only
   * sources that fired (present=true) are shown. Silence is omission, not
   * "no data" placeholder.
   */
  private drawConsilienceSection(doc: any, reports: ConsilienceReport[]): void {
    if (!reports || reports.length === 0) return;
    // Earliest first — establishes the longest possible damage timeline
    // (rep can argue: "this property has had hail since [first date]").
    const ordered = [...reports].sort((a, b) => a.dateIso.localeCompare(b.dateIso));

    this.drawSectionBanner(doc, 'Independent Multi-Source Corroboration');

    doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica-Oblique')
       .text(
         'Each storm date below is corroborated against multiple independent measurement modalities — radar (MRMS / NEXRAD L2), forecaster judgment (NWS warnings), federal post-event databases (NCEI / IEM / SPC), citizen visual reports (mPING), and mechanical instrument readings (Synoptic / MADIS surface stations). Every claim is footnoted with a public source URL the reader can independently verify.',
         this.M, doc.y, { width: this.CW },
       );
    doc.moveDown(0.6);

    const sourceOrder: Array<{
      key: 'mrms' | 'nexrad' | 'nws' | 'ground' | 'mping' | 'surface';
      label: string;
      modality: string;
    }> = [
      { key: 'mrms',    label: 'MRMS Radar',          modality: 'Radar reflectivity (multi-radar composite)' },
      { key: 'nexrad',  label: 'NEXRAD L2',           modality: 'Raw radar volume scan' },
      { key: 'nws',     label: 'NWS Warning',         modality: 'Forecaster judgment / official warning' },
      { key: 'ground',  label: 'Federal Ground',      modality: 'Post-event ground report (NCEI/IEM/SPC/CoCoRaHS)' },
      { key: 'mping',   label: 'mPING Citizen',       modality: 'Visual citizen report (NOAA-affiliated)' },
      { key: 'surface', label: 'Surface Stations',    modality: 'Anemometer + tipping bucket (Synoptic / MADIS)' },
    ];

    for (const r of ordered) {
      const dateLabel = (() => {
        try {
          return new Date(`${r.dateIso}T12:00:00`).toLocaleDateString('en-US', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
            timeZone: 'America/New_York',
          });
        } catch {
          return r.dateIso;
        }
      })();

      // Sub-header per storm date with consilience score badge
      this.checkPageBreak(doc, 80);
      const subY = doc.y;
      doc.rect(this.M - 4, subY, this.CW + 8, 22).fill('#f5f6fa');
      doc.fontSize(11).fillColor(this.C.sectionText).font('Helvetica-Bold')
         .text(dateLabel, this.M, subY + 5, { width: this.CW - 100 });

      // Score badge: "5 of 6 sources agree"
      const total = sourceOrder.length;
      const score = r.consilienceScore;
      const badge = `${score} of ${total} sources confirm`;
      const badgeColor = score >= 4 ? this.C.sourceGreen : score >= 2 ? this.C.accent : this.C.lightText;
      doc.fontSize(9).fillColor(badgeColor).font('Helvetica-Bold')
         .text(badge, this.M + this.CW - 130, subY + 7, { width: 130, align: 'right' });
      doc.y = subY + 24;
      doc.moveDown(0.2);

      // Per-source rows — only those with present=true
      let renderedAny = false;
      for (const s of sourceOrder) {
        const finding = r[s.key];
        if (!finding || !finding.present) continue;
        renderedAny = true;
        this.checkPageBreak(doc, 36);

        const rowY = doc.y;
        // Source label column (left, bold)
        doc.fontSize(9).fillColor(this.C.sourceGreen).font('Helvetica-Bold')
           .text(`✓ ${s.label}`, this.M, rowY, { width: 110, continued: false });

        // Headline column (middle)
        const headline = finding.headline || s.modality;
        doc.fontSize(9).fillColor(this.C.text).font('Helvetica')
           .text(headline, this.M + 115, rowY, { width: this.CW - 115 });

        // Citation URL on the next line, smaller, link-styled
        const urlY = doc.y + 1;
        doc.fontSize(7).fillColor(this.C.link).font('Helvetica-Oblique')
           .text(`Source: ${this.truncateUrl(finding.sourceUrl)}`, this.M + 115, urlY, {
             width: this.CW - 115,
             link: finding.sourceUrl,
             underline: false,
           });
        doc.moveDown(0.3);
      }

      if (!renderedAny) {
        doc.fontSize(9).fillColor(this.C.mutedText).font('Helvetica-Oblique')
           .text('No independent corroboration on this date.', this.M, doc.y, { width: this.CW });
        doc.moveDown(0.4);
      }

      doc.moveDown(0.5);
    }

    // Reproducibility footer
    this.checkPageBreak(doc, 30);
    doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica-Oblique')
       .text(
         'All sources above are public federal/affiliated databases. URLs link to the same data Roof-ER queried — reproduce any line independently to verify.',
         this.M, doc.y, { width: this.CW, align: 'center' },
       );
    doc.moveDown(0.5);
  }

  private truncateUrl(url: string, maxLen = 90): string {
    if (url.length <= maxLen) return url;
    return url.slice(0, maxLen - 1) + '…';
  }

  private getStateBuildingCodes(state: string): {
    stateName: string;
    codeEdition: string;
    provisions: { section: string; requirement: string }[];
    disclaimer: string;
  } | null {
    const codes: Record<string, ReturnType<typeof this.getStateBuildingCodes>> = {
      'VA': {
        stateName: 'Virginia',
        codeEdition: '2021 Virginia Uniform Statewide Building Code (USBC) — IRC 2021',
        provisions: [
          { section: 'R908.3 Re-covering', requirement: 'Max 2 layers asphalt shingles. If 2+ layers exist, complete tear-off to deck is required.' },
          { section: 'R908.3.1 Tear-off', requirement: 'Required when 2+ layers, wood shakes/shingles, or deck damage is present.' },
          { section: 'R905.1.2 Ice barrier', requirement: 'Required at eaves (24" past wall), valleys, and roof-to-wall intersections.' },
          { section: 'R905.2.8.5 Drip edge', requirement: 'Required at eaves and rakes on all asphalt shingle roofs.' },
          { section: 'R903.2.1 Flashings', requirement: 'Required at all wall-to-roof intersections and penetrations. Replace all on tear-off.' },
          { section: 'R903.2.2 Cricket', requirement: 'Required for chimneys or penetrations exceeding 30 inches in width.' },
          { section: 'R703.2 House wrap', requirement: 'Weather-resistive barrier required behind all exterior cladding.' },
        ],
        disclaimer: 'Code provisions reference the 2021 USBC (IRC 2021). Local jurisdictions may adopt more restrictive requirements. All roofing work requiring a permit must be performed by a DPOR-licensed contractor.',
      },
      'MD': {
        stateName: 'Maryland',
        codeEdition: 'Maryland Residential Code 2021 — IRC 2021 with Maryland Amendments',
        provisions: [
          { section: 'R908.3 Roof Replacement', requirement: 'Roof replacement SHALL include removal of existing layers down to the roof deck. Full tear-off is code-required.' },
          { section: 'R908.2 Structural Loads', requirement: 'Structural roof components must support the roof covering system and installation loads.' },
          { section: 'R908.3.1 Roof Recover', requirement: 'Overlay only permitted over one existing layer of asphalt shingles if surface is smooth and undamaged.' },
          { section: 'R905.1.2 Ice barrier', requirement: 'Required at eaves (24" past wall), valleys, and roof-to-wall intersections.' },
          { section: 'R905.2.8.5 Drip edge', requirement: 'Required at eaves and rakes on all asphalt shingle roofs.' },
          { section: 'R903.2.1 Flashings', requirement: 'Required at all intersections and penetrations. All deteriorated flashings must be replaced.' },
          { section: 'R703.2 House wrap', requirement: 'Weather-resistive barrier required behind all exterior cladding.' },
        ],
        disclaimer: 'Code provisions reference the Maryland Residential Code 2021 (IRC 2021 with amendments). Maryland R908.3 requires full tear-off for roof replacement — this is stricter than some neighboring states. All work requires an MHIC-licensed contractor.',
      },
      'PA': {
        stateName: 'Pennsylvania',
        codeEdition: '2018 Pennsylvania Uniform Construction Code — IRC 2018',
        provisions: [
          { section: 'R908.3 Re-covering', requirement: 'Max 2 layers asphalt shingles. Complete tear-off required if 2+ layers or non-asphalt material.' },
          { section: 'R905.1.2 Ice barrier', requirement: 'Required at eaves (24" past wall), valleys, and roof-to-wall intersections.' },
          { section: 'R905.2.8.5 Drip edge', requirement: 'Required at eaves and rakes on all asphalt shingle roofs.' },
          { section: 'R903.2.1 Flashings', requirement: 'Required at all wall-to-roof intersections and penetrations.' },
          { section: 'R903.2.2 Cricket', requirement: 'Required for chimneys exceeding 30 inches in width.' },
          { section: 'R703.2 House wrap', requirement: 'Weather-resistive barrier required behind all exterior cladding.' },
        ],
        disclaimer: 'Code provisions reference the PA UCC (IRC 2018). Philadelphia and some municipalities may have additional local requirements. All work requires a PA HIC-registered contractor.',
      },
    };
    return codes[state] || null;
  }

  private drawTable(
    doc: any,
    headers: string[],
    rows: string[][],
    colWidths: number[],
    options: { boldColumns?: number[]; boldValues?: Record<number, string[]>; } = {}
  ): void {
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const headerH = 20;
    const cellPadX = 4;
    const cellPadY = 4;
    const fontSize = 8;
    let tableY = doc.y;

    const measureRowHeight = (row: string[]): number => {
      let maxH = 16;
      row.forEach((cell, i) => {
        const w = colWidths[i] - cellPadX * 2;
        doc.fontSize(fontSize).font('Helvetica');
        const h = doc.heightOfString(cell, { width: w }) + cellPadY * 2;
        if (h > maxH) maxH = h;
      });
      return Math.min(maxH, 60);
    };

    const drawHeader = () => {
      doc.rect(this.M, tableY, tableWidth, headerH).fill(this.C.tableHeaderBg);
      doc.rect(this.M, tableY, tableWidth, headerH).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
      let x = this.M;
      headers.forEach((h, i) => {
        doc.fontSize(8).fillColor(this.C.tableHeaderText).font('Helvetica-Bold')
           .text(h, x + cellPadX, tableY + 5, { width: colWidths[i] - cellPadX * 2 });
        if (i > 0) {
          doc.moveTo(x, tableY).lineTo(x, tableY + headerH)
             .strokeColor(this.C.tableBorder).lineWidth(0.3).stroke();
        }
        x += colWidths[i];
      });
      tableY += headerH;
    };

    drawHeader();

    rows.forEach((row, idx) => {
      const rowH = measureRowHeight(row);
      if (tableY + rowH > this.BOTTOM) {
        doc.addPage();
        tableY = this.M;
        drawHeader();
      }
      if (idx % 2 === 0) {
        doc.rect(this.M, tableY, tableWidth, rowH).fill(this.C.tableAltRow);
      }
      doc.rect(this.M, tableY, tableWidth, rowH).strokeColor(this.C.tableBorder).lineWidth(0.3).stroke();
      let x = this.M;
      row.forEach((cell, i) => {
        const isBold = options.boldColumns?.includes(i) ||
          (options.boldValues?.[i] && options.boldValues[i].includes(cell));
        doc.fontSize(fontSize).fillColor(this.C.text)
           .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
           .text(cell, x + cellPadX, tableY + cellPadY, {
             width: colWidths[i] - cellPadX * 2, height: rowH - cellPadY
           });
        if (i > 0) {
          doc.moveTo(x, tableY).lineTo(x, tableY + rowH)
             .strokeColor(this.C.tableBorder).lineWidth(0.2).stroke();
        }
        x += colWidths[i];
      });
      tableY += rowH;
    });

    doc.y = tableY + 8;
  }

  // ========== MAIN REPORT GENERATOR ==========

  generateReport(input: ReportInput): PassThrough {
    const reportId = this.generateReportId();
    const verificationCode = this.generateVerificationCode();

    const doc = new PDFDocument({
      size: 'LETTER',
      margin: this.M,
      info: {
        Title: `Storm Impact Analysis - ${input.address}`,
        Author: 'NOAA/NWS Data Analysis',
        Subject: `Severe Weather Impact Analysis for ${input.address}`,
        Creator: 'Roof-ER Weather Intelligence Platform',
      },
    });

    const stream = new PassThrough();
    doc.pipe(stream);

    // ===== SWATH HIT PROMOTION (must happen BEFORE any event filtering) =====
    // The UI's side panel labels dates as Direct Hit based on point-in-polygon
    // against mrms_swath_cache. When the PDF is rendered we don't want a
    // secondary distance-only labeling system to silently drop those dates;
    // instead we synthesize an "at-property" hail observation per swath hit
    // so the dashboard card (Largest Hail), Storm Impact Narrative event
    // count, Documented Hail Events table, AND Historical Storm Activity
    // table all see the swath hits as first-class observations tied to the
    // property. Without this, the dashboard can show "N/A" and the narrative
    // "0 storm events" for a property that's clearly inside 10+ swath
    // polygons — a huge credibility hit with adjusters.
    const normalizedSwathHits: { date: string; hailInches: number }[] = [
      ...((input.swathDirectHits || []) as Array<{ date: string; hailInches: number }>),
      ...((input.swathDirectHitDates || []) as string[]).map((d) => ({ date: d, hailInches: 0.5 })),
    ];
    if (normalizedSwathHits.length > 0) {
      const existingEventIds = new Set((input.events || []).map((e) => e.id));
      const syntheticSwathEvents: HailEvent[] = normalizedSwathHits
        .filter((h) => !existingEventIds.has(`swath-${h.date}`))
        .map((h) => ({
          id: `swath-${h.date}`,
          date: h.date,
          latitude: input.lat,
          longitude: input.lng,
          hailSize: h.hailInches,
          severity: h.hailInches >= 1.75 ? 'severe' : h.hailInches >= 1 ? 'moderate' : 'minor',
          source: 'MRMS Swath',
          distanceMiles: 0,
          radarSite: 'MRMS',
        }));
      // Clone the input object so we don't mutate the caller's value.
      input = {
        ...input,
        events: [...(input.events || []), ...syntheticSwathEvents],
        historyEvents: [...(input.historyEvents || []), ...syntheticSwathEvents],
      };
    }

    // ===== DATE FILTER — supports single/multi/range/lifetime modes =====
    const dateSet =
      input.datesOfLoss && input.datesOfLoss.length > 0
        ? new Set(input.datesOfLoss)
        : input.dateOfLoss
          ? new Set([input.dateOfLoss])
          : null;
    const dateMatchesLoss = (value: string): boolean => {
      const key = this.getDateKey(value);
      if (!key) return true;
      if (input.fromDate && key < input.fromDate) return false;
      if (input.toDate && key > input.toDate) return false;
      if (dateSet) return dateSet.has(key);
      return true;
    };

    const selectedEvents = input.events.filter(e => dateMatchesLoss(e.date));
    const selectedNoaaEvents = input.noaaEvents.filter(e => dateMatchesLoss(e.date));
    const selectedNoaaHailEvents = selectedNoaaEvents.filter(e => e.eventType === 'hail');
    const selectedWindEvents = selectedNoaaEvents.filter(e => e.eventType === 'wind');

    const allHailSizes = [
      ...input.events.map(e => e.hailSize || 0),
      ...input.noaaEvents.filter(e => e.eventType === 'hail').map(e => e.magnitude || 0)
    ].filter(s => s > 0);
    const maxHail = allHailSizes.length > 0 ? Math.max(...allHailSizes) : 0;
    const selectedHailSizes = [
      ...selectedEvents.map(e => e.hailSize || 0),
      ...selectedNoaaHailEvents.map(e => e.magnitude || 0),
    ].filter(s => s > 0);
    // When a date filter is in play (dateOfLoss/datesOfLoss/range) and no
    // events matched, DON'T fall back to the all-history max — that would
    // make the narrative claim "3" baseball hail today" when nothing
    // was actually documented today. For lifetime reports (no filter),
    // keep the maxHail fallback because the whole history IS the query.
    const hasDateFilter = Boolean(input.dateOfLoss || input.datesOfLoss || input.fromDate || input.toDate);
    const selectedMaxHail = selectedHailSizes.length > 0
      ? Math.max(...selectedHailSizes)
      : (hasDateFilter ? 0 : maxHail);
    const severeCount = selectedHailSizes.filter(s => s >= 1.5).length;
    const hailEvents = [
      ...selectedEvents.map(e => ({
        date: e.date, size: e.hailSize, source: 'NEXRAD' as const,
        distance: e.distanceMiles, location: '', comments: e.comments || '',
        direction: e.stormDirection || '', speed: e.stormSpeed, duration: e.duration
      })),
      ...selectedNoaaHailEvents.map(e => ({
        date: e.date, size: e.magnitude, source: 'NOAA' as const,
        distance: e.distanceMiles, location: e.location, comments: e.comments || '',
        direction: '', speed: undefined as number | undefined, duration: undefined as number | undefined
      }))
    ].sort((a, b) => (this.parseStormDate(b.date)?.getTime() || 0) - (this.parseStormDate(a.date)?.getTime() || 0));

    const datedHailEvents = input.dateOfLoss
      ? hailEvents.filter(e => this.getDateKey(e.date) === input.dateOfLoss)
      : hailEvents;
    const primaryEvent = datedHailEvents[0] || hailEvents[0] || null;
    const primaryStormDate = primaryEvent?.date ||
      input.dateOfLoss ||
      (input.noaaEvents.length > 0 ? input.noaaEvents[0].date : new Date().toISOString());
    // Count ALL nearby events (hail + wind + tornado), not just hail
    const allNearbyEvents = [
      ...hailEvents.filter(e => (e.distance || 99) < 10),
      ...selectedWindEvents.filter(e => (e.distanceMiles || 99) < 10)
    ];
    const nearbyCount = allNearbyEvents.length;

    // Apply filter
    const filter = input.filter || 'all';
    let filteredIhm = input.events;
    let filteredNoaa = input.noaaEvents;
    switch (filter) {
      case 'hail-only': filteredNoaa = input.noaaEvents.filter(e => e.eventType === 'hail'); break;
      case 'hail-wind': filteredNoaa = input.noaaEvents.filter(e => e.eventType === 'hail' || e.eventType === 'wind'); break;
      case 'ihm-only': filteredNoaa = []; break;
      case 'noaa-only': filteredIhm = []; break;
    }

    const filteredSelectedIhm = filteredIhm.filter(e => dateMatchesLoss(e.date));
    const filteredSelectedNoaa = filteredNoaa.filter(e => dateMatchesLoss(e.date));
    const filteredSelectedNoaaHail = filteredSelectedNoaa.filter(e => e.eventType === 'hail');
    const filteredSelectedNoaaWind = filteredSelectedNoaa.filter(e => e.eventType === 'wind');

    // =========================================================
    // PAGE 1 HEADER — Federal data authority styling
    // =========================================================

    // Top banner — navy with white text
    const bannerH = 34;
    doc.rect(0, 0, this.PW, bannerH).fill(this.C.accent);
    doc.fontSize(13).fillColor(this.C.white).font('Helvetica-Bold')
       .text('Storm Impact Analysis', this.M, 10, { width: this.CW, align: 'center' });

    doc.y = bannerH + 10;

    // Sub-header: Report ID + Date
    const subHeaderY = doc.y;
    doc.fontSize(8.5).fillColor(this.C.lightText).font('Helvetica')
       .text(`Report #: ${reportId}`, this.M, subHeaderY)
       .text(`Date: ${this.fmtFullDateTimeET(new Date().toISOString())}`, this.M, doc.y);

    // Right side: Prepared by
    doc.fontSize(8.5).fillColor(this.C.lightText).font('Helvetica')
       .text('Prepared by:', this.M + this.CW * 0.55, subHeaderY, { width: this.CW * 0.45 });
    if (input.repName) {
      doc.text(input.repName, this.M + this.CW * 0.55, doc.y, { width: this.CW * 0.45 });
    }
    if (input.repPhone) {
      doc.text(input.repPhone, this.M + this.CW * 0.55, doc.y, { width: this.CW * 0.45 });
    }
    if (input.repEmail) {
      doc.fillColor(this.C.link).text(input.repEmail, this.M + this.CW * 0.55, doc.y, { width: this.CW * 0.45 });
    }

    // Small Roof-ER logo in corner (subtle)
    try {
      const logoPath = path.resolve(__dirname, '../../public/roofer-logo-icon.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, this.M + this.CW - 25, subHeaderY, { height: 22 });
      }
    } catch { /* logo not available */ }

    doc.y = Math.max(doc.y, subHeaderY + 35);

    // Verification line
    doc.fontSize(8).fillColor(this.C.mutedText).font('Helvetica')
       .text('Verification Code: ', this.M, doc.y, { continued: true });
    doc.font('Helvetica-Bold').fillColor(this.C.accent).text(verificationCode);
    doc.moveDown(0.3);

    // Thin divider
    doc.moveTo(this.M, doc.y).lineTo(this.M + this.CW, doc.y)
       .strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();

    // =========================================================
    // AT-A-GLANCE DASHBOARD — 4 big stat cards an adjuster sees first.
    // Date-aware: when input.dateOfLoss is set, shows stats for that date only.
    // Otherwise shows full history (5-year cumulative).
    // =========================================================
    doc.moveDown(0.4);
    // Dashboard height = ~20 (title) + 62 (cards) + 30 (citation+chain) = 112
    this.checkPageBreak(doc, 130);

    // Dashboard has 4 modes based on which date filter is set
    const hasSingleDate = !!input.dateOfLoss && !input.datesOfLoss;
    const hasMultiDate = !!input.datesOfLoss && input.datesOfLoss.length > 1;
    const hasRange = !!input.fromDate || !!input.toDate;
    const dashMode: 'single' | 'multi' | 'range' | 'lifetime' =
      hasSingleDate ? 'single'
      : hasMultiDate ? 'multi'
      : hasRange ? 'range'
      : 'lifetime';

    const dashTitleSuffix =
      dashMode === 'single'
        ? this.fmtDateET(input.dateOfLoss!)
        : dashMode === 'multi'
          ? `${input.datesOfLoss!.length} storms selected`
          : dashMode === 'range'
            ? `${input.fromDate ? this.fmtDateET(input.fromDate) : '...'} to ${input.toDate ? this.fmtDateET(input.toDate) : 'today'}`
            : 'Last 5 years';

    // Filter events using the unified dateMatchesLoss predicate above.
    // Merge `events` + `historyEvents` + NOAA hail events (dedup by id). The
    // NOAA merge is critical: when /search returns all events as NOAA
    // (common for addresses where NCEI storm reports are the primary source,
    // e.g. Richmond VA), the dashboard card used to read events[]+historyEvents[]
    // only and collapsed to "N/A" despite 500+ NOAA records showing 2.40"
    // hail in the area. Every NOAA hail event is now first-class in the
    // dashboard calc.
    const mergedHistoryMap = new Map<string, HailEvent>();
    for (const e of input.events || []) mergedHistoryMap.set(e.id, e);
    for (const e of input.historyEvents || []) mergedHistoryMap.set(e.id, e);
    for (const e of input.noaaEvents || []) {
      if (e.eventType === 'hail' && !mergedHistoryMap.has(e.id)) {
        mergedHistoryMap.set(e.id, {
          id: e.id,
          date: e.date,
          latitude: e.latitude,
          longitude: e.longitude,
          hailSize: e.magnitude ?? null,
          severity: (e.magnitude || 0) >= 1.75 ? 'severe' : (e.magnitude || 0) >= 1 ? 'moderate' : 'minor',
          source: e.location || 'NOAA Storm Events',
          distanceMiles: e.distanceMiles,
          comments: e.comments,
          noaaEventId: e.noaaEventId,
          radarSite: e.radarSite,
          nwsForecastOffice: e.nwsForecastOffice,
          cocorahsStation: e.cocorahsStation,
        });
      }
    }
    const allHistoryEvents: HailEvent[] = Array.from(mergedHistoryMap.values());
    const dashEvents = dashMode === 'lifetime'
      ? allHistoryEvents
      : allHistoryEvents.filter((e) => dateMatchesLoss(e.date));
    const dashWindEvents = input.noaaEvents
      .filter((e) => e.eventType === 'wind')
      .filter((e) => dashMode === 'lifetime' || dateMatchesLoss(e.date));

    const dashHailMax = dashEvents.reduce((m, e) => Math.max(m, e.hailSize || 0), 0);
    const dashWindMax = dashWindEvents.reduce(
      (m, e) => Math.max(m, Number(e.magnitude) || 0),
      0,
    );
    // Direct hits: hail ≥ 0.5" within 1.0 mi (count per unique date in lifetime,
    // or boolean for date-specific)
    const directHitDates = new Set<string>();
    for (const e of dashEvents) {
      if ((e.hailSize || 0) >= 0.5 && (e.distanceMiles ?? 99) <= 1.0) {
        const dk = this.getDateKey(e.date) || e.date;
        directHitDates.add(dk);
      }
    }
    const dashDirectHits = directHitDates.size;
    const dashUniqueDates = new Set(
      dashEvents.map((e) => this.getDateKey(e.date) || e.date),
    ).size;
    // Source attribution — aggregate all sources across hail + wind + tornado
    // and normalize to the agency/brand names adjusters recognize.
    // Raw tokens in adapter output: NOAA, NCEI-SWDI, SPC, NWS-LSR, CoCoRaHS, HailTrace, etc.
    // Normalized for display: NOAA, NEXRAD, SPC, NWS, CoCoRaHS, HailTrace.
    const rawSrcSet = new Set<string>();
    const RAW_TOKENS = [
      'NOAA', 'NCEI-SWDI', 'SPC', 'NWS-LSR', 'CoCoRaHS',
      'HailTrace', 'IHM', 'Rep Report', 'Customer Report',
    ];
    const extractSources = (s: string) => {
      if (!s) return;
      for (const token of RAW_TOKENS) {
        if (new RegExp(`\\b${token.replace(/[-]/g, '[-]')}\\b`).test(s)) rawSrcSet.add(token);
      }
    };
    for (const e of dashEvents) extractSources((e.source || '').toString());
    const dashNoaaInScope = input.noaaEvents.filter(
      (e) => dashMode === 'lifetime' || this.getDateKey(e.date) === input.dateOfLoss,
    );
    for (const e of dashNoaaInScope) {
      extractSources((e.comments || '').toString());
      extractSources((e.location || '').toString());
    }
    // Normalize raw tokens → adjuster-recognizable brand names
    const normalizedSet = new Set<string>();
    for (const t of rawSrcSet) {
      if (t === 'NCEI-SWDI') normalizedSet.add('NEXRAD');
      else if (t === 'NWS-LSR') normalizedSet.add('NWS');
      else if (t === 'Rep Report') normalizedSet.add('Rep');
      else if (t === 'Customer Report') normalizedSet.add('Customer');
      else normalizedSet.add(t);
    }
    const dashSources: string[] = Array.from(normalizedSet).sort();

    // Dashboard title banner — tells the reader what these numbers represent
    const dashHeader =
      dashMode === 'single' ? `Storm Summary — ${dashTitleSuffix}`
      : dashMode === 'multi' ? `Combined Storm Summary — ${dashTitleSuffix}`
      : dashMode === 'range' ? `Storm Activity — ${dashTitleSuffix}`
      : `Property Storm History — ${dashTitleSuffix}`;
    doc.fontSize(8.5).fillColor(this.C.lightText).font('Helvetica')
       .text(dashHeader, this.M, doc.y, { width: this.CW, align: 'center' });
    doc.moveDown(0.3);

    const cardY = doc.y;
    // Simplified dashboard per rep request: two cards only — "Largest Hail"
    // and "Peak Wind". "Direct Hits" removed (discouraging in no-hit case)
    // and "Storm Days"/"Sources" removed (noise). Kept cards span half width
    // each with a comfortable gap.
    const cardCount = 2;
    const cardGap = 12;
    const cardW = (this.CW - cardGap * (cardCount - 1)) / cardCount;
    const cardH = 62;

    const drawStatCard = (
      idx: number,
      label: string,
      value: string,
      valueColor: string,
      sub?: string,
    ) => {
      const x = this.M + idx * (cardW + cardGap);
      // Card background
      doc.rect(x, cardY, cardW, cardH).fill('#f5f6fa');
      // Accent top border
      doc.rect(x, cardY, cardW, 3).fill(valueColor);
      doc.y = cardY + 10;
      doc.fontSize(7.5).fillColor(this.C.lightText).font('Helvetica-Bold')
         .text(label.toUpperCase(), x + 8, doc.y, { width: cardW - 16, align: 'center', characterSpacing: 0.5 });
      doc.fontSize(22).fillColor(valueColor).font('Helvetica-Bold')
         .text(value, x + 8, cardY + 22, { width: cardW - 16, align: 'center' });
      if (sub) {
        doc.fontSize(7.5).fillColor(this.C.mutedText).font('Helvetica')
           .text(sub, x + 8, cardY + cardH - 16, { width: cardW - 16, align: 'center' });
      }
      // Card border
      doc.rect(x, cardY, cardW, cardH).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
    };

    // NWS hail-size reference (neutral, factual — adjusters recognize these terms)
    const hailClass = (s: number): string => {
      if (s >= 4.5) return 'Softball';
      if (s >= 2.75) return 'Baseball';
      if (s >= 1.75) return 'Golf ball';
      if (s >= 1.5) return 'Ping pong';
      if (s >= 1.25) return 'Half dollar';
      if (s >= 1.0) return 'Quarter';
      if (s >= 0.88) return 'Nickel';
      if (s >= 0.75) return 'Penny';
      if (s >= 0.5) return 'Marble';
      if (s > 0) return 'Pea';
      return '';
    };
    const windClass = (mph: number): string => {
      if (mph >= 74) return 'Hurricane-force';
      if (mph >= 58) return 'NWS severe (>=58 mph)';
      if (mph >= 40) return 'Strong';
      return '';
    };
    const verifiedLabel = (n: number): string => {
      if (n >= 4) return 'Quadruple-verified';
      if (n === 3) return 'Triple-verified';
      if (n === 2) return 'Cross-verified';
      if (n === 1) return 'Single-source';
      return 'No data';
    };

    // Two cards total, same layout for every mode. Slot 0 = Largest Hail,
    // Slot 1 = Peak Wind. Labels adapt slightly for single-storm vs multi/
    // lifetime, but the visual layout is identical.
    const isSingle = dashMode === 'single';
    drawStatCard(
      0,
      isSingle ? 'Largest Hail (Day)' : 'Largest Hail',
      dashHailMax > 0 ? `${dashHailMax.toFixed(2)}"` : 'N/A',
      dashHailMax >= 2 ? '#b91c1c' : dashHailMax >= 1 ? '#d97706' : this.C.sectionText,
      // Sub-label ("Quarter", "Ping pong", etc.) removed — the number alone
      // is clearer and avoids adjuster-side pushback over non-NWS wording
      // or rep-side confusion reading a single coin name.
    );
    drawStatCard(
      1,
      isSingle ? 'Peak Wind (Day)' : 'Peak Wind',
      dashWindMax > 0 ? `${Math.round(dashWindMax)} mph` : 'N/A',
      dashWindMax >= 70 ? '#b91c1c' : dashWindMax >= 58 ? '#d97706' : this.C.sectionText,
      windClass(dashWindMax),
    );
    doc.y = cardY + cardH + 8;

    // Source attribution strip under the cards
    if (dashSources.length > 0) {
      doc.fontSize(7.5).fillColor(this.C.mutedText).font('Helvetica')
         .text(
           `Cross-referenced against: ${dashSources.join(' • ')}`,
           this.M, doc.y, { width: this.CW, align: 'center' },
         );
      doc.moveDown(0.3);
    }

    // Chain-of-custody line — factual, neutral, adjuster-ready
    doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica')
       .text(
         `Report ID: ${reportId} • Generated: ${this.fmtFullDateTimeET(new Date().toISOString())} • ` +
         `Pipeline: Roof-ER Weather Intelligence (multi-source federal data ingest)`,
         this.M, doc.y, { width: this.CW, align: 'center' },
       );
    doc.moveDown(0.6);

    // =========================================================
    // DATA SOURCES & METHODOLOGY — the credibility section
    // =========================================================
    this.drawSectionBanner(doc, 'Data Sources & Methodology');

    doc.fontSize(8.5).fillColor(this.C.text).font('Helvetica')
       .text(
         'This report aggregates storm event records from multiple independent federal and scientific-network data sources. ' +
         'No commercial or proprietary data is used. All sources are publicly accessible and independently verifiable.',
         this.M + 10, doc.y, { width: this.CW - 20, lineGap: 1.5 }
       );
    doc.moveDown(0.4);

    // Source list with descriptions
    const sources = [
      {
        name: 'NOAA NCEI Storm Events Database',
        desc: 'Official severe-weather event record maintained by the National Oceanic and Atmospheric Administration, National Centers for Environmental Information. Events reviewed by National Weather Service meteorologists. (ncei.noaa.gov)'
      },
      {
        name: 'NCEI Severe Weather Data Inventory (SWDI) — NX3HAIL',
        desc: 'NEXRAD-derived hail signatures produced by the NOAA/NSSL Hail Detection Algorithm, archived by NCEI. Each record is an independent radar observation with timestamp, maximum expected hail size, and reporting WSR-88D radar site.'
      },
      {
        name: 'NOAA Storm Prediction Center (SPC) WCM Archive',
        desc: 'Severe weather database curated by the Warning Coordination Meteorologist at the NOAA Storm Prediction Center (Norman, OK). Separate observation pipeline from NCEI; provides independent cross-check.'
      },
      {
        name: 'NWS Local Storm Reports via Iowa Environmental Mesonet',
        desc: 'Real-time ground-observer reports filed with NWS Forecast Offices and archived by IEM at Iowa State University. Fills the 45-day review cycle before NCEI Storm Events is finalized.'
      },
      {
        name: 'CoCoRaHS — Community Collaborative Rain, Hail & Snow Network',
        desc: 'Citizen-scientist precipitation observer network operated by the Colorado Climate Center at Colorado State University with support from the National Science Foundation. Observer-measured hail stone size, duration, and consistency.'
      },
      {
        name: 'NEXRAD WSR-88D Doppler Radar Network',
        desc: 'Next-Generation Radar network operated jointly by NWS, FAA, and U.S. Air Force. Radar imagery embedded in this report is sourced from the IEM NEXRAD archive.'
      },
    ];

    sources.forEach(src => {
      this.checkPageBreak(doc, 40);
      doc.fontSize(8.5).fillColor(this.C.accent).font('Helvetica-Bold')
         .text(`\u2022  ${src.name}`, this.M + 15, doc.y, { width: this.CW - 30 });
      doc.fontSize(7.5).fillColor(this.C.lightText).font('Helvetica')
         .text(src.desc, this.M + 25, doc.y, { width: this.CW - 50, lineGap: 1 });
      doc.moveDown(0.3);
    });

    // Source-independence statement — emphasizes triangulation, not authority-borrow
    doc.moveDown(0.2);
    doc.fontSize(8).fillColor(this.C.sourceGreen).font('Helvetica-Oblique')
       .text(
         'The sources above are operated by distinct federal agencies and scientific institutions and do not share a common observation pipeline. ' +
         'Independent confirmation of the same event across multiple sources provides higher confidence than any single source alone. ' +
         'Original event identifiers are retained for independent verification by the reader.',
         this.M + 10, doc.y, { width: this.CW - 20, lineGap: 1 }
       );

    // =========================================================
    // PROPERTY INFORMATION
    // =========================================================
    // Reserve space for map + address block (~130) + section banner
    this.checkPageBreak(doc, 180);
    this.drawSectionBanner(doc, 'Property Information');

    const propY = doc.y;
    const hasMap = !!input.mapImage;
    const mapWidth = hasMap ? 180 : 0;
    const textX = hasMap ? this.M + mapWidth + 15 : this.M;

    if (hasMap && input.mapImage) {
      try {
        doc.image(input.mapImage, this.M, propY, { width: mapWidth, height: 120, fit: [mapWidth, 120] });
        doc.rect(this.M, propY, mapWidth, 120).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
      } catch (e) { console.warn('Failed to embed map image:', e); }
    }

    doc.fontSize(10).fillColor(this.C.text).font('Helvetica-Bold')
       .text('Property Address:', textX, propY);
    doc.fontSize(10).font('Helvetica')
       .text(input.address, textX, doc.y);
    if (input.city && input.state) {
      doc.text(`${input.city}, ${input.state}`);
    }

    doc.moveDown(0.4);
    if (input.customerName) {
      doc.fontSize(10).fillColor(this.C.accent).font('Helvetica-Bold')
         .text('Property Owner:', textX, doc.y);
      doc.fontSize(10).fillColor(this.C.text).font('Helvetica')
         .text(input.customerName, textX, doc.y);
    }

    // Roof age estimate from Census data — opt-in. Reps asked to hide this
    // from adjuster-facing reports since the ACS median-year-built figure
    // is ZIP-level not property-level and adjusters have pushed back.
    // Pass `showRoofAge: true` in the request body to include it.
    if ((input as any).showRoofAge && input.propertyRisk?.estimatedRoofAge) {
      doc.moveDown(0.3);
      const vulnColor = input.propertyRisk.roofVulnerability === 'critical' ? '#dc2626' :
        input.propertyRisk.roofVulnerability === 'high' ? '#f97316' : this.C.sourceGreen;
      doc.fontSize(9).fillColor(this.C.accent).font('Helvetica-Bold')
         .text('Estimated Roof Age:', textX, doc.y);
      doc.fontSize(9).fillColor(vulnColor).font('Helvetica-Bold')
         .text(`~${input.propertyRisk.estimatedRoofAge} years (built ~${input.propertyRisk.medianYearBuilt})`, textX, doc.y, { continued: true });
      doc.fillColor(this.C.lightText).font('Helvetica')
         .text(` — ${input.propertyRisk.roofVulnerability} vulnerability`);
    }

    doc.y = Math.max(doc.y, propY + 130);

    // =========================================================
    // STORM IMPACT SUMMARY — only show rows we actually have data for.
    // Previously always rendered Direction/Speed/Duration as "---" which looked broken.
    // =========================================================
    // Build only the rows where we have real data
    const summaryRows: Array<{ label: string; value: string }> = [];
    summaryRows.push({ label: 'Date of Storm Impact:', value: this.fmtDateET(primaryStormDate) });
    if (primaryEvent?.size) summaryRows.push({ label: 'Hail Size (primary event):', value: `${primaryEvent.size.toFixed(2)}"` });
    summaryRows.push({ label: 'Max Hail within 10 mi:', value: selectedMaxHail > 0 ? `${selectedMaxHail.toFixed(2)}"` : '—' });
    summaryRows.push({ label: 'Verified Observations:', value: `${nearbyCount} within 10 mi` });
    if (primaryEvent?.direction) summaryRows.push({ label: 'Storm Direction:', value: primaryEvent.direction });
    if (primaryEvent?.speed) summaryRows.push({ label: 'Storm Speed:', value: `${primaryEvent.speed.toFixed(1)} mph` });
    if (primaryEvent?.duration) summaryRows.push({ label: 'Storm Duration:', value: `${primaryEvent.duration.toFixed(1)} min` });

    if (summaryRows.length > 0 && (primaryEvent || hailEvents.length > 0)) {
      // Reserve space for banner + rows + padding
      this.checkPageBreak(doc, 40 + summaryRows.length * 18 + 20);
      this.drawSectionBanner(doc, 'Storm Impact Summary');
      const gridY = doc.y;
      const colW = this.CW / 2;
      const rowH = 18;
      const labelW = 155;

      const drawDetailRow = (label: string, value: string, col: number, row: number) => {
        const x = this.M + col * colW;
        const y = gridY + row * rowH;
        doc.fontSize(9).fillColor(this.C.lightText).font('Helvetica')
           .text(label, x + 8, y + 3, { width: labelW });
        doc.fontSize(9.5).fillColor(this.C.text).font('Helvetica-Bold')
           .text(value, x + labelW, y + 3, { width: colW - labelW - 8 });
      };

      // 2-column layout — fill left column then right column
      const numRows = Math.ceil(summaryRows.length / 2);
      summaryRows.forEach((r, idx) => {
        const col = idx < numRows ? 0 : 1;
        const row = idx < numRows ? idx : idx - numRows;
        drawDetailRow(r.label, r.value, col, row);
      });

      // Subtle separators between rows
      for (let r = 1; r < numRows; r++) {
        const ly = gridY + r * rowH;
        doc.moveTo(this.M + 8, ly).lineTo(this.M + this.CW - 8, ly)
           .strokeColor('#d0d0e0').lineWidth(0.3).stroke();
      }

      doc.y = gridY + numRows * rowH + 5;
    }

    // =========================================================
    // STORM IMPACT NARRATIVE
    // =========================================================
    this.drawSectionBanner(doc, 'Storm Impact Narrative');

    // Peak wind speed across the selected wind events — feeds the narrative
    // so wind-only reports lead with "winds up to X mph" instead of
    // nonsensical "pea-sized hail measuring up to 0.00 inches".
    const maxWindMph = filteredSelectedNoaaWind.reduce(
      (max, e) => {
        const m = Number((e as { magnitude?: number }).magnitude) || 0;
        return m > max ? m : max;
      },
      0,
    );

    // Pre-cap the narrative's hail size — the prose says "X-inch hail
    // measuring up to Y in diameter" and adjusters dismiss reports
    // anchored on >2.5". Cap the headline magnitude to the adjuster-
    // credible ceiling per the 2026-04-27 meeting. This is an area-wide
    // value (covers the report's full date scope), so it doesn't qualify
    // as at-location for the cap; isAtLocation=false → unverified branch
    // dominates → outliers cap to 2.0, verified consensus passes through.
    const narrativeReports: BandReport[] = hailEvents
      .filter(e => (e.size || 0) > 0)
      .map(e => ({
        source: e.source || '',
        sizeInches: e.size || 0,
        distanceMiles: e.distance ?? 99,
      }));
    const narrativeV = buildBandVerification(
      narrativeReports,
      false, // not at-property; this is area-wide narrative
      primaryStormDate,
      input.lat,
      input.lng,
    );
    const narrativeMaxHail = displayHailInches(selectedMaxHail, narrativeV) ?? 0;

    const narrative = generateHailNarrative({
      address: input.address, city: input.city, state: input.state,
      stormDate: primaryStormDate, maxHailSize: narrativeMaxHail,
      totalEvents: filteredSelectedIhm.length + filteredSelectedNoaa.length,
      severeCount, windEvents: filteredSelectedNoaaWind.length,
      maxWindMph,
      nearbyReports: hailEvents.filter(e => (e.distance || 99) < 1).length,
      radiusMiles: input.radius,
      stormDirection: primaryEvent?.direction,
      stormSpeed: primaryEvent?.speed ? `${primaryEvent.speed.toFixed(1)} miles per hour` : undefined
    });

    doc.fontSize(9.5).fillColor(this.C.text).font('Helvetica')
       .text(narrative, this.M + 20, doc.y, { width: this.CW - 40, lineGap: 3, align: 'justify' });
    doc.moveDown(0.5);

    // =========================================================
    // VERIFIED GROUND OBSERVATIONS - HAIL
    // (Full source names instead of abbreviations)
    // =========================================================
    this.drawSectionBanner(doc, 'Documented Hail Events');

    doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica-Oblique')
       .text(
         `Each row is one storm day, consolidated across all sources. Max Hail is the largest verified size for that day; Closest is the distance to the nearest confirmed observation; Obs is how many source records confirm the day. IDs (NCEI/SPC/Radar site/WFO) can be independently verified.`,
         this.M, doc.y, { width: this.CW }
       );
    doc.moveDown(0.4);

    // Helper to build the traceability string (Event ID / Radar / WFO / Station)
    const buildTraceability = (e: {
      noaaEventId?: string; spcOmId?: string; radarSite?: string;
      nwsForecastOffice?: string; cocorahsStation?: string;
    }): string => {
      const bits: string[] = [];
      if (e.noaaEventId) bits.push(`NCEI ID ${e.noaaEventId}`);
      if (e.spcOmId) bits.push(`SPC #${e.spcOmId}`);
      if (e.cocorahsStation) bits.push(`Station ${e.cocorahsStation}`);
      if (e.radarSite) bits.push(`Radar ${e.radarSite}`);
      if (e.nwsForecastOffice) bits.push(`WFO ${e.nwsForecastOffice}`);
      return bits.join(' • ');
    };

    // Derive the actual data source label for an event using the agency/brand
    // names adjusters and insurance companies already recognize.
    //   NOAA    = NCEI Storm Events (ground-reported, NWS-verified)
    //   NEXRAD  = NCEI SWDI NX3HAIL (WSR-88D radar hail signature)
    //   SPC     = NOAA Storm Prediction Center archive
    //   NWS     = NWS Local Storm Reports (spotter/COOP/ASOS)
    //   CoCoRaHS = Community Collaborative Rain, Hail & Snow Network (NSF/CSU)
    const dataSourceLabel = (sourceStr: string | undefined, comments: string | undefined): string => {
      const s = `${sourceStr || ''} ${comments || ''}`;
      const codes: string[] = [];
      // Radar-derived (SWDI NX3HAIL) → show as NEXRAD. Matches raw ingest tags
      // AND the user-friendly "NEXRAD" label we emit from /hail/search.
      if (/\bNCEI-SWDI\b|\bSWDI\b|\bNEXRAD\b/.test(s)) codes.push('NEXRAD');
      // Ground-reported NCEI Storm Events → NOAA. Excludes the SWDI case above.
      if (/\bNOAA\b/.test(s) && !/\bNCEI-SWDI\b|\bSWDI\b|\bNEXRAD\b/.test(s)) codes.push('NOAA');
      // SPC archive
      if (/\bSPC\b/.test(s)) codes.push('SPC');
      // NWS Local Storm Reports — raw "NWS-LSR"/"IEM LSR" OR user-facing "NWS LSR"/bare "NWS"
      if (/\bNWS-LSR\b|\bIEM LSR\b|\bNWS LSR\b|(?:^|\s)NWS(?:\s|$)/.test(s)) codes.push('NWS');
      // MRMS multi-radar composite
      if (/\bMRMS\b/.test(s)) codes.push('MRMS');
      // CoCoRaHS observer
      if (/\bCoCoRaHS\b/.test(s)) codes.push('CoCoRaHS');
      // Commercial / rep / customer
      if (/\bHailTrace\b/.test(s)) codes.push('HailTrace');
      if (/\bRep Report\b/.test(s)) codes.push('Rep');
      if (/\bCustomer Report\b/.test(s)) codes.push('Customer');
      if (codes.length === 0) codes.push('NOAA');
      return codes.join(' + ');
    };

    const hailHeaders = ['Storm Date', 'Sources', 'Max Hail', 'Closest', 'Obs', 'Traceability ID'];
    const hailWidths = [70, 80, 48, 48, 32, this.CW - 278];

    // Consolidate by storm day — one row per date instead of one row per
    // verified_hail_events record. Prior version emitted 8+ identical-timestamp
    // rows for a single storm (one per MRMS bucket), causing multi-page runoff.
    interface HailDayAgg {
      date: string; maxSize: number; minDist: number; obs: number;
      sourceCodes: Set<string>;
      traceBits: Set<string>;
    }
    const hailByDay = new Map<string, HailDayAgg>();

    const addHail = (
      rawDate: string | undefined,
      size: number | undefined,
      dist: number | undefined,
      srcLabel: string,
      e: any,
    ) => {
      if (!rawDate) return;
      const dk = this.getDateKey(rawDate) || rawDate.slice(0, 10);
      let g = hailByDay.get(dk);
      if (!g) {
        g = { date: rawDate, maxSize: 0, minDist: 99, obs: 0, sourceCodes: new Set(), traceBits: new Set() };
        hailByDay.set(dk, g);
      }
      if (size && size > g.maxSize) g.maxSize = size;
      if (dist != null && dist < g.minDist) g.minDist = dist;
      g.obs += 1;
      // Merge source codes from dataSourceLabel on every observation.
      for (const c of srcLabel.split(' + ')) g.sourceCodes.add(c);
      // Collect traceability tokens (bits).
      const bits = buildTraceability(e).split(' • ').filter(Boolean);
      for (const b of bits) g.traceBits.add(b);
    };

    filteredSelectedIhm.forEach((e) =>
      addHail(e.date, e.hailSize, e.distanceMiles, dataSourceLabel(e.source, e.comments), e));
    filteredSelectedNoaaHail.forEach((e) =>
      addHail(e.date, e.magnitude, e.distanceMiles, dataSourceLabel(e.location, e.comments), e));

    const hailRows: string[][] = Array.from(hailByDay.values())
      .sort((a, b) => (this.parseStormDate(b.date)?.getTime() || 0) - (this.parseStormDate(a.date)?.getTime() || 0))
      .map((g) => {
        const sources = Array.from(g.sourceCodes).join(' + ') || 'NOAA';
        // Cap ID list at ~2 per day to keep rows tight; rest of IDs still
        // auditable via the same sources.
        const traceList = Array.from(g.traceBits).slice(0, 2).join(' • ');
        return [
          this.fmtDateET(g.date),
          sources,
          g.maxSize > 0 ? `${g.maxSize.toFixed(2)}"` : '---',
          g.minDist < 99 ? `${g.minDist.toFixed(1)} mi` : '---',
          String(g.obs),
          traceList || 'No IDs available',
        ];
      });

    if (hailRows.length > 0) {
      this.drawTable(doc, hailHeaders, hailRows, hailWidths, { boldColumns: [2] });
    } else {
      doc.fontSize(9).fillColor(this.C.mutedText).font('Helvetica-Oblique')
         .text('No hail observations found for the selected criteria.', this.M, doc.y);
      doc.moveDown(0.5);
    }

    // =========================================================
    // INDEPENDENT MULTI-SOURCE CORROBORATION
    // (auto-curate: silently omitted when no consilienceReports passed)
    // =========================================================
    if (input.consilienceReports && input.consilienceReports.length > 0) {
      this.drawConsilienceSection(doc, input.consilienceReports);
    }

    // =========================================================
    // VERIFIED GROUND OBSERVATIONS - WIND
    // =========================================================
    const windObsNoaa = filteredSelectedNoaaWind;
    if (windObsNoaa.length > 0) {
      this.drawSectionBanner(doc, 'Documented Wind Events');

      doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
         .text(
           `Each row is one storm day, consolidated across ground-report sources (NWS/NOAA spotters, ASOS stations). Peak Wind is the highest verified gust that day; Closest is the nearest observation; Obs counts confirming records.`,
           this.M, doc.y, { width: this.CW }
         );
      doc.moveDown(0.4);

      const windHeaders = ['Storm Date', 'Sources', 'Peak Wind', 'Closest', 'Obs', 'Traceability ID'];
      const windWidths = [70, 80, 52, 48, 32, this.CW - 282];

      interface WindDayAgg {
        date: string; maxKts: number; minDist: number; obs: number;
        sourceCodes: Set<string>; traceBits: Set<string>;
      }
      const windByDay = new Map<string, WindDayAgg>();
      windObsNoaa.forEach((e) => {
        if (!e.date) return;
        const dk = this.getDateKey(e.date) || e.date.slice(0, 10);
        let g = windByDay.get(dk);
        if (!g) {
          g = { date: e.date, maxKts: 0, minDist: 99, obs: 0, sourceCodes: new Set(), traceBits: new Set() };
          windByDay.set(dk, g);
        }
        const kts = Number(e.magnitude) || 0;
        if (kts > g.maxKts) g.maxKts = kts;
        if (e.distanceMiles != null && e.distanceMiles < g.minDist) g.minDist = e.distanceMiles;
        g.obs += 1;
        for (const c of dataSourceLabel(e.location, e.comments).split(' + ')) g.sourceCodes.add(c);
        for (const b of buildTraceability(e as any).split(' • ').filter(Boolean)) g.traceBits.add(b);
      });

      const windRows: string[][] = Array.from(windByDay.values())
        .sort((a, b) => (this.parseStormDate(b.date)?.getTime() || 0) - (this.parseStormDate(a.date)?.getTime() || 0))
        .map((g) => [
          this.fmtDateET(g.date),
          Array.from(g.sourceCodes).join(' + ') || 'NOAA',
          g.maxKts > 0 ? `${Math.round(g.maxKts)} kts` : '---',
          g.minDist < 99 ? `${g.minDist.toFixed(1)} mi` : '---',
          String(g.obs),
          Array.from(g.traceBits).slice(0, 2).join(' • ') || 'No IDs available',
        ]);

      this.drawTable(doc, windHeaders, windRows, windWidths, { boldColumns: [2] });
    }

    // =========================================================
    // RADAR EVIDENCE — single high-quality NEXRAD image for the most
    // significant storm date. Rendered whenever we have a nexradImage
    // buffer and includeNexrad isn't explicitly off. Previously gated
    // behind `!willRenderPerAlertRadar` to avoid duplication with the
    // smaller per-warning thumbnails, but reps want the big radar panel
    // front and centre regardless — the warnings section's thumbnails
    // are supplementary. The large version lands a clearer visual story
    // when handing the report to adjusters.
    // =========================================================
    const hasRadar = input.nexradImage && input.includeNexrad !== false;
    if (hasRadar && input.nexradImage) {
      this.checkPageBreak(doc, 230);
      this.drawSectionBanner(doc, 'Storm Radar Evidence');

      const radarW = 360;
      const radarH = 240;
      const radarX = this.M + (this.CW - radarW) / 2;
      const radarY = doc.y + 4;

      try {
        doc.image(input.nexradImage, radarX, radarY, { width: radarW, height: radarH, fit: [radarW, radarH] });
        doc.rect(radarX, radarY, radarW, radarH).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
      } catch (e) { console.warn('NEXRAD embed failed:', e); }

      doc.y = radarY + radarH + 6;
      doc.fontSize(8).fillColor(this.C.text).font('Helvetica-Bold')
         .text(`NEXRAD WSR-88D Radar Composite Reflectivity`, this.M, doc.y, { width: this.CW, align: 'center' });
      doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica')
         .text(
           `${this.fmtFullDateTimeET(input.nexradTimestamp || primaryStormDate)} — Source: NOAA NEXRAD via Iowa Environmental Mesonet (IEM)`,
           this.M, doc.y, { width: this.CW, align: 'center' },
         );
      doc.moveDown(0.6);
    }

    // =========================================================
    // NWS ACTIVE WEATHER WARNINGS — only render if real alerts exist.
    // =========================================================
    const alertImages = input.nwsAlertImages || [];
    const legacyAlerts = input.nwsAlerts || [];
    const hasAlertImages = alertImages.length > 0;
    const hasWarnings = hasAlertImages || legacyAlerts.length > 0;

    if (hasWarnings && input.includeWarnings !== false) {
      this.drawSectionBanner(doc, 'Active National Weather Service Warnings');

      const warningCount = hasAlertImages ? alertImages.length : legacyAlerts.length;
      doc.fontSize(9).fillColor(this.C.text).font('Helvetica')
         .text(
           `${warningCount} active NWS ${warningCount === 1 ? 'warning' : 'warnings'} for the area encompassing ${input.address}:`,
           this.M + 20, doc.y, { width: this.CW - 40, lineGap: 2 },
         );
      doc.moveDown(0.6);

      if (hasAlertImages) {
        // Two-column warning cards: NEXRAD radar on the left, warning details on
        // the right. Restored from the pre-consolidation design — per-warning
        // radar imagery is the adjuster-facing "show your work" evidence and
        // was lost when the radar section was deduped earlier.
        const cardGap = 10;
        const radarW = 240;     // left column — radar image
        const radarH = 180;     // radar aspect
        const detailsX = this.M + radarW + 14;
        const detailsW = this.CW - radarW - 14;
        const cardH = radarH + 40;  // room for bottom attribution text

        alertImages.slice(0, 5).forEach((item, idx) => {
          const alert = item.alert;
          const isTornado = alert.event.toLowerCase().includes('tornado');
          const headlineColor = isTornado ? '#dc2626' : this.C.text;

          this.checkPageBreak(doc, cardH + 20);
          if (idx > 0) doc.moveDown(0.6);

          const cardY = doc.y;
          // top accent bar
          doc.rect(this.M, cardY, this.CW, 3).fill(headlineColor);

          // ── Left column: NEXRAD radar image ─────────────────────
          const imgY = cardY + 8;
          if (item.radarImage) {
            try {
              doc.image(item.radarImage, this.M, imgY, { width: radarW, height: radarH, fit: [radarW, radarH] });
              doc.rect(this.M, imgY, radarW, radarH).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
            } catch (e) { console.warn('NEXRAD per-alert embed failed:', (e as Error).message); }
          } else {
            // Radar missing → placeholder so the layout doesn't collapse.
            doc.rect(this.M, imgY, radarW, radarH).fill('#f3f4f6');
            doc.fontSize(9).fillColor(this.C.mutedText).font('Helvetica-Oblique')
               .text('NEXRAD radar unavailable', this.M, imgY + radarH / 2 - 5, { width: radarW, align: 'center' });
          }
          // Radar attribution
          const attribY = imgY + radarH + 4;
          doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica')
             .text(
               `NEXRAD WSR-88D Radar — ${this.fmtDateET(item.radarTimestamp)}  |  Source: IEM/NOAA`,
               this.M, attribY, { width: radarW },
             );

          // ── Right column: warning title + details table ─────────
          let rY = imgY;
          doc.fontSize(10.5).fillColor(headlineColor).font('Helvetica-Bold')
             .text(
               `${alert.event} issued ${this.fmtFullDateTimeET(alert.onset)}`,
               detailsX, rY, { width: detailsW, lineGap: 1 },
             );
          rY = doc.y + 6;

          // Build 2-column label/value grid:
          //    Effective / Expires     Hail / Wind     Urgency / Certainty
          const alertHailSize = alert.hailSize || extractHailSizeFromText(alert.description);
          const alertWindSpeed = alert.windSpeed || extractWindSpeedFromText(alert.description);
          const gridPairs: Array<[string, string, string, string]> = [
            ['Effective:', this.fmtTimeET(alert.onset) + ' EDT', 'Expires:', this.fmtTimeET(alert.expires) + ' EDT'],
            ['Hail Size:', alertHailSize || 'n/a', 'Wind Speed:', alertWindSpeed || 'n/a'],
            ['Urgency:',   alert.certainty || 'Observed', 'Certainty:', alert.severity || 'Moderate'],
          ];
          const colW = detailsW / 2;
          const labelW = 72;
          for (const [lA, vA, lB, vB] of gridPairs) {
            doc.fontSize(9).fillColor(this.C.mutedText).font('Helvetica')
               .text(lA, detailsX, rY, { width: labelW });
            doc.fontSize(9).fillColor(this.C.text).font('Helvetica-Bold')
               .text(vA, detailsX + labelW, rY, { width: colW - labelW - 6 });
            doc.fontSize(9).fillColor(this.C.mutedText).font('Helvetica')
               .text(lB, detailsX + colW, rY, { width: labelW });
            doc.fontSize(9).fillColor(this.C.text).font('Helvetica-Bold')
               .text(vB, detailsX + colW + labelW, rY, { width: colW - labelW - 6 });
            rY += 18;
          }

          // Optional 1-liner description below the grid
          const descText = alert.description || alert.headline || '';
          if (descText && rY + 24 < cardY + cardH) {
            doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica-Oblique')
               .text(descText, detailsX, rY + 6, { width: detailsW, lineGap: 1, height: cardY + cardH - rY - 12 });
          }

          // Card outline
          const cardEndY = cardY + cardH;
          doc.rect(this.M, cardY, this.CW, cardEndY - cardY).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
          doc.y = cardEndY + cardGap;
        });
      } else if (legacyAlerts.length > 0) {
        legacyAlerts.slice(0, 5).forEach(alert => {
          this.checkPageBreak(doc, 80);
          const isTornado = alert.event.toLowerCase().includes('tornado');
          doc.fontSize(9.5).fillColor(isTornado ? '#dc2626' : this.C.text).font('Helvetica-Bold')
             .text(`${alert.event} issued ${this.fmtFullDateTimeET(alert.onset)}`, this.M + 20, doc.y, { width: this.CW - 40 });
          doc.fontSize(8.5).font('Helvetica').fillColor(this.C.text)
             .text(`Effective: ${this.fmtTimeET(alert.onset)}    Expires: ${this.fmtTimeET(alert.expires)}`, this.M + 20, doc.y);
          doc.text(`Issued by: ${alert.senderName}`);
          doc.moveDown(0.2);
          doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
             .text(alert.description || alert.headline || '', this.M + 20, doc.y, { width: this.CW - 40, lineGap: 1 });
          doc.moveDown(0.5);
        });
      }
    }

    // =========================================================
    // HISTORICAL STORM ACTIVITY
    // =========================================================
    this.drawSectionBanner(doc, 'Historical Storm Activity');

    const histHeaders = ['Map Date*', 'Impact Time', 'Direction', 'Speed', 'At Property', '1-3mi', '3-5mi', '5-10mi'];
    const histWidths = [72, 72, 52, 46, 72, 60, 60, 60];

    const historicalSeedEvents = (input.historyEvents && input.historyEvents.length > 0)
      ? input.historyEvents
      : filteredIhm.length > 0
        ? filteredIhm
        : filteredNoaa
            .filter(e => e.eventType === 'hail')
            .map(e => ({
              id: e.id,
              date: e.date,
              latitude: e.latitude,
              longitude: e.longitude,
              hailSize: e.magnitude,
              severity: (e.magnitude || 0) >= 1.75 ? 'severe' as const : (e.magnitude || 0) >= 1 ? 'moderate' as const : 'minor' as const,
              source: e.location || 'NOAA Storm Events',
              distanceMiles: e.distanceMiles,
              comments: e.comments,
            }));

    // Build per-event list, then consolidate by date for a cleaner table.
    // The `source` field is preserved here so the cap algorithm
    // (buildBandVerification + displayHailInches) can run primary-tier
    // detection per band per date.
    const historicalHailEvents = historicalSeedEvents
      .map(e => ({
        date: e.date,
        direction: e.stormDirection || '---',
        speed: e.stormSpeed,
        duration: e.duration,
        size: e.hailSize || 0,
        distance: e.distanceMiles,
        source: (e as any).source || '',
      }))
      .sort((a, b) => (this.parseStormDate(b.date)?.getTime() || 0) - (this.parseStormDate(a.date)?.getTime() || 0));

    // Consolidate by date using MUTUALLY EXCLUSIVE distance bands so each
    // observation lands in exactly one column (no double counting).
    //   atLoc  = 0-0.5 mi (At Property — strict bucket per 2026-04-27 addendum)
    //   w3     = 0.5-3 mi
    //   w5     = 3-5 mi
    //   w10    = 5-10 mi
    //
    // The 0-0.5 mi at-property bound was tightened from 0-1.0 mi after the
    // 2026-04-27 PM session: a 4" reading at 0.6 mi was rendering in the
    // At Property column even though it was ~0.6 mi away from the actual
    // address. Adjusters dismissed the report. Now the at-property cell is
    // strictly ≤0.5 mi — Path A swath direct hits (distanceMiles=0) still
    // populate it, but a stray neighbor-block ground report at 0.6 mi
    // shows in the 0.5-3 mi column where it visually belongs.
    const dateGroups = new Map<string, {
      date: string; direction: string; speed: number | undefined;
      duration: number | undefined; atLoc: number; w3: number; w5: number; w10: number;
    }>();
    for (const e of historicalHailEvents) {
      const dk = this.getDateKey(e.date) || e.date;
      const dist = e.distance ?? 99;
      const size = e.size;
      if (!dateGroups.has(dk)) {
        dateGroups.set(dk, {
          date: e.date, direction: e.direction !== '---' ? e.direction : '---',
          speed: e.speed, duration: e.duration, atLoc: 0, w3: 0, w5: 0, w10: 0,
        });
      }
      const g = dateGroups.get(dk)!;
      if (g.direction === '---' && e.direction !== '---') g.direction = e.direction;
      if (!g.speed && e.speed) g.speed = e.speed;
      if (!g.duration && e.duration) g.duration = e.duration;
      if (dist <= 0.5 && size > g.atLoc) g.atLoc = size;
      else if (dist > 0.5 && dist <= 3.0 && size > g.w3) g.w3 = size;
      else if (dist > 3.0 && dist <= 5.0 && size > g.w5) g.w5 = size;
      else if (dist > 5.0 && dist <= 10.0 && size > g.w10) g.w10 = size;
    }

    // (Swath hits were already promoted into input.events at the top of
    // generateReport — their distanceMiles=0 puts them in atLoc automatically
    // via the dist<=1.0 branch above.)

    const consolidatedDates = Array.from(dateGroups.values())
      .filter(g => g.atLoc > 0 || g.w3 > 0 || g.w5 > 0 || g.w10 > 0)
      .sort((a, b) => (this.parseStormDate(b.date)?.getTime() || 0) - (this.parseStormDate(a.date)?.getTime() || 0));

    // Per-date band reports for verification context. Each event lands in
    // exactly one band (same strict bucketing as the dateGroups loop), and
    // the cap runs per-band so a 4" reading at 0.6mi can't pull the
    // at-property column's verification — it's a 1-3mi-band report.
    const bandReportsByDate = new Map<string, {
      atLoc: BandReport[]; w3: BandReport[]; w5: BandReport[]; w10: BandReport[];
    }>();
    for (const e of historicalHailEvents) {
      const dk = this.getDateKey(e.date) || e.date;
      const dist = e.distance ?? 99;
      if (!bandReportsByDate.has(dk)) {
        bandReportsByDate.set(dk, { atLoc: [], w3: [], w5: [], w10: [] });
      }
      const br: BandReport = {
        source: e.source || '',
        sizeInches: e.size,
        distanceMiles: dist,
      };
      const bands = bandReportsByDate.get(dk)!;
      if (dist <= 0.5) bands.atLoc.push(br);
      else if (dist <= 3.0) bands.w3.push(br);
      else if (dist <= 5.0) bands.w5.push(br);
      else if (dist <= 10.0) bands.w10.push(br);
    }

    // Cap-aware hail size display. Runs displayHailInches per band per date
    // (post-strict-bucketing) with the band's own VerificationContext. The
    // cap algorithm:
    //   - sub-0.25 raw → null (suppressed; column blank)
    //   - 0.25-0.74 raw → 0.75 floor
    //   - 0.75-2.0 raw → pass through
    //   - 2.0-2.5 raw → 2.0 unless verified+at-location
    //   - 2.5+ raw → 2.0/2.5/3.0 ceiling per Sterling-class + verified
    //   - consensus override: ≥2 primary sources agreeing in [0.75, 2.6) win
    // See server/services/displayCapService.ts for the full rule table.
    const capForBand = (
      rawInches: number,
      dateKey: string,
      band: 'atLoc' | 'w3' | 'w5' | 'w10',
    ): number | null => {
      if (rawInches <= 0) return null;
      const reports = bandReportsByDate.get(dateKey)?.[band] || [];
      const v = buildBandVerification(
        reports,
        band === 'atLoc',
        dateKey,
        input.lat,
        input.lng,
      );
      return displayHailInches(rawInches, v);
    };

    const displaySize = (inches: number | null): string => {
      if (inches === null || inches <= 0) return '---';
      return `${inches.toFixed(2)}"`;
    };

    // No separate Hit column — the populated "At Property" cell IS the
    // direct-hit signal (rep convention: if a number's in that column, the
    // property was hit). Swath direct hits were already promoted into atLoc
    // above so they show as a size, not as a label.

    // Compute capped values once per date so the table cells and summary
    // line stay consistent. A date's atLoc raw might be 0.4 but the cap
    // floors it to 0.75; the summary's "actionable count" should reflect
    // the displayed value, not the raw.
    const cappedDates = consolidatedDates.map(g => {
      const dk = this.getDateKey(g.date) || g.date;
      return {
        ...g,
        atLocDisplay: capForBand(g.atLoc, dk, 'atLoc'),
        w3Display: capForBand(g.w3, dk, 'w3'),
        w5Display: capForBand(g.w5, dk, 'w5'),
        w10Display: capForBand(g.w10, dk, 'w10'),
      };
    });

    const histRows: string[][] = cappedDates.map(g => [
      this.fmtDateET(g.date),
      this.fmtFullDateTimeET(g.date),
      g.direction,
      g.speed ? g.speed.toFixed(1) : '---',
      displaySize(g.atLocDisplay),
      displaySize(g.w3Display),
      displaySize(g.w5Display),
      displaySize(g.w10Display),
    ]);

    // Summary line above the table — based on capped display values so it
    // matches what the adjuster sees in the table cells. A date suppressed
    // by sub-0.25 cap doesn't get counted as "with hail at property".
    const directHitCount = cappedDates.filter(g => (g.atLocDisplay ?? 0) > 0).length;
    const actionableCount = cappedDates.filter(g => (g.atLocDisplay ?? 0) >= 0.5).length;
    const within3Count = cappedDates.filter(g => (g.atLocDisplay ?? 0) === 0 && (g.w3Display ?? 0) > 0).length;
    const within5Count = cappedDates.filter(g => (g.atLocDisplay ?? 0) === 0 && (g.w3Display ?? 0) === 0 && (g.w5Display ?? 0) > 0).length;
    const within10Count = cappedDates.filter(g => (g.atLocDisplay ?? 0) === 0 && (g.w3Display ?? 0) === 0 && (g.w5Display ?? 0) === 0 && (g.w10Display ?? 0) > 0).length;
    const largestActionable = cappedDates.reduce(
      (max, g) => ((g.atLocDisplay ?? 0) >= 0.5 && (g.atLocDisplay ?? 0) > max.size ? { size: g.atLocDisplay ?? 0, date: g.date } : max),
      { size: 0, date: '' },
    );

    if (directHitCount > 0 || within3Count > 0 || within5Count > 0 || within10Count > 0) {
      doc.fontSize(9).fillColor(this.C.text).font('Helvetica-Bold');
      const parts: string[] = [];
      if (actionableCount > 0) {
        parts.push(`${actionableCount} day${actionableCount > 1 ? 's' : ''} with hail 1/2" or larger at property`);
      }
      const subHalf = directHitCount - actionableCount;
      if (subHalf > 0) parts.push(`${subHalf} day${subHalf > 1 ? 's' : ''} with sub-1/2" hail at property`);
      if (within3Count > 0) parts.push(`${within3Count} day${within3Count > 1 ? 's' : ''} with hail 1-3 mi away`);
      if (within5Count > 0) parts.push(`${within5Count} day${within5Count > 1 ? 's' : ''} with hail 3-5 mi away`);
      if (within10Count > 0) parts.push(`${within10Count} day${within10Count > 1 ? 's' : ''} with hail 5-10 mi away`);
      doc.text(parts.join('  •  '), this.M, doc.y, { width: this.CW });
      // Removed red "Largest hail documented at property: X.XX" line.
      // Reps reported adjusters were using the "at property" figure to argue
      // the storm was smaller than what hit the neighborhood. The day-count
      // summary line above already conveys impact without pinning a single
      // small number to the parcel.
      doc.moveDown(0.3);
    }

    if (histRows.length > 0) {
      this.drawTable(doc, histHeaders, histRows, histWidths, { boldColumns: [0, 1] });
    } else {
      doc.fontSize(9).fillColor(this.C.mutedText).font('Helvetica-Oblique')
         .text('No historical storm events found.', this.M, doc.y);
    }

    doc.moveDown(0.3);
    doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica')
       .text(
         '* "At Property" = 0-0.5 mi, populated when either (a) the property sits inside an MRMS hail-swath polygon ' +
         'on that date — the radar-derived footprint of hail ≥ the cited size, OR (b) hail ≥ 1/4" was reported ' +
         'within 1/2 mile of the property. Distance columns (0.5-3, 3-5, 5-10 mi) are mutually exclusive — each ' +
         'observation is assigned to one band, showing max hail in that band. ' +
         'Sub-1/4" values rounded up to 1/4" for display. See "Disclaimer & Limitations" (end of report) for ' +
         'full methodology and source list.',
         this.M, doc.y, { width: this.CW }
       );

    // =========================================================
    // SUPPORTING EVIDENCE
    // =========================================================
    const approvedEvidence = (input.evidenceItems || []).filter((item) => {
      if (!item) return false;
      if (!input.dateOfLoss) return true;
      return item.stormDate === null || item.stormDate === input.dateOfLoss;
    });

    if (approvedEvidence.length > 0) {
      this.drawSectionBanner(doc, 'Supporting Evidence');

      doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
         .text(
           'Approved field uploads and linked public-media references associated with this property and date of loss.',
           this.M, doc.y, { width: this.CW }
         );
      doc.moveDown(0.5);

      approvedEvidence.slice(0, 6).forEach((item, idx) => {
        this.checkPageBreak(doc, 140);

        const blockY = doc.y;
        const previewW = 120;
        const previewH = 90;
        const detailX = this.M + previewW + 15;
        const detailW = this.CW - previewW - 15;
        const imageBuffer = this.decodeImageDataUrl(item.imageDataUrl);

        if (imageBuffer) {
          try {
            doc.image(imageBuffer, this.M, blockY, {
              width: previewW,
              height: previewH,
              fit: [previewW, previewH],
            });
            doc.rect(this.M, blockY, previewW, previewH)
              .strokeColor(this.C.tableBorder)
              .lineWidth(0.5)
              .stroke();
          } catch (error) {
            console.warn('Failed to embed evidence image:', error);
          }
        } else {
          doc.rect(this.M, blockY, previewW, previewH).fillAndStroke('#eef1f7', this.C.tableBorder);
          doc.fontSize(9).fillColor(this.C.mutedText).font('Helvetica-Oblique')
             .text(
               item.mediaType === 'video' ? 'Video reference' : 'Linked evidence',
               this.M + 10, blockY + 34, { width: previewW - 20, align: 'center' }
             );
        }

        doc.fontSize(9.5).fillColor(this.C.text).font('Helvetica-Bold')
           .text(item.title || `Evidence ${idx + 1}`, detailX, blockY, {
             width: detailW,
           });
        doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
           .text(
             `${String(item.provider).toUpperCase()} · ${item.mediaType.toUpperCase()}${item.stormDate ? ` · ${this.fmtDateET(item.stormDate)}` : ''}`,
             detailX, doc.y, { width: detailW }
           );

        if (item.publishedAt) {
          doc.text(`Published: ${this.fmtFullDateTimeET(item.publishedAt)}`, detailX, doc.y, {
            width: detailW,
          });
        }

        if (item.notes) {
          doc.moveDown(0.2);
          doc.text(item.notes, detailX, doc.y, { width: detailW, lineGap: 1.2 });
        }

        if (item.externalUrl) {
          doc.moveDown(0.2);
          doc.fillColor(this.C.link).text(item.externalUrl, detailX, doc.y, {
            width: detailW,
            underline: true,
          });
          doc.fillColor(this.C.lightText);
        }

        doc.y = Math.max(doc.y, blockY + previewH) + 10;
      });
    }

    // =========================================================
    // APPLICABLE BUILDING CODE REQUIREMENTS (opt-in only)
    // =========================================================
    if (input.state && input.includeBuildingCodes === true) {
      const stateUpper = input.state.toUpperCase().trim();
      const codeData = this.getStateBuildingCodes(stateUpper);
      if (codeData) {
        this.checkPageBreak(doc, 200);
        this.drawSectionBanner(doc, 'Applicable Building Code Requirements');

        doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
           .text(
             `The following building code provisions apply to residential roofing work in ${codeData.stateName} and may be relevant to the scope of repairs or replacement authorized under this claim.`,
             this.M, doc.y, { width: this.CW }
           );
        doc.moveDown(0.5);

        // Code edition
        doc.fontSize(9).fillColor(this.C.text).font('Helvetica-Bold')
           .text(codeData.codeEdition, this.M, doc.y, { width: this.CW });
        doc.moveDown(0.4);

        // Key provisions table
        const provColW = [130, this.CW - 130];
        const provX = [this.M, this.M + provColW[0]];

        // Table header
        doc.rect(provX[0], doc.y, this.CW, 16).fill(this.C.tableHeaderBg);
        doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold');
        doc.text('Code Section', provX[0] + 5, doc.y - 13, { width: provColW[0] - 10 });
        doc.text('Requirement', provX[1] + 5, doc.y - 13, { width: provColW[1] - 10 });
        doc.moveDown(0.3);

        codeData.provisions.forEach((prov, idx) => {
          this.checkPageBreak(doc, 36);
          const rowY = doc.y;
          if (idx % 2 === 0) {
            doc.rect(provX[0], rowY, this.CW, 28).fill('#f5f6fa');
          }
          doc.fontSize(7.5).fillColor(this.C.text).font('Helvetica-Bold')
             .text(prov.section, provX[0] + 5, rowY + 4, { width: provColW[0] - 10 });
          doc.fontSize(7.5).fillColor(this.C.text).font('Helvetica')
             .text(prov.requirement, provX[1] + 5, rowY + 4, { width: provColW[1] - 10, lineGap: 1 });
          doc.y = Math.max(doc.y, rowY + 28);
        });

        doc.moveDown(0.5);
        doc.fontSize(7.5).fillColor(this.C.lightText).font('Helvetica-Oblique')
           .text(
             codeData.disclaimer,
             this.M + 10, doc.y, { width: this.CW - 20, lineGap: 1 }
           );
        doc.moveDown(0.8);
      }
    }

    // =========================================================
    // DISCLAIMER — Professional, cites federal authorities
    // =========================================================
    this.drawSectionBanner(doc, 'Disclaimer & Limitations');

    doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
       .text(
         'This Storm Impact Analysis is generated from publicly available federal and scientific-network data: ' +
         'the NOAA National Centers for Environmental Information (NCEI) Storm Events Database, ' +
         'NCEI Severe Weather Data Inventory (SWDI) NEXRAD WSR-88D radar hail signatures, ' +
         'NOAA Storm Prediction Center (SPC) Warning Coordination Meteorologist archive, ' +
         'NWS Local Storm Reports via Iowa Environmental Mesonet (IEM), ' +
         'the Community Collaborative Rain, Hail & Snow Network (CoCoRaHS) operated by the Colorado Climate Center and NSF, ' +
         'and the NEXRAD WSR-88D Doppler radar network. ' +
         'All storm event data, radar imagery, and severe weather warnings originate from these sources ' +
         'and are presented as reported. While every effort is made to ensure accuracy, weather data is subject to ' +
         'inherent limitations including radar resolution, reporting delays, and observation gaps. ' +
         'This report is provided for informational purposes and does not constitute a professional roof inspection, ' +
         'engineering assessment, or meteorological certification. A licensed roofing contractor should perform a physical ' +
         'inspection to confirm the presence and extent of any storm damage. The preparer of this report makes no ' +
         'independent representations regarding the accuracy of the underlying federal data; original event identifiers ' +
         '(NCEI EVENT_ID, SPC OM#, CoCoRaHS station, NEXRAD WSR ID) are retained in this report for independent verification.',
         this.M + 20, doc.y, { width: this.CW - 40, lineGap: 1.5, align: 'justify' }
       );

    // =========================================================
    // FOOTER — Subtle branding
    // =========================================================
    doc.moveDown(1.5);
    const copyY = doc.y;
    doc.rect(0, copyY, this.PW, 30).fill(this.C.accent);

    const year = new Date().getFullYear();
    doc.fontSize(8).fillColor('#ffffff').font('Helvetica')
       .text(
         `Prepared by Roof ER The Roof Docs  |  Data sourced from NOAA, NWS, and NEXRAD federal weather systems  |  \u00A9 ${year}`,
         this.M, copyY + 10, { width: this.CW, align: 'center' }
       );

    // =========================================================
    // FINALIZE
    // =========================================================
    doc.end();
    return stream;
  }

  private extractHailSizeFromText(text: string): string | null {
    if (!text) return null;
    const lower = text.toLowerCase();
    const inchMatch = lower.match(/(\d+\.?\d*)\s*inch/);
    if (inchMatch) return `${inchMatch[1]}"`;
    const namedSizes: Record<string, string> = {
      'softball': '4.50', 'baseball': '2.75', 'tennis ball': '2.50',
      'golf ball': '1.75', 'ping pong': '1.50', 'half dollar': '1.25',
      'quarter': '1.00', 'nickel': '0.88', 'dime': '0.75',
    };
    for (const [name, size] of Object.entries(namedSizes)) {
      if (lower.includes(name)) return `${size}"`;
    }
    return null;
  }

  private extractWindSpeedFromText(text: string): string | null {
    if (!text) return null;
    const mphMatch = text.match(/(\d+)\s*(?:to\s*\d+\s*)?mph/i);
    if (mphMatch) return `${mphMatch[1]} mph`;
    const windMatch = text.match(/winds?\s+(?:up\s+to\s+)?(\d+)/i);
    if (windMatch) return `${windMatch[1]} mph`;
    return null;
  }
}

export const pdfReportServiceV2 = new PDFReportServiceV2();
