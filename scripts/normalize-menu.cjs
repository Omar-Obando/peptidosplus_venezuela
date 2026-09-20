// Fix menu labels/links in static .html copies:
// "Artículos" -> "Blog" (nav), certificados.html/faq.html/articulos.html -> clean routes
const fs = require('fs');
const path = require('path');
const PUBLIC = 'D:/codigo6/peptidos/ve.peptidosplus.com-main/ve.peptidosplus.com-main/public';

const files = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let changed = 0;
for (const f of files) {
  const full = path.join(PUBLIC, f);
  let html = fs.readFileSync(full, 'utf8');
  const before = html;
  html = html.replace(/href="certificados\.html"/gi, 'href="/certificados"');
  html = html.replace(/href="faq\.html"/gi, 'href="/faq"');
  html = html.replace(/href="articulos\.html"/gi, 'href="/blog"');
  html = html.replace(/>Artículos<\/a>/gi, '>Blog</a>');
  if (html !== before) { fs.writeFileSync(full, html); changed++; }
}
console.log('Menú estático normalizado en', changed, 'de', files.length, 'páginas');
