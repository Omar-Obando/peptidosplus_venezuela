import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'public';
const files = readdirSync(dir).filter((f) => f.endsWith('.html') && statSync(join(dir, f)).isFile());

const TITLE = 'font-size: 17px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgb(233, 196, 106); margin-bottom: 6px; padding-bottom: 8px; border-bottom: 1px solid rgba(233, 196, 106, 0.35);"><span class="sc-interp">Catálogo</span></span>';
const ANCHOR = '\n          <a href="/tienda" data-pp-pie="" class="scpb" style="color: rgb(201, 213, 230); font-size: 14px; line-height: 1.4;"><span class="sc-interp">Todos los productos</span></a>';

const OLD = TITLE + ANCHOR;
const NEW = TITLE.replace('>Catálogo</span>', '>Recursos</span>') + ANCHOR;

let totalModified = 0;
const modified = [];

for (const f of files) {
  const p = join(dir, f);
  let src = readFileSync(p, 'utf8');
  if (src.includes(OLD)) {
    src = src.split(OLD).join(NEW);
    writeFileSync(p, src);
    totalModified++;
    modified.push(f);
  }
}

console.log(`Files processed: ${files.length}`);
console.log(`Files modified:   ${totalModified}`);
for (const f of modified) console.log(`  - ${f}`);
