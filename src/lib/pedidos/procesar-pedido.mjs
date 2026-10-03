/* procesar-pedido.mjs — el corazón de POST /api/pedido. No sabe nada de Astro: recibe el cuerpo, la IP y el
 * «env» del Worker, y devuelve { status, json, cabeceras }. Así se prueba con node --test, sin red.
 *
 *   const r = await procesarPedido({ cuerpo, ip, env, waitUntil, prueba, eco });
 *
 *   cuerpo     texto JSON (o el objeto ya leído) con la forma:
 *              { orden:'ORD-529342', items:[{ id, nombre, dosis, cant }],
 *                datos:{ nombre, cedula, telefono, correo, notas },
 *                envio:{ transporte:'zoom', estado, ciudad, oficina:{ nombre, direccion, telefono } },
 *                pago:{ metodo:'zelle'|'binance', referencia }, totalVisto:284.97 }
 *   ip         la de cf-connecting-ip (límite: 5 pedidos cada 10 min)
 *   env        secretos y bindings EN TIEMPO DE EJECUCIÓN: WC_CONSUMER_KEY, WC_CONSUMER_SECRET, GMAIL_USUARIO,
 *              GMAIL_CLAVE_APP, AVISOS_A, WC_API_URL, PEDIDOS_MODO y el KV «CACHE»
 *   waitUntil  opcional: función que recibe una promesa (nota privada + correos) para no hacer esperar al cliente
 *   prueba     true → el pedido real se guarda marcado «PRUEBA — NO DESPACHAR» (lo pone la ruta en localhost)
 *   eco        true → en modo simulado la respuesta trae además el pedido armado (solo para pruebas locales)
 *
 * Respuestas:
 *   201 { ok:true, numero:'145', total:284.97, simulado:false }   (+ repetido:true si esa orden ya estaba guardada)
 *   error { ok:false, codigo, mensaje (texto listo para el cliente), extra } con codigo:
 *     agotado | total → 409 · vacio | cantidad | producto | presentacion | nombre | cedula | telefono | correo |
 *     envio | pago | zelle | referencia → 422 · limite → 429 · servidor → 500 / 502 · solicitud → 400 / 413
 *
 * MODO SIMULADO (env.PEDIDOS_MODO === 'simulado'): valida todo igual contra el catálogo real, pero NO crea el
 * pedido ni manda correos; responde 201 con numero 'SIM-' + 4 cifras y simulado:true.
 *
 * «deps» solo lo usan las pruebas: { fetch, enviarCorreo, esperar, registro }.
 */
import { construirPedido, ErrorPedido, CODIGOS_CONFLICTO } from './pedido-woo.mjs';
import { ErrorTienda, anotar, buscarPorOrden, configWoo, crearPedido, leerCatalogo } from './woo.mjs';
import { enviarCorreo } from './correo-smtp.js';
import { correoAviso, correoCliente, desdeWoo } from './correos-plantillas.mjs';

export const MAX_CUERPO = 20 * 1024;     // bytes: un pedido de 40 líneas no llega a 6 KB
export const VENTANA_IP = 600;           // 10 min
export const MAX_PEDIDOS_IP = 5;         // pedidos por IP en esa ventana
const TTL_HECHO = 24 * 3600;             // la orden ya guardada se recuerda 24 h
const TTL_CANDADO = 120;                 // una orden «en curso» bloquea su repetición 2 min como mucho
const ESPERA_CANDADO_MS = 30000;         // lo que tarda como mucho el POST a la tienda
const RELEER_CATALOGO_S = 60;            // si el pedido no cuadra y el caché tiene más de 1 min, se relee una vez

const WHATSAPP = '+1 (580) 643-6837';
const MSJ_SERVIDOR = 'No pudimos registrar tu pedido. Inténtalo de nuevo en un momento o escríbenos por WhatsApp al ' + WHATSAPP + '.';
const MSJ_SOLICITUD = 'No pudimos leer tu pedido. Recarga la página y vuelve a intentarlo.';
const MSJ_LIMITE = 'Hiciste varios pedidos seguidos. Espera unos minutos o escríbenos por WhatsApp al ' + WHATSAPP + '.';
const MSJ_EN_CURSO = 'Tu pedido se está registrando. Espera unos segundos antes de volver a intentarlo.';

