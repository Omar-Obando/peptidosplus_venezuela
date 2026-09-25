#!/usr/bin/env node
/**
 * scripts/rewrite-broken-links.mjs
 *
 * Re-escribe enlaces internos rotos en public/*.html:
 *   /store, /store.html, /store?x  → /tienda
 *   /index                          → /
 *   /faq, /faq#x                    → /preguntas-frecuentes (con el ancla)
 * Idempotente.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

const files = readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let changed = 0;
for (const f of files) {
  const full = path.join(PUBLIC, f);
  let html = readFileSync(full, 'utf8');
  const before = html;

  // /store o /store.html (con query/ancla) → /tienda
  html = html.replace(/href="\/store(?:\.html)?(\?[^"]*)?(#[^"]*)?"/gi, (m, q, h) => 'href="/tienda' + (q || '') + (h || '') + '"');
  html = html.replace(/href="\/store"/gi, 'href="/tienda"');
  // /index → /
  html = html.replace(/href="\/index(\?[^"]*)?(#[^"]*)?"/gi, (m, q, h) => 'href="/' + (q || '') + (h || '') + '"');
  // /faq... → /preguntas-frecuentes...
  html = html.replace(/href="\/faq(#[^"]*)?"/gi, (m, h) => 'href="/preguntas-frecuentes' + (h || '') + '"');

  if (html !== before) {
    writeFileSync(full, html);
    changed++;
  }
}
console.log(`Enlaces corregidos en ${changed} páginas.`);
