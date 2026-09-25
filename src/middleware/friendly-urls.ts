/**
 * Friendly URL middleware — redirige las URLs antiguas a las limpias.
 *
 * Las URLs limpias las sirve Astro:
 *   - /{slug}        → src/pages/[slug].astro (SSR, producto-{slug}.html)
 *   - /blog/{slug}   → src/pages/blog/[slug].astro (WP o articulo-{slug}.html)
 *
 * Aquí solo hacemos los 301 de los patrones legados (no tocan las páginas Astro).
 */

import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async ({ request }, next) => {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const origin = url.origin;

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
