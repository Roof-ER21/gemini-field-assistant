import * as PDFKit from 'pdfkit';
import { PassThrough } from 'stream';
import * as fs from 'fs';

const PDFDocument = (PDFKit as any).default || PDFKit;

const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
const stream = new PassThrough();
const writeStream = fs.createWriteStream('/Users/a21/gemini-field-assistant/minimal-test.pdf');
doc.pipe(writeStream);

// Just add some text
doc.fontSize(20).text('STORM DAMAGE HISTORY REPORT', { align: 'center' });
doc.moveDown();
doc.fontSize(12).text('Property: 8100 Boone Blvd, Vienna, VA');
doc.fontSize(12).text('Damage Score: 42 (Moderate)');
doc.moveDown();
doc.fontSize(10).text('This is a test report.');
doc.end();

writeStream.on('finish', () => {
  console.log('Done');
  const stats = fs.statSync('/Users/a21/gemini-field-assistant/minimal-test.pdf');
  console.log('Size:', stats.size, 'bytes');
});
