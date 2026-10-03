/* correos-plantillas.mjs — los dos correos de un pedido de ve.peptidosplus.com.
 *
 * Funciones puras, sin dependencias y sin red: sirven igual en el Worker, en Node y en las pruebas.
 *
 *   import { correoAviso, correoCliente, desdeWoo } from './correos-plantillas.mjs';
 *   const p = desdeWoo(ordenDeWooCommerce, pedidoDeLaWeb, cuentas, { admin: 'https://ve-cms.peptidosplus.com' });
 *   const aviso = correoAviso(p);       // → { asunto, texto, html, responderA }   para el dueño
 *   const cliente = correoCliente(p);   // → { asunto, texto, html, para }         «para» es null si no dejó correo
 *
 * «p» es el pedido YA creado:
 *   { numero, fecha (ISO; sin zona se toma como UTC, que es como llega date_created_gmt de WooCommerce),
 *     cliente: { nombre, cedula (solo sale en el aviso al dueño), telefono, correo },
 *     lineas: [{ nombre, presentacion, cantidad, subtotal, total }],
 *     kits, cuentas: { subtotal, descuento, pct, total },
 *     pago: { metodo ('zelle' | 'binance' o su título), referencia },
 *     envio: { oficina, direccion, telefonoOficina, ciudad, estado },
 *     notas, enlaceAdmin }
 *
 * Reglas de estas plantillas:
 *  · Todo lo que escribió el cliente pasa por esc() antes de entrar en el HTML, y por linea()/parrafo() antes de
 *    entrar en el asunto o en el texto plano (sin saltos de línea ni caracteres de control en las cabeceras).
 *  · El correo al cliente NO repite sus notas ni nada de texto libre salvo su nombre de pila (solo letras): la
 *    dirección no está comprobada y no debe poder usarse para mandarle un texto ajeno a un tercero.
 *  · HTML de correo: una tabla de 600 px como mucho, estilos en línea, sin imágenes ni fuentes remotas. Cada
 *    texto lleva su color y su fondo en la misma celda (o en la que lo contiene), así que se lee igual si el
 *    programa de correo invierte los colores. El bloque <style> solo añade el modo oscuro y el margen del
 *    teléfono donde se admite; si lo quitan, el correo se ve igual de bien en claro.
 *  · Tono: de tú, sobrio y factual. Sin exclamaciones, sin llamadas a comprar.
 */

export const WHATSAPP = { numero: '15806436837', visible: '+1 (580) 643-6837' };
export const SITIO = 've.peptidosplus.com';
export const MARCA = 'Peptidos Plus';
export const AVISO_LEGAL = 'Productos destinados exclusivamente a investigación.';
// El mismo texto del kit que ve el cliente en la página de pago (public/checkout.js → KIT)
export const KIT_DETALLE = 'Agua bacteriostática de 3 ml, 10 jeringas y 10 toallitas con alcohol, uno por cada péptido.';
export const QUE_SIGUE = [
  'Despachamos tu pedido en 24 a 48 horas.',
  'Te enviamos el número de guía por el medio de contacto que indicaste.',
];

/* ───────────── limpieza y formato ───────────── */

/** Escapa para HTML (texto y atributos entre comillas). */
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Caracteres de control, invisibles y de dirección de escritura: fuera (no deben poder disfrazar un texto).
// Se nombran por su categoría Unicode (Cc control, Cf formato, Zl/Zp separadores de línea y de párrafo) para
// no tener que escribir caracteres invisibles en este archivo.
const RE_SALTO_RARO = /[\p{Zl}\p{Zp}\v\f]/gu;
const RE_RAROS = /(?![\t\n\r])[\p{Cc}\p{Cf}]/gu;
/** Una sola línea: sin saltos ni caracteres de control, espacios juntados, recortada. */
export const linea = (s, max = 200) => String(s == null ? '' : s).replace(RE_RAROS, '').replace(/\s+/g, ' ').trim().slice(0, max);
/** Varias líneas: conserva los saltos (como mucho uno en blanco seguido), quita lo demás. */
export const parrafo = (s, max = 1000) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(RE_SALTO_RARO, '\n').replace(RE_RAROS, '')
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

const numero = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
};
/** $356.97 · −$18.00 · «—» si no hay número. Igual que en la web: punto decimal y sin separador de miles. */
export const usd = (v) => {
  const n = numero(v);
  return n == null ? '—' : (n < 0 ? '−' : '') + '$' + Math.abs(n).toFixed(2);
};

