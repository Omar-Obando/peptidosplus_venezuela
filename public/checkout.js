/* Checkout con pedido por WhatsApp (Peptidos Plus).
 *
 * Mismo flujo visual del original: Datos → Envío (oficinas Zoom) → Pago
 * (método) → Listo. Pero en vez de guardar en localStorage simulado, al
 * confirmar se abre WhatsApp (wa.me/<NUM>) con la orden completa para que
 * el negocio la procese. Datos mínimos: nombre, WhatsApp, oficina de envío,
 * método de pago (Zelle / Binance Pay / Pago Móvil).
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
    zelle: { nombre: 'Zelle', moneda: 'USD', nota: 'Verificación manual, en minutos' },
    binance: { nombre: 'Binance Pay', moneda: 'USDT', nota: 'Confirmación rápida' },
    movil: { nombre: 'Pago Móvil', moneda: 'Bs', nota: 'A tasa USDT del día' },
  };

  /* ---------- estado ---------- */
  let pantalla = 'datos';                    // datos | envio | pago | listo | vacio
  let metodo = 'movil';
  const datos = { nombre: '', telefono: '', correo: '', notas: '' };
  const envio = { transporte: 'zoom', estado: '', ciudad: '', oficina: null };
  let orden = { id: '' };
  let tasa = null;
  let filtro = '';
  let OFICINAS = [];

  fetch('/assets/datos/zoom-oficinas.json').then((r) => r.json()).then((j) => { OFICINAS = Array.isArray(j) ? j : []; if (pantalla === 'envio') pintar(); }).catch(() => { OFICINAS = []; });
  fetch('https://ve.dolarapi.com/v1/dolares/paralelo').then((r) => r.json()).then((d) => { const t = Number(d.promedio); if (t > 0) { tasa = { tasa: t, fecha: String(d.fechaActualizacion || '').slice(0, 10) }; pintar(); } }).catch(() => { tasa = null; });

  const estados = () => Array.from(new Set(OFICINAS.map((o) => o.estado))).sort((a, b) => a.localeCompare(b, 'es'));
  const ciudades = (e) => Array.from(new Set(OFICINAS.filter((o) => o.estado === e).map((o) => o.ciudad))).sort((a, b) => a.localeCompare(b, 'es'));
  const oficinasDe = (e, c) => OFICINAS.filter((o) => o.estado === e && o.ciudad === c && o.cod);

  const telefonoValido = () => datos.telefono.replace(/\D/g, '').length >= 7;
  const items = () => C.items();
  const total = () => C.total();
  const totalBruto = () => items().reduce((s, i) => s + i.precio * i.cant, 0);
  const dto = () => (C.descuento ? C.descuento() : 0);
  const detalleDto = () => (C.descuentoPorCantidad ? C.descuentoPorCantidad() : null);
  const bs = () => (tasa ? Math.round(total() * tasa.tasa) : null);

  /* ---------- acciones ---------- */
  const ir = (p) => { pantalla = p; window.scrollTo(0, 0); pintar(); };
  const irAPago = () => {
    if (!envio.oficina) return;
    orden = { id: 'ORD-' + String(Math.floor(100000 + Math.random() * 899999)) };
    ir('pago');
  };

  // Enviar pedido por WhatsApp
  const confirmar = () => {
    const lineas = items().map((i) =>
      '• ' + i.nombre + (i.dosis ? ' (' + i.dosis.toUpperCase() + ')' : '') + ' ×' + i.cant + ' = ' + usd(i.precio * i.cant)
    ).join('\n');
    const dtoL = detalleDto() ? '  Descuento por cantidad (−' + detalleDto().pct + ' %): −' + usd(dto()) + '\n' : '';
    const msg = [
      '🛒 *NUEVO PEDIDO — Peptidos Plus*',
      '',
      '*Orden:* ' + orden.id,
      '*Nombre:* ' + (datos.nombre.trim() || '(sin nombre)'),
      '*WhatsApp:* ' + datos.telefono.trim(),
      (datos.correo.trim() ? '*Correo:* ' + datos.correo.trim() + '\n' : ''),
      (datos.notas.trim() ? '*Notas:* ' + datos.notas.trim() + '\n' : ''),
      '──────────────',
      '*Productos:*',
      lineas,
      '',
      dtoL,
      '*Total: ' + usd(total()) + '*',
      (metodo === 'movil' && bs() !== null ? '  ≈ ' + bsFmt(bs()) + '\n' : ''),
      '──────────────',
      '*Envío:* Zoom',
      '*Estado:* ' + envio.estado,
      '*Ciudad:* ' + envio.ciudad,
      '*Oficina:* ' + (envio.oficina ? envio.oficina.nombre + ' — ' + envio.oficina.direccion : '(sin oficina)'),
      '',
      '*Método de pago:* ' + (PAGOS[metodo] ? PAGOS[metodo].nombre + ' (' + PAGOS[metodo].moneda + ')' : metodo),
      '',
      'Gracias, quedo atento(a) a la confirmación.',
    ].filter(Boolean).join('\n');
    const url = 'https://wa.me/' + WA_NUMERO + '?text=' + encodeURIComponent(msg);
    window.open(url, '_blank', 'noopener');
    C.vaciar();
    ir('listo');
  };

  /* ---------- pintado ---------- */
  const campo = (etq, nombre, valor, extra) => '<label class="co-etq">' + etq + '</label>' + (extra && extra.area
    ? '<textarea class="co-campo" data-campo="' + nombre + '" placeholder="' + esc(extra.ph || '') + '">' + esc(valor) + '</textarea>'
    : '<input class="co-campo" data-campo="' + nombre + '" value="' + esc(valor) + '" placeholder="' + esc((extra && extra.ph) || '') + '">');
  const palomita = (on) => '<span class="co-palomita' + (on ? ' on' : '') + '"></span>';

  function pantallaDatos() {
    const faltan = !datos.nombre.trim() || !telefonoValido();
    return '<h1 class="co-h1">Tus datos</h1><p class="co-sub">Para coordinar el envío y confirmarte.</p>' +
      '<div class="co-campos">' +
      '<div>' + campo('Nombre y apellido *', 'nombre', datos.nombre) + '</div>' +
      '<div>' + campo('Teléfono (WhatsApp) *', 'telefono', datos.telefono, { ph: '0412-000.00.00' }) + '<p class="co-gris co-nota" data-aviso-telefono style="display:' + (datos.telefono.trim() && !telefonoValido() ? 'block' : 'none') + '">Escribe el número completo (al menos 7 dígitos).</p>' + '</div>' +
      '<div class="co-ancho">' + campo('Correo electrónico', 'correo', datos.correo, { ph: 'opcional' }) + '</div>' +
      '<div class="co-ancho">' + campo('Notas del pedido (opcional)', 'notas', datos.notas, { area: true, ph: 'Algo que debamos saber del despacho' }) + '</div>' +
      '</div>' +
      '<div class="co-acciones"><a class="co-volver" href="/store">← Seguir comprando</a><button type="button" class="co-btn" data-accion="a-envio"' + (faltan ? ' disabled' : '') + '>Continuar</button></div>';
  }

  function pantallaEnvio() {
    const es = estados(), cs = envio.estado ? ciudades(envio.estado) : [];
    const ofs = envio.estado && envio.ciudad ? oficinasDe(envio.estado, envio.ciudad) : [];
    const visibles = filtro.trim() ? ofs.filter((o) => (o.nombre + ' ' + o.direccion).toLowerCase().includes(filtro.toLowerCase().trim())) : ofs;
    return '<h1 class="co-h1">Envío</h1><p class="co-sub">Despachamos solo a oficinas, no a domicilios.</p>' +
      '<label class="co-etq">Método de envío</label>' +
      '<div class="co-transportes">' +
      '<button type="button" class="co-transporte' + (envio.transporte === 'zoom' ? ' on' : '') + '" data-accion="transporte" data-valor="zoom">' + palomita(envio.transporte === 'zoom') + '<span><b>Zoom</b><small>370 oficinas · cobro en destino</small></span></button>' +
      '<button type="button" class="co-transporte off" disabled>' + palomita(false) + '<span><b>MRW</b><small>No disponible por el momento</small></span></button>' +
      '</div>' +
      '<div class="co-campos">' +
      '<div><label class="co-etq">Estado *</label><select class="co-campo" data-campo="estado"><option value="">' + (es.length ? 'Selecciona tu estado…' : 'Cargando oficinas…') + '</option>' + es.map((e) => '<option value="' + esc(e) + '"' + (e === envio.estado ? ' selected' : '') + '>' + esc(e) + '</option>').join('') + '</select></div>' +
      '<div><label class="co-etq">Ciudad *</label><select class="co-campo" data-campo="ciudad"' + (envio.estado ? '' : ' disabled') + '><option value="">' + (envio.estado ? 'Selecciona tu ciudad…' : 'Elige primero el estado') + '</option>' + cs.map((c) => '<option value="' + esc(c) + '"' + (c === envio.ciudad ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>' +
      '</div>' +
      (envio.ciudad ? '<div class="co-oficinas-cab"><label class="co-etq">Oficina donde retiras * <span class="co-gris">(' + ofs.length + ' en ' + esc(envio.ciudad) + ')</span></label>' + (ofs.length > 4 ? '<input class="co-campo co-filtro" data-campo="filtro" value="' + esc(filtro) + '" placeholder="Buscar por nombre o calle…">' : '') + '</div>' +
        (!ofs.length ? '<p class="co-gris co-nota">No hay oficinas Zoom con cobro en destino en esta ciudad. Prueba con otra cercana o escríbenos por WhatsApp.</p>' :
          '<div class="co-oficinas">' + visibles.map((o, i) => '<button type="button" class="co-oficina' + (envio.oficina && envio.oficina.nombre === o.nombre ? ' on' : '') + '" data-accion="oficina" data-i="' + i + '">' + palomita(envio.oficina && envio.oficina.nombre === o.nombre) + '<span><b>' + esc(o.nombre) + '</b><small>' + esc(o.direccion) + '</small>' + (o.telefono ? '<em>Tel: ' + esc(o.telefono) + '</em>' : '') + '</span></button>').join('') + (!visibles.length ? '<p class="co-gris co-nota">Ninguna oficina coincide con “' + esc(filtro) + '”.</p>' : '') + '</div>') : '') +
      '<p class="co-gris co-pie">Los envíos van <b>solo a oficinas</b> de Zoom o MRW, no a domicilios. El flete se paga al retirar (cobro en destino).</p>' +
      '<div class="co-acciones"><button type="button" class="co-volver" data-accion="a-datos">← Volver a mis datos</button><button type="button" class="co-btn" data-accion="a-pago"' + (envio.oficina ? '' : ' disabled') + '>Continuar</button></div>';
  }

  function pantallaPago() {
    const filas = Object.keys(PAGOS).map((k) => {
      const on = metodo === k;
      return '<div class="co-metodo' + (on ? ' on' : '') + '"><button type="button" class="co-metodo-cab" data-accion="metodo" data-valor="' + k + '">' + palomita(on) + '<span><b>' + PAGOS[k].nombre + '</b><small>' + PAGOS[k].nota + '</small></span><i>' + PAGOS[k].moneda + '</i></button></div>';
    }).join('');
    return '<h1 class="co-h1">Método de pago</h1><p class="co-sub">Elige cómo prefieres pagar. El pedido se te envía por WhatsApp.</p><div class="co-metodos">' + filas + '</div>' +
      '<p class="co-gris co-nota">Confirmaremos tu pago por WhatsApp al recibir tu orden.</p>' +
      '<div class="co-acciones"><button type="button" class="co-volver" data-accion="a-envio-atras">← Volver al envío</button><button type="button" class="co-btn" data-accion="confirmar">Enviar pedido por WhatsApp</button></div>';
  }

  function pantallaListo() {
    return '<div class="co-listo"><h1 class="co-h1">Pedido enviado</h1>' +
      '<p class="co-txt">Orden <b>' + esc(orden.id) + '</b> a nombre de <b>' + esc(datos.nombre) + '</b>. Se abrió WhatsApp con tu pedido: envíalo para confirmar la compra.</p>' +
      '<p class="co-gris">Retiras en ' + (envio.oficina ? '<b>Zoom ' + esc(envio.oficina.nombre) + ', ' + esc(envio.ciudad) + '</b>' : 'la oficina elegida') + '.</p>' +
      '<a class="co-btn" href="/store">Seguir comprando</a></div>';
  }

  function pantallaVacio() {
    return '<div class="co-listo"><h1 class="co-h1">Tu carrito está vacío</h1><p class="co-gris">Agrega algún compuesto para continuar con la compra.</p><a class="co-btn" href="/store">Ver el catálogo</a></div>';
  }

  function resumen() {
    const t = total(), br = totalBruto(), d = detalleDto(), b = bs();
    return '<h2 class="co-h2">Resumen del pedido</h2>' +
      '<table class="co-tabla"><thead><tr><th>Producto</th><th class="c">Cant.</th><th class="r">Total</th></tr></thead><tbody>' +
      items().map((i) => '<tr><td><div class="co-linea"><span class="co-mini"><img src="' + esc(i.img) + '" alt=""></span><span><b>' + esc(i.nombre) + '</b><small>' + esc((i.dosis || '').toUpperCase()) + '</small></span></div></td><td class="c">' + i.cant + '</td><td class="r"><b>' + usd(C.subtotalLinea(i.precio, i.cant)) + '</b></td></tr>').join('') +
      '</tbody></table>' +
      '<dl class="co-totales"><div><dt>Subtotal</dt><dd>' + usd(br) + '</dd></div>' +
      (d ? '<div class="co-dto"><dt>Descuento por cantidad (−' + d.pct + ' %)</dt><dd>−' + usd(d.monto) + '</dd></div>' : '') +
      '<div><dt>Envío</dt><dd class="co-gris">Se paga al retirar</dd></div>' +
      '<div class="co-total"><dt>Total</dt><dd>' + usd(t) + '</dd></div>' +
      (pantalla === 'pago' && b !== null && metodo === 'movil' ? '<div class="co-gris"><dt>En bolívares</dt><dd>' + bsFmt(b) + '</dd></div>' : '') +
      '</dl>' +
      (items().some((i) => C.esPeptidoNombre(i.nombre)) ? '<p class="co-kit">Incluye el kit de aplicación por cada péptido: agua bacteriostática de 3 ml, 10 jeringas y 10 toallitas con alcohol.</p>' : '') +
      (orden.id ? '<p class="co-orden">Orden ' + esc(orden.id) + '</p>' : '');
  }

  function pintar() {
    if (!items().length && pantalla !== 'listo') pantalla = 'vacio';
    const activo = pantalla === 'pago' ? 3 : pantalla === 'listo' ? 4 : 2;
    $$('.co-pasos [data-paso]', raiz).forEach((s) => s.classList.toggle('on', Number(s.dataset.paso) === activo));
    const form = $('.co-form', raiz), lado = $('.co-resumen', raiz);
    const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.campo : null;
    const pos = document.activeElement && document.activeElement.selectionStart;
    form.innerHTML = pantalla === 'datos' ? pantallaDatos() : pantalla === 'envio' ? pantallaEnvio() : pantalla === 'pago' ? pantallaPago() : pantalla === 'listo' ? pantallaListo() : pantallaVacio();
    lado.innerHTML = resumen();
    lado.hidden = pantalla === 'listo' || pantalla === 'vacio';
    raiz.classList.toggle('co-solo', lado.hidden);
    if (foco) { const el = $('[data-campo="' + foco + '"]', form); if (el) { el.focus(); try { if (pos != null && el.setSelectionRange) el.setSelectionRange(pos, pos); } catch (e) { /* select */ } } }
  }

  /* ---------- eventos (delegados) ---------- */
  raiz.addEventListener('input', (e) => {
    const c = e.target.dataset && e.target.dataset.campo; if (!c) return;
    if (c in datos) { datos[c] = e.target.value; const btn = $('[data-accion="a-envio"]', raiz); if (btn) btn.disabled = !datos.nombre.trim() || !telefonoValido(); const av = $('[data-aviso-telefono]', raiz); if (av) av.style.display = datos.telefono.trim() && !telefonoValido() ? 'block' : 'none'; }
    else if (c === 'filtro') { filtro = e.target.value; pintar(); }
  });
  raiz.addEventListener('change', (e) => {
    const c = e.target.dataset && e.target.dataset.campo; if (!c) return;
    if (c === 'estado') { envio.estado = e.target.value; envio.ciudad = ''; envio.oficina = null; filtro = ''; pintar(); }
    if (c === 'ciudad') { envio.ciudad = e.target.value; envio.oficina = null; filtro = ''; pintar(); }
  });
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]'); if (!b || b.disabled) return;
    const a = b.dataset.accion;
    if (a === 'a-envio') ir('envio');
    else if (a === 'a-datos') ir('datos');
    else if (a === 'a-pago') irAPago();
    else if (a === 'a-envio-atras') ir('envio');
    else if (a === 'transporte') { envio.transporte = b.dataset.valor; envio.oficina = null; pintar(); }
    else if (a === 'oficina') { const ofs = oficinasDe(envio.estado, envio.ciudad); const vis = filtro.trim() ? ofs.filter((o) => (o.nombre + ' ' + o.direccion).toLowerCase().includes(filtro.toLowerCase().trim())) : ofs; envio.oficina = vis[Number(b.dataset.i)] || null; pintar(); }
    else if (a === 'metodo') { metodo = b.dataset.valor; pintar(); }
    else if (a === 'confirmar') confirmar();
  });

  window.ppCheckout = { estado: () => ({ pantalla, metodo, datos, envio, orden, referencia: '', tasa }), pedidos: () => [] };
  pintar();
})();
