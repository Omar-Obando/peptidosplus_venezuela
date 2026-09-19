/**
 * WordPress integration entry point.
 *
 * As of PhantomWP infrastructure 1.25 the actual WordPress helpers live in
 * @phantomwp/wordpress (.phantomwp/runtime/lib/wordpress.ts) and your
 * connection config lives in src/lib/wordpress-config.ts.
 *
 * This file is just a re-export so existing imports like
 *   import { getPosts } from '../lib/wordpress';
 * keep working. New code can import from '@phantomwp/wordpress' directly.
 */

export * from '@phantomwp/wordpress';
