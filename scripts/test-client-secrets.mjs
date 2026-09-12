import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Poison every historical key name with an unmistakably fake marker. Never read real keys.
const env = { ...process.env };
for (const key of ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'TOGETHER_API_KEY', 'HUGGINGFACE_API_KEY', 'HF_API_KEY', 'OPENAI_API_KEY']) {
  for (const name of [key, `VITE_${key}`]) env[name] = `sa21-secret-sentinel-${name}`;
}
const outDir = mkdtempSync(path.join(tmpdir(), 'sa21-client-proof-'));
const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir'], { env, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
const scan = spawnSync(process.execPath, ['scripts/check-client-secrets.mjs', outDir], { stdio: 'inherit' });
console.log(`Proof artifacts retained at ${outDir}`);
process.exit(scan.status ?? 1);
