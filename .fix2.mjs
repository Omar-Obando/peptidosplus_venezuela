import { readFileSync, writeFileSync } from 'fs';
const p = 'src/pages/buscar.astro';
let s = readFileSync(p, 'utf8');
const old = "}).replace(/</g, '\u003c');";
// desired source: }).replace(/</g, '\u003c');  (two backslash chars = literal backslash + u003c)
const desired = "}).replace(/</g, '\\u003c');";
if (!s.includes(old)) { console.log('OLD NOT FOUND'); process.exit(1); }
s = s.replace(old, desired);
writeFileSync(p, s);
console.log('replaced');
