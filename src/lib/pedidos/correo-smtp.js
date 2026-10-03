/* correo-smtp.js — cliente SMTP mínimo, sin dependencias, para Cloudflare Workers.
 *
 * Manda UN correo por un servidor SMTP con TLS implícito (Gmail: smtp.gmail.com, puerto 465) y AUTH PLAIN.
 * Usa los sockets TCP del Worker (cloudflare:sockets, secureTransport 'on'). No guarda estado entre llamadas:
 * abre la conexión, entrega el mensaje, se despide y cierra, pase lo que pase.
 *
 *   import { enviarCorreo } from './correo-smtp.js';
 *   const r = await enviarCorreo({
 *     servidor: 'smtp.gmail.com', puerto: 465,
 *     usuario: env.GMAIL_USUARIO, clave: env.GMAIL_CLAVE_APP,
 *     de: { nombre: 'Peptidos Plus', correo: env.GMAIL_USUARIO },
 *     para: 'alguien@ejemplo.com',            // una dirección o una lista (máximo 20)
 *     responderA: 'cliente@ejemplo.com',      // opcional
 *     asunto: 'Pedido n.º 143', texto: '…', html: '<p>…</p>',
 *   }, { tiempoMaximoMs: 15000, dominio: 've.peptidosplus.com' });
 *   // → { ok: true, id: '<…@ve.peptidosplus.com>', respuesta: '250 2.0.0 OK …', ms: 900, tiempos: { SALUDO: 180, … } }
 *
 * Si algo falla lanza un ErrorCorreo con:
 *   .code     'DATOS_INVALIDOS' | 'CONEXION' | 'TIEMPO_AGOTADO' | 'AUTENTICACION' | 'RECHAZADO' | 'PROTOCOLO'
 *             (también en .codigo, como ErrorPedido)
 *   .etapa    'CONEXION' | 'SALUDO' | 'EHLO' | 'AUTH' | 'MAIL' | 'RCPT' | 'DATA' | 'CUERPO' (| 'RSET' en un ensayo)
 *   .smtp     código numérico del servidor (si lo hubo) y .respuesta su texto
 *   .temporal true si tiene sentido reintentar más tarde (un 4xx, un corte o un tiempo agotado)
 *   .ambiguo  true si el corte llegó en la etapa 'CUERPO': el servidor pudo haber aceptado el mensaje justo
 *             antes, así que reintentar puede duplicarlo. En las demás etapas es seguro que NO se envió.
 *
 * Opciones: tiempoMaximoMs (15000, para TODO el envío), dominio (para el EHLO y el Message-ID; por defecto el
 * del remitente), conectar (función con la forma de connect() de cloudflare:sockets; sirve para pruebas, o
 * para pasar el connect importado de forma estática), registrar (función que recibe { etapa, codigo, ms }
 * tras cada respuesta del servidor; nunca recibe la clave), ensayo (true: llega hasta RCPT, anula con RSET y
 * se despide — el servidor dice si aceptaría remitente y destinatarios, pero NO se manda nada).
 *
 * comprobarAcceso(datos, opciones) hace solo saludo + EHLO + AUTH + QUIT: dice si el servidor acepta el
 * usuario y la clave SIN mandar ningún correo.
 *
 * La clave no se registra ni aparece en ningún error. Todo lo que viaja en el mensaje es ASCII de 7 bits:
 * cabeceras con palabras codificadas (RFC 2047) y cuerpos en base64 con líneas de 76.
 * Los valores que escribe un cliente (nombre, asunto con su nombre…) pásalos antes por limpiarLinea():
 * armarMime RECHAZA cualquier salto de línea o carácter de control en cabeceras, no lo arregla.
 */

const CRLF = '\r\n';
const codificador = new TextEncoder();
const MAX_RESPUESTA = 16384;        // una respuesta SMTP más larga que esto no es normal
const MAX_CONTENIDO = 500000;       // caracteres de texto + html; un correo de pedido no llega ni al 5 %

export class ErrorCorreo extends Error {
  constructor(codigo, mensaje, extra) {
    super(mensaje);
    this.name = 'ErrorCorreo';
    this.code = codigo;
    this.codigo = codigo;
    if (extra) Object.assign(this, extra);
  }
}

const invalido = (mensaje) => new ErrorCorreo('DATOS_INVALIDOS', mensaje);

