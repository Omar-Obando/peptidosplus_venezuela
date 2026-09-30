#!/usr/bin/env node
/**
 * unlink-footer-countries.mjs — quita los enlaces a países cuyos sitios aún no
 * existen (colombia/pa/us/es.peptidosplus.com) para que no cuenten como URL rota.
 * Esos países quedan como texto "(próximamente)" sin <a href>.
 * Mantiene enlazados ve.peptidosplus.com y ni.peptidosplus.com.
 * Idempotente.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const UNLINK = [
  { host: 'colombia.peptidosplus.com', label: 'Colombia' },
  { host: 'pa.peptidosplus.com', label: 'Panamá' },
  { host: 'us.peptidosplus.com', label: 'USA' },
  { host: 'es.peptidosplus.com', label: 'España' },
];

function unlink(html) {
  for (const c of UNLINK) {
    const re = new RegExp(
      `<a[^>]*href=["']?https://${c.host.replace(/\./g, '\\.')}/?["']?[^>]*>(<span class="sc-interp">([^<]*)</span>)</a>`,
      'gi'
    );
    html = html.replace(re, (m, inner, label) => {
      const text = /próximamente/i.test(label) ? label : `${label} (próximamente)`;
      return `<span class="scpb" style="color: rgb(143, 162, 190); font-size: 14px; line-height: 1.4;"><span class="sc-interp">${text}</span></span>`;
    });
  }
  return html;
}

function collectHtml(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectHtml(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

let modified = 0;
const targets = [...collectHtml(path.join(ROOT, 'public')), path.join(ROOT, 'src', 'cromo', 'pie.html')];
for (const f of targets) {
  const html = readFileSync(f, 'utf8');
  const out = unlink(html);
  if (out !== html) {
    writeFileSync(f, out);
    modified++;
    console.log('unlinked:', path.relative(ROOT, f));
  }
}
console.log(`URLs de países no disponibles desenlazadas en ${modified} archivos.`);
