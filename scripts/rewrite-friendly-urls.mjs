#!/usr/bin/env node
/**
 * scripts/rewrite-friendly-urls.mjs
 *
 * Reescribe enlaces internos de public/*.html a URLs SEO amigables:
 *   /producto-{slug}   → /{slug}
 *   /articulo-{slug}   → /blog/{slug}
 * y añade <link rel="canonical"> apuntando a la URL limpia en cada página.
 *
 * Idempotente: reemplaza solo los patrones; no duplica canonical.
 * Uso: node scripts/rewrite-friendly-urls.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const SITE = 'https://ve.peptidosplus.com';

function friendly(pathname) {
  // /producto-x → /x ; /articulo-x → /blog/x (mantiene #hash y query)
  let p = pathname;
  const hash = p.includes('#') ? '#' + p.split('#')[1] : '';
  p = p.split('#')[0];
  const query = p.includes('?') ? '?' + p.split('?')[1] : '';
  p = p.split('?')[0];
  if (p.startsWith('/producto-')) p = '/' + p.replace('/producto-', '');
  else if (p.startsWith('/articulo-')) p = '/blog/' + p.replace('/articulo-', '');
  return p + query + hash;
}

function canonicalFor(file) {
  if (file === 'store.html') return SITE + '/tienda';
  if (file === 'index.html') return SITE + '/';
  if (/^producto-/.test(file)) return SITE + '/' + file.replace(/^producto-/, '').replace(/\.html$/, '');
  if (/^articulo-/.test(file)) return SITE + '/blog/' + file.replace(/^articulo-/, '').replace(/\.html$/, '');
  if (file === 'preguntas-frecuentes.html' || file === 'faq.html') return SITE + '/preguntas-frecuentes';
  if (file === 'contacto.html') return SITE + '/contacto';
  if (file === 'certificados.html') return SITE + '/certificados';
  return SITE + '/' + file.replace(/\.html$/, '');
}

const files = readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let rewritten = 0, canonicals = 0;
for (const f of files) {
  const full = path.join(PUBLIC, f);
  let html = readFileSync(full, 'utf8');
  const before = html;

  // 1. Enlaces/URLs internas a las limpias
  html = html.replace(/(["'])\/producto-([a-z0-9-]+)(\/|\?|#|["'])/gi, (m, q, slug, tail) => {
    const clean = `/${slug}${tail === '/' ? '/' : tail}`;
    return q + clean + q;
  });
  // /producto-{slug}.html → /{slug}
  html = html.replace(/\/producto-([a-z0-9-]+)\.html/g, '/$1');
  html = html.replace(/(["'])\/articulo-([a-z0-9-]+)(\/|\?|#|["'])/gi, (m, q, slug, tail) => {
    return q + `/blog/${slug}${tail === '/' ? '/' : tail}` + q;
  });
  html = html.replace(/\/articulo-([a-z0-9-]+)\.html/g, '/blog/$1');

  if (html !== before) rewritten++;

  // 2. canonical
  const canonical = canonicalFor(f);
  if (/rel="canonical"/i.test(html)) {
    html = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${canonical}" />`);
    canonicals++;
  } else if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `<link rel="canonical" href="${canonical}" />\n</head>`);
    canonicals++;
  }

  if (html !== before) writeFileSync(full, html);
}
console.log(`Enlaces amigables aplicados en ${rewritten} páginas; canonical añadido/actualizado en ${canonicals}.`);