/* ───────────── piezas puras ───────────── */

function base64(bytes) {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}
const base64Utf8 = (texto) => base64(codificador.encode(texto));
const enLineasDe76 = (b64) => b64.replace(/.{76}(?=.)/g, '$&' + CRLF);
const saltosCrlf = (texto) => texto.replace(/\r\n|\r|\n/g, CRLF);

const RE_CORREO = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const RE_DOMINIO = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
// Controles C0 y C1, DEL y los separadores de línea y de párrafo de Unicode: nada de eso entra en una cabecera.
// (U+2028 y U+2029 se escriben con fromCharCode a propósito: así el archivo nunca lleva esos caracteres sueltos.)
const CONTROLES = '\\u0000-\\u001f\\u007f-\\u009f' + String.fromCharCode(0x2028, 0x2029);
const RE_CONTROL = new RegExp('[' + CONTROLES + ']');
const RE_CONTROLES = new RegExp('[' + CONTROLES + ']+', 'g');

/* Deja en UNA línea un texto que viene de fuera (nombre del cliente, etc.) para poder usarlo en el asunto:
 * cambia saltos y caracteres de control por un espacio, junta espacios y corta a «maximo» caracteres. */
export function limpiarLinea(valor, maximo = 200) {
  const t = String(valor == null ? '' : valor).replace(RE_CONTROLES, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, maximo).join('').trim();
}

/* Una dirección «pelada» (usuario@dominio), solo ASCII. Cualquier CR o LF se rechaza: así no hay forma de
 * colar cabeceras ni órdenes SMTP por una dirección. */
function direccion(valor, campo) {
  if (typeof valor !== 'string' || !valor.trim()) throw invalido('Falta la dirección de correo en «' + campo + '».');
  if (RE_CONTROL.test(valor)) throw invalido('La dirección de «' + campo + '» trae un salto de línea o un carácter de control.');
  const d = valor.trim();
  if (d.length > 254 || !RE_CORREO.test(d) || /^\.|\.@|\.\./.test(d)) throw invalido('La dirección de «' + campo + '» no es válida.');
  return d;
}

function textoDeCabecera(valor, campo, maximo) {
  if (typeof valor !== 'string') throw invalido('«' + campo + '» debe ser un texto.');
  if (RE_CONTROL.test(valor)) throw invalido('«' + campo + '» trae saltos de línea o caracteres de control.');
  const t = valor.trim();
  if (t.length > maximo) throw invalido('«' + campo + '» es demasiado largo (máximo ' + maximo + ' caracteres).');
  return t;
}

/* RFC 2047: palabras «=?UTF-8?B?…?=» de 75 caracteres como mucho, partidas siempre entre caracteres
 * completos (nunca en medio de una letra con tilde) y plegadas con CRLF + espacio. */
function palabrasCodificadas(texto) {
  const trozos = [];
  let trozo = '';
  let bytes = 0;
  for (const caracter of texto) {
    const n = codificador.encode(caracter).length;
    if (bytes + n > 39) { trozos.push(trozo); trozo = ''; bytes = 0; }
    trozo += caracter;
    bytes += n;
  }
  if (trozo) trozos.push(trozo);
  return trozos.map((t) => '=?UTF-8?B?' + base64Utf8(t) + '?=').join(CRLF + ' ');
}

const fechaRfc = (fecha) => fecha.toUTCString().replace(/GMT$/, '+0000');

/* Arma el mensaje completo (cabeceras + cuerpo MIME) sin tocar la red.
 * Devuelve { mensaje, id, de, para } — «de» y «para» son el sobre SMTP ya validado.
 * fecha, idMensaje y frontera se pueden fijar para que el resultado sea reproducible en pruebas. */
