/**
 * Friendly URL middleware — sirve las páginas estáticas bajo URLs limpias.
 *
 *  - `/producto-{slug}`  → `/{slug}`   (productos)
 *  - `/articulo-{slug}`  → `/blog/{slug}` (artículos, igual que el blog Astro)
 *
 * En producción (Cloudflare Workers) se lee el asset con `env.ASSETS.fetch()`,
 * que expone el directorio `public/`. En dev/fallback se usa `import.meta.glob`
 * (los HTML se incrustan en el bundle). Las rutas antiguas redirigen 301.
 */

import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';

const PRODUCT_SLUGS = new Set<string>([
  'agua-bacteriostatica', 'agua-bacteriostatica-hospira', 'cagrilintida',
  'cjc-1295-ipamorelin', 'cjc-1295-sin-dac', 'dsip', 'epitalon', 'ghk-cu',
  'glow', 'glutation', 'ipamorelin', 'kisspeptin-10', 'klow', 'kpv',
  'lemon-bottle', 'melanotan-2', 'mots-c', 'nad', 'pt-141', 'retatrutida',
  'selank', 'semaglutida', 'semax', 'sermorelin', 'ss-31-elamipretide',
  'tesamorelin', 'thymosin-alpha-1', 'tirzepatida', 'wolverine-bpc-157-tb-500',
]);

const PUBLIC_HTML: Record<string, string> = import.meta.glob('../../public/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function htmlFor(file: string): string | null {
  const key = Object.keys(PUBLIC_HTML).find((k) => k.endsWith('/' + file));
  return key ? (PUBLIC_HTML[key] as string) : null;
}

async function fetchAsset(pathname: string): Promise<string | null> {
  const assets = (env as any).ASSETS;
  if (assets && typeof assets.fetch === 'function') {
    try {
      const res = await assets.fetch(new Request('https://assets.local' + pathname));
      if (res.ok) return res.text();
    } catch { /* fallback */ }
  }
  return htmlFor(pathname.replace(/^\//, ''));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const origin = url.origin;

  async function servePublicHtml(publicPath: string, canonicalPath: string): Promise<Response> {
    const html = await fetchAsset('/' + publicPath);
    if (!html) {
      const res = await next();
      return res;
    }
    const canonical = `${origin}${canonicalPath}`;
    let out = html;
    if (/rel="canonical"/i.test(out)) {
      out = out.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${canonical}" />`);
    } else {
      out = out.replace(/<\/head>/i, `<link rel="canonical" href="${canonical}" />\n</head>`);
    }
    return new Response(out, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 1. URL limpia de PRODUCTO: /{slug} → sirve producto-{slug}.html
  const slug = pathname.slice(1);
  if (PRODUCT_SLUGS.has(slug) && !pathname.includes('.html')) {
    return servePublicHtml(`producto-${slug}.html`, `/${slug}`);
  }

  // 2. /blog/{slug}; si Astro ya lo sirve, no reemplazar
  const blogMatch = pathname.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blogMatch) {
    const res = await next();
    if (res.status !== 404) return res;
    return servePublicHtml(`articulo-${blogMatch[1]}.html`, `/blog/${blogMatch[1]}`);
  }

  // 3. Legado → 301 (no rompe indexación consolidada)
  const legacyProduct = pathname.match(/^\/producto-([a-z0-9-]+)$/);
  if (legacyProduct) {
    return Response.redirect(`${origin}/${legacyProduct[1]}`, 301);
  }
  const legacyArticle = pathname.match(/^\/articulo-([a-z0-9-]+)$/);
  if (legacyArticle) {
    return Response.redirect(`${origin}/blog/${legacyArticle[1]}`, 301);
  }

  return next();
});
