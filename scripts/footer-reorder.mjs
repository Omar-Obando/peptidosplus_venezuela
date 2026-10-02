#!/usr/bin/env node
/**
 * footer-reorder.mjs — mueve "Todos los productos" a la columna "Recursos" y
 * borra la columna "Catálogo" del footer (SRR pie.html + 74 public/*.html).
 * El orden queda: Recursos → Soporte → Legal → Países (Países 4to lugar).
 * Idempotente y seguro: solo actúa si existe la columna Catálogo con su enlace.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectHtml(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectHtml(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/**
 * Procesa UNA columna Catálogo a la vez. Devuelve el HTML con esa columna
 * eliminada y el enlace "Todos los productos" insertado al final de Recursos.
 * Si no hay una columna Catálogo con su enlace, devuelve el html sin cambios.
 */
function processOnce(html) {
  // Bloques: <div ...><span ...>Catálogo</span> <a ...>...Todos los productos</a> </div>
  const catBlockRe =
    /<div style="display: flex; flex-direction: column; gap: 14px;">\s*<span[^>]*><span class="sc-interp">Catálogo<\/span><\/span>\s*(<a[^>]*href="\/tienda"[^>]*>[^]*?Todos los productos<\/span><\/a>)\s*<\/div>/i;
  const m = html.match(catBlockRe);
  if (!m) return html; // sin columna Catálogo -> no-op (idempotente)
  const prodLink = m[1];

  // Eliminar la columna Catálogo completa.
  html = html.replace(catBlockRe, '');

  // Insertar el enlace al final de la columna Recursos.
  const recEndRe =
    /(<div style="display: flex; flex-direction: column; gap: 14px;">\s*<span[^>]*><span class="sc-interp">Recursos<\/span><\/span>\s*<a[^>]*href="\/certificados\.html"[^>]*>[^]*?Certificados de análisis<\/span><\/a>\s*<a[^>]*href="\/blog"[^>]*>[^]*?Artículos y revisiones<\/span><\/a>)/i;
  if (recEndRe.test(html)) {
    html = html.replace(recEndRe, `$1${prodLink}`);
  } else {
    // Sin blog: insertar tras el título Recursos.
    const recRe =
      /(<div style="display: flex; flex-direction: column; gap: 14px;">\s*<span[^>]*><span class="sc-interp">Recursos<\/span><\/span>)/i;
    html = html.replace(recRe, `$1${prodLink}`);
  }

  return html;
}

function process(html) {
  // Procesa TODAS las columnas Catálogo (index.html tiene 2 footers).
  let prev = null;
  while (prev !== html) {
    prev = html;
    html = processOnce(html);
  }
  return html;
}

let modified = 0;
const targets = [...collectHtml(path.join(ROOT, 'public')), path.join(ROOT, 'src', 'cromo', 'pie.html')];
for (const f of targets) {
  const html = readFileSync(f, 'utf8');
  const out = process(html);
  if (out !== html) {
    writeFileSync(f, out);
    modified++;
  }
}
console.log(`Footer reordenado (Catálogo -> Recursos) en ${modified} archivos.`);
