import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const PUBLIC = path.join(ROOT, 'public');

const FLEX_OP = 'display: flex; flex-wrap: wrap; gap: 10px;';
const FLEX_OP_TARGET = 'display: flex; flex-direction: column; align-items: flex-start; gap: 14px;';

const files = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let flexCount = 0;
let greyCount = 0;

for (const f of files) {
  const p = path.join(PUBLIC, f);
  let html = fs.readFileSync(p, 'utf8');
  const original = html;

  // Only transform the footer WhatsApp+Beagle container: the flex-wrap div that
  // is immediately followed (within the same div) by the WhatsApp anchor and the
  // beaglesecurity anchor.
  const flexRe = new RegExp(
    `(<div style="display: flex; flex-wrap: wrap; gap: 10px;">)(<a[^>]*href="https://wa\\.me/[^"]*"[^>]*>[\\s\\S]*?<a[^>]*href="https://beaglesecurity\\.com[^"]*"[^>]*>[\\s\\S]*?</a>)</div>`,
  );
  html = html.replace(flexRe, (_m, open, inner) => {
    flexCount++;
    return `<div style="${FLEX_OP_TARGET}">${inner}</div>`;
  });

  // Replace black-1x.svg -> grey-1x.svg only in the beaglesecurity footer context
  // (i.e. within a beaglesecurity anchor).
  const beagleRe = /(<a[^>]*href="https:\/\/beaglesecurity\.com[^"]*"[^>]*>[^<]*<img src="https:\/\/cdn\.beaglesecurity\.com\/assets\/logo\/)black-1x\.svg/g;
  html = html.replace(beagleRe, (_m, prefix) => {
    greyCount++;
    return `${prefix}grey-1x.svg`;
  });

  if (html !== original) {
    fs.writeFileSync(p, html, 'utf8');
    console.log(`updated: ${f}`);
  }
}

console.log(`done. flex containers transformed: ${flexCount}; grey badges: ${greyCount}`);
