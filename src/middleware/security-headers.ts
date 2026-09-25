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
    }
  }

  return response;
});
