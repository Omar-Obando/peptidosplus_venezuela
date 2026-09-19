/**
 * Canonical-host middleware (desactivado temporalmente).
 *
 * El dominio canónico ve.peptidosplus.com aún apunta a Vercel (404
 * DEPLOYMENT_NOT_FOUND), así que redirigir el worker a ese dominio rompe
 * /blog, /shop, /cart, /checkout y /account. Hasta que el custom domain
 * apunte al worker, este middleware es un passthrough: el Worker sirve las
 * rutas Astro/estáticas directamente desde *.workers.dev.
 *
 * Cuando ve.peptidosplus.com esté en Cloudflare, re-activa el 301 con:
 *   if (url.hostname.toLowerCase() !== 've.peptidosplus.com') { ... }
 */
export async function onRequest({ request }: { request: Request }, next: () => Promise<Response>) {
  return next();
}
