import { PDFReportService } from './server/services/pdfReportService.js';
import { DamageScoreService } from './server/services/damageScoreService.js';
import * as fs from 'fs';

const address = "8100 Boone Blvd, Vienna, VA 22182";
const lat = 38.9215;
const lng = -77.2316;

// Just 3 events
const events = [
  { id: "1", date: "2024-07-15", latitude: 38.92, longitude: -77.23, hailSize: 1.25, severity: "moderate" as const, source: "IHM", distanceMiles: 0.8 },
];

const noaaEvents = [
  { id: "2", date: "2024-05-20", latitude: 38.91, longitude: -77.22, magnitude: 1.0, eventType: "hail" as const, location: "VIENNA", distanceMiles: 1.5 },
  { id: "3", date: "2023-08-14", latitude: 38.92, longitude: -77.25, magnitude: 0.75, eventType: "hail" as const, location: "TYSONS", distanceMiles: 2.1 },
];

const damageScoreService = new DamageScoreService();
const damageScore = damageScoreService.calculateDamageScore({ lat, lng, address, events, noaaEvents });

const pdfService = new PDFReportService();
const pdfStream = pdfService.generateReport({
  address, lat, lng, radius: 15, events, noaaEvents, damageScore,
  repName: "Alex", repPhone: "(703) 555-1234", repEmail: "alex@sa21.com"
});

const outputPath = '/Users/a21/gemini-field-assistant/vienna-report-v2.pdf';
const writeStream = fs.createWriteStream(outputPath);
pdfStream.pipe(writeStream);
writeStream.on('finish', () => {
  console.log('✅ Saved:', outputPath);
  const stats = fs.statSync(outputPath);
  console.log('Size:', (stats.size / 1024).toFixed(1), 'KB');
});
