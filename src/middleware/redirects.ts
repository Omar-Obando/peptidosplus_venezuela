/**
 * Redirect Middleware — alias amigables de rutas.
 *
 * Redirige rutas que los usuarios tienden a escribir (sin .html) hacia las
 * rutas reales de la app Astro. NO toca las páginas .html originales (paridad
 * 1:1 intacta: se sirven estáticas) ni sus versiones sin extensión.
 *
 * Las URLs canónicas son en español (/tienda, /carrito, /finalizar-compra,
 * /buscar, /preguntas-frecuentes, /cuenta); los alias en inglés → 308.
 * Los alias legados (productos, catalogo, shop, mi-cuenta, pago, faq...)
 * redirigen con 308 al camino canónico.
 *
 * Los patrones con grupos de captura ($1) sustituyen el slug capturado.
 */

import { defineMiddleware } from 'astro:middleware';

const REDIRECTS: Array<{ from: RegExp; to: string }> = [
  // Alias del catálogo / tienda (inglés y español antiguo → español canónico)
  { from: /^\/productos\/?$/i, to: '/tienda' },
  { from: /^\/catalogo\/?$/i, to: '/tienda' },
  { from: /^\/shop\/?$/i, to: '/tienda' },
  { from: /^\/shop\/category\/(.*)$/i, to: '/tienda/categoria/$1' },
  { from: /^\/shop\/product\/(.*)$/i, to: '/tienda/producto/$1' },
  // Carrito / pago
  { from: /^\/cart\/?$/i, to: '/carrito' },
  { from: /^\/checkout\/?$/i, to: '/finalizar-compra' },
  // Cuenta
  { from: /^\/account\/?$/i, to: '/cuenta' },
  { from: /^\/account\/(.*)$/i, to: '/cuenta/$1' },
  { from: /^\/mi-cuenta\/?$/i, to: '/cuenta' },
  { from: /^\/mi-cuenta\/(.*)$/i, to: '/cuenta/$1' },
  { from: /^\/pago\/?$/i, to: '/finalizar-compra' },
  // Blog
  { from: /^\/noticias\/?$/i, to: '/blog' },
  { from: /^\/posts\/?$/i, to: '/blog' },
  // Búsqueda / FAQ
  { from: /^\/search\/?$/i, to: '/buscar' },
  { from: /^\/faq\/?$/i, to: '/preguntas-frecuentes' },
];

export const onRequest = defineMiddleware(async ({ request }, next) => {
  const url = new URL(request.url);

  for (const rule of REDIRECTS) {
    const match = url.pathname.match(rule.from);
    if (match) {
      let to = rule.to;
      if (match.length > 1) {
        to = to.replace(/\$(\d)/g, (_m, d: string) => match[Number(d)] ?? '');
      }
      const redirectUrl = new URL(to, url.origin);
      redirectUrl.search = url.search;
      // 308 preserves method for POSTs from forms (only GET matters for pages).
      return Response.redirect(redirectUrl.toString(), 308);
    }
  }

  return next();
});
