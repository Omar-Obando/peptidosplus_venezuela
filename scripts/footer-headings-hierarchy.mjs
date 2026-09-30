#!/usr/bin/env node
/**
 * footer-headings-hierarchy.mjs — mejora la jerarquía visual de los encabezados
 * del footer (títulos de columna) en todos los public/*.html y en src/cromo/pie.html:
 *   - Título: 16px, dorado, MAYÚSCULAS, con separador inferior (border-bottom) + más espacio.
 *   - Ítems: 14px, gris, sin subrayado (hover solo).
 * Idempotente: aplica estilo solo a los <span class="sc-interp"> que son títulos de columna
 * (Catálogo/Recursos/Soporte/Legal/Países), no a los ítems.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TITLES = ['Catálogo', 'Recursos', 'Soporte', 'Legal', 'Países'];

function collectHtml(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectHtml(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function process(html) {
  for (const t of TITLES) {
    // <span ...style="...font-size: XXpx;..."><span class="sc-interp">Titulo</span></span>
    const re = new RegExp(
      `(<span style="[^"]*font-size: 1[36]px; font-weight: 600; letter-spacing: 0\\.12em; text-transform: uppercase; color: rgb\\(233, 196, 106\\);)[^"]*"[^>]*><span class="sc-interp">${t}</span></span>`,
      'i'
    );
    html = html.replace(re, (m, prefix) => {
      const newStyle =
        'font-size: 17px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgb(233, 196, 106); margin-bottom: 6px; padding-bottom: 8px; border-bottom: 1px solid rgba(233, 196, 106, 0.35);';
      return `<span style="${newStyle}"><span class="sc-interp">${t}</span></span>`;
    });
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
console.log(`Jerarquía de encabezados del footer aplicada en ${modified} archivos.`);
