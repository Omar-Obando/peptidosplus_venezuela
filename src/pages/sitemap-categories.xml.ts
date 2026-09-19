import type { APIRoute } from 'astro';
import { SITE } from '../lib/site';
import { WP_API_URL } from '../lib/wordpress-config';

/**
 * Categories sitemap — /sitemap-categories.xml
 */
export const GET: APIRoute = async () => {
  try {
    const res = await fetch(`${WP_API_URL}/wp/v2/categories?per_page=100&_fields=slug,name,count`);
    const categories: Array<{ slug: string; name: string }> = res.ok ? await res.json() : [];
    const urls = categories.map((c) => {
      const lastmod = new Date().toISOString().split('T')[0];
      return `  <url>\n    <loc>${SITE.url}/categoria/${c.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
      '\n'
    )}\n</urlset>`;
    return new Response(xml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (error) {
    console.error('Sitemap categories error:', error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
      { status: 500, headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
    );
  }
};
