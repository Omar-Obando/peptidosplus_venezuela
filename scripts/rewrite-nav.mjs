// Rewrite nav/product/article hrefs in the static .html copies so navigation
// goes to the Astro headless routes (/shop, /cart, /checkout, /blog, ...),
// matching the second-commit integration (WooCommerce + WP posts).
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC = 'D:/codigo6/peptidos/ve.peptidosplus.com-main/ve.peptidosplus.com-main/public';
// vm: exit if not found
const STARTO = 'D:/codigo6/peptidos/peptidosplus-sitio-2026-09-11/peptidosplus-sitio';

// Same slugify as scripts/import-products.mjs
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Load productos.js to map page file -> WC slug (same as import)
const raw = fs.readFileSync(path.join(STARTO, 'assets/datos/productos.js'), 'utf8');
const m = raw.match(/window\.PP_PRODUCTOS\s*=\s*(\{[\s\S]*?\});/);
const catalog = Function(`"use strict"; return (${m[1]});`)();
const pageToSlug = {};
for (const p of catalog.productos) {
  const page = (p.pagina || '').replace(/^producto-/, '').replace(/\.html$/, '');
  pageToSlug[page] = slugify(p.nombre);
}
console.log('Mapeo producto->slug:', Object.keys(pageToSlug).length);

const files = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let changed = 0;

for (const file of files) {
  const full = path.join(PUBLIC, file);
  let html = fs.readFileSync(full, 'utf8');
  const before = html;

  // Product pages -> /shop/product/{slug} (fallback /shop if no mapping)
  html = html.replace(/href="producto-([a-z0-9-]+)\.html(#coa)?"/gi, (mm, slug, hash) => {
    const target = pageToSlug[slug] || slugify(slug);
    return `href="/shop/product/${target}${hash || ''}"`;
  });
  // store.html -> /shop
  html = html.replace(/href="store\.html(\?[^"]*)?"/gi, (mm, q) => `href="/shop${q || ''}"`);
  // carrito/checkout -> routes
  html = html.replace(/href="carrito\.html"/gi, 'href="/cart"');
  html = html.replace(/href="checkout\.html"/gi, 'href="/checkout"');
  // Articles -> headless blog
  html = html.replace(/href="articulos\.html"/gi, 'href="/blog"');
  html = html.replace(/href="articulo-([a-z0-9-]+)\.html"/gi, (mm, slug) => `href="/blog/${slug}"`);
  // index.html -> /
  html = html.replace(/href="index\.html"/gi, 'href="/"');

  if (html !== before) {
    fs.writeFileSync(full, html);
    changed++;
  }
}
console.log(`Archivos reescritos: ${changed}/${files.length}`);
