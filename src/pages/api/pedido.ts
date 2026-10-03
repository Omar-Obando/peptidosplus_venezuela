import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { procesarPedido, MAX_CUERPO } from '../../lib/pedidos/procesar-pedido.mjs';

/**
 * POST /api/pedido — guarda en WooCommerce el pedido que arma public/checkout.js y avisa por correo.
 *
 * Envoltorio fino: aquí solo se comprueba que la petición viene de nuestras páginas, que es JSON y que es
 * pequeña (20 KB). Todo lo demás (precios de WooCommerce, cédula, mínimo de Zelle, límite por IP, no duplicar,
 * correos) está en src/lib/pedidos/procesar-pedido.mjs, que no depende de Astro y tiene sus pruebas.
 *
 * Entra:  { orden, items:[{ id, nombre, dosis, cant }], datos:{ nombre, cedula, telefono, correo, notas },
 *           envio:{ transporte, estado, ciudad, oficina:{ nombre, direccion, telefono } },
 *           pago:{ metodo:'zelle'|'binance', referencia }, totalVisto }
 * Sale:   201 { ok:true, numero, total, simulado }
 *         error { ok:false, codigo, mensaje, extra } — agotado|total 409 · datos del pedido 422 · limite 429 ·
 *         servidor 500/502 · solicitud 400/403/413/415
 *
 * Los secretos se leen en tiempo de ejecución (env de 'cloudflare:workers'), no de import.meta.env:
 *   WC_CONSUMER_KEY, WC_CONSUMER_SECRET, GMAIL_USUARIO, GMAIL_CLAVE_APP  → wrangler secret put
 *   AVISOS_A (a quién llega el aviso de pedido nuevo; si falta, a GMAIL_USUARIO) → secreto o var
 *   WC_API_URL (la tienda)                                               → ya está en «vars» de wrangler.jsonc
 *   PEDIDOS_MODO = 'simulado' → valida todo pero no crea el pedido ni manda correos
 * Un pedido real hecho desde localhost se guarda marcado «PRUEBA — NO DESPACHAR».
 */

export const prerender = false;

const TOPE_DESCARTE = 256 * 1024;   // hasta aquí se lee (y se tira) un cuerpo demasiado grande antes de responder

type Resultado = { status: number; json: unknown; cabeceras?: Record<string, string> };

const responder = (r: Resultado) =>
  new Response(JSON.stringify(r.json), {
    status: r.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(r.cabeceras || {}) },
  });
const rechazo = (status: number, mensaje: string, cabeceras?: Record<string, string>) =>
  responder({ status, json: { ok: false, codigo: 'solicitud', mensaje, extra: null }, cabeceras });

/**
 * Lee el cuerpo sin guardar más de «max» bytes (null si se pasa). Lo que sobra se lee y se tira hasta
 * TOPE_DESCARTE, para responder el 413 con la petición ya consumida (en «wrangler dev», responder con el
 * cuerpo a medio leer tumba la petición siguiente); más allá, se corta.
 */
async function leerCuerpo(request: Request, max: number): Promise<string | null> {
  const lector = request.body ? request.body.getReader() : null;
  if (!lector) return '';
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > TOPE_DESCARTE) { await lector.cancel().catch(() => {}); return null; }
    if (total <= max) trozos.push(value);
  }
  if (total > max) return null;
  const todo = new Uint8Array(total);
  let desde = 0;
  for (const t of trozos) { todo.set(t, desde); desde += t.byteLength; }
  return new TextDecoder().decode(todo);
}

export const POST: APIRoute = async ({ request, url, locals }) => {
  // 1) Solo desde nuestras páginas. Con Content-Type JSON la comprobación de origen de Astro (security.checkOrigin)
  //    no actúa (solo mira formularios), así que se hace aquí: el navegador siempre manda Origin en un POST.
  const origen = request.headers.get('origin') || '';
  let mismoSitio = false;
  try { mismoSitio = Boolean(origen) && new URL(origen).host === url.host; } catch { /* Origin ilegible */ }
  if (!mismoSitio) return rechazo(403, 'Solicitud no permitida.');
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return rechazo(415, 'Solicitud no válida.');

  // 2) Cuerpo pequeño
  const crudo = await leerCuerpo(request, MAX_CUERPO);
  if (crudo == null) return rechazo(413, 'El pedido es demasiado grande. Recarga la página y vuelve a intentarlo.');

  // 3) waitUntil se llama como método del cfContext (suelta lanza «Illegal invocation»: ver middleware/cache.ts)
  const cf = (locals as any)?.cfContext as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
  const waitUntil = cf && typeof cf.waitUntil === 'function' ? (p: Promise<unknown>) => cf.waitUntil!(p) : undefined;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);

  const r = await procesarPedido({
    cuerpo: crudo,
    ip: request.headers.get('cf-connecting-ip') || '',
    env,
    waitUntil,
    prueba: local,
    eco: local,
  });
  return responder(r);
};

export const ALL: APIRoute = async () => rechazo(405, 'Método no permitido.', { Allow: 'POST' });
