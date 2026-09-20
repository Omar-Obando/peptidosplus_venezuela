// Rewrite old English URLs -> Spanish canonical in public/*.html (SEO URLs).
const fs = require('fs');
const path = require('path');
const PUBLIC = 'D:/codigo6/peptidos/ve.peptidosplus.com-main/ve.peptidosplus.com-main/public';

const files = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let changed = 0;
for (const f of files) {
  const full = path.join(PUBLIC, f);
  let html = fs.readFileSync(full, 'utf8');
  const before = html;
  html = html.replace(/href="\/shop\/product\//gi, 'href="/tienda/producto/');
  html = html.replace(/href="\/shop\/category\//gi, 'href="/tienda/categoria/');
  html = html.replace(/href="\/shop"/gi, 'href="/tienda"');
  html = html.replace(/href="\/cart"/gi, 'href="/carrito"');
  html = html.replace(/href="\/checkout"/gi, 'href="/finalizar-compra"');
  html = html.replace(/href="\/search"/gi, 'href="/buscar"');
  html = html.replace(/href="\/account"/gi, 'href="/cuenta"');
  if (html !== before) { fs.writeFileSync(full, html); changed++; }
}
console.log('Hrefs SEO español aplicados en', changed, 'de', files.length, 'páginas .html');
// Report any leftover old hrefs
let leftovers = 0;
for (const f of files) {
  const html = fs.readFileSync(path.join(PUBLIC, f), 'utf8');
  if (/href="\/(shop|cart|checkout|search|account)\b/.test(html)) leftovers++;
}
console.log('Páginas con hrefs viejos restantes:', leftovers);
