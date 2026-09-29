/* Pago en una sola página, con el pedido por WhatsApp (Peptidos Plus).
 *
 * 2026-09-29, Angel: «Quiero que todo esté en la misma página para que las
 * personas no tengan que dar constantemente a continuar». Antes eran tres
 * pasos (Datos → Envío → Pago) con un «Continuar» en cada uno; ahora se ve
 * todo de una vez: 1 el pedido (cantidades editables y el kit de aplicación
 * como extra), 2 los datos, 3 el envío a una oficina Zoom y 4 el método de
 * pago. Un solo botón, «Enviar pedido por WhatsApp», abre wa.me/<NUM> con la
 * orden completa. Si falta algo, lo dice debajo del botón y, al pulsarlo, lleva
 * al primer dato que falta.
 *
 * Solo se repinta la parte que cambia (el pedido, las oficinas, el resumen):
 * los campos que el cliente está escribiendo no se tocan.
 */
(() => {
  'use strict';
  const C = window.ppCarrito;
  const raiz = document.getElementById('pp-checkout');
  if (!C || !raiz) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const usd = (n) => '$' + n.toFixed(2);
  const bsFmt = (n) => 'Bs ' + n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const WA_NUMERO = '15806436837';
  const PAGOS = {
    movil: { nombre: 'Pago Móvil', moneda: 'Bs', nota: 'A tasa USDT del día' },
    zelle: { nombre: 'Zelle', moneda: 'USD', nota: 'Verificación manual, en minutos' },
    binance: { nombre: 'Binance Pay', moneda: 'USDT', nota: 'Confirmación rápida' },
  };
  const KIT = 'Agua bacteriostática de 3 ml, 10 jeringas y 10 toallitas con alcohol, uno por cada péptido.';
  const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="10.6" y="4" width="2.8" height="16" rx="1.2" fill="currentColor"/><rect x="4" y="10.6" width="16" height="2.8" rx="1.2" fill="currentColor"/></svg>';

  /* ---------- estado ---------- */
  let pantalla = 'pedido';                   // pedido | listo | vacio
  let metodo = 'movil';
  const datos = { nombre: '', telefono: '', correo: '', notas: '' };
  const envio = { transporte: 'zoom', estado: '', ciudad: '', oficina: null };
  const orden = { id: 'ORD-' + String(Math.floor(100000 + Math.random() * 899999)) };
  let tasa = null;
  let filtro = '';
  let intento = false;                       // ya pulsó «Enviar» con algo pendiente: se marcan los campos
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
  const items = () => C.items();
  const total = () => C.total();
  const kits = () => (C.unidadesPeptidos ? C.unidadesPeptidos() : items().filter((i) => C.esPeptidoNombre(i.nombre)).reduce((s, i) => s + i.cant, 0));
  const bs = () => (tasa ? Math.round(total() * tasa.tasa) : null);
  const clave = (i) => i.id + '|' + (i.dosis || '');
  const buscar = (k) => items().find((i) => clave(i) === k);

  // Lo que falta para poder enviar, en el orden de la página
  function faltan() {
    const f = [];
    if (!datos.nombre.trim()) f.push({ campo: 'nombre', texto: 'tu nombre' });
    if (!datos.telefono.trim()) f.push({ campo: 'telefono', texto: 'tu teléfono' });
    else if (!telefonoValido()) f.push({ campo: 'telefono', texto: 'un teléfono completo' });
    if (!envio.estado) f.push({ campo: 'estado', texto: 'el estado' });
    else if (!envio.ciudad) f.push({ campo: 'ciudad', texto: 'la ciudad' });
    else if (!envio.oficina) f.push({ campo: 'oficina', texto: 'la oficina donde retiras' });
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

  function montar() {
    const form = $('.co-form', raiz);
    form.innerHTML =
      '<section class="co-sec" id="co-s-pedido" aria-labelledby="co-t-pedido"><h2 class="co-h2" id="co-t-pedido"><span class="co-num">01</span>Tu pedido</h2><div data-zona="pedido"></div></section>' +
      '<section class="co-sec" id="co-s-datos" aria-labelledby="co-t-datos"><h2 class="co-h2" id="co-t-datos"><span class="co-num">02</span>Tus datos</h2>' +
        '<div class="co-campos">' +
          '<div>' + campo('Nombre y apellido', 'nombre', { auto: 'name', req: true }) + '</div>' +
          '<div>' + campo('Teléfono (WhatsApp)', 'telefono', { tipo: 'tel', auto: 'tel', modo: 'tel', ph: '0412-000.00.00', req: true }) + '</div>' +
          '<div class="co-ancho">' + campo('Correo electrónico <span class="co-opc">(opcional)</span>', 'correo', { tipo: 'email', auto: 'email' }) + '</div>' +
          '<div class="co-ancho">' + campo('Notas del pedido <span class="co-opc">(opcional)</span>', 'notas', { area: true, ph: 'Algo que debamos saber del despacho' }) + '</div>' +
        '</div></section>' +
      '<section class="co-sec" id="co-s-envio" aria-labelledby="co-t-envio"><h2 class="co-h2" id="co-t-envio"><span class="co-num">03</span>Envío</h2>' +
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
      '<section class="co-sec" id="co-s-pago" aria-labelledby="co-t-pago"><h2 class="co-h2" id="co-t-pago"><span class="co-num">04</span>Método de pago</h2>' +
        '<p class="co-sub">Te confirmamos el pago por WhatsApp al recibir tu pedido.</p>' +
        '<div class="co-metodos" role="radiogroup" aria-labelledby="co-t-pago">' +
          Object.keys(PAGOS).map((k) => opcion('metodo', k, metodo === k, PAGOS[k].nombre, '<small>' + PAGOS[k].nota + '</small>', '<i class="co-moneda">' + PAGOS[k].moneda + '</i>')).join('') +
        '</div>' +
      '</section>';
    const lado = $('.co-resumen', raiz);
    lado.innerHTML =
      '<h2 class="co-h2" id="co-t-resumen">Resumen</h2><dl class="co-totales" data-zona="totales"></dl>' +
      '<button type="button" class="co-btn co-enviar" data-accion="enviar">Enviar pedido por WhatsApp</button>' +
      '<p class="co-falta" data-zona="falta" aria-live="polite"></p>' +
      '<p class="co-orden"><span>Orden</span><span>' + esc(orden.id) + '</span></p>';
    lado.setAttribute('aria-labelledby', 'co-t-resumen');
    // si el carrito se vació y se volvió a llenar sin salir de la página, lo escrito sigue ahí
    Object.keys(datos).forEach((k) => { const el = $('#co-' + k, form); if (el) el.value = datos[k]; });
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
    zona.innerHTML = '<ul class="co-items">' +
      items().map((i) => {
        const k = esc(clave(i)), ficha = esc(C.fichaDe(i));
        return '<li class="co-item">' +
          '<a class="co-mini" href="' + ficha + '" tabindex="-1" aria-hidden="true"><img src="' + esc(C.miniatura(i.img)) + '" alt="" width="52" height="52" loading="lazy"></a>' +
          '<span class="co-item-txt"><a class="co-item-nom" href="' + ficha + '">' + esc(i.nombre) + '</a><small>' + esc((i.dosis || '').toUpperCase()) + (i.dosis ? ' · ' : '') + usd(i.precio) + ' c/u</small></span>' +
          '<span class="co-cant" role="group" aria-label="Cantidad de ' + esc(i.nombre) + '">' +
            '<button type="button" data-accion="menos" data-k="' + k + '" aria-label="Quitar uno"' + (i.cant <= 1 ? ' disabled' : '') + '>−</button>' +
            '<span>' + i.cant + '</span>' +
            '<button type="button" data-accion="mas" data-k="' + k + '" aria-label="Agregar uno">+</button></span>' +
          '<b class="co-precio">' + usd(C.subtotalLinea(i.precio, i.cant)) + '</b>' +
          '<button type="button" class="co-quitar" data-accion="quitar" data-k="' + k + '" aria-label="Quitar ' + esc(i.nombre) + ' del pedido">Quitar</button>' +
        '</li>';
      }).join('') +
      // El kit de aplicación, como extra: el «+» de la marca en un cuadrado de esquinas redondeadas
      (n ? '<li class="co-item co-extra"><span class="co-plus">' + PLUS + '</span>' +
        '<span class="co-item-txt"><b class="co-item-nom">Kit de aplicación</b><small>' + KIT + '</small></span>' +
        '<span class="co-cant-fija">× ' + n + '</span><b class="co-incluido">Incluido</b></li>' : '') +
      '</ul>' +
      (sig && sig.pct > (d ? d.pct : 0) ? '<p class="co-peldano">Lleva ' + sig.faltan + (sig.faltan === 1 ? ' péptido más' : ' péptidos más') + ' y el descuento sube a <b>' + sig.pct + ' %</b>.</p>' : '') +
      '<a class="co-seguir" href="/tienda">Agregar más productos</a>';
    if (foco && foco.accion) {
      const b = $('[data-accion="' + foco.accion + '"][data-k="' + CSS.escape(foco.k || '') + '"]', zona);
      if (b && !b.disabled) b.focus();
      else { const otro = $('[data-accion]', zona); if (otro) otro.focus(); }
    }
  }

  function pintarSelects() {
    const se = $('#co-estado', raiz), sc = $('#co-ciudad', raiz);
    if (!se || !sc) return;
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

  function pintarResumen() {
    const dl = $('[data-zona="totales"]', raiz);
    if (!dl) return;
    const d = C.descuentoPorCantidad ? C.descuentoPorCantidad() : null;
    const u = items().reduce((s, i) => s + i.cant, 0), b = bs();
    dl.innerHTML =
      '<div><dt>Subtotal <span class="co-opc">(' + u + (u === 1 ? ' producto' : ' productos') + ')</span></dt><dd>' + usd(C.subtotalItems ? C.subtotalItems() : total()) + '</dd></div>' +
      (d ? '<div class="co-dto"><dt>Descuento por cantidad (−' + d.pct + ' %)</dt><dd>−' + usd(d.monto) + '</dd></div>' : '') +
      (kits() ? '<div><dt>Kit de aplicación × ' + kits() + '</dt><dd>Incluido</dd></div>' : '') +
      '<div class="co-envio"><dt>Envío</dt><dd>Cobro a destino</dd></div>' +
      '<div class="co-total"><dt>Total</dt><dd>' + usd(total()) + '</dd></div>' +
      (metodo === 'movil' && b !== null ? '<div class="co-bs"><dt>En bolívares (tasa del día)</dt><dd>' + bsFmt(b) + '</dd></div>' : '');
    pintarFalta();
  }

  function pintarFalta() {
    const p = $('[data-zona="falta"]', raiz);
    if (!p) return;
    const f = faltan();
    p.textContent = f.length ? 'Para enviar falta ' + enLista(f.map((x) => x.texto)) + '.' : 'Se abre WhatsApp con tu pedido listo para enviar.';
    p.classList.toggle('co-alerta', intento && f.length > 0);
    // los avisos junto a cada campo solo después de intentar enviar (o del teléfono a medio escribir)
    const marca = (id, msg) => {
      const el = $('#co-' + id, raiz), err = $('#co-' + id + '-error', raiz);
      if (el) { if (msg) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'co-' + id + '-error'); } else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); } }
      if (err) { err.textContent = msg || ''; err.hidden = !msg; }
    };
    const de = (c) => f.find((x) => x.campo === c);
    marca('nombre', intento && de('nombre') ? 'Escribe tu nombre y apellido.' : '');
    marca('telefono', intento && !datos.telefono.trim() ? 'Escribe tu teléfono de WhatsApp.'
      : (intento && de('telefono')) || (datos.telefono.trim() && !telefonoValido() && document.activeElement !== $('#co-telefono', raiz)) ? 'Escribe el número completo (al menos 7 dígitos).' : '');
    marca('estado', intento && de('estado') ? 'Elige el estado.' : '');
    marca('ciudad', intento && de('ciudad') ? 'Elige la ciudad.' : '');
    marca('oficina', intento && de('oficina') ? 'Elige la oficina donde vas a retirar.' : '');
  }

  function pintar() {
    if (pantalla !== 'listo') pantalla = items().length ? 'pedido' : 'vacio';
    const form = $('.co-form', raiz), lado = $('.co-resumen', raiz);
    if (pantalla !== 'pedido') {
      form.innerHTML = pantalla === 'listo' ? pantallaListo() : pantallaVacio();
      lado.innerHTML = ''; lado.hidden = true; $('.co', raiz).classList.add('co-solo');
      return;
    }
    if (!$('[data-zona="pedido"]', form)) { montar(); pintarSelects(); pintarOficinas(); }
    lado.hidden = false; $('.co', raiz).classList.remove('co-solo');
    pintarPedido();
    pintarResumen();
  }

  function pantallaListo() {
    return '<div class="co-listo"><h1 class="co-h1">Pedido enviado</h1>' +
      '<p class="co-txt">Orden <b>' + esc(orden.id) + '</b> a nombre de <b>' + esc(datos.nombre) + '</b>. Se abrió WhatsApp con tu pedido: envíalo para confirmar la compra.</p>' +
      '<p class="co-txt">Retiras en ' + (envio.oficina ? '<b>Zoom ' + esc(envio.oficina.nombre) + ', ' + esc(envio.ciudad) + '</b>' : 'la oficina elegida') + '.</p>' +
      '<a class="co-btn" href="/tienda">Seguir comprando</a></div>';
  }
  function pantallaVacio() {
    return '<div class="co-listo"><h1 class="co-h1">Tu carrito está vacío</h1><p class="co-txt">Agrega algún compuesto para hacer tu pedido.</p><a class="co-btn" href="/tienda">Ver el catálogo</a></div>';
  }

  /* ---------- enviar ---------- */
  function enviar() {
    const f = faltan();
    if (f.length) {
      intento = true;
      pintarFalta();
      const primero = f[0].campo;
      const el = primero === 'oficina' ? ($('#co-oficina .co-radio', raiz) || $('#co-ciudad', raiz)) : $('#co-' + primero, raiz);
      if (el) {
        const sec = el.closest('.co-sec');
        if (sec) sec.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        el.focus({ preventScroll: true });
      }
      return;
    }
    const lineas = items().map((i) =>
      '• ' + i.nombre + (i.dosis ? ' (' + i.dosis.toUpperCase() + ')' : '') + ' ×' + i.cant + ' = ' + usd(C.subtotalLinea(i.precio, i.cant))
    ).join('\n');
    const d = C.descuentoPorCantidad ? C.descuentoPorCantidad() : null;
    const msg = [
      '🛒 *NUEVO PEDIDO — Peptidos Plus*',
      '',
      '*Orden:* ' + orden.id,
      '*Nombre:* ' + datos.nombre.trim(),
      '*WhatsApp:* ' + datos.telefono.trim(),
      (datos.correo.trim() ? '*Correo:* ' + datos.correo.trim() + '\n' : ''),
      (datos.notas.trim() ? '*Notas:* ' + datos.notas.trim() + '\n' : ''),
      '──────────────',
      '*Productos:*',
      lineas,
      (kits() ? '• Kit de aplicación ×' + kits() + ' = incluido' : ''),
      '',
      (d ? '  Descuento por cantidad (−' + d.pct + ' %): −' + usd(d.monto) + '\n' : ''),
      '*Total: ' + usd(total()) + '*',
      (metodo === 'movil' && bs() !== null ? '  ≈ ' + bsFmt(bs()) + '\n' : ''),
      '──────────────',
      '*Envío:* Zoom (cobro a destino)',
      '*Estado:* ' + envio.estado,
      '*Ciudad:* ' + envio.ciudad,
      '*Oficina:* ' + envio.oficina.nombre + ' — ' + envio.oficina.direccion,
      '',
      '*Método de pago:* ' + PAGOS[metodo].nombre + ' (' + PAGOS[metodo].moneda + ')',
      '',
      'Gracias, quedo atento(a) a la confirmación.',
    ].filter(Boolean).join('\n');
    // api.whatsapp.com/send y no wa.me: wa.me, al redirigir, cambia los emoji de 4 bytes (el carrito 🛒) por «�»
    window.open('https://api.whatsapp.com/send?phone=' + WA_NUMERO + '&text=' + encodeURIComponent(msg), '_blank', 'noopener');
    pantalla = 'listo';
    C.vaciar();
    pintar();
    window.scrollTo(0, 0);
  }

  /* ---------- eventos (delegados) ---------- */
  raiz.addEventListener('input', (e) => {
    const c = e.target.dataset && e.target.dataset.campo; if (!c) return;
    if (c in datos) { datos[c] = e.target.value; pintarFalta(); }
    else if (c === 'filtro') { filtro = e.target.value; pintarLista(); }
  });
  raiz.addEventListener('focusout', (e) => { if (e.target.id === 'co-telefono') pintarFalta(); });
  raiz.addEventListener('change', (e) => {
    const t = e.target;
    const c = t.dataset && t.dataset.campo;
    if (c === 'estado') { envio.estado = t.value; envio.ciudad = ''; envio.oficina = null; filtro = ''; pintarCiudades(); pintarOficinas(); pintarFalta(); }
    else if (c === 'ciudad') { envio.ciudad = t.value; envio.oficina = null; filtro = ''; pintarOficinas(); pintarFalta(); }
    else if (t.name === 'oficina') { envio.oficina = visibles()[Number(t.value)] || null; pintarFalta(); }
    else if (t.name === 'metodo') { metodo = t.value; pintarResumen(); }
    else if (t.name === 'transporte') { envio.transporte = t.value; }
  });
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]'); if (!b || b.disabled) return;
    const a = b.dataset.accion;
    if (a === 'enviar') { enviar(); return; }
    const it = b.dataset.k != null ? buscar(b.dataset.k) : null;
    if (!it) return;
    if (a === 'mas') C.cambiar(it.id, it.dosis, +1);
    else if (a === 'menos' && it.cant > 1) C.cambiar(it.id, it.dosis, -1);
    else if (a === 'quitar') C.quitar(it.id, it.dosis);
    pintar();
  });
  // El carrito lateral también se puede abrir aquí (icono de la cabecera): lo que cambie allí se refleja
  document.addEventListener('pp:carrito', () => { if (pantalla !== 'listo') pintar(); });

  fetch('/assets/datos/zoom-oficinas.json').then((r) => r.json()).then((j) => { OFICINAS = Array.isArray(j) ? j : []; }).catch(() => { OFICINAS = []; })
    .then(() => { oficinasListas = true; if (pantalla === 'pedido') { pintarSelects(); pintarOficinas(); pintarFalta(); } });
  fetch('https://ve.dolarapi.com/v1/dolares/paralelo').then((r) => r.json()).then((d) => { const t = Number(d.promedio); if (t > 0) { tasa = { tasa: t, fecha: String(d.fechaActualizacion || '').slice(0, 10) }; if (pantalla === 'pedido') pintarResumen(); } }).catch(() => { tasa = null; });

  window.ppCheckout = { estado: () => ({ pantalla, metodo, datos, envio, orden, referencia: '', tasa, faltan: faltan().map((x) => x.campo) }), pedidos: () => [] };
  pintar();
})();
