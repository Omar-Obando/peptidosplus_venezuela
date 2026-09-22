import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { BUILD_ID } from '../lib/build-id';

/**
 * Cloudflare KV Cache Middleware — ISR-like caching for SSR pages.
 *
 *   1. KV cache check (fast global read) — serves HTML directly on HIT
 *   2. Normal Astro SSR render on MISS
 *   3. Async KV write via waitUntil — doesn't delay response
 *
 * TTL strategy:
 *   - Post detail /blog/{slug}      : 15 days (invalidate via /api/cache-invalidate)
 *   - Static pages                  : 15 days
 *   - Homepage /                    :  1 day
 *   - Blog index /blog              :  1 day
 *   - Category/Tag archives         :  1 day
 *
 * Never cached: /api/*, /sitemap*, /contacto, /faq, 404.
 */

const TTL_15_DAYS = 15 * 24 * 60 * 60;
const TTL_1_DAY = 1 * 24 * 60 * 60;

const CACHED_ROUTES: Array<{ pattern: RegExp; ttl: number; keyPrefix: string }> = [
  { pattern: /^\/blog\/[^/]+\/?$/, ttl: TTL_15_DAYS, keyPrefix: 'page_post' },
  { pattern: /^\/$/, ttl: TTL_1_DAY, keyPrefix: 'page_home' },
  { pattern: /^\/blog(\/)?$/, ttl: TTL_1_DAY, keyPrefix: 'page_blog' },
  { pattern: /^\/categoria(\/.*)?$/, ttl: TTL_1_DAY, keyPrefix: 'page_cat' },
  { pattern: /^\/tag(\/.*)?$/, ttl: TTL_1_DAY, keyPrefix: 'page_tag' },
  { pattern: /^\/autor(\/.*)?$/, ttl: TTL_1_DAY, keyPrefix: 'page_autor' },
  { pattern: /^\/shop(\/.*)?$/, ttl: TTL_1_DAY, keyPrefix: 'page_shop' },
  { pattern: /^\/(privacidad|terminos|faq|contacto|search)(\/)?$/, ttl: TTL_15_DAYS, keyPrefix: 'page_static' },
];

const SKIP_PATTERNS = [
  /^\/api\//,
  /^\/sitemap/,
  /\.xml$/,
  /^\/_/,
  /^\/cdn-cgi\//,
  /^\/404/,
  /^\/checkout/,
  /^\/cart/,
  /^\/login/,
  /^\/register/,
];

function getRouteConfig(pathname: string) {
  if (SKIP_PATTERNS.some((p) => p.test(pathname))) return null;
  return CACHED_ROUTES.find((r) => r.pattern.test(pathname)) ?? null;
}

function buildCacheKey(pathname: string): string {
  // Las claves llevan el ID de build: page_post:v{id}/blog/{slug}.
  // Cada deploy usa claves nuevas; la caché vieja expira sola por TTL.
  return `${BUILD_ID}${pathname}`;
}

/**
 * Safely resolve the KV binding. In the Worker runtime the `CACHE` binding is
 * exposed through `env` (from 'cloudflare:workers'); in prerender/Node contexts
 * no binding exists, so `env?.CACHE` may be undefined.
 */
function getKV(): KVNamespace | undefined {
  return env?.CACHE as KVNamespace | undefined;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const url = new URL(request.url);

  // Only cache GET/HEAD HTML for the canonical host.
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();
  if (!url.pathname || url.search) return next();

  const cfg = getRouteConfig(url.pathname);
  if (!cfg) return next();

  // KV bindings may not exist in dev/local preview — gracefully skip.
  const kv = getKV();
  if (!kv) {
    console.log('[cache] no KV binding — cache skipped', url.pathname);
    return next();
  }

  const key = `${cfg.keyPrefix}:${buildCacheKey(url.pathname)}`;

  // 1. Cache HIT: serve stored HTML.
  try {
    const cached: string | null = await kv.get(key);
    if (cached) {
      const headers = new Headers();
      headers.set('Content-Type', 'text/html; charset=utf-8');
      headers.set('X-Astro-Cache', 'HIT');
      return new Response(cached, { headers });
    }
  } catch {
    /* fall through to render */
  }

  // 2. Render.
  const response = await next();

  // Only cache successful HTML responses.
  if (!response.ok) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  // 3. Async write (does not delay the response).
  // waitUntil está en el ExecutionContext de Cloudflare (locals.cfContext),
  // NO en locals.waitUntil (en Astro 6.4.8 + @astrojs/cloudflare se pasa
  // como RenderOption a app.render y no llega al middleware).
  try {
    const html = await response.clone().text();
    const waitUntil = ((context.locals as any)?.cfContext?.waitUntil as ((p: Promise<unknown>) => void) | undefined);
    console.log('[cache] write key=', key, 'waitUntil=', typeof waitUntil, 'htmlLen=', html.length);
    if (waitUntil) {
      waitUntil(kv.put(key, html, { expirationTtl: cfg.ttl }));
    } else {
      // Fallback: escritura sincrónica best-effort.
      await kv.put(key, html, { expirationTtl: cfg.ttl }).catch((e) => { console.error('[cache] kv.put failed', e); });
    }
  } catch (e) {
    console.error('[cache] cache write error', e);
    /* best effort */
  }

  const headers = new Headers(response.headers);
  headers.set('X-Astro-Cache', 'MISS');
  return new Response(response.body, { headers, status: response.status });
});
