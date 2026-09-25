#!/usr/bin/env node
/**
 * scripts/inject-schema.mjs
 *
 * Inyecta JSON-LD (Schema.org) en las páginas estáticas public/*.html que
 * hoy no llevan ninguno: Organization + WebSite/SearchAction (global), ItemList
 * (catálogo), Product + Offer (fichas), FAQPage (faq), ContactPage (contacto),
 * BreadcrumbList y Article (artículos). Idempotente: reemplaza el bloque previo.
 *
 * Uso: node scripts/inject-schema.mjs   (escribe; guarda backup .bak en /tmp)
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const SITE = 'https://ve.peptidosplus.com';
const ORG = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': SITE + '/#organization',
  name: 'Peptidos Plus',
  url: SITE,
  logo: SITE + '/assets/marca/peptidosplus-logo-navy.svg',
  sameAs: ['https://wa.me/15806436837', 'https://t.me/peptidosplus'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    telephone: '+58 1 580 643 6837',
    availableLanguage: ['es'],
  },
};

// Datos del catálogo (nombre, pagina, img, desde) desde productos.js
const raw = readFileSync(path.join(PUBLIC, 'assets/datos/productos.js'), 'utf8');
const m = raw.match(/window\.PP_PRODUCTOS\s*=\s*(\{[\s\S]*?\});/);
let PRODUCTOS = [];
if (m) {
  try { PRODUCTOS = Function(`"use strict"; return (${m[1]});`)().productos || []; } catch { PRODUCTOS = []; }
}

function esc(s) { return String(s == null ? '' : s).replace(/["\\\n\r]/g, (c) => (c === '"' ? '\\"' : c)); }

function ld(type, extra) {
  return { '@context': 'https://schema.org', '@type': type, ...extra };
}

function pageTitle(html) { const t = html.match(/<title>([^<]*)</); return t ? t[1] : ''; }
function pageDesc(html) { const d = html.match(/name="description" content="([^"]*)"/); return d ? d[1] : ''; }

// Imagen destacada de la ficha: prefiere la <img> principal (viales-ficha /
// productos) presente en la página; el mapa local es el fallback.
function pageProductImage(html, slug) {
  const imgMatches = [...html.matchAll(/src="(assets\/(?:viales-ficha|productos)\/[^"]+)"/g)].map((x) => x[1]);
  const local = (PRODUCTOS.find((p) => p.pagina.includes(slug)) || {}).img;
  if (imgMatches.length) return SITE + '/' + imgMatches[0].replace(/^\.?\//, '');
  if (local) return SITE + '/' + local.replace(/^\.?\//, '');
  return SITE + '/assets/productos/' + slug + '.webp';
}

// Mapa slug → fecha de publicación desde WordPress (posts del CMS).
const POST_DATES = {};
try {
  const wpResp = await fetch('https://ve-cms.peptidosplus.com/wp-json/wp/v2/posts?per_page=100&_fields=slug,date');
  if (wpResp.ok) {
    for (const p of await wpResp.json()) if (p?.slug && p?.date) POST_DATES[p.slug] = String(p.date).slice(0, 10);
  }
} catch { /* sin red: mantiene fechas por defecto */ }

function siteLd() {
  return [
    ORG,
    ld('WebSite', {
      '@id': SITE + '/#website',
      url: SITE,
      name: 'Peptidos Plus',
      potentialAction: ld('SearchAction', {
        target: { '@type': 'EntryPoint', urlTemplate: SITE + '/buscar?q={search_term_string}' },
        'query-input': 'required name=search_term_string',
      }),
    }),
  ];
}

