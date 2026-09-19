import type { APIRoute } from 'astro';
import { SITE } from '../lib/site';
import { WP_API_URL } from '../lib/wordpress-config';

/**
 * Paginated post sitemap — /sitemap-posts-[page].xml
 * Mirrors sesioniniciar.com: on-demand XML built from WP REST, 100 URLs/page.
 */
export const GET: APIRoute = async ({ params }) => {
  const pageNum = parseInt(params.page || '1', 10);
  try {
    const res = await fetch(
      `${WP_API_URL}/wp/v2/posts?page=${pageNum}&per_page=100&_fields=slug,modified,date`
    );
    if (!res.ok) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
        { headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
      );
    }
    const posts: Array<{ slug: string; modified: string }> = await res.json();
    const urls = posts.map((p) => {
      const lastmod = p.modified ? new Date(p.modified).toISOString().split('T')[0] : '';
      return `  <url>\n    <loc>${SITE.url}/blog/${p.slug}</loc>${
        lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''
      }\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`;
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
      '\n'
    )}\n</urlset>`;
    return new Response(xml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (error) {
    console.error(`Sitemap posts page ${pageNum} error:`, error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
      { status: 500, headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
    );
  }
};