const falla = (status, codigo, mensaje, extra, cabeceras) => ({ status, json: { ok: false, codigo, mensaje, extra: extra || null }, cabeceras: cabeceras || {} });
const exito = (numero, total, simulado, mas) => ({ status: 201, json: Object.assign({ ok: true, numero: String(numero), total: Number(total), simulado: Boolean(simulado) }, mas || {}), cabeceras: {} });
const digitos = (s) => String(s == null ? '' : s).replace(/\D/g, '');
const motivo = (err) => (err && (err.codigo || err.code || err.name)) || 'error';

/** La IP la pone Cloudflare (cf-connecting-ip). De una IPv6 se toma el /64 de la conexión. */
function ipLimpia(ip) {
  const s = String(ip || '').trim().toLowerCase().replace(/[^0-9a-f.:]/g, '').slice(0, 45);
  if (!s) return 'sin-ip';
  return s.includes(':') ? s.split(':').slice(0, 4).join(':') : s;
}

async function leerJson(kv, clave) {
  if (!kv) return null;
  try { const v = await kv.get(clave); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function guardar(kv, clave, valor, ttl, registro) {
  if (!kv) return;
  try { await kv.put(clave, JSON.stringify(valor), { expirationTtl: Math.max(60, Math.round(ttl)) }); }
  catch (err) { registro.error('[pedido] KV no guardó', clave.split(':').slice(0, 2).join(':'), motivo(err)); }
}
async function borrar(kv, clave) {
  if (!kv) return;
  try { await kv.delete(clave); } catch { /* caduca sola */ }
}

/**
 * Catálogo (caché de 3 min en KV) + construirPedido. Si el pedido no cuadra por algo que depende del catálogo
 * (total, producto, presentación, existencias) y el caché tiene más de 1 min, se relee de la tienda y se
 * intenta una vez más: un cambio de precio o de existencias reciente no rechaza un pedido bueno.
 */
async function armar(woo, kv, web, opciones) {
  let { catalogo, edad } = await leerCatalogo(woo, kv);
  try {
    return construirPedido(web, catalogo, opciones);
  } catch (err) {
    const delCatalogo = err instanceof ErrorPedido && ['total', 'producto', 'presentacion', 'agotado'].includes(String(err.codigo));
    if (!delCatalogo || edad < RELEER_CATALOGO_S) throw err;
    ({ catalogo, edad } = await leerCatalogo(woo, kv, true));
    return construirPedido(web, catalogo, opciones);
  }
}

/**
 * Nota privada + los dos correos, a la vez. Nunca lanza: el pedido ya está guardado; lo que falle queda en el
 * registro del Worker con la etiqueta [pedido], sin datos del cliente ni claves.
 */
async function despues({ e, woo, creado, nota, web, cuentas, cedula, mandar, registro }) {
  const tareas = [
    anotar(woo, creado.id, nota).catch((err) => registro.error('[pedido] nota privada NO guardada · pedido', creado.id, '·', motivo(err))),
  ];
  const usuario = String(e.GMAIL_USUARIO || '').trim();
  const clave = String(e.GMAIL_CLAVE_APP || '');
  const avisosA = String(e.AVISOS_A || e.PEDIDOS_AVISOS_A || usuario).split(/[,;\s]+/).filter(Boolean);
  const base = { servidor: 'smtp.gmail.com', puerto: 465, usuario, clave, de: { nombre: 'Peptidos Plus', correo: usuario } };
  const opciones = { tiempoMaximoMs: 15000, dominio: 've.peptidosplus.com' };
  const enviar = async (cual, para, c) => {
    try {
      const r = await mandar(Object.assign({}, base, { para, responderA: c.responderA || undefined, asunto: c.asunto, texto: c.texto, html: c.html }), opciones);
      registro.log('[pedido] correo', cual, 'enviado · pedido', creado.id, '·', (r && r.ms) || 0, 'ms');
    } catch (err) {
      registro.error('[pedido] correo', cual, 'NO enviado · pedido', creado.id, '·', motivo(err), (err && err.etapa) || '');
    }
  };
  try {
    const p = desdeWoo(creado, web, cuentas, { admin: woo.admin });
    p.cliente.cedula = cedula;
    if (avisosA.length) tareas.push(enviar('aviso', avisosA.length === 1 ? avisosA[0] : avisosA, correoAviso(p)));
    const cliente = correoCliente(p);
    if (cliente.para) tareas.push(enviar('cliente', cliente.para, cliente));
  } catch (err) {
    registro.error('[pedido] no se pudieron armar los correos · pedido', creado.id, '·', motivo(err));
  }
  await Promise.allSettled(tareas);
}

/** @param {any} entrada @returns {Promise<{ status: number, json: any, cabeceras: Record<string, string> }>} */
export async function procesarPedido(entrada) {
  const { cuerpo, ip, waitUntil, prueba, eco } = entrada || {};
  const e = (entrada && entrada.env) || {};
  const deps = (entrada && entrada.deps) || {};
  const registro = deps.registro || console;
  const esperar = deps.esperar || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const mandar = deps.enviarCorreo || enviarCorreo;
  const kv = e.CACHE || null;
  const simulado = String(e.PEDIDOS_MODO || '').trim().toLowerCase() === 'simulado';

  try {
    // 1) Cuerpo pequeño y con forma de pedido
    let web = cuerpo;
    if (typeof cuerpo === 'string') {
      if (new TextEncoder().encode(cuerpo).byteLength > MAX_CUERPO) return falla(413, 'solicitud', 'El pedido es demasiado grande. Recarga la página y vuelve a intentarlo.');
      try { web = JSON.parse(cuerpo); } catch { return falla(400, 'solicitud', MSJ_SOLICITUD); }
    }
    if (!web || typeof web !== 'object' || Array.isArray(web)) return falla(400, 'solicitud', MSJ_SOLICITUD);
    const orden = String(web.orden || '');
    if (!/^ORD-[A-Z0-9]{4,12}$/.test(orden)) return falla(400, 'solicitud', MSJ_SOLICITUD);

    // 2) Secretos del Worker. En simulado bastan los de WooCommerce (se lee el catálogo real); en real, también el correo.
    const woo = configWoo(e, deps.fetch);
    const faltan = [];
    if (!woo) faltan.push('WC_CONSUMER_KEY / WC_CONSUMER_SECRET');
    if (!simulado && !String(e.GMAIL_USUARIO || '').trim()) faltan.push('GMAIL_USUARIO');
    if (!simulado && !String(e.GMAIL_CLAVE_APP || '')) faltan.push('GMAIL_CLAVE_APP');
    if (faltan.length) {
      registro.error('[pedido] faltan secretos del Worker:', faltan.join(', '));
      return falla(500, 'servidor', MSJ_SERVIDOR);
    }

    // 3) ¿Esta orden ya se guardó? Se devuelve el mismo número, sin crear otro. La clave lleva el teléfono:
    //    si dos clientes distintos coinciden en el número de orden (uno entre 900 000), no se pisan.
    const quien = digitos(web.datos && web.datos.telefono).slice(-12) || 'x';
    const claveHecho = 'pedidos:hecho:' + orden + ':' + quien;
    const claveCandado = 'pedidos:candado:' + orden + ':' + quien;
    const hecho = await leerJson(kv, claveHecho);
    if (hecho && hecho.numero) return exito(hecho.numero, hecho.total, hecho.simulado, { repetido: true });

    // 4) Límite por IP: pedidos (no visitas) en 10 min
    const claveIp = 'pedidos:ip:' + ipLimpia(ip);
    const ahora = Math.floor(Date.now() / 1000);
    let cuenta = await leerJson(kv, claveIp);
    if (!cuenta || typeof cuenta.n !== 'number' || ahora - cuenta.t >= VENTANA_IP) cuenta = { n: 0, t: ahora };
    if (cuenta.n >= MAX_PEDIDOS_IP) {
      return falla(429, 'limite', MSJ_LIMITE, null, { 'Retry-After': String(Math.max(1, VENTANA_IP - (ahora - cuenta.t))) });
    }

    // 5) Catálogo y cuentas, con los precios de WooCommerce
    const { pedido, nota, cuentas, cedula } = await armar(woo, kv, web, { prueba: Boolean(prueba) && !simulado });

    // 6) Candado de la orden: dos envíos casi a la vez no crean dos pedidos
    const candado = await leerJson(kv, claveCandado);
    if (candado) {
      const edadMs = Date.now() - Number(candado.t || 0);
      if (edadMs < ESPERA_CANDADO_MS) {
        // el otro envío sigue en marcha: se le da un momento y se devuelve su mismo número
        for (let i = 0; i < 4; i++) {
          await esperar(1500);
          const ya = await leerJson(kv, claveHecho);
          if (ya && ya.numero) return exito(ya.numero, ya.total, ya.simulado, { repetido: true });
        }
      }
      // un intento anterior se quedó a medias: antes de crear otro, se mira si la tienda llegó a guardarlo
      const previo = simulado ? null : await buscarPorOrden(woo, orden);
      if (previo && digitos(previo.billing && previo.billing.phone).slice(-12) === quien) {
        const guardado = { numero: String(previo.number != null ? previo.number : previo.id), total: cuentas.total, simulado: false };
        await guardar(kv, claveHecho, guardado, TTL_HECHO, registro);
        await borrar(kv, claveCandado);
        return exito(guardado.numero, guardado.total, false, { repetido: true });
      }
      if (edadMs < ESPERA_CANDADO_MS) return falla(429, 'limite', MSJ_EN_CURSO, { enCurso: true }, { 'Retry-After': '5' });
    }
    await guardar(kv, claveCandado, { t: Date.now() }, TTL_CANDADO, registro);
    await guardar(kv, claveIp, { n: cuenta.n + 1, t: cuenta.t }, VENTANA_IP - (ahora - cuenta.t), registro);

    // 7) Modo simulado: todo lo anterior es real (lectura), pero no se escribe en la tienda ni se manda correo
    if (simulado) {
      const numero = 'SIM-' + String(Math.floor(1000 + Math.random() * 9000));
      await guardar(kv, claveHecho, { numero, total: cuentas.total, simulado: true }, TTL_HECHO, registro);
      await borrar(kv, claveCandado);
      registro.log('[pedido] SIMULADO', orden, '→', numero, '· total', cuentas.total.toFixed(2), '· no se creó nada ni se mandó correo');
      return exito(numero, cuentas.total, true, eco ? { eco: { pedido, nota, cuentas } } : null);
    }

    // 8) Se guarda en WooCommerce
    let creado;
    try {
      creado = await crearPedido(woo, pedido);
    } catch (err) {
      // Fallo limpio (la tienda dijo que no): se suelta el candado y se puede reintentar ya.
      // Fallo dudoso (corte o tiempo agotado): el candado se queda y el reintento mira primero en la tienda.
      if (!(err instanceof ErrorTienda) || !err.dudoso) await borrar(kv, claveCandado);
      throw err;
    }
    const numero = String(creado.number != null ? creado.number : creado.id);
    await guardar(kv, claveHecho, { numero, total: cuentas.total, simulado: false }, TTL_HECHO, registro);
    await borrar(kv, claveCandado);
    if (creado.total != null && Number(creado.total).toFixed(2) !== cuentas.total.toFixed(2)) {
      registro.error('[pedido] el total de la tienda no coincide con el de la web · pedido', creado.id, '· tienda', creado.total, '· web', cuentas.total.toFixed(2));
    }

    // 9) Nota privada y correos. El pedido ya está guardado: nada de esto cambia la respuesta.
    const tareas = despues({ e, woo, creado, nota, web, cuentas, cedula, mandar, registro }).catch(() => {});
    if (typeof waitUntil === 'function') { try { waitUntil(tareas); } catch { await tareas; } } else await tareas;

    return exito(numero, cuentas.total, false);
  } catch (err) {
    if (err instanceof ErrorPedido) {
      const codigo = String(err.codigo || 'servidor');
      return falla(CODIGOS_CONFLICTO.includes(codigo) ? 409 : 422, codigo, err.message, err.extra);
    }
    if (err instanceof ErrorTienda) {
      registro.error('[pedido] tienda:', err.message, '·', err.codigo, err.dudoso ? '· dudoso' : '');
      return falla(502, 'servidor', MSJ_SERVIDOR);
    }
    registro.error('[pedido] error inesperado:', motivo(err));
    return falla(500, 'servidor', MSJ_SERVIDOR);
  }
}
