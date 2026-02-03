import * as PDFKit from 'pdfkit';
import * as fs from 'fs';

const PDFDocument = (PDFKit as any).default || PDFKit;

// Test 1: No footer
const doc1 = new PDFDocument({ size: 'LETTER', margin: 40 });
doc1.pipe(fs.createWriteStream('/Users/a21/gemini-field-assistant/test-no-footer.pdf'));
doc1.fontSize(20).text('Test Document');
doc1.fontSize(12).text('Content here');
doc1.end();

// Test 2: Footer within page
const doc2 = new PDFDocument({ size: 'LETTER', margin: 40 });
doc2.pipe(fs.createWriteStream('/Users/a21/gemini-field-assistant/test-footer-ok.pdf'));
doc2.fontSize(20).text('Test Document');
doc2.fontSize(12).text('Content here');
// Footer at Y=700 (page height is 792, margin 40, so usable = 752)
doc2.fontSize(8).text('Footer text', 40, 700);
doc2.end();

// Test 3: Footer too low
const doc3 = new PDFDocument({ size: 'LETTER', margin: 40 });
doc3.pipe(fs.createWriteStream('/Users/a21/gemini-field-assistant/test-footer-low.pdf'));
doc3.fontSize(20).text('Test Document');
doc3.fontSize(12).text('Content here');
// Footer at Y=760 
doc3.fontSize(8).text('Footer text', 40, 760);
doc3.end();

setTimeout(() => {
  console.log('No footer:', fs.statSync('/Users/a21/gemini-field-assistant/test-no-footer.pdf').size, 'bytes');
  console.log('Footer OK:', fs.statSync('/Users/a21/gemini-field-assistant/test-footer-ok.pdf').size, 'bytes');
  console.log('Footer Low:', fs.statSync('/Users/a21/gemini-field-assistant/test-footer-low.pdf').size, 'bytes');
}, 300);
