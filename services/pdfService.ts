// @ts-ignore - jsPDF v4 types
import jsPDF from 'jspdf';

export interface PdfReportParams {
  address: string;
  lat?: number;
  lng?: number;
  radius: number;
  events: any[];
  noaaEvents: any[];
  damageScore?: {
    score: number;
    riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
    summary: string;
    color: string;
    factors: any;
  };
  searchCriteria: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    latitude?: number;
    longitude?: number;
    startDate?: string;
    endDate?: string;
    minHailSize?: number;
    radius?: number;
  };
  searchStats: {
    totalEvents: number;
    maxHailSize: number | null;
    avgHailSize: number | null;
  };
  repName?: string;
  repPhone?: string;
  repEmail?: string;
  companyName?: string;
  includeRepInfo?: boolean;
}

/**
 * Generate a professional storm report PDF
 */
export async function generateStormReport(params: PdfReportParams): Promise<void> {
  const {
    address,
    events,
    noaaEvents,
    damageScore,
    searchCriteria,
    searchStats,
    repName,
    repPhone,
    repEmail,
    companyName = 'SA21 Storm Intelligence System',
    includeRepInfo = false
  } = params;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 20;

  // Helper to format dates
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Helper for page breaks
  const checkPageBreak = (requiredSpace: number) => {
    if (yPos + requiredSpace > pageHeight - 30) {
      doc.addPage();
      yPos = 20;
    }
  };

  // Header
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('STORM DAMAGE REPORT', pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(companyName, pageWidth / 2, 30, { align: 'center' });

  yPos = 50;

  // Report Date
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.text(`Report Generated: ${new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}`, pageWidth - 15, yPos, { align: 'right' });
  yPos += 15;

  // Rep Contact Info (if included)
  if (includeRepInfo && (repName || repPhone || repEmail)) {
    doc.setFillColor(245, 245, 245);
    const repBoxHeight = 25;
    doc.roundedRect(15, yPos, pageWidth - 30, repBoxHeight, 2, 2, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Your Storm Specialist:', 20, yPos + 7);

    doc.setFont('helvetica', 'normal');
    let repYPos = yPos + 13;

    if (repName) {
      doc.text(`Name: ${repName}`, 20, repYPos);
      repYPos += 5;
    }
    if (repPhone) {
      doc.text(`Phone: ${repPhone}`, 20, repYPos);
      repYPos += 5;
    }
    if (repEmail) {
      doc.text(`Email: ${repEmail}`, 20, repYPos);
    }

    yPos += repBoxHeight + 10;
  }

  // Property Address
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Property Address:', 15, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(address, 55, yPos);
  yPos += 10;

  // Summary Statistics Section
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.5);
  doc.line(15, yPos, pageWidth - 15, yPos);
  yPos += 8;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text('Summary Statistics', 15, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Damage Score Section (if available)
  if (damageScore) {
    doc.setFillColor(220, 38, 38);
    doc.roundedRect(15, yPos, pageWidth - 30, 25, 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DAMAGE RISK SCORE', pageWidth / 2, yPos + 7, { align: 'center' });

    doc.setFontSize(20);
    doc.text(`${damageScore.score} / 100`, pageWidth / 2, yPos + 15, { align: 'center' });

    doc.setFontSize(10);
    doc.text(`${damageScore.riskLevel.toUpperCase()} RISK`, pageWidth / 2, yPos + 21, { align: 'center' });

    yPos += 30;

    // Damage Score Summary
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    const summaryLines = doc.splitTextToSize(damageScore.summary, pageWidth - 40);
    doc.text(summaryLines, 20, yPos);
    yPos += summaryLines.length * 5 + 8;
  }

  // Statistics grid
  const stats = [
    ['Total Events Found:', searchStats.totalEvents.toString()],
    ['Date Range:', `${searchCriteria.startDate ? formatDate(searchCriteria.startDate) : 'N/A'} to ${searchCriteria.endDate ? formatDate(searchCriteria.endDate) : 'N/A'}`],
    ['Max Hail Size:', searchStats.maxHailSize ? `${searchStats.maxHailSize.toFixed(2)}"` : 'N/A'],
    ['Average Hail Size:', searchStats.avgHailSize ? `${searchStats.avgHailSize.toFixed(2)}"` : 'N/A'],
    ['IHM Events:', events.length.toString()],
    ['NOAA Events:', noaaEvents.length.toString()],
  ];

  stats.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 80, yPos);
    yPos += 6;
  });
  yPos += 5;

  // Severity breakdown
  const severeCount = events.filter((e: any) => e.severity === 'severe').length +
    noaaEvents.filter((e: any) => (e.magnitude || 0) >= 2.0).length;
  const moderateCount = events.filter((e: any) => e.severity === 'moderate').length +
    noaaEvents.filter((e: any) => (e.magnitude || 0) >= 1.0 && (e.magnitude || 0) < 2.0).length;
  const minorCount = events.filter((e: any) => e.severity === 'minor').length +
    noaaEvents.filter((e: any) => (e.magnitude || 0) < 1.0).length;

  doc.setFont('helvetica', 'bold');
  doc.text('Severity Breakdown:', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Severe (2"+): ${severeCount}`, 25, yPos);
  yPos += 5;
  doc.text(`Moderate (1-2"): ${moderateCount}`, 25, yPos);
  yPos += 5;
  doc.text(`Minor (<1"): ${minorCount}`, 25, yPos);
  yPos += 10;

  // Event Timeline Section
  checkPageBreak(30);
  doc.setDrawColor(220, 38, 38);
  doc.line(15, yPos, pageWidth - 15, yPos);
  yPos += 8;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text('Event Timeline', 15, yPos);
  yPos += 8;

  // Combine and sort all events by date
  const allEvents = [
    ...events.map((e: any) => ({ type: 'IHM', event: e, date: new Date(e.date) })),
    ...noaaEvents.map((e: any) => ({ type: 'NOAA', event: e, date: new Date(e.date) }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  allEvents.forEach((item, index) => {
    checkPageBreak(20);

    const event = item.event;
    const isIHM = item.type === 'IHM';

    // Event header
    doc.setFont('helvetica', 'bold');
    doc.text(`${index + 1}. ${formatDate(event.date)}`, 20, yPos);
    yPos += 5;

    doc.setFont('helvetica', 'normal');
    if (isIHM) {
      doc.text(`Type: Hail`, 25, yPos);
      yPos += 4;
      doc.text(`Size: ${event.hailSize ? event.hailSize + '"' : 'Unknown'}`, 25, yPos);
      yPos += 4;
      doc.text(`Severity: ${event.severity.charAt(0).toUpperCase() + event.severity.slice(1)}`, 25, yPos);
      yPos += 4;
      doc.text(`Source: Interactive Hail Maps (IHM)`, 25, yPos);
    } else {
      doc.text(`Type: ${event.eventType.charAt(0).toUpperCase() + event.eventType.slice(1)}`, 25, yPos);
      yPos += 4;
      if (event.eventType === 'hail') {
        doc.text(`Size: ${event.magnitude ? event.magnitude + '"' : 'Unknown'}`, 25, yPos);
      } else if (event.eventType === 'wind') {
        doc.text(`Speed: ${event.magnitude ? event.magnitude + ' mph' : 'Unknown'}`, 25, yPos);
      } else {
        doc.text(`Magnitude: ${event.magnitude || 'Unknown'}`, 25, yPos);
      }
      yPos += 4;
      doc.text(`Location: ${event.location}`, 25, yPos);
      yPos += 4;
      doc.text(`Source: NOAA Storm Events Database`, 25, yPos);
    }
    yPos += 7;
  });

  // Insurance Evidence Section
  checkPageBreak(50);
  yPos += 5;
  doc.setDrawColor(220, 38, 38);
  doc.line(15, yPos, pageWidth - 15, yPos);
  yPos += 8;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text('Insurance Evidence', 15, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  const evidenceText = [
    'This report documents verified storm activity at the specified address location.',
    '',
    'NOAA Data Certification:',
    'Data sourced from the National Oceanic and Atmospheric Administration (NOAA)',
    'Storm Events Database is government-certified and legally defensible for insurance',
    'claims and property damage assessments.',
    '',
    'IHM Data Verification:',
    'Interactive Hail Maps (IHM) data is meteorologist-verified and crowd-sourced from',
    'weather spotters, insurance adjusters, and professional storm chasers.',
    '',
    'This report can be used as supporting documentation for:',
    '• Insurance claims for storm damage',
    '• Property inspection reports',
    '• Real estate disclosure requirements',
    '• Risk assessment and mitigation planning'
  ];

  evidenceText.forEach(line => {
    checkPageBreak(6);
    doc.text(line, 20, yPos);
    yPos += 5;
  });

  // Footer
  const footerY = pageHeight - 20;
  doc.setDrawColor(220, 38, 38);
  doc.line(15, footerY, pageWidth - 15, footerY);

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  doc.text(`Generated by ${companyName}`, pageWidth / 2, footerY + 5, { align: 'center' });
  doc.text('Data sources: NOAA Storm Events Database & Interactive Hail Maps', pageWidth / 2, footerY + 10, { align: 'center' });

  // Save PDF
  const fileName = `Storm_Report_${address.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

/**
 * Generate a storm report PDF using server-side API (alternative approach)
 * This would make a POST request to /api/hail/generate-report if we implement it server-side
 */
export async function generateStormReportViaApi(params: PdfReportParams): Promise<Blob> {
  const response = await fetch('/api/hail/generate-report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    throw new Error(`Failed to generate report: ${response.statusText}`);
  }

  return await response.blob();
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
