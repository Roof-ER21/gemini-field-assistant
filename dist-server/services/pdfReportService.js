/**
 * PDF Report Generation Service
 *
 * Generates professional storm damage history reports for insurance claims
 * Superior to HailTrace - includes more data, better design, and NOAA certification
 */
import * as PDFKit from 'pdfkit';
import { PassThrough } from 'stream';
// PDFKit default export
const PDFDocument = PDFKit.default || PDFKit;
export class PDFReportService {
    COLORS = {
        primary: '#1e3a8a',
        secondary: '#475569',
        critical: '#dc2626',
        high: '#f97316',
        moderate: '#eab308',
        low: '#22c55e',
        text: '#1e293b',
        lightText: '#64748b',
        border: '#e2e8f0',
        // Event type colors
        hail: '#10b981', // Green
        wind: '#8b5cf6', // Purple
        tornado: '#ef4444', // Red
        ihm: '#f97316', // Orange (IHM source)
        noaa: '#6366f1', // Indigo (NOAA source)
    };
    MARGIN = 40;
    /**
     * Generate PDF report and return as stream
     */
    generateReport(input) {
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
        doc.moveDown(0.5);
        // Color Legend
        const legendY = doc.y;
        doc.fontSize(9).fillColor(this.COLORS.text).font('Helvetica-Bold').text('EVENT TYPE LEGEND:', this.MARGIN, legendY);
        // Legend items in a row
        let legendX = this.MARGIN + 110;
        const legendItems = [
            { label: 'Hail', color: this.COLORS.hail },
            { label: 'Wind', color: this.COLORS.wind },
        ];
        legendItems.forEach(item => {
            doc.rect(legendX, legendY, 10, 10).fill(item.color);
            doc.fontSize(8).fillColor(this.COLORS.text).font('Helvetica')
                .text(item.label, legendX + 14, legendY + 1);
            legendX += 60;
        });
        // Source legend
        legendX += 20;
        doc.fontSize(9).fillColor(this.COLORS.text).font('Helvetica-Bold').text('SOURCE:', legendX, legendY);
        legendX += 50;
        doc.rect(legendX, legendY, 10, 10).fill(this.COLORS.ihm);
        doc.fontSize(8).fillColor(this.COLORS.text).font('Helvetica').text('IHM', legendX + 14, legendY + 1);
        legendX += 40;
        doc.rect(legendX, legendY, 10, 10).fill(this.COLORS.noaa);
        doc.fontSize(8).fillColor(this.COLORS.text).font('Helvetica').text('NOAA', legendX + 14, legendY + 1);
        doc.y = legendY + 20;
        // Apply filter
        const filter = input.filter || 'all';
        let filteredIhmEvents = input.events;
        let filteredNoaaEvents = input.noaaEvents;
        switch (filter) {
            case 'hail-only':
                filteredNoaaEvents = input.noaaEvents.filter(e => e.eventType === 'hail');
                break;
            case 'hail-wind':
                filteredNoaaEvents = input.noaaEvents.filter(e => e.eventType === 'hail' || e.eventType === 'wind');
                break;
            case 'ihm-only':
                filteredNoaaEvents = [];
                break;
            case 'noaa-only':
                filteredIhmEvents = [];
                break;
            // 'all' - no filtering
        }
        const filteredTotal = filteredIhmEvents.length + filteredNoaaEvents.length;
        // Show filter info if not 'all'
        if (filter !== 'all') {
            doc.fontSize(8).fillColor(this.COLORS.lightText).font('Helvetica-Oblique')
                .text(`Filter applied: ${this.getFilterLabel(filter)} (${filteredTotal} of ${allEvents.length} events)`, this.MARGIN, doc.y);
            doc.moveDown(0.3);
        }
        // Storm Event Timeline
        doc.fontSize(12).fillColor(this.COLORS.primary).font('Helvetica-Bold').text('STORM EVENT TIMELINE');
        doc.moveDown(0.3);
        if (filteredTotal === 0) {
            doc.fontSize(10).fillColor(this.COLORS.lightText).font('Helvetica-Oblique')
                .text('No storm events found matching the selected filter.');
        }
        else {
            // Sort events: IHM first, then NOAA
            const sortedEvents = this.combineAndSortEvents(filteredIhmEvents, filteredNoaaEvents);
            // Table setup
            const colWidths = [85, 55, 75, 70, 55, 55];
            const tableWidth = colWidths.reduce((a, b) => a + b, 0);
            const headers = ['Date', 'Type', 'Magnitude', 'Impact', 'Source', 'Distance'];
            const rowHeight = 16;
            const headerHeight = 18;
            const pageBottom = 700; // Leave room for footer
            let tableY = doc.y;
            // Helper to draw table header
            const drawTableHeader = () => {
                doc.rect(this.MARGIN, tableY, tableWidth, headerHeight).fill(this.COLORS.primary);
                let x = this.MARGIN;
                headers.forEach((h, i) => {
                    doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold')
                        .text(h, x + 3, tableY + 5, { width: colWidths[i] - 6 });
                    x += colWidths[i];
                });
                tableY += headerHeight;
            };
            // Draw initial header
            drawTableHeader();
            // Draw ALL rows with pagination
            sortedEvents.forEach((event, idx) => {
                // Check if we need a new page
                if (tableY + rowHeight > pageBottom) {
                    doc.addPage();
                    tableY = this.MARGIN;
                    // Continuation header on new page
                    doc.fontSize(10).fillColor(this.COLORS.primary).font('Helvetica-Bold')
                        .text('STORM EVENT TIMELINE (continued)', this.MARGIN, tableY);
                    tableY += 25;
                    drawTableHeader();
                }
                // Alternate row colors
                if (idx % 2 === 0) {
                    doc.rect(this.MARGIN, tableY, tableWidth, rowHeight).fill('#f8fafc');
                }
                doc.rect(this.MARGIN, tableY, tableWidth, rowHeight).stroke(this.COLORS.border);
                const row = this.formatEventRow(event);
                let x = this.MARGIN;
                row.forEach((cell, i) => {
                    // Color coding: Type (1), Severity (3), Source (4)
                    let color = this.COLORS.text;
                    let fontWeight = 'Helvetica';
                    if (i === 1) {
                        color = this.getEventTypeColor(event.type);
                        fontWeight = 'Helvetica-Bold';
                    }
                    else if (i === 3) {
                        color = this.getSeverityColor(event.severity);
                        fontWeight = 'Helvetica-Bold';
                    }
                    else if (i === 4) {
                        color = this.getSourceColor(event.source);
                        fontWeight = 'Helvetica-Bold';
                    }
                    doc.fontSize(8).fillColor(color).font(fontWeight)
                        .text(cell, x + 3, tableY + 4, { width: colWidths[i] - 6 });
                    x += colWidths[i];
                });
                tableY += rowHeight;
            });
            doc.y = tableY + 20;
        }
        // Evidence Section - check if we need a new page (need ~120px)
        if (doc.y > 620) {
            doc.addPage();
            doc.y = this.MARGIN;
        }
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
            .text('DISCLAIMER: This report is for informational purposes only. Storm data is based on historical records and may not capture all weather events. This does not constitute a roof inspection. Professional inspection required for insurance claims.', this.MARGIN + 8, disclaimerY + 8, { width: pageWidth - 16 });
        // Footer at bottom of current page
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
    generateReportId() {
        return `SR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }
    combineAndSortEvents(events, noaaEvents) {
        // IHM events first, sorted by date descending
        const ihmEvents = events.map(e => ({
            date: e.date,
            type: 'Hail',
            size: e.hailSize,
            severity: e.severity,
            source: 'IHM',
            distance: e.distanceMiles,
        })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        // NOAA events second, sorted by date descending
        const noaaFormatted = noaaEvents.map(e => ({
            date: e.date,
            type: e.eventType.charAt(0).toUpperCase() + e.eventType.slice(1),
            size: e.magnitude,
            severity: this.getSeverityFromMagnitude(e.magnitude, e.eventType),
            source: 'NOAA',
            distance: e.distanceMiles,
        })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        // IHM always at the top, then NOAA
        return [...ihmEvents, ...noaaFormatted];
    }
    formatEventRow(event) {
        const date = new Date(event.date);
        const dateStr = date.toLocaleDateString('en-US', {
            timeZone: 'America/New_York',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        // Format size based on event type
        let sizeStr = '-';
        if (event.size) {
            if (event.type.toLowerCase() === 'wind') {
                // Wind magnitude is in knots
                sizeStr = `${Math.round(event.size)} kts`;
            }
            else {
                // Hail/tornado size is in inches
                sizeStr = `${event.size.toFixed(2)}"`;
            }
        }
        const distStr = event.distance ? `${event.distance.toFixed(1)} mi` : '-';
        // Convert internal severity to professional display label
        const impactLabel = this.getImpactLabel(event.severity);
        return [dateStr, event.type, sizeStr, impactLabel, event.source, distStr];
    }
    getSeverityFromMagnitude(magnitude, eventType) {
        if (eventType === 'wind')
            return 'moderate';
        if (eventType === 'tornado')
            return 'severe';
        if (!magnitude)
            return 'minor';
        if (magnitude >= 1.5)
            return 'severe';
        if (magnitude >= 1.0)
            return 'moderate';
        return 'minor';
    }
    // Convert internal severity to adjuster-friendly labels
    getImpactLabel(severity) {
        switch (severity) {
            case 'severe': return 'MAJOR';
            case 'moderate': return 'SIGNIFICANT';
            default: return 'DOCUMENTED';
        }
    }
    getSeverityColor(severity) {
        switch (severity) {
            case 'severe': return this.COLORS.critical; // Red for major
            case 'moderate': return this.COLORS.high; // Orange for significant
            default: return this.COLORS.primary; // Blue for documented (neutral, professional)
        }
    }
    getEventTypeColor(type) {
        switch (type.toLowerCase()) {
            case 'hail': return this.COLORS.hail;
            case 'wind': return this.COLORS.wind;
            case 'tornado': return this.COLORS.tornado;
            default: return this.COLORS.text;
        }
    }
    getSourceColor(source) {
        return source === 'IHM' ? this.COLORS.ihm : this.COLORS.noaa;
    }
    getFilterLabel(filter) {
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
