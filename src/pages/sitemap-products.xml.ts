import type { APIRoute } from 'astro';
import { SITE } from '../lib/site';

/**
 * Products sitemap — /sitemap-products.xml
 * URLs limpias de los productos del catálogo (/{slug}).
 */
const PRODUCT_SLUGS = [
  'agua-bacteriostatica', 'agua-bacteriostatica-hospira', 'cagrilintida',
  'cjc-1295-ipamorelin', 'cjc-1295-sin-dac', 'dsip', 'epitalon', 'ghk-cu',
  'glow', 'glutation', 'ipamorelin', 'kisspeptin-10', 'klow', 'kpv',
  'lemon-bottle', 'melanotan-2', 'mots-c', 'nad', 'pt-141', 'retatrutida',
  'selank', 'semaglutida', 'semax', 'sermorelin', 'ss-31-elamipretide',
  'tesamorelin', 'thymosin-alpha-1', 'tirzepatida', 'wolverine-bpc-157-tb-500',
];

export const GET: APIRoute = async () => {
  const lastmod = new Date().toISOString().split('T')[0];
  const urls = PRODUCT_SLUGS.map(
    (slug) =>
      `  <url>\n    <loc>${SITE.url}/${slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
    '\n'
  )}\n</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
