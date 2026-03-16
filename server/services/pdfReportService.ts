/**
 * PDF Report Generation Service - IHM Curran-Style Hail Impact Report
 *
 * Modeled precisely after the Interactive Hail Maps (IHM) Hail Impact Report format:
 * - Report # banner
 * - Company header with logo + report info
 * - Verification section
 * - Property Information with map
 * - Hail Impact Details (2x4 grid)
 * - Hail Impact Narrative
 * - Ground Observations tables (Hail + Wind) with Comments column
 * - Severe Weather Warnings with side-by-side NEXRAD + warning details
 * - Historical Storm Activity table (IHM columns)
 * - Disclaimer + Copyright
 *
 * ALL dates in Eastern timezone (EDT/EST).
 */

import * as PDFKit from 'pdfkit';
import { PassThrough } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { DamageScoreResult } from './damageScoreService.js';
import type { NWSAlert } from './nwsAlertService.js';
import { generateHailNarrative } from './narrativeService.js';

// PDFKit default export
const PDFDocument = (PDFKit as any).default || PDFKit;

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== INTERFACES ==========

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
  lat: number;
  lng: number;
  radius: number;
  events: HailEvent[];
  noaaEvents: NOAAEvent[];
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
}

// ========== SERVICE CLASS ==========

export class PDFReportService {
  // Colors matching IHM Curran report style - clean, professional, minimal
  private readonly C = {
    text: '#333333',          // Dark text
    lightText: '#666666',     // Secondary text
    mutedText: '#999999',     // Muted/caption text
    sectionBg: '#e8e8e8',    // Light gray section banner
    sectionText: '#888888',   // Section header text (italic)
    tableBorder: '#cccccc',   // Table borders
    tableHeaderBg: '#f0f0f0', // Table header background
    tableHeaderText: '#333333',
    tableAltRow: '#fafafa',   // Alternating row
    accent: '#c53030',        // RoofER red
    link: '#2563eb',          // Link blue
    warningRed: '#fecaca',    // Light red warning bg
    warningGreen: '#dcfce7',  // Light green warning bg
    white: '#ffffff',
    black: '#000000',
  };

  private readonly M = 50;                    // Margin
  private readonly PW = 612;                  // Page width (Letter)
  private readonly PH = 792;                  // Page height
  private readonly CW = 612 - 100;            // Content width
  private readonly BOTTOM = 745;              // Page bottom limit

  // ========== FORMATTING HELPERS ==========

