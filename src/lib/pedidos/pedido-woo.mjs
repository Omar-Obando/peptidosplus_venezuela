/* Del pedido de la web (lo que manda public/checkout.js) al pedido de WooCommerce (wc/v3/orders).
 *
 * Funciones puras, sin red: la ruta del sitio (Worker) y las pruebas las comparten. Reglas:
 *  · Los PRECIOS salen de WooCommerce, nunca del navegador. Si el total no coincide con el que vio el
 *    cliente, no se crea el pedido (los precios cambiaron: que recargue).
 *  · Un solo descuento: la escalera por cantidad de péptidos (3+ → 5 %, 6+ → 8 %, 10+ → 12 %), igual que
 *    public/carrito.js. El agua bacteriostática ni cuenta ni recibe descuento.
 *  · Zelle solo desde $150 de total (ya con el descuento); Binance Pay sin mínimo (Angel, 2026-10-03).
 *  · Cédula obligatoria (Angel, 2026-10-03): 6 a 9 dígitos, con prefijo V/E/J/P opcional.
 *  · Envío: solo a oficina Zoom, cobro a destino ($0 en el pedido).
 *  · El pedido entra «en espera» (on-hold): pago por verificar.
 *
 * Los mensajes de ErrorPedido están escritos para el cliente: la página los muestra tal cual.
 */
export const ESCALERA = [{ desde: 10, pct: 12 }, { desde: 6, pct: 8 }, { desde: 3, pct: 5 }];
export const ZELLE_MINIMO = 150;
// El id va igual que el título: sin pasarela registrada, el panel de WooCommerce escribe «Pago a través de <id>».
export const PAGOS = {
  zelle: { id: 'Zelle', titulo: 'Zelle', ref: 'número de confirmación' },
  binance: { id: 'Binance Pay', titulo: 'Binance Pay', ref: 'ID de la orden' },
};
// Estados de las oficinas Zoom → códigos de WooCommerce (wc/v3/data/countries/ve)
export const ESTADOS = {
  'distrito capital': 'VE-A', anzoategui: 'VE-B', apure: 'VE-C', aragua: 'VE-D', barinas: 'VE-E', bolivar: 'VE-F', carabobo: 'VE-G',
  cojedes: 'VE-H', falcon: 'VE-I', guarico: 'VE-J', lara: 'VE-K', merida: 'VE-L', miranda: 'VE-M', monagas: 'VE-N', 'nueva esparta': 'VE-O',
  portuguesa: 'VE-P', sucre: 'VE-R', tachira: 'VE-S', trujillo: 'VE-T', yaracuy: 'VE-U', zulia: 'VE-V', 'la guaira': 'VE-X',
  'delta amacuro': 'VE-Y', amazonas: 'VE-Z',
};
/** Códigos que NO son un dato mal escrito sino un cambio en la tienda: la ruta responde 409 en vez de 422. */
export const CODIGOS_CONFLICTO = ['agotado', 'total'];

export const llano = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+]+/g, ' ').trim();
const centavos = (n) => Math.round(n * 100) / 100;
const txt = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const esAgua = (nombre) => /agua\s+bacterio/i.test(nombre || '');
export const pctPorCantidad = (n) => { for (const t of ESCALERA) if (n >= t.desde) return t.pct; return 0; };

/** «v 12.345.678» → «V-12345678»; «12345678» → «12345678». Devuelve null si no es una cédula (6–9 dígitos, prefijo V/E/J/P opcional). */
export function limpiarCedula(valor) {
  const s = String(valor == null ? '' : valor).toUpperCase().replace(/[\s.\-]/g, '');
  const m = /^([VEJP])?(\d{6,9})$/.exec(s);
  return m ? (m[1] ? m[1] + '-' : '') + m[2] : null;
}

export class ErrorPedido extends Error {
  constructor(codigo, mensaje, extra) { super(mensaje); this.name = 'ErrorPedido'; this.codigo = codigo; this.extra = extra || null; }
}

