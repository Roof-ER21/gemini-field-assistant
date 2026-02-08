/**
 * Generate Custom Branded QR Codes for Roof Docs Reps
 *
 * Usage: node scripts/generate-qr-codes.js
 *
 * Generates styled QR codes with:
 * - Roof Docs logo in center
 * - Brand colors (red/black)
 * - High quality PNG output
 */

import QRCode from 'qrcode';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Brand colors
const BRAND_RED = '#DC2626';
const BRAND_BLACK = '#171717';

// Base URL for profiles
const BASE_URL = 'https://sa21.up.railway.app/profile';

// Reps to generate QR codes for
const REPS = [
  { name: 'Ben Salgado', slug: 'ben-salgado' },
  { name: 'Andre Mealy', slug: 'andre-mealy' },
  { name: 'Richie Riley', slug: 'richie-riley' },
  { name: 'Miguel Ocampo', slug: 'miguel-ocampo' },
];

// Output directory
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'qr-codes');
const LOGO_PATH = path.join(__dirname, '..', 'public', 'roofer-logo-icon.png');

async function generateQRCode(rep) {
  const url = `${BASE_URL}/${rep.slug}`;
  console.log(`Generating QR code for ${rep.name}: ${url}`);

  // Generate QR code as PNG buffer with custom colors
  const qrBuffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: 1000,
    margin: 2,
    errorCorrectionLevel: 'H', // High - allows up to 30% damage (for logo overlay)
    color: {
      dark: BRAND_BLACK,
      light: '#FFFFFF',
    },
  });

  // Load QR code and logo
  const qrImage = sharp(qrBuffer);
  const qrMetadata = await qrImage.metadata();

  // Resize logo to fit in center (about 25% of QR code size)
  const logoSize = Math.floor(qrMetadata.width * 0.25);
  const logoBuffer = await sharp(LOGO_PATH)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toBuffer();

  // Calculate logo position (centered)
  const logoX = Math.floor((qrMetadata.width - logoSize) / 2);
  const logoY = Math.floor((qrMetadata.height - logoSize) / 2);

  // Create white circle background for logo
  const circleSize = logoSize + 20;
  const circleBuffer = await sharp({
    create: {
      width: circleSize,
      height: circleSize,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  // Composite: QR + white circle + logo
  const circleX = Math.floor((qrMetadata.width - circleSize) / 2);
  const circleY = Math.floor((qrMetadata.height - circleSize) / 2);

  const outputPath = path.join(OUTPUT_DIR, `${rep.slug}-qr.png`);

  await sharp(qrBuffer)
    .composite([
      {
        input: circleBuffer,
        left: circleX,
        top: circleY,
      },
      {
        input: logoBuffer,
        left: logoX,
        top: logoY,
      },
    ])
    .png()
    .toFile(outputPath);

  console.log(`  ✓ Saved to ${outputPath}`);
  return outputPath;
}

async function generateStyledQRCode(rep) {
  const url = `${BASE_URL}/${rep.slug}`;
  console.log(`Generating styled QR code for ${rep.name}: ${url}`);

  // Generate base QR code
  const qrBuffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: 1000,
    margin: 3,
    errorCorrectionLevel: 'H',
    color: {
      dark: BRAND_BLACK,
      light: '#FFFFFF',
    },
  });

  const qrMetadata = await sharp(qrBuffer).metadata();

  // Resize logo
  const logoSize = Math.floor(qrMetadata.width * 0.22);
  const logoBuffer = await sharp(LOGO_PATH)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toBuffer();

  // Create rounded rectangle background for logo (brand style)
  const bgSize = logoSize + 30;
  const bgSvg = `
    <svg width="${bgSize}" height="${bgSize}">
      <rect x="0" y="0" width="${bgSize}" height="${bgSize}" rx="20" ry="20" fill="white" stroke="${BRAND_RED}" stroke-width="4"/>
    </svg>
  `;

  const bgBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();

  // Position calculations
  const bgX = Math.floor((qrMetadata.width - bgSize) / 2);
  const bgY = Math.floor((qrMetadata.height - bgSize) / 2);
  const logoX = Math.floor((qrMetadata.width - logoSize) / 2);
  const logoY = Math.floor((qrMetadata.height - logoSize) / 2);

  // Add a red border/frame around the entire QR code
  const frameSize = qrMetadata.width + 40;
  const frameSvg = `
    <svg width="${frameSize}" height="${frameSize}">
      <rect x="0" y="0" width="${frameSize}" height="${frameSize}" rx="30" ry="30" fill="white"/>
      <rect x="5" y="5" width="${frameSize - 10}" height="${frameSize - 10}" rx="25" ry="25" fill="none" stroke="${BRAND_RED}" stroke-width="8"/>
    </svg>
  `;

  const frameBuffer = await sharp(Buffer.from(frameSvg)).png().toBuffer();

  const outputPath = path.join(OUTPUT_DIR, `${rep.slug}-qr-styled.png`);

  // Composite all layers
  await sharp(frameBuffer)
    .composite([
      {
        input: qrBuffer,
        left: 20,
        top: 20,
      },
      {
        input: bgBuffer,
        left: bgX + 20,
        top: bgY + 20,
      },
      {
        input: logoBuffer,
        left: logoX + 20,
        top: logoY + 20,
      },
    ])
    .png()
    .toFile(outputPath);

  console.log(`  ✓ Saved styled version to ${outputPath}`);
  return outputPath;
}

async function main() {
  console.log('\n🎨 Generating Custom Roof Docs QR Codes\n');
  console.log('Brand Colors: Red (#DC2626), Black (#171717)');
  console.log('Features: Logo center, Red border frame\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const generated = [];

  for (const rep of REPS) {
    try {
      // Generate both basic and styled versions
      await generateQRCode(rep);
      const styledPath = await generateStyledQRCode(rep);
      generated.push({ rep, outputPath: styledPath });
    } catch (error) {
      console.error(`  ✗ Error generating for ${rep.name}:`, error.message);
    }
  }

  console.log(`\n✅ Generated ${generated.length * 2} QR codes in ${OUTPUT_DIR}\n`);

  // Print summary
  console.log('Generated QR Codes:');
  REPS.forEach((rep) => {
    console.log(`  - ${rep.name}:`);
    console.log(`      Basic:  ${rep.slug}-qr.png`);
    console.log(`      Styled: ${rep.slug}-qr-styled.png`);
  });

  console.log(`\n📁 Output folder: ${OUTPUT_DIR}`);
}

main().catch(console.error);