function itemListLd(html, url) {
  const items = PRODUCTOS.map((p) => ({
    '@type': 'ListItem',
    position: (p.orden ?? 0) + 1,
    item: ld('Product', {
      name: p.nombre,
      url: SITE + '/' + (p.pagina || '').replace(/^producto-/, '').replace(/\.html$/, ''),
      image: SITE + '/' + (p.img || '').replace(/^\.?\//, ''),
      offers: ld('Offer', {
        priceCurrency: 'USD',
        price: String(p.desde ?? ''),
        availability: 'https://schema.org/InStock',
      }),
    }),
  }));
  return ld('ItemList', { name: pageTitle(html) || 'Catálogo', numberOfItems: items.length, itemListElement: items });
}

function productLd(html, slug, url) {
  const pres = [...new Set([...html.matchAll(/data-dosis="([^"]+)"[^>]*data-precio="([0-9.]+)"|data-precio="([0-9.]+)"[^>]*data-dosis="([^"]+)"/g)].map((x) => ({ dosis: x[1] || x[4], precio: x[2] || x[3] })))];
  const offers = pres.map((p) => ld('Offer', {
    name: esc(p.dosis), priceCurrency: 'USD', price: p.precio, availability: 'https://schema.org/InStock',
  }));
  return ld('Product', {
    name: pageTitle(html).replace(/\s*\|\s*Peptidos Plus.*$/, '') || slug,
    description: pageDesc(html),
    url: SITE + '/' + slug,
    image: pageProductImage(html, slug),
    brand: { '@type': 'Brand', name: 'Peptidos Plus' },
    offers: offers.length ? (offers.length === 1 ? offers[0] : ld('AggregateOffer', {
      lowPrice: String(Math.min(...offers.map((o) => parseFloat(o.price)))),
      highPrice: String(Math.max(...offers.map((o) => parseFloat(o.price)))),
      priceCurrency: 'USD', offerCount: offers.length, offers,
    })) : undefined,
  });
}

function faqLd(html) {
  const qs = [...html.matchAll(/<h\d[^>]*>([^<]+)<\/h\d>/g)].map((x) => x[1].trim()).filter((s) => s && s.length < 120);
  // Texto de FAQ: usa el primer párrafo tras el encabezado como respuesta
  const main = [...html.matchAll(/<h\d[^>]*>([^<]+)<\/h\d>([\s\S]*?)(?=<h\d|$)/g)].map((x) => ({ q: x[1].trim(), body: x[2] }));
  const faq = main
    .filter((x) => x.q && /¿|pregunta|cómo|cuál|qué|envío|pago|legal/i.test(x.q))
    .slice(0, 20)
    .map((x) => ({
      '@type': 'Question',
      name: esc(x.q),
      acceptedAnswer: { '@type': 'Answer', text: esc(x.body.replace(/<[^>]+>/g, ' ').trim().slice(0, 300)) },
    }));
  return faq.length ? ld('FAQPage', { mainEntity: faq }) : null;
}

function articleLd(html, slug) {
  const title = pageTitle(html).replace(/\s*\|.*$/, '');
  return ld('Article', {
    headline: title || slug,
    description: pageDesc(html),
    datePublished: POST_DATES[slug] || '2026-09-11',
    author: { '@type': 'Organization', name: 'Peptidos Plus', url: SITE },
    publisher: ORG,
    mainEntityOfPage: SITE + '/blog/' + slug,
  });
}

function breadcrumbLd(items) {
  return ld('BreadcrumbList', {
    itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, item: SITE + x.url })),
  });
}

function contactLd() { return ld('ContactPage', { about: ORG, 'mainEntity': { '@type': 'ContactPage' } }); }

const marker = (id) => `<!-- JSON-LD ${id} (inject-schema) -->`;

function injectLd(html, blocks) {
  let out = html;
  // Eliminar bloques previos de inject-schema
  out = out.replace(/<!-- JSON-LD[\s\S]*?-->\s*<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, '');
  const script = blocks.filter(Boolean).map((b) => marker(b['@type']) + '<script type="application/ld+json">' + JSON.stringify(b) + '</script>').join('\n');
  return out.replace(/<\/head>/i, script + '\n</head>');
}

const files = readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let changed = 0;
for (const f of files) {
  const full = path.join(PUBLIC, f);
  let html = readFileSync(full, 'utf8');
  const blocks = [...siteLd()];

  if (f === 'store.html') blocks.push(itemListLd(html, 'store.html'));
  if (f === 'index.html') blocks.push(itemListLd(html, 'index.html'));
  if (f === 'faq.html') { const q = faqLd(html); if (q) blocks.push(q); }
  if (f === 'contacto.html') blocks.push(contactLd());
  if (/^producto-/.test(f)) {
    const slug = f.replace(/^producto-/, '').replace(/\.html$/, '');
    blocks.push(productLd(html, slug, f));
    blocks.push(breadcrumbLd([{ name: 'Inicio', url: '/' }, { name: 'Catálogo', url: '/store.html' }, { name: pageTitle(html).replace(/\s*\|.*$/, ''), url: '/' + f }]));
  }
  if (/^articulo-/.test(f)) {
    const slug = f.replace(/^articulo-/, '').replace(/\.html$/, '');
    blocks.push(articleLd(html, slug));
    blocks.push(breadcrumbLd([{ name: 'Inicio', url: '/' }, { name: 'Artículos', url: '/articulos.html' }, { name: pageTitle(html).replace(/\s*\|.*$/, ''), url: '/' + f }]));
  }

  const newHtml = injectLd(html, blocks);
  if (newHtml !== html) {
    writeFileSync(full, newHtml);
    changed++;
    console.log('✓ schema:', f, '→', blocks.map((b) => b['@type']).join(', '));
  }
}
console.log(`\nSchema inyectado en ${changed} / ${files.length} páginas.`);