const UNIDADES = { mg: 'mg', mcg: 'mcg', ml: 'ml', g: 'g', ui: 'UI', iu: 'UI' };
/** «30 MG» → «30 mg», «10ml» → «10 ml». */
export const presentacionLimpia = (s) => linea(s, 40).replace(/(\d)\s*(mcg|mg|ml|ui|iu|g)\b/gi, (_, d, u) => d + ' ' + UNIDADES[u.toLowerCase()]);

const sinTildes = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const METODOS = {
  zelle: { titulo: 'Zelle', ref: 'Número de confirmación' },
  binance: { titulo: 'Binance Pay', ref: 'ID de la orden' },
};
function metodoDe(valor) {
  const k = sinTildes(linea(valor, 40));
  if (k.startsWith('zelle')) return METODOS.zelle;
  if (k.startsWith('binance')) return METODOS.binance;
  return { titulo: linea(valor, 40) || 'Sin indicar', ref: 'Referencia' };
}

/** Número para wa.me (solo dígitos, con el código del país) o null si no se puede saber.
 *  Venezuela: 0412-123.45.67 → 584121234567 · 412 1234567 → 584121234567 · +58 412… se queda igual.
 *  Otro país: solo si viene con «+» o «00» delante. */
export function whatsappDe(telefono) {
  const crudo = String(telefono == null ? '' : telefono).trim();
  let d = crudo.replace(/\D/g, '');
  const internacional = /^(\+|00)/.test(crudo);
  if (/^00/.test(crudo)) d = d.slice(2);
  if (/^580?4\d{9}$/.test(d)) return '58' + d.slice(d.length - 10);   // 58 412… y el frecuente +58 0412…
  if (internacional) return d.length >= 8 && d.length <= 15 ? d : null;
  if (/^04\d{9}$/.test(d)) return '58' + d.slice(1);
  if (/^4\d{9}$/.test(d)) return '58' + d;
  return null;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Fecha en hora de Venezuela (UTC−4 todo el año), escrita a mano para que salga igual en cualquier motor.
 *  «2026-10-03T15:28:41» (sin zona = UTC) → { dia: '3 de octubre de 2026', hora: '11:28 a. m.' } */
export function fechaVenezuela(valor) {
  let t = NaN;
  if (valor instanceof Date) t = valor.getTime();
  else if (typeof valor === 'number') t = valor;
  else if (typeof valor === 'string' && valor.trim()) {
    const s = valor.trim().replace(' ', 'T');
    t = Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? s + 'Z' : s);
  }
  if (!Number.isFinite(t)) return null;
  const d = new Date(t - 4 * 3600 * 1000);
  const h = d.getUTCHours();
  return {
    dia: d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()] + ' de ' + d.getUTCFullYear(),
    hora: (h % 12 === 0 ? 12 : h % 12) + ':' + String(d.getUTCMinutes()).padStart(2, '0') + (h < 12 ? ' a. m.' : ' p. m.'),
  };
}