export function armarMime({ de, para, responderA, asunto, texto, html, fecha, idMensaje, frontera, dominio } = {}) {
  const remitente = direccion(de && de.correo, 'de.correo');
  const nombre = textoDeCabecera((de && de.nombre) || '', 'de.nombre', 80);
  const lista = Array.isArray(para) ? para : [para];
  if (!lista.length || lista.length > 20) throw invalido('«para» debe traer entre 1 y 20 direcciones.');
  const destinatarios = lista.map((p) => direccion(p, 'para'));
  const responder = responderA == null || responderA === '' ? null : direccion(responderA, 'responderA');
  const titulo = textoDeCabecera(asunto, 'asunto', 250);
  if (!titulo) throw invalido('Falta el asunto.');
  const hayTexto = typeof texto === 'string' && texto.trim() !== '';
  const hayHtml = typeof html === 'string' && html.trim() !== '';
  if (!hayTexto && !hayHtml) throw invalido('El correo no trae contenido (ni «texto» ni «html»).');
  if ((hayTexto ? texto.length : 0) + (hayHtml ? html.length : 0) > MAX_CONTENIDO) throw invalido('El contenido del correo es demasiado grande.');

  const dom = dominio == null ? remitente.slice(remitente.indexOf('@') + 1) : dominio;
  if (typeof dom !== 'string' || !RE_DOMINIO.test(dom)) throw invalido('«dominio» no es válido.');
  const cuando = fecha == null ? new Date() : fecha;
  if (!(cuando instanceof Date) || Number.isNaN(cuando.getTime())) throw invalido('«fecha» no es una fecha válida.');
  const id = idMensaje == null ? '<' + crypto.randomUUID() + '@' + dom + '>' : idMensaje;
  if (typeof id !== 'string' || !/^<[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,100}@[A-Za-z0-9.-]{1,253}>$/.test(id)) throw invalido('«idMensaje» no es válido.');
  const borde = frontera == null ? '=_pp_' + crypto.randomUUID().replace(/-/g, '') : frontera;
  if (typeof borde !== 'string' || !/^[A-Za-z0-9_=.-]{1,70}$/.test(borde)) throw invalido('«frontera» no es válida.');

  const frase = /^[A-Za-z0-9 '&+_-]{1,60}$/.test(nombre) ? nombre : palabrasCodificadas(nombre);
  const enUnaLinea = !frase.includes(CRLF) && ('From: ' + frase + ' <' + remitente + '>').length <= 76;
  const asuntoListo = /^[\x20-\x7e]{1,66}$/.test(titulo) && !titulo.includes('=?') ? titulo : palabrasCodificadas(titulo);

  const cabeceras = [
    'From: ' + (nombre ? frase + (enUnaLinea ? ' ' : CRLF + ' ') : '') + '<' + remitente + '>',
    'To: ' + destinatarios.map((d) => '<' + d + '>').join(',' + CRLF + ' '),
    responder ? 'Reply-To: <' + responder + '>' : null,
    'Subject: ' + asuntoListo,
    'Date: ' + fechaRfc(cuando),
    'Message-ID: ' + id,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  const parte = (tipo, contenido) => [
    'Content-Type: ' + tipo + '; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    enLineasDe76(base64Utf8(saltosCrlf(contenido))),
  ].join(CRLF);

  let cuerpo;
  if (hayTexto && hayHtml) {
    cabeceras.push('Content-Type: multipart/alternative;' + CRLF + ' boundary="' + borde + '"');   // plegada: con la frontera pasaría de 76
    cuerpo = ['', '--' + borde, parte('text/plain', texto), '--' + borde, parte('text/html', html), '--' + borde + '--'].join(CRLF);
  } else {
    cuerpo = hayTexto ? parte('text/plain', texto) : parte('text/html', html);
  }
  return { mensaje: cabeceras.join(CRLF) + CRLF + cuerpo + CRLF, id, de: remitente, para: destinatarios };
}

/* «Dot-stuffing» (RFC 5321 §4.5.2): toda línea que empieza por punto viaja con un punto de más, para que
 * ninguna se confunda con el «.» que cierra el mensaje. */
export function rellenarPuntos(mensaje) {
  return mensaje.replace(/(^|\r\n)\./g, '$1..');
}

/* ───────────── conversación SMTP ───────────── */

const conLimite = (promesa, ms) => {
  let t;
  return Promise.race([promesa, new Promise((listo) => { t = setTimeout(listo, ms); })]).finally(() => clearTimeout(t));
};

/* Abre la conexión, saluda y se identifica; si «trabajo» existe lo ejecuta (ahí va el envío); se despide y
 * cierra el socket SIEMPRE. Todo dentro de un único plazo total. */
async function sesion(datos, opciones, saludoPropio, trabajo) {
  const { servidor = 'smtp.gmail.com', puerto = 465, usuario, clave } = datos || {};
  const { tiempoMaximoMs = 15000, conectar, registrar } = opciones || {};

  if (typeof servidor !== 'string' || !RE_DOMINIO.test(servidor)) throw invalido('«servidor» no es válido.');
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535 || puerto === 25) throw invalido('«puerto» no es válido (los Workers no pueden usar el 25; Gmail va por el 465).');
  if (typeof usuario !== 'string' || !usuario || /[\r\n\u0000]/.test(usuario)) throw invalido('Falta el usuario del correo.');
  if (typeof clave !== 'string' || !clave || /[\r\n\u0000]/.test(clave)) throw invalido('Falta la clave del correo.');
  if (!(tiempoMaximoMs > 0)) throw invalido('«tiempoMaximoMs» debe ser mayor que cero.');
  if (typeof saludoPropio !== 'string' || !RE_DOMINIO.test(saludoPropio)) throw invalido('«dominio» no es válido.');

  // Google muestra la contraseña de aplicación en cuatro grupos separados por espacios; viaja sin ellos.
  const claveLimpia = /^\s*(?:[a-z]{4}\s+){3}[a-z]{4}\s*$/i.test(clave) ? clave.replace(/\s+/g, '') : clave;
  const credencial = base64Utf8('\u0000' + usuario + '\u0000' + claveLimpia);
  const tapar = (t) => String(t == null ? '' : t).split(credencial).join('***').split(claveLimpia).join('***').split(clave).join('***');

  let abrir = conectar;
  if (!abrir) {
    try { abrir = (await import('cloudflare:sockets')).connect; }
    catch { throw new ErrorCorreo('CONEXION', 'Aquí no hay sockets de Cloudflare (cloudflare:sockets); fuera de un Worker hay que pasar opciones.conectar.', { etapa: 'CONEXION', temporal: false }); }
  }

  const inicio = Date.now();
  const tiempos = {};
  let etapa = 'CONEXION';
  let socket = null;
  let resultado = null;
  let temporizador;

  const dialogo = async () => {
    socket = abrir({ hostname: servidor, port: puerto }, { secureTransport: 'on', allowHalfOpen: false });
    if (socket.closed && socket.closed.catch) socket.closed.catch(() => {});
    const lector = socket.readable.getReader();
    const escritor = socket.writable.getWriter();
    const decodificador = new TextDecoder();
    let pendiente = '';
    await socket.opened;

    // Lee hasta completar UNA respuesta. Las de varias líneas van «NNN-texto» y terminan en «NNN texto».
    const leer = async () => {
      for (;;) {
        let desde = 0;
        for (let fin = pendiente.indexOf('\n'); fin >= 0; fin = pendiente.indexOf('\n', desde)) {
          const linea = pendiente.slice(desde, fin).replace(/\r$/, '');
          desde = fin + 1;
          if (/^\d{3}(?: |$)/.test(linea)) {
            const textoCompleto = pendiente.slice(0, fin).replace(/\r/g, '').trimEnd();
            pendiente = pendiente.slice(desde);
            return { codigo: Number(linea.slice(0, 3)), texto: textoCompleto };
          }
          if (!/^\d{3}-/.test(linea)) throw new ErrorCorreo('PROTOCOLO', 'El servidor respondió algo que no es SMTP.');
        }
        if (pendiente.length > MAX_RESPUESTA) throw new ErrorCorreo('PROTOCOLO', 'La respuesta del servidor es demasiado larga.');
        const { value, done } = await lector.read();
        if (done) throw new ErrorCorreo('CONEXION', 'El servidor cerró la conexión antes de tiempo.');
        pendiente += decodificador.decode(value, { stream: true });
      }
    };
    const esperar = async (aceptados) => {
      const r = await leer();
      tiempos[etapa] = Date.now() - inicio;
      if (registrar) { try { registrar({ etapa, codigo: r.codigo, ms: tiempos[etapa] }); } catch { /* el registro nunca tumba el envío */ } }
      if (!aceptados.includes(r.codigo)) {
        const respuesta = tapar(r.texto).slice(0, 500);
        throw new ErrorCorreo(etapa === 'AUTH' ? 'AUTENTICACION' : 'RECHAZADO',
          (etapa === 'AUTH' ? 'El servidor de correo no aceptó el usuario o la clave' : 'El servidor de correo rechazó el paso ' + etapa) + ': ' + respuesta.replace(/\s+/g, ' ').slice(0, 200),
          { smtp: r.codigo, respuesta, temporal: r.codigo >= 400 && r.codigo < 500 });
      }
      return r;
    };
    const decir = async (linea, aceptados) => {
      await escritor.write(codificador.encode(linea + CRLF));
      return esperar(aceptados);
    };

    etapa = 'SALUDO'; await esperar([220]);
    etapa = 'EHLO'; const hola = await decir('EHLO ' + saludoPropio, [250]);
    if (!/^250[- ]AUTH(?:[ =]\S+)*[ =]PLAIN(?= |$)/im.test(hola.texto)) throw new ErrorCorreo('PROTOCOLO', 'El servidor de correo no ofrece AUTH PLAIN.', { temporal: false });
    etapa = 'AUTH'; await decir('AUTH PLAIN ' + credencial, [235]);
    const hecho = trabajo ? await trabajo(decir, (nueva) => { etapa = nueva; }) : {};
    resultado = { ok: true, ...hecho, ms: Date.now() - inicio, tiempos };
    etapa = 'QUIT';                                                // lo importante ya está hecho: la despedida es de cortesía
    await conLimite(decir('QUIT', [221]).catch(() => {}), 1500);
  };

  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new ErrorCorreo('TIEMPO_AGOTADO', 'El servidor de correo no respondió en ' + tiempoMaximoMs + ' ms (etapa ' + etapa + ').')), tiempoMaximoMs);
  });

  try {
    await Promise.race([dialogo(), limite]);
  } catch (e) {
    if (!resultado) {
      const error = e instanceof ErrorCorreo ? e
        : new ErrorCorreo('CONEXION', 'No se pudo hablar con ' + servidor + ':' + puerto + ' (etapa ' + etapa + '): ' + tapar(e && e.message).slice(0, 200));
      if (!error.etapa) error.etapa = etapa;
      const corte = error.code === 'CONEXION' || error.code === 'TIEMPO_AGOTADO';
      if (error.temporal == null) error.temporal = corte;
      error.ambiguo = corte && error.etapa === 'CUERPO';
      throw error;
    }
  } finally {
    clearTimeout(temporizador);
    if (socket) { try { await conLimite(Promise.resolve().then(() => socket.close()).catch(() => {}), 1500); } catch { /* ya estaba cerrado */ } }
  }
  return resultado;
}

