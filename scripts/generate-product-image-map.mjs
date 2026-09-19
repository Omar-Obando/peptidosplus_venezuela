// Generate src/lib/product-image-map.json mapping WC slug -> brand asset path.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// scripts/ -> project root (one level up)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, '../peptidosplus-sitio-2026-09-11/peptidosplus-sitio/assets/datos/productos.js');
const out = path.join(root, 'src/lib/product-image-map.json');

const raw = fs.readFileSync(src, 'utf8');
const m = raw.match(/window\.PP_PRODUCTOS\s*=\s*(\{[\s\S]*?\});/);
const catalog = Function(`"use strict"; return (${m[1]});`)();
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const map = {};
for (const p of catalog.productos) {
  map[slugify(p.nombre)] = '/' + (p.img || '').replace(/^\.?\//, '');
}
fs.writeFileSync(out, JSON.stringify(map, null, 2));
console.log('Mapa generado:', Object.keys(map).length, 'productos →', out);
