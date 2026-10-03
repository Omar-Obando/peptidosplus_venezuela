import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { configWoo, leerCatalogo } from '../../lib/pedidos/woo.mjs';
import { llano } from '../../lib/pedidos/pedido-woo.mjs';

/**
 * GET /api/existencias — qué productos y presentaciones están agotados en WooCommerce.
 *
 * 2026-10-03, Angel: «si los productos están agotados no permitas que los agreguen al carrito… y si ya los había
 * agregado, que se le quiten». La lee public/carrito.js al abrir cualquier página.
 *
 * Usa el mismo catálogo que /api/pedido (KV «CACHE», 3 min), así que no añade peticiones a la tienda.
 * Las claves van normalizadas con llano() (minúsculas, sin tildes): el navegador hace lo mismo.
 *   { ok: true, agotados: { 'semaglutida': '*', 'mots c': ['10 mg'], … } }
 *   '*' = el producto entero; lista = solo esas presentaciones.
 * Si la tienda no responde: { ok: false } y el carrito no quita nada (/api/pedido sigue rechazando lo agotado).
 */
export const prerender = false;

const responder = (status: number, json: unknown) =>
  new Response(JSON.stringify(json), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // un minuto en el navegador y en el borde: suficiente para no golpear la tienda en cada página
      'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
    },
  });

export const GET: APIRoute = async () => {
  const e = (env || {}) as Record<string, unknown>;
  const woo = configWoo(e);
  if (!woo) return responder(503, { ok: false });
  try {
    const { catalogo } = await leerCatalogo(woo, (e.CACHE as KVNamespace) || null);
    const agotados: Record<string, string | string[]> = {};
    for (const p of catalogo as Array<{ nombre: string; tipo: string; stock: string; vars: Array<{ stock: string; attr: string }> }>) {
      const clave = llano(p.nombre);
      if (p.tipo !== 'variable') {
        if (p.stock !== 'instock') agotados[clave] = '*';
        continue;
      }
      const sin = p.vars.filter((v) => v.stock !== 'instock').map((v) => String(v.attr).split('=').pop() || '');
      if (p.vars.length && sin.length === p.vars.length) agotados[clave] = '*';
      else if (sin.length) agotados[clave] = sin.map((x) => llano(x));
    }
    return responder(200, { ok: true, agotados });
  } catch (err) {
    console.error('[existencias] no se pudo leer el catálogo:', (err as Error)?.message || err);
    return responder(502, { ok: false });
  }
};
