// Reverse the /tienda rewrite: restore links to the ORIGINAL static pages
// (store.html, producto-*.html) so the 100% original design is served.
// Also keep nav clean (/ for index, /blog for articles, /certificados, /faq).
const fs = require('fs');
const path = require('path');
const PUBLIC = 'D:/codigo6/peptidos/ve.peptidosplus.com-main/ve.peptidosplus.com-main/public';

const files = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let changed = 0;
for (const f of files) {
  const full = path.join(PUBLIC, f);
  let html = fs.readFileSync(full, 'utf8');
  const before = html;
  // /tienda/producto/{slug} -> producto-{slug}.html (with #coa if present)
  html = html.replace(/href="\/tienda\/producto\/([a-z0-9-]+)(#coa)?"/gi, (mm, slug, hash) => `href="producto-${slug}.html${hash || ''}"`);
  // /tienda -> store.html
  html = html.replace(/href="\/tienda(\?[^"]*)?"/gi, (mm, q) => `href="store.html${q || ''}"`);
  // /tienda/categoria/{slug} -> store.html (filter by cat via query not available; keep store.html)
  html = html.replace(/href="\/tienda\/categoria\/([a-z0-9-]+)"/gi, 'href="store.html"');
  if (html !== before) { fs.writeFileSync(full, html); changed++; }
}
console.log('Restore links a páginas originales en', changed, 'de', files.length, 'páginas');
// Verify no /tienda/producto remains
let leftovers = 0;
for (const f of files) {
  const html = fs.readFileSync(path.join(PUBLIC, f), 'utf8');
  if (/href="\/tienda\/producto\//.test(html)) leftovers++;
}
console.log('Páginas con /tienda/producto restantes:', leftovers);
