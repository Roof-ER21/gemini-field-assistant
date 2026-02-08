/**
 * Test script for PDF report generation
 */
import { pdfReportService } from './pdfReportService.js';
import fs from 'fs';
import path from 'path';
// Sample test data
const testData = {
    address: '123 Main Street, Dallas, TX 75001',
    lat: 32.7767,
    lng: -96.7970,
    radius: 50,
    events: [
        {
            id: 'ihm-1',
            date: '2024-05-15T14:30:00Z',
            latitude: 32.7800,
            longitude: -96.8000,
            hailSize: 2.0,
            severity: 'severe',
            source: 'IHM',
            distanceMiles: 2.3
        },
        {
            id: 'ihm-2',
            date: '2024-03-20T16:45:00Z',
            latitude: 32.7750,
            longitude: -96.7950,
            hailSize: 1.25,
            severity: 'moderate',
            source: 'IHM',
            distanceMiles: 1.8
        },
        {
            id: 'ihm-3',
            date: '2023-06-10T18:20:00Z',
            latitude: 32.7820,
            longitude: -96.8100,
            hailSize: 1.75,
            severity: 'severe',
            source: 'IHM',
            distanceMiles: 3.1
        }
    ],
    noaaEvents: [
        {
            id: 'noaa-1',
            date: '2024-04-12T15:00:00Z',
            latitude: 32.7800,
            longitude: -96.7900,
            magnitude: 1.5,
            eventType: 'hail',
            location: 'Dallas County',
            distanceMiles: 1.5
        },
        {
            id: 'noaa-2',
            date: '2023-08-05T17:30:00Z',
            latitude: 32.7700,
            longitude: -96.7850,
            magnitude: 70,
            eventType: 'wind',
            location: 'Dallas County',
            distanceMiles: 2.0
        },
        {
            id: 'noaa-3',
            date: '2022-05-22T19:15:00Z',
            latitude: 32.7900,
            longitude: -96.8200,
            magnitude: 1.0,
            eventType: 'hail',
            location: 'Dallas County',
            distanceMiles: 4.2
        }
    ],
    damageScore: {
        score: 72,
        riskLevel: 'High',
        factors: {
            eventCount: 6,
            maxHailSize: 2.0,
            recentActivity: 3,
            cumulativeExposure: 8.5,
            severityDistribution: {
                severe: 3,
                moderate: 2,
                minor: 1
            },
            recencyScore: 18.5
        },
        summary: 'High risk area with 6 recorded hail events. Maximum hail size of 2.0" indicates significant damage potential. 3 events occurred in the past 12 months, indicating active storm activity. 3 severe events (1.5"+) recorded.',
        color: '#f97316'
    },
    repName: 'John Smith',
    repPhone: '(555) 123-4567',
    repEmail: 'john.smith@roofer.com',
    companyName: 'SA21 Storm Intelligence'
};
async function testPDFGeneration() {
    console.log('🧪 Testing PDF report generation...\n');
    try {
        // Generate PDF
        console.log('📄 Generating PDF report...');
        const pdfStream = pdfReportService.generateReport(testData);
        // Save to file
        const outputPath = path.join(process.cwd(), 'test-storm-report.pdf');
        const writeStream = fs.createWriteStream(outputPath);
        pdfStream.pipe(writeStream);
        await new Promise((resolve, reject) => {
            writeStream.on('finish', () => resolve());
            writeStream.on('error', reject);
            pdfStream.on('error', reject);
        });
        console.log(`✅ PDF generated successfully!`);
        console.log(`📁 Saved to: ${outputPath}`);
        console.log('\nReport details:');
        console.log(`   Address: ${testData.address}`);
        console.log(`   Damage Score: ${testData.damageScore.score} (${testData.damageScore.riskLevel})`);
        console.log(`   Total Events: ${testData.events.length + testData.noaaEvents.length}`);
        console.log(`   Max Hail Size: ${testData.damageScore.factors.maxHailSize.toFixed(1)}"`);
        console.log(`   Severe Events: ${testData.damageScore.factors.severityDistribution.severe}`);
        console.log('\n💡 Open the PDF to verify the report looks professional!');
    }
    catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}
// Run test
testPDFGeneration();