/** Nombre de pila para el saludo: la primera palabra, solo si son letras (nada de enlaces ni símbolos). */
export function nombreDePila(nombre) {
  const t = linea(nombre, 80).split(' ')[0] || '';
  if (!/^\p{L}[\p{L}'’.-]{0,29}$/u.test(t)) return '';
  const plano = t === t.toLowerCase() || (t === t.toUpperCase() && t.length > 1);
  return plano ? t.charAt(0).toLocaleUpperCase('es') + t.slice(1).toLocaleLowerCase('es') : t;
}

const RE_CORREO = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const correoValido = (s) => { const c = linea(s, 254); return RE_CORREO.test(c) && !/\.\./.test(c) ? c : null; };
const enlaceSeguro = (s) => { const u = linea(s, 500); return /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[^\s"'<>\\]*)?$/.test(u) ? u : null; };
const reLiteral = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Deja el pedido listo para pintar: todo texto limpio, todo número comprobado, nada «undefined». */
function preparar(p) {
  p = p || {};
  const c = p.cliente || {}, e = p.envio || {}, q = p.cuentas || {}, g = p.pago || {};
  const lineas = (Array.isArray(p.lineas) ? p.lineas : []).map((l) => {
    l = l || {};
    const presentacion = presentacionLimpia(l.presentacion);
    let nombre = linea(l.nombre, 120);
    // WooCommerce nombra la variación «Retatrutida - 10 mg»: la presentación va aparte, no dos veces
    if (presentacion) nombre = nombre.replace(new RegExp('\\s+[-–—·]\\s+' + reLiteral(presentacion).replace(/ /g, '\\s*') + '$', 'i'), '');
    const cant = numero(l.cantidad);
    const importe = numero(l.subtotal) != null ? numero(l.subtotal) : numero(l.total);
    return { nombre, presentacion, cantidad: cant != null && cant >= 1 ? Math.floor(cant) : 1, importe };
  }).filter((l) => l.nombre);

  const suma = lineas.reduce((s, l) => s + (l.importe || 0), 0);
  const hayImportes = lineas.length > 0 && lineas.every((l) => l.importe != null);
  let descuento = numero(q.descuento);
  if (!(descuento > 0)) descuento = 0;
  const pct = numero(q.pct) > 0 ? numero(q.pct) : null;
  const subtotal = numero(q.subtotal) != null ? numero(q.subtotal) : (hayImportes ? Math.round(suma * 100) / 100 : null);
  const total = numero(q.total) != null ? numero(q.total) : (subtotal != null ? Math.round((subtotal - descuento) * 100) / 100 : null);
  const kits = Math.max(0, Math.floor(numero(p.kits) || 0));

  const telefono = linea(c.telefono, 40);
  return {
    numero: linea(p.numero, 20),
    fecha: fechaVenezuela(p.fecha),
    cliente: { nombre: linea(c.nombre, 80), pila: nombreDePila(c.nombre), cedula: linea(c.cedula, 14), telefono, wa: whatsappDe(telefono), correo: correoValido(c.correo) },
    lineas, kits,
    cuentas: { subtotal, descuento, pct, total },
    pago: { metodo: metodoDe(g.metodo), referencia: linea(g.referencia, 80) },
    envio: { oficina: linea(e.oficina, 80), direccion: linea(e.direccion, 200), telefono: linea(e.telefonoOficina, 40), ciudad: linea(e.ciudad, 60), estado: linea(e.estado, 40) },
    notas: parrafo(p.notas, 600),
    enlaceAdmin: enlaceSeguro(p.enlaceAdmin),
  };
}

const pedidoTxt = (d) => (d.numero ? 'pedido n.º ' + d.numero : 'pedido');
const lugarTxt = (d) => [d.envio.ciudad, d.envio.estado].filter(Boolean).join(', ');
const etqDescuento = (d) => 'Descuento por cantidad' + (d.cuentas.pct ? ' (−' + d.cuentas.pct + ' %)' : '');
const productoTxt = (l) => l.cantidad + ' × ' + l.nombre + (l.presentacion ? ' ' + l.presentacion : '');
const sinVacias = (xs) => xs.filter((x) => x !== null && x !== undefined && x !== false);

/* ───────────── piezas del HTML ───────────── */

const FUENTE = "font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;";
const NAVY = '#0a192f', TINTA2 = '#4d5a70', LINEA = '#e1e7f0', FONDO = '#f3f5f9', SUAVE = '#f6f8fb', BLANCO = '#ffffff';
const TABLA = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

// Solo mejora: modo oscuro (donde se admite) y menos margen en el teléfono. El correo no depende de esto.
const ESTILO = [
  ':root{color-scheme:light dark;supported-color-schemes:light dark}',
  '@media (max-width:480px){.pp-fuera{padding:12px 8px 24px!important}.pp-pad{padding-left:18px!important;padding-right:18px!important}}',
  '@media (prefers-color-scheme:dark){',
  '.pp-fondo{background-color:#0b1524!important}',
  '.pp-tarjeta{background-color:#111d30!important;border-color:#2a3850!important}',
  '.pp-suave{background-color:#17253b!important}',
  '.pp-tinta{color:#eef2f8!important}',
  '.pp-t2{color:#aebacd!important}',
  '.pp-linea{border-color:#2a3850!important}',
  '.pp-enlace{color:#eef2f8!important}',
  '.pp-btn{background-color:#eef2f8!important;border-color:#eef2f8!important}',
  '.pp-btn a{color:#0a192f!important}',
  '.pp-cab{border-bottom-color:#2a3850!important}',
  '}',
].join('');

const p1 = (html, extra = '') => '<p class="pp-tinta" style="margin:0 0 12px;' + FUENTE + 'font-size:15px;line-height:23px;color:' + NAVY + ';' + extra + '">' + html + '</p>';
const p2 = (html, extra = '') => '<p class="pp-t2" style="margin:0;' + FUENTE + 'font-size:13px;line-height:20px;color:' + TINTA2 + ';' + extra + '">' + html + '</p>';
const h2 = (texto) => '<h2 class="pp-tinta" style="margin:28px 0 8px;' + FUENTE + 'font-size:16px;line-height:22px;font-weight:600;color:' + NAVY + ';">' + texto + '</h2>';
const etiqueta = (texto) => '<p class="pp-t2" style="margin:0 0 3px;' + FUENTE + 'font-size:11px;line-height:16px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:' + TINTA2 + ';">' + texto + '</p>';
const enlace = (href, html) => '<a class="pp-enlace" href="' + esc(href) + '" style="color:' + NAVY + ';text-decoration:underline;">' + html + '</a>';
const fijo = (html) => '<span style="white-space:nowrap;">' + html + '</span>';

/** Filas de productos: cantidad · nombre y presentación · importe a la derecha. */
function tablaProductos(d, kit) {
  const celda = 'padding:12px 0;border-bottom:1px solid ' + LINEA + ';' + FUENTE + 'font-size:15px;line-height:22px;color:' + NAVY + ';';
  const fila = (cant, nombre, detalle, derecha) => '<tr>' +
    '<td class="pp-tinta pp-linea" valign="top" width="40" style="width:40px;' + celda + 'font-weight:600;white-space:nowrap;">' + cant + '&nbsp;×</td>' +
    '<td class="pp-tinta pp-linea" valign="top" style="' + celda + 'padding-right:12px;"><span style="font-weight:600;">' + nombre + '</span>' +
      (detalle ? '<br><span class="pp-t2" style="font-size:13px;line-height:19px;color:' + TINTA2 + ';">' + detalle + '</span>' : '') + '</td>' +
    '<td class="pp-tinta pp-linea" valign="top" align="right" style="' + celda + 'text-align:right;white-space:nowrap;font-weight:600;">' + derecha + '</td></tr>';
  return '<table ' + TABLA + ' width="100%" style="width:100%;border-top:1px solid ' + LINEA + ';" class="pp-linea">' +
    d.lineas.map((l) => fila(l.cantidad, esc(l.nombre), esc(l.presentacion), l.importe == null ? '' : usd(l.importe))).join('') +
    (d.kits ? fila(d.kits, 'Kit de aplicación', kit.detalle, kit.derecha) : '') +
    '</table>';
}

/** Subtotal, descuento (solo si lo hay), envío y total, con los montos a la derecha. */
function tablaTotales(d) {
  const fila = (etq, valor, fuerte) => {
    const base = FUENTE + 'line-height:22px;';
    return '<tr><td class="' + (fuerte ? 'pp-tinta pp-linea' : 'pp-t2') + '" style="' + base + (fuerte
      ? 'padding:12px 12px 0 0;border-top:1px solid ' + LINEA + ';font-size:16px;font-weight:600;color:' + NAVY + ';'
      : 'padding:3px 12px 3px 0;font-size:14px;color:' + TINTA2 + ';') + '">' + etq + '</td>' +
      '<td class="pp-tinta' + (fuerte ? ' pp-linea' : '') + '" align="right" style="' + base + 'text-align:right;white-space:nowrap;color:' + NAVY + ';' + (fuerte
        ? 'padding:12px 0 0;border-top:1px solid ' + LINEA + ';font-size:22px;line-height:28px;font-weight:700;'
        : 'padding:3px 0;font-size:14px;') + '">' + valor + '</td></tr>';
  };
  const c = d.cuentas;
  return '<table ' + TABLA + ' width="100%" style="width:100%;margin-top:12px;">' +
    (c.subtotal != null ? fila('Subtotal', usd(c.subtotal)) : '') +
    (c.descuento > 0 ? fila('Descuento por cantidad' + (c.pct ? ' ' + fijo('(−' + c.pct + '&nbsp;%)') : ''), usd(-c.descuento)) : '') +
    fila('Envío', 'Cobro a destino') +
    '<tr><td colspan="2" style="height:9px;line-height:9px;font-size:0;">&nbsp;</td></tr>' +
    fila('Total', usd(c.total), true) +
    '</table>';
}

/** La oficina donde retira, en líneas. */
function lineasOficina(d) {
  const e = d.envio;
  return sinVacias([
    e.oficina ? '<span style="font-weight:600;">Oficina Zoom ' + esc(e.oficina) + '</span>' : null,
    e.direccion ? esc(e.direccion) : null,
    lugarTxt(d) ? esc(lugarTxt(d)) : null,
    e.telefono ? 'Teléfono de la oficina: ' + fijo(esc(e.telefono)) : null,
  ]);
}

/** El marco común: fondo, cabecera navy con la marca en blanco, tarjeta y pie. */
function documento({ asunto, avance, cabecera, cuerpo, pie }) {
  return '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<meta name="color-scheme" content="light dark">\n<meta name="supported-color-schemes" content="light dark">\n' +
    '<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">\n' +
    '<title>' + esc(asunto) + '</title>\n<style>' + ESTILO + '</style>\n</head>\n' +
    '<body class="pp-fondo" style="margin:0;padding:0;background-color:' + FONDO + ';-webkit-text-size-adjust:100%;text-size-adjust:100%;">\n' +
    '<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:' + FONDO + ';">' + esc(avance) + '</div>\n' +
    '<table ' + TABLA + ' class="pp-fondo" width="100%" bgcolor="' + FONDO + '" style="width:100%;background-color:' + FONDO + ';">\n<tr><td class="pp-fuera" align="center" style="padding:24px 10px 32px;">\n' +
    '<table ' + TABLA + ' width="600" style="width:100%;max-width:600px;">\n' +
    '<tr><td class="pp-cab pp-pad" bgcolor="' + NAVY + '" style="background-color:' + NAVY + ';border-bottom:1px solid ' + NAVY + ';border-radius:12px 12px 0 0;padding:20px 24px;">' +
      '<table ' + TABLA + ' width="100%" style="width:100%;"><tr>' +
      '<td bgcolor="' + NAVY + '" style="background-color:' + NAVY + ';' + FUENTE + 'font-size:15px;line-height:22px;font-weight:700;letter-spacing:.14em;color:' + BLANCO + ';white-space:nowrap;">PEPTIDOS PLUS</td>' +
      (cabecera ? '<td bgcolor="' + NAVY + '" align="right" style="background-color:' + NAVY + ';' + FUENTE + 'font-size:13px;line-height:22px;color:' + LINEA + ';text-align:right;white-space:nowrap;">' + cabecera + '</td>' : '') +
      '</tr></table></td></tr>\n' +
    '<tr><td class="pp-tarjeta pp-pad" bgcolor="' + BLANCO + '" style="background-color:' + BLANCO + ';border:1px solid ' + LINEA + ';border-top:0;border-radius:0 0 12px 12px;padding:26px 24px 28px;">\n' +
    cuerpo + '\n</td></tr>\n' +
    '<tr><td class="pp-pad" align="center" style="padding:18px 24px 0;text-align:center;">' + pie + '</td></tr>\n' +
    '</table>\n</td></tr>\n</table>\n</body>\n</html>\n';
}

/* ───────────── correo de aviso (para el dueño) ───────────── */

export function correoAviso(p) {
  const d = preparar(p);
  const m = d.pago.metodo, c = d.cliente, cu = d.cuentas;
  const asunto = linea((d.numero ? 'Pedido n.º ' + d.numero : 'Pedido nuevo') + ' — ' + usd(cu.total) + ' — ' + m.titulo, 200);
  const cuando = d.fecha ? d.fecha.dia + ', ' + d.fecha.hora + ' (hora de Venezuela)' : '';
  const waCliente = c.wa ? 'https://wa.me/' + c.wa : null;

  /* texto plano */
  const texto = sinVacias([
    asunto,
    cuando || null,
    '',
    'TOTAL: ' + usd(cu.total),
    'PAGO: ' + m.titulo + (d.pago.referencia ? ' · ' + m.ref + ': ' + d.pago.referencia : ' · sin referencia'),
    '',
    'CLIENTE: ' + (c.nombre || 'sin nombre'),
    c.cedula ? 'Cédula: ' + c.cedula : null,
    c.telefono ? 'WhatsApp: ' + c.telefono + (waCliente ? ' → ' + waCliente : '') : null,
    c.correo ? 'Correo: ' + c.correo : null,
    '',
    'RETIRA EN: ' + (d.envio.oficina ? 'Oficina Zoom ' + d.envio.oficina : 'sin oficina'),
    d.envio.direccion || null,
    lugarTxt(d) || null,
    d.envio.telefono ? 'Teléfono de la oficina: ' + d.envio.telefono : null,
    'Envío: Zoom, cobro a destino',
    '',
    'PRODUCTOS',
    ...d.lineas.map((l) => productoTxt(l) + (l.importe == null ? '' : ' — ' + usd(l.importe))),
    d.kits ? d.kits + ' × Kit de aplicación — incluir en el paquete' : null,
    '',
    cu.subtotal != null ? 'Subtotal: ' + usd(cu.subtotal) : null,
    cu.descuento > 0 ? etqDescuento(d) + ': ' + usd(-cu.descuento) : null,
    'Total: ' + usd(cu.total),
    d.notas ? '' : null,
    d.notas ? 'NOTAS DEL CLIENTE' : null,
    d.notas || null,
    d.enlaceAdmin ? '' : null,
    d.enlaceAdmin ? 'Abrir en WooCommerce: ' + d.enlaceAdmin : null,
  ]).join('\n') + '\n';

  /* HTML */
  const bloque = (etq, lineas, primero) => '<tr><td class="pp-linea" style="padding:14px 18px;' + (primero ? '' : 'border-top:1px solid ' + LINEA + ';') + '">' + etiqueta(etq) +
    lineas.map((l) => '<p class="pp-tinta" style="margin:0;' + FUENTE + 'font-size:15px;line-height:23px;color:' + NAVY + ';">' + l + '</p>').join('') + '</td></tr>';

  const cuerpo =
    '<h1 class="pp-tinta" style="margin:0 0 4px;' + FUENTE + 'font-size:22px;line-height:28px;font-weight:700;color:' + NAVY + ';">' + (d.numero ? 'Pedido n.º ' + esc(d.numero) : 'Pedido nuevo') + '</h1>' +
    p2(esc(sinVacias([cuando || null, SITIO]).join(' · ')), 'margin:0 0 20px;') +

    // lo que hace falta para actuar
    '<table ' + TABLA + ' width="100%" style="width:100%;border-collapse:separate;"><tr><td class="pp-suave pp-linea" bgcolor="' + SUAVE + '" style="background-color:' + SUAVE + ';border:1px solid ' + LINEA + ';border-radius:12px;padding:0;">' +
    '<table ' + TABLA + ' width="100%" style="width:100%;">' +
    '<tr><td style="padding:16px 18px 14px;">' + etiqueta('Total del pedido') +
      '<p class="pp-tinta" style="margin:0;' + FUENTE + 'font-size:30px;line-height:36px;font-weight:700;letter-spacing:-.01em;color:' + NAVY + ';">' + usd(cu.total) + '</p></td></tr>' +
    bloque('Pago', sinVacias([
      '<span style="font-weight:600;">' + esc(m.titulo) + '</span>',
      d.pago.referencia ? m.ref + ': <span style="font-weight:600;overflow-wrap:anywhere;word-break:break-word;">' + esc(d.pago.referencia) + '</span>' : 'Sin referencia',
    ])) +
    bloque('Cliente', sinVacias([
      '<span style="font-weight:600;">' + (esc(c.nombre) || 'Sin nombre') + '</span>',
      c.cedula ? 'Cédula: ' + fijo(esc(c.cedula)) : null,
      c.telefono ? 'WhatsApp: ' + fijo(esc(c.telefono)) + (waCliente ? ' · ' + enlace(waCliente, 'Abrir el chat') : '') : null,
      c.correo ? 'Correo: ' + enlace('mailto:' + c.correo, '<span style="overflow-wrap:anywhere;word-break:break-word;">' + esc(c.correo) + '</span>') : null,
    ])) +
    bloque('Retira en', lineasOficina(d).concat(['Envío con cobro a destino'])) +
    '</table></td></tr></table>' +

    h2('Productos') +
    tablaProductos(d, { detalle: 'Uno por cada péptido. Va dentro del paquete.', derecha: 'Incluir' }) +
    tablaTotales(d) +

    (d.notas ? h2('Notas del cliente') +
      '<table ' + TABLA + ' width="100%" style="width:100%;border-collapse:separate;"><tr><td class="pp-linea pp-tinta" style="border:1px solid ' + LINEA + ';border-radius:10px;padding:12px 16px;' + FUENTE + 'font-size:15px;line-height:23px;color:' + NAVY + ';overflow-wrap:anywhere;word-break:break-word;">' +
      esc(d.notas).replace(/\n/g, '<br>') + '</td></tr></table>' : '') +

    (d.enlaceAdmin ? '<table ' + TABLA + ' style="margin:28px 0 0;border-collapse:separate;"><tr><td class="pp-btn" bgcolor="' + NAVY + '" style="background-color:' + NAVY + ';border:1px solid ' + NAVY + ';border-radius:999px;">' +
      '<a href="' + esc(d.enlaceAdmin) + '" style="display:inline-block;padding:13px 26px;' + FUENTE + 'font-size:15px;line-height:20px;font-weight:600;color:' + BLANCO + ';text-decoration:none;">Abrir en WooCommerce</a></td></tr></table>' : '');

  const html = documento({
    asunto,
    avance: sinVacias([m.titulo + (d.pago.referencia ? ' ' + d.pago.referencia : ''), c.nombre || null, lugarTxt(d) || null]).join(' · '),
    cabecera: 'Pedido nuevo',
    cuerpo,
    pie: p2('Aviso automático del sitio ' + SITIO + '.'),
  });
  return { asunto, texto, html, responderA: c.correo };
}

/* ───────────── correo al cliente ───────────── */

export function correoCliente(p) {
  const d = preparar(p);
  const m = d.pago.metodo, cu = d.cuentas;
  const asunto = linea('Recibimos tu ' + pedidoTxt(d) + ' — ' + MARCA, 200);
  const saludo = d.cliente.pila ? 'Hola, ' + d.cliente.pila + ':' : 'Hola:';
  const entrada = 'Recibimos tu ' + pedidoTxt(d) + (d.fecha ? ' del ' + d.fecha.dia : '') + '. Este es el resumen.';
  const waTienda = 'https://wa.me/' + WHATSAPP.numero + '?text=' + encodeURIComponent('Hola, hice el ' + pedidoTxt(d) + ' en la web.');
  const cobro = 'El envío es con cobro a destino: lo pagas al retirar en la oficina.';

  /* texto plano */
  const texto = sinVacias([
    saludo,
    '',
    entrada,
    '',
    'RESUMEN DEL PEDIDO',
    ...d.lineas.map((l) => productoTxt(l) + (l.importe == null ? '' : ' — ' + usd(l.importe))),
    d.kits ? d.kits + ' × Kit de aplicación — incluido' : null,
    '',
    cu.subtotal != null ? 'Subtotal: ' + usd(cu.subtotal) : null,
    cu.descuento > 0 ? etqDescuento(d) + ': ' + usd(-cu.descuento) : null,
    'Envío: cobro a destino',
    'Total: ' + usd(cu.total),
    '',
    'PAGO REGISTRADO',
    m.titulo + (d.pago.referencia ? ' · ' + m.ref + ': ' + d.pago.referencia : ''),
    '',
    'ENVÍO',
    d.envio.oficina ? 'Oficina Zoom ' + d.envio.oficina : null,
    d.envio.direccion || null,
    lugarTxt(d) || null,
    d.envio.telefono ? 'Teléfono de la oficina: ' + d.envio.telefono : null,
    cobro,
    '',
    'QUÉ SIGUE',
    ...QUE_SIGUE.map((t, i) => (i + 1) + '. ' + t),
    '',
    'CONTACTO',
    'Para cualquier consulta sobre tu pedido, escríbenos por WhatsApp al ' + WHATSAPP.visible + '.',
    '',
    'Gracias por tu pedido.',
    MARCA,
    '',
    AVISO_LEGAL,
    'Recibes este correo porque hiciste un pedido en ' + SITIO + '.',
  ]).join('\n') + '\n';

  /* HTML */
  const oficina = lineasOficina(d);
  const cuerpo =
    '<p class="pp-tinta" style="margin:0 0 8px;' + FUENTE + 'font-size:20px;line-height:28px;font-weight:600;color:' + NAVY + ';">' + esc(saludo) + '</p>' +
    p1(esc(entrada), 'margin:0;') +

    h2('Resumen del pedido') +
    tablaProductos(d, { detalle: esc(KIT_DETALLE), derecha: 'Incluido' }) +
    tablaTotales(d) +

    h2('Pago registrado') +
    p1('<span style="font-weight:600;">' + esc(m.titulo) + '</span>' +
      (d.pago.referencia ? '<br>' + m.ref + ': <span style="font-weight:600;overflow-wrap:anywhere;word-break:break-word;">' + esc(d.pago.referencia) + '</span>' : ''), 'margin:0;') +

    h2('Envío') +
    (oficina.length ? p1(oficina.join('<br>'), 'margin:0 0 6px;') : '') +
    p2(cobro) +

    h2('Qué sigue') +
    '<table ' + TABLA + ' width="100%" style="width:100%;">' + QUE_SIGUE.map((t, i) =>
      '<tr><td class="pp-t2" valign="top" width="24" style="width:24px;padding:2px 0;' + FUENTE + 'font-size:15px;line-height:23px;font-weight:600;color:' + TINTA2 + ';">' + (i + 1) + '.</td>' +
      '<td class="pp-tinta" valign="top" style="padding:2px 0;' + FUENTE + 'font-size:15px;line-height:23px;color:' + NAVY + ';">' + t + '</td></tr>').join('') + '</table>' +

    h2('Contacto') +
    p1('Para cualquier consulta sobre tu pedido, escríbenos por WhatsApp al ' + enlace(waTienda, fijo(WHATSAPP.visible)) + '.', 'margin:0;') +

    '<table ' + TABLA + ' width="100%" style="width:100%;margin-top:28px;"><tr><td class="pp-linea" style="border-top:1px solid ' + LINEA + ';padding:20px 0 0;">' +
    p1('Gracias por tu pedido.', 'margin:0;') + p2(MARCA) + '</td></tr></table>';

  const html = documento({
    asunto,
    avance: QUE_SIGUE[0] + ' ' + QUE_SIGUE[1],
    cabecera: d.numero ? 'Pedido n.º ' + esc(d.numero) : '',
    cuerpo,
    pie: p2(AVISO_LEGAL) + p2('Recibes este correo porque hiciste un pedido en ' + SITIO + '.', 'margin:4px 0 0;'),
  });
  return { asunto, texto, html, para: d.cliente.correo };
}

/* ───────────── del pedido de WooCommerce a «p» ───────────── */

/**
 * orden: lo que devuelve POST /wc/v3/orders · web: el pedido que mandó la página (el de construirPedido) ·
 * cuentas: las de construirPedido ({ subtotal, descuento, pct, total, kits }) · opciones.admin: la raíz del
 * WordPress (https://ve-cms.peptidosplus.com) · opciones.clasico: enlace a post.php en vez de wc-orders. Los importes y los nombres salen de WooCommerce; lo que
 * WooCommerce no guarda con forma propia (oficina, método, notas) sale del pedido de la web.
 */
export function desdeWoo(orden, web, cuentas, opciones) {
  orden = orden || {}; web = web || {}; cuentas = cuentas || {}; opciones = opciones || {};
  const items = Array.isArray(web.items) ? web.items : [];
  const datos = web.datos || {}, envio = web.envio || {}, oficina = envio.oficina || {}, pago = web.pago || {};
  const admin = String(opciones.admin || '').replace(/\/+$/, '');
  return {
    numero: orden.number != null ? String(orden.number) : (orden.id != null ? String(orden.id) : ''),
    fecha: orden.date_created_gmt || orden.date_created || null,
    cliente: { nombre: datos.nombre, cedula: datos.cedula, telefono: datos.telefono, correo: datos.correo },
    lineas: (Array.isArray(orden.line_items) ? orden.line_items : []).map((l, i) => {
      const meta = (Array.isArray(l.meta_data) ? l.meta_data : []).find((x) => /presentaci/i.test(String(x.key)));
      return {
        nombre: l.parent_name || l.name,
        presentacion: (meta && (meta.display_value || meta.value)) || (items[i] && items[i].dosis) || '',
        cantidad: l.quantity, subtotal: l.subtotal, total: l.total,
      };
    }),
    kits: cuentas.kits,
    cuentas: { subtotal: cuentas.subtotal, descuento: cuentas.descuento, pct: cuentas.pct, total: orden.total != null ? orden.total : cuentas.total },
    pago: { metodo: pago.metodo || orden.payment_method_title, referencia: pago.referencia || orden.transaction_id },
    envio: { oficina: oficina.nombre, direccion: oficina.direccion, telefonoOficina: oficina.telefono, ciudad: envio.ciudad, estado: envio.estado },
    notas: datos.notas,
    // La tienda guarda los pedidos en las tablas nuevas de WooCommerce (HPOS activo, comprobado el 2026-10-03):
    // el pedido se abre en «wc-orders». Con opciones.clasico se usa la dirección antigua (post.php).
    enlaceAdmin: !admin || orden.id == null ? '' : admin + (opciones.clasico
      ? '/wp-admin/post.php?post=' + encodeURIComponent(String(orden.id)) + '&action=edit'
      : '/wp-admin/admin.php?page=wc-orders&action=edit&id=' + encodeURIComponent(String(orden.id))),
  };
}