const dominioDe = (correo) => correo.slice(correo.indexOf('@') + 1);

/* Manda un correo. Devuelve { ok: true, id, respuesta, ms, tiempos } o lanza un ErrorCorreo.
 * Con opciones.ensayo devuelve { ok: true, ensayo: true, id, ms, tiempos } y no manda nada. */
export async function enviarCorreo(datos, opciones) {
  const dominio = opciones && opciones.dominio;
  const ensayo = Boolean(opciones && opciones.ensayo);
  const sobre = armarMime({ ...datos, dominio });       // valida todo ANTES de abrir la conexión
  return sesion(datos, opciones, dominio == null ? dominioDe(sobre.de) : dominio, async (decir, pasarA) => {
    pasarA('MAIL'); await decir('MAIL FROM:<' + sobre.de + '>', [250]);
    pasarA('RCPT'); for (const d of sobre.para) await decir('RCPT TO:<' + d + '>', [250, 251]);
    if (ensayo) { pasarA('RSET'); await decir('RSET', [250]); return { ensayo: true, id: sobre.id }; }
    pasarA('DATA'); await decir('DATA', [354]);
    pasarA('CUERPO'); const fin = await decir(rellenarPuntos(sobre.mensaje) + '.', [250]);
    return { id: sobre.id, respuesta: fin.texto.slice(0, 200) };
  });
}

/* Comprueba que el servidor acepta el usuario y la clave, sin mandar nada.
 * Devuelve { ok: true, ms, tiempos } o lanza un ErrorCorreo (AUTENTICACION si la clave no entra). */
export async function comprobarAcceso(datos, opciones) {
  const dominio = opciones && opciones.dominio;
  const usuario = datos && typeof datos.usuario === 'string' ? datos.usuario : '';
  return sesion(datos, opciones, dominio == null ? (usuario.includes('@') ? dominioDe(usuario) : 'localhost') : dominio, null);
}