/** catálogo: [{ id, nombre, tipo, precio, stock, vars: [{ id, precio, stock, attr: 'Presentacion=10 mg' }] }] */
export function buscarProducto(catalogo, item) {
  const n = llano(item && item.nombre);
  const p = n ? catalogo.find((x) => llano(x.nombre) === n) : null;
  if (!p) throw new ErrorPedido('producto', 'No encontramos «' + txt(item && item.nombre, 60) + '» en la tienda. Quítalo del carrito para continuar.');
  if (p.tipo !== 'variable') return { producto: p, variacion: null, precio: Number(p.precio), stock: p.stock };
  const d = llano(item.dosis);
  const v = p.vars.find((x) => llano(String(x.attr).split('=').pop()) === d);
  if (!v) throw new ErrorPedido('presentacion', 'No encontramos la presentación ' + txt(item.dosis, 20) + ' de ' + p.nombre + '. Quítala del carrito para continuar.');
  return { producto: p, variacion: v, precio: Number(v.precio), stock: v.stock };
}

/** Reparte el descuento total entre las líneas de péptidos, céntimo a céntimo, para que la suma sea exacta. */
export function repartir(lineas, descuento) {
  const base = lineas.reduce((s, l) => s + (l.peptido ? l.subtotal : 0), 0);
  let resto = Math.round(descuento * 100);
  const peps = lineas.filter((l) => l.peptido);
  peps.forEach((l, i) => {
    const parte = i === peps.length - 1 ? resto : Math.min(resto, Math.round((descuento * l.subtotal / base) * 100));
    l.descuento = parte / 100; resto -= parte;
  });
  lineas.forEach((l) => { if (!l.peptido) l.descuento = 0; l.total = centavos(l.subtotal - l.descuento); });
  return lineas;
}

/**
 * web: { orden, items:[{id,nombre,dosis,cant}], datos:{nombre,cedula,telefono,correo,notas},
 *        envio:{transporte,estado,ciudad,oficina:{nombre,direccion,telefono}}, pago:{metodo,referencia}, totalVisto }
 * Devuelve { pedido (cuerpo para POST /wc/v3/orders), nota (nota privada), cuentas, cedula (ya limpia) }.
 */
