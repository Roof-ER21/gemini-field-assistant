import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function scan(content?: string, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sa21-scanner-fixture-'));
  dirs.push(dir);
  if (content !== undefined) writeFileSync(join(dir, 'fixture.js'), content);
  return spawnSync(process.execPath, ['scripts/check-client-secrets.mjs', dir], {
    env: { ...process.env, ...env }, encoding: 'utf8',
  });
}
it('detects an opaque configured key without printing it', () => {
  const fake = 'opaque-provider-fixture-123456789';
  const result = scan(`const key = '${fake}';`, { TOGETHER_API_KEY: fake });
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).toContain('fixture.js');
  expect(result.stdout + result.stderr).not.toContain(fake);
});
it('passes clean artifacts and fails closed for an empty artifact directory', () => {
  expect(scan('export const publicValue = true;').status).toBe(0);
  expect(scan().status).not.toBe(0);
});
it('recognizes current Together key prefixes without environment assistance', () => {
  const fake = 'tgp_v1_' + 'x'.repeat(40);
  const result = scan(`const fixture = '${fake}';`);
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).not.toContain(fake);
});
