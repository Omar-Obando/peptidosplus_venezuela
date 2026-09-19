import { sequence } from 'astro:middleware';
import { onRequest as canonicalHost } from './canonical-host';
import { onRequest as redirectsOnRequest } from './redirects';
import { onRequest as cacheOnRequest } from './cache';

/**
 * Astro Middleware Entry Point (ve.peptidosplus.com).
 *
 * Order matters:
 *   1. canonicalHost → 301 bare domain → www (never cached)
 *   2. redirects     → 301 legacy URLs (articulo-*.html, producto-*.html)
 *   3. cache         → KV/ISR-style caching for cacheable routes
 */
export const onRequest = sequence(canonicalHost, redirectsOnRequest, cacheOnRequest);
