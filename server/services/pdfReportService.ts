/**
 * PDF Report Generation Service - Curran-Style Professional Storm Report
 *
 * Generates multi-page professional storm damage reports modeled after
 * the IHM Curran Hail Report format. Includes:
 * - Header with logo, report ID, verification
 * - Property info with embedded map image
 * - Hail impact details with narrative
 * - Ground observations tables (Hail + Wind)
 * - Severe weather warnings with NEXRAD radar image
 * - Historical storm activity table
 * - Disclaimer and footer
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
import { generateHailNarrative, generateExecutiveSummary } from './narrativeService.js';

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
}

export type ReportFilter = 'all' | 'hail-only' | 'hail-wind' | 'ihm-only' | 'noaa-only';

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
  filter?: ReportFilter;
  // New fields for enhanced report
  mapImage?: Buffer | null;
  nexradImage?: Buffer | null;
  nexradTimestamp?: string;
  nwsAlerts?: NWSAlert[];
  includeNexrad?: boolean;
  includeMap?: boolean;
  includeWarnings?: boolean;
  customerName?: string;
}

// ========== SERVICE CLASS ==========

export class PDFReportService {
  private readonly COLORS = {
    primary: '#1a365d',     // Dark navy
    accent: '#c53030',      // RoofER red
    secondary: '#4a5568',   // Slate gray
    text: '#1a202c',        // Near-black
    lightText: '#718096',   // Gray
    border: '#e2e8f0',      // Light border
    headerBg: '#1a365d',    // Navy header
    tableBg: '#f7fafc',     // Light table row
    tableHeader: '#2d3748', // Dark table header
    // Severity
    severe: '#e53e3e',
    moderate: '#dd6b20',
    minor: '#3182ce',
    // Event types
    hail: '#38a169',
    wind: '#805ad5',
    tornado: '#e53e3e',
    // Sources
    ihm: '#dd6b20',
    noaa: '#4c51bf',
  };

  private readonly MARGIN = 40;
  private readonly PAGE_WIDTH = 612;
  private readonly PAGE_HEIGHT = 792;
  private readonly CONTENT_WIDTH = 612 - 80; // PAGE_WIDTH - 2*MARGIN
  private readonly PAGE_BOTTOM = 740; // Leave room for footer

  /**
   * Format date in Eastern timezone with EDT/EST suffix
   */
  private formatDateET(dateStr: string, includeTime = false): string {
    try {
      const date = new Date(dateStr);
      // Determine EDT vs EST
      const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
      const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
      const isDST = date.getTimezoneOffset() < Math.max(jan, jul);
      const tzSuffix = isDST ? 'EDT' : 'EST';

      if (includeTime) {
        const formatted = date.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        return `${formatted} ${tzSuffix}`;
      }

      const formatted = date.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      return `${formatted} ${tzSuffix}`;
    } catch {
      return dateStr;
    }
  }

  /**
   * Generate the Curran-style report ID
   */
  private generateReportId(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const seq = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `RER-${dateStr}-${seq}`;
  }

  /**
   * Check if we need a new page, and if so, add one
   */
  private checkPageBreak(doc: any, requiredSpace: number): void {
    if (doc.y + requiredSpace > this.PAGE_BOTTOM) {
      doc.addPage();
      doc.y = this.MARGIN;
    }
  }

  /**
   * Draw page footer
   */
  private drawFooter(doc: any, reportId: string, pageNum: number, companyName: string): void {
    const footerY = this.PAGE_HEIGHT - 35;
    doc.save();
    doc.moveTo(this.MARGIN, footerY).lineTo(this.PAGE_WIDTH - this.MARGIN, footerY)
       .strokeColor(this.COLORS.border).lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor(this.COLORS.lightText).font('Helvetica')
       .text(`${companyName} | ${reportId} | Page ${pageNum}`, this.MARGIN, footerY + 5, {
         width: this.CONTENT_WIDTH,
         align: 'center'
       });
    doc.fontSize(6)
       .text('Data Sources: NOAA Storm Events Database | Interactive Hail Maps (IHM) | National Weather Service',
         this.MARGIN, footerY + 15, { width: this.CONTENT_WIDTH, align: 'center' });
    doc.restore();
  }

  /**
   * Draw a section header
   */
  private drawSectionHeader(doc: any, title: string): void {
    doc.moveDown(0.5);
    doc.moveTo(this.MARGIN, doc.y).lineTo(this.PAGE_WIDTH - this.MARGIN, doc.y)
       .strokeColor(this.COLORS.accent).lineWidth(1).stroke();
    doc.moveDown(0.4);
    doc.fontSize(13).fillColor(this.COLORS.primary).font('Helvetica-Bold').text(title);
    doc.moveDown(0.3);
  }

  /**
   * Draw a data table
   */
  private drawTable(
    doc: any,
    headers: string[],
    rows: string[][],
    colWidths: number[],
    options: {
      headerColor?: string;
      colorColumns?: Record<number, (value: string) => string>;
      boldColumns?: number[];
    } = {}
  ): void {
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const rowHeight = 16;
    const headerHeight = 18;
    const headerColor = options.headerColor || this.COLORS.tableHeader;
    let tableY = doc.y;

    const drawHeader = () => {
      doc.rect(this.MARGIN, tableY, tableWidth, headerHeight).fill(headerColor);
      let x = this.MARGIN;
      headers.forEach((h, i) => {
        doc.fontSize(7.5).fillColor('#ffffff').font('Helvetica-Bold')
           .text(h, x + 3, tableY + 5, { width: colWidths[i] - 6 });
        x += colWidths[i];
      });
      tableY += headerHeight;
    };

    drawHeader();

    rows.forEach((row, idx) => {
      if (tableY + rowHeight > this.PAGE_BOTTOM) {
        doc.addPage();
        tableY = this.MARGIN;
        drawHeader();
      }

      // Alternate row background
      if (idx % 2 === 0) {
        doc.rect(this.MARGIN, tableY, tableWidth, rowHeight).fill(this.COLORS.tableBg);
      }
      doc.rect(this.MARGIN, tableY, tableWidth, rowHeight).strokeColor(this.COLORS.border).lineWidth(0.3).stroke();

      let x = this.MARGIN;
      row.forEach((cell, i) => {
        let color = this.COLORS.text;
        let font = 'Helvetica';

        if (options.colorColumns && options.colorColumns[i]) {
          color = options.colorColumns[i](cell);
        }
        if (options.boldColumns && options.boldColumns.includes(i)) {
          font = 'Helvetica-Bold';
        }

        doc.fontSize(7.5).fillColor(color).font(font)
           .text(cell, x + 3, tableY + 4, { width: colWidths[i] - 6 });
        x += colWidths[i];
      });
      tableY += rowHeight;
    });

    doc.y = tableY + 10;
  }

  /**
   * Generate the full Curran-style PDF report
   */
  generateReport(input: ReportInput): PassThrough {
    const companyName = input.companyName || 'Roof-ER Storm Intelligence';
    const reportId = this.generateReportId();
    let pageNum = 1;

    const doc = new PDFDocument({
      size: 'LETTER',
      margin: this.MARGIN,
      info: {
        Title: `Storm Damage Report - ${input.address}`,
        Author: companyName,
        Subject: `Storm History for ${input.address}`,
        Creator: 'Roof-ER Storm Intelligence System',
      },
    });

    const stream = new PassThrough();
    doc.pipe(stream);

    // Compute stats
    const allHailSizes = [
      ...input.events.map(e => e.hailSize || 0),
      ...input.noaaEvents.filter(e => e.eventType === 'hail').map(e => e.magnitude || 0)
    ].filter(s => s > 0);
    const maxHail = allHailSizes.length > 0 ? Math.max(...allHailSizes) : 0;
    const severeCount = allHailSizes.filter(s => s >= 1.5).length;
    const windEvents = input.noaaEvents.filter(e => e.eventType === 'wind');
    const hailEvents = [
      ...input.events.map(e => ({
        date: e.date,
        size: e.hailSize,
        source: 'IHM' as const,
        distance: e.distanceMiles,
        location: '',
      })),
      ...input.noaaEvents.filter(e => e.eventType === 'hail').map(e => ({
        date: e.date,
        size: e.magnitude,
        source: 'NOAA' as const,
        distance: e.distanceMiles,
        location: e.location,
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Most recent/significant storm date
    const primaryStormDate = hailEvents.length > 0 ? hailEvents[0].date :
      (input.noaaEvents.length > 0 ? input.noaaEvents[0].date : new Date().toISOString());

    // =========================================================
    // PAGE 1: HEADER, PROPERTY INFO, DAMAGE SCORE
    // =========================================================

    // === HEADER BAR ===
    const headerHeight = 55;
    doc.rect(0, 0, this.PAGE_WIDTH, headerHeight).fill(this.COLORS.headerBg);

    // Try to load logo
    try {
      const logoPath = path.resolve(__dirname, '../../public/roofer-logo-icon.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, this.MARGIN, 8, { height: 38 });
      }
    } catch {
      // Logo not available, continue without it
    }

    // Report title
    doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
       .text('STORM DAMAGE REPORT', this.MARGIN + 55, 12, { width: 350 });
    doc.fontSize(9).fillColor('#cbd5e0').font('Helvetica')
       .text(companyName, this.MARGIN + 55, 34);

    // Report ID / Date (right side)
    doc.fontSize(8).fillColor('#cbd5e0').font('Helvetica')
       .text(`Report #: ${reportId}`, this.PAGE_WIDTH - this.MARGIN - 150, 12, { width: 150, align: 'right' });
    doc.text(`Generated: ${this.formatDateET(new Date().toISOString(), true)}`, this.PAGE_WIDTH - this.MARGIN - 150, 24, { width: 150, align: 'right' });

    // Verification badge
    doc.fontSize(7).fillColor('#68d391').font('Helvetica-Bold')
       .text('VERIFIED DATA REPORT', this.PAGE_WIDTH - this.MARGIN - 150, 38, { width: 150, align: 'right' });

    doc.y = headerHeight + 15;

    // === REP INFO (if provided) ===
    if (input.repName || input.repPhone || input.repEmail) {
      const repBoxY = doc.y;
      doc.rect(this.MARGIN, repBoxY, this.CONTENT_WIDTH, 22).fill('#f7fafc');
      doc.rect(this.MARGIN, repBoxY, this.CONTENT_WIDTH, 22).strokeColor(this.COLORS.border).lineWidth(0.5).stroke();
      doc.fontSize(8).fillColor(this.COLORS.text).font('Helvetica-Bold')
         .text('Your Storm Specialist: ', this.MARGIN + 8, repBoxY + 7, { continued: true });
      doc.font('Helvetica');
      const repParts = [input.repName, input.repPhone, input.repEmail].filter(Boolean);
      doc.text(repParts.join('  |  '));
      doc.y = repBoxY + 28;
    }

    // === PROPERTY INFORMATION ===
    this.drawSectionHeader(doc, 'PROPERTY INFORMATION');

    // Two-column layout: text left, map right
    const infoStartY = doc.y;
    const infoColWidth = input.mapImage ? this.CONTENT_WIDTH * 0.55 : this.CONTENT_WIDTH;

    doc.fontSize(10).fillColor(this.COLORS.text).font('Helvetica');

    if (input.customerName) {
      doc.font('Helvetica-Bold').text('Customer: ', this.MARGIN, doc.y, { continued: true });
      doc.font('Helvetica').text(input.customerName);
    }
    doc.font('Helvetica-Bold').text('Address: ', this.MARGIN, doc.y, { continued: true });
    doc.font('Helvetica').text(input.address, { width: infoColWidth - 10 });
    doc.font('Helvetica-Bold').text('Coordinates: ', { continued: true });
    doc.font('Helvetica').text(`${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}`);
    doc.font('Helvetica-Bold').text('Search Radius: ', { continued: true });
    doc.font('Helvetica').text(`${input.radius} miles`);
    doc.font('Helvetica-Bold').text('Report Date: ', { continued: true });
    doc.font('Helvetica').text(this.formatDateET(new Date().toISOString(), true));

    // Map image (right column)
    if (input.mapImage) {
      try {
        const mapX = this.MARGIN + this.CONTENT_WIDTH * 0.58;
        const mapWidth = this.CONTENT_WIDTH * 0.40;
        const mapHeight = 120;
        doc.image(input.mapImage, mapX, infoStartY, {
          width: mapWidth,
          height: mapHeight,
          fit: [mapWidth, mapHeight]
        });
        // Border around map
        doc.rect(mapX, infoStartY, mapWidth, mapHeight).strokeColor(this.COLORS.border).lineWidth(1).stroke();
        doc.fontSize(6).fillColor(this.COLORS.lightText).font('Helvetica')
           .text('Property Location', mapX, infoStartY + mapHeight + 2, { width: mapWidth, align: 'center' });

        // Make sure Y position accounts for map
        if (doc.y < infoStartY + mapHeight + 15) {
          doc.y = infoStartY + mapHeight + 15;
        }
      } catch (e) {
        console.warn('Failed to embed map image in PDF:', e);
      }
    }

    // === DAMAGE RISK SCORE ===
    this.checkPageBreak(doc, 100);
    doc.moveDown(0.5);

    const scoreY = doc.y;
    const scoreBoxH = 75;
    const scoreColor = input.damageScore.color || this.COLORS.accent;

    // Score background
    doc.rect(this.MARGIN, scoreY, this.CONTENT_WIDTH, scoreBoxH)
       .fillOpacity(0.06).fill(scoreColor).fillOpacity(1);
    doc.rect(this.MARGIN, scoreY, this.CONTENT_WIDTH, scoreBoxH)
       .strokeColor(scoreColor).lineWidth(2).stroke();

    // Left: big score number
    doc.fontSize(40).fillColor(scoreColor).font('Helvetica-Bold')
       .text(input.damageScore.score.toString(), this.MARGIN + 15, scoreY + 8, { width: 75 });
    doc.fontSize(8).fillColor(this.COLORS.lightText).font('Helvetica')
       .text('/ 100', this.MARGIN + 15, scoreY + 52, { width: 75 });

    // Right: risk level and summary
    doc.fontSize(14).fillColor(scoreColor).font('Helvetica-Bold')
       .text(`${input.damageScore.riskLevel.toUpperCase()} RISK`, this.MARGIN + 100, scoreY + 10);
    doc.fontSize(8.5).fillColor(this.COLORS.text).font('Helvetica')
       .text(input.damageScore.summary, this.MARGIN + 100, scoreY + 30, {
         width: this.CONTENT_WIDTH - 120
       });

    doc.y = scoreY + scoreBoxH + 10;

    // === EXECUTIVE SUMMARY ===
    this.checkPageBreak(doc, 80);
    this.drawSectionHeader(doc, 'EXECUTIVE SUMMARY');

    const execSummary = generateExecutiveSummary({
      address: input.address,
      city: input.city,
      state: input.state,
      stormDate: primaryStormDate,
      maxHailSize: maxHail,
      totalEvents: input.events.length + input.noaaEvents.length,
      severeCount,
      radiusMiles: input.radius
    });

    doc.fontSize(9.5).fillColor(this.COLORS.text).font('Helvetica')
       .text(execSummary, { width: this.CONTENT_WIDTH });
    doc.moveDown(0.3);

    // Quick stats row
    const statsY = doc.y;
    const statWidth = this.CONTENT_WIDTH / 4;
    const stats = [
      { label: 'Total Events', value: (input.events.length + input.noaaEvents.length).toString() },
      { label: 'Max Hail Size', value: maxHail > 0 ? `${maxHail.toFixed(2)}"` : 'N/A' },
      { label: 'Severe (1.5"+)', value: severeCount.toString() },
      { label: 'Wind Events', value: windEvents.length.toString() }
    ];

    stats.forEach((stat, i) => {
      const x = this.MARGIN + i * statWidth;
      doc.rect(x, statsY, statWidth - 4, 30).fill(this.COLORS.tableBg);
      doc.rect(x, statsY, statWidth - 4, 30).strokeColor(this.COLORS.border).lineWidth(0.3).stroke();
      doc.fontSize(14).fillColor(this.COLORS.primary).font('Helvetica-Bold')
         .text(stat.value, x, statsY + 4, { width: statWidth - 4, align: 'center' });
      doc.fontSize(7).fillColor(this.COLORS.lightText).font('Helvetica')
         .text(stat.label, x, statsY + 20, { width: statWidth - 4, align: 'center' });
    });

    doc.y = statsY + 38;

    this.drawFooter(doc, reportId, pageNum, companyName);

    // =========================================================
    // PAGE 2: HAIL IMPACT DETAILS + NARRATIVE
    // =========================================================
    doc.addPage();
    pageNum++;
    doc.y = this.MARGIN;

    this.drawSectionHeader(doc, 'HAIL IMPACT DETAILS');

    // Impact details box
    if (hailEvents.length > 0) {
      const topEvent = hailEvents[0];
      const detailBoxY = doc.y;
      const detailBoxH = 85;

      doc.rect(this.MARGIN, detailBoxY, this.CONTENT_WIDTH, detailBoxH)
         .fill(this.COLORS.tableBg);
      doc.rect(this.MARGIN, detailBoxY, this.CONTENT_WIDTH, detailBoxH)
         .strokeColor(this.COLORS.border).lineWidth(0.5).stroke();

      const col1X = this.MARGIN + 10;
      const col2X = this.MARGIN + this.CONTENT_WIDTH / 2 + 10;
      let dy = detailBoxY + 8;

      const drawDetailRow = (label: string, value: string, x: number, y: number) => {
        doc.fontSize(8).fillColor(this.COLORS.lightText).font('Helvetica-Bold')
           .text(label, x, y);
        doc.fontSize(9).fillColor(this.COLORS.text).font('Helvetica')
           .text(value, x + 100, y);
      };

      drawDetailRow('Primary Event Date:', this.formatDateET(topEvent.date, true), col1X, dy);
      drawDetailRow('Max Hail Detected:', maxHail > 0 ? `${maxHail.toFixed(2)}"` : 'N/A', col2X, dy);
      dy += 16;
      drawDetailRow('Total Hail Reports:', hailEvents.length.toString(), col1X, dy);
      drawDetailRow('Nearby Reports (<1mi):', hailEvents.filter(e => (e.distance || 99) < 1).length.toString(), col2X, dy);
      dy += 16;
      drawDetailRow('Severe Events:', severeCount.toString(), col1X, dy);
      drawDetailRow('Wind Reports:', windEvents.length.toString(), col2X, dy);
      dy += 16;
      drawDetailRow('Search Radius:', `${input.radius} miles`, col1X, dy);
      drawDetailRow('Data Sources:', 'IHM + NOAA', col2X, dy);

      doc.y = detailBoxY + detailBoxH + 10;
    }

    // Hail Impact Narrative
    this.checkPageBreak(doc, 100);
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor(this.COLORS.primary).font('Helvetica-Bold')
       .text('Hail Impact Narrative');
    doc.moveDown(0.2);

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
      radiusMiles: input.radius
    });

    doc.fontSize(9.5).fillColor(this.COLORS.text).font('Helvetica')
       .text(narrative, { width: this.CONTENT_WIDTH, lineGap: 2 });

    // =========================================================
    // PAGE 3: GROUND OBSERVATIONS TABLES
    // =========================================================
    this.checkPageBreak(doc, 60);
    this.drawSectionHeader(doc, 'GROUND OBSERVATIONS - HAIL');

    // Apply filter
    const filter = input.filter || 'all';
    let filteredIhm = input.events;
    let filteredNoaa = input.noaaEvents;

    switch (filter) {
      case 'hail-only':
        filteredNoaa = input.noaaEvents.filter(e => e.eventType === 'hail');
        break;
      case 'hail-wind':
        filteredNoaa = input.noaaEvents.filter(e => e.eventType === 'hail' || e.eventType === 'wind');
        break;
      case 'ihm-only':
        filteredNoaa = [];
        break;
      case 'noaa-only':
        filteredIhm = [];
        break;
    }

    // Hail observations table
    const hailObsHeaders = ['Date/Time (ET)', 'Source', 'Hail Size', 'Distance', 'Impact Level'];
    const hailObsWidths = [120, 60, 70, 65, 80];

    const hailObsRows: string[][] = [];
    filteredIhm.forEach(e => {
      hailObsRows.push([
        this.formatDateET(e.date),
        'IHM',
        e.hailSize ? `${e.hailSize.toFixed(2)}"` : '-',
        e.distanceMiles ? `${e.distanceMiles.toFixed(1)} mi` : '-',
        this.getImpactLabel(e.severity)
      ]);
    });
    filteredNoaa.filter(e => e.eventType === 'hail').forEach(e => {
      hailObsRows.push([
        this.formatDateET(e.date),
        'NOAA',
        e.magnitude ? `${e.magnitude.toFixed(2)}"` : '-',
        e.distanceMiles ? `${e.distanceMiles.toFixed(1)} mi` : '-',
        this.getImpactLabel(this.getSeverityFromMagnitude(e.magnitude, 'hail'))
      ]);
    });

    // Sort by date descending
    hailObsRows.sort((a, b) => {
      const dateA = new Date(a[0].replace(/ E[DS]T$/, '')).getTime();
      const dateB = new Date(b[0].replace(/ E[DS]T$/, '')).getTime();
      return dateB - dateA;
    });

    if (hailObsRows.length > 0) {
      this.drawTable(doc, hailObsHeaders, hailObsRows, hailObsWidths, {
        colorColumns: {
          4: (val) => val === 'MAJOR' ? this.COLORS.severe : val === 'SIGNIFICANT' ? this.COLORS.moderate : this.COLORS.minor,
          1: (val) => val === 'IHM' ? this.COLORS.ihm : this.COLORS.noaa
        },
        boldColumns: [1, 4]
      });
    } else {
      doc.fontSize(9).fillColor(this.COLORS.lightText).font('Helvetica-Oblique')
         .text('No hail observations found for the selected criteria.');
      doc.moveDown(0.5);
    }

    // Wind observations table
    const windObsNoaa = filteredNoaa.filter(e => e.eventType === 'wind');
    if (windObsNoaa.length > 0 || filter === 'all' || filter === 'hail-wind') {
      this.checkPageBreak(doc, 60);
      this.drawSectionHeader(doc, 'GROUND OBSERVATIONS - WIND');

      const windHeaders = ['Date/Time (ET)', 'Source', 'Wind Speed', 'Distance', 'Location'];
      const windWidths = [120, 60, 70, 65, 80];

      const windRows: string[][] = windObsNoaa.map(e => [
        this.formatDateET(e.date),
        'NOAA',
        e.magnitude ? `${Math.round(e.magnitude)} kts` : '-',
        e.distanceMiles ? `${e.distanceMiles.toFixed(1)} mi` : '-',
        e.location || '-'
      ]);

      if (windRows.length > 0) {
        this.drawTable(doc, windHeaders, windRows, windWidths, {
          colorColumns: {
            1: () => this.COLORS.noaa
          },
          boldColumns: [1]
        });
      } else {
        doc.fontSize(9).fillColor(this.COLORS.lightText).font('Helvetica-Oblique')
           .text('No wind observations found for the selected criteria.');
        doc.moveDown(0.5);
      }
    }

    this.drawFooter(doc, reportId, pageNum, companyName);

    // =========================================================
    // PAGE 4: SEVERE WEATHER WARNINGS + NEXRAD (conditional)
    // =========================================================
    const hasWarnings = input.nwsAlerts && input.nwsAlerts.length > 0;
    const hasNexrad = input.nexradImage && input.includeNexrad !== false;

    if (hasWarnings || hasNexrad) {
      doc.addPage();
      pageNum++;
      doc.y = this.MARGIN;

      this.drawSectionHeader(doc, 'SEVERE WEATHER WARNINGS & RADAR');

      // NEXRAD radar image
      if (hasNexrad && input.nexradImage) {
        try {
          const radarWidth = Math.min(this.CONTENT_WIDTH, 400);
          const radarHeight = 250;
          const radarX = this.MARGIN + (this.CONTENT_WIDTH - radarWidth) / 2;

          doc.image(input.nexradImage, radarX, doc.y, {
            width: radarWidth,
            height: radarHeight,
            fit: [radarWidth, radarHeight]
          });
          doc.rect(radarX, doc.y, radarWidth, radarHeight).strokeColor(this.COLORS.border).lineWidth(1).stroke();

          doc.y += radarHeight + 4;
          doc.fontSize(7).fillColor(this.COLORS.lightText).font('Helvetica-Oblique')
             .text(
               `NEXRAD Base Reflectivity | ${input.nexradTimestamp ? this.formatDateET(input.nexradTimestamp, true) : 'Historical'} | Source: Iowa Environmental Mesonet (IEM)`,
               this.MARGIN,
               doc.y,
               { width: this.CONTENT_WIDTH, align: 'center' }
             );
          doc.moveDown(1);
        } catch (e) {
          console.warn('Failed to embed NEXRAD image:', e);
        }
      }

      // NWS Warning boxes
      if (hasWarnings && input.nwsAlerts) {
        input.nwsAlerts.slice(0, 5).forEach(alert => {
          this.checkPageBreak(doc, 80);

          const alertY = doc.y;
          const isTornado = alert.event.toLowerCase().includes('tornado');
          const alertColor = isTornado ? this.COLORS.severe : this.COLORS.moderate;

          // Alert header bar
          doc.rect(this.MARGIN, alertY, this.CONTENT_WIDTH, 18).fill(alertColor);
          doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold')
             .text(alert.event.toUpperCase(), this.MARGIN + 6, alertY + 5, { width: this.CONTENT_WIDTH - 12 });

          // Alert body
          const bodyY = alertY + 18;
          doc.rect(this.MARGIN, bodyY, this.CONTENT_WIDTH, 50)
             .fillOpacity(0.03).fill(alertColor).fillOpacity(1);
          doc.rect(this.MARGIN, bodyY, this.CONTENT_WIDTH, 50)
             .strokeColor(this.COLORS.border).lineWidth(0.3).stroke();

          doc.fontSize(7.5).fillColor(this.COLORS.text).font('Helvetica-Bold')
             .text(`Effective: `, this.MARGIN + 6, bodyY + 5, { continued: true });
          doc.font('Helvetica')
             .text(`${this.formatDateET(alert.onset, true)}  →  ${this.formatDateET(alert.expires, true)}`);

          doc.fontSize(7.5).font('Helvetica-Bold')
             .text(`Issued by: `, this.MARGIN + 6, bodyY + 16, { continued: true });
          doc.font('Helvetica').text(alert.senderName);

          // Truncate description
          const descText = alert.headline || alert.description.substring(0, 200);
          doc.fontSize(7).fillColor(this.COLORS.secondary).font('Helvetica-Oblique')
             .text(descText, this.MARGIN + 6, bodyY + 28, {
               width: this.CONTENT_WIDTH - 12,
               height: 18,
               ellipsis: true
             });

          doc.y = bodyY + 55;
        });
      }

      this.drawFooter(doc, reportId, pageNum, companyName);
    }

    // =========================================================
    // PAGE 5: HISTORICAL STORM ACTIVITY TABLE
    // =========================================================
    doc.addPage();
    pageNum++;
    doc.y = this.MARGIN;

    this.drawSectionHeader(doc, 'HISTORICAL STORM ACTIVITY');

    // Combined event timeline table
    const timelineHeaders = ['Date (ET)', 'Type', 'Magnitude', 'Impact', 'Source', 'Distance'];
    const timelineWidths = [100, 55, 65, 70, 50, 55];

    const sortedEvents = this.combineAndSortEvents(filteredIhm, filteredNoaa);
    const timelineRows: string[][] = sortedEvents.map(e => this.formatEventRow(e));

    if (timelineRows.length > 0) {
      this.drawTable(doc, timelineHeaders, timelineRows, timelineWidths, {
        colorColumns: {
          1: (val) => this.getEventTypeColor(val),
          3: (val) => val === 'MAJOR' ? this.COLORS.severe : val === 'SIGNIFICANT' ? this.COLORS.moderate : this.COLORS.minor,
          4: (val) => val === 'IHM' ? this.COLORS.ihm : this.COLORS.noaa
        },
        boldColumns: [1, 3, 4]
      });
    } else {
      doc.fontSize(9).fillColor(this.COLORS.lightText).font('Helvetica-Oblique')
         .text('No storm events found matching the selected filter.');
    }

    // Filter note
    if (filter !== 'all') {
      doc.fontSize(7).fillColor(this.COLORS.lightText).font('Helvetica-Oblique')
         .text(`Filter: ${this.getFilterLabel(filter)} (${sortedEvents.length} of ${input.events.length + input.noaaEvents.length} total events)`);
    }

    this.drawFooter(doc, reportId, pageNum, companyName);

    // =========================================================
    // FINAL PAGE: EVIDENCE, DISCLAIMER, FOOTER
    // =========================================================
    doc.addPage();
    pageNum++;
    doc.y = this.MARGIN;

    this.drawSectionHeader(doc, 'EVIDENCE FOR INSURANCE CLAIMS');

    doc.fontSize(9.5).fillColor(this.COLORS.text).font('Helvetica')
       .text('This report contains official storm event data from certified and verified sources:');
    doc.moveDown(0.3);

    doc.fontSize(9).font('Helvetica-Bold').text('NOAA Storm Events Database', { continued: true });
    doc.font('Helvetica').text(' - Official U.S. government record of severe weather events, maintained by the National Oceanic and Atmospheric Administration. Data is collected from NWS forecast offices and is legally admissible.');
    doc.moveDown(0.2);

    doc.font('Helvetica-Bold').text('Interactive Hail Maps (IHM)', { continued: true });
    doc.font('Helvetica').text(' - Professional storm tracking platform combining radar analysis with ground-verified reports from certified storm spotters, insurance adjusters, and meteorologists.');
    doc.moveDown(0.2);

    if (hasNexrad) {
      doc.font('Helvetica-Bold').text('NEXRAD Radar', { continued: true });
      doc.font('Helvetica').text(' - NOAA Next-Generation Radar network imagery via Iowa Environmental Mesonet. Shows base reflectivity at the time of storm events.');
      doc.moveDown(0.2);
    }

    if (hasWarnings) {
      doc.font('Helvetica-Bold').text('NWS Severe Weather Warnings', { continued: true });
      doc.font('Helvetica').text(' - Official severe weather warnings issued by National Weather Service offices, documenting government-recognized severe weather activity in the area.');
      doc.moveDown(0.2);
    }

    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Bold').text('This report may be used as supporting documentation for:');
    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica');
    ['Insurance claims for storm damage',
     'Property inspection reports and assessments',
     'Real estate disclosure requirements',
     'Risk assessment and mitigation planning',
     'Contractor scope of work documentation'
    ].forEach(item => {
      doc.text(`  \u2022  ${item}`);
    });

    // Disclaimer
    doc.moveDown(1);
    const disclaimerY = doc.y;
    doc.rect(this.MARGIN, disclaimerY, this.CONTENT_WIDTH, 60)
       .fillOpacity(0.04).fill('#000').fillOpacity(1);
    doc.rect(this.MARGIN, disclaimerY, this.CONTENT_WIDTH, 60)
       .strokeColor(this.COLORS.border).lineWidth(0.5).stroke();

    doc.fontSize(8).fillColor(this.COLORS.secondary).font('Helvetica-Bold')
       .text('DISCLAIMER', this.MARGIN + 10, disclaimerY + 6);
    doc.fontSize(7).fillColor(this.COLORS.lightText).font('Helvetica')
       .text(
         'This report is provided for informational purposes only and is based on historical weather data records. ' +
         'It does not constitute a professional roof inspection, engineering assessment, or guarantee of property damage. ' +
         'Storm data is based on publicly available records and may not capture all weather events that affected the subject property. ' +
         'A licensed roofing contractor should perform a physical inspection to confirm the presence and extent of any storm damage. ' +
         'The generating party makes no warranty, express or implied, regarding the completeness or accuracy of this data.',
         this.MARGIN + 10, disclaimerY + 17, { width: this.CONTENT_WIDTH - 20, lineGap: 1 }
       );

    // Rep contact at bottom
    if (input.repName || input.repPhone || input.repEmail) {
      doc.moveDown(1.5);
      doc.fontSize(9).fillColor(this.COLORS.text).font('Helvetica-Bold')
         .text('For questions about this report, contact:');
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica');
      if (input.repName) doc.text(`  ${input.repName}`);
      if (input.repPhone) doc.text(`  ${input.repPhone}`);
      if (input.repEmail) doc.text(`  ${input.repEmail}`);
    }

    this.drawFooter(doc, reportId, pageNum, companyName);

    // =========================================================
    // FINALIZE
    // =========================================================
    doc.end();
    return stream;
  }

  // ========== HELPER METHODS ==========

  private combineAndSortEvents(events: HailEvent[], noaaEvents: NOAAEvent[]): Array<{
    date: string;
    type: string;
    size: number | null;
    severity: 'minor' | 'moderate' | 'severe';
    source: string;
    distance?: number;
  }> {
    const ihmEvents = events.map(e => ({
      date: e.date,
      type: 'Hail',
      size: e.hailSize,
      severity: e.severity,
      source: 'IHM' as const,
      distance: e.distanceMiles,
    }));

    const noaaFormatted = noaaEvents.map(e => ({
      date: e.date,
      type: e.eventType.charAt(0).toUpperCase() + e.eventType.slice(1),
      size: e.magnitude,
      severity: this.getSeverityFromMagnitude(e.magnitude, e.eventType),
      source: 'NOAA' as const,
      distance: e.distanceMiles,
    }));

    // Sort all by date descending
    return [...ihmEvents, ...noaaFormatted].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  private formatEventRow(event: { date: string; type: string; size: number | null; severity: string; source: string; distance?: number }): string[] {
    const dateStr = this.formatDateET(event.date);

    let sizeStr = '-';
    if (event.size) {
      if (event.type.toLowerCase() === 'wind') {
        sizeStr = `${Math.round(event.size)} kts`;
      } else {
        sizeStr = `${event.size.toFixed(2)}"`;
      }
    }

    const distStr = event.distance ? `${event.distance.toFixed(1)} mi` : '-';
    const impactLabel = this.getImpactLabel(event.severity);

    return [dateStr, event.type, sizeStr, impactLabel, event.source, distStr];
  }

  private getSeverityFromMagnitude(magnitude: number | null, eventType: string): 'minor' | 'moderate' | 'severe' {
    if (eventType === 'wind') return 'moderate';
    if (eventType === 'tornado') return 'severe';
    if (!magnitude) return 'minor';
    if (magnitude >= 1.5) return 'severe';
    if (magnitude >= 1.0) return 'moderate';
    return 'minor';
  }

  private getImpactLabel(severity: string): string {
    switch (severity) {
      case 'severe': return 'MAJOR';
      case 'moderate': return 'SIGNIFICANT';
      default: return 'DOCUMENTED';
    }
  }

  private getEventTypeColor(type: string): string {
    switch (type.toLowerCase()) {
      case 'hail': return this.COLORS.hail;
      case 'wind': return this.COLORS.wind;
      case 'tornado': return this.COLORS.tornado;
      default: return this.COLORS.text;
    }
  }

  private getFilterLabel(filter: ReportFilter): string {
    switch (filter) {
      case 'hail-only': return 'Hail Events Only';
      case 'hail-wind': return 'Hail & Wind Events';
      case 'ihm-only': return 'IHM Data Only';
      case 'noaa-only': return 'NOAA Data Only';
      default: return 'All Events';
    }
  }
}

export const pdfReportService = new PDFReportService();
