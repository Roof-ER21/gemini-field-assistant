/**
 * Generate placeholder PWA icons
 * Creates simple colored squares as placeholders
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

// Simple SVG icon template
const createSVGIcon = (size) => `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#8B0000"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="${size * 0.3}" fill="white" font-family="Arial, sans-serif" font-weight="bold">S21</text>
</svg>`;

// Generate icons
const sizes = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 180, name: 'apple-touch-icon.png' }
];

console.log('Generating PWA icons...');

// For now, just create SVG versions (convert to PNG manually if needed)
sizes.forEach(({ size, name }) => {
  const svgName = name.replace('.png', '.svg');
  const svg = createSVGIcon(size);
  const svgPath = path.join(publicDir, svgName);

  fs.writeFileSync(svgPath, svg);
  console.log(`Created ${svgName}`);
});

console.log('✓ Icon generation complete!');
console.log('Note: These are SVG placeholders. Convert to PNG for production or replace with actual logo.');
