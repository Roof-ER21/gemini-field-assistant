/**
 * Script to create starter DOCX templates for Carbone.
 * Run: node server/templates/create-templates.mjs
 *
 * Uses JSZip to create minimal DOCX files with Carbone {d.field} placeholders.
 * Replace these with professionally designed templates later.
 */

import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeDocx(bodyXml) {
  const zip = new JSZip();

  // Minimal [Content_Types].xml
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  // _rels/.rels
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  // word/document.xml
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`);

  // word/_rels/document.xml.rels
  zip.folder('word').folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

  return zip;
}

function p(text, bold = false, size = 24) {
  const rPr = bold ? `<w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr>` : `<w:rPr><w:sz w:val="${size}"/></w:rPr>`;
  return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function spacer() {
  return `<w:p/>`;
}

const templates = {
  'inspection-agreement.docx': [
    p('ROOF-ER INSPECTION AGREEMENT', true, 32),
    spacer(),
    p('Date: {d.date}'),
    spacer(),
    p('Customer Information', true, 28),
    p('Name: {d.customerName}'),
    p('Address: {d.customerAddress}'),
    p('Phone: {d.customerPhone}'),
    p('Email: {d.customerEmail}'),
    spacer(),
    p('Representative: {d.repName}'),
    p('Rep Phone: {d.repPhone}'),
    spacer(),
    p('I, {d.customerName}, authorize ROOF-ER to perform a comprehensive inspection of the property located at {d.customerAddress}. This inspection will include examination of the roof, siding, gutters, and related exterior components for storm damage or wear.'),
    spacer(),
    p('This authorization is granted freely and does not obligate the property owner to any repair services.'),
    spacer(),
    spacer(),
    p('____________________________          ____________________________'),
    p('Customer Signature                              Date'),
    spacer(),
    p('____________________________          ____________________________'),
    p('ROOF-ER Representative                         Date'),
  ].join('\n'),

  'insurance-scope.docx': [
    p('INSURANCE SCOPE OF WORK', true, 32),
    spacer(),
    p('Date: {d.date}'),
    p('Insurance Company: {d.insuranceCompany}'),
    p('Claim Number: {d.claimNumber}'),
    spacer(),
    p('Property Owner: {d.customerName}'),
    p('Property Address: {d.customerAddress}'),
    spacer(),
    p('Scope of Work', true, 28),
    spacer(),
    p('{d.lineItems[i].description}    Qty: {d.lineItems[i].quantity} {d.lineItems[i].unit}    @ ${d.lineItems[i].unitPrice}    = ${d.lineItems[i].total}'),
    spacer(),
    p('Total: ${d.totalAmount}', true),
  ].join('\n'),

  'homeowner-letter.docx': [
    p('ROOF-ER', true, 36),
    p('The Roof Docs LLC', false, 20),
    spacer(),
    p('{d.date}'),
    spacer(),
    p('Dear {d.customerName},'),
    spacer(),
    p('Thank you for allowing us to inspect your property at {d.customerAddress}. Following the recent storm activity ({d.stormDates}), we conducted a thorough inspection and would like to share our findings.'),
    spacer(),
    p('Inspection Findings', true, 28),
    p('{d.findings}'),
    spacer(),
    p('Recommendations', true, 28),
    p('{d.recommendations}'),
    spacer(),
    p('Please feel free to contact us with any questions. We are here to help guide you through the insurance claim process.'),
    spacer(),
    p('Sincerely,'),
    p('{d.repName}'),
    p('ROOF-ER | The Roof Docs LLC'),
  ].join('\n'),

  'coc.docx': [
    p('CERTIFICATE OF COMPLETION', true, 32),
    spacer(),
    p('This certifies that the following work has been completed:'),
    spacer(),
    p('Property Owner: {d.customerName}'),
    p('Property Address: {d.customerAddress}'),
    p('Completion Date: {d.completionDate}'),
    spacer(),
    p('Work Performed', true, 28),
    p('{d.workPerformed[i].description}'),
    p('{d.workPerformed[i].details}'),
    spacer(),
    p('Warranty Information', true, 28),
    p('{d.warrantyInfo}'),
    spacer(),
    spacer(),
    p('____________________________          ____________________________'),
    p('{d.repName}                                        Date'),
    p('ROOF-ER Representative'),
    spacer(),
    p('____________________________          ____________________________'),
    p('{d.customerName}                                   Date'),
    p('Property Owner'),
  ].join('\n'),
};

async function main() {
  for (const [filename, body] of Object.entries(templates)) {
    const zip = makeDocx(body);
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const outPath = path.join(__dirname, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`Created: ${filename} (${buf.length} bytes)`);
  }
}

main().catch(console.error);
