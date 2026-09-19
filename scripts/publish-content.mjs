#!/usr/bin/env node
/**
 * scripts/publish-content.mjs
 *
 * Publica (status=publish) el contenido importado que esté en borrador:
 *  - Posts de blog            (wp/v2/posts, 35)
 *  - Productos WooCommerce    (wc/v3/products, 29)
 *
 * Idempotente: solo PATCH/UPDATE entradas con status=draft; las ya publicadas
 * se respetan y NO se duplican (nunca crea).
 *
 * Uso:
 *   node scripts/publish-content.mjs --dry-run   # lista lo que publicaría
 *   node scripts/publish-content.mjs             # publica drafts
 *   node scripts/publish-content.mjs --posts     # solo posts
 *   node scripts/publish-content.mjs --products  # solo productos
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
const ONLY_POSTS = process.argv.includes('--posts');
const ONLY_PRODUCTS = process.argv.includes('--products');

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

if (!USER || !PASS) {
  console.error('Falta WP_REST_USER / WP_REST_PASSWORD en .env');
  process.exit(1);
}

let published = 0, skipped = 0, failed = 0;

// --- Posts del blog --------------------------------------------------------
if (!ONLY_PRODUCTS) {
  const { ok, data } = await api('/wp/v2/posts?status=draft&per_page=100&_fields=id,slug,title');
  const drafts = Array.isArray(data) ? data : [];
  console.log(`Posts en borrador: ${drafts.length}`);
  for (const p of drafts) {
    if (DRY_RUN) {
      console.log(`  [plan-publish] post #${p.id} ${p.slug}`);
      published++;
      continue;
    }
    const { ok: okP, data: res } = await api(`/wp/v2/posts/${p.id}`, 'POST', { status: 'publish' });
    if (!okP) { console.error(`  [FAIL] post #${p.id} ${p.slug}: ${JSON.stringify(res).slice(0, 200)}`); failed++; }
    else { console.log(`  [publish] post #${p.id} ${p.slug}`); published++; }
  }
}

// --- Productos WooCommerce -------------------------------------------------
if (!ONLY_POSTS) {
  const { ok, data } = await api('/wc/v3/products?status=draft&per_page=100&_fields=id,name,slug');
  const drafts = Array.isArray(data) ? data : [];
  console.log(`Productos en borrador: ${drafts.length}`);
  for (const p of drafts) {
    if (DRY_RUN) {
      console.log(`  [plan-publish] product #${p.id} ${p.slug}`);
      published++;
      continue;
    }
    const { ok: okP, data: res } = await api(`/wc/v3/products/${p.id}`, 'PUT', { status: 'publish' });
    if (!okP) { console.error(`  [FAIL] product #${p.id} ${p.slug}: ${JSON.stringify(res).slice(0, 200)}`); failed++; }
    else { console.log(`  [publish] product #${p.id} ${p.slug}`); published++; }
  }
}

console.log(`\nResumen: ${published} ${DRY_RUN ? 'planificados' : 'publicados'}, ${skipped} omitidos, ${failed} fallidos.`);
process.exit(failed > 0 ? 1 : 0);
