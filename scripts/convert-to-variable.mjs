#!/usr/bin/env node
/**
 * scripts/convert-to-variable.mjs
 *
 * Convierte productos WooCommerce "simple" → "variable" con sus variaciones
 * de presentación (dosis), creadas a partir de las fichas del sitio original
 * (public/producto-{slug}.html → data-dosis + data-precio).
 *
 * Idempotente: si el producto ya es variable con esas variaciones, no toca
 * nada; si es variable pero le faltan variaciones, las crea.
 *
 * Uso:
 *   node scripts/convert-to-variable.mjs            # DRY-RUN (solo plan)
 *   node scripts/convert-to-variable.mjs --apply    # escribe en WooCommerce
 *   node scripts/convert-to-variable.mjs --only retatrutida   # un producto
 *
 * Requiere en .env: WP_API_URL, WP_REST_USER, WP_REST_PASSWORD.
 * Nota: los productos que ya son "variable" (Retatrutida) se saltan.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

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

const API = (process.env.WP_API_URL || 'https://ve-cms.peptidosplus.com/wp-json').replace(/\/+$/, '');
const WC_API = API.includes('/wc/') ? API : `${API}/wc/v3`;
const USER = process.env.WP_REST_USER || '';
const PASS = process.env.WP_REST_PASSWORD || '';
const APPLY = process.argv.includes('--apply');
// Con --simple-single: los productos con UNA sola presentación se dejan
// como "simple" (precio en el padre, sin variación). Útil para el agua
// bacteriostática (10 ml / 30 ml) que no necesita variaciones.
const SIMPLE_SINGLE = process.argv.includes('--simple-single');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '');

const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* noop */ }
  return { ok: res.ok, status: res.status, data };
}

// Alias slug WooCommerce → archivo local de la ficha.
// WooCommerce convierte la tilde en guion (bacteriostática → bacteriost-tica),
// mientras el sitio quita la tilde sin guion (bacteriostatica).
const FILE_ALIASES = {
  'agua-bacteriost-tica': 'agua-bacteriostatica',
  'agua-bacteriost-tica-hospira': 'agua-bacteriostatica-hospira',
  'glutati-n': 'glutation',
  'epital-n': 'epitalon',
  'ss-31-elamipretide': 'ss-31',
};

/** Presentaciones de la ficha: [{dosis, precio}] por slug (sin /producto- ni .html) */
function presentacionesDe(slug) {
  const fileSlug = FILE_ALIASES[slug] || slug;
  const candidates = [
    path.join(PUBLIC, `producto-${fileSlug}.html`),
    path.join(PUBLIC, `producto-${slug}.html`),
  ];
  let html = '';
  for (const c of candidates) {
    try { html = readFileSync(c, 'utf8'); break; } catch { /* siguiente */ }
  }
  if (!html) return [];
  const re = /data-dosis="([^"]+)"[^>]*data-precio="([0-9.]+)"|data-precio="([0-9.]+)"[^>]*data-dosis="([^"]+)"/g;
  const out = [];
  let m;
  const seen = new Set();
  while ((m = re.exec(html))) {
    const dosis = (m[1] || m[4]).trim();
    const precio = m[2] || m[3];
    if (!seen.has(dosis)) { seen.add(dosis); out.push({ dosis, precio }); }
  }
  return out;
}

const productsRes = await api('GET', `${WC_API}/products?per_page=100&_fields=id,name,slug,type,price,stock_status,manage_stock`);
if (!productsRes.ok) {
  console.error('ERROR: no se pudo listar productos', productsRes.status);
  process.exit(1);
}

let plan = 0, creadas = 0;
for (const p of productsRes.data || []) {
  const slug = p.slug || '';
  if (ONLY && slug !== ONLY && `producto-${slug}` !== ONLY) continue;
  if (p.type === 'variable') { console.log(`· ${slug}: ya es variable — skip`); continue; }

  const pres = presentacionesDe(slug);
  if (!pres.length) { console.log(`· ${slug}: sin presentaciones en la ficha — skip`); continue; }

  // Con --simple-single y UNA presentación: el producto se queda "simple"
  // (precio en el padre), en vez de crear una variable con 1 variación.
  if (SIMPLE_SINGLE && pres.length === 1) {
    console.log(`\n${APPLY ? '▶ APLICAR' : '○ PLAN'} ${slug} (${p.id}) → SIMPLE (1 presentación ${pres[0].dosis} → $${pres[0].precio})`);
    if (APPLY) {
      const upd = await api('PUT', `${WC_API}/products/${p.id}`, {
        type: 'simple',
        regular_price: pres[0].precio,
        attributes: [],
      });
      if (upd.ok) console.log('   ✓ producto actualizado a simple');
      else console.error(`   ✗ error: ${upd.status}`, JSON.stringify(upd.data).slice(0, 200));
    }
    plan++;
    continue;
  }

  const body = {
    type: 'variable',
    attributes: [{ name: 'Presentacion', visible: true, variation: true, options: pres.map(x => x.dosis) }],
  };
  console.log(`\n${APPLY ? '▶ APLICAR' : '○ PLAN'} ${slug} (${p.id}) → variable con ${pres.length} presentaciones:`);
  for (const x of pres) console.log(`   - ${x.dosis} → $${x.precio}`);

  plan++;
  if (!APPLY) continue;
  const upd = await api('PUT', `${WC_API}/products/${p.id}`, body);
  if (!upd.ok) { console.error(`   ✗ error: ${upd.status}`, JSON.stringify(upd.data).slice(0, 200)); continue; }
  console.log('   ✓ producto actualizado a variable');

  // Crear variaciones
  for (const x of pres) {
    const varBody = {
      regular_price: x.precio,
      attributes: [{ name: 'Presentacion', option: x.dosis }],
      manage_stock: true,
      stock_quantity: 0,
      stock_status: 'instock',
    };
    const v = await api('POST', `${WC_API}/products/${p.id}/variations`, varBody);
    if (v.ok) { creadas++; console.log(`   ✓ variación ${x.dosis} creada (${v.data?.id})`); }
    else console.error(`   ✗ variación ${x.dosis}: ${v.status}`, JSON.stringify(v.data).slice(0, 200));
  }
}

console.log(`\n${APPLY ? 'APLICADO' : 'PLAN (usa --apply para escribir)'}: ${plan} producto(s) a convertir${APPLY ? `, ${creadas} variación(es) creada(s)` : ''}`);
