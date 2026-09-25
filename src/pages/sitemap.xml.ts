import type { APIRoute } from 'astro';
import { SITE } from '../lib/site';
import { WP_API_URL } from '../lib/wordpress-config';

const PER_PAGE = 100;

/**
 * Sitemap index — /sitemap.xml
 * Lists sitemap-pages, sitemap-posts-N, sitemap-categories, sitemap-tags.
 */
export const GET: APIRoute = async () => {
  try {
    const res = await fetch(`${WP_API_URL}/wp/v2/posts?per_page=${PER_PAGE}&_fields=slug`);
    let totalPages = 1;
    if (res.ok) {
      const totalItems = parseInt(res.headers.get('x-wp-total') || '0', 10);
      totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));
    }

    const isoDate = new Date().toISOString();
    const entries = [
      `  <sitemap>\n    <loc>${SITE.url}/sitemap-pages.xml</loc>\n    <lastmod>${isoDate}</lastmod>\n  </sitemap>`,
      `  <sitemap>\n    <loc>${SITE.url}/sitemap-products.xml</loc>\n    <lastmod>${isoDate}</lastmod>\n  </sitemap>`,
      `  <sitemap>\n    <loc>${SITE.url}/sitemap-categories.xml</loc>\n    <lastmod>${isoDate}</lastmod>\n  </sitemap>`,
      `  <sitemap>\n    <loc>${SITE.url}/sitemap-tags.xml</loc>\n    <lastmod>${isoDate}</lastmod>\n  </sitemap>`,
    ];
    for (let page = 1; page <= totalPages; page++) {
      entries.push(
        `  <sitemap>\n    <loc>${SITE.url}/sitemap-posts-${page}.xml</loc>\n    <lastmod>${isoDate}</lastmod>\n  </sitemap>`
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join(
      '\n'
    )}\n</sitemapindex>`;
    return new Response(xml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (error) {
    console.error('Sitemap index error:', error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>',
      { status: 500, headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
    );
  }
};
