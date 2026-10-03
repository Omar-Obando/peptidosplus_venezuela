/* Pago en una sola página (Peptidos Plus).
 *
 * 2026-09-29, Angel:
 *  · «Quiero que todo esté en la misma página para que las personas no tengan que dar constantemente a
 *    continuar»: todo el pago vive en una sola página y no hay botones «Continuar».
 *  · A la izquierda una tarjeta con los pasos numerados (1 Tus datos · 2 Dirección · 3 Pago); a la derecha el
 *    resumen del pedido y debajo el botón «Finalizar compra». En el teléfono: resumen, pasos y botón.
 *
 * 2026-10-03, Angel (mañana):
 *  · Los tres pasos son un acordeón, uno abierto a la vez. Un paso se cierra solo cuando está completo y el
 *    cliente sale de él (el de dirección, al elegir la oficina; el de pago es el último y no se cierra solo).
 *    Sigue siendo una sola página sin «Continuar»: cada cabecera es un botón que abre su paso.
 *  · Los pasos del pago los numera el navegador (ol) y no hablan de verificación manual.
 *  · «el zelle es para montos superiores a 150$ … y le salga una barrita por llenar»: ZELLE_MINIMO.
 *
 * 2026-10-03, Angel (tarde): «que el checkout se vea lo más parecido posible a aminoclub»
 *  · Piel de Amino Club: círculo navy con el número, título en negrita, la palomita verde AL LADO del título
 *    cuando el paso está completo y «Editar» a la derecha. Cerrado y completo, el paso muestra lo escrito en
 *    columnas (etiqueta en negrita, valores en gris). Los métodos de pago son dos tarjetas lado a lado, la
 *    elegida rellena navy. El resumen no lleva + / − / Quitar: «Editar» abre el panel lateral del carrito.
 *    Con descuento por cantidad, cada línea muestra su precio tachado y el precio con descuento en verde; el
 *    descuento se reparte al céntimo para que las líneas sumen exactamente el total (el agua no lo recibe);
 *    el reparto es el del panel lateral (ppCarrito.lineas), así cada línea cuesta lo mismo en los dos sitios.
 *  · «El zelle el mínimo se mide contra el total del descuento»: contra el total a pagar, ya con el descuento.
 *  · «lo del kit llama demasiado la atención … solo algo verde como una palomita encerrada en un círculo»: el
 *    kit es una fila de los totales: palomita verde, «Kit de aplicación», un «?» que dice lo que trae e
 *    «Incluido». Ya no se usa assets/marca/kit-aplicacion.svg.
 *  · «pedir en tus datos Cédula obligatorio» · «donde dice envío yo creo que debería decir Dirección».
 *  · «en pagos también debería ser posible copiar el monto total … dejando a un lado el texto usdt»: bloque
 *    «Monto exacto» con el número solo y su «Copiar»; la moneda es una etiqueta aparte que no se copia.
 *  · «Finalizar compra» guarda el pedido de verdad: POST /api/pedido. Con éxito, la pantalla «Tu pedido está
 *    siendo procesado» (palomita verde, número del pedido, ayuda por WhatsApp) y el carrito se vacía. Si el
 *    servidor responde con un error, su mensaje sale junto al botón (y lleva al campo, o repinta el total).
 *    Sin conexión, 404 o 5xx: «No pudimos registrar tu pedido…» con «Reintentar» y el pedido completo por
 *    WhatsApp; ahí el carrito NO se vacía.
 *
 * Solo se repinta la parte que cambia; los campos que el cliente está escribiendo no se tocan. Los pasos se
 * montan una vez: al cerrarse solo se pliegan, así que lo escrito se conserva.
 */
