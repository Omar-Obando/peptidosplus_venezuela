/**
 * Minimal ambient typing for Astro's Cloudflare adapter runtime module.
 *
 * `cloudflare:workers` is provided by the @astrojs/cloudflare adapter at
 * runtime; this declaration only gives TypeScript the shape we use
 * (the CACHE KV binding) without pulling `@cloudflare/workers-types` into
 * the global scope (which would shadow the DOM lib and turn every
 * `response.json()` into `unknown`).
 */
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown> & {
    CACHE?: KVNamespace;
  };
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string | string[]): Promise<void>;
  list(options?: {
    cursor?: string;
    prefix?: string;
  }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}
