// Inject <script src="/geo-banner.js" defer> into static .html pages before </body>
const fs = require('fs');
const path = require('path');
const PUBLIC = 'D:/codigo6/peptidos/ve.peptidosplus.com-main/ve.peptidosplus.com-main/public';

const files = fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'));
let changed = 0;
for (const f of files) {
  const full = path.join(PUBLIC, f);
  let html = fs.readFileSync(full, 'utf8');
  if (html.includes('geo-banner.js')) continue;
  html = html.replace(/<\/body>/i, '<script src="/geo-banner.js" defer></script></body>');
  fs.writeFileSync(full, html);
  changed++;
}
console.log('Inyectados geo-banner.js en', changed, 'páginas de', files.length);