export function construirPedido(web, catalogo, opciones) {
  opciones = opciones || {};
  web = web || {};
  const items = Array.isArray(web.items) ? web.items : [];
  if (!items.length || items.length > 40) throw new ErrorPedido('vacio', 'Tu carrito está vacío.');
  const lineas = items.map((it) => {
    const cant = Math.floor(Number(it && it.cant));
    if (!(cant >= 1 && cant <= 99)) throw new ErrorPedido('cantidad', 'Hay una cantidad no válida en el carrito. Revísalo y vuelve a intentarlo.');
    const m = buscarProducto(catalogo, it || {});
    if (!Number.isFinite(m.precio) || m.precio <= 0) throw new ErrorPedido('producto', m.producto.nombre + ' no está disponible en este momento. Quítalo del carrito para continuar.');
    if (m.stock !== 'instock') throw new ErrorPedido('agotado', m.producto.nombre + (m.variacion ? ' ' + txt(it.dosis, 20) : '') + ' se agotó. Quítalo del carrito para continuar.', { nombre: m.producto.nombre, dosis: m.variacion ? txt(it.dosis, 20) : '' });
    return { m, cant, peptido: !esAgua(m.producto.nombre), subtotal: centavos(m.precio * cant) };
  });
  const kits = lineas.reduce((s, l) => s + (l.peptido ? l.cant : 0), 0);
  const pct = pctPorCantidad(kits);
  const subtotal = centavos(lineas.reduce((s, l) => s + l.subtotal, 0));
  const basePeptidos = centavos(lineas.reduce((s, l) => s + (l.peptido ? l.subtotal : 0), 0));
  const descuento = pct ? centavos(basePeptidos * pct / 100) : 0;
  const total = centavos(subtotal - descuento);
  repartir(lineas, descuento);
  if (web.totalVisto != null && Math.abs(Number(web.totalVisto) - total) > 0.009) {
    throw new ErrorPedido('total', 'Los precios cambiaron desde que abriste la página. Revisa el total actualizado antes de continuar.', { total, subtotal, descuento });
  }

  const pago = PAGOS[web.pago && web.pago.metodo];
  if (!pago) throw new ErrorPedido('pago', 'Elige un método de pago.');
  if (pago === PAGOS.zelle && total < ZELLE_MINIMO) throw new ErrorPedido('zelle', 'Zelle está disponible para pedidos desde $' + ZELLE_MINIMO + '. Para este pedido usa Binance Pay.', { minimo: ZELLE_MINIMO, total });
  const referencia = txt(web.pago.referencia, 80);
  if (referencia.length < 6) throw new ErrorPedido('referencia', 'Escribe el ' + pago.ref + ' de tu pago.');

  const d = web.datos || {};
  const nombre = txt(d.nombre, 80), telefono = txt(d.telefono, 30), correo = txt(d.correo, 120), notas = txt(d.notas, 500);
  if (nombre.length < 3) throw new ErrorPedido('nombre', 'Escribe tu nombre y apellido.');
  const cedula = limpiarCedula(d.cedula);
  if (!cedula) throw new ErrorPedido('cedula', 'Revisa tu cédula: debe tener de 6 a 9 dígitos.');
  if (telefono.replace(/\D/g, '').length < 7) throw new ErrorPedido('telefono', 'Escribe tu número de WhatsApp.');
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorPedido('correo', 'El correo no parece válido. Revísalo o déjalo en blanco.');
  const partes = nombre.split(' ');
  const first = partes.length > 2 ? partes.slice(0, Math.ceil(partes.length / 2)).join(' ') : partes[0];
  const last = partes.slice(first.split(' ').length).join(' ');

  const e = web.envio || {}, of = e.oficina || {};
  const estado = txt(e.estado, 40), ciudad = txt(e.ciudad, 60), oficina = txt(of.nombre, 80), direccion = txt(of.direccion, 200);
  if (!estado || !ciudad || !oficina) throw new ErrorPedido('envio', 'Elige la oficina Zoom donde retiras tu pedido.');
  const dir = { first_name: first, last_name: last, phone: telefono, country: 'VE', state: ESTADOS[llano(estado)] || estado, city: ciudad, address_1: 'Oficina Zoom ' + oficina, address_2: direccion };

  const marca = opciones.prueba ? 'PRUEBA — NO DESPACHAR. ' : '';
  const pedido = {
    status: 'on-hold',
    currency: 'USD',
    set_paid: false,
    payment_method: pago.id,
    payment_method_title: pago.titulo,
    transaction_id: referencia,
    customer_note: (marca + notas).trim(),
    billing: Object.assign({}, dir, correo ? { email: correo } : {}),
    shipping: dir,
    line_items: lineas.map((l) => Object.assign({ product_id: l.m.producto.id, quantity: l.cant, subtotal: l.subtotal.toFixed(2), total: l.total.toFixed(2) }, l.m.variacion ? { variation_id: l.m.variacion.id } : {})),
    shipping_lines: [{ method_id: 'zoom_cobro_destino', method_title: 'Zoom · cobro a destino', total: '0.00' }],
    meta_data: [
      { key: 'pp_origen', value: 've.peptidosplus.com' },
      { key: 'pp_orden_web', value: txt(web.orden, 20) },
      { key: 'pp_cedula', value: cedula },
      { key: 'pp_pago_referencia', value: referencia },
      { key: 'pp_oficina_zoom', value: oficina + ' — ' + direccion + (of.telefono ? ' — Tel. ' + txt(of.telefono, 30) : '') },
      { key: 'pp_kits', value: String(kits) },
    ].concat(opciones.prueba ? [{ key: 'pp_prueba', value: '1' }] : []),
  };
  const nota = marca + 'Pago: ' + pago.titulo + ' · ' + pago.ref + ' ' + referencia + ' (por verificar). ' +
    'Cliente: ' + nombre + ' · cédula ' + cedula + '. ' +
    'Envío: Zoom, cobro a destino — oficina ' + oficina + ', ' + ciudad + ', ' + estado + (direccion ? ' (' + direccion + ')' : '') + (of.telefono ? ', tel. ' + txt(of.telefono, 30) : '') + '. ' +
    (kits ? 'Kit de aplicación × ' + kits + '. ' : '') + (pct ? 'Descuento por cantidad −' + pct + ' % (' + kits + ' péptidos). ' : '') + 'WhatsApp del cliente: ' + telefono + '.';
  return { pedido, nota, cuentas: { subtotal, descuento, pct, total, kits }, cedula };
}
