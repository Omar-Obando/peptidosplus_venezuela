import type { APIRoute } from 'astro';
import { SITE } from '../lib/site';

/**
 * Static pages sitemap — /sitemap-pages.xml
 * Includes only known static routes of the Astro site (shop, blog, legal, etc.).
 */
const STATIC_PATHS: Array<{ path: string; priority: string; changefreq: string }> = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/tienda', priority: '0.9', changefreq: 'daily' },
  { path: '/blog', priority: '0.9', changefreq: 'daily' },
  { path: '/buscar', priority: '0.4', changefreq: 'weekly' },
  { path: '/carrito', priority: '0.3', changefreq: 'monthly' },
  { path: '/finalizar-compra', priority: '0.3', changefreq: 'monthly' },
  { path: '/login', priority: '0.3', changefreq: 'monthly' },
  { path: '/register', priority: '0.3', changefreq: 'monthly' },
  { path: '/contacto', priority: '0.6', changefreq: 'monthly' },
  { path: '/preguntas-frecuentes', priority: '0.6', changefreq: 'monthly' },
  { path: '/cuenta', priority: '0.4', changefreq: 'monthly' },
  { path: '/certificados', priority: '0.7', changefreq: 'weekly' },
  { path: '/privacidad', priority: '0.2', changefreq: 'yearly' },
  { path: '/terminos', priority: '0.2', changefreq: 'yearly' },
];

export const GET: APIRoute = async () => {
  const lastmod = new Date().toISOString().split('T')[0];
  const urls = STATIC_PATHS.map(
    (p) =>
      `  <url>\n    <loc>${SITE.url}${p.path === '/' ? '/' : p.path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
    '\n'
  )}\n</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
