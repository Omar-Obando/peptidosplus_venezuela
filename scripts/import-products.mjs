#!/usr/bin/env node
/**
 * scripts/import-products.mjs
 *
 * Crea/actualiza los productos WooCommerce del CMS con las descripciones del
 * sitio anterior (peptidosplus-sitio-2026-09-11/peptidosplus-sitio/producto-*.html)
 * y los metadatos del catálogo (assets/datos/productos.js).
 *
 * La tienda WooCommerce del CMS está vacía: se CREAN los productos vía
 * /wc/v3/products (Basic auth de omar.obando). Idempotente: primero busca por
 * slug; si ya existe, actualiza short_description/description/meta_data.
 *
 * Uso:
 *   node scripts/import-products.mjs --dry-run   # plan (no escribe)
 *   node scripts/import-products.mjs             # crea/actualiza (publish)
 *   node scripts/import-products.mjs --draft     # crea como borradores
 *   node scripts/import-products.mjs --only ghk-cu
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(ROOT, '../../peptidosplus-sitio-2026-09-11/peptidosplus-sitio');

function loadEnv() {
  try {
    const content = readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
}
loadEnv();

const API = process.env.WP_API_URL || 'https://ve-cms.peptidosplus.com/wp-json';
const USER = process.env.WP_REST_USER || '';
const PASS = process.env.WP_REST_PASSWORD || '';
const DRY_RUN = process.argv.includes('--dry-run');
const DRAFT = process.argv.includes('--draft');
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
const STATUS = DRAFT ? 'draft' : 'publish';

const BASIC = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const HEADERS = { 'Content-Type': 'application/json', Authorization: BASIC };

async function api(pathName, method = 'GET', body) {
  const res = await fetch(`${API}${pathName}`, {
    method,
    headers: { ...HEADERS, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

function extract(html, re, group = 1) {
  const m = html.match(re);
  return m ? (m[group] || '').trim() : '';
}
function decodeEntities(s) {
  return s.replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#8216;|&#8217;|&#039;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
}

function parseCatalog() {
  const file = readFileSync(path.join(SRC, 'assets/datos/productos.js'), 'utf8');
  const m = file.match(/window\.PP_PRODUCTOS\s*=\s*(\{[\s\S]*?\});/);
  if (!m) throw new Error('No se pudo parsear assets/datos/productos.js');
  const json = m[1];
  // Evaluate the JS object literal (JSON-compatible data) with a guarded Function.
  return Function(`"use strict"; return (${json});`)();
}

function productBody(html) {
  const art = extract(html, /<main[^>]*>([\s\S]*?)<\/main>/i) || extract(html, /<article[^>]*>([\s\S]*?)<\/article>/i);
  if (!art) return '';
  return art
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<(?:header|footer)[^>]*>[\s\S]*?<\/(?:header|footer)>/gi, '')
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, '')
    .trim();
}

if (!USER || !PASS) {
  console.error('Falta WP_REST_USER / WP_REST_PASSWORD en .env');
  process.exit(1);
}

const catalog = parseCatalog();
const products = catalog.productos || [];
console.log(`Catálogo: ${products.length} productos — ${DRY_RUN ? 'DRY RUN' : `status=${STATUS}`}`);

// Existing products (idempotency check)
let existing = [];
{
  const { ok, data } = await api('/wc/v3/products?per_page=100&_fields=id,slug,name');
  if (ok && Array.isArray(data)) existing = data;
  else console.warn('  [aviso] No se pudieron listar productos:', JSON.stringify(data).slice(0, 200));
}

// Ensure product categories (WooCommerce taxonomy) exist once.
const familySlugs = {
  'Metabólico': 'metabolico',
  'Hormona de crecimiento': 'hormona-de-crecimiento',
  'Piel y tejido': 'piel-y-tejido',
  'Neuro': 'neuro',
  'Celular': 'celular',
  'Insumos': 'insumos',
};

async function ensureWCCategory(name) {
  const slug = familySlugs[name] || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const { ok, data } = await api(`/wc/v3/products/categories?search=${encodeURIComponent(name)}&per_page=5`);
  if (ok && Array.isArray(data)) {
    const match = data.find((c) => c.name.toLowerCase() === name.toLowerCase() || c.slug === slug);
    if (match) return match.id;
  }
  if (DRY_RUN) return null;
  const { ok: okC, data: created } = await api('/wc/v3/products/categories', 'POST', { name, slug });
  if (okC) return created.id;
  console.error(`  [cat] no se pudo crear "${name}": ${JSON.stringify(created).slice(0, 200)}`);
  return null;
}

let created = 0, updated = 0, failed = 0;

for (const p of products) {
  const name = p.nombre;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (ONLY && !name.toLowerCase().includes(ONLY.toLowerCase())) continue;

  const htmlPath = path.join(SRC, p.pagina || `producto-${slug}.html`);
  const html = readFileSync(htmlPath, 'utf8');
  const title = decodeEntities(extract(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)) || name;
  const description = decodeEntities(extract(html, /<meta name="description" content="([^"]*)"/i));
  const body = productBody(html);
  const shortDesc = p.sub || description || `Péptido de investigación ${name} — ${p.familiaEtiqueta}.`;
  const price = p.desde ?? 0;

  const match = existing.find((e) => e.slug === slug || e.name.toLowerCase() === name.toLowerCase());
  const catId = p.familiaEtiqueta ? await ensureWCCategory(p.familiaEtiqueta) : null;

  const payload = {
    name: title,
    slug,
    type: 'simple',
    status: STATUS,
    regular_price: String(price),
    short_description: shortDesc,
    description: body || `<p>${shortDesc}</p>`,
    ...(catId ? { categories: [{ id: catId }] } : {}),
    meta_data: [
      ...(p.pureza ? [{ key: '_pp_pureza', value: String(p.pureza) }] : []),
      { key: '_pp_familia', value: p.familiaEtiqueta || '' },
      { key: '_pp_coa', value: p.coa ? 'si' : 'no' },
    ],
  };

  if (DRY_RUN) {
    console.log(`  [plan] ${name} (slug ${slug}) — $${price} — ${match ? 'ACTUALIZAR' : 'CREAR'} — ${body.length} chars`);
    created++;
    continue;
  }

  if (match) {
    const { ok, data } = await api(`/wc/v3/products/${match.id}`, 'PUT', payload);
    if (!ok) { console.error(`  [FAIL] ${name}: ${JSON.stringify(data).slice(0, 300)}`); failed++; }
    else { console.log(`  [ok-update] ${name} (id ${match.id})`); updated++; }
  } else {
    const { ok, data } = await api('/wc/v3/products', 'POST', payload);
    if (!ok) { console.error(`  [FAIL] ${name}: ${JSON.stringify(data).slice(0, 300)}`); failed++; }
    else { console.log(`  [ok-create] ${name} (id ${data.id}) — ${STATUS}`); created++; }
  }
}

console.log(`\nResumen: ${created} creados, ${updated} actualizados, ${failed} fallidos.`);
process.exit(failed > 0 ? 1 : 0);
