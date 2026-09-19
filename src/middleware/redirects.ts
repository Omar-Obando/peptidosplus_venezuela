/**
 * Redirect Middleware — alias amigables de rutas.
 *
 * Redirige rutas que los usuarios tienden a escribir (sin .html) hacia las
 * rutas reales de la app Astro. NO toca las páginas .html originales (paridad
 * 1:1 intacta: se sirven estáticas) ni sus versiones sin extensión.
 */

const REDIRECTS: Array<{ from: RegExp; to: string }> = [
  // Alias del catálogo / tienda
  { from: /^\/productos\/?$/i, to: '/shop' },
  { from: /^\/tienda\/?$/i, to: '/shop' },
  { from: /^\/catalogo\/?$/i, to: '/shop' },
  // Cuenta / pago
  { from: /^\/mi-cuenta\/?$/i, to: '/account' },
  { from: /^\/mi-cuenta\/(.*)$/i, to: '/account/$1' },
  { from: /^\/pago\/?$/i, to: '/checkout' },
  // Blog
  { from: /^\/noticias\/?$/i, to: '/blog' },
  { from: /^\/posts\/?$/i, to: '/blog' },
  // Búsqueda / FAQ
  { from: /^\/buscar\/?$/i, to: '/search' },
  { from: /^\/preguntas-frecuentes\/?$/i, to: '/faq' },
];

export async function onRequest({ request }: { request: Request }, next: () => Promise<Response>) {
  const url = new URL(request.url);

  for (const rule of REDIRECTS) {
    if (url.pathname.match(rule.from)) {
      const redirectUrl = new URL(rule.to, url.origin);
      redirectUrl.search = url.search;
      // 308 preserves method for POSTs from forms (only GET matters for pages).
      return Response.redirect(redirectUrl.toString(), 308);
    }
  }

  return next();
}
