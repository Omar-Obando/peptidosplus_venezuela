/* woo.mjs — lo que /api/pedido le pide a WooCommerce (wc/v3). Solo servidor: no importar desde el navegador.
 *
 * La clave llega en tiempo de ejecución (env de 'cloudflare:workers'), nunca de import.meta.env: en Astro 6
 * import.meta.env se resuelve al compilar, con el .env de quien compila.
 *
 * «woo» es lo que devuelve configWoo(): { raiz, auth, admin, fetch }. «kv» es el binding CACHE (o nada).
 */

export class ErrorTienda extends Error {
  /** dudoso: true si no se sabe si WooCommerce llegó a hacer lo pedido (corte o tiempo agotado al escribir). */
  constructor(status, codigo, mensaje, dudoso = false) {
    super(mensaje);
    this.name = 'ErrorTienda';
    this.status = status;
    this.codigo = codigo;
    this.dudoso = dudoso;
  }
}

const RAIZ_POR_DEFECTO = 'https://ve-cms.peptidosplus.com/wp-json';
const CLAVE_CATALOGO = 'pedidos:catalogo:v1';
export const TTL_CATALOGO = 180;          // 3 min

/** Devuelve null si faltan las claves (WC_CONSUMER_KEY / WC_CONSUMER_SECRET). «traer» sustituye a fetch en las pruebas. */
export function configWoo(env, traer) {
  env = env || {};
  const clave = String(env.WC_CONSUMER_KEY || '').trim();
  const secreto = String(env.WC_CONSUMER_SECRET || '').trim();
  if (!clave || !secreto) return null;
  const base = String(env.WC_API_URL || env.WP_API_URL || RAIZ_POR_DEFECTO).replace(/\/+$/, '').replace(/\/wc\/v\d+$/i, '');
  return { raiz: base + '/wc/v3', auth: 'Basic ' + btoa(clave + ':' + secreto), admin: base.replace(/\/wp-json$/i, ''), fetch: traer || null };
}

async function api(woo, metodo, ruta, cuerpo, ms = 20000) {
  const nombre = metodo + ' ' + ruta.split('?')[0];
  const traer = woo.fetch || fetch;
  let r;
  try {
    r = await traer(woo.raiz + ruta, {
      method: metodo,
      headers: Object.assign({ Authorization: woo.auth, Accept: 'application/json' }, cuerpo ? { 'Content-Type': 'application/json' } : {}),
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(ms),
    });
  } catch {
    throw new ErrorTienda(0, 'red', nombre + ' no respondió', metodo !== 'GET');
  }
  let datos = null;
  try { datos = await r.json(); } catch { /* sin cuerpo o no es JSON */ }
  if (!r.ok) throw new ErrorTienda(r.status, String((datos && datos.code) || 'http'), nombre + ' → ' + r.status, metodo !== 'GET' && r.status >= 500);
  return { datos, cabeceras: r.headers };
}

/** Todas las páginas de un listado (100 por página, 5 páginas como mucho). */
async function todas(woo, ruta) {
  const filas = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const { datos, cabeceras } = await api(woo, 'GET', ruta + (ruta.includes('?') ? '&' : '?') + 'per_page=100&page=' + pagina);
    if (Array.isArray(datos)) filas.push(...datos);
    if (pagina >= Number((cabeceras && cabeceras.get && cabeceras.get('x-wp-totalpages')) || 1)) break;
  }
  return filas;
}

/**
 * El catálogo con la forma que espera construirPedido():
 *   [{ id, nombre, tipo, precio, stock, vars: [{ id, precio, stock, attr: 'Presentacion=10 mg' }] }]
 * Dos peticiones en paralelo (productos + todas las variaciones) y un caché de 3 min en KV.
 * edad: segundos que lleva en caché lo devuelto (0 si se acaba de leer de la tienda).
 */
export async function leerCatalogo(woo, kv, fresco = false) {
  if (!fresco && kv) {
    try {
      const guardado = await kv.get(CLAVE_CATALOGO);
      if (guardado) {
        const j = JSON.parse(guardado);
        if (Array.isArray(j.productos) && j.productos.length) return { catalogo: j.productos, edad: Math.max(0, Math.round((Date.now() - j.t) / 1000)) };
      }
    } catch { /* caché ilegible: se lee de la tienda */ }
  }
  const [productos, variaciones] = await Promise.all([
    todas(woo, '/products?status=publish&_fields=id,name,type,price,stock_status'),
    todas(woo, '/variations?status=publish&_fields=id,parent_id,price,stock_status,attributes'),
  ]);
  const catalogo = productos.map((p) => ({ id: p.id, nombre: p.name, tipo: p.type, precio: p.price, stock: p.stock_status, vars: [] }));
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  for (const v of variaciones) {
    const padre = porId.get(v.parent_id);
    if (padre) padre.vars.push({ id: v.id, precio: v.price, stock: v.stock_status, attr: (v.attributes || []).map((a) => a.name + '=' + a.option).join(',') });
  }
  if (!catalogo.length) throw new ErrorTienda(502, 'catalogo', 'La tienda devolvió un catálogo vacío');
  if (kv) {
    try { await kv.put(CLAVE_CATALOGO, JSON.stringify({ t: Date.now(), productos: catalogo }), { expirationTtl: TTL_CATALOGO }); } catch { /* sin caché esta vez */ }
  }
  return { catalogo, edad: 0 };
}

/** POST /orders. Devuelve el pedido tal como lo guardó WooCommerce (id, number, total, line_items…). */
export async function crearPedido(woo, pedido) {
  const { datos } = await api(woo, 'POST', '/orders', pedido, 25000);
  if (!datos || datos.id == null) throw new ErrorTienda(502, 'respuesta', 'La tienda no devolvió el pedido', true);
  return datos;
}

/** Nota privada del pedido (no la ve el cliente). */
export async function anotar(woo, id, nota) {
  await api(woo, 'POST', '/orders/' + encodeURIComponent(String(id)) + '/notes', { note: nota, customer_note: false }, 15000);
}

/**
 * Busca entre los pedidos de las últimas 2 horas el que lleve esta orden de la web (meta pp_orden_web).
 * Sirve para no duplicar cuando un intento anterior se cortó sin saber si la tienda llegó a guardarlo.
 */
export async function buscarPorOrden(woo, orden) {
  const desde = new Date(Date.now() - 2 * 3600 * 1000).toISOString().slice(0, 19);
  const { datos } = await api(woo, 'GET', '/orders?per_page=30&orderby=date&order=desc&dates_are_gmt=true&after=' + encodeURIComponent(desde) + '&_fields=id,number,total,currency,status,billing,meta_data');
  if (!Array.isArray(datos)) return null;
  return datos.find((o) => Array.isArray(o.meta_data) && o.meta_data.some((m) => m && m.key === 'pp_orden_web' && m.value === orden)) || null;
}
