/* Pago en una sola página (Peptidos Plus).
 *
 * 2026-09-29, Angel:
 *  · «Quiero que todo esté en la misma página para que las personas no tengan que dar constantemente a
 *    continuar»: se ve todo de una vez, sin pasos que se abren y cierran.
 *  · Disposición de su captura de referencia: a la izquierda una tarjeta con los pasos numerados
 *    (1 Tus datos · 2 Envío · 3 Pago), cada uno con su palomita verde cuando está completo; a la derecha el
 *    resumen con los productos (cantidades editables), el kit de aplicación como extra ANTES del total, y
 *    debajo el botón «Finalizar compra». En el teléfono: resumen, pasos y botón.
 *  · «El carrito debe semi funcionar por ahora»: los métodos de pago llevan los datos reales (los mismos
 *    textos que el pago de peptidosplus.com, output/aminoclub.com/site/checkout.js); al pulsar «Finalizar
 *    compra» con la referencia escrita sale un «cargando» 5 s y luego «No pudimos verificar tu pago…» con
 *    el botón de WhatsApp (el pedido ya escrito) y el número debajo. El carrito NO se vacía: la venta se
 *    cierra por WhatsApp.
 *
 * Solo se repinta la parte que cambia; los campos que el cliente está escribiendo no se tocan.
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
  const ESPERA_MS = 5000;                    // «un icono como cargando por 5 s»
  const PAGOS = {
    zelle: { nombre: 'Zelle', moneda: 'USD', nota: 'Verificación manual, en minutos', ref: 'Número de confirmación', falta: 'el número de confirmación de Zelle' },
    binance: { nombre: 'Binance Pay', moneda: 'USDT', nota: 'Confirmación rápida', ref: 'ID de la orden de Binance', falta: 'el ID de la orden de Binance' },
    movil: { nombre: 'Pago Móvil', moneda: 'Bs', nota: 'No disponible por el momento', off: true },
  };
  // Datos de cobro reales (dueño, 2026-09-16), los mismos de peptidosplus.com. Pago Móvil: no disponible.
  const DATOS = {
    zelle: { correo: 'cjob610@gmail.com', titular: 'Comercializadora Job LLC' },
    binance: { correo: 'pagospeptidosplus@gmail.com' },
  };
  const KIT = 'Agua bacteriostática de 3 ml, 10 jeringas y 10 toallitas con alcohol, uno por cada péptido.';
  const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="10.6" y="4" width="2.8" height="16" rx="1.2" fill="currentColor"/><rect x="4" y="10.6" width="16" height="2.8" rx="1.2" fill="currentColor"/></svg>';
  const HECHO = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="currentColor"/><path d="M5.8 10.3l2.7 2.7 5.7-5.9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ALERTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>';
  const ICONO_WS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  /* ---------- estado ---------- */
  let pantalla = 'pedido';                   // pedido | vacio
  let metodo = 'zelle';
  const datos = { nombre: '', telefono: '', correo: '', notas: '' };
  const envio = { transporte: 'zoom', estado: '', ciudad: '', oficina: null };
  const orden = { id: 'ORD-' + String(Math.floor(100000 + Math.random() * 899999)) };
  let referencia = '';
  let filtro = '';
  let intento = false;                       // ya pulsó «Finalizar compra» con algo pendiente: se marcan los campos
  let verificando = false;
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

  const telefonoValido = () => datos.telefono.replace(/\D/g, '').length >= 7;
  const referenciaValida = () => referencia.trim().length >= 6;
  const items = () => C.items();
  const total = () => C.total();
  const kits = () => (C.unidadesPeptidos ? C.unidadesPeptidos() : items().filter((i) => C.esPeptidoNombre(i.nombre)).reduce((s, i) => s + i.cant, 0));
  const clave = (i) => i.id + '|' + (i.dosis || '');
  const buscar = (k) => items().find((i) => clave(i) === k);

  // Lo que falta para poder finalizar, en el orden de la página
  function faltan() {
    const f = [];
    if (!datos.nombre.trim()) f.push({ campo: 'nombre', texto: 'tu nombre' });
    if (!datos.telefono.trim()) f.push({ campo: 'telefono', texto: 'tu teléfono' });
    else if (!telefonoValido()) f.push({ campo: 'telefono', texto: 'un teléfono completo' });
    if (!envio.estado) f.push({ campo: 'estado', texto: 'el estado' });
    else if (!envio.ciudad) f.push({ campo: 'ciudad', texto: 'la ciudad' });
    else if (!envio.oficina) f.push({ campo: 'oficina', texto: 'la oficina donde retiras' });
    if (!referenciaValida()) f.push({ campo: 'referencia', texto: PAGOS[metodo].falta });
    return f;
  }
  const enLista = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);

  /* ---------- esqueleto (se monta una vez) ---------- */
  const campo = (etq, nombre, extra) => {
    extra = extra || {};
    const id = 'co-' + nombre;
    return '<label class="co-etq" for="' + id + '">' + etq + '</label>' + (extra.area
      ? '<textarea class="co-campo" id="' + id + '" data-campo="' + nombre + '" placeholder="' + esc(extra.ph || '') + '"></textarea>'
      : '<input class="co-campo" id="' + id + '" data-campo="' + nombre + '" type="' + (extra.tipo || 'text') + '"' + (extra.auto ? ' autocomplete="' + extra.auto + '"' : '') + (extra.modo ? ' inputmode="' + extra.modo + '"' : '') + ' placeholder="' + esc(extra.ph || '') + '"' + (extra.req ? ' aria-required="true"' : '') + '>') +
      '<p class="co-error" id="' + id + '-error" hidden></p>';
  };
  const opcion = (grupo, valor, marcado, titulo, detalle, fin, apagada) =>
    '<label class="co-opcion' + (apagada ? ' off' : '') + '"><input type="radio" class="co-radio" name="' + grupo + '" value="' + esc(valor) + '"' + (marcado ? ' checked' : '') + (apagada ? ' disabled' : '') + '>' +
    '<span class="co-palomita" aria-hidden="true"></span><span class="co-opcion-txt"><b>' + titulo + '</b>' + (detalle || '') + '</span>' + (fin || '') + '</label>';
  const cabeza = (n, id, titulo, clave) => '<h2 class="co-h2" id="' + id + '"><span class="co-paso" aria-hidden="true">' + n + '</span>' + titulo +
    '<span class="co-hecho" data-hecho="' + clave + '" hidden>' + HECHO + '<span class="co-sr">(completo)</span></span></h2>';

  function montar() {
    const form = $('.co-form', raiz);
    form.innerHTML =
      '<section class="co-sec" id="co-s-datos" aria-labelledby="co-t-datos">' + cabeza(1, 'co-t-datos', 'Tus datos', 'datos') +
        '<div class="co-campos">' +
          '<div>' + campo('Nombre y apellido', 'nombre', { auto: 'name', req: true }) + '</div>' +
          '<div>' + campo('Teléfono (WhatsApp)', 'telefono', { tipo: 'tel', auto: 'tel', modo: 'tel', ph: '0412-000.00.00', req: true }) + '</div>' +
          '<div class="co-ancho">' + campo('Correo electrónico <span class="co-opc">(opcional)</span>', 'correo', { tipo: 'email', auto: 'email' }) + '</div>' +
          '<div class="co-ancho">' + campo('Notas del pedido <span class="co-opc">(opcional)</span>', 'notas', { area: true, ph: 'Algo que debamos saber del despacho' }) + '</div>' +
        '</div></section>' +
      '<section class="co-sec" id="co-s-envio" aria-labelledby="co-t-envio">' + cabeza(2, 'co-t-envio', 'Envío', 'envio') +
        '<p class="co-sub">Despachamos solo a oficinas de Zoom o MRW, no a domicilios. El envío es con cobro a destino.</p>' +
        '<fieldset class="co-grupo"><legend class="co-etq">Empresa de envío</legend><div class="co-transportes">' +
          opcion('transporte', 'zoom', true, 'Zoom', '<small>370 oficinas · cobro a destino</small>') +
          opcion('transporte', 'mrw', false, 'MRW', '<small>No disponible por el momento</small>', '', true) +
        '</div></fieldset>' +
        '<div class="co-campos">' +
          '<div><label class="co-etq" for="co-estado">Estado</label><select class="co-campo" id="co-estado" data-campo="estado" aria-required="true"><option value="">Cargando oficinas…</option></select><p class="co-error" id="co-estado-error" hidden></p></div>' +
          '<div><label class="co-etq" for="co-ciudad">Ciudad</label><select class="co-campo" id="co-ciudad" data-campo="ciudad" aria-required="true" disabled><option value="">Elige primero el estado</option></select><p class="co-error" id="co-ciudad-error" hidden></p></div>' +
        '</div>' +
        '<div data-zona="oficinas"></div>' +
      '</section>' +
      '<section class="co-sec" id="co-s-pago" aria-labelledby="co-t-pago">' + cabeza(3, 'co-t-pago', 'Pago', 'pago') +
        '<p class="co-sub">Elige cómo prefieres pagar tu pedido.</p>' +
        '<div class="co-metodos" role="radiogroup" aria-labelledby="co-t-pago">' +
          Object.keys(PAGOS).map((k) => '<div class="co-metodo' + (PAGOS[k].off ? ' off' : '') + '">' +
            opcion('metodo', k, metodo === k, PAGOS[k].nombre, '<small>' + PAGOS[k].nota + '</small>', '<i class="co-moneda">' + PAGOS[k].moneda + '</i>', PAGOS[k].off) +
            '<div class="co-metodo-cuerpo" data-cuerpo="' + k + '"></div></div>').join('') +
        '</div>' +
      '</section>';
    // si el carrito se vació y se volvió a llenar sin salir de la página, lo escrito sigue ahí
    Object.keys(datos).forEach((k) => { const el = $('#co-' + k, form); if (el) el.value = datos[k]; });

    const lado = $('.co-lado', raiz);
    lado.innerHTML =
      '<section class="co-resumen" aria-labelledby="co-t-resumen">' +
        '<div class="co-resumen-cab"><h2 class="co-h2" id="co-t-resumen">Resumen del pedido</h2><span class="co-cuenta"><span data-zona="cuenta"></span><a href="/tienda">Agregar más</a></span></div>' +
        '<div data-zona="pedido"></div>' +
        '<dl class="co-totales" data-zona="totales"></dl>' +
        '<p class="co-orden"><span>Orden</span><span>' + esc(orden.id) + '</span></p>' +
      '</section>' +
      '<div class="co-accion">' +
        '<p class="co-accion-total"><span>Total</span><b data-zona="total-movil"></b></p>' +
        '<button type="button" class="co-btn co-finalizar" data-accion="finalizar">Finalizar compra</button>' +
        '<p class="co-falta" data-zona="falta" aria-live="polite"></p>' +
        '<div data-zona="resultado"></div>' +
      '</div>';
  }

  /* ---------- partes que se repintan ---------- */
  function pintarPedido() {
    const zona = $('[data-zona="pedido"]', raiz);
    if (!zona) return;
    // si el foco estaba en un botón del pedido, vuelve al mismo después de repintar
    const a = document.activeElement;
    const foco = a && zona.contains(a) && a.dataset ? { accion: a.dataset.accion, k: a.dataset.k } : null;
    const n = kits();
    const d = C.descuentoPorCantidad ? C.descuentoPorCantidad() : null;
    const sig = C.siguientePeldano ? C.siguientePeldano() : null;
    const u = items().reduce((s, i) => s + i.cant, 0);
    const cuenta = $('[data-zona="cuenta"]', raiz);
    if (cuenta) cuenta.textContent = u + (u === 1 ? ' producto' : ' productos');
    zona.innerHTML = '<ul class="co-items">' +
      items().map((i) => {
        const k = esc(clave(i)), ficha = esc(C.fichaDe(i));
        return '<li class="co-item">' +
          '<a class="co-mini" href="' + ficha + '" tabindex="-1" aria-hidden="true"><img src="' + esc(C.miniatura(i.img)) + '" alt="" width="56" height="56" loading="lazy"></a>' +
          '<a class="co-item-nom" href="' + ficha + '">' + esc(i.nombre) + '</a>' +
          '<span class="co-item-det">' + esc((i.dosis || '').toUpperCase()) + (i.dosis ? ' · ' : '') + usd(i.precio) + ' c/u</span>' +
          '<b class="co-precio">' + usd(C.subtotalLinea(i.precio, i.cant)) + '</b>' +
          '<span class="co-item-acc"><span class="co-cant" role="group" aria-label="Cantidad de ' + esc(i.nombre) + '">' +
            '<button type="button" data-accion="menos" data-k="' + k + '" aria-label="Quitar uno"' + (i.cant <= 1 ? ' disabled' : '') + '>−</button>' +
            '<span>' + i.cant + '</span>' +
            '<button type="button" data-accion="mas" data-k="' + k + '" aria-label="Agregar uno">+</button></span>' +
          '<button type="button" class="co-quitar" data-accion="quitar" data-k="' + k + '" aria-label="Quitar ' + esc(i.nombre) + ' del pedido">Quitar</button></span>' +
        '</li>';
      }).join('') +
      // El kit de aplicación, como extra y antes del total: el «+» de la marca en un cuadrado de esquinas redondeadas
      (n ? '<li class="co-item co-extra"><span class="co-plus">' + PLUS + '</span>' +
        '<b class="co-item-nom">Kit de aplicación' + (n > 1 ? ' × ' + n : '') + '</b><span class="co-item-det">' + KIT + '</span>' +
        '<b class="co-incluido">Incluido</b></li>' : '') +
      '</ul>' +
      (sig && sig.pct > (d ? d.pct : 0) ? '<p class="co-peldano">Lleva ' + sig.faltan + (sig.faltan === 1 ? ' péptido más' : ' péptidos más') + ' y el descuento sube a <b>' + sig.pct + ' %</b>.</p>' : '');
    if (foco && foco.accion) {
      const b = $('[data-accion="' + foco.accion + '"][data-k="' + CSS.escape(foco.k || '') + '"]', zona);
      if (b && !b.disabled) b.focus();
      else { const otro = $('[data-accion]', zona); if (otro) otro.focus(); }
    }
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

  // Los datos para pagar del método elegido (mismos textos que el pago de peptidosplus.com)
  const copiable = (etq, valor) => '<div class="co-copiable"><div><p class="co-copiable-etq">' + etq + '</p><p class="co-copiable-val">' + esc(valor) + '</p></div>' +
    '<button type="button" class="co-copiar" data-accion="copiar" data-valor="' + esc(valor) + '" aria-label="Copiar ' + esc(valor) + '">Copiar</button></div>';
  function pintarPago() {
    Object.keys(PAGOS).forEach((k) => {
      const c = $('[data-cuerpo="' + k + '"]', raiz);
      if (!c) return;
      if (k !== metodo || PAGOS[k].off) { c.innerHTML = ''; return; }
      c.innerHTML =
        (k === 'zelle'
          ? copiable('Enviar al correo', DATOS.zelle.correo) + '<p class="co-txt">Titular: <b>' + DATOS.zelle.titular + '</b> · Monto exacto: <b data-monto="usd">' + usd(total()) + '</b></p>'
          : copiable('Enviar por Binance Pay al correo', DATOS.binance.correo) + '<p class="co-txt">Monto: <b data-monto="usdt">' + total().toFixed(2) + ' USDT</b></p>') +
        '<ol class="co-pasos-pago"><li>1. Envía el monto exacto con los datos de arriba.</li><li>2. Escribe abajo la referencia y pulsa “Finalizar compra”.</li><li>3. Un asesor confirma tu pago por WhatsApp.</li></ol>' +
        '<label class="co-etq" for="co-referencia">' + PAGOS[k].ref + '</label>' +
        '<input class="co-campo" id="co-referencia" data-campo="referencia" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="P2P4X8K1M9Q2" aria-required="true" value="' + esc(referencia) + '">' +
        '<p class="co-error" id="co-referencia-error" hidden></p>';
    });
  }

  function pintarResumen() {
    const dl = $('[data-zona="totales"]', raiz);
    if (!dl) return;
    const d = C.descuentoPorCantidad ? C.descuentoPorCantidad() : null;
    dl.innerHTML =
      '<div><dt>Subtotal</dt><dd>' + usd(C.subtotalItems ? C.subtotalItems() : total()) + '</dd></div>' +
      (d ? '<div class="co-dto"><dt>Descuento por cantidad (−' + d.pct + ' %)</dt><dd>−' + usd(d.monto) + '</dd></div>' : '') +
      '<div class="co-envio"><dt>Envío</dt><dd>Cobro a destino</dd></div>' +
      '<div class="co-total"><dt>Total</dt><dd>' + usd(total()) + '</dd></div>';
    const tm = $('[data-zona="total-movil"]', raiz); if (tm) tm.textContent = usd(total());
    // el monto a pagar dentro del método elegido sigue al total
    const mu = $('[data-monto="usd"]', raiz); if (mu) mu.textContent = usd(total());
    const mt = $('[data-monto="usdt"]', raiz); if (mt) mt.textContent = total().toFixed(2) + ' USDT';
    pintarFalta();
  }

  function pintarFalta() {
    const p = $('[data-zona="falta"]', raiz);
    if (!p) return;
    const f = faltan();
    p.textContent = verificando ? '' : f.length ? 'Para finalizar falta ' + enLista(f.map((x) => x.texto)) + '.' : '';
    p.classList.toggle('co-alerta', intento && f.length > 0);
    // palomitas de los pasos completos
    const de = (c) => f.find((x) => x.campo === c);
    const hecho = { datos: !de('nombre') && !de('telefono'), envio: !de('estado') && !de('ciudad') && !de('oficina'), pago: !de('referencia') };
    Object.keys(hecho).forEach((k) => { const h = $('[data-hecho="' + k + '"]', raiz); if (h) h.hidden = !hecho[k]; });
    // los avisos junto a cada campo solo después de intentar finalizar (o del teléfono a medio escribir)
    const marca = (id, msg) => {
      const el = $('#co-' + id, raiz), err = $('#co-' + id + '-error', raiz);
      if (el) { if (msg) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'co-' + id + '-error'); } else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); } }
      if (err) { err.textContent = msg || ''; err.hidden = !msg; }
    };
    marca('nombre', intento && de('nombre') ? 'Escribe tu nombre y apellido.' : '');
    marca('telefono', intento && !datos.telefono.trim() ? 'Escribe tu teléfono de WhatsApp.'
      : (intento && de('telefono')) || (datos.telefono.trim() && !telefonoValido() && document.activeElement !== $('#co-telefono', raiz)) ? 'Escribe el número completo (al menos 7 dígitos).' : '');
    marca('estado', intento && de('estado') ? 'Elige el estado.' : '');
    marca('ciudad', intento && de('ciudad') ? 'Elige la ciudad.' : '');
    marca('oficina', intento && de('oficina') ? 'Elige la oficina donde vas a retirar.' : '');
    marca('referencia', intento && de('referencia') ? (referencia.trim() ? 'Escríbelo completo (al menos 6 caracteres).' : 'Escribe ' + PAGOS[metodo].falta + ' después de pagar.') : '');
  }

  function pintar() {
    pantalla = items().length ? 'pedido' : 'vacio';
    const form = $('.co-form', raiz), lado = $('.co-lado', raiz);
    if (pantalla === 'vacio') {
      form.innerHTML = '<div class="co-listo"><h1 class="co-h1">Tu carrito está vacío</h1><p class="co-txt">Agrega algún compuesto para hacer tu pedido.</p><a class="co-btn" href="/tienda">Ver el catálogo</a></div>';
      lado.innerHTML = ''; lado.hidden = true; $('.co', raiz).classList.add('co-solo');
      return;
    }
    if (!$('#co-s-datos', form)) { montar(); pintarSelects(); pintarOficinas(); pintarPago(); }
    lado.hidden = false; $('.co', raiz).classList.remove('co-solo');
    pintarPedido();
    pintarResumen();
  }

  /* ---------- finalizar: «cargando» 5 s y luego el aviso con el asesor ---------- */
  function mensajeWhatsApp() {
    const lineas = items().map((i) => '• ' + i.nombre + (i.dosis ? ' (' + i.dosis.toUpperCase() + ')' : '') + ' ×' + i.cant + ' = ' + usd(C.subtotalLinea(i.precio, i.cant))).join('\n');
    const d = C.descuentoPorCantidad ? C.descuentoPorCantidad() : null;
    return [
      'Hola Peptidos Plus, hice un pedido en la web y no se pudo verificar mi pago.',
      '',
      '*Orden:* ' + orden.id,
      '*Nombre:* ' + datos.nombre.trim(),
      '*WhatsApp:* ' + datos.telefono.trim(),
      (datos.correo.trim() ? '*Correo:* ' + datos.correo.trim() : null),
      (datos.notas.trim() ? '*Notas:* ' + datos.notas.trim() : null),
      '',
      '*Productos:*',
      lineas,
      (kits() ? '• Kit de aplicación ×' + kits() + ' = incluido' : null),
      (d ? 'Descuento por cantidad (−' + d.pct + ' %): −' + usd(d.monto) : null),
      '*Total: ' + usd(total()) + '*',
      '',
      '*Pago:* ' + PAGOS[metodo].nombre + ' · ' + PAGOS[metodo].ref.toLowerCase() + ' ' + referencia.trim(),
      '*Envío:* Zoom (cobro a destino) — ' + envio.oficina.nombre + ', ' + envio.ciudad + ', ' + envio.estado,
    ].filter((x) => x !== null).join('\n');
  }

  function finalizar() {
    if (verificando) return;
    const f = faltan();
    const res = $('[data-zona="resultado"]', raiz);
    if (f.length) {
      intento = true;
      if (res) res.innerHTML = '';
      pintarFalta();
      const primero = f[0].campo;
      const el = primero === 'oficina' ? ($('#co-oficina .co-radio', raiz) || $('#co-ciudad', raiz)) : $('#co-' + primero, raiz);
      if (el) {
        const sec = el.closest('.co-sec');
        const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (sec) sec.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
        el.focus({ preventScroll: true });
      }
      return;
    }
    verificando = true;
    const btn = $('[data-accion="finalizar"]', raiz);
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="co-girando" aria-hidden="true"></span>Verificando tu pago…';
    if (res) res.innerHTML = '';
    pintarFalta();
    setTimeout(() => {
      verificando = false;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = 'Finalizar compra';
      if (res) {
        res.innerHTML = '<div class="co-aviso" role="alert"><span class="co-aviso-ico">' + ALERTA + '</span>' +
          '<p><b>No pudimos verificar tu pago.</b>Por favor, contacta con uno de nuestros asesores por WhatsApp.</p>' +
          '<a class="co-btn" href="https://api.whatsapp.com/send?phone=' + WA_NUMERO + '&text=' + encodeURIComponent(mensajeWhatsApp()) + '" target="_blank" rel="noopener noreferrer" data-pp-ws-error>' + ICONO_WS + 'Contactar por WhatsApp</a>' +
          '<p class="co-ws-num"><a href="tel:+' + WA_NUMERO + '">' + WA_VISIBLE + '</a></p></div>';
        res.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }
      pintarFalta();
    }, ESPERA_MS);
  }

  /* ---------- eventos (delegados) ---------- */
  raiz.addEventListener('input', (e) => {
    const c = e.target.dataset && e.target.dataset.campo; if (!c) return;
    if (c in datos) { datos[c] = e.target.value; pintarFalta(); }
    else if (c === 'referencia') { referencia = e.target.value; pintarFalta(); }
    else if (c === 'filtro') { filtro = e.target.value; pintarLista(); }
  });
  raiz.addEventListener('focusout', (e) => { if (e.target.id === 'co-telefono') pintarFalta(); });
  raiz.addEventListener('change', (e) => {
    const t = e.target;
    const c = t.dataset && t.dataset.campo;
    if (c === 'estado') { envio.estado = t.value; envio.ciudad = ''; envio.oficina = null; filtro = ''; pintarCiudades(); pintarOficinas(); pintarFalta(); }
    else if (c === 'ciudad') { envio.ciudad = t.value; envio.oficina = null; filtro = ''; pintarOficinas(); pintarFalta(); }
    else if (t.name === 'oficina') { envio.oficina = visibles()[Number(t.value)] || null; pintarFalta(); }
    else if (t.name === 'metodo') { metodo = t.value; pintarPago(); pintarFalta(); }
    else if (t.name === 'transporte') { envio.transporte = t.value; }
  });
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]'); if (!b || b.disabled) return;
    const a = b.dataset.accion;
    if (a === 'finalizar') { finalizar(); return; }
    if (a === 'copiar') {
      const listo = () => { b.textContent = 'Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 1600); };
      try { navigator.clipboard.writeText(b.dataset.valor).then(listo, listo); } catch (x) { listo(); }
      return;
    }
    const it = b.dataset.k != null ? buscar(b.dataset.k) : null;
    if (!it) return;
    if (a === 'mas') C.cambiar(it.id, it.dosis, +1);
    else if (a === 'menos' && it.cant > 1) C.cambiar(it.id, it.dosis, -1);
    else if (a === 'quitar') C.quitar(it.id, it.dosis);
    pintar();
  });
  // El carrito lateral también se puede abrir aquí (icono de la cabecera): lo que cambie allí se refleja
  document.addEventListener('pp:carrito', () => pintar());

  fetch('/assets/datos/zoom-oficinas.json').then((r) => r.json()).then((j) => { OFICINAS = Array.isArray(j) ? j : []; }).catch(() => { OFICINAS = []; })
    .then(() => { oficinasListas = true; if (pantalla === 'pedido') { pintarSelects(); pintarOficinas(); pintarFalta(); } });

  // La columna derecha va fija al bajar. Si es más alta que la pantalla (varios productos, o el aviso del
  // asesor), se pega por abajo: baja con la página hasta que se ve el botón y ahí se queda.
  const lado = $('.co-lado', raiz);
  const ajustarPegado = () => {
    if (!lado) return;
    if (innerWidth <= 960) { lado.style.top = ''; return; }
    lado.style.top = Math.min(84, innerHeight - lado.offsetHeight - 16) + 'px';
  };
  if (lado && 'ResizeObserver' in window) new ResizeObserver(ajustarPegado).observe(lado);
  addEventListener('resize', ajustarPegado);

  window.ppCheckout = { estado: () => ({ pantalla, metodo, datos, envio, orden, referencia, verificando, faltan: faltan().map((x) => x.campo) }), pedidos: () => [] };
  pintar();
})();
