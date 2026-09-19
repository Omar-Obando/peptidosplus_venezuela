/**
 * WordPress Connection Config
 *
 * Managed by PhantomWP. Rewritten when you change your WordPress URL or
 * image-source mode in the IDE. Safe to commit -- and safe to publish, even
 * to a public GitHub repo, because the access secret is NEVER stored here.
 *
 * Your secret lives in .env (gitignored) for local development and in your
 * hosting platform's env-var settings for production. Astro reads it via
 * import.meta.env.WP_ACCESS_SECRET at build time.
 *
 * If you want to add custom helpers, put them in src/lib/functions.ts (which
 * PhantomWP never overwrites). The full WordPress client lives in
 * @phantomwp/wordpress (.phantomwp/runtime/lib/wordpress.ts).
 */

export const WP_API_URL = 'https://ve-cms.peptidosplus.com/wp-json';

/**
 * WordPress access token sent as the X-PhantomWP-Secret header.
 *
 * Comes exclusively from import.meta.env.WP_ACCESS_SECRET. Set it in:
 *   - .env (local dev / codespaces -- gitignored)
 *   - your hosting platform's env-var UI (production)
 *
 * If the variable is missing, requests that require auth will fail with a
 * 401 from WordPress. That's intentional -- it surfaces a missing
 * configuration loudly instead of silently using a stale baked-in value.
 */
export const WP_ACCESS_SECRET: string = import.meta.env.WP_ACCESS_SECRET || '';

/**
 * Image handling mode:
 *   'local' = download from WordPress and serve from /media/cms/
 *   'cdn'   = keep original WordPress URLs (no download, no optimization)
 */
export const IMAGE_SOURCE_MODE: 'local' | 'cdn' = 'local';
