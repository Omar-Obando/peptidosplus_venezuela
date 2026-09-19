/**
 * Canonical-host redirect middleware.
 *
 * 301 redirects non-canonical hosts (e.g. https://ve-cms.peptidosplus.com or
 * any other host) to https://ve.peptidosplus.com preserving path/query.
 * Runs FIRST in the middleware chain so it is never cached.
 */

const CANONICAL_HOST = 've.peptidosplus.com';

export async function onRequest({ request }: { request: Request }, next: () => Promise<Response>) {
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== CANONICAL_HOST) {
    const redirectUrl = new URL(url.pathname + url.search, `https://${CANONICAL_HOST}`);
    return Response.redirect(redirectUrl.toString(), 301);
  }
  return next();
}
