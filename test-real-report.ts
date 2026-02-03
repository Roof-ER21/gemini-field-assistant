import { PDFReportService } from './server/services/pdfReportService.js';
import { DamageScoreService } from './server/services/damageScoreService.js';
import * as fs from 'fs';

// Real address: 8100 Boone Blvd, Vienna, VA
const address = "8100 Boone Blvd, Vienna, VA 22182";
const lat = 38.9215;
const lng = -77.2316;

// Simulate real storm data for Northern Virginia area
const events = [
  {
    id: "ihm-001",
    date: "2024-07-15",
    latitude: 38.92,
    longitude: -77.23,
    hailSize: 1.25,
    severity: "moderate" as const,
    source: "IHM",
    distanceMiles: 0.8
  },
  {
    id: "ihm-002", 
    date: "2023-06-22",
    latitude: 38.93,
    longitude: -77.24,
    hailSize: 0.88,
    severity: "minor" as const,
    source: "IHM",
    distanceMiles: 1.2
  }
];

const noaaEvents = [
  {
    id: "noaa-001",
    date: "2024-05-20",
    latitude: 38.91,
    longitude: -77.22,
    magnitude: 1.0,
    eventType: "hail" as const,
    location: "VIENNA",
    distanceMiles: 1.5
  },
  {
    id: "noaa-002",
    date: "2023-08-14",
    latitude: 38.92,
    longitude: -77.25,
    magnitude: 0.75,
    eventType: "hail" as const,
    location: "TYSONS CORNER",
    distanceMiles: 2.1
  },
  {
    id: "noaa-003",
    date: "2022-04-10",
    latitude: 38.90,
    longitude: -77.21,
    magnitude: null,
    eventType: "wind" as const,
    location: "FAIRFAX",
    distanceMiles: 3.0
  }
];

// Calculate damage score
const damageScoreService = new DamageScoreService();
const damageScore = damageScoreService.calculateDamageScore({
  lat,
  lng,
  address,
  events,
  noaaEvents
});

console.log('📍 Address:', address);
console.log('📊 Damage Score:', damageScore.score, `(${damageScore.riskLevel})`);
console.log('📅 Events:', events.length + noaaEvents.length);

// Generate PDF
const pdfService = new PDFReportService();
const pdfStream = pdfService.generateReport({
  address,
  lat,
  lng,
  radius: 15,
  events,
  noaaEvents,
  damageScore,
  repName: "Alex",
  repPhone: "(703) 555-1234",
  repEmail: "alex@sa21.com",
  companyName: "SA21 Storm Intelligence"
});

// Save to file
const outputPath = '/Users/a21/gemini-field-assistant/vienna-storm-report.pdf';
const writeStream = fs.createWriteStream(outputPath);
pdfStream.pipe(writeStream);

writeStream.on('finish', () => {
  console.log('✅ PDF saved to:', outputPath);
  const stats = fs.statSync(outputPath);
  console.log('📄 File size:', (stats.size / 1024).toFixed(1), 'KB');
});
