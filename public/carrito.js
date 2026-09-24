/* Carrito FUNCIONAL del clon — capa sobre el marcado capturado de aminoclub.
 *
 * Reutiliza tal cual el panel deslizante (mismas clases, mismo aspecto) y le
 * pone estado real: añadir desde las tarjetas y desde la ficha, cambiar
 * cantidad, quitar, subtotal, contador en la barra, y
 * persistencia en localStorage. Se cierra al pulsar fuera, la X o Escape.
 *
 * REGLA DE NEGOCIO - UNA SOLA (decisión del dueño, 2026-09-09): el descuento
 * es por CANTIDAD DE PÉPTIDOS EN EL CARRITO -3+ -5 %, 6+ -8 %, 10+ -12 %- y
 * no hay ningún otro. Los códigos promocionales se retiraron enteros para que
 * no convivan dos descuentos distintos: ni REBRANDING, ni el campo "Añadir
 * código de descuento", ni la cinta del panel, ni la banda de carrito.html.
 *
 * Lo que NO hace todavía (a propósito): la página carrito.html y el
 * checkout siguen siendo estáticos — la pasarela real (Zelle, Binance,
 * Pago Móvil) vive en el Next.js y se conecta en el siguiente paso.
 */
(() => {
  'use strict';
  const CLAVE = 'pp_clon_carrito_v1';
  // Los códigos ya no existen. Si un navegador guardó uno, se borra al abrir.
  try { localStorage.removeItem('pp_clon_cupon_v1'); } catch (e) { /* modo privado */ }

  /* ---------- ESCALERA POR CANTIDAD ----------
   * Cuenta los PÉPTIDOS DEL CARRITO ENTERO, no las unidades de cada línea:
   * 2 Retatrutida + 1 Semaglutida son 3 y ya entran al primer peldaño.
   * Los topes salen de los márgenes reales (respaldo del dashboard del
   * 2026-09-07 + $5 de kit por péptido): con el 12 % ningún producto baja del
   * precio de mayor y el margen mediano queda en 76 %.
   * El agua bacteriostática NO cuenta ni recibe descuento: es insumo, no
   * péptido, y su margen es demasiado corto para aguantarlo.
   */
  const ESCALERA = [{ desde: 10, pct: 12 }, { desde: 6, pct: 8 }, { desde: 3, pct: 5 }];
  const pctPorCantidad = (n) => { for (const t of ESCALERA) if (n >= t.desde) return t.pct; return 0; };
  const esPeptido = (it) => !/agua\s+bacterio/i.test(it.nombre || '');
  const centavos = (n) => Math.round(n * 100) / 100;
  // La línea ya no lleva descuento propio: el descuento es del carrito entero
  const subtotalLinea = (p, c) => centavos(p * c);
  const usd = (n) => '$' + n.toFixed(2);
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /* ---------- estado ---------- */
  let items = [];
  try { items = JSON.parse(localStorage.getItem(CLAVE) || '[]'); if (!Array.isArray(items)) items = []; } catch (e) { items = []; }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(items)); } catch (e) { /* modo privado */ } };
  // Los tres metabólicos pasaron de llevar el código de aminoclub a llamarse por
  // su compuesto. Un carrito guardado antes traería el nombre viejo, un enlace a
  // una página que ya no existe y una imagen borrada: se traduce al abrir.
  const VIEJOS = {
    'glp-1-sm': { id: 'semaglutida', nombre: 'Semaglutida', img: 'Semaglutida' },
    'glp-2-tr': { id: 'tirzepatida', nombre: 'Tirzepatida', img: 'Tirzepatida' },
    'glp-3-rt': { id: 'retatrutida', nombre: 'Retatrutida', img: 'Retatrutida' },
  };
  let traducidos = 0;
  items.forEach((it) => {
    const v = VIEJOS[it.id];
    if (!v) return;
    it.id = v.id; it.nombre = v.nombre;
    it.img = String(it.img || '').replace(/GLP-[123]-/, v.img + '-');
    traducidos++;
  });
  if (traducidos) guardar();

  let pintarPagina = null;   // lo define la página carrito.html (tabla grande); el panel la mantiene al día
  const unidades = () => items.reduce((s, x) => s + x.cant, 0);
  const subtotalItems = () => centavos(items.reduce((s, x) => s + subtotalLinea(x.precio, x.cant), 0));

  /* ---------- EL DESCUENTO ----------
   * Uno solo: la escalera por cantidad. Se calcula sobre lo que suman los
   * péptidos -el agua bacteriostática ni cuenta unidades ni recibe descuento-
   * y no hay nada con lo que competir ni que sumar.
   */
  const peptidos = () => items.filter(esPeptido);
  const unidadesPeptidos = () => peptidos().reduce((s, x) => s + x.cant, 0);
  const baseDescontable = () => centavos(peptidos().reduce((s, x) => s + subtotalLinea(x.precio, x.cant), 0));

  // { pct, desde, nombre, monto } o null si todavía no llega al primer peldaño
  function descuentoPorCantidad() {
    const n = unidadesPeptidos();
    const pct = pctPorCantidad(n);
    if (!pct) return null;
    const peldano = ESCALERA.find((t) => n >= t.desde);
    return { pct: pct, desde: peldano.desde, nombre: 'Descuento por cantidad', monto: centavos(baseDescontable() * pct / 100) };
  }
  const descuento = () => { const d = descuentoPorCantidad(); return d ? d.monto : 0; };
  const total = () => centavos(subtotalItems() - descuento());
  // Cuántas unidades faltan para el siguiente peldaño
  function siguientePeldano() {
    const n = unidadesPeptidos();
    const sig = ESCALERA.slice().reverse().find((t) => n < t.desde);
    return sig ? { faltan: sig.desde - n, pct: sig.pct, desde: sig.desde } : null;
  }

  /* ---------- montaje ---------- */
  const montaje = $('#pp-carrito-montaje');
  if (!montaje) return;
  const dialogo = montaje.querySelector('[role="dialog"]');
  const panel = montaje.querySelector('[id^="headlessui-dialog-panel"]') || (dialogo && dialogo.lastElementChild);
  const ejemplo = montaje.querySelector('[data-testid="cart-item"]');
  if (!dialogo || !panel || !ejemplo) return;
  const lista = ejemplo.parentElement;
  const plantilla = ejemplo.cloneNode(true);
  $$('[data-testid="cart-item"]', lista).forEach((n) => n.remove());   // las líneas capturadas eran de ejemplo

  const contadorCabecera = dialogo.querySelector('h2 span');
  const subtotalEl = (() => {
    const s = $$('span', dialogo).find((x) => x.textContent.trim() === 'Subtotal');
    const e = s ? s.parentElement.querySelector('.text-xl') : null;
    // Ancla estable: con descuento el desglose añade otro "Subtotal" y el
    // rótulo grande pasa a "Total", así que buscarlo por texto es frágil.
    if (e) e.setAttribute('data-pp-total', '');
    return e;
  })();
  /* ---------- el hueco del panel ----------
   * Con pocas líneas quedaba un vacío enorme entre la venta cruzada y el pie.
   * El área que hace scroll pasa a columna flexible y abajo del todo se ancla
   * el recordatorio de uso, que además es lo que toca decir. */
  const zonaScroll = lista.closest('.overflow-y-auto');
  let notaUso = null;
  if (zonaScroll) {
    zonaScroll.classList.add('flex', 'flex-col');
    notaUso = document.createElement('p');
    notaUso.setAttribute('data-pp-nota-uso', '');
    notaUso.className = 'mt-auto pt-6 px-5 pb-1 text-center text-[11px] leading-relaxed text-black/40';
    notaUso.textContent = 'Todos los compuestos son solo para uso de investigación.';
    zonaScroll.appendChild(notaUso);
  }

  /* ---------- abrir / cerrar ---------- */
  const abrir = () => { montaje.hidden = false; document.body.style.overflow = 'hidden'; render(); };
  const cerrar = () => { montaje.hidden = true; document.body.style.overflow = ''; };

  // Fuera del panel = cerrar (el fondo oscuro y el envoltorio están fuera del panel)
  // Se decide en fase de captura: si el clic re-pinta las líneas, el botón
  // pulsado ya no está en el DOM al llegar al burbujeo y parecería "fuera".
  let clicDentro = false;
  dialogo.addEventListener('click', (e) => { clicDentro = panel.contains(e.target); }, true);
  dialogo.addEventListener('click', () => { if (!clicDentro) cerrar(); });
  $$('[aria-label="Close cart"], [aria-label="Cerrar carrito"], [aria-label="Cerrar"]', dialogo).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); cerrar(); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !montaje.hidden) cerrar(); });
  $$('a[href="#"]', dialogo).forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));

  /* ---------- operaciones ---------- */
  function agregar(p, cant) {
    cant = Math.max(1, Number(cant) || 1);
    const i = items.findIndex((x) => x.id === p.id && x.dosis === p.dosis);
    if (i >= 0) items[i].cant += cant; else items.push(Object.assign({}, p, { cant }));
    guardar(); render(); abrir();
  }
  function cambiar(id, dosis, delta) {
    items = items.map((x) => (x.id === id && x.dosis === dosis ? Object.assign({}, x, { cant: x.cant + delta }) : x)).filter((x) => x.cant > 0);
    guardar(); render();
  }
  function quitar(id, dosis) { items = items.filter((x) => !(x.id === id && x.dosis === dosis)); guardar(); render(); }
  function vaciar() { items = []; guardar(); render(); }
  // Ficha de cada producto: producto-<id>.html (la genera generar-fichas.js)
  const fichaDe = (it) => 'producto-' + it.id + '.html';

  /* ---------- pintado ---------- */
  // La miniatura del carrito: el RECORTE del vial (assets/viales-ficha), no la
  // escena. La escena es una foto 3:2 y en un cuadrado con object-cover se
  // recortaba: el vial salía enorme y cortado. El recorte con alfa se ve
  // entero, centrado y con aire sobre el azulejo de color.
  // De paso repara los carritos guardados antes del paso a WebP (traían .png).
  const miniatura = (src) => String(src || '')
    .replace(/(assets\/(?:productos|viales-ficha)\/[^"']+)\.png/, '$1.webp')
    .replace('assets/productos/', 'assets/viales-ficha/');

  function widgetCantidad(it) {
    // Mismas clases de píldora que el listbox original, con − n + dentro
    const w = document.createElement('div');
    w.className = 'h-9 min-w-[88px] px-1.5 flex items-center justify-between gap-1 bg-white border border-[#e0e0e0] rounded-full text-sm font-medium text-black font-poppins';
    w.innerHTML =
      '<button type="button" class="w-7 h-7 rounded-full hover:bg-black/[0.05] text-base leading-none" aria-label="Quitar uno">−</button>' +
      '<span class="min-w-[1.25rem] text-center" data-cant>' + it.cant + '</span>' +
      '<button type="button" class="w-7 h-7 rounded-full hover:bg-black/[0.05] text-base leading-none" aria-label="Agregar uno">+</button>';
    w.children[0].addEventListener('click', (e) => { e.preventDefault(); cambiar(it.id, it.dosis, -1); });
    w.children[2].addEventListener('click', (e) => { e.preventDefault(); cambiar(it.id, it.dosis, +1); });
    return w;
  }

  function lineaDe(it) {
    const n = plantilla.cloneNode(true);
    const q = n.querySelector('[aria-label^="Remove"], [aria-label^="Quitar"]');
    if (q) { q.setAttribute('aria-label', 'Quitar ' + it.nombre); q.addEventListener('click', (e) => { e.preventDefault(); quitar(it.id, it.dosis); }); }
    const img = n.querySelector('img');
    if (img) { img.src = miniatura(it.img); img.alt = it.nombre; img.removeAttribute('srcset'); img.className = 'object-contain p-1.5 sm:p-2'; }
    const enlaces = $$('a', n); enlaces.forEach((a) => { a.href = fichaDe(it); a.removeAttribute('data-href-original'); });
    const nombre = enlaces.find((a) => a.textContent.trim().length > 0);
    if (nombre) nombre.textContent = it.nombre;
    const dosis = n.querySelector('.text-xs');
    if (dosis) dosis.textContent = (it.dosis || '').toUpperCase();
    const listbox = n.querySelector('[aria-haspopup="listbox"]');
    if (listbox) listbox.parentElement.replaceChild(widgetCantidad(it), listbox);
    const precio = n.querySelector('[data-testid="product-price"]') || n.querySelector('.font-bold.text-black:last-child');
    if (precio) {
      precio.textContent = usd(subtotalLinea(it.precio, it.cant));
    }
    return n;
  }

  function render() {
    $$('[data-testid="cart-item"], [data-pp-vacio]', lista).forEach((n) => n.remove());
    if (!items.length) {
      const v = document.createElement('div');
      v.setAttribute('data-pp-vacio', '');
      v.className = 'py-10 text-center';
      v.innerHTML = '<p class="text-sm text-gray-500 mb-4">Tu carrito está vacío.</p>' +
        '<a href="/store" class="inline-flex items-center justify-center h-10 px-5 rounded-full bg-black text-white text-sm font-medium">Ver catálogo</a>';
      lista.insertBefore(v, lista.firstChild);
    } else {
      const frag = document.createDocumentFragment();
      items.forEach((it) => frag.appendChild(lineaDe(it)));
      lista.insertBefore(frag, lista.firstChild);
    }
    const u = unidades();
    if (contadorCabecera) contadorCabecera.textContent = String(u);
    pintarTotales();
    pintarBadge(u);
    if (pintarPagina) pintarPagina();
  }

  /* ---------- totales del panel ----------
   * Sin descuento se ve igual que siempre: una fila "Subtotal". Con descuento se
   * desglosa —subtotal y descuento— y el número grande pasa a ser el Total. */
  const filaSubtotal = subtotalEl ? subtotalEl.closest('div.flex.items-center.justify-between') : null;
  const etiquetaSubtotal = filaSubtotal ? filaSubtotal.querySelector('span') : null;
  let bloqueDto = null;
  function pintarTotales() {
    if (!subtotalEl) return;
    const s = subtotalItems(), d = descuento();
    subtotalEl.textContent = usd(total());
    if (etiquetaSubtotal) etiquetaSubtotal.textContent = d > 0 ? 'Total' : 'Subtotal';
    if (!bloqueDto && filaSubtotal && filaSubtotal.parentElement) {
      bloqueDto = document.createElement('div');
      bloqueDto.className = 'mt-3 space-y-1';
      bloqueDto.setAttribute('data-pp-dto', '');
      filaSubtotal.parentElement.insertBefore(bloqueDto, filaSubtotal);
    }
    if (!bloqueDto) return;
    const m = descuentoPorCantidad(), sig = siguientePeldano();
    bloqueDto.hidden = !(d > 0 || sig);
    if (bloqueDto.hidden) return;
    bloqueDto.innerHTML =
      (d > 0
        ? '<div class="flex items-center justify-between text-[13px]"><span class="text-black/55">Subtotal</span>' +
          '<span class="text-black/75 tabular-nums">' + usd(s) + '</span></div>' +
          '<div class="flex items-center justify-between text-[13px]"><span class="font-medium text-[#1e6f55]">' + m.nombre +
          ' <span class="font-normal text-black/45">(−' + m.pct + ' %)</span></span>' +
          '<span class="font-semibold text-[#1e6f55] tabular-nums">−' + usd(d) + '</span></div>'
        : '') +
      // Empujoncito: cuánto falta para el siguiente peldaño, solo si mejora
      (sig && sig.pct > (m ? m.pct : 0)
        ? '<p class="text-[12px] text-black/50 pt-0.5">Lleva ' + sig.faltan + (sig.faltan === 1 ? ' péptido más' : ' péptidos más') +
          ' y el descuento sube a <b class="font-semibold text-[#1e6f55]">' + sig.pct + ' %</b>.</p>'
        : '');
  }

  function pintarBadge(u) {
    $$('button[data-testid="nav-cart-link"]').forEach((b) => {
      let badge = b.querySelector('[data-pp-badge]') || $$('span', b).find((s) => /^\d+$/.test(s.textContent.trim()));
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-black text-white text-[10px] font-bold leading-none flex items-center justify-center';
        b.appendChild(badge);
      }
      badge.setAttribute('data-pp-badge', '');
      badge.textContent = String(u);
      badge.style.display = u > 0 ? '' : 'none';
      b.setAttribute('aria-label', u ? 'Carrito, ' + u + (u === 1 ? ' producto' : ' productos') : 'Carrito vacío');
    });
  }

  /* ---------- fuentes de "añadir" ---------- */
  const dosisDeRuta = (src) => { const m = String(src || '').match(/(\d+(?:\.\d+)?)\s*(mg|ml|ui)/i); return m ? m[1] + ' ' + m[2].toLowerCase() : ''; };
  const precioEn = (texto) => { const m = String(texto || '').match(/\$\s?(\d+(?:[.,]\d{1,2})?)/); return m ? parseFloat(m[1].replace(',', '.')) : 0; };

  // 1) Tarjetas del catálogo y del home: aria "Añadir X to cart"
  $$('button[aria-label^="Añadir "], button[aria-label^="Add "]').forEach((b) => {
    const nombre = (b.getAttribute('aria-label') || '').replace(/^(Añadir|Add)\s+/i, '').replace(/\s+(to cart|al carrito)$/i, '').trim();
    if (!nombre) return;
    b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      let card = b.closest('li') || b.closest('[data-testid="product-card"]') || b.parentElement;
      for (let k = 0; k < 6 && card && !card.querySelector('img'); k++) card = card.parentElement;
      const img = card && card.querySelector('img');
      const src = img ? img.getAttribute('src') : '';
      agregar({ id: slug(nombre), nombre, dosis: dosisDeRuta(src), precio: precioEn(card && card.textContent), img: src }, 1);
      confirmar(b, 'Añadido ✓');
    });
  });

  // 2) Ficha de producto: "Añadir al carrito · $99.99", con masa y cantidad de la página
  const h1 = $('h1');
  const stepperNum = (() => {
    const menos = $('[aria-label="Decrease quantity"], [aria-label="Quitar uno"]');
    if (!menos) return null;
    const cont = menos.parentElement;
    return $$('*', cont).find((e) => e !== menos && e.children.length === 0 && /^\d+$/.test(e.textContent.trim())) || null;
  })();
  const leerCant = () => (stepperNum ? Math.max(1, parseInt(stepperNum.textContent, 10) || 1) : 1);
  const fijarCant = (n) => { n = Math.max(1, n); $$('[aria-label="Decrease quantity"]').forEach((m) => { const c = m.parentElement; const s = $$('*', c).find((e) => e !== m && e.children.length === 0 && /^\d+$/.test(e.textContent.trim())); if (s) s.textContent = String(n); }); };
  $$('[aria-label="Decrease quantity"]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); fijarCant(leerCant() - 1); }));
  $$('[aria-label="Increase quantity"]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); fijarCant(leerCant() + 1); }));

  $$('button').filter((b) => /añadir al carrito/i.test(b.textContent) && !b.getAttribute('aria-label')).forEach((b) => {
    b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const nombre = h1 ? h1.textContent.trim() : 'Producto';
      // Con selector de presentación manda la talla elegida; si no lo hay, la única que existe
      const masa = $('[data-pp-pres][aria-pressed="true"]') || $$('button').find((x) => /^\d+\s*(MG|ML|UI)$/i.test(x.textContent.trim()));
      const dosis = masa ? masa.textContent.trim().replace(/(\d)(MG|ML|UI)/i, '$1 $2').toLowerCase() : '';
      const img = $('main img, section img');
      // El botón muestra el TOTAL (como aminoclub), así que el precio de UN
      // vial sale de la talla elegida o del dato de la ficha, nunca del texto.
      const unitario = parseFloat((masa && masa.getAttribute('data-precio')) || b.getAttribute('data-pp-unitario')) || precioEn(b.textContent);
      agregar({ id: slug(nombre), nombre, dosis, precio: unitario, img: img ? img.getAttribute('src') : '' }, leerCant());
      confirmar(b, 'Añadido ✓');
    });
  });

  // 3) Tarjetas "Llévate más y ahorra": 1 / 2 / 3+ / 10+ viales → fijan la cantidad
  const tarjetasVolumen = $$('button').filter((b) => /^\s*(\d+)\+?\s*VIAL(ES)?/i.test(b.textContent.replace(/\s+/g, ' ').trim()) || /(\d+)\+?\s*VIAL/i.test(b.textContent));
  tarjetasVolumen.forEach((b) => {
    const n = parseInt((b.textContent.match(/(\d+)\+?\s*VIAL/i) || [, '1'])[1], 10);
    b.addEventListener('click', (e) => { e.preventDefault(); fijarCant(n); marcarVolumen(n); });
  });

  /* Marcar la tarjeta elegida con el MISMO estilo que trae el diseño
     (borde teal + fondo claro). Antes se pintaba con otro par de colores y
     quedaban dos tarjetas a medio marcar: por eso "no parecía seleccionable".
     Gana la de mayor cantidad que no pase de la elegida: con 4 unidades sigue
     marcada la de "3+". */
  const VOL_ACTIVA = ['border-teal-600', 'bg-teal-50'];
  const VOL_INACTIVA = ['border-gray-200', 'hover:border-gray-300'];
  function marcarVolumen(n) {
    let mejor = null, mejorN = 0;
    tarjetasVolumen.forEach((o) => {
      const c = parseInt((o.textContent.match(/(\d+)\+?\s*VIAL/i) || [, '1'])[1], 10);
      if (c <= n && c >= mejorN) { mejor = o; mejorN = c; }
    });
    tarjetasVolumen.forEach((o) => {
      const suya = o === mejor;
      o.classList.remove('border-[#0d9488]', 'bg-[#f0fdfa]', 'border-black/10');
      VOL_ACTIVA.forEach((c) => o.classList.toggle(c, suya));
      VOL_INACTIVA.forEach((c) => o.classList.toggle(c, !suya));
      o.setAttribute('aria-pressed', String(suya));
      if (suya) { o.classList.remove('pp-tarjeta-elegida'); void o.offsetWidth; o.classList.add('pp-tarjeta-elegida'); }
    });
  }
  // El + y el − también ponen al día la tarjeta marcada
  $$('[aria-label="Decrease quantity"], [aria-label="Increase quantity"]').forEach((b) =>
    b.addEventListener('click', () => setTimeout(() => marcarVolumen(leerCant()), 0)));
  if (tarjetasVolumen.length) marcarVolumen(leerCant());

  // 4) (retirado el 2026-09-11) La venta cruzada "Completa tu pedido · Agua
  //    Bacteriostática" se quitó del panel por decisión del dueño: cada péptido
  //    ya lleva su agua de 3 ml en el kit y la sugerencia confundía.

  // 5) Icono de la barra abre; "Finalizar compra" va a la página del carrito
  $$('button[data-testid="nav-cart-link"], a[href="/carrito"]').forEach((el) => {
    if (montaje.contains(el)) return;
    el.addEventListener('click', (e) => { e.preventDefault(); abrir(); });
  });
  // "Finalizar compra" (en el panel y en carrito.html) → checkout.html
  $$('button, a').filter((b) => /finalizar compra|proceed to checkout/i.test(b.textContent) && !b.closest('#pp-senalar-lista')).forEach((b) => {
    b.addEventListener('click', (e) => { e.preventDefault(); if (items.length) location.href = 'checkout.html'; else abrir(); });
  });

  function confirmar(boton, texto) {
    const span = boton.querySelector('span') || boton;
    const antes = span.textContent;
    span.textContent = texto;
    setTimeout(() => { span.textContent = antes; }, 1200);
  }

  /* ---------- página carrito.html: la tabla grande se pinta desde el mismo estado ---------- */
  const filas = $$('tr[data-testid="product-row"]').filter((tr) => !montaje.contains(tr));
  if (filas.length) {
    const cuerpo = filas[0].parentElement;
    const plantillaFila = filas[0].cloneNode(true);
    filas.forEach((tr) => tr.remove());
    const tabla = cuerpo.closest('table');
    const vacioPag = document.createElement('div');
    vacioPag.className = 'py-12 text-center';
    vacioPag.innerHTML = '<p class="text-base text-gray-500 mb-5">Tu carrito está vacío.</p>' +
      '<a href="/store" class="inline-flex items-center justify-center h-11 px-6 rounded-full bg-black text-white text-sm font-medium">Ver catálogo</a>';
    vacioPag.hidden = true;
    if (tabla) tabla.parentElement.insertBefore(vacioPag, tabla);
    const subEl = $('[data-testid="cart-subtotal"]'), envEl = $('[data-testid="cart-shipping"]'), totEl = $('[data-testid="cart-total"]');
    const cuentaEl = $$('p, span, div').find((e) => e.children.length === 0 && /items? in your cart|productos? en tu carrito/i.test(e.textContent));
    pintarPagina = () => {
      if (cuentaEl) { const u = unidades(); cuentaEl.textContent = u === 0 ? 'Sin productos todavía' : u + (u === 1 ? ' producto en tu carrito' : ' productos en tu carrito'); }
      $$('tr[data-testid="product-row"]', cuerpo).forEach((tr) => tr.remove());
      items.forEach((it) => {
        const tr = plantillaFila.cloneNode(true);
        const img = tr.querySelector('img'); if (img) { img.src = miniatura(it.img); img.alt = it.nombre; img.removeAttribute('srcset'); img.classList.remove('object-cover'); img.classList.add('object-contain'); }
        $$('a', tr).forEach((a) => { a.href = fichaDe(it); a.removeAttribute('data-href-original'); });
        const tit = tr.querySelector('[data-testid="product-title"]'); if (tit) tit.textContent = it.nombre;
        const va = tr.querySelector('[data-testid="product-variant"]'); if (va) va.textContent = (it.dosis || '').toUpperCase();
        const sel = tr.querySelector('select');
        if (sel) {
          sel.innerHTML = '';
          for (let k = 1; k <= Math.max(10, it.cant); k++) { const o = document.createElement('option'); o.value = String(k); o.textContent = String(k); if (k === it.cant) o.selected = true; sel.appendChild(o); }
          sel.setAttribute('aria-label', 'Cantidad de ' + it.nombre);
          sel.addEventListener('change', () => cambiar(it.id, it.dosis, Number(sel.value) - it.cant));
        }
        const q = tr.querySelector('[aria-label="Remove item"], [aria-label^="Quitar"]');
        if (q) { q.setAttribute('aria-label', 'Quitar ' + it.nombre); q.addEventListener('click', (e) => { e.preventDefault(); quitar(it.id, it.dosis); }); }
        const pu = tr.querySelector('[data-testid="product-unit-price"]'); if (pu) pu.textContent = usd(it.precio);
        const pl = tr.querySelector('[data-testid="product-price"]');
        if (pl) pl.textContent = usd(subtotalLinea(it.precio, it.cant));
        cuerpo.appendChild(tr);
      });
      const t = total();
      if (tabla) tabla.style.display = items.length ? '' : 'none';
      vacioPag.hidden = items.length > 0;
      const s = subtotalItems(), d = descuento();
      if (subEl) { subEl.textContent = usd(s); subEl.setAttribute('data-value', s.toFixed(2)); }
      if (totEl) { totEl.textContent = usd(t); totEl.setAttribute('data-value', t.toFixed(2)); }
      // La fila del descuento se crea la primera vez y luego solo se muestra o esconde
      if (subEl) {
        const filaSub = subEl.closest('div.flex.items-center.justify-between');
        let filaDto = document.querySelector('[data-pp-dto-pagina]');
        if (!filaDto && filaSub && filaSub.parentElement) {
          filaDto = document.createElement('div');
          filaDto.setAttribute('data-pp-dto-pagina', '');
          filaDto.className = 'flex items-center justify-between';
          filaSub.parentElement.insertBefore(filaDto, filaSub.nextSibling);
        }
        if (filaDto) {
          filaDto.style.display = d > 0 ? '' : 'none';   // .flex le gana a [hidden]
          const mg = descuentoPorCantidad();
          if (d > 0) filaDto.innerHTML = '<span class="font-medium text-[#1e6f55]">' + mg.nombre +
            ' <span class="font-normal text-[#555]">(−' + mg.pct + ' %)</span></span>' +
            '<span class="font-semibold text-[#1e6f55]">−' + usd(d) + '</span>';
        }
      }
      // El flete nunca va incluido: se paga en la agencia al retirar.
      if (envEl) { envEl.textContent = 'Se paga al retirar (MRW / Zoom)'; envEl.classList.remove('text-green-600'); envEl.setAttribute('data-value', '0'); }
    };
    pintarPagina();
  }

  window.ppCarrito = {
    agregar, cambiar, quitar, vaciar, abrir, cerrar, items: () => items.slice(),
    total, pctPorCantidad, subtotalLinea, fichaDe, miniatura,
    // para que la ficha aplique la MISMA regla que el carrito
    esPeptidoNombre: (n) => esPeptido({ nombre: n }),
    // el descuento por cantidad: importe, detalle y cuánto falta para el siguiente peldaño
    subtotalItems, descuento, descuentoPorCantidad, siguientePeldano,
    unidadesPeptidos, baseDescontable,
  };
  render();
  // behaviors.js carga ANTES que este archivo, así que cuando la ficha pintó
  // su precio todavía no existía window.ppCarrito y no pudo mirar si había
  // promoción: salía el precio de tarifa y solo se corregía al tocar algo.
  // Ya está montado: que lo repinte.
  if (typeof window.ppRecalcularFicha === 'function') window.ppRecalcularFicha();
})();
