import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { BUILD_ID } from '../../lib/build-id';

/**
 * POST /api/cache-invalidate — purge KV cache entries when content changes.
 *
 * Called by a webhook (WordPress plugin on publish/edit/delete) with a bearer
 * token and a body describing what changed:
 *
 *   Authorization: Bearer <WEBHOOK_SECRET>
 *   { "slug": "my-post", "type": "post" }
 *
 * type: 'post' | 'category' | 'tag' | 'author' | 'all'
 * - post     -> purges /blog/{slug}
 * - category -> purges /categoria/*
 * - tag      -> purges /tag/*
 * - author   -> purges /autor/*
 * - all      -> purges every cached key
 *
 * Always also purges home (/) and blog index (/blog) since they aggregate posts.
 */

const SECRET = env?.WEBHOOK_SECRET || env?.WP_ACCESS_SECRET || '';

export const POST: APIRoute = async ({ request }) => {
  // Auth check
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!SECRET || token !== SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const kv = env?.CACHE as KVNamespace | undefined;
  if (!kv) {
    return new Response(JSON.stringify({ ok: false, error: 'no-kv' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const type = body.type || 'post';
  const slug = typeof body.slug === 'string' ? body.slug : '';

  try {
    // Las claves llevan el ID de build (page_post:v{id}/blog/{slug}), así que
    // los prefijos de purge lo incluyen; la caché de deploys anteriores
    // (sin este ID) expira sola por TTL.
    const purgePrefixes = new Set<string>([`page_home:${BUILD_ID}`, `page_blog:${BUILD_ID}`]);

    if (type === 'post' && slug) {
      purgePrefixes.add(`page_post:${BUILD_ID}/blog/${slug}`);
    } else if (type === 'category') {
      purgePrefixes.add(`page_cat:${BUILD_ID}`);
    } else if (type === 'tag') {
      purgePrefixes.add(`page_tag:${BUILD_ID}`);
    } else if (type === 'author') {
      purgePrefixes.add(`page_autor:${BUILD_ID}`);
    } else if (type === 'all') {
      // For 'all' we iterate everything and clear it.
      let cursor: string | undefined;
      do {
        const page = await kv.list({ cursor });
        if (page.keys.length > 0) {
          await kv.delete(page.keys.map((k: { name: string }) => k.name));
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return new Response(JSON.stringify({ ok: true, purged: 'all' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Purge all keys matching the prefixes.
    let purged = 0;
    for (const prefix of purgePrefixes) {
      let cursor: string | undefined;
      do {
        const page = await kv.list({ prefix, cursor });
        for (const key of page.keys) {
          await kv.delete(key.name);
          purged++;
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
    }

    return new Response(JSON.stringify({ ok: true, purged }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[cache-invalidate] error:', error);
    return new Response(JSON.stringify({ ok: false, error: 'kv-error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
