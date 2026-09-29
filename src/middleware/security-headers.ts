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
      // script-src con 'unsafe-inline' y el contador de Cloudflare (2026-09-29): sin eso el navegador bloqueaba los
      // scripts escritos dentro de la página — el aviso de país y la animación de preguntas-frecuentes, el buscador y
      // «Ver más» de /certificados — y el beacon de Cloudflare Web Analytics en todas las páginas con esta cabecera.
      response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' https:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; connect-src 'self' https://cloudflareinsights.com");
    }
  }

  return response;
});
