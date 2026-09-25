/**
 * Astro Middleware (entry point único — src/middleware.ts).
 *
 * Astro solo carga `src/middleware.ts` (no `src/middleware/index.ts`), así que
 * aquí se compone la cadena completa:
 *   1. canonicalHost   → 301 bare domain → www (nunca cachea)
 *   2. redirects       → 301 aliases (shop, productos, etc.)
 *   3. friendly-urls   → sirve /{slug} y /blog/{slug} desde public/*.html,
 *                        y 301 de /producto-* / /articulo-* a las limpias
 *   4. cache           → KV/ISR-style caching for cacheable routes
 *   5. securityHeaders → headers de seguridad (solo en PROD)
 */

import { sequence } from 'astro:middleware';
import { onRequest as canonicalHost } from './middleware/canonical-host';
import { onRequest as redirectsOnRequest } from './middleware/redirects';
import { onRequest as friendlyUrlsOnRequest } from './middleware/friendly-urls';
import { onRequest as cacheOnRequest } from './middleware/cache';
import { onRequest as securityHeaders } from './middleware/security-headers';

export const onRequest = sequence(
  canonicalHost,
  redirectsOnRequest,
  friendlyUrlsOnRequest,
  cacheOnRequest,
  securityHeaders
);
