#!/usr/bin/env node
/**
 * inject-footer-beagle.mjs — aplica 3 cambios al pie de página (VE + clones):
 *   1. Insignia de certificación Beagle Security bajo el botón de WhatsApp.
 *   2. rel="nofollow" ( + noopener) en TODOS los enlaces externos EXCEPTO
 *      los dominios peptidosplus.com y sus subdominios (esos conservan el
 *      link juice / autoridad propia del ecosistema).
 *   3. Títulos de las categorías del footer (Catálogo/Recursos/Soporte/Legal/Países)
 *      más grandes que los items del menú (título 11px→13px; items 14px se mantienen).
 * Idempotente: no duplica la insignia ni re-inserta nofollow ya presente.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BEAGLE_BADGE =
  '<a href="https://beaglesecurity.com/certificate/oqzlwr9sunvrplwnyeub7mrx65cjb8m1" target="_blank" rel="noopener nofollow" style="display:inline-block;margin-top:10px;" aria-label="Certificación de seguridad Beagle Security"><img src="https://cdn.beaglesecurity.com/assets/logo/grey-1x.svg" alt="Beagle certificate" width="140" height="40" loading="lazy" style="display:block;max-width:140px;height:auto;"></a>';

/** Título de categoría: 13px (antes 11px) — más grande que items (14px). */
function biggerTitle(spanTag) {
  return spanTag
    .replace(/font-size: 11px/, 'font-size: 13px')
    .replace(/font-size: calc\(11px/, 'font-size: calc(13px');
}

/** Añade rel="nofollow" a un <a> externo salvo dominios de peptidosplus.com. */
function applyNoFollow(html) {
  return html.replace(
    /<a\b([^>]*)>/gi,
    (m, attrs) => {
      // Solo enlaces absolutos externos que NO sean peptidosplus.com
      if (!/href\s*=\s*["']https?:\/\//i.test(attrs)) return m;
      if (/href\s*=\s*["']https?:\/\/([^"']*\.)?peptidosplus\.com/i.test(attrs)) return m;
      if (/\brel\s*=\s*["'][^"']*nofollow/i.test(attrs)) return m; // ya tiene nofollow
      if (/\brel\s*=\s*["'][^"']*["']/i.test(attrs)) {
        return m.replace(/\brel\s*=\s*(["'])([^"']*)\1/i, 'rel=$1$2 nofollow$1');
      }
      // Sin rel: añade rel con nofollow (+noopener/noreferrer)
      return m.replace(/<a\b/i, '<a rel="nofollow noopener noreferrer"');
    }
  );
}

/** Elimina atributos rel duplicados (deja el primero que contenga nofollow). */
function dedupeRel(html) {
  return html.replace(/<a\b[^>]*>/gi, (tag) => {
    const rels = [...tag.matchAll(/\brel\s*=\s*(["'])([^"']*)\1/gi)].map((x) => x[2]);
    if (rels.length <= 1) return tag;
    const merged = new Set(rels.flatMap((r) => r.split(/\s+/).filter(Boolean)));
    const finalRel = [...merged].join(' ');
    return tag.replace(/rel\s*=\s*["'][^"']*["']/gi, '').replace(/<a\b/i, `<a rel="${finalRel}"`);
  });
}

function collectHtml(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectHtml(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

let updated = 0;
for (const f of [...collectHtml(path.join(ROOT, 'public')), path.join(ROOT, 'src', 'cromo', 'pie.html')]) {
  if (!statSync(f).isFile()) continue;
  let html = readFileSync(f, 'utf8');

  // 1) Insignia Beagle: se inserta justo después del enlace WhatsApp (que cierra el bloque del logo).
  if (!/beaglesecurity\.com\/certificate/.test(html)) {
    const waIdx = html.indexOf('WhatsApp</a>');
    if (waIdx !== -1) {
      const closeIdx = html.indexOf('</div>', waIdx);
      if (closeIdx !== -1) html = html.slice(0, closeIdx) + BEAGLE_BADGE + html.slice(closeIdx);
    }
  }

  // 2) nofollow enlaces externos (excepto *.peptidosplus.com)
  html = applyNoFollow(html);
  html = dedupeRel(html);

  // 3) Títulos de categorías más grandes (font-size 11px → 13px en <span> de columna)
  html = html.replace(/<span style="font-family: &quot;JetBrains Mono&quot;, monospace; font-size: 11px;/g,
    '<span style="font-family: &quot;JetBrains Mono&quot;, monospace; font-size: 13px;');

  if (html !== readFileSync(f, 'utf8')) {
    writeFileSync(f, html);
    updated++;
    console.log('updated:', path.relative(ROOT, f));
  }
}
console.log(`Footer transformado en ${updated} archivos.`);
