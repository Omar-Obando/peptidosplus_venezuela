// Remove the QA debug script <script src="senalar.js"> from static .html pages
// (it shows the floating 'Señalar lo heredado' button — dev tool of the clone, not site content).
const fs = require('fs');
const path = require('path');
const PUBLIC = 'D:/codigo6/peptidos/ve.peptidosplus.com-main/ve.peptidosplus.com-main/public';

const files = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let changed = 0;
for (const f of files) {
  const full = path.join(PUBLIC, f);
  let html = fs.readFileSync(full, 'utf8');
  const before = html;
  html = html.replace(/<script\s+src="senalar\.js"[^>]*>\s*<\/script>/gi, '');
  // also src="/senalar.js" modal
  html = html.replace(/<script\s+src="\/senalar\.js"[^>]*>\s*<\/script>/gi, '');
  if (html !== before) { fs.writeFileSync(full, html); changed++; }
}
console.log('senalar.js removido de', changed, 'de', files.length, 'páginas .html');
// verify
let left = 0;
for (const f of files) {
  const html = fs.readFileSync(path.join(PUBLIC, f), 'utf8');
  if (/senalar\.js/.test(html)) left++;
}
console.log('Páginas que aún cargan senalar.js:', left);
