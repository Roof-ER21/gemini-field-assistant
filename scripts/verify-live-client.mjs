import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Run AFTER deploying this checkout, BEFORE rotating. Does not print remote source.
const origin = process.argv[2] || 'https://sa21.theroofdocs.com';
const scan = spawnSync(process.execPath, ['scripts/check-client-secrets.mjs'], { stdio: 'inherit' });
if (scan.status !== 0) process.exit(scan.status || 1);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function read(url) {
  const response = await fetch(new URL(url, origin), { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response;
}
for (const file of ['index.html', 'sw.js', 'manifest.json']) {
  const response = await read(`/${file}`);
  if (!/no-cache|no-store/.test(response.headers.get('cache-control') || '')) throw new Error(`Stale cache policy: ${file}`);
  const local = fs.readFileSync(path.join('dist', file));
  if (digest(local) !== digest(Buffer.from(await response.arrayBuffer()))) throw new Error(`Live file differs from this build: ${file}`);
}
const files = fs.readdirSync('dist/assets').filter(file => /\.(js|mjs)$/.test(file));
// Every emitted JS chunk, including lazily loaded features, must match the scanned build.
for (let index = 0; index < files.length; index += 4) {
  await Promise.all(files.slice(index, index + 4).map(async file => {
    const response = await read(`/assets/${file}`);
    if (digest(fs.readFileSync(path.join('dist/assets', file))) !== digest(Buffer.from(await response.arrayBuffer()))) {
      throw new Error(`Live chunk differs from clean build: ${file}`);
    }
  }));
}
console.log(`Live verification passed: 3 update files and ${files.length} JS chunks match this scanned build.`);
console.log('Now rotate/revoke the exposed keys. Cached older bundles remain compromised until revocation.');
