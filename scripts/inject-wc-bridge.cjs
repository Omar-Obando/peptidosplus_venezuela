// Inject <script src="/wc-bridge.js" defer> into static .html pages before </body>
const fs = require('fs');
const path = require('path');
const PUBLIC = 'D:/codigo6/peptidos/ve.peptidosplus.com-main/ve.peptidosplus.com-main/public';

const files = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let changed = 0;
for (const f of files) {
  const full = path.join(PUBLIC, f);
  let html = fs.readFileSync(full, 'utf8');
  if (html.includes('wc-bridge.js')) continue;
  html = html.replace(/<\/body>/i, '<script src="/wc-bridge.js" defer></script></body>');
  fs.writeFileSync(full, html);
  changed++;
}
console.log('Inyectado wc-bridge.js en', changed, 'de', files.length, 'páginas .html');
