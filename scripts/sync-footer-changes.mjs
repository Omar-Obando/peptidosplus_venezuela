/**
 * sync-footer-changes.mjs
 *
 * Applies footer fixes idempotently to every public/*.html AND src/cromo/pie.html.
 * All three replacements are safe to run repeatedly (they are no-ops once applied).
 *
 * 1. Beagle badge: grey-1x.svg -> white-1x.svg
 * 2. Column titles: font-size 13px -> 16px (footer column headers, letter-spacing uppercase block)
 * 3. Country links: strip `rel="nofollow noopener"` from internal *.peptidosplus.com anchors
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');
const footerFile = join(root, 'src', 'cromo', 'pie.html');

/** @type {Array<[RegExp, string]>} */
const replacements = [
  // 1. Beagle badge color
  [/grey-1x\.svg/g, 'white-1x.svg'],
  // 2. Column title font-size 13px -> 16px (footer column headers)
  [
    /font-size: 13px; font-weight: 600; letter-spacing: 0\.12em; text-transform: uppercase/g,
    'font-size: 16px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase',
  ],
  // 3. Country links (internal subdomains): drop rel="nofollow noopener"
  [
    /rel="nofollow noopener" href="https:\/\/(ve|colombia|ni|pa|us|es)\.peptidosplus\.com"/g,
    'href="https://$1.peptidosplus.com"',
  ],
];

/** Apply all replacements to a single file; report changed count. */
function processFile(file) {
  const original = readFileSync(file, 'utf8');
  let content = original;
  for (const [re, rep] of replacements) {
    content = content.replace(re, rep);
  }
  let changed = 0;
  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    changed = 1;
  }
  return changed;
}

let changedCount = 0;
let processed = 0;

const files = readdirSync(publicDir)
  .filter((f) => extname(f) === '.html')
  .map((f) => join(publicDir, f));
files.push(footerFile);

for (const file of files) {
  processed += 1;
  changedCount += processFile(file);
}

console.log(`Processed ${processed} files. Modified ${changedCount}.`);
