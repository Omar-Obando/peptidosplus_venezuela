/**
 * SEO Redirect Middleware.
 *
 * 301-redirects the legacy static-site URLs (articulo-*.html, producto-*.html,
 * articulos.html → /blog, índice → /blog) to the new headless routes,
 * preserving SEO equity. Runs AFTER canonical-host and BEFORE cache.
 */

const REDIRECT_MAP: Array<{ pattern: RegExp; to: string }> = [
  { pattern: /^\/articulos\.html$/i, to: '/blog' },
  { pattern: /^\/blog\.html$/i, to: '/blog' },
  { pattern: /^\/articulo-([a-z0-9-]+)\.html$/i, to: (m: RegExpMatchArray) => `/blog/${m[1]}` },
  { pattern: /^\/producto-([a-z0-9-]+)\.html$/i, to: (m: RegExpMatchArray) => `/shop/${m[1]}` },
  { pattern: /^\/index\.html$/i, to: '/' },
  { pattern: /^\/carrito\.html$/i, to: '/cart' },
  { pattern: /^\/checkout\.html$/i, to: '/checkout' },
  { pattern: /^\/contacto\.html$/i, to: '/contacto' },
  { pattern: /^\/faq\.html$/i, to: '/faq' },
  { pattern: /^\/privacidad\.html$/i, to: '/privacidad' },
  { pattern: /^\/certificados\.html$/i, to: '/certificados' },
];

export async function onRequest({ request }: { request: Request }, next: () => Promise<Response>) {
  const url = new URL(request.url);
  const path = url.pathname;

  for (const rule of REDIRECT_MAP) {
    const m = path.match(rule.pattern);
    if (m) {
      const to = typeof rule.to === 'function' ? rule.to(m) : rule.to;
      const redirectUrl = new URL(to, url.origin);
      redirectUrl.search = url.search;
      return Response.redirect(redirectUrl.toString(), 301);
    }
  }

  return next();
}
