import { sequence } from 'astro:middleware';
import { onRequest as canonicalHost } from './canonical-host';
import { onRequest as redirectsOnRequest } from './redirects';
import { onRequest as friendlyUrlsOnRequest } from './friendly-urls';
import { onRequest as cacheOnRequest } from './cache';

/**
 * Astro Middleware Entry Point (ve.peptidosplus.com).
 *
 * Order matters:
 *   1. canonicalHost → 301 bare domain → www (never cached)
 *   2. redirects     → 301 legacy aliases (shop, productos, etc.)
 *   3. friendly-urls → sirve /{slug} y /blog/{slug} desde public/*.html,
 *                      y 301 de /producto-* / /articulo-* a las limpias
 *   4. cache         → KV/ISR-style caching for cacheable routes
 */
export const onRequest = sequence(canonicalHost, redirectsOnRequest, friendlyUrlsOnRequest, cacheOnRequest);
