/**
 * One-shot dependency installer for this workspace.
 *
 * Runs `npm install` in the project root WITHOUT saving to package.json
 * (deps are already declared) and without writing package-lock.json.
 * Only node_modules is modified.
 *
 * Usage: node scripts/install-deps.mjs
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  execSync('npm install --no-save --package-lock=false --no-audit --no-fund', {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32' ? 'cmd.exe' : 'sh',
  });
  console.log('[install-deps] done');
} catch (err) {
  console.error('[install-deps] failed:', err.message);
  process.exit(1);
}
