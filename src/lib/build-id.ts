/**
 * ID de build único por compilación (git SHA + timestamp), incrustado por Vite
 * `define` (véase astro.config.mjs). Se usa como versión en las claves KV
 * (page_post:v{id}/blog/{slug}) para que cada deploy genere claves nuevas:
 * la caché de deploys anteriores expira sola por TTL y nunca se sirve HTML
 * con assets muertos.
 */
declare const __BUILD_ID__: string | undefined;

export const BUILD_ID: string =
  typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : 'vdev';
