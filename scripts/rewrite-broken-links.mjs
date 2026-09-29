#!/usr/bin/env node
/**
 * scripts/rewrite-broken-links.mjs
 *
 * Re-escribe enlaces internos rotos en public/*.html:
 *   /store, /store.html, /store?x  → /tienda
 *   /index                          → /
 *   /faq, /faq#x                    → /preguntas-frecuentes (con el ancla)
 *   /{pagina}.html                  → /{pagina}  (certificados, privacidad,
 *                                   terminos, uso-investigacion, contacto,
 *                                   checkout, carrito, etc.)
 * Idempotente.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

// Páginas que se sirven limpia (/{pagina}) y no deben enlazarse con .html
const CLEAN_PAGES = new Set([
  'certificados', 'privacidad', 'terminos', 'uso-investigacion', 'contacto',
  'checkout', 'carrito', 'faq', 'preguntas-frecuentes',
]);
// Páginas cuyo alias es distinto
const ALIASES = { faq: 'preguntas-frecuentes' };

const files = readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let changed = 0;
for (const f of files) {
  const full = path.join(PUBLIC, f);
  let html = readFileSync(full, 'utf8');
  const before = html;

  // /store o /store.html → /tienda
  html = html.replace(/href="\/store(?:\.html)?(\?[^"]*)?(#[^"]*)?"/gi, (m, q, h) => 'href="/tienda' + (q || '') + (h || '') + '"');
  // /index → /
  html = html.replace(/href="\/index(\?[^"]*)?(#[^"]*)?"/gi, (m, q, h) => 'href="/' + (q || '') + (h || '') + '"');
  // /faq... → /preguntas-frecuentes...
  html = html.replace(/href="\/faq(#[^"]*)?"/gi, (m, h) => 'href="/preguntas-frecuentes' + (h || '') + '"');
  // /{pagina}.html → /{pagina} para páginas limpias
  html = html.replace(/href="\/([a-z0-9-]+)\.html(\?[^"]*)?(#[^"]*)?"/gi, (m, page, q, h) => {
    const clean = CLEAN_PAGES.has(page) ? page : page;
    const alias = ALIASES[clean] || clean;
    return 'href="/' + alias + (q || '') + (h || '') + '"';
  });

  if (html !== before) {
    writeFileSync(full, html);
    changed++;
  }
}
console.log(`Enlaces corregidos en ${changed} páginas.`);
