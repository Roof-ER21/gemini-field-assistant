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
  dateOfLoss?: string;
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
  mapImage?: Buffer | null;
  nexradImage?: Buffer | null;
  nexradTimestamp?: string;
  nwsAlerts?: NWSAlert[];
  nwsAlertImages?: NWSAlertWithRadar[];
  includeNexrad?: boolean;
  includeMap?: boolean;
  includeWarnings?: boolean;
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

    // ===== COMPUTE STATS =====
    const dateMatchesLoss = (value: string): boolean => {
      return !input.dateOfLoss || this.getDateKey(value) === input.dateOfLoss;
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
    const selectedMaxHail = selectedHailSizes.length > 0 ? Math.max(...selectedHailSizes) : maxHail;
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
    // DATA SOURCES & METHODOLOGY — the credibility section
    // =========================================================
    this.drawSectionBanner(doc, 'Data Sources & Methodology');

    doc.fontSize(8.5).fillColor(this.C.text).font('Helvetica')
       .text(
         'This report is compiled from the following federally maintained data sources:',
         this.M + 10, doc.y, { width: this.CW - 20 }
       );
    doc.moveDown(0.4);

    // Source list with descriptions
    const sources = [
      {
        name: 'NOAA Storm Events Database',
        desc: 'Official record of significant weather events maintained by the National Oceanic and Atmospheric Administration (NOAA). Events are verified by National Weather Service (NWS) meteorologists and include trained spotter reports, law enforcement reports, and ASOS (Automated Surface Observing System) measurements.'
      },
      {
        name: 'NEXRAD WSR-88D Doppler Radar Network',
        desc: 'The Next-Generation Radar network operated jointly by the NWS, FAA, and U.S. Air Force. Provides Level-II base reflectivity data used to detect hail signatures, storm cells, and precipitation intensity. Radar imagery sourced via Iowa Environmental Mesonet (IEM) archive.'
      },
      {
        name: 'National Weather Service (NWS) Alerts',
        desc: 'Official severe weather warnings, watches, and advisories issued by NWS forecast offices. Includes storm-specific parameters such as observed hail size, wind speed, and storm tracking data.'
      }
    ];

    sources.forEach(src => {
      this.checkPageBreak(doc, 40);
      doc.fontSize(8.5).fillColor(this.C.accent).font('Helvetica-Bold')
         .text(`\u2022  ${src.name}`, this.M + 15, doc.y, { width: this.CW - 30 });
      doc.fontSize(7.5).fillColor(this.C.lightText).font('Helvetica')
         .text(src.desc, this.M + 25, doc.y, { width: this.CW - 50, lineGap: 1 });
      doc.moveDown(0.3);
    });

    // CCM-grade statement
    doc.moveDown(0.2);
    doc.fontSize(8).fillColor(this.C.sourceGreen).font('Helvetica-Oblique')
       .text(
         'These are the same federally maintained data sources referenced by Certified Consulting Meteorologists (CCM) ' +
         'in professional storm damage assessments and insurance documentation.',
         this.M + 10, doc.y, { width: this.CW - 20, lineGap: 1 }
       );

    // =========================================================
    // PROPERTY INFORMATION
    // =========================================================
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

    // Roof age estimate from Census data
    if (input.propertyRisk?.estimatedRoofAge) {
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
    // STORM IMPACT SUMMARY (was "Hail Impact Details")
    // =========================================================
    this.drawSectionBanner(doc, 'Storm Impact Summary');

    if (primaryEvent || hailEvents.length > 0) {
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

      drawDetailRow('Date of Storm Impact:', this.fmtDateET(primaryStormDate), 0, 0);
      drawDetailRow('Storm Duration:', primaryEvent?.duration ? `${primaryEvent.duration.toFixed(1)} minutes` : '---', 1, 0);
      drawDetailRow('Time of Impact:', this.fmtTimeET(primaryStormDate), 0, 1);
      drawDetailRow('Hail Size Detected:', primaryEvent?.size ? `${primaryEvent.size.toFixed(2)}"` : '---', 1, 1);
      drawDetailRow('Storm Direction:', primaryEvent?.direction || '---', 0, 2);
      drawDetailRow('Verified Reports:', `${nearbyCount} within 10 mi`, 1, 2);
      drawDetailRow('Storm Speed:', primaryEvent?.speed ? `${primaryEvent.speed.toFixed(1)} mph` : '---', 0, 3);
      drawDetailRow('Max Hail Reported:', selectedMaxHail > 0 ? `${selectedMaxHail.toFixed(2)}"` : '---', 1, 3);

      for (let r = 1; r <= 3; r++) {
        const ly = gridY + r * rowH;
        doc.moveTo(this.M + 8, ly).lineTo(this.M + this.CW - 8, ly)
           .strokeColor('#d0d0e0').lineWidth(0.3).stroke();
      }

      doc.y = gridY + 4 * rowH + 5;
    }

    // =========================================================
    // STORM IMPACT NARRATIVE
    // =========================================================
    this.drawSectionBanner(doc, 'Storm Impact Narrative');

    const narrative = generateHailNarrative({
      address: input.address, city: input.city, state: input.state,
      stormDate: primaryStormDate, maxHailSize: selectedMaxHail,
      totalEvents: filteredSelectedIhm.length + filteredSelectedNoaa.length,
      severeCount, windEvents: filteredSelectedNoaaWind.length,
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
    this.drawSectionBanner(doc, 'Verified Ground Observations — Hail');

    doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
       .text(
         `Hail observations verified through federal weather monitoring systems near ${input.address}`,
         this.M, doc.y, { width: this.CW }
       );
    doc.moveDown(0.4);

    const hailHeaders = ['Date / Time', 'Data Source', 'Hail Size', 'Distance', 'Observation Details'];
    const hailWidths = [75, 70, 50, 65, this.CW - 260];

    const hailRows: string[][] = [];
    filteredSelectedIhm.forEach(e => {
      hailRows.push([
        this.fmtDateTimeET(e.date),
        'NEXRAD WSR-88D',
        e.hailSize ? `${e.hailSize.toFixed(2)}"` : '---',
        e.distanceMiles ? `${e.distanceMiles.toFixed(1)} mi` : '---',
        e.comments || 'Radar-detected hail signature'
      ]);
    });
    filteredSelectedNoaaHail.forEach(e => {
      hailRows.push([
        this.fmtDateTimeET(e.date),
        'NOAA Storm Events',
        e.magnitude ? `${e.magnitude.toFixed(2)}"` : '---',
        e.distanceMiles ? `${e.distanceMiles.toFixed(1)} mi` : '---',
        e.comments || e.location || 'Ground observation'
      ]);
    });

    hailRows.sort((a, b) => new Date(b[0].split('\n')[0]).getTime() - new Date(a[0].split('\n')[0]).getTime());

    if (hailRows.length > 0) {
      this.drawTable(doc, hailHeaders, hailRows, hailWidths, { boldColumns: [2] });
    } else {
      doc.fontSize(9).fillColor(this.C.mutedText).font('Helvetica-Oblique')
         .text('No hail observations found for the selected criteria.', this.M, doc.y);
      doc.moveDown(0.5);
    }

    // =========================================================
    // VERIFIED GROUND OBSERVATIONS - WIND
    // =========================================================
    const windObsNoaa = filteredSelectedNoaaWind;
    if (windObsNoaa.length > 0) {
      this.drawSectionBanner(doc, 'Verified Ground Observations — Wind');

      doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
         .text(
           `Damaging wind observations verified through federal weather monitoring systems near ${input.address}`,
           this.M, doc.y, { width: this.CW }
         );
      doc.moveDown(0.4);

      const windHeaders = ['Date / Time', 'Data Source', 'Wind Speed', 'Distance', 'Observation Details'];
      const windWidths = [75, 70, 55, 65, this.CW - 265];

      const windRows: string[][] = windObsNoaa.map(e => [
        this.fmtDateTimeET(e.date),
        'NOAA Storm Events',
        e.magnitude ? `${Math.round(e.magnitude)} kts` : '---',
        e.distanceMiles ? `${e.distanceMiles.toFixed(1)} mi` : '---',
        e.comments || e.location || 'Ground observation'
      ]);

      this.drawTable(doc, windHeaders, windRows, windWidths, { boldColumns: [2] });
    }

    // =========================================================
    // NWS SEVERE WEATHER WARNINGS
    // =========================================================
    const alertImages = input.nwsAlertImages || [];
    const legacyAlerts = input.nwsAlerts || [];
    const hasAlertImages = alertImages.length > 0;
    const hasWarnings = hasAlertImages || legacyAlerts.length > 0;
    const hasLegacyNexrad = input.nexradImage && input.includeNexrad !== false;

    if (hasWarnings || hasLegacyNexrad) {
      this.drawSectionBanner(doc, 'National Weather Service Warnings');

      const warningCount = hasAlertImages ? alertImages.length : legacyAlerts.length;
      if (warningCount > 0) {
        doc.fontSize(9).fillColor(this.C.text).font('Helvetica')
           .text(
             `The following severe weather warnings were issued by the National Weather Service (NWS) for the area encompassing ${input.address}:`,
             this.M + 20, doc.y, { width: this.CW - 40, lineGap: 2 }
           );
        doc.moveDown(0.8);
      }

      if (hasAlertImages) {
        alertImages.slice(0, 5).forEach((item, idx) => {
          const alert = item.alert;
          const radarImg = item.radarImage;
          const radarTs = item.radarTimestamp || alert.onset;
          const isTornado = alert.event.toLowerCase().includes('tornado');
          const headlineColor = isTornado ? '#dc2626' : this.C.text;

          this.checkPageBreak(doc, 230);
          if (idx > 0) doc.moveDown(0.8);

          const blockY = doc.y;
          const imgWidth = 200;
          const imgHeight = 160;
          const detailX = this.M + imgWidth + 15;
          const detailW = this.CW - imgWidth - 15;

          if (radarImg) {
            try {
              doc.image(radarImg, this.M, blockY, { width: imgWidth, height: imgHeight, fit: [imgWidth, imgHeight] });
              doc.rect(this.M, blockY, imgWidth, imgHeight).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
            } catch (e) { console.warn(`Failed to embed NEXRAD for alert ${idx}:`, e); }
          }

          const captionY = blockY + imgHeight + 3;
          doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica')
             .text(`NEXRAD WSR-88D Radar — ${this.fmtDateET(radarTs)}`, this.M, captionY, { width: imgWidth });
          doc.text(`${this.fmtTimeET(radarTs)} | Source: IEM/NOAA`, this.M, doc.y, { width: imgWidth });

          doc.fontSize(9.5).fillColor(headlineColor).font('Helvetica-Bold')
             .text(
               `${alert.event} issued ${this.fmtDateET(alert.onset)} at ${this.fmtTimeET(alert.onset)}`,
               detailX, blockY, { width: detailW }
             );
          doc.text(
            `until ${this.fmtDateET(alert.expires)} at ${this.fmtTimeET(alert.expires)} by ${alert.senderName}`,
            detailX, doc.y, { width: detailW }
          );
          doc.moveDown(0.4);

          const alertHailSize = alert.hailSize || extractHailSizeFromText(alert.description);
          const alertWindSpeed = alert.windSpeed || extractWindSpeedFromText(alert.description);

          const gridY = doc.y;
          const labelW2 = 75;
          const valW = (detailW - labelW2 * 2) / 2;

          const drawDetail = (label: string, value: string, col: number, row: number) => {
            const x = detailX + col * (labelW2 + valW);
            const y = gridY + row * 18;
            doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica').text(label, x, y);
            doc.fontSize(9).fillColor(this.C.text).font('Helvetica-Bold').text(value, x + labelW2, y);
          };

          drawDetail('Effective:', this.fmtTimeET(alert.onset), 0, 0);
          drawDetail('Expires:', this.fmtTimeET(alert.expires), 1, 0);
          drawDetail('Hail Size:', alertHailSize || (maxHail > 0 ? `${maxHail.toFixed(2)}"` : 'n/a'), 0, 1);
          drawDetail('Wind Speed:', alertWindSpeed || 'n/a', 1, 1);
          drawDetail('Urgency:', alert.severity === 'Extreme' || alert.severity === 'Severe' ? 'Immediate' : 'Expected', 0, 2);
          drawDetail('Certainty:', alert.certainty || 'Observed', 1, 2);

          doc.y = Math.max(captionY + 16, gridY + 3 * 18 + 10);

          const descText = alert.description || alert.headline || '';
          if (descText) {
            doc.moveDown(0.3);
            doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
               .text(descText, this.M + 20, doc.y, { width: this.CW - 40, lineGap: 1.5 });
          }
        });

      } else if (hasLegacyNexrad && input.nexradImage && legacyAlerts.length > 0) {
        // Legacy single-NEXRAD fallback (same as V1)
        this.checkPageBreak(doc, 200);
        const layoutY = doc.y;
        const imgWidth = 200;
        const imgHeight = 160;
        const detailX = this.M + imgWidth + 15;
        const detailW = this.CW - imgWidth - 15;
        const alert = legacyAlerts[0];

        try {
          doc.image(input.nexradImage, this.M, layoutY, { width: imgWidth, height: imgHeight, fit: [imgWidth, imgHeight] });
          doc.rect(this.M, layoutY, imgWidth, imgHeight).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
        } catch (e) { console.warn('Failed to embed NEXRAD:', e); }

        const captionY = layoutY + imgHeight + 3;
        doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica')
           .text(`NEXRAD WSR-88D Radar — ${this.fmtDateET(input.nexradTimestamp || primaryStormDate)}`, this.M, captionY, { width: imgWidth });
        doc.text(`${this.fmtTimeET(input.nexradTimestamp || primaryStormDate)} | Source: IEM/NOAA`, this.M, doc.y, { width: imgWidth });

        doc.fontSize(9.5).fillColor(this.C.text).font('Helvetica-Bold')
           .text(`${alert.event} issued ${this.fmtDateET(alert.onset)} at ${this.fmtTimeET(alert.onset)}`, detailX, layoutY, { width: detailW });
        doc.text(`until ${this.fmtDateET(alert.expires)} at ${this.fmtTimeET(alert.expires)} by ${alert.senderName}`, detailX, doc.y, { width: detailW });
        doc.moveDown(0.4);

        const gridStartY = doc.y;
        const labelW2 = 70;
        const valW = (detailW - labelW2 * 2) / 2;
        const drawLegacyDetail = (label: string, value: string, col: number, row: number) => {
          const x = detailX + col * (labelW2 + valW);
          const y = gridStartY + row * 16;
          doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica').text(label, x, y);
          doc.fontSize(9).fillColor(this.C.text).font('Helvetica-Bold').text(value, x + labelW2, y);
        };
        drawLegacyDetail('Effective:', this.fmtTimeET(alert.onset), 0, 0);
        drawLegacyDetail('Expires:', this.fmtTimeET(alert.expires), 1, 0);
        drawLegacyDetail('Hail Size:', maxHail > 0 ? `${maxHail.toFixed(2)}"` : 'n/a', 0, 1);
        drawLegacyDetail('Wind Speed:', selectedWindEvents.length > 0 ? `${Math.round(selectedWindEvents[0]?.magnitude || 0)} mph` : 'n/a', 1, 1);
        drawLegacyDetail('Urgency:', 'Immediate', 0, 2);
        drawLegacyDetail('Certainty:', 'Observed', 1, 2);
        doc.y = Math.max(captionY + 20, gridStartY + 3 * 16 + 10);

        const descText = alert.description || alert.headline || '';
        if (descText) {
          doc.moveDown(0.3);
          doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
             .text(descText, this.M + 20, doc.y, { width: this.CW - 40, lineGap: 1.5 });
        }

        legacyAlerts.slice(1, 4).forEach(extraAlert => {
          this.checkPageBreak(doc, 60);
          doc.moveDown(0.5);
          doc.fontSize(9).fillColor(this.C.text).font('Helvetica-Bold')
             .text(`${extraAlert.event} - ${this.fmtFullDateTimeET(extraAlert.onset)}`, this.M + 20, doc.y, { width: this.CW - 40 });
          doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
             .text(extraAlert.headline || extraAlert.description.substring(0, 300), this.M + 20, doc.y, { width: this.CW - 40, lineGap: 1 });
        });

      } else if (hasLegacyNexrad && input.nexradImage) {
        this.checkPageBreak(doc, 200);
        const radarW = 300;
        const radarH = 200;
        const radarX = this.M + (this.CW - radarW) / 2;
        try {
          doc.image(input.nexradImage, radarX, doc.y, { width: radarW, height: radarH, fit: [radarW, radarH] });
          doc.rect(radarX, doc.y, radarW, radarH).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
          doc.y += radarH + 4;
          doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica')
             .text(`NEXRAD WSR-88D Radar | ${this.fmtFullDateTimeET(input.nexradTimestamp || primaryStormDate)} | Source: Iowa Environmental Mesonet (IEM/NOAA)`,
               this.M, doc.y, { width: this.CW, align: 'center' });
        } catch (e) { console.warn('NEXRAD embed failed:', e); }

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

    const histHeaders = ['Map Date*', 'Impact Time', 'Direction', 'Speed', 'Duration', 'At Location', 'Within 1mi', 'Within 3mi', 'Within 10mi'];
    const histWidths = [62, 70, 48, 38, 44, 58, 54, 54, 54];

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

    // Build per-event list, then consolidate by date for a cleaner table
    const historicalHailEvents = historicalSeedEvents
      .map(e => ({
        date: e.date,
        direction: e.stormDirection || '---',
        speed: e.stormSpeed,
        duration: e.duration,
        size: e.hailSize || 0,
        distance: e.distanceMiles,
      }))
      .sort((a, b) => (this.parseStormDate(b.date)?.getTime() || 0) - (this.parseStormDate(a.date)?.getTime() || 0));

    // Consolidate by date: one row per unique date, max hail per distance bucket
    const dateGroups = new Map<string, {
      date: string; direction: string; speed: number | undefined;
      duration: number | undefined; atLoc: number; w1: number; w3: number; w10: number;
    }>();
    for (const e of historicalHailEvents) {
      const dk = this.getDateKey(e.date) || e.date;
      const dist = e.distance ?? 99;
      const size = e.size;
      if (!dateGroups.has(dk)) {
        dateGroups.set(dk, {
          date: e.date, direction: e.direction !== '---' ? e.direction : '---',
          speed: e.speed, duration: e.duration, atLoc: 0, w1: 0, w3: 0, w10: 0,
        });
      }
      const g = dateGroups.get(dk)!;
      if (g.direction === '---' && e.direction !== '---') g.direction = e.direction;
      if (!g.speed && e.speed) g.speed = e.speed;
      if (!g.duration && e.duration) g.duration = e.duration;
      if (dist <= 0.1 && size > g.atLoc) g.atLoc = size;
      if (dist <= 1 && size > g.w1) g.w1 = size;
      if (dist <= 3 && size > g.w3) g.w3 = size;
      if (dist <= 10 && size > g.w10) g.w10 = size;
    }

    const consolidatedDates = Array.from(dateGroups.values())
      .filter(g => g.atLoc > 0 || g.w1 > 0 || g.w3 > 0 || g.w10 > 0)
      .sort((a, b) => (this.parseStormDate(b.date)?.getTime() || 0) - (this.parseStormDate(a.date)?.getTime() || 0));

    const histRows: string[][] = consolidatedDates.map(g => [
      this.fmtDateET(g.date), this.fmtFullDateTimeET(g.date),
      g.direction, g.speed ? g.speed.toFixed(1) : '---',
      g.duration ? g.duration.toFixed(1) : '---',
      g.atLoc > 0 ? `${g.atLoc.toFixed(2)}"` : '---',
      g.w1 > 0 ? `${g.w1.toFixed(2)}"` : '---',
      g.w3 > 0 ? `${g.w3.toFixed(2)}"` : '---',
      g.w10 > 0 ? `${g.w10.toFixed(2)}"` : '---',
    ]);

    if (histRows.length > 0) {
      this.drawTable(doc, histHeaders, histRows, histWidths, { boldColumns: [0] });
    } else {
      doc.fontSize(9).fillColor(this.C.mutedText).font('Helvetica-Oblique')
         .text('No historical storm events found.', this.M, doc.y);
    }

    doc.moveDown(0.3);
    doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica')
       .text('* Map dates begin at 6:00 a.m. CST on the indicated day and end at 6:00 a.m. CST the following day.', this.M, doc.y);

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
    // APPLICABLE BUILDING CODE REQUIREMENTS
    // =========================================================
    if (input.state) {
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
         'This Storm Impact Analysis is generated using publicly available data from the National Oceanic and Atmospheric ' +
         'Administration (NOAA), the National Weather Service (NWS), and the NEXRAD WSR-88D Doppler radar network. ' +
         'All storm event data, radar imagery, and severe weather warnings originate from these federal sources ' +
         'and are presented as reported. While every effort is made to ensure accuracy, weather data is subject to ' +
         'inherent limitations including radar resolution, reporting delays, and observation gaps. This report is ' +
         'provided for informational purposes and does not constitute a professional roof inspection, engineering ' +
         'assessment, or meteorological certification. A licensed roofing contractor should perform a physical ' +
         'inspection to confirm the presence and extent of any storm damage. The preparer of this report makes ' +
         'no independent representations regarding the accuracy of the underlying federal data.',
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
