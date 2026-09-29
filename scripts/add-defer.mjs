#!/usr/bin/env node
/**
 * scripts/add-defer.mjs
 *
 * Añade `defer` a los <script src="..."> locales que no lo llevan, para que
 * no bloqueen el render (performance/LCP). No toca scripts inline ni externos.
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

  // <script src="x.js" >  o  <script src="x.js">  (sin defer) → añade defer
  html = html.replace(/<script\s+src="([^"]*\.js)"\s*>/gi, '<script src="$1" defer>');
  // Si ya hay otros atributos después del src (sin defer), también:
  html = html.replace(/<script\s+src="([^"]*\.js)"(?![^>]*defer)([^>]*)>/gi, (m, src, rest) => {
    return '<script src="' + src + '" defer' + (rest || '') + '>';
  });

  if (html !== before) { writeFileSync(full, html); changed++; }
}
console.log(`defer añadido en ${changed} páginas.`);
