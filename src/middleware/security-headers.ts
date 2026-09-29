/**
 * Security Headers middleware.
 *
 * Añade cabeceras de seguridad a todas las respuestas (solo en PROD).
 */

import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  if (import.meta.env.PROD) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; connect-src 'self'");
    }
  }

  return response;
});