(() => {
  'use strict';
  const C = window.ppCarrito;
  const raiz = document.getElementById('pp-checkout');
  if (!C || !raiz) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const usd = (n) => '$' + n.toFixed(2);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const WA_NUMERO = '15806436837';
  const WA_VISIBLE = '+1 (580) 643-6837';
  const API_PEDIDO = '/api/pedido';
  const ESPERA_MAX_MS = 30000;               // sin respuesta en este tiempo: cuenta como «sin conexión»
  const ZELLE_MINIMO = 150;                  // «el zelle es para montos superiores a 150$»: contra el total a pagar
  const PLIEGUE_MS = 180;                    // lo que tarda un paso en plegarse (lo mismo que en pp-tokens.css)
  // ref: la etiqueta del campo · falta: cómo se pide bajo el botón · paso: cómo se nombra en los pasos del pago
  const PAGOS = {
    zelle: { nombre: 'Zelle', moneda: 'USD', nota: 'Para pedidos desde $' + ZELLE_MINIMO, ref: 'Número de confirmación', falta: 'el número de confirmación de Zelle', paso: 'el número de confirmación' },
    binance: { nombre: 'Binance Pay', moneda: 'USDT', nota: 'Sin monto mínimo', ref: 'ID de la orden de Binance', falta: 'el ID de la orden de Binance', paso: 'el ID de la orden' },
  };
  const METODOS = Object.keys(PAGOS);
  // Datos de cobro reales (dueño, 2026-09-16), los mismos de peptidosplus.com. Pago Móvil: no disponible.
  const DATOS = {
    zelle: { correo: 'cjob610@gmail.com', titular: 'Comercializadora Job LLC', etq: 'Enviar al correo' },
    binance: { correo: 'pagospeptidosplus@gmail.com', etq: 'Enviar por Binance Pay al correo' },
  };
  const KIT = 'Agua bacteriostática de 3 ml, 10 jeringas y 10 toallitas con alcohol por cada péptido.';
  const FLECHA = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 8l4.5 4.5L14.5 8"/></svg>';
  // la palomita blanca en su círculo verde (el color lo pone la hoja de estilos: #22c55e)
  const OK = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="currentColor"/><path d="M5.8 10.3l2.7 2.7 5.7-5.9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ALERTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>';
  const ICONO_WS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  /* ---------- lo que sobrevive a una recarga (solo en esta pestaña) ----------
   * El número de orden se conserva mientras el pedido no se haya registrado: si la página se recarga a medio
   * envío, el reintento lleva la MISMA orden y el servidor puede reconocerla. El pedido ya registrado también
   * se anota: al recargar se vuelve a ver su pantalla, no un formulario listo para enviarlo otra vez. */
  const K_ORDEN = 'pp_orden_v1', K_OK = 'pp_pedido_ok_v1';
  const leer = (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } };
  const anotar = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };
  const olvidar = (k) => { try { sessionStorage.removeItem(k); } catch (e) { /* modo privado */ } };
  const nuevaOrden = () => { const id = 'ORD-' + String(Math.floor(100000 + Math.random() * 900000)); anotar(K_ORDEN, id); return id; };

  /* ---------- estado ---------- */
  let pantalla = 'pedido';                   // pedido | vacio | exito
  let metodo = 'zelle';
  const datos = { nombre: '', cedula: '', telefono: '', correo: '', notas: '' };
  const envio = { transporte: 'zoom', estado: '', ciudad: '', oficina: null };
  const ordenGuardada = leer(K_ORDEN);
  const orden = { id: typeof ordenGuardada === 'string' && /^ORD-\d{6}$/.test(ordenGuardada) ? ordenGuardada : nuevaOrden() };
  let referencia = '';                       // la del método elegido
  const refs = { zelle: '', binance: '' };   // la de cada método se guarda aparte: al cambiar de método no se arrastra
  const PASOS = ['datos', 'envio', 'pago'];
  let abierto = 'datos';                     // el paso abierto del acordeón (uno a la vez); null = los tres cerrados
  const visto = { datos: true, envio: false, pago: false };   // los pasos que ya se abrieron alguna vez
  let filtro = '';
  let intento = false;                       // ya pulsó «Finalizar compra» con algo pendiente: se marcan los campos
  let enviando = false;                      // el pedido va camino del servidor
  let pedido = C.items().length ? null : leer(K_OK);   // { numero, total, simulado } del pedido ya registrado
  if (!pedido || typeof pedido !== 'object') { pedido = null; olvidar(K_OK); }
  let errSrv = null;                         // { campo, mensaje }: lo que el servidor dijo de un campo
  let totalSrv = null, firmaSrv = '';        // el total que dio el servidor (409 «total»), mientras el carrito no cambie
  let kitAbierto = false;                    // el globo del «?» del kit
  let OFICINAS = [];
  let oficinasListas = false;

  const estados = () => Array.from(new Set(OFICINAS.map((o) => o.estado))).sort((a, b) => a.localeCompare(b, 'es'));
  const ciudades = (e) => Array.from(new Set(OFICINAS.filter((o) => o.estado === e).map((o) => o.ciudad))).sort((a, b) => a.localeCompare(b, 'es'));
  const oficinasDe = (e, c) => OFICINAS.filter((o) => o.estado === e && o.ciudad === c && o.cod);
  const visibles = () => {
    const ofs = envio.estado && envio.ciudad ? oficinasDe(envio.estado, envio.ciudad) : [];
    const f = filtro.toLowerCase().trim();
    return f ? ofs.filter((o) => (o.nombre + ' ' + o.direccion).toLowerCase().includes(f)) : ofs;
  };

  const items = () => C.items();
  const clave = (i) => i.id + '|' + (i.dosis || '');
  const firma = () => items().map((i) => clave(i) + '×' + i.cant + '@' + i.precio).join(';');
  const total = () => (totalSrv != null && firmaSrv === firma() ? totalSrv : C.total());
  const kits = () => (C.unidadesPeptidos ? C.unidadesPeptidos() : items().filter((i) => C.esPeptidoNombre(i.nombre)).reduce((s, i) => s + i.cant, 0));
  const telefonoValido = () => datos.telefono.replace(/\D/g, '').length >= 7;
  const referenciaValida = () => referencia.trim().length >= 6;
  // Cédula: de 6 a 9 dígitos, con el prefijo V/E/J/P opcional («V-12.345.678», «12345678», «e 8123456»)
  const partesCedula = () => { const m = /^([vejp])?[\s.\-]*(\d[\d.\s\-]*)$/i.exec(datos.cedula.trim()); return m ? { letra: (m[1] || '').toUpperCase(), num: m[2].replace(/\D/g, '') } : null; };
  const cedulaValida = () => { const c = partesCedula(); return !!c && c.num.length >= 6 && c.num.length <= 9; };
  const cedulaLimpia = () => { const c = partesCedula(); return c ? (c.letra ? c.letra + '-' : '') + c.num : datos.cedula.trim(); };
  // Zelle solo desde el mínimo: por debajo se bloquea y en su lugar va la barra que se va llenando
  const zelleBloqueado = () => total() < ZELLE_MINIMO;
  // Cambiar de método guarda lo escrito en el anterior y recupera lo del nuevo
  function elegirMetodo(k) {
    if (k === metodo || !PAGOS[k]) return;
    refs[metodo] = referencia;
    metodo = k;
    referencia = refs[k] || '';
  }

  // Lo que falta para poder finalizar, en el orden de la página (cada dato, con el paso donde se escribe)
  function faltan() {
    const f = [];
    if (!datos.nombre.trim()) f.push({ campo: 'nombre', paso: 'datos', texto: 'tu nombre' });
    if (!datos.cedula.trim()) f.push({ campo: 'cedula', paso: 'datos', texto: 'tu cédula' });
    else if (!cedulaValida()) f.push({ campo: 'cedula', paso: 'datos', texto: 'una cédula válida' });
    if (!datos.telefono.trim()) f.push({ campo: 'telefono', paso: 'datos', texto: 'tu teléfono' });
    else if (!telefonoValido()) f.push({ campo: 'telefono', paso: 'datos', texto: 'un teléfono completo' });
    if (!envio.estado) f.push({ campo: 'estado', paso: 'envio', texto: 'el estado' });
    else if (!envio.ciudad) f.push({ campo: 'ciudad', paso: 'envio', texto: 'la ciudad' });
    else if (!envio.oficina) f.push({ campo: 'oficina', paso: 'envio', texto: 'la oficina donde retiras' });
    // con Zelle bloqueado el método pasa solo a Binance Pay; si aun así quedara elegido, no se puede terminar
    if (metodo === 'zelle' && zelleBloqueado()) f.push({ campo: 'metodo', paso: 'pago', texto: 'elegir otro método de pago (Zelle es para pedidos desde $' + ZELLE_MINIMO + ')' });
    else if (!referenciaValida()) f.push({ campo: 'referencia', paso: 'pago', texto: PAGOS[metodo].falta });
    return f;
  }
  const enLista = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);
  const hechoPaso = (k) => !faltan().some((x) => x.paso === k);
  const secDe = (k) => document.getElementById('co-s-' + k);
  const suave = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- esqueleto (se monta una vez) ---------- */
  const campo = (etq, nombre, extra) => {
    extra = extra || {};
    const id = 'co-' + nombre;
    return '<label class="co-etq" for="' + id + '">' + etq + '</label>' + (extra.area
      ? '<textarea class="co-campo" id="' + id + '" data-campo="' + nombre + '" placeholder="' + esc(extra.ph || '') + '"></textarea>'
      : '<input class="co-campo" id="' + id + '" data-campo="' + nombre + '" type="' + (extra.tipo || 'text') + '"' + (extra.auto ? ' autocomplete="' + extra.auto + '"' : '') + (extra.modo ? ' inputmode="' + extra.modo + '"' : '') + (extra.mayus ? ' autocapitalize="characters" spellcheck="false"' : '') + ' placeholder="' + esc(extra.ph || '') + '"' + (extra.req ? ' aria-required="true"' : '') + '>') +
      '<p class="co-error" id="' + id + '-error" hidden></p>';
  };
  const opcion = (grupo, valor, marcado, titulo, detalle, fin, apagada) =>
    '<label class="co-opcion' + (apagada ? ' off' : '') + '"><input type="radio" class="co-radio" name="' + grupo + '" value="' + esc(valor) + '"' + (marcado ? ' checked' : '') + (apagada ? ' disabled' : '') + '>' +
    '<span class="co-palomita" aria-hidden="true"></span><span class="co-opcion-txt"><b>' + titulo + '</b>' + (detalle || '') + '</span>' + (fin || '') + '</label>';
  // Un paso del acordeón. La cabecera es un botón de verdad (abre su paso y cierra el que estaba): el círculo
  // con el número, el título, la palomita verde al lado cuando está completo y «Editar» a la derecha. Debajo,
  // con el paso cerrado, lo escrito en columnas (o lo que falta). El cuerpo se pliega sin destruirse: plegado
  // va con «inert», así que ni recibe el foco ni lo lee el lector de pantalla.
  const armarPaso = (n, k, titulo, cuerpo) => '<section class="co-sec' + (abierto === k ? '' : ' cerrado') + '" id="co-s-' + k + '" data-paso="' + k + '" aria-labelledby="co-t-' + k + '">' +
    '<h2 class="co-h2"><button type="button" class="co-cab-btn" data-accion="paso" data-paso="' + k + '" aria-expanded="' + (abierto === k) + '" aria-controls="co-c-' + k + '">' +
      '<span class="co-paso" aria-hidden="true">' + n + '</span>' +
      '<span class="co-paso-tit"><span id="co-t-' + k + '">' + titulo + '</span><span class="co-hecho" data-hecho="' + k + '" hidden>' + OK + '<span class="co-sr">(completo)</span></span></span>' +
      '<span class="co-paso-fin"><span class="co-editar">Editar</span>' + FLECHA + '</span>' +
    '</button></h2>' +
    '<div class="co-paso-res" data-res="' + k + '"></div>' +
    '<div class="co-cuerpo" id="co-c-' + k + '"' + (abierto === k ? '' : ' inert') + '><div class="co-cuerpo-in">' + cuerpo + '</div></div></section>';

  function montar() {
    const form = $('.co-form', raiz);
    form.innerHTML =
      armarPaso(1, 'datos', 'Tus datos',
        '<div class="co-campos">' +
          '<div>' + campo('Nombre y apellido', 'nombre', { auto: 'name', req: true }) + '</div>' +
          '<div>' + campo('Cédula de identidad', 'cedula', { auto: 'off', ph: 'V-12.345.678', req: true, mayus: true }) + '</div>' +
          '<div>' + campo('Teléfono (WhatsApp)', 'telefono', { tipo: 'tel', auto: 'tel', modo: 'tel', ph: '0412-000.00.00', req: true }) + '</div>' +
          '<div>' + campo('Correo electrónico <span class="co-opc">(opcional)</span>', 'correo', { tipo: 'email', auto: 'email' }) + '</div>' +
          '<div class="co-ancho">' + campo('Notas del pedido <span class="co-opc">(opcional)</span>', 'notas', { area: true, ph: 'Algo que debamos saber del despacho' }) + '</div>' +
        '</div>') +
      armarPaso(2, 'envio', 'Dirección',
        '<p class="co-sub">Despachamos solo a oficinas de Zoom o MRW, no a domicilios. El envío es con cobro a destino.</p>' +
        '<fieldset class="co-grupo"><legend class="co-etq">Empresa de envío</legend><div class="co-transportes">' +
          opcion('transporte', 'zoom', true, 'Zoom', '<small>370 oficinas · cobro a destino</small>') +
          opcion('transporte', 'mrw', false, 'MRW', '<small>No disponible por el momento</small>', '', true) +
        '</div></fieldset>' +
        '<div class="co-campos">' +
          '<div><label class="co-etq" for="co-estado">Estado</label><select class="co-campo" id="co-estado" data-campo="estado" aria-required="true"><option value="">Cargando oficinas…</option></select><p class="co-error" id="co-estado-error" hidden></p></div>' +
          '<div><label class="co-etq" for="co-ciudad">Ciudad</label><select class="co-campo" id="co-ciudad" data-campo="ciudad" aria-required="true" disabled><option value="">Elige primero el estado</option></select><p class="co-error" id="co-ciudad-error" hidden></p></div>' +
        '</div>' +
        '<div data-zona="oficinas"></div>') +
      // Pago: los métodos son dos tarjetas lado a lado (la elegida, rellena navy); debajo, los datos del elegido
      armarPaso(3, 'pago', 'Pago',
        '<p class="co-sub">Elige cómo prefieres pagar tu pedido.</p>' +
        '<div class="co-metodos" role="radiogroup" aria-labelledby="co-t-pago">' +
          METODOS.map((k) => '<label class="co-metodo' + (metodo === k ? ' sel' : '') + '" data-metodo="' + k + '"><input type="radio" class="co-radio" name="metodo" value="' + k + '"' + (metodo === k ? ' checked' : '') + '>' +
            '<span class="co-metodo-txt"><b>' + PAGOS[k].nombre + '</b><small>' + PAGOS[k].nota + '</small></span></label>').join('') +
        '</div>' +
        '<div data-zona="zelle-min"></div>' +
        '<p class="co-nota co-movil">Pago Móvil: no disponible por el momento.</p>' +
        '<p class="co-error" id="co-metodo-error" hidden></p>' +
        '<div class="co-metodo-cuerpo" data-zona="pago-cuerpo"></div>');
    zelleEstaba = null;                      // los métodos se acaban de montar: pintarZelle() los pone al día
    // si el carrito se vació y se volvió a llenar sin salir de la página, lo escrito sigue ahí
    Object.keys(datos).forEach((k) => { const el = $('#co-' + k, form); if (el) el.value = datos[k]; });

    const lado = $('.co-lado', raiz);
    lado.innerHTML =
      '<section class="co-resumen" aria-labelledby="co-t-resumen">' +
        '<div class="co-resumen-cab"><h2 class="co-h2" id="co-t-resumen">Resumen del pedido</h2>' +
          '<span class="co-cuenta"><span data-zona="cuenta"></span><button type="button" class="co-enlace" data-accion="carrito" aria-label="Editar el carrito">Editar</button></span></div>' +
        '<div class="co-resumen-items" data-zona="pedido"></div>' +
        '<dl class="co-totales" data-zona="totales"></dl>' +
      '</section>' +
      '<div class="co-accion">' +
        '<p class="co-accion-total"><span>Total</span><b data-zona="total-movil"></b></p>' +
        '<button type="button" class="co-btn co-finalizar" data-accion="finalizar">Finalizar compra</button>' +
        '<p class="co-falta" data-zona="falta" aria-live="polite"></p>' +
        '<div data-zona="resultado"></div>' +
      '</div>';
  }

  /* ---------- partes que se repintan ---------- */
  // El descuento por cantidad, repartido entre las líneas de péptidos al céntimo (lo que sobra del redondeo va
  // a las líneas con más resto): la suma de las líneas da exactamente el total. El agua no recibe descuento.
  function lineas() {
    const cts = (n) => Math.round(n * 100);
    // el carrito lateral ya hace este reparto (ppCarrito.lineas): se usa el suyo para que cada línea cueste
    // lo mismo aquí y en el panel; si no está, se reparte aquí
    const its = items(), pl = C.lineas ? C.lineas() : null;
    if (pl && pl.length === its.length) return its.map((i, n) => ({ i: i, orig: cts(pl[n].antes), dto: cts(pl[n].antes) - cts(pl[n].ahora) }));
    const d = C.descuentoPorCantidad ? C.descuentoPorCantidad() : null;
    const filas = items().map((i) => ({ i: i, orig: cts(C.subtotalLinea(i.precio, i.cant)), dto: 0, resto: 0, pep: !!C.esPeptidoNombre(i.nombre) }));
    const D = d ? cts(d.monto) : 0, peps = filas.filter((f) => f.pep), base = peps.reduce((s, f) => s + f.orig, 0);
    if (D > 0 && base > 0) {
      let sobra = D;
      peps.forEach((f) => { const x = D * f.orig / base; f.dto = Math.floor(x + 1e-9); f.resto = x - f.dto; sobra -= f.dto; });
      peps.slice().sort((a, b) => b.resto - a.resto).slice(0, Math.max(0, sobra)).forEach((f) => { f.dto += 1; });
    }
    return filas;
  }
  function pintarPedido() {
    const zona = $('[data-zona="pedido"]', raiz);
    if (!zona) return;
    const d = C.descuentoPorCantidad ? C.descuentoPorCantidad() : null;
    const sig = C.siguientePeldano ? C.siguientePeldano() : null;
    const u = items().reduce((s, i) => s + i.cant, 0);
    const cuenta = $('[data-zona="cuenta"]', raiz);
    if (cuenta) cuenta.textContent = u + (u === 1 ? ' producto' : ' productos');
    zona.innerHTML = '<ul class="co-items">' +
      lineas().map((f) => {
        const i = f.i, ficha = esc(C.fichaDe(i));
        return '<li class="co-item">' +
          '<a class="co-mini" href="' + ficha + '" tabindex="-1" aria-hidden="true"><img src="' + esc(C.miniatura(i.img)) + '" alt="" width="64" height="64" loading="lazy"></a>' +
          '<span class="co-item-txt"><a class="co-item-nom" href="' + ficha + '">' + esc(i.nombre) + '</a>' +
            '<span class="co-item-det">' + esc((i.dosis || '').toUpperCase()) + (i.dosis ? ' · ' : '') + 'Cant.: ' + i.cant + '</span></span>' +
          '<span class="co-item-precio">' + (f.dto ? '<s><span class="co-sr">Antes </span>' + usd(f.orig / 100) + '</s>' : '') +
            '<b class="co-precio' + (f.dto ? ' co-verde' : '') + '">' + usd((f.orig - f.dto) / 100) + '</b></span>' +
        '</li>';
      }).join('') +
      '</ul>' +
      (sig && sig.pct > (d ? d.pct : 0) ? '<p class="co-peldano">Lleva ' + sig.faltan + (sig.faltan === 1 ? ' péptido más' : ' péptidos más') + ' y el descuento sube a <b>' + sig.pct + ' %</b>.</p>' : '');
  }

  function pintarSelects() {
    const se = $('#co-estado', raiz);
    if (!se) return;
    const es = estados();
    se.innerHTML = '<option value="">' + (es.length ? 'Selecciona tu estado…' : (oficinasListas ? 'No se pudieron cargar las oficinas' : 'Cargando oficinas…')) + '</option>' +
      es.map((e) => '<option value="' + esc(e) + '"' + (e === envio.estado ? ' selected' : '') + '>' + esc(e) + '</option>').join('');
    pintarCiudades();
  }
  function pintarCiudades() {
    const sc = $('#co-ciudad', raiz);
    if (!sc) return;
    const cs = envio.estado ? ciudades(envio.estado) : [];
    sc.disabled = !envio.estado;
    sc.innerHTML = '<option value="">' + (envio.estado ? 'Selecciona tu ciudad…' : 'Elige primero el estado') + '</option>' +
      cs.map((c) => '<option value="' + esc(c) + '"' + (c === envio.ciudad ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  }

  function pintarOficinas() {
    const zona = $('[data-zona="oficinas"]', raiz);
    if (!zona) return;
    if (!envio.ciudad) { zona.innerHTML = ''; return; }
    const ofs = oficinasDe(envio.estado, envio.ciudad);
    zona.innerHTML = '<div class="co-oficinas-cab"><span class="co-etq" id="co-t-oficina">Oficina donde retiras <span class="co-opc">(' + ofs.length + ' en ' + esc(envio.ciudad) + ')</span></span>' +
      (ofs.length > 4 ? '<input class="co-campo co-filtro" data-campo="filtro" type="search" aria-label="Buscar oficina por nombre o calle" placeholder="Buscar por nombre o calle…" value="' + esc(filtro) + '">' : '') + '</div>' +
      (ofs.length ? '<div class="co-oficinas" id="co-oficina" role="radiogroup" aria-labelledby="co-t-oficina" data-zona="lista"></div>'
        : '<p class="co-nota">No hay oficinas Zoom con cobro a destino en esta ciudad. Prueba con otra cercana o escríbenos por WhatsApp.</p>') +
      '<p class="co-error" id="co-oficina-error" hidden></p>';
    pintarLista();
  }
  function pintarLista() {
    const lista = $('[data-zona="lista"]', raiz);
    if (!lista) return;
    const vs = visibles();
    lista.innerHTML = vs.map((o, i) => opcion('oficina', String(i), !!(envio.oficina && envio.oficina.nombre === o.nombre), esc(o.nombre),
      '<small>' + esc(o.direccion) + '</small>' + (o.telefono ? '<em>Tel: ' + esc(o.telefono) + '</em>' : ''))).join('') +
      (!vs.length ? '<p class="co-nota">Ninguna oficina coincide con “' + esc(filtro) + '”.</p>' : '');
  }

  // Los datos para pagar del método elegido. Lo que se copia lleva su botón: el correo y el monto (el número
  // solo; la moneda es una etiqueta aparte, fuera de lo que se copia).
  const copiable = (etq, valor) => '<div class="co-copiable"><div><p class="co-copiable-etq">' + etq + '</p><p class="co-copiable-val">' + esc(valor) + '</p></div>' +
    '<button type="button" class="co-copiar" data-accion="copiar" data-valor="' + esc(valor) + '" aria-label="Copiar ' + esc(valor) + '">Copiar</button></div>';
  const copiableMonto = (moneda) => '<div class="co-copiable co-monto"><div><p class="co-copiable-etq">Monto exacto</p>' +
    '<p class="co-copiable-val"><span data-monto>' + total().toFixed(2) + '</span><i class="co-moneda">' + moneda + '</i></p></div>' +
    '<button type="button" class="co-copiar" data-accion="copiar" data-copia="monto" aria-label="Copiar el monto">Copiar</button></div>';
  // Zelle por debajo del mínimo: bajo las tarjetas, la barra verde que se va llenando (relleno = total / mínimo)
  const barraZelle = () => '<div class="co-zelle-min">' +
    '<div class="co-barra" data-zelle="barra" role="progressbar" aria-label="Avance del pedido hacia el mínimo de Zelle" aria-valuemin="0" aria-valuemax="' + ZELLE_MINIMO + '"><span></span></div>' +
    '<p class="co-txt">Zelle se habilita en pedidos desde $' + ZELLE_MINIMO + '. Te faltan <b data-zelle="faltan"></b>.</p></div>';
  function moverBarraZelle() {
    const barra = $('[data-zelle="barra"]', raiz), txt = $('[data-zelle="faltan"]', raiz);
    if (!barra) return;
    const t = total();
    barra.setAttribute('aria-valuenow', t.toFixed(2));
    barra.setAttribute('aria-valuetext', usd(t) + ' de $' + ZELLE_MINIMO);
    barra.firstElementChild.style.width = Math.max(0, Math.min(100, t / ZELLE_MINIMO * 100)).toFixed(2) + '%';
    if (txt) txt.textContent = usd(ZELLE_MINIMO - t);
  }
  function pintarPago() {
    const bloq = zelleBloqueado();
    METODOS.forEach((k) => {
      const radio = $('input[name="metodo"][value="' + k + '"]', raiz);
      if (!radio) return;
      const tarjeta = radio.closest('.co-metodo');
      radio.disabled = k === 'zelle' && bloq;
      radio.checked = k === metodo;
      tarjeta.classList.toggle('off', radio.disabled);
      tarjeta.classList.toggle('sel', k === metodo);
    });
    const zm = $('[data-zona="zelle-min"]', raiz);
    if (zm) { if (!bloq) zm.innerHTML = ''; else { if (!$('[data-zelle="barra"]', zm)) zm.innerHTML = barraZelle(); moverBarraZelle(); } }
    const c = $('[data-zona="pago-cuerpo"]', raiz);
    if (!c) return;
    const k = metodo;
    if (k === 'zelle' && bloq) { c.innerHTML = ''; return; }
    c.innerHTML =
      copiable(DATOS[k].etq, DATOS[k].correo) +
      (DATOS[k].titular ? '<p class="co-txt co-titular">Titular: <b>' + DATOS[k].titular + '</b></p>' : '') +
      copiableMonto(PAGOS[k].moneda) +
      // la lista la numera el navegador: al copiar el texto no salen los números repetidos
      '<ol class="co-pasos-pago"><li>Envía el monto exacto con los datos de arriba.</li><li>Escribe abajo ' + PAGOS[k].paso + ' y pulsa “Finalizar compra”.</li>' +
        '<li>Despachamos tu pedido en 24 a 48 horas.</li><li>Te enviamos el número de guía por el medio de contacto que indicaste.</li></ol>' +
      '<label class="co-etq" for="co-referencia">' + PAGOS[k].ref + '</label>' +
      '<input class="co-campo" id="co-referencia" data-campo="referencia" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="P2P4X8K1M9Q2" aria-required="true" value="' + esc(referencia) + '">' +
      '<p class="co-error" id="co-referencia-error" hidden></p>';
  }
  // El mínimo de Zelle sigue al total, en vivo. Al quedar por debajo, Zelle se bloquea y, si era el método
  // elegido, pasa a Binance Pay (los datos y la dirección no se tocan). Al volver a llegar se desbloquea solo
  // y el método elegido no cambia.
  let zelleEstaba = null;                    // cómo quedó pintado (null: recién montado)
  function pintarZelle() {
    const bloq = zelleBloqueado();
    if (bloq === zelleEstaba) { if (bloq) moverBarraZelle(); return; }
    zelleEstaba = bloq;
    if (bloq && metodo === 'zelle') {
      elegirMetodo('binance');
      // con los tres pasos cerrados, «Pago» se abre para que se vea por qué cambió el método (la página no se mueve)
      if (abierto === null) { abierto = 'pago'; visto.pago = true; }
    }
    pintarPago();
  }

  // Los totales: subtotal · envío · la fila del kit (palomita verde, «?» e «Incluido») · descuento · total
  function pintarResumen() {
    const dl = $('[data-zona="totales"]', raiz);
    if (!dl) return;
    const d = C.descuentoPorCantidad ? C.descuentoPorCantidad() : null;
    const cambiado = totalSrv != null && firmaSrv === firma();
    dl.innerHTML =
      '<div><dt>Subtotal</dt><dd>' + usd(C.subtotalItems ? C.subtotalItems() : C.total()) + '</dd></div>' +
      '<div class="co-envio"><dt>Envío</dt><dd>Cobro a destino</dd></div>' +
      (kits() ? '<div class="co-kit"><dt><span class="co-kit-ok">' + OK + '</span><span>Kit de aplicación</span>' +
        '<button type="button" class="co-kit-ayuda" data-accion="kit" aria-label="Qué trae el kit de aplicación" aria-expanded="' + kitAbierto + '" aria-controls="co-kit-globo">?</button>' +
        '<span class="co-kit-globo" id="co-kit-globo" role="note"' + (kitAbierto ? '' : ' hidden') + '>' + KIT + '</span></dt><dd>Incluido</dd></div>' : '') +
      (d ? '<div class="co-dto"><dt>Descuento por cantidad (−' + d.pct + ' %)</dt><dd>−' + usd(d.monto) + '</dd></div>' : '') +
      '<div class="co-total"><dt>Total' + (cambiado ? ' <span class="co-opc">(actualizado)</span>' : '') + '</dt><dd>' + usd(total()) + '</dd></div>';
    const tm = $('[data-zona="total-movil"]', raiz); if (tm) tm.textContent = usd(total());
    // el mínimo de Zelle y el monto a pagar dentro del método elegido siguen al total
    pintarZelle();
    const m = $('[data-monto]', raiz); if (m) m.textContent = total().toFixed(2);
    pintarFalta();
  }
  function alternarKit(ver) {
    kitAbierto = ver;
    const b = $('[data-accion="kit"]', raiz), g = $('#co-kit-globo', raiz);
    if (b) b.setAttribute('aria-expanded', String(ver));
    if (g) g.hidden = !ver;
  }

  // Lo que se lee debajo de cada paso cerrado y completo: columnas con su etiqueta y, en gris, lo escrito
  const col = (etq, valores) => '<div class="co-col"><p class="co-col-etq">' + etq + '</p>' + valores.map((x) => String(x || '').trim()).filter(Boolean).map((x) => '<p>' + esc(x) + '</p>').join('') + '</div>';
  const RESUMEN = {
    datos: () => col('Nombre', [datos.nombre]) + col('Contacto', [datos.telefono, datos.correo]) + col('Cédula', [datos.cedula]),
    envio: () => col('Empresa de envío', ['Zoom · cobro a destino']) + col('Oficina', [envio.oficina.nombre, envio.oficina.direccion, envio.ciudad + ', ' + envio.estado]),
    pago: () => col('Método de pago', [PAGOS[metodo].nombre]) + col(PAGOS[metodo].ref, [referencia]),
  };
  // Los pasos del acordeón: cuál está abierto, cuáles completos y el resumen de los cerrados. Un paso cerrado
  // e incompleto dice lo que le falta (en gris; en rojo después de pulsar «Finalizar compra»), salvo que aún
  // no se haya abierto nunca: ahí solo se ve el número y el título.
  function pintarPasos(f) {
    PASOS.forEach((k) => {
      const sec = secDe(k);
      if (!sec) return;
      const pend = f.filter((x) => x.paso === k), ab = abierto === k;
      sec.classList.toggle('cerrado', !ab);
      sec.classList.toggle('hecho', !pend.length);
      $('.co-cab-btn', sec).setAttribute('aria-expanded', String(ab));
      $('.co-cuerpo', sec).toggleAttribute('inert', !ab);
      $('[data-hecho]', sec).hidden = pend.length > 0;
      const res = $('[data-res]', sec);
      // lo escribió el cliente: siempre por esc()
      const html = !pend.length ? '<div class="co-cols">' + RESUMEN[k]() + '</div>'
        : visto[k] || intento ? '<p class="co-paso-falta' + (intento ? ' co-alerta' : '') + '">' + esc((pend.length > 1 ? 'Faltan ' : 'Falta ') + enLista(pend.map((x) => x.texto))) + '</p>' : '';
      if (res.innerHTML !== html) res.innerHTML = html;
      sec.classList.toggle('con-res', !!html);
    });
  }

  function pintarFalta() {
    const p = $('[data-zona="falta"]', raiz);
    if (!p) return;
    const f = faltan();
    p.textContent = enviando ? '' : f.length ? 'Para finalizar falta ' + enLista(f.map((x) => x.texto)) + '.' : '';
    p.classList.toggle('co-alerta', intento && f.length > 0);
    // el acordeón: palomitas de los pasos completos y resumen de los cerrados
    pintarPasos(f);
    const de = (c) => f.find((x) => x.campo === c);
    const fuera = (id) => document.activeElement !== $('#co-' + id, raiz);
    // los avisos junto a cada campo solo después de intentar finalizar (o del dato a medio escribir)
    const marca = (id, msg) => {
      const el = $('#co-' + id, raiz), err = $('#co-' + id + '-error', raiz);
      if (el) { if (msg) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'co-' + id + '-error'); } else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); } }
      if (err) { err.textContent = msg || ''; err.hidden = !msg; }
    };
    marca('nombre', intento && de('nombre') ? 'Escribe tu nombre y apellido.' : '');
    marca('cedula', intento && !datos.cedula.trim() ? 'Escribe tu cédula de identidad.'
      : (intento && de('cedula')) || (datos.cedula.trim() && !cedulaValida() && fuera('cedula')) ? 'Escribe una cédula válida (de 6 a 9 dígitos).' : '');
    marca('telefono', intento && !datos.telefono.trim() ? 'Escribe tu teléfono de WhatsApp.'
      : (intento && de('telefono')) || (datos.telefono.trim() && !telefonoValido() && fuera('telefono')) ? 'Escribe el número completo (al menos 7 dígitos).' : '');
    marca('correo', '');
    marca('estado', intento && de('estado') ? 'Elige el estado.' : '');
    marca('ciudad', intento && de('ciudad') ? 'Elige la ciudad.' : '');
    marca('oficina', intento && de('oficina') ? 'Elige la oficina donde vas a retirar.' : '');
    marca('metodo', '');
    marca('referencia', intento && de('referencia') ? (referencia.trim() ? 'Escríbelo completo (al menos 6 caracteres).' : 'Escribe ' + PAGOS[metodo].falta + ' después de pagar.') : '');
    // lo que el servidor dijo de un campo se queda junto a él hasta que el cliente lo cambie
    if (errSrv) marca(errSrv.campo, errSrv.mensaje);
  }

  // La pantalla del pedido registrado (sustituye a todo el pago)
  function pintarExito() {
    const form = $('.co-form', raiz), lado = $('.co-lado', raiz);
    const num = pedido.numero ? String(pedido.numero) : '';
    const texto = 'Hola Peptidos Plus, hice el pedido' + (num ? ' n.º ' + num : '') + ' en la web.';
    form.innerHTML = '<div class="co-listo co-exito" role="status">' +
      '<span class="co-exito-ico">' + OK + '</span>' +
      '<h1 class="co-h1" tabindex="-1">Tu pedido está siendo procesado</h1>' +
      '<p class="co-txt">Te enviaremos el número de guía al WhatsApp que nos proporcionaste.</p>' +
      (num ? '<p class="co-exito-num">Pedido n.º ' + esc(num) + '</p>' : '') +
      '<div class="co-exito-ayuda"><p class="co-txt">¿Necesitas ayuda extra? Contacta con un asesor.</p>' +
        '<a class="co-btn co-btn-ws" href="https://api.whatsapp.com/send?phone=' + WA_NUMERO + '&text=' + encodeURIComponent(texto) + '" target="_blank" rel="noopener noreferrer" data-pp-ws-pedido>' + ICONO_WS + 'Contactar por WhatsApp</a>' +
        '<p class="co-ws-num"><a href="tel:+' + WA_NUMERO + '">' + WA_VISIBLE + '</a></p></div>' +
      '<a class="co-volver" href="/tienda">Volver a la tienda</a></div>';
    lado.innerHTML = ''; lado.hidden = true; $('.co', raiz).classList.add('co-solo');
  }

  function pintar() {
    const hay = items().length > 0;
    // con un pedido ya registrado, volver a llenar el carrito empieza OTRO pedido: orden nueva y sin la referencia usada
    if (pedido && hay) { pedido = null; olvidar(K_OK); orden.id = nuevaOrden(); }
    const form = $('.co-form', raiz), lado = $('.co-lado', raiz);
    if (pedido) { pantalla = 'exito'; if (!$('.co-exito', form)) pintarExito(); return; }
    pantalla = hay ? 'pedido' : 'vacio';
    if (pantalla === 'vacio') {
      form.innerHTML = '<div class="co-listo"><h1 class="co-h1">Tu carrito está vacío</h1><p class="co-txt">Agrega algún compuesto para hacer tu pedido.</p><a class="co-btn" href="/tienda">Ver el catálogo</a></div>';
      lado.innerHTML = ''; lado.hidden = true; $('.co', raiz).classList.add('co-solo');
      return;
    }
    if (!$('#co-s-datos', form)) { montar(); pintarSelects(); pintarOficinas(); }
    lado.hidden = false; $('.co', raiz).classList.remove('co-solo');
    pintarPedido();
    pintarResumen();                         // incluye el mínimo de Zelle (pintarZelle) y el acordeón (pintarFalta)
  }

  /* ---------- acordeón: abrir y cerrar pasos ---------- */
  // Trae un paso a la vista si quedó tapado por la cabecera fija del sitio o por debajo de la pantalla
  // (alInicio: siempre arriba del todo). Espera a que termine el pliegue: mientras dura, todo se está moviendo.
  let tTraer = 0;
  function traer(k, alInicio) {
    clearTimeout(tTraer);
    tTraer = setTimeout(() => {
      const sec = secDe(k);
      if (!sec) return;
      const cab = document.querySelector('header[data-pp-cromo]');
      const arriba = (cab ? Math.max(0, cab.getBoundingClientRect().bottom) : 64) + 12;
      const r = sec.getBoundingClientRect();
      let dy = 0;
      if (alInicio || r.top < arriba) dy = r.top - arriba;
      else if (r.bottom > innerHeight - 12) dy = Math.min(r.top - arriba, r.bottom - innerHeight + 12);
      if (Math.abs(dy) > 4) scrollBy({ top: dy, behavior: suave() ? 'smooth' : 'auto' });
    }, suave() ? PLIEGUE_MS + 40 : 0);
  }
  function abrirPaso(k, alInicio) {
    abierto = k;
    visto[k] = true;
    pintarFalta();
    traer(k, alInicio);
  }
  // Al cerrarse un paso se abre el primer incompleto que le sigue (si detrás no queda ninguno, el primero que
  // falte; «Pago» si aún no se abrió nunca). Con todo completo quedan los tres cerrados, cada uno con su resumen.
  //   solo: se cierra sin abrir otro · foco: el foco estaba dentro y pasa a la cabecera del paso que se abre
  //   (o a la suya), porque un paso plegado no puede tenerlo · quieto: sin mover la página
  function cerrarPaso(k, opc) {
    if (abierto !== k) return;
    opc = opc || {};
    const i = PASOS.indexOf(k);
    const sig = opc.solo ? null : PASOS.slice(i + 1).concat(PASOS.slice(0, i)).find((p) => !hechoPaso(p)) || (visto.pago ? null : 'pago');
    abierto = sig || null;
    if (sig) visto[sig] = true;
    pintarFalta();
    if (opc.foco) { const b = $('.co-cab-btn', secDe(sig || k)); if (b) b.focus({ preventScroll: true }); }
    if (!opc.quieto) traer(sig || k);
  }
  // Abre el paso de un dato, lo trae a la vista y le da el foco
  function llevarA(paso, cual) {
    abrirPaso(paso, true);
    const el = cual === 'oficina' ? ($('#co-oficina .co-radio', raiz) || $('#co-ciudad', raiz))
      : cual === 'metodo' ? ($('input[name="metodo"]:checked:not(:disabled)', raiz) || $('input[name="metodo"]:not(:disabled)', raiz)) : $('#co-' + cual, raiz);
    if (el) el.focus({ preventScroll: true });
  }

  /* Un paso completo se cierra cuando el cliente sale de él. La decisión se toma cuando el toque que sacó el
   * foco YA terminó: si el paso se plegara en el mismo focusout, la página cambiaría de alto entre el mousedown
   * y el click de ese toque, y el clic caería en otro elemento o se perdería. */
  let enClic = false, dondeClic = null, salida = null, tClic = 0;
  function revisarSalida() {
    if (enClic || !salida) return;
    const s = salida, sec = secDe(s.paso);
    salida = null;
    if (!sec || abierto !== s.paso || !hechoPaso(s.paso)) return;
    if (sec.contains(document.activeElement)) return;      // el foco sigue dentro (se cambió de ventana) o volvió
    if (s.clic && sec.contains(s.clic)) return;            // pulsó un hueco del propio paso
    // si pulsó fuera de los pasos (el resumen, la cabecera del sitio) la página no se mueve bajo su dedo
    cerrarPaso(s.paso, { quieto: !!s.clic && !$('.co-form', raiz).contains(s.clic) });
  }
  const finClic = () => { enClic = false; revisarSalida(); };
  const trasToque = (ev, ms) => document.addEventListener(ev, () => { clearTimeout(tClic); tClic = setTimeout(finClic, ms); }, true);
  // el toque empieza al apoyar el dedo o el ratón (el foco cambia en el mousedown, que en táctil llega tras soltar)…
  ['pointerdown', 'mousedown'].forEach((ev) => document.addEventListener(ev, (e) => { clearTimeout(tClic); enClic = true; dondeClic = e.target; }, true));
  // …y termina con el click, que llega justo después de soltar; si no llega (se arrastró, se desplazó la página
  // o salió el menú contextual), termina igual un momento después
  trasToque('click', 0); trasToque('mouseup', 80); trasToque('pointerup', 400); trasToque('pointercancel', 400); trasToque('dragend', 0); trasToque('contextmenu', 0);
  // En el teléfono, cerrar el teclado sin tocar nada más (el «atrás» de Android) no le quita el foco al campo:
  // si la pantalla visible crece de golpe con el foco en un campo de texto del paso, cuenta como salir de él.
  // Solo en pantallas táctiles (en un escritorio eso es alguien agrandando la ventana).
  if (window.visualViewport && navigator.maxTouchPoints > 0) {
    let vv = { w: visualViewport.width, h: visualViewport.height };
    visualViewport.addEventListener('resize', () => {
      const crece = visualViewport.height - vv.h, mismoAncho = Math.abs(visualViewport.width - vv.w) < 2;
      vv = { w: visualViewport.width, h: visualViewport.height };
      const a = document.activeElement, sec = abierto && abierto !== 'pago' ? secDe(abierto) : null;
      if (crece < 150 || !mismoAncho || !sec || !a || !sec.contains(a)) return;
      if (a.matches('input:not([type="radio"]), textarea') && hechoPaso(abierto)) cerrarPaso(abierto, { foco: true });
    });
  }

  /* ---------- finalizar: el pedido se guarda en el servidor (POST /api/pedido) ---------- */
  // El pedido completo por WhatsApp: el respaldo cuando no se pudo registrar
  function mensajeWhatsApp() {
    const lineasTxt = items().map((i) => '• ' + i.nombre + (i.dosis ? ' (' + i.dosis.toUpperCase() + ')' : '') + ' ×' + i.cant + ' = ' + usd(C.subtotalLinea(i.precio, i.cant))).join('\n');
    const d = C.descuentoPorCantidad ? C.descuentoPorCantidad() : null;
    return [
      'Hola Peptidos Plus, quiero hacer este pedido:',
      '',
      '*Orden:* ' + orden.id,
      '*Nombre:* ' + datos.nombre.trim(),
      '*Cédula:* ' + datos.cedula.trim(),
      '*WhatsApp:* ' + datos.telefono.trim(),
      (datos.correo.trim() ? '*Correo:* ' + datos.correo.trim() : null),
      (datos.notas.trim() ? '*Notas:* ' + datos.notas.trim() : null),
      '',
      '*Productos:*',
      lineasTxt,
      (kits() ? '• Kit de aplicación ×' + kits() + ' = incluido' : null),
      (d ? 'Descuento por cantidad (−' + d.pct + ' %): −' + usd(d.monto) : null),
      '*Total: ' + usd(total()) + '*',
      '',
      '*Pago:* ' + PAGOS[metodo].nombre + ' · ' + PAGOS[metodo].ref.toLowerCase() + ' ' + referencia.trim(),
      '*Envío:* Zoom (cobro a destino) — ' + envio.oficina.nombre + ', ' + envio.ciudad + ', ' + envio.estado,
    ].filter((x) => x !== null).join('\n');
  }
  // Lo que viaja al servidor. Los precios NO van: el servidor los pone; totalVisto es lo que vio el cliente.
  const cargaPedido = () => ({
    orden: orden.id,
    items: items().map((i) => ({ id: i.id, nombre: i.nombre, dosis: i.dosis || '', cant: i.cant })),
    datos: { nombre: datos.nombre.trim(), cedula: cedulaLimpia(), telefono: datos.telefono.trim(), correo: datos.correo.trim(), notas: datos.notas.trim() },
    envio: { transporte: 'zoom', estado: envio.estado, ciudad: envio.ciudad, oficina: { nombre: envio.oficina.nombre, direccion: envio.oficina.direccion || '', telefono: envio.oficina.telefono || '' } },
    pago: { metodo: metodo, referencia: referencia.trim() },
    totalVisto: total(),
  });
  const aviso = (titulo, texto, extra) => '<div class="co-aviso" role="alert"><span class="co-aviso-ico">' + ALERTA + '</span>' +
    '<p>' + (titulo ? '<b>' + esc(titulo) + '</b>' : '') + esc(texto) + '</p>' + (extra || '') + '</div>';
  const mostrar = (html) => { const res = $('[data-zona="resultado"]', raiz); if (res) { res.innerHTML = html; if (html) res.scrollIntoView({ behavior: 'auto', block: 'nearest' }); } };

  function finalizar() {
    if (enviando || pedido) return;
    const f = faltan();
    if (f.length) {
      intento = true;
      mostrar('');
      // abre el paso del primer dato que falta, lo trae a la vista y le da el foco
      llevarA(f[0].paso, f[0].campo);
      return;
    }
    enviando = true;
    errSrv = null;
    const btn = $('.co-finalizar', raiz);
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="co-girando" aria-hidden="true"></span>Procesando tu pedido…';
    mostrar('');
    pintarFalta();
    const ctl = 'AbortController' in window ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), ESPERA_MAX_MS) : 0;
    fetch(API_PEDIDO, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(cargaPedido()), signal: ctl ? ctl.signal : undefined })
      .then((r) => r.json().then((j) => ({ st: r.status, j: j }), () => ({ st: r.status, j: null })))
      .catch(() => ({ st: 0, j: null }))
      .then((x) => {
        clearTimeout(t);
        enviando = false;
        const j = x.j && typeof x.j === 'object' ? x.j : null;
        if (j && j.ok === true && (x.st === 200 || x.st === 201)) { exito(j); return; }
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.textContent = 'Finalizar compra';
        // el servidor respondió con un error suyo: su mensaje. Sin conexión, 404 o 5xx: el respaldo por WhatsApp.
        if (j && j.ok === false && j.mensaje && x.st >= 400 && x.st < 500 && x.st !== 404 && j.codigo !== 'servidor') errorDelServidor(j);
        else respaldo();
      });
  }

  function exito(j) {
    pedido = { numero: j.numero != null ? String(j.numero) : '', total: typeof j.total === 'number' ? j.total : total(), simulado: !!j.simulado };
    anotar(K_OK, pedido);
    olvidar(K_ORDEN);
    // la referencia ya se usó: no se arrastra a un pedido siguiente
    referencia = ''; refs.zelle = ''; refs.binance = ''; intento = false; errSrv = null; totalSrv = null; abierto = 'datos';
    C.vaciar();                              // avisa con pp:carrito → pintar() → la pantalla del pedido
    pintar();
    const h = $('.co-exito .co-h1', raiz);
    scrollTo({ top: 0, behavior: 'auto' });
    if (h) h.focus({ preventScroll: true });
  }

  // codigo → dónde se corrige: [paso, campo]
  const CAMPO_SRV = { nombre: ['datos', 'nombre'], cedula: ['datos', 'cedula'], telefono: ['datos', 'telefono'], correo: ['datos', 'correo'], envio: ['envio', 'estado'], pago: ['pago', 'metodo'], zelle: ['pago', 'metodo'], referencia: ['pago', 'referencia'] };
  const DEL_CARRITO = ['agotado', 'vacio', 'cantidad', 'producto', 'presentacion'];
  function errorDelServidor(j) {
    const cod = String(j.codigo || ''), ex = j.extra && typeof j.extra === 'object' ? j.extra : {};
    const editar = '<button type="button" class="co-btn co-btn-sec" data-accion="carrito">Editar el carrito</button>';
    if (cod === 'total' && typeof ex.total === 'number' && isFinite(ex.total)) {
      // el total cambió: se repintan los montos con el del servidor y se pide confirmar de nuevo
      totalSrv = Math.round(ex.total * 100) / 100; firmaSrv = firma();
      pintarResumen();
      mostrar(aviso('', j.mensaje, '<p class="co-aviso-nota">El total actualizado es <b>' + usd(totalSrv) + '</b>. Revísalo y pulsa “Finalizar compra” para confirmarlo.</p>'));
      return;
    }
    if (DEL_CARRITO.indexOf(cod) >= 0) {
      // qué producto: si el servidor lo nombra aparte y su mensaje no lo dice, se añade
      const nombres = [].concat(ex.nombre || ex.producto || [], Array.isArray(ex.items) ? ex.items.map((i) => i && i.nombre) : []).filter((n) => typeof n === 'string' && n && j.mensaje.indexOf(n) < 0);
      mostrar(aviso('', j.mensaje + (nombres.length ? ' (' + nombres.join(', ') + ')' : ''), editar));
      return;
    }
    mostrar(aviso('', j.mensaje));
    const donde = CAMPO_SRV[cod];
    if (donde) {
      const cual = cod === 'envio' ? (envio.oficina ? 'oficina' : envio.ciudad ? 'oficina' : envio.estado ? 'ciudad' : 'estado') : donde[1];
      errSrv = { campo: cual, mensaje: j.mensaje };
      llevarA(donde[0], cual);
    }
  }
  function respaldo() {
    mostrar(aviso('No pudimos registrar tu pedido.', 'Inténtalo de nuevo o envíanoslo por WhatsApp.',
      '<button type="button" class="co-btn co-btn-sec" data-accion="reintentar">Reintentar</button>' +
      '<a class="co-btn co-btn-ws" href="https://api.whatsapp.com/send?phone=' + WA_NUMERO + '&text=' + encodeURIComponent(mensajeWhatsApp()) + '" target="_blank" rel="noopener noreferrer" data-pp-ws-error aria-label="Enviar el pedido por WhatsApp">' + ICONO_WS + 'Enviar por WhatsApp</a>' +
      '<p class="co-ws-num"><a href="tel:+' + WA_NUMERO + '">' + WA_VISIBLE + '</a></p>'));
    pintarFalta();
  }

  /* ---------- eventos (delegados) ---------- */
  raiz.addEventListener('input', (e) => {
    const c = e.target.dataset && e.target.dataset.campo; if (!c) return;
    if (c in datos) { datos[c] = e.target.value; errSrv = null; pintarFalta(); }
    else if (c === 'referencia') { referencia = e.target.value; errSrv = null; pintarFalta(); }
    else if (c === 'filtro') { filtro = e.target.value; pintarLista(); }
  });
  raiz.addEventListener('focusout', (e) => {
    if (e.target.id === 'co-telefono' || e.target.id === 'co-cedula') pintarFalta();
    // el foco sale del paso abierto (no cuenta pasar de un campo a otro del mismo paso; el de pago no se cierra
    // solo): se anota y se decide cuando el toque termine (revisarSalida)
    const sec = e.target.closest ? e.target.closest('.co-sec') : null;
    if (!sec || sec.dataset.paso !== abierto || abierto === 'pago' || (e.relatedTarget && sec.contains(e.relatedTarget))) return;
    salida = { paso: abierto, clic: enClic ? dondeClic : null };
    if (!enClic) setTimeout(revisarSalida, 0);
  });
  let conFlechas = false;                    // la oficina cambió con las flechas del teclado, no con un toque
  raiz.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.name === 'oficina' && /^Arrow/.test(e.key)) { conFlechas = true; setTimeout(() => { conFlechas = false; }, 0); return; }
    if (e.key !== 'Enter' || e.isComposing) return;
    // Enter en un campo de una línea de «Tus datos»: con el paso completo lo cierra; si no, lleva al dato que falta
    if (abierto === 'datos' && t.tagName === 'INPUT' && t.dataset.campo in datos) {
      e.preventDefault();
      if (hechoPaso('datos')) { cerrarPaso('datos', { foco: true }); return; }
      const el = $('#co-' + faltan()[0].campo, raiz);
      if (el && el !== t) el.focus();
    } else if (abierto === 'envio' && t.name === 'oficina' && envio.oficina) { e.preventDefault(); cerrarPaso('envio', { foco: true }); }
  });
  raiz.addEventListener('change', (e) => {
    const t = e.target;
    const c = t.dataset && t.dataset.campo;
    if (c === 'estado') { envio.estado = t.value; envio.ciudad = ''; envio.oficina = null; filtro = ''; errSrv = null; pintarCiudades(); pintarOficinas(); pintarFalta(); }
    else if (c === 'ciudad') { envio.ciudad = t.value; envio.oficina = null; filtro = ''; errSrv = null; pintarOficinas(); pintarFalta(); }
    else if (t.name === 'oficina') { envio.oficina = visibles()[Number(t.value)] || null; errSrv = null; pintarFalta(); }
    else if (t.name === 'metodo') { if (!(t.value === 'zelle' && zelleBloqueado())) elegirMetodo(t.value); errSrv = null; pintarPago(); pintarFalta(); }
    else if (t.name === 'transporte') { envio.transporte = t.value; }
  });
  raiz.addEventListener('click', (e) => {
    // Elegir la oficina cierra el paso (es una elección, no texto); también al tocar la que ya estaba elegida.
    // Con las flechas del teclado se va pasando de una a otra: ahí se cierra con Enter o al salir del paso.
    // Se decide después del «change» de este mismo clic, que es el que anota la oficina.
    if (e.target.name === 'oficina') {
      const flechas = conFlechas;
      setTimeout(() => { if (!flechas && abierto === 'envio' && envio.oficina) cerrarPaso('envio', { foco: true }); }, 0);
      return;
    }
    const b = e.target.closest('[data-accion]'); if (!b || b.disabled) return;
    const a = b.dataset.accion;
    if (a === 'finalizar' || a === 'reintentar') { finalizar(); return; }
    // la cabecera de un paso lo abre (y cierra el que estaba); pulsada en el paso abierto, lo cierra
    if (a === 'paso') { const k = b.dataset.paso; if (abierto === k) cerrarPaso(k, { solo: !hechoPaso(k) }); else abrirPaso(k); return; }
    // «Editar» del resumen: el pedido se cambia en el panel lateral del carrito (lo que cambie allí llega por pp:carrito)
    if (a === 'carrito') { if (C.abrir) C.abrir(); return; }
    if (a === 'kit') { alternarKit(!kitAbierto); return; }
    if (a === 'copiar') {
      // el monto se copia como número solo («284.97»), sin el signo ni la moneda
      const valor = b.dataset.copia === 'monto' ? total().toFixed(2) : b.dataset.valor;
      const listo = () => { b.textContent = 'Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 1600); };
      try { navigator.clipboard.writeText(valor).then(listo, listo); } catch (x) { listo(); }
    }
  });
  // el globo del kit se cierra al pulsar fuera o con Escape
  document.addEventListener('click', (e) => { if (kitAbierto && !(e.target.closest && e.target.closest('.co-kit'))) alternarKit(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && kitAbierto) { alternarKit(false); const b = $('[data-accion="kit"]', raiz); if (b) b.focus(); } });
  // El carrito lateral también se puede abrir aquí (icono de la cabecera, «Editar»): lo que cambie allí se refleja
  document.addEventListener('pp:carrito', () => pintar());

  fetch('/assets/datos/zoom-oficinas.json').then((r) => r.json()).then((j) => { OFICINAS = Array.isArray(j) ? j : []; }).catch(() => { OFICINAS = []; })
    .then(() => { oficinasListas = true; if (pantalla === 'pedido') { pintarSelects(); pintarOficinas(); pintarFalta(); } });

  // La columna derecha va fija al bajar. Si es más alta que la pantalla (varios productos, o un aviso bajo el
  // botón), se pega por abajo: baja con la página hasta que se ve el botón y ahí se queda.
  const lado = $('.co-lado', raiz);
  const ajustarPegado = () => {
    if (!lado) return;
    if (innerWidth <= 960) { lado.style.top = ''; return; }
    lado.style.top = Math.min(84, innerHeight - lado.offsetHeight - 16) + 'px';
  };
  if (lado && 'ResizeObserver' in window) new ResizeObserver(ajustarPegado).observe(lado);
  addEventListener('resize', ajustarPegado);

  window.ppCheckout = {
    estado: () => ({ pantalla, metodo, datos, envio, orden, referencia, enviando, verificando: enviando, pedido, total: total(), faltan: faltan().map((x) => x.campo), paso: abierto, vistos: PASOS.filter((k) => visto[k]), zelleBloqueado: zelleBloqueado(), zelleMinimo: ZELLE_MINIMO }),
    carga: () => (faltan().length ? null : cargaPedido()),
    pedidos: () => (pedido ? [pedido] : []),
  };
  pintar();
})();
