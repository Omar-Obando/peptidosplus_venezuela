#!/usr/bin/env node
/**
 * scripts/import-posts.mjs
 *
 * Importa los artículos estáticos del sitio anterior
 * (peptidosplus-sitio-2026-09-11/peptidosplus-sitio/articulo-*.html) al CMS
 * headless WordPress (ve-cms.peptidosplus.com) vía REST API.
 *
 * Autenticación: Basic auth con WP_REST_USER / WP_REST_PASSWORD
 * (Application Password de un usuario con edit_posts; ver .env / .env.example).
 *
 * Uso:
 *   node scripts/import-posts.mjs                 # publica (status=publish)
 *   node scripts/import-posts.mjs --draft         # crea como borradores
 *   node scripts/import-posts.mjs --dry-run       # solo muestra lo que haría
 *   node scripts/import-posts.mjs --src <dir>     # otra carpeta fuente
 *   node scripts/import-posts.mjs --only tirzepatida-agonista-dual
 *
 * Variables de entorno:
 *   WP_API_URL          (por defecto https://ve-cms.peptidosplus.com/wp-json)
 *   WP_REST_USER        usuario WordPress
 *   WP_REST_PASSWORD    application password
 */
import { readFileSync, readdirSync, readFileSync as read } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC =
  process.argv.includes('--src')
    ? path.resolve(process.argv[process.argv.indexOf('--src') + 1])
    : path.resolve(ROOT, '../../peptidosplus-sitio-2026-09-11/peptidosplus-sitio');

// Auto-load .env from project root (no dotenv dependency).
function loadEnv() {
  try {
    const envPath = path.join(ROOT, '.env');
    const content = read(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* no .env — rely on real env vars */
  }
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

// Family → category mapping (from assets/datos/productos.js familias).
const FAMILY_CATEGORIES = {
  metabolico: 'Metabólico',
  gh: 'Hormona de crecimiento',
  piel: 'Piel y tejido',
  neuro: 'Neuro',
  celular: 'Celular',
  insumos: 'Insumos',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function api(pathName, options = {}) {
  const res = await fetch(`${API}${pathName}`, {
    ...options,
    headers: { ...HEADERS, ...(options.headers || {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

function extract(html, re, group = 1) {
  const m = html.match(re);
  return m ? (m[group] || '').trim() : '';
}

function decodeEntities(s) {
  return s
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&#8216;|&#8217;|&#039;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#038;/g, '&').replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '').trim();
}

/**
 * Extract the article body: everything inside <article class="pg-art">…</article>
 * minus the <header> block, disclaimer (.pg-aviso) and article nav (.pg-art-nav).
 */
function extractBody(html) {
  const art = extract(html, /<article class="pg-art">([\s\S]*?)<\/article>/i);
  if (!art) return '';
  let body = art
    .replace(/<header class="pg-art-cab">[\s\S]*?<\/header>/i, '')
    .replace(/<(?:nav|div) class="pg-art-nav">[\s\S]*?<\/(?:nav|div)>/gi, '')
    .replace(/<(?:div|p|section) class="pg-aviso[^"]*">[\s\S]*?<\/(?:div|p|section)>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  return body.trim();
}

/** Parse the cejilla: "Categoría · 18 de abril de 2025 · 8 min" */
function parseCejilla(html) {
  const raw = decodeEntities(stripTags(extract(html, /<p class="pg-cejilla[^"]*">([\s\S]*?)<\/p>/i)));
  const parts = raw.split('·').map((p) => p.trim()).filter(Boolean);
  const cats = ['Metabólico', 'Hormona de crecimiento', 'Piel y tejido', 'Neuro', 'Celular', 'Insumos', 'Insumos'];
  let category = '';
  for (const c of cats) {
    if (raw.includes(c)) { category = c; break; }
  }
  if (!category && parts[0]) {
    // First token may be the family name; normalize known families.
    const known = Object.values(FAMILY_CATEGORIES);
    category = known.find((k) => parts[0].toLowerCase().includes(k.toLowerCase())) || parts[0];
  }
  const dateMatch = parts.find((p) => /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(p));
  return { category, dateRaw: dateMatch || '' };
}

function parseDateEs(dateRaw) {
  if (!dateRaw) return new Date().toISOString();
  const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  const m = dateRaw.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  if (!m) return new Date().toISOString();
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return new Date().toISOString();
  const d = new Date(Date.UTC(parseInt(m[3], 10), month - 1, parseInt(m[1], 10)));
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
if (!USER || !PASS) {
  console.error('Falta WP_REST_USER / WP_REST_PASSWORD en .env o variables de entorno.');
  process.exit(1);
}

// Read source files
const files = readdirSync(SRC)
  .filter((f) => /^articulo-[a-z0-9-]+\.html$/i.test(f))
  .sort();
console.log(`Fuente: ${SRC} (${files.length} artículos) — status=${STATUS}${DRY_RUN ? ' (DRY RUN)' : ''}`);

// Ensure categories exist (fetch once, create missing)
let categories = [];
{
  const { ok, data } = await api('/wp/v2/categories?per_page=100&_fields=id,name,slug');
  if (ok) categories = data;
}

async function ensureCategory(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const existing = categories.find((c) => c.slug === slug);
  if (existing) return existing.id;
  if (DRY_RUN) return null;
  const { ok, data } = await api('/wp/v2/categories', {
    method: 'POST',
    body: JSON.stringify({ name, slug }),
  });
  if (!ok) {
    console.error(`  [cat] no se pudo crear "${name}": ${JSON.stringify(data).slice(0, 200)}`);
    return null;
  }
  categories.push(data);
  return data.id;
}

const POST_NAMESPACE = 'peptidos-plus-import';

let created = 0, skipped = 0, failed = 0;

for (const file of files) {
  const slug = file.replace(/^articulo-/, '').replace(/\.html$/, '');
  if (ONLY && !slug.includes(ONLY)) continue;

  const html = readFileSync(path.join(SRC, file), 'utf8');

  const title = decodeEntities(extract(html, /<h1 class="pg-h1">([\s\S]*?)<\/h1>/i)) || slug;
  const description = decodeEntities(extract(html, /<meta name="description" content="([^"]*)"/i));
  const body = extractBody(html);
  const { category, dateRaw } = parseCejilla(html);
  const date = parseDateEs(dateRaw);

  if (DRY_RUN) {
    console.log(`  [plan] ${slug} — "${title}" (${category || 'sin categoría'}, ${dateRaw || date}) — ${body.length} chars`);
    created++;
    continue;
  }

  const catId = category ? await ensureCategory(category) : null;

  // Build content: convert <section> wrappers to plain blocks is unnecessary;
  // WP accepts the HTML as-is. Add a paragraph wrapper safety for bare text.
  const contentHtml = body;

  const payload = {
    slug,
    title,
    status: STATUS,
    content: contentHtml,
    ...(description ? { excerpt: description } : {}),
    ...(catId ? { categories: [catId] } : {}),
    meta: { _pp_import: POST_NAMESPACE, _pp_source: file },
  };

  const { ok, data } = await api('/wp/v2/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!ok) {
    console.error(`  [FAIL] ${slug}: ${JSON.stringify(data).slice(0, 300)}`);
    failed++;
  } else {
    console.log(`  [ok] ${slug} → post #${data.id} (${STATUS})${catId ? ` [cat ${catId}]` : ''}`);
    created++;
  }
}

console.log(`\nResumen: ${created} creados/planificados, ${skipped} omitidos, ${failed} fallidos.`);
process.exit(failed > 0 ? 1 : 0);
