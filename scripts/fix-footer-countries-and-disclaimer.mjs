#!/usr/bin/env node
/**
 * fix-footer-countries-and-disclaimer.mjs
 *  1) Reordena la columna Países del pie: Venezuela, Nicaragua, Colombia, Panamá, España, USA.
 *  2) Refuerza el descargo de responsabilidad (responsabilidad de dosis/cadena de
 *     refrigeración/uso + recomendación de obtener consejo profesional/médico).
 * Aplica a src/cromo/pie.html y a todos los public/*.html; y al texto del descargo.
 * Idempotente.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 1) Reordenar Países ----------
const ORDER = [
  { host: 've.peptidosplus.com', label: 'Venezuela', soon: false },
  { host: 'ni.peptidosplus.com', label: 'Nicaragua', soon: false },
  { host: 'colombia.peptidosplus.com', label: 'Colombia', soon: false },
  { host: 'pa.peptidosplus.com', label: 'Panamá', soon: false },
  { host: 'es.peptidosplus.com', label: 'España', soon: false },
  { host: 'us.peptidosplus.com', label: 'USA', soon: false },
];

const CLR_LINK = 'rgb(201, 213, 230)';
const CLR_SOON = 'rgb(143, 162, 190)';

function itemHtml(c) {
  const label = c.soon ? `${c.label} (próximamente)` : c.label;
  const color = c.soon ? CLR_SOON : CLR_LINK;
  const href = `<a href="https://${c.host}" data-pp-pie="" class="scpb" style="color: ${color}; font-size: 14px; line-height: 1.4;"><span class="sc-interp">${label}</span></a>`;
  return href;
}

function reorderCountries(html) {
  // Detectar si existe la columna (marcador de título Países).
  const hasCol = /<span class="sc-interp">Países<\/span><\/span>/.test(html);
  if (!hasCol) return html;

  // Extraer los 6 ítems actuales (anchor o span "próximamente"), respetando el orden de aparición.
  const itemRe = /<a\b[^>]*href="https:\/\/([a-z]+\.peptidosplus\.com)"[^>]*>[^]*?<\/a>|<span[^>]*class="scpb"[^>]*><span class="sc-interp">(Venezuela|Nicaragua|Colombia|Panamá|España|USA) \(próximamente\)<\/span><\/span>/g;
  const found = new Map();
  let m;
  while ((m = itemRe.exec(html)) !== null) {
    if (m[1]) {
      const host = m[1];
      found.set(host, m[0]);
    } else if (m[2]) {
      const name = m[2];
      // Mapear nombre → host para los que vienen como span "próximamente".
      const hostByLabel = {
        Venezuela: 've.peptidosplus.com',
        Nicaragua: 'ni.peptidosplus.com',
        Colombia: 'colombia.peptidosplus.com',
        Panamá: 'pa.peptidosplus.com',
        España: 'es.peptidosplus.com',
        USA: 'us.peptidosplus.com',
      };
      const h = hostByLabel[name];
      if (h && !found.has(h)) found.set(h, m[0]);
    }
  }

  // Si no están las 6, usar el bloque existente (no reordenar a medias).
  if (found.size < 6) return html;

  // Combinar: los que ya están enlazados (ve/ni) usan su anchor; los demás el marcador "próximamente".
  function htmlFor(c) {
    const existing = found.get(c.host);
    if (existing) return existing;
    return `<span class="scpb" style="color: ${CLR_SOON}; font-size: 14px; line-height: 1.4;"><span class="sc-interp">${c.label} (próximamente)</span></span>`;
  }

  const joined = ORDER.map(htmlFor).join('');
  // Reemplazar el bloque de ítems: desde el cierre del título Países hasta el </div> de la columna.
  const re = /(<span class="sc-interp">Países<\/span><\/span>\s*)([\s\S]*?)(<\/div>)/;
  if (!re.test(html)) return html;
  html = html.replace(re, (_m, prefix, _items, closing) => `${prefix}${joined}${closing}`);
  return html;
}

// ---------- 2) Reforzar descargo ----------
const EXTRA =
  '<p style="font-weight:600;color:rgb(233,196,106);">Responsabilidad que asumes al adquirir estos materiales</p><p>Al adquirir un péptido de investigación aceptas que <b>eres el único responsable de la dosis empleada en tu investigación</b>, de la <b>cadena de refrigeración y del correcto almacenamiento</b> del producto desde que lo recibes, y de <b>cualquier uso que se le dé</b> al material. La manipulación, reconstitución, dosificación y conservación quedan bajo tu exclusiva responsabilidad.</p><p><b>Recomendamos encarecidamente obtener recomendación profesional o médica</b> antes de iniciar cualquier protocolo o estudio, y trabajar siempre en un entorno de investigación controlado y conforme a la normativa aplicable en tu jurisdicción.</p>';

function strengthenDisclaimer(html) {
  const marker = 'Responsabilidad que asumes al adquirir estos materiales';
  if (html.includes(marker)) return html; // ya aplicado
  // Insertar justo antes de la sección o al final del listado de ítems.
  const insertAfter = html.lastIndexOf('</article>');
  if (insertAfter === -1) return html;
  return html.slice(0, insertAfter) + EXTRA + html.slice(insertAfter);
}

function collectHtml(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectHtml(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

// ---------- Ejecutar ----------
let countriesFiles = 0;
let disclaimerFiles = 0;

const htmlFiles = [...collectHtml(path.join(ROOT, 'public')), path.join(ROOT, 'src', 'cromo', 'pie.html')];
for (const f of htmlFiles) {
  if (!existsSync(f)) continue;
  const before = readFileSync(f, 'utf8');
  let out = reorderCountries(before);
  if (out !== before) writeFileSync(f, out), countriesFiles++;

  // Descargo: solo en el archivo de la página de descargo.
  if (String(f).endsWith('descargo-de-responsabilidad.html')) {
    const b2 = readFileSync(f, 'utf8');
    const o2 = strengthenDisclaimer(b2);
    if (o2 !== b2) writeFileSync(f, o2), disclaimerFiles++;
  }
}

// Asegurar el descargo incluso si no existe el archivo (crear/actualizar desde terminos).
const discFile = path.join(ROOT, 'public', 'descargo-de-responsabilidad.html');
if (!existsSync(discFile)) {
  console.log('descargo-de-responsabilidad.html NO EXISTE — generar desde terminos.html (revisar)');
}

console.log(`columna Países reordenada en ${countriesFiles} archivos`);
console.log(`descargo reforzado en ${disclaimerFiles} archivos`);