  private fmtDateET(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        month: 'numeric',
        day: 'numeric',
        year: 'numeric'
      });
    } catch { return dateStr; }
  }

  private fmtTimeET(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const etFull = d.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      });
      // Extract timezone from the formatted string (works on any server timezone)
      const tz = etFull.includes('EDT') ? 'EDT' : 'EST';
      const time = d.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return `${time} ${tz}`;
    } catch { return ''; }
  }

  private fmtDateTimeET(dateStr: string): string {
    const date = this.fmtDateET(dateStr);
    const time = this.fmtTimeET(dateStr);
    return time ? `${date}\n${time}` : date;
  }

  private fmtFullDateTimeET(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const etFull = d.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      });
      const tz = etFull.includes('EDT') ? 'EDT' : 'EST';
      const formatted = d.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return `${formatted} ${tz}`;
    } catch { return dateStr; }
  }

  private generateReportId(): string {
    // IHM-style long numeric ID
    const now = Date.now();
    const rand = Math.floor(Math.random() * 9999999);
    return `${Math.floor(now / 1000)}-${rand}`;
  }

  private generateVerificationCode(): string {
    return Math.random().toString(16).substring(2, 8);
  }

  // ========== DRAWING HELPERS ==========

  /** IHM-style light gray section banner with centered italic text */
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
   * Draw a table matching IHM Curran style:
   * - Light gray header row (not dark)
   * - Thin borders
   * - Bold header text
   * - Alternating row shading
   * - Auto page break with header repeat
   * - Variable row heights for multi-line content
   */
  private drawTable(
    doc: any,
    headers: string[],
    rows: string[][],
    colWidths: number[],
    options: {
      boldColumns?: number[];
      boldValues?: Record<number, string[]>;
    } = {}
  ): void {
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const headerH = 20;
    const cellPadX = 4;
    const cellPadY = 4;
    const fontSize = 8;
    let tableY = doc.y;

    // Measure row height based on content
    const measureRowHeight = (row: string[]): number => {
      let maxH = 16; // minimum
      row.forEach((cell, i) => {
        const w = colWidths[i] - cellPadX * 2;
        doc.fontSize(fontSize).font('Helvetica');
        const h = doc.heightOfString(cell, { width: w }) + cellPadY * 2;
        if (h > maxH) maxH = h;
      });
      return Math.min(maxH, 60); // cap at 60
    };

    const drawHeader = () => {
      // Header background
      doc.rect(this.M, tableY, tableWidth, headerH).fill(this.C.tableHeaderBg);
      doc.rect(this.M, tableY, tableWidth, headerH).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
      let x = this.M;
      headers.forEach((h, i) => {
        doc.fontSize(8).fillColor(this.C.tableHeaderText).font('Helvetica-Bold')
           .text(h, x + cellPadX, tableY + 5, { width: colWidths[i] - cellPadX * 2 });
        // Column dividers
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

      // Alternating background
      if (idx % 2 === 0) {
        doc.rect(this.M, tableY, tableWidth, rowH).fill(this.C.tableAltRow);
      }
      // Row border
      doc.rect(this.M, tableY, tableWidth, rowH).strokeColor(this.C.tableBorder).lineWidth(0.3).stroke();

      let x = this.M;
      row.forEach((cell, i) => {
        const isBold = options.boldColumns?.includes(i) ||
          (options.boldValues?.[i] && options.boldValues[i].includes(cell));
        doc.fontSize(fontSize)
           .fillColor(this.C.text)
           .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
           .text(cell, x + cellPadX, tableY + cellPadY, {
             width: colWidths[i] - cellPadX * 2,
             height: rowH - cellPadY
           });
        // Column dividers
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
    const companyName = input.companyName || 'RoofER';
    const reportId = this.generateReportId();
    const verificationCode = this.generateVerificationCode();

    const doc = new PDFDocument({
      size: 'LETTER',
      margin: this.M,
      info: {
        Title: `Hail Impact Report - ${input.address}`,
        Author: companyName,
        Subject: `Storm History for ${input.address}`,
        Creator: 'Roof-ER Storm Intelligence System',
      },
    });

    const stream = new PassThrough();
    doc.pipe(stream);

    // ===== COMPUTE STATS =====
    const allHailSizes = [
      ...input.events.map(e => e.hailSize || 0),
      ...input.noaaEvents.filter(e => e.eventType === 'hail').map(e => e.magnitude || 0)
    ].filter(s => s > 0);
    const maxHail = allHailSizes.length > 0 ? Math.max(...allHailSizes) : 0;
    const severeCount = allHailSizes.filter(s => s >= 1.5).length;
    const windEvents = input.noaaEvents.filter(e => e.eventType === 'wind');
    const hailEvents = [
      ...input.events.map(e => ({
        date: e.date, size: e.hailSize, source: 'NEXRAD' as const,
        distance: e.distanceMiles, location: '', comments: e.comments || '',
        direction: e.stormDirection || '', speed: e.stormSpeed, duration: e.duration
      })),
      ...input.noaaEvents.filter(e => e.eventType === 'hail').map(e => ({
        date: e.date, size: e.magnitude, source: 'NOAA' as const,
        distance: e.distanceMiles, location: e.location, comments: e.comments || '',
        direction: '', speed: undefined as number | undefined, duration: undefined as number | undefined
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const primaryEvent = hailEvents.length > 0 ? hailEvents[0] : null;
    const primaryStormDate = primaryEvent?.date ||
      (input.noaaEvents.length > 0 ? input.noaaEvents[0].date : new Date().toISOString());
    const nearbyCount = hailEvents.filter(e => (e.distance || 99) < 10).length;

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

    // =========================================================
    // PAGE 1: HEADER + PROPERTY INFO + HAIL IMPACT DETAILS
    // =========================================================

    // --- Report # Banner (gray bar at top) ---
    const bannerH = 30;
    doc.rect(0, 0, this.PW, bannerH).fill(this.C.sectionBg);
    doc.fontSize(12).fillColor(this.C.sectionText).font('Helvetica-Oblique')
       .text(`Hail Impact Report #: ${reportId}`, this.M, 8, { width: this.CW, align: 'center' });

    doc.y = bannerH + 12;

    // --- Company Header (2 columns) ---
    const headerY = doc.y;

    // Left side: Roof-ER logo + company info
    let logoLoaded = false;
    let logoHeight = 55;
    try {
      const logoPath = path.resolve(__dirname, '../../public/roofer-logo-clean.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, this.M, headerY, { height: logoHeight });
        logoLoaded = true;
      }
    } catch { /* logo not available */ }

    const companyInfoX = logoLoaded ? this.M + 170 : this.M;
    doc.fontSize(8.5).fillColor(this.C.lightText).font('Helvetica');
    if (input.repName) {
      doc.text(input.repName, companyInfoX, headerY + 5);
    }
    if (input.companyAddress) {
      doc.text(input.companyAddress, companyInfoX, doc.y);
    }
    if (input.companyPhone || input.repPhone) {
      doc.text(input.companyPhone || input.repPhone || '', companyInfoX, doc.y);
    }
    if (input.companyWebsite) {
      doc.fillColor(this.C.link).text(input.companyWebsite, companyInfoX, doc.y);
    }
    if (input.repEmail) {
      doc.fillColor(this.C.link).text(input.repEmail, companyInfoX, doc.y);
    }

    // Right side: Report info + small S21 badge
    const rightX = this.M + this.CW * 0.55;
    doc.fontSize(11).fillColor(this.C.text).font('Helvetica-Bold')
       .text('Hail Impact Report', rightX, headerY, { width: this.CW * 0.45 });
    doc.fontSize(8.5).fillColor(this.C.lightText).font('Helvetica')
       .text(`Report #: ${reportId}`, rightX, doc.y, { width: this.CW * 0.45 })
       .text(`Date: ${this.fmtFullDateTimeET(new Date().toISOString())}`, rightX, doc.y, { width: this.CW * 0.45 })
       .text(`${companyName} Storm Intelligence`, rightX, doc.y, { width: this.CW * 0.45 });

    // Small S21 badge in top-right corner
    try {
      const s21Path = path.resolve(__dirname, '../../public/roofer-logo-icon.png');
      if (fs.existsSync(s21Path)) {
        doc.image(s21Path, this.M + this.CW - 30, headerY, { height: 28 });
      }
    } catch { /* s21 badge not available */ }

    doc.y = Math.max(doc.y, headerY + logoHeight + 5) + 5;

    // --- Verification Section ---
    doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
       .text('You can verify the authenticity of this report using report number ', this.M, doc.y, { continued: true });
    doc.font('Helvetica-Bold').fillColor(this.C.text).text(reportId, { continued: true });
    doc.font('Helvetica').fillColor(this.C.lightText).text(' and the following Verification Code: ', { continued: true });
    doc.font('Helvetica-Bold').fillColor(this.C.accent).text(verificationCode);
    doc.moveDown(0.3);

    // --- Thin divider ---
    doc.moveTo(this.M, doc.y).lineTo(this.M + this.CW, doc.y)
       .strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();

    // =========================================================
    // PROPERTY INFORMATION
    // =========================================================
    this.drawSectionBanner(doc, 'Property Information');

    const propY = doc.y;
    const hasMap = !!input.mapImage;
    const mapWidth = hasMap ? 180 : 0;
    const textX = hasMap ? this.M + mapWidth + 15 : this.M;

    // Map image (left side - matching IHM layout)
    if (hasMap && input.mapImage) {
      try {
        doc.image(input.mapImage, this.M, propY, {
          width: mapWidth,
          height: 120,
          fit: [mapWidth, 120]
        });
        doc.rect(this.M, propY, mapWidth, 120).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
      } catch (e) {
        console.warn('Failed to embed map image:', e);
      }
    }

    // Property text (right of map)
    doc.fontSize(10).fillColor(this.C.text).font('Helvetica-Bold')
       .text('Property Address:', textX, propY);
    doc.fontSize(10).font('Helvetica')
       .text(input.address, textX, doc.y);
    if (input.city && input.state) {
      doc.text(`${input.city}, ${input.state}${input.lat ? ` ${Math.floor(input.lat * 100) / 100}` : ''}`);
    }

    doc.moveDown(0.4);
    if (input.customerName) {
      doc.fontSize(10).fillColor(this.C.accent).font('Helvetica-Bold')
         .text('Customer Info:', textX, doc.y);
      doc.fontSize(10).fillColor(this.C.text).font('Helvetica')
         .text(input.customerName, textX, doc.y);
    } else {
      doc.fontSize(10).fillColor(this.C.accent).font('Helvetica-Bold')
         .text('Customer Info:', textX, doc.y);
    }

    doc.y = Math.max(doc.y, propY + 130);

    // =========================================================
    // HAIL IMPACT DETAILS (2x4 grid - matching IHM format exactly)
    // =========================================================
    this.drawSectionBanner(doc, 'Hail Impact Details');

    if (primaryEvent || hailEvents.length > 0) {
      const gridY = doc.y;
      const colW = this.CW / 2;
      const rowH = 18;
      const labelW = 150;

      const drawDetailRow = (label: string, value: string, col: number, row: number) => {
        const x = this.M + col * colW;
        const y = gridY + row * rowH;
        doc.fontSize(9).fillColor(this.C.lightText).font('Helvetica')
           .text(label, x + 8, y + 3, { width: labelW });
        doc.fontSize(9.5).fillColor(this.C.text).font('Helvetica-Bold')
           .text(value, x + labelW, y + 3, { width: colW - labelW - 8 });
      };

      // Left column                                    Right column
      drawDetailRow('Date of Hail Impact:',   this.fmtDateET(primaryStormDate), 0, 0);
      drawDetailRow('Hail Duration:',         primaryEvent?.duration ? `${primaryEvent.duration.toFixed(1)} minutes` : '---', 1, 0);

      drawDetailRow('Time of Hail Impact:',   this.fmtTimeET(primaryStormDate), 0, 1);
      drawDetailRow('Size of Hail Detected:', primaryEvent?.size ? `${primaryEvent.size.toFixed(2)}"` : '---', 1, 1);

      drawDetailRow('Storm Direction:',       primaryEvent?.direction || 'N', 0, 2);
      drawDetailRow('Nearby Hail Reported:',  `${nearbyCount} reports`, 1, 2);

      drawDetailRow('Storm Speed:',           primaryEvent?.speed ? `${primaryEvent.speed.toFixed(1)} mph` : '---', 0, 3);
      drawDetailRow('Max Hail Size Reported:', maxHail > 0 ? `${maxHail.toFixed(2)}"` : '---', 1, 3);

      // Thin divider lines between rows
      for (let r = 1; r <= 3; r++) {
        const ly = gridY + r * rowH;
        doc.moveTo(this.M + 8, ly).lineTo(this.M + this.CW - 8, ly)
           .strokeColor('#e0e0e0').lineWidth(0.3).stroke();
      }

      doc.y = gridY + 4 * rowH + 5;
    }

    // =========================================================
    // HAIL IMPACT NARRATIVE
    // =========================================================
    this.drawSectionBanner(doc, 'Hail Impact Narrative');

    const narrative = generateHailNarrative({
      address: input.address,
      city: input.city,
      state: input.state,
      stormDate: primaryStormDate,
      maxHailSize: maxHail,
      totalEvents: input.events.length + input.noaaEvents.length,
      severeCount,
      windEvents: windEvents.length,
      nearbyReports: hailEvents.filter(e => (e.distance || 99) < 1).length,
      radiusMiles: input.radius,
      stormDirection: primaryEvent?.direction,
      stormSpeed: primaryEvent?.speed ? `${primaryEvent.speed.toFixed(1)} miles per hour` : undefined
    });

    doc.fontSize(9.5).fillColor(this.C.text).font('Helvetica')
       .text(narrative, this.M + 20, doc.y, { width: this.CW - 40, lineGap: 3, align: 'justify' });
    doc.moveDown(0.5);

    // =========================================================
    // GROUND OBSERVATIONS - HAIL
    // =========================================================
    this.drawSectionBanner(doc, 'Ground Observations - Hail');

    // Intro line
    doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
       .text(
         `On-the-ground hail observations reported near the property located at ${input.address} (Property)`,
         this.M, doc.y, { width: this.CW }
       );
    doc.moveDown(0.4);

    // Build hail observation rows with Comments (matching IHM format)
    const hailHeaders = ['Date / Time', 'Source', 'Hail Size', 'Distance from Property', 'Comments'];
    const hailWidths = [80, 50, 55, 100, this.CW - 285];

    const hailRows: string[][] = [];
    filteredIhm.forEach(e => {
      hailRows.push([
        this.fmtDateTimeET(e.date),
        'NEXRAD',
        e.hailSize ? `${e.hailSize.toFixed(2)}"` : '---',
        e.distanceMiles ? `${e.distanceMiles.toFixed(1)} miles` : '---',
        e.comments || ''
      ]);
    });
    filteredNoaa.filter(e => e.eventType === 'hail').forEach(e => {
      hailRows.push([
        this.fmtDateTimeET(e.date),
        'NOAA',
        e.magnitude ? `${e.magnitude.toFixed(2)}"` : '---',
        e.distanceMiles ? `${e.distanceMiles.toFixed(1)} miles` : '---',
        e.comments || e.location || ''
      ]);
    });

    // Sort by date descending
    hailRows.sort((a, b) => new Date(b[0].split('\n')[0]).getTime() - new Date(a[0].split('\n')[0]).getTime());

    if (hailRows.length > 0) {
      this.drawTable(doc, hailHeaders, hailRows, hailWidths, { boldColumns: [2] });
    } else {
      doc.fontSize(9).fillColor(this.C.mutedText).font('Helvetica-Oblique')
         .text('No hail observations found for the selected criteria.', this.M, doc.y);
      doc.moveDown(0.5);
    }

    // =========================================================
    // GROUND OBSERVATIONS - WIND
    // =========================================================
    const windObsNoaa = filteredNoaa.filter(e => e.eventType === 'wind');
    if (windObsNoaa.length > 0) {
      this.drawSectionBanner(doc, 'Ground Observations - Wind');

      doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
         .text(
           `On-the-ground damaging wind observations reported near the property located at ${input.address} (Property)`,
           this.M, doc.y, { width: this.CW }
         );
      doc.moveDown(0.4);

      const windHeaders = ['Date / Time', 'Source', 'Wind Speed', 'Distance from Property', 'Comments'];
      const windWidths = [80, 50, 60, 100, this.CW - 290];

      const windRows: string[][] = windObsNoaa.map(e => [
        this.fmtDateTimeET(e.date),
        'NOAA',
        e.magnitude ? `${Math.round(e.magnitude)} kts` : '---',
        e.distanceMiles ? `${e.distanceMiles.toFixed(1)} miles` : '---',
        e.comments || e.location || ''
      ]);

      this.drawTable(doc, windHeaders, windRows, windWidths, { boldColumns: [2] });
    }

    // =========================================================
    // SEVERE WEATHER WARNINGS (each with its own NEXRAD radar image — IHM format)
    // =========================================================
    const alertImages = input.nwsAlertImages || [];
    const legacyAlerts = input.nwsAlerts || [];
    const hasAlertImages = alertImages.length > 0;
    const hasWarnings = hasAlertImages || legacyAlerts.length > 0;
    const hasLegacyNexrad = input.nexradImage && input.includeNexrad !== false;

    if (hasWarnings || hasLegacyNexrad) {
      this.drawSectionBanner(doc, 'Severe Weather Warnings');

      // Intro paragraph
      const warningCount = hasAlertImages ? alertImages.length : legacyAlerts.length;
      if (warningCount > 0) {
        doc.fontSize(9).fillColor(this.C.text).font('Helvetica')
           .text(
             `At the approximate time of the hail impact, the property located at ${input.address} was under multiple severe weather warnings issued by the National Weather Service, as follows:`,
             this.M + 20, doc.y, { width: this.CW - 40, lineGap: 2 }
           );
        doc.moveDown(0.8);
      }

      // --- NEW: Per-alert NEXRAD + full details (IHM format) ---
      if (hasAlertImages) {
        alertImages.slice(0, 5).forEach((item, idx) => {
          const alert = item.alert;
          const radarImg = item.radarImage;
          const radarTs = item.radarTimestamp || alert.onset;
          const isTornado = alert.event.toLowerCase().includes('tornado');
          const headlineColor = isTornado ? '#dc2626' : this.C.text;

          // Ensure enough space for the warning block (image + details)
          this.checkPageBreak(doc, 230);
          if (idx > 0) doc.moveDown(0.8);

          const blockY = doc.y;
          const imgWidth = 200;
          const imgHeight = 160;
          const detailX = this.M + imgWidth + 15;
          const detailW = this.CW - imgWidth - 15;

          // NEXRAD radar image (left)
          if (radarImg) {
            try {
              doc.image(radarImg, this.M, blockY, {
                width: imgWidth, height: imgHeight, fit: [imgWidth, imgHeight]
              });
              doc.rect(this.M, blockY, imgWidth, imgHeight)
                 .strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
            } catch (e) {
              console.warn(`Failed to embed NEXRAD for alert ${idx}:`, e);
            }
          }

          // Radar caption below image
          const captionY = blockY + imgHeight + 3;
          doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica')
             .text(`NEXRAD Radar Image from ${this.fmtDateET(radarTs)}`, this.M, captionY, { width: imgWidth });
          doc.text(this.fmtTimeET(radarTs), this.M, doc.y, { width: imgWidth });

          // Warning headline (right of image)
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

          // Extract hail size and wind speed from this alert's description
          const alertHailSize = this.extractHailSizeFromText(alert.description);
          const alertWindSpeed = this.extractWindSpeedFromText(alert.description);

          // Detail grid (2x3) matching IHM format
          const gridY = doc.y;
          const labelW2 = 75;
          const valW = (detailW - labelW2 * 2) / 2;

          const drawDetail = (label: string, value: string, col: number, row: number) => {
            const x = detailX + col * (labelW2 + valW);
            const y = gridY + row * 18;
            doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica').text(label, x, y);
            doc.fontSize(9).fillColor(this.C.text).font('Helvetica-Bold').text(value, x + labelW2, y);
          };

          drawDetail('Effective:', `${this.fmtTimeET(alert.onset)}`, 0, 0);
          drawDetail('Expires:', `${this.fmtTimeET(alert.expires)}`, 1, 0);
          drawDetail('Hail Size:', alertHailSize || (maxHail > 0 ? `${maxHail.toFixed(2)}"` : 'n/a'), 0, 1);
          drawDetail('Wind Speed:', alertWindSpeed || 'n/a', 1, 1);
          drawDetail('Urgency:', alert.severity === 'Extreme' || alert.severity === 'Severe' ? 'Immediate' : 'Expected', 0, 2);
          drawDetail('Certainty:', alert.certainty || 'Observed', 1, 2);

          // Move past the image+details block
          doc.y = Math.max(captionY + 16, gridY + 3 * 18 + 10);

          // Warning description text (full narrative, below both image and details)
          const descText = alert.description || alert.headline || '';
          if (descText) {
            doc.moveDown(0.3);
            doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
               .text(descText, this.M + 20, doc.y, {
                 width: this.CW - 40, lineGap: 1.5
               });
          }
        });

      // --- LEGACY FALLBACK: Single NEXRAD + first alert (backward compat) ---
      } else if (hasLegacyNexrad && input.nexradImage && legacyAlerts.length > 0) {
        this.checkPageBreak(doc, 200);
        const layoutY = doc.y;
        const imgWidth = 200;
        const imgHeight = 160;
        const detailX = this.M + imgWidth + 15;
        const detailW = this.CW - imgWidth - 15;
        const alert = legacyAlerts[0];

        try {
          doc.image(input.nexradImage, this.M, layoutY, {
            width: imgWidth, height: imgHeight, fit: [imgWidth, imgHeight]
          });
          doc.rect(this.M, layoutY, imgWidth, imgHeight).strokeColor(this.C.tableBorder).lineWidth(0.5).stroke();
        } catch (e) { console.warn('Failed to embed NEXRAD:', e); }

        const captionY = layoutY + imgHeight + 3;
        doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica')
           .text(`NEXRAD Radar Image from ${this.fmtDateET(input.nexradTimestamp || primaryStormDate)}`, this.M, captionY, { width: imgWidth });
        doc.text(this.fmtTimeET(input.nexradTimestamp || primaryStormDate), this.M, doc.y, { width: imgWidth });

        const isTornado = alert.event.toLowerCase().includes('tornado');
        doc.fontSize(9.5).fillColor(isTornado ? '#dc2626' : this.C.text).font('Helvetica-Bold')
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
        drawLegacyDetail('Wind Speed:', windEvents.length > 0 ? `${Math.round(windEvents[0]?.magnitude || 0)} mph` : 'n/a', 1, 1);
        drawLegacyDetail('Urgency:', 'Immediate', 0, 2);
        drawLegacyDetail('Certainty:', 'Observed', 1, 2);
        doc.y = Math.max(captionY + 20, gridStartY + 3 * 16 + 10);

        const descText = alert.description || alert.headline || '';
        if (descText) {
          doc.moveDown(0.3);
          doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
             .text(descText, this.M + 20, doc.y, { width: this.CW - 40, lineGap: 1.5 });
        }

        // Additional legacy alerts as text
        legacyAlerts.slice(1, 4).forEach(extraAlert => {
          this.checkPageBreak(doc, 60);
          doc.moveDown(0.5);
          const isExTornado = extraAlert.event.toLowerCase().includes('tornado');
          doc.fontSize(9).fillColor(isExTornado ? '#dc2626' : this.C.text).font('Helvetica-Bold')
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
             .text(`NEXRAD Radar | ${this.fmtFullDateTimeET(input.nexradTimestamp || primaryStormDate)} | Source: Iowa Environmental Mesonet (IEM)`,
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
    // HISTORICAL STORM ACTIVITY (IHM format with direction/speed/duration/proximity columns)
    // =========================================================
    this.drawSectionBanner(doc, 'Historical Storm Activity');

    const histHeaders = ['Map Date*', 'Impact Time', 'Direction', 'Speed', 'Duration', 'At Location', 'Within 1mi', 'Within 3mi', 'Within 10mi'];
    const histWidths = [62, 70, 48, 38, 44, 58, 54, 54, 54];

    // Build historical rows from all events
    const allEvents = [
      ...filteredIhm.map(e => ({
        date: e.date, direction: e.stormDirection || 'N', speed: e.stormSpeed,
        duration: e.duration, size: e.hailSize, distance: e.distanceMiles, source: 'NEXRAD'
      })),
      ...filteredNoaa.filter(e => e.eventType === 'hail').map(e => ({
        date: e.date, direction: 'N', speed: undefined as number | undefined,
        duration: undefined as number | undefined, size: e.magnitude, distance: e.distanceMiles, source: 'NOAA'
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const histRows: string[][] = allEvents.map(e => {
      const sizeStr = e.size ? `${e.size.toFixed(2)}"` : '---';
      const dist = e.distance || 99;
      return [
        this.fmtDateET(e.date),
        this.fmtFullDateTimeET(e.date),
        e.direction || '---',
        e.speed ? e.speed.toFixed(1) : '---',
        e.duration ? e.duration.toFixed(1) : '---',
        dist <= 0.1 ? sizeStr : '---',
        dist <= 1 ? sizeStr : '---',
        dist <= 3 ? sizeStr : '---',
        dist <= 10 ? sizeStr : '---',
      ];
    });

    if (histRows.length > 0) {
      this.drawTable(doc, histHeaders, histRows, histWidths, {
        boldColumns: [0]
      });
    } else {
      doc.fontSize(9).fillColor(this.C.mutedText).font('Helvetica-Oblique')
         .text('No historical storm events found.', this.M, doc.y);
    }

    // Note about map dates
    doc.moveDown(0.3);
    doc.fontSize(7).fillColor(this.C.mutedText).font('Helvetica')
       .text('* Map dates begin at 6:00 a.m. CST on the indicated day and end at 6:00 a.m. CST the following day.', this.M, doc.y);

    // =========================================================
    // DISCLAIMER (matching IHM format)
    // =========================================================
    this.drawSectionBanner(doc, 'Disclaimer');

    doc.fontSize(8).fillColor(this.C.lightText).font('Helvetica')
       .text(
         'Roof-ER Storm Intelligence uses NEXRAD weather radar data and proprietary hail detection algorithms to ' +
         'generate the "Hail Impact" and "Historical Storm Activity" information included in this report. And while Roof-ER ' +
         'attempts to be as accurate as possible, Roof-ER makes no representations or warranties of any kind, including ' +
         'express or implied warranties, that the information on this report is accurate, complete, and / or free from ' +
         'defects. Roof-ER is not responsible for any use of this report or decisions based on the information contained in ' +
         'this report. This report does not constitute a professional roof inspection or engineering assessment. ' +
         'A licensed roofing contractor should perform a physical inspection to confirm the presence and extent of any storm damage.',
         this.M + 20, doc.y, { width: this.CW - 40, lineGap: 1.5, align: 'justify' }
       );

    // =========================================================
    // COPYRIGHT FOOTER
    // =========================================================
    doc.moveDown(1.5);
    const copyY = doc.y;
    doc.rect(0, copyY, this.PW, 25).fill(this.C.sectionBg);
    const year = new Date().getFullYear();
    doc.fontSize(10).fillColor(this.C.sectionText).font('Helvetica-Oblique')
       .text(`Copyright \u00A9 ${year} by ${companyName}`, this.M, copyY + 7, { width: this.CW, align: 'center' });

    // =========================================================
    // FINALIZE
    // =========================================================
    doc.end();
    return stream;
  }

  /**
   * Extract hail size from NWS warning description text.
   * Returns formatted string like '1.75"' or null.
   */
  private extractHailSizeFromText(text: string): string | null {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Decimal inch pattern: "1.75 inch", "0.75 inches"
    const inchMatch = lower.match(/(\d+\.?\d*)\s*inch/);
    if (inchMatch) return `${inchMatch[1]}"`;

    // Named sizes (common NWS descriptors)
    const namedSizes: Record<string, string> = {
      'softball': '4.50',
      'baseball': '2.75',
      'tennis ball': '2.50',
      'golf ball': '1.75',
      'ping pong': '1.50',
      'half dollar': '1.25',
      'quarter': '1.00',
      'nickel': '0.88',
      'dime': '0.75',
    };
    for (const [name, size] of Object.entries(namedSizes)) {
      if (lower.includes(name)) return `${size}"`;
    }

    return null;
  }

  /**
   * Extract wind speed from NWS warning description text.
   * Returns formatted string like '60 mph' or null.
   */
  private extractWindSpeedFromText(text: string): string | null {
    if (!text) return null;

    // Pattern: "60 mph", "60 to 70 mph"
    const mphMatch = text.match(/(\d+)\s*(?:to\s*\d+\s*)?mph/i);
    if (mphMatch) return `${mphMatch[1]} mph`;

    // Pattern: "winds up to 60", "wind 70"
    const windMatch = text.match(/winds?\s+(?:up\s+to\s+)?(\d+)/i);
    if (windMatch) return `${windMatch[1]} mph`;

    return null;
  }
}

export const pdfReportService = new PDFReportService();
