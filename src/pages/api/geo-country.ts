import type { APIRoute } from 'astro';

/**
 * GET /api/geo-country — país del visitante detectado por IP (Cloudflare CF-IPCountry).
 * Usado por el banner geo en páginas estáticas (public/index.html, store.html, etc.)
 * que no pasan por el SSR de Astro y por tanto no tienen CF-IPCountry en el template.
 */
export const GET: APIRoute = async ({ request }) => {
  const country = request.headers.get('CF-IPCountry') || '';
  return new Response(JSON.stringify({ country }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
