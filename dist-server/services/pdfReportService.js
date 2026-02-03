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
    // Design constants
    COLORS = {
        primary: '#1e3a8a', // Navy blue
        secondary: '#475569', // Slate gray
        accent: '#0ea5e9', // Sky blue
        critical: '#dc2626', // Red
        high: '#f97316', // Orange
        moderate: '#eab308', // Yellow
        low: '#22c55e', // Green
        textDark: '#1e293b', // Dark slate
        textLight: '#64748b', // Light slate
        border: '#cbd5e1', // Border gray
    };
    MARGINS = {
        top: 50,
        bottom: 50,
        left: 50,
        right: 50,
    };
    /**
     * Generate PDF report and return as stream
     */
    generateReport(input) {
        const doc = new PDFDocument({
            size: 'LETTER',
            margins: this.MARGINS,
            info: {
                Title: 'Storm Damage History Report',
                Author: input.companyName || 'SA21 Storm Intelligence',
                Subject: `Storm History for ${input.address}`,
                Keywords: 'storm damage, hail, insurance, NOAA',
            },
        });
        const stream = new PassThrough();
        doc.pipe(stream);
        // Generate report ID and metadata
        const metadata = this.generateMetadata(input);
        // Track page number for footers
        let pageNumber = 1;
        // Build the report with footers on each page
        this.addHeader(doc, input, metadata);
        this.addPropertyInformation(doc, input);
        this.addDamageScoreSection(doc, input.damageScore);
        this.addExecutiveSummary(doc, metadata, input);
        this.addStormTimeline(doc, input.events, input.noaaEvents);
        this.addEvidenceSection(doc);
        // Add footer to first page
        this.addFooterToPage(doc, input, 1);
        // Finalize document
        doc.end();
        return stream;
    }
    /**
     * Generate report metadata
     */
    generateMetadata(input) {
        const allEvents = [...input.events, ...input.noaaEvents];
        const hailSizes = [
            ...input.events.map(e => e.hailSize || 0),
            ...input.noaaEvents.filter(e => e.eventType === 'hail').map(e => e.magnitude || 0)
        ];
        const dates = allEvents.map(e => new Date(e.date)).filter(d => !isNaN(d.getTime()));
        const mostRecentDate = dates.length > 0
            ? new Date(Math.max(...dates.map(d => d.getTime())))
            : new Date();
        const oldestDate = dates.length > 0
            ? new Date(Math.min(...dates.map(d => d.getTime())))
            : new Date();
        const yearsOfData = dates.length > 0
            ? Math.ceil((mostRecentDate.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24 * 365))
            : 0;
        return {
            reportId: this.generateReportId(),
            generatedDate: new Date(),
            totalEvents: allEvents.length,
            largestHail: Math.max(...hailSizes, 0),
            mostRecentDate: this.formatDate(mostRecentDate),
            severeEventCount: hailSizes.filter(s => s >= 1.5).length,
            yearsOfData,
        };
    }
    /**
     * Generate unique report ID
     */
    generateReportId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 7);
        return `SR-${timestamp}-${random}`.toUpperCase();
    }
    /**
     * Add header section
     */
    addHeader(doc, input, metadata) {
        // Company logo placeholder (blue circle with "SA21")
        doc.save();
        doc.circle(this.MARGINS.left + 30, doc.y + 30, 25)
            .lineWidth(2)
            .stroke(this.COLORS.primary);
        doc.fontSize(16)
            .fillColor(this.COLORS.primary)
            .font('Helvetica-Bold')
            .text('SA21', this.MARGINS.left + 15, doc.y + 22);
        doc.restore();
        // Main title
        doc.moveDown(0.5);
        doc.fontSize(24)
            .fillColor(this.COLORS.primary)
            .font('Helvetica-Bold')
            .text('STORM DAMAGE HISTORY REPORT', this.MARGINS.left + 80, this.MARGINS.top, {
            width: doc.page.width - this.MARGINS.left - this.MARGINS.right - 80,
            align: 'left',
        });
        // Report metadata
        doc.moveDown(0.3);
        doc.fontSize(10)
            .fillColor(this.COLORS.textLight)
            .font('Helvetica')
            .text(`Report ID: ${metadata.reportId}`, { align: 'left' })
            .text(`Generated: ${this.formatDateTime(metadata.generatedDate)}`, { align: 'left' });
        // Separator line
        doc.moveDown(1);
        this.drawHorizontalLine(doc, this.COLORS.primary, 2);
        doc.moveDown(1);
    }
    /**
     * Add property information section
     */
    addPropertyInformation(doc, input) {
        this.addSectionHeader(doc, 'Property Information');
        const tableData = [
            { label: 'Address', value: input.address },
            { label: 'Coordinates', value: `${input.lat.toFixed(6)}, ${input.lng.toFixed(6)}` },
            { label: 'Search Radius', value: `${input.radius} miles` },
            { label: 'Data Sources', value: 'NOAA Storm Events Database, Interactive Hail Maps' },
        ];
        this.drawInfoTable(doc, tableData);
        doc.moveDown(1.5);
    }
    /**
     * Add damage score section (prominent)
     */
    addDamageScoreSection(doc, damageScore) {
        this.addSectionHeader(doc, 'Damage Risk Assessment');
        // Save current position
        const startY = doc.y;
        // Draw score box with color
        const boxWidth = doc.page.width - this.MARGINS.left - this.MARGINS.right;
        const boxHeight = 140;
        // Background with risk color (light shade)
        doc.save();
        doc.rect(this.MARGINS.left, startY, boxWidth, boxHeight)
            .fillOpacity(0.1)
            .fill(damageScore.color)
            .fillOpacity(1);
        doc.restore();
        // Border
        doc.rect(this.MARGINS.left, startY, boxWidth, boxHeight)
            .lineWidth(2)
            .stroke(damageScore.color);
        // Large score display
        doc.fontSize(60)
            .fillColor(damageScore.color)
            .font('Helvetica-Bold')
            .text(damageScore.score.toString(), this.MARGINS.left + 30, startY + 30, {
            width: 150,
            align: 'center',
        });
        // Score label
        doc.fontSize(12)
            .fillColor(this.COLORS.textLight)
            .font('Helvetica')
            .text('DAMAGE SCORE', this.MARGINS.left + 30, startY + 100, {
            width: 150,
            align: 'center',
        });
        // Risk level badge
        const badgeX = this.MARGINS.left + 220;
        const badgeY = startY + 20;
        const badgeWidth = 150;
        const badgeHeight = 40;
        doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 5)
            .fill(damageScore.color);
        doc.fontSize(20)
            .fillColor('#ffffff')
            .font('Helvetica-Bold')
            .text(damageScore.riskLevel.toUpperCase(), badgeX, badgeY + 10, {
            width: badgeWidth,
            align: 'center',
        });
        // Risk description
        doc.fontSize(10)
            .fillColor(this.COLORS.textDark)
            .font('Helvetica')
            .text(damageScore.summary, badgeX, badgeY + 55, {
            width: boxWidth - 240,
            align: 'left',
        });
        // Move past the score box
        doc.y = startY + boxHeight + 10;
        // Factors breakdown
        doc.moveDown(1);
        doc.fontSize(12)
            .fillColor(this.COLORS.textDark)
            .font('Helvetica-Bold')
            .text('Risk Factors:');
        doc.moveDown(0.5);
        const factorsData = [
            { label: 'Total Events', value: damageScore.factors.eventCount.toString() },
            { label: 'Max Hail Size', value: `${damageScore.factors.maxHailSize.toFixed(1)}"` },
            { label: 'Recent Activity (12mo)', value: damageScore.factors.recentActivity.toString() },
            { label: 'Severe Events (1.5"+)', value: damageScore.factors.severityDistribution.severe.toString() },
            { label: 'Cumulative Exposure', value: damageScore.factors.cumulativeExposure.toFixed(1) },
        ];
        this.drawInfoTable(doc, factorsData);
        doc.moveDown(2);
    }
    /**
     * Add executive summary section
     */
    addExecutiveSummary(doc, metadata, input) {
        this.addSectionHeader(doc, 'Executive Summary');
        const summaryPoints = [
            `Total Storm Events: ${metadata.totalEvents} events within ${input.radius} miles`,
            `Largest Recorded Hail: ${metadata.largestHail > 0 ? metadata.largestHail.toFixed(1) + '"' : 'No hail recorded'}`,
            `Most Recent Event: ${metadata.mostRecentDate}`,
            `Severe Events (1.5"+): ${metadata.severeEventCount} events`,
            `Historical Data Coverage: ${metadata.yearsOfData} years`,
        ];
        summaryPoints.forEach(point => {
            doc.fontSize(11)
                .fillColor(this.COLORS.textDark)
                .font('Helvetica')
                .text('• ' + point);
            doc.moveDown(0.3);
        });
        doc.moveDown(1.5);
    }
    /**
     * Add storm event timeline
     */
    addStormTimeline(doc, events, noaaEvents) {
        this.addSectionHeader(doc, 'Storm Event Timeline');
        // Combine and sort events by date
        const allEvents = this.combineAndSortEvents(events, noaaEvents);
        if (allEvents.length === 0) {
            doc.fontSize(11)
                .fillColor(this.COLORS.textLight)
                .font('Helvetica-Oblique')
                .text('No storm events found in the specified search area.');
            doc.moveDown(2);
            return;
        }
        // Table headers
        const headers = ['Date', 'Type', 'Size/Magnitude', 'Severity', 'Source', 'Distance'];
        const colWidths = [90, 70, 100, 70, 70, 70];
        const tableX = this.MARGINS.left;
        let tableY = doc.y;
        // Draw header row
        doc.save();
        doc.rect(tableX, tableY, colWidths.reduce((a, b) => a + b), 25)
            .fill(this.COLORS.primary);
        doc.restore();
        let x = tableX;
        headers.forEach((header, i) => {
            doc.fontSize(9)
                .fillColor('#ffffff')
                .font('Helvetica-Bold')
                .text(header, x + 5, tableY + 8, {
                width: colWidths[i] - 10,
                align: 'left',
            });
            x += colWidths[i];
        });
        tableY += 25;
        // Draw event rows (with page break handling)
        allEvents.forEach((event, index) => {
            // Check if we need a new page
            if (tableY > doc.page.height - this.MARGINS.bottom - 60) {
                doc.addPage();
                tableY = this.MARGINS.top;
                // Redraw headers on new page
                doc.save();
                doc.rect(tableX, tableY, colWidths.reduce((a, b) => a + b), 25)
                    .fill(this.COLORS.primary);
                doc.restore();
                let headerX = tableX;
                headers.forEach((header, i) => {
                    doc.fontSize(9)
                        .fillColor('#ffffff')
                        .font('Helvetica-Bold')
                        .text(header, headerX + 5, tableY + 8, {
                        width: colWidths[i] - 10,
                        align: 'left',
                    });
                    headerX += colWidths[i];
                });
                tableY += 25;
            }
            // Alternate row colors
            if (index % 2 === 0) {
                doc.save();
                doc.rect(tableX, tableY, colWidths.reduce((a, b) => a + b), 20)
                    .fill('#f8fafc');
                doc.restore();
            }
            // Draw border
            doc.rect(tableX, tableY, colWidths.reduce((a, b) => a + b), 20)
                .stroke(this.COLORS.border);
            // Draw cell data
            const rowData = this.formatEventRow(event);
            const severityColor = this.getSeverityColor(event.severity);
            x = tableX;
            rowData.forEach((cell, i) => {
                const color = i === 3 ? severityColor : this.COLORS.textDark;
                doc.fontSize(8)
                    .fillColor(color)
                    .font(i === 3 ? 'Helvetica-Bold' : 'Helvetica')
                    .text(cell, x + 5, tableY + 6, {
                    width: colWidths[i] - 10,
                    align: 'left',
                });
                x += colWidths[i];
            });
            tableY += 20;
        });
        doc.y = tableY + 10;
        doc.moveDown(2);
    }
    /**
     * Add evidence section for insurance
     */
    addEvidenceSection(doc) {
        // Check if we need a new page
        if (doc.y > doc.page.height - this.MARGINS.bottom - 200) {
            doc.addPage();
        }
        this.addSectionHeader(doc, 'Evidence for Insurance Claims');
        const evidenceText = [
            'This report contains official storm event data from certified sources:',
            '',
            '1. NOAA Storm Events Database - The National Oceanic and Atmospheric Administration maintains the official record of severe weather events in the United States. All NOAA data in this report is sourced directly from their certified database and represents verified storm events.',
            '',
            '2. Interactive Hail Maps (IHM) - A professional-grade storm tracking service that aggregates data from multiple verified sources including NEXRAD radar, NOAA reports, and ground observations.',
            '',
            'This data is suitable for insurance claims and roof damage assessments. The information contained herein represents the best available historical storm data for the specified location.',
            '',
            'IMPORTANT: This report provides historical storm data only. Physical roof inspection by a qualified professional is required to determine actual damage.',
        ];
        evidenceText.forEach(text => {
            if (text === '') {
                doc.moveDown(0.3);
            }
            else {
                doc.fontSize(10)
                    .fillColor(this.COLORS.textDark)
                    .font('Helvetica')
                    .text(text, {
                    align: 'left',
                    width: doc.page.width - this.MARGINS.left - this.MARGINS.right,
                });
                doc.moveDown(0.5);
            }
        });
        doc.moveDown(1);
        // Disclaimer box
        const disclaimerY = doc.y;
        const disclaimerHeight = 60;
        doc.save();
        doc.rect(this.MARGINS.left, disclaimerY, doc.page.width - this.MARGINS.left - this.MARGINS.right, disclaimerHeight)
            .fillOpacity(0.05)
            .fill(this.COLORS.secondary)
            .fillOpacity(1);
        doc.restore();
        doc.rect(this.MARGINS.left, disclaimerY, doc.page.width - this.MARGINS.left - this.MARGINS.right, disclaimerHeight)
            .lineWidth(1)
            .stroke(this.COLORS.border);
        doc.fontSize(8)
            .fillColor(this.COLORS.textLight)
            .font('Helvetica-Oblique')
            .text('DISCLAIMER: This report is provided for informational purposes only. While every effort has been made to ensure accuracy, storm data is based on historical records and may not capture all weather events. This report does not constitute a roof inspection or damage assessment. Professional inspection required for insurance claims.', this.MARGINS.left + 10, disclaimerY + 10, {
            width: doc.page.width - this.MARGINS.left - this.MARGINS.right - 20,
            align: 'left',
        });
        doc.y = disclaimerY + disclaimerHeight + 10;
    }
    /**
     * Add footer to page
     */
    addFooterToPage(doc, input, pageNum) {
        // Save current position
        const currentY = doc.y;
        // Footer line
        const footerY = doc.page.height - this.MARGINS.bottom + 10;
        doc.moveTo(this.MARGINS.left, footerY)
            .lineTo(doc.page.width - this.MARGINS.right, footerY)
            .stroke(this.COLORS.border);
        // Left side - company info
        doc.fontSize(8)
            .fillColor(this.COLORS.textLight)
            .font('Helvetica')
            .text('Generated by SA21 Storm Intelligence', this.MARGINS.left, footerY + 5);
        // Center - rep info if provided
        if (input.repName || input.repPhone || input.repEmail) {
            const repInfo = [];
            if (input.repName)
                repInfo.push(input.repName);
            if (input.repPhone)
                repInfo.push(input.repPhone);
            if (input.repEmail)
                repInfo.push(input.repEmail);
            doc.fontSize(8)
                .fillColor(this.COLORS.textLight)
                .text(repInfo.join(' • '), this.MARGINS.left, footerY + 15, {
                width: doc.page.width - this.MARGINS.left - this.MARGINS.right,
                align: 'center',
            });
        }
        // Right side - page number
        doc.fontSize(8)
            .fillColor(this.COLORS.textLight)
            .text(`Page ${pageNum}`, doc.page.width - this.MARGINS.right - 80, footerY + 5, {
            width: 80,
            align: 'right',
        });
        // Confidentiality notice
        doc.fontSize(7)
            .fillColor(this.COLORS.textLight)
            .font('Helvetica-Oblique')
            .text('CONFIDENTIAL - For insurance and property assessment purposes only', this.MARGINS.left, footerY + 28, {
            width: doc.page.width - this.MARGINS.left - this.MARGINS.right,
            align: 'center',
        });
        // Restore Y position
        doc.y = currentY;
    }
    /**
     * Helper: Add section header
     */
    addSectionHeader(doc, title) {
        doc.fontSize(14)
            .fillColor(this.COLORS.primary)
            .font('Helvetica-Bold')
            .text(title);
        doc.moveDown(0.2);
        this.drawHorizontalLine(doc, this.COLORS.accent, 1);
        doc.moveDown(0.8);
    }
    /**
     * Helper: Draw horizontal line
     */
    drawHorizontalLine(doc, color, lineWidth) {
        doc.save();
        doc.moveTo(this.MARGINS.left, doc.y)
            .lineTo(doc.page.width - this.MARGINS.right, doc.y)
            .lineWidth(lineWidth)
            .stroke(color);
        doc.restore();
    }
    /**
     * Helper: Draw info table
     */
    drawInfoTable(doc, data) {
        const tableWidth = doc.page.width - this.MARGINS.left - this.MARGINS.right;
        const labelWidth = tableWidth * 0.35;
        const valueWidth = tableWidth * 0.65;
        const rowHeight = 25;
        data.forEach((row, index) => {
            const y = doc.y;
            // Alternate row background
            if (index % 2 === 0) {
                doc.save();
                doc.rect(this.MARGINS.left, y, tableWidth, rowHeight)
                    .fill('#f8fafc');
                doc.restore();
            }
            // Border
            doc.rect(this.MARGINS.left, y, tableWidth, rowHeight)
                .stroke(this.COLORS.border);
            // Label
            doc.fontSize(10)
                .fillColor(this.COLORS.textLight)
                .font('Helvetica-Bold')
                .text(row.label, this.MARGINS.left + 10, y + 8, {
                width: labelWidth - 20,
                align: 'left',
            });
            // Value
            doc.fontSize(10)
                .fillColor(this.COLORS.textDark)
                .font('Helvetica')
                .text(row.value, this.MARGINS.left + labelWidth + 10, y + 8, {
                width: valueWidth - 20,
                align: 'left',
            });
            doc.y = y + rowHeight;
        });
    }
    /**
     * Helper: Combine and sort events
     */
    combineAndSortEvents(events, noaaEvents) {
        const combined = [
            ...events.map(e => ({
                date: new Date(e.date),
                dateStr: e.date,
                type: 'Hail',
                size: e.hailSize,
                severity: e.severity,
                source: e.source === 'IHM' ? 'IHM' : 'NOAA',
                distance: e.distanceMiles || 0,
            })),
            ...noaaEvents.map(e => ({
                date: new Date(e.date),
                dateStr: e.date,
                type: e.eventType === 'hail' ? 'Hail' : e.eventType === 'wind' ? 'Wind' : 'Tornado',
                size: e.magnitude,
                severity: this.calculateSeverity(e.eventType, e.magnitude),
                source: 'NOAA',
                distance: e.distanceMiles || 0,
            }))
        ];
        return combined.sort((a, b) => b.date.getTime() - a.date.getTime());
    }
    /**
     * Helper: Calculate severity from event data
     */
    calculateSeverity(eventType, magnitude) {
        if (eventType === 'hail' && magnitude !== null) {
            if (magnitude >= 1.5)
                return 'severe';
            if (magnitude >= 1.0)
                return 'moderate';
            return 'minor';
        }
        if (eventType === 'tornado')
            return 'severe';
        if (eventType === 'wind' && magnitude !== null && magnitude >= 60)
            return 'severe';
        return 'moderate';
    }
    /**
     * Helper: Format event row for table
     */
    formatEventRow(event) {
        const date = this.formatDate(event.date);
        const type = event.type;
        const size = event.size !== null && event.size > 0
            ? `${event.size.toFixed(1)}${event.type === 'Hail' ? '"' : ' mph'}`
            : 'N/A';
        const severity = event.severity.toUpperCase();
        const source = event.source;
        const distance = `${event.distance.toFixed(1)} mi`;
        return [date, type, size, severity, source, distance];
    }
    /**
     * Helper: Get severity color
     */
    getSeverityColor(severity) {
        switch (severity.toLowerCase()) {
            case 'severe':
                return this.COLORS.critical;
            case 'moderate':
                return this.COLORS.moderate;
            case 'minor':
                return this.COLORS.low;
            default:
                return this.COLORS.textDark;
        }
    }
    /**
     * Helper: Format date
     */
    formatDate(date) {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    }
    /**
     * Helper: Format date and time
     */
    formatDateTime(date) {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
}
export const pdfReportService = new PDFReportService();
