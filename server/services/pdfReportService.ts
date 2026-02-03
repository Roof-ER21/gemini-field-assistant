/**
 * PDF Report Generation Service
 *
 * Generates professional storm damage history reports for insurance claims
 * Superior to HailTrace - includes more data, better design, and NOAA certification
 */

import * as PDFKit from 'pdfkit';
import { PassThrough } from 'stream';
import type { DamageScoreResult } from './damageScoreService.js';

// PDFKit default export
const PDFDocument = (PDFKit as any).default || PDFKit;

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

interface ReportInput {
  address: string;
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
}

export class PDFReportService {
  private readonly COLORS = {
    primary: '#1e3a8a',
    secondary: '#475569',
    critical: '#dc2626',
    high: '#f97316',
    moderate: '#eab308',
    low: '#22c55e',
    text: '#1e293b',
    lightText: '#64748b',
    border: '#e2e8f0',
  };

  private readonly MARGIN = 40;

  /**
   * Generate PDF report and return as stream
   */
  generateReport(input: ReportInput): PassThrough {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: this.MARGIN,
      info: {
        Title: 'Storm Damage History Report',
        Author: input.companyName || 'SA21 Storm Intelligence',
        Subject: `Storm History for ${input.address}`,
      },
    });

    const stream = new PassThrough();
    doc.pipe(stream);

    const reportId = this.generateReportId();
    const pageWidth = 612 - (this.MARGIN * 2);

    // === PAGE 1: Header, Property Info, Damage Score, Summary ===

    // Header
    doc.fontSize(20).fillColor(this.COLORS.primary).font('Helvetica-Bold')
       .text('STORM DAMAGE HISTORY REPORT', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor(this.COLORS.lightText).font('Helvetica')
       .text(`Report ID: ${reportId} | Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });

    // Divider
    doc.moveDown(0.5);
    doc.moveTo(this.MARGIN, doc.y).lineTo(612 - this.MARGIN, doc.y).stroke(this.COLORS.primary);
    doc.moveDown(0.8);

    // Property Information
    doc.fontSize(12).fillColor(this.COLORS.primary).font('Helvetica-Bold').text('PROPERTY INFORMATION');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor(this.COLORS.text).font('Helvetica');
    doc.text(`Address: ${input.address}`);
    doc.text(`Coordinates: ${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}`);
    doc.text(`Search Radius: ${input.radius} miles`);
    doc.moveDown(0.8);

    // Damage Score Box
    const scoreY = doc.y;
    const scoreBoxHeight = 80;

    // Background
    doc.rect(this.MARGIN, scoreY, pageWidth, scoreBoxHeight)
       .fillOpacity(0.08).fill(input.damageScore.color).fillOpacity(1);
    doc.rect(this.MARGIN, scoreY, pageWidth, scoreBoxHeight)
       .strokeColor(input.damageScore.color).lineWidth(2).stroke();

    // Score number
    doc.fontSize(42).fillColor(input.damageScore.color).font('Helvetica-Bold')
       .text(input.damageScore.score.toString(), this.MARGIN + 20, scoreY + 15, { width: 80 });

    // Risk level
    doc.fontSize(16).fillColor(input.damageScore.color).font('Helvetica-Bold')
       .text(input.damageScore.riskLevel.toUpperCase() + ' RISK', this.MARGIN + 110, scoreY + 20);

    // Summary
    doc.fontSize(9).fillColor(this.COLORS.text).font('Helvetica')
       .text(input.damageScore.summary, this.MARGIN + 110, scoreY + 45, { width: pageWidth - 130 });

    doc.y = scoreY + scoreBoxHeight + 15;

    // Executive Summary
    doc.fontSize(12).fillColor(this.COLORS.primary).font('Helvetica-Bold').text('EXECUTIVE SUMMARY');
    doc.moveDown(0.3);

    const allEvents = [...input.events, ...input.noaaEvents];
    const hailSizes = [
      ...input.events.map(e => e.hailSize || 0),
      ...input.noaaEvents.filter(e => e.eventType === 'hail').map(e => e.magnitude || 0)
    ].filter(s => s > 0);
    const maxHail = hailSizes.length > 0 ? Math.max(...hailSizes) : 0;
    const severeCount = hailSizes.filter(s => s >= 1.5).length;

    doc.fontSize(10).fillColor(this.COLORS.text).font('Helvetica');
    doc.text(`• Total Storm Events: ${allEvents.length}`);
    doc.text(`• Largest Hail Size: ${maxHail > 0 ? maxHail.toFixed(1) + '"' : 'None recorded'}`);
    doc.text(`• Severe Events (1.5"+): ${severeCount}`);
    doc.text(`• Data Sources: NOAA Storm Events Database, Interactive Hail Maps (IHM)`);
    doc.moveDown(0.8);

    // Storm Event Timeline
    doc.fontSize(12).fillColor(this.COLORS.primary).font('Helvetica-Bold').text('STORM EVENT TIMELINE');
    doc.moveDown(0.3);

    if (allEvents.length === 0) {
      doc.fontSize(10).fillColor(this.COLORS.lightText).font('Helvetica-Oblique')
         .text('No storm events found in the specified search area.');
    } else {
      // Sort events by date descending
      const sortedEvents = this.combineAndSortEvents(input.events, input.noaaEvents);

      // Table header
      const colWidths = [85, 55, 75, 70, 55, 55];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      let tableY = doc.y;

      doc.rect(this.MARGIN, tableY, tableWidth, 18).fill(this.COLORS.primary);
      const headers = ['Date', 'Type', 'Size', 'Severity', 'Source', 'Distance'];
      let x = this.MARGIN;
      headers.forEach((h, i) => {
        doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold')
           .text(h, x + 3, tableY + 5, { width: colWidths[i] - 6 });
        x += colWidths[i];
      });
      tableY += 18;

      // Table rows (limit to fit on page)
      const maxRows = Math.min(sortedEvents.length, 12);
      sortedEvents.slice(0, maxRows).forEach((event, idx) => {
        // Alternate row colors
        if (idx % 2 === 0) {
          doc.rect(this.MARGIN, tableY, tableWidth, 16).fill('#f8fafc');
        }
        doc.rect(this.MARGIN, tableY, tableWidth, 16).stroke(this.COLORS.border);

        const row = this.formatEventRow(event);
        x = this.MARGIN;
        row.forEach((cell, i) => {
          const color = i === 3 ? this.getSeverityColor(event.severity) : this.COLORS.text;
          doc.fontSize(8).fillColor(color).font(i === 3 ? 'Helvetica-Bold' : 'Helvetica')
             .text(cell, x + 3, tableY + 4, { width: colWidths[i] - 6 });
          x += colWidths[i];
        });
        tableY += 16;
      });

      if (sortedEvents.length > maxRows) {
        doc.fontSize(8).fillColor(this.COLORS.lightText).font('Helvetica-Oblique')
           .text(`+ ${sortedEvents.length - maxRows} more events...`, this.MARGIN, tableY + 5);
      }

      doc.y = tableY + 20;
    }

    // Evidence Section (no forced page break - only if truly needed)
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor(this.COLORS.primary).font('Helvetica-Bold')
       .text('EVIDENCE FOR INSURANCE CLAIMS');
    doc.moveDown(0.3);

    doc.fontSize(9).fillColor(this.COLORS.text).font('Helvetica');
    doc.text('This report contains official storm event data from certified sources:', { continued: false });
    doc.moveDown(0.3);
    doc.text('1. NOAA Storm Events Database - Official U.S. government record of severe weather events.');
    doc.text('2. Interactive Hail Maps (IHM) - Professional storm tracking with radar and ground verification.');
    doc.moveDown(0.5);

    // Disclaimer box
    const disclaimerY = doc.y;
    doc.rect(this.MARGIN, disclaimerY, pageWidth, 45).fillOpacity(0.05).fill('#666').fillOpacity(1);
    doc.rect(this.MARGIN, disclaimerY, pageWidth, 45).stroke(this.COLORS.border);
    doc.fontSize(7).fillColor(this.COLORS.lightText).font('Helvetica-Oblique')
       .text('DISCLAIMER: This report is for informational purposes only. Storm data is based on historical records and may not capture all weather events. This does not constitute a roof inspection. Professional inspection required for insurance claims.',
         this.MARGIN + 8, disclaimerY + 8, { width: pageWidth - 16 });

    // Footer (must stay above Y=720 to avoid new page)
    const footerY = 710;
    doc.moveTo(this.MARGIN, footerY).lineTo(612 - this.MARGIN, footerY).stroke(this.COLORS.border);
    doc.fontSize(8).fillColor(this.COLORS.lightText).font('Helvetica')
       .text('Generated by SA21 Storm Intelligence', this.MARGIN, footerY + 5);

    if (input.repName || input.repPhone) {
      const repInfo = [input.repName, input.repPhone, input.repEmail].filter(Boolean).join(' • ');
      doc.fontSize(8).text(repInfo, this.MARGIN, footerY + 15, { width: pageWidth, align: 'center' });
    }

    doc.end();
    return stream;
  }

  private generateReportId(): string {
    return `SR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  }

  private combineAndSortEvents(events: HailEvent[], noaaEvents: NOAAEvent[]): Array<{
    date: string;
    type: string;
    size: number | null;
    severity: 'minor' | 'moderate' | 'severe';
    source: string;
    distance?: number;
  }> {
    const combined = [
      ...events.map(e => ({
        date: e.date,
        type: 'Hail',
        size: e.hailSize,
        severity: e.severity,
        source: e.source || 'IHM',
        distance: e.distanceMiles,
      })),
      ...noaaEvents.map(e => ({
        date: e.date,
        type: e.eventType.charAt(0).toUpperCase() + e.eventType.slice(1),
        size: e.magnitude,
        severity: this.getSeverityFromMagnitude(e.magnitude, e.eventType),
        source: 'NOAA',
        distance: e.distanceMiles,
      })),
    ];

    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  private formatEventRow(event: { date: string; type: string; size: number | null; severity: string; source: string; distance?: number }): string[] {
    const date = new Date(event.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const sizeStr = event.size ? `${event.size.toFixed(2)}"` : '-';
    const distStr = event.distance ? `${event.distance.toFixed(1)} mi` : '-';

    return [dateStr, event.type, sizeStr, event.severity.toUpperCase(), event.source, distStr];
  }

  private getSeverityFromMagnitude(magnitude: number | null, eventType: string): 'minor' | 'moderate' | 'severe' {
    if (eventType === 'wind') return 'moderate';
    if (eventType === 'tornado') return 'severe';
    if (!magnitude) return 'minor';
    if (magnitude >= 1.5) return 'severe';
    if (magnitude >= 1.0) return 'moderate';
    return 'minor';
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'severe': return this.COLORS.critical;
      case 'moderate': return this.COLORS.moderate;
      default: return this.COLORS.low;
    }
  }
}

export const pdfReportService = new PDFReportService();
