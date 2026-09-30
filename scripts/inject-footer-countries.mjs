#!/usr/bin/env node
/**
 * inject-footer-countries.mjs — inserta la columna "Países" en el pie de página
 * de todas las páginas estáticas (public/*.html) y del cromo SSR (src/cromo/pie.html),
 * después del bloque "Legal". Idempotente: no duplica si ya existe "Países".
 *
 * Países: Venezuela, Colombia, Nicaragua, Panamá (próximamente), USA (próximamente),
 *         España (próximamente). Hrefs: subdominios ve/colombia/ni/pa/us/es.
 * El país activo del sitio (arg 1: 'VE' | 'NI' | 'CO') se muestra en color claro;
 * los demás en gris.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACTIVE = (process.argv[2] || 'VE').toUpperCase();

const COUNTRIES = [
  { code: 'VE', label: 'Venezuela', host: 've.peptidosplus.com', soon: false },
  { code: 'CO', label: 'Colombia', host: 'colombia.peptidosplus.com', soon: false },
  { code: 'NI', label: 'Nicaragua', host: 'ni.peptidosplus.com', soon: false },
  { code: 'PA', label: 'Panamá', host: 'pa.peptidosplus.com', soon: true },
  { code: 'US', label: 'USA', host: 'us.peptidosplus.com', soon: true },
  { code: 'ES', label: 'España', host: 'es.peptidosplus.com', soon: true },
];

const CLR_ACTIVE = 'rgb(201, 213, 230)';
const CLR_SOON = 'rgb(143, 162, 190)';

function countryLinks() {
  return COUNTRIES.map((c) => {
    const color = c.code === ACTIVE ? CLR_ACTIVE : CLR_SOON;
    const label = c.label + (c.soon ? ' (próximamente)' : '');
    return (
      `<a href="https://${c.host}" data-pp-pie="" class="scpb" style="color: ${color}; font-size: 14px; line-height: 1.4;">` +
      `<span class="sc-interp">${label}</span></a>`
    );
  }).join('');
}

const COUNTRIES_COLUMN =
  `\n        <div style="display: flex; flex-direction: column; gap: 14px;">` +
  `\n          <span style="font-family: &quot;JetBrains Mono&quot;, monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgb(233, 196, 106); margin-bottom: 4px;"><span class="sc-interp">Países</span></span>` +
  countryLinks() +
  `\n        </div>`;

function collectHtml(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectHtml(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function insertAfterLegal(html) {
  if (/<span class="sc-interp">Países<\/span>/.test(html)) return html; // ya existe
  // Inserta la columna justo antes del cierre de las columnas (después del bloque Legal).
  const legalIdx = html.lastIndexOf('<span class="sc-interp">Legal</span>');
  if (legalIdx === -1) return html; // sin bloque Legal -> no insertar
  // Encuentra el cierre del div de la columna Legal: </div> después del Legal block.
  const afterLegal = html.indexOf('</div>', legalIdx);
  if (afterLegal === -1) return html;
  return html.slice(0, afterLegal) + COUNTRIES_COLUMN + html.slice(afterLegal);
}

let updated = 0;
const targets = [...collectHtml(path.join(ROOT, 'public')), path.join(ROOT, 'src', 'cromo', 'pie.html')];
for (const f of targets) {
  if (!statSync(f).isFile()) continue;
  const html = readFileSync(f, 'utf8');
  const out = insertAfterLegal(html);
  if (out !== html) {
    writeFileSync(f, out);
    updated++;
    console.log('updated:', path.relative(ROOT, f));
  }
}
console.log(`Columna "Países" insertada en ${updated} archivos (país activo: ${ACTIVE}).`);
