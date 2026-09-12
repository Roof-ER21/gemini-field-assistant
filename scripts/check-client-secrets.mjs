import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || 'dist';
const patterns = [/AIza[0-9A-Za-z_-]{35,}/, /gsk_[0-9A-Za-z]{40,}/, /tgp_[0-9A-Za-z_-]{30,}/, /hf_[0-9A-Za-z]{30,}/, /sk-(?:proj-)?[0-9A-Za-z_-]{32,}/, /sa21-secret-sentinel-/];
// Some providers do not use a recognizable prefix. Compare configured values in
// memory too; report file paths only, never the value or matching source line.
const configuredSecrets = ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY',
  'TOGETHER_API_KEY', 'HF_API_KEY', 'HUGGINGFACE_API_KEY', 'OPENAI_API_KEY']
  .flatMap(name => [name, `VITE_${name}`])
  .map(name => process.env[name]).filter(value => value && value.length > 12);
let checked = 0;
let failures = 0;
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(?:js|mjs|html|map|json)$/.test(entry.name)) {
      checked++;
      const content = fs.readFileSync(file, 'utf8');
      if (patterns.some(pattern => pattern.test(content)) || configuredSecrets.some(secret => content.includes(secret))) {
        // Report paths only; never print a credential or matching line.
        console.error(`Provider credential pattern detected: ${file}`);
        failures++;
      }
    }
  }
}
scan(root);
if (!checked) throw new Error('No client artifacts found');
console.log(`Client credential scan: ${checked} artifacts, ${failures} failures.`);
process.exitCode = failures ? 1 : 0;
