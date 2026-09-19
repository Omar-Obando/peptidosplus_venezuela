/* Comportamientos del clon de aminoclub.com
 *
 * La vía de fidelidad captura el HTML YA HIDRATADO y reutiliza las hojas de
 * estilo originales, así que casi todo el movimiento del sitio (transiciones,
 * hover, los viales que flotan en el muro de edad) viene gratis en el CSS.
 * Este archivo solo repone lo que dependía del runtime de React, que se
 * eliminó a propósito.
 *
 * Medido en motion-home.json: 0 GSAP, 0 Lenis, 0 scroll-timeline real,
 * 3 IntersectionObserver y 1 carrusel. Nada más que reponer.
 *
 * NO se reconstruye: carrito, checkout ni pasarela. Es un clon de referencia
 * de diseño, no una tienda funcional.
 */
(() => {
  'use strict';
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* 1. Revelados al entrar en viewport.
     El original arranca estos bloques transparentes y los sube al aparecer.
     Como el runtime ya no está, se replica con el mismo IntersectionObserver:
     si el navegador no lo soporta, todo queda visible (nunca contenido oculto). */
  const revelables = $$('[data-reveal], .reveal, [class*="animate-fade"], [class*="animate-slide"]');
  if (revelables.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-visible');
        e.target.style.opacity = '';
        e.target.style.transform = '';
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    revelables.forEach((el) => io.observe(el));
  }

  /* 2. Carruseles horizontales.
     El original los mueve con scroll nativo y desvanece los bordes con dos
     degradados que aparecen/desaparecen según la posición. Los degradados
     existen en el HTML capturado con `opacity-0`; aquí se les da vida. */
  $$('[data-carousel], .overflow-x-auto, .overflow-x-scroll').forEach((pista) => {
    const cont = pista.parentElement;
    if (!cont) return;
    const izq = cont.querySelector('.left-0[class*="bg-gradient-to-r"]');
    const der = cont.querySelector('.right-0[class*="bg-gradient-to-l"]');
    if (!izq && !der) return;
    const pintar = () => {
      const max = pista.scrollWidth - pista.clientWidth;
      if (izq) izq.style.opacity = pista.scrollLeft > 8 ? '1' : '0';
      if (der) der.style.opacity = pista.scrollLeft < max - 8 ? '1' : '0';
    };
    pista.addEventListener('scroll', pintar, { passive: true });
    window.addEventListener('resize', pintar);
    pintar();
    // Flechas, si las hay: las marcadas, o las del original por su etiqueta
    // ("Scroll the list left/right", "Previous/Next certificate", ya en español)
    $$('[data-carousel-prev], [data-carousel-next], button[aria-label]', cont).forEach((b) => {
      const et = (b.getAttribute('aria-label') || '').toLowerCase();
      const atras = b.hasAttribute('data-carousel-prev') || /left|prev|izquierda|anterior/.test(et);
      const adelante = b.hasAttribute('data-carousel-next') || /right|next|derecha|siguiente/.test(et);
      if (!atras && !adelante) return;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const paso = Math.round(pista.clientWidth * 0.8);
        pista.scrollBy({ left: atras ? -paso : paso, behavior: 'smooth' });
      });
    });
  });

  /* 2b. Deslizador de "Productos destacados" (home).
     No es scroll nativo: el original (Embla) mueve una pista con
     transform: translate3d(). Estructura capturada:
       div.relative > [button prev][button next][div.relative > [degradado][div.overflow-hidden > div.flex (pista)]]
     Aquí las flechas mueven la pista de tarjeta en tarjeta, con tope. */
  $$('button[aria-label]').forEach((bt) => {
    const et = bt.getAttribute('aria-label').toLowerCase();
    const atras = /previous products|productos anteriores/.test(et);
    const adelante = /next products|productos siguientes/.test(et);
    if (!atras && !adelante) return;
    const cont = bt.parentElement;
    const ventana = cont && cont.querySelector('.overflow-hidden');
    const pista = ventana && ventana.firstElementChild;
    if (!pista || !/flex/.test(pista.className)) return;
    const posActual = () => { const m = (pista.style.transform || '').match(/translate3d\((-?[\d.]+)px/); return m ? -parseFloat(m[1]) : 0; };
    const tope = () => Math.max(0, pista.scrollWidth - ventana.clientWidth);
    // El original deja la flecha "‹" con disabled al principio; aquí se gobierna por posición
    const refrescar = () => {
      const pos = posActual();
      $$('button[aria-label]', cont).forEach((o) => {
        const e = o.getAttribute('aria-label').toLowerCase();
        if (/previous products|productos anteriores/.test(e)) o.disabled = pos <= 0;
        else if (/next products|productos siguientes/.test(e)) o.disabled = pos >= tope() - 1;
      });
    };
    refrescar();
    bt.addEventListener('click', (e) => {
      e.preventDefault();
      const tarjeta = pista.firstElementChild;
      const hueco = parseFloat(getComputedStyle(pista).columnGap) || 12;
      const paso = tarjeta ? tarjeta.getBoundingClientRect().width + hueco : ventana.clientWidth * 0.8;
      const salto = Math.max(paso, Math.floor(ventana.clientWidth / paso) * paso);   // una "página" de tarjetas enteras
      const nueva = Math.min(tope(), Math.max(0, posActual() + (atras ? -salto : salto)));
      pista.style.transition = 'transform .45s cubic-bezier(.22,1,.36,1)';
      pista.style.transform = 'translate3d(' + (-nueva) + 'px, 0px, 0px)';
      refrescar();
    });
  });

  /* 2h. Selector de presentación de la ficha.
     Copiado del comportamiento real de aminoclub (medido en su ficha de
     GHK-Cu el 2026-09-07): al elegir otra talla NO se toca la imagen ni hay
     animación. Solo cambian el estado de los botones (con su propia
     transición de borde y fondo), el precio y la etiqueta del botón de
     añadir; y la URL guarda la talla, como hacen ellos con ?v_id.
     Añadido nuestro: si la talla está agotada, el botón de añadir se apaga. */
  (() => {
    const botones = $$('[data-pp-pres]');
    if (botones.length < 2) return;
    const ACTIVA = ['bg-black', 'text-white', 'border-black'];
    const INACTIVA = ['bg-white', 'text-[#555]', 'border-[#e0e0e0]', 'hover:border-[#999]'];
    const precios = $$('[data-pp-precio]');
    const anadir = $$('[data-pp-anadir]');
    const usd = (n) => '$' + Number(n).toFixed(2);
    const textoAnadir = (b) => $$('span', b).find((s) => /añadir al carrito|agotado/i.test(s.textContent)) || b;
    const slug = (d) => d.toLowerCase().replace(/\s+/g, '');

    const elegir = (boton, conUrl) => {
      botones.forEach((b) => {
        const suya = b.getAttribute('data-dosis') === boton.getAttribute('data-dosis');
        b.setAttribute('aria-pressed', String(suya));
        ACTIVA.forEach((c) => b.classList.toggle(c, suya));
        INACTIVA.forEach((c) => b.classList.toggle(c, !suya));
      });
      const precio = boton.getAttribute('data-precio');
      const agotado = boton.getAttribute('data-agotado') === '1';
      // 2026-09-11: si la talla trae su propio vial (data-vial), el héroe y sus copias
      // pequeñas lo muestran. Solo el agua lo necesita: 10 ml es nuestro vial y 30 ml
      // es la botella Hospira. En el resto todas las tallas comparten imagen.
      const vialNuevo = boton.getAttribute('data-vial');
      if (vialNuevo) {
        const viales = botones.map((x) => x.getAttribute('data-vial')).filter(Boolean);
        const base = (u) => (u || '').replace('/mini/', '/');
        $$('img').forEach((img) => {
          const src = img.getAttribute('src') || '';
          if (!viales.some((v) => base(src) === v) || base(src) === vialNuevo) return;
          img.setAttribute('src', src.includes('/mini/') ? vialNuevo.replace('viales-ficha/', 'viales-ficha/mini/') : vialNuevo);
        });
      }
      precios.forEach((e) => { e.textContent = usd(precio); });
      anadir.forEach((b) => {
        textoAnadir(b).textContent = agotado ? 'Agotado' : 'Añadir al carrito · ' + usd(precio);
        b.toggleAttribute('disabled', agotado);
        b.classList.toggle('opacity-50', agotado);
        b.classList.toggle('cursor-not-allowed', agotado);
      });
      if (conUrl && history.replaceState) {
        const u = new URL(location.href);
        u.searchParams.set('v', slug(boton.getAttribute('data-dosis')));
        history.replaceState(null, '', u);
      }
    };

    botones.forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); elegir(b, true); }));

    // Al abrir, manda la talla de la URL si viene; si no, la marcada en el HTML
    const pedida = new URL(location.href).searchParams.get('v');
    const inicial = (pedida && botones.find((b) => slug(b.getAttribute('data-dosis')) === pedida.toLowerCase()))
      || botones.find((b) => b.getAttribute('aria-pressed') === 'true') || botones[0];
    elegir(inicial, false);
  })();

  /* 2j. Precio total según la cantidad, como en aminoclub.
     Medido en su ficha de GHK-Cu (2026-09-07): al elegir "2 BOTTLES" el
     precio pasa de 19,49 a 37,70 y el botón dice "Add to cart · $37.70";
     además tachan el precio sin descuento (59,98). Aquí igual, pero con
     NUESTRA escalera por cantidad (3+ −5 %, 6+ −8 %, 10+ −12 %) y teniendo en
     cuenta el código anunciado, que entra solo: se enseña el MEJOR de los dos,
     que es lo que va a cobrar el carrito. Si no coincidieran, el comprador
     vería un precio en la ficha y otro al pagar. */
  (() => {
    const anadir = $$('[data-pp-anadir]');
    const precios = $$('[data-pp-precio]');
    if (!anadir.length || !precios.length) return;

    const usd = (n) => '$' + n.toFixed(2);
    const pctEscalera = (c) => (c >= 10 ? 12 : c >= 6 ? 8 : c >= 3 ? 5 : 0);
    // Lo que NO es péptido (el agua bacteriostática) no lleva descuento, ni
    // aquí ni en el carrito: si la ficha lo aplicara, enseñaría un precio más
    // bajo del que se cobra.
    const conDescuento = () => {
      const C = window.ppCarrito;
      if (!C || !C.esPeptidoNombre) return true;
      const h1 = document.querySelector('h1');
      return C.esPeptidoNombre(h1 ? h1.textContent : '');
    };
    // Solo la escalera por cantidad: los códigos promocionales se retiraron
    // (2026-09-09) para no tener dos descuentos distintos en el sitio.
    const pct = (c) => (conDescuento() ? pctEscalera(c) : 0);
    const unitario = () => {
      const pres = document.querySelector('[data-pp-pres][aria-pressed="true"]');
      if (pres) return parseFloat(pres.getAttribute('data-precio')) || 0;
      return parseFloat(anadir[0].getAttribute('data-pp-unitario')) || 0;
    };
    const cantidad = () => {
      const menos = document.querySelector('[aria-label="Decrease quantity"], [aria-label="Quitar uno"]');
      if (!menos) return 1;
      const s = $$('*', menos.parentElement).find((e) => e !== menos && !e.children.length && /^\d+$/.test(e.textContent.trim()));
      return s ? Math.max(1, parseInt(s.textContent, 10) || 1) : 1;
    };
    const textoAnadir = (b) => $$('span', b).find((s) => /añadir al carrito|agotado/i.test(s.textContent)) || b;

    // El "antes" tachado se crea una vez, junto al precio grande
    const tachado = (() => {
      const p0 = precios[0];
      let t = p0.parentElement.querySelector('[data-pp-antes]');
      if (!t) {
        t = document.createElement('span');
        t.setAttribute('data-pp-antes', '');
        t.className = 'text-sm text-[#9a9a9a] line-through mr-2 align-middle';
        p0.parentElement.insertBefore(t, p0);
      }
      return t;
    })();

    const recalcular = () => {
      const u = unitario(), c = cantidad(), d = pct(c);
      const bruto = Math.round(u * c * 100) / 100;
      const total = Math.round(bruto * (1 - d / 100) * 100) / 100;
      precios.forEach((e) => { e.textContent = usd(total); });
      tachado.textContent = d ? usd(bruto) : '';
      tachado.hidden = !d;
      anadir.forEach((b) => {
        if (b.hasAttribute('disabled')) return;             // agotado: lo maneja 2h
        textoAnadir(b).textContent = 'Añadir al carrito · ' + usd(total);
      });
    };

    // Se recalcula tras cualquier cosa que cambie cantidad o talla
    const tras = () => setTimeout(recalcular, 0);
    $$('[aria-label="Decrease quantity"], [aria-label="Increase quantity"], [aria-label="Quitar uno"]').forEach((b) => b.addEventListener('click', tras));
    // Sin \b al final: el texto de la tarjeta sigue con el porcentaje
    // ("3 VIALES5% DTO."), así que ahí no hay límite de palabra.
    $$('button').filter((b) => /\d+\+?\s*(VIAL|VIALES)/i.test(b.textContent) && !b.closest('#pp-carrito-montaje')).forEach((b) => b.addEventListener('click', tras));
    $$('[data-pp-pres]').forEach((b) => b.addEventListener('click', tras));
    window.ppRecalcularFicha = recalcular;
    recalcular();
  })();

  /* 2k. Catálogo vivo: buscador, categorías y orden.
     En el clon los tres eran decoración (el runtime de React se quitó). Aquí
     filtran y ordenan de verdad sobre las tarjetas ya presentes, sin recargar.
     Los datos van en la propia tarjeta: data-pp-busca, data-pp-cat,
     data-pp-precio-num y data-pp-orden (el orden original = "más populares"). */
  (() => {
    const lista = document.querySelector('[data-testid="products-list"]');
    if (!lista) return;
    const tarjetas = $$('li[data-pp-nombre]', lista);
    if (!tarjetas.length) return;
    const buscador = document.querySelector('input[placeholder*="Buscar"]');
    const chips = $$('[data-testid="category-chips"] [data-pp-cat]');
    const ordenes = $$('select').filter((s) => $$('option', s).some((o) => o.value === 'title_asc'));
    const cuenta = document.querySelector('[data-pp-cuenta]');
    const vacio = document.querySelector('[data-pp-vacio]');

    // Sin tildes: buscar "epitalon" tiene que encontrar "Epitalón"
    const plano = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    tarjetas.forEach((t) => t.setAttribute('data-pp-busca-plano', plano(t.getAttribute('data-pp-busca'))));

    // El cierre del home manda aquí con ?q= y ?cat= ("¿Qué péptido buscas?", 2026-09-10)
    const urlIni = new URL(location.href).searchParams;
    // ?orden=nuevos: la cinta "5 productos nuevos" manda aquí (2026-09-10)
    const ORDEN_URL = { nuevos: 'created_at', nombre: 'title_asc', precio: 'price_asc' };
    let texto = urlIni.get('q') || '', categoria = urlIni.get('cat') || '', orden = ORDEN_URL[urlIni.get('orden')] || 'popular';
    if (categoria && !chips.some((c) => (c.getAttribute('data-pp-cat') || '') === categoria)) categoria = '';
    if (buscador && texto) buscador.value = texto;

    const pintar = () => {
      const q = plano(texto.trim());
      let visibles = 0;
      tarjetas.forEach((t) => {
        const okTexto = !q || t.getAttribute('data-pp-busca-plano').includes(q);
        const okCat = !categoria || t.getAttribute('data-pp-cat') === categoria;
        const ver = okTexto && okCat;
        t.hidden = !ver;
        if (ver) visibles++;
      });
      // ordenar solo lo visible, moviendo nodos (el orden original se conserva en data-pp-orden)
      const num = (t, a) => parseFloat(t.getAttribute(a)) || 0;
      const nombre = (t) => plano(t.getAttribute('data-pp-nombre'));
      const cmp = {
        popular: (a, b) => num(a, 'data-pp-orden') - num(b, 'data-pp-orden'),
        created_at: (a, b) => num(b, 'data-pp-orden') - num(a, 'data-pp-orden'),
        title_asc: (a, b) => nombre(a).localeCompare(nombre(b)),
        title_desc: (a, b) => nombre(b).localeCompare(nombre(a)),
        price_asc: (a, b) => num(a, 'data-pp-precio-num') - num(b, 'data-pp-precio-num'),
        price_desc: (a, b) => num(b, 'data-pp-precio-num') - num(a, 'data-pp-precio-num'),
      }[orden] || null;
      if (cmp) tarjetas.slice().sort(cmp).forEach((t) => lista.appendChild(t));
      if (vacio) { lista.appendChild(vacio); vacio.hidden = visibles > 0; }
      if (cuenta) {
        const etiqueta = chips.find((c) => c.getAttribute('data-pp-cat') === categoria);
        cuenta.textContent = visibles + (visibles === 1 ? ' producto' : ' productos')
          + (categoria && etiqueta ? ' · ' + etiqueta.textContent.trim() : '')
          + (q ? ' · "' + texto.trim() + '"' : '');
      }
      chips.forEach((c) => {
        const suya = (c.getAttribute('data-pp-cat') || '') === categoria;
        c.setAttribute('aria-pressed', String(suya));
        c.classList.toggle('bg-brand-black', suya);
        c.classList.toggle('text-white', suya);
        c.classList.toggle('bg-white', !suya);
        c.classList.toggle('text-brand-black', !suya);
      });
    };

    if (buscador) {
      buscador.addEventListener('input', () => { texto = buscador.value; pintar(); });
      buscador.addEventListener('search', () => { texto = buscador.value; pintar(); });
      buscador.setAttribute('placeholder', 'Buscar por nombre o compuesto…');
    }
    chips.forEach((c) => c.addEventListener('click', (e) => { e.preventDefault(); categoria = c.getAttribute('data-pp-cat') || ''; pintar(); }));
    ordenes.forEach((s) => s.addEventListener('change', () => { orden = s.value; ordenes.forEach((o) => { o.value = s.value; }); pintar(); }));
    if (orden !== 'popular') ordenes.forEach((o) => { o.value = orden; });
    $$('[data-pp-limpiar]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); texto = ''; categoria = ''; if (buscador) buscador.value = ''; pintar();
    }));
    pintar();
  })();

  /* 3. Menús y desplegables de Headless UI.
     El original los monta en React; sin runtime quedan inertes. Se repone un
     alternador mínimo por atributos ARIA, que es lo que el CSS ya usa. */
  $$('[aria-expanded]').forEach((disparador) => {
    const id = disparador.getAttribute('aria-controls');
    const panel = id ? document.getElementById(id) : disparador.nextElementSibling;
    if (!panel) return;
    disparador.addEventListener('click', (e) => {
      e.preventDefault();
      const abierto = disparador.getAttribute('aria-expanded') === 'true';
      disparador.setAttribute('aria-expanded', String(!abierto));
      panel.hidden = abierto;
      panel.classList.toggle('hidden', abierto);
    });
  });

  /* 2c. Barra propia: enlace activo y menú móvil (el botón lo abre por
     aria-expanded, ver 3; aquí se cierra al elegir y se bloquea el scroll). */
  (() => {
    const actual = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.pp-nav-links a').forEach((a) => { const h = (a.getAttribute('href') || '').toLowerCase(); if (h === actual || (h === 'store.html' && /^producto-/.test(actual)) || (h === 'articulos.html' && /^articulo-/.test(actual))) a.classList.add('activo'); });
    const boton = document.querySelector('.pp-nav-menu'), menu = document.getElementById('pp-menu-movil');
    if (boton && menu) {
      const sincronizar = () => { const abierto = !menu.hidden; document.body.style.overflow = abierto ? 'hidden' : ''; boton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú'); boton.innerHTML = abierto ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 18L18 6M6 6l12 12"/></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'; };
      boton.addEventListener('click', () => setTimeout(sincronizar, 0));
      $$('a', menu).forEach((a) => a.addEventListener('click', () => { menu.hidden = true; boton.setAttribute('aria-expanded', 'false'); sincronizar(); }));
      window.addEventListener('resize', () => { if (window.innerWidth >= 768 && !menu.hidden) { menu.hidden = true; boton.setAttribute('aria-expanded', 'false'); sincronizar(); } });
    }
  })();

  /* 2e. Lluvia de viales sin choques (sección "Pedidos al mayor" y similares).
     El original suelta 50 mosaicos con posiciones al azar y se montan unos
     sobre otros. Aquí cada mosaico visible va en su propia columna (así,
     aunque caigan a distinta velocidad, nunca se cruzan), con el vial
     recortado sobre un fondo pastel; los que no caben se esconden. */
  $$('.bulk-rain-tile').map((t) => t.parentElement).filter((c, i, arr) => arr.indexOf(c) === i).forEach((cont) => {
    const tiles = $$('.bulk-rain-tile', cont);
    const PASTEL = ['#ece8fb', '#dbeafe', '#dcfce7', '#fef3c7', '#ffe4e6', '#e0f2fe'];
    tiles.forEach((t, i) => {
      const img = t.querySelector('img');
      if (img) { const src = img.getAttribute('src') || ''; if (/assets\/productos\//.test(src)) img.setAttribute('src', src.replace('assets/productos/', 'assets/viales-ficha/')); img.className = 'w-full h-full object-contain p-1.5'; img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:3px;box-sizing:border-box'; }
      t.style.background = PASTEL[i % PASTEL.length];
    });
    const repartir = () => {
      /* Columnas reales (ancho/n), nunca más estrechas que el mosaico, y un margen
         de 14 px a cada lado para que al girar (hasta 12°) las cajas no se toquen. */
      const ancho = cont.clientWidth || 1200;
      const n = Math.max(4, Math.min(tiles.length, Math.floor(ancho / 104)));
      const col = ancho / n, margen = 14;
      tiles.forEach((t, i) => {
        if (i >= n) { t.style.display = 'none'; return; }
        t.style.display = '';
        if (!t.dataset.w0) t.dataset.w0 = parseInt(t.style.width, 10) || 60;   // ancho original, para volver a crecer al ensanchar
        const w = Math.max(40, Math.min(+t.dataset.w0, col - 2 * margen));
        const h = Math.round(w * 1.25);
        t.style.width = w + 'px'; t.style.height = h + 'px';
        const holgura = Math.max(0, col - w - 2 * margen);                     // desplazamiento fijo dentro de la columna
        const x = i * col + margen + ((i * 37) % 11) / 10 * holgura;
        t.style.left = (x / ancho * 100).toFixed(2) + '%';
      });
    };
    repartir();
    window.addEventListener('resize', repartir);
  });

  /* 2d. Partículas del héroe propio (port de Particulas.tsx de peptidosplus.com):
     puntos navy tenues que suben despacio; se detienen fuera de pantalla y con
     prefers-reduced-motion. */
  $$('canvas.pp-hero-particulas').forEach((canvas) => {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ancho = 0, alto = 0, particulas = [], raf = 0, visible = true, t = 0;
    const nueva = (repartir) => ({ x: Math.random() * ancho, y: repartir ? Math.random() * alto : alto + 12, r: 1 + Math.random() * 2.3, vx: (Math.random() - 0.5) * 0.14, vy: 0.10 + Math.random() * 0.26, alfa: 0.10 + Math.random() * 0.26, fase: Math.random() * Math.PI * 2, vaiven: 0.25 + Math.random() * 0.5 });
    const dimensionar = () => {
      const caja = canvas.getBoundingClientRect(); if (!caja.width || !caja.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = caja.width; alto = caja.height;
      canvas.width = Math.round(ancho * dpr); canvas.height = Math.round(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(70, Math.max(24, (ancho * alto) / 26000)));
      particulas = Array.from({ length: n }, () => nueva(true));
    };
    const pintar = () => {
      t += 1; ctx.clearRect(0, 0, ancho, alto);
      particulas.forEach((p, i) => {
        p.y -= p.vy; p.x += p.vx + Math.sin(t / 60 + p.fase) * p.vaiven * 0.08;
        if (p.y < -12 || p.x < -12 || p.x > ancho + 12) particulas[i] = nueva(false);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10, 25, 47, ' + p.alfa.toFixed(3) + ')'; ctx.fill();
      });
      if (visible && !quieto) raf = requestAnimationFrame(pintar);
    };
    dimensionar(); pintar();
    if (quieto) return;
    window.addEventListener('resize', () => { dimensionar(); });
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(pintar); if (!visible) { cancelAnimationFrame(raf); raf = 0; } }).observe(canvas);
  });

  /* 2f. Reproductor de "La garantía": un solo video vertical (los dos son
     9:16 y con audio). Los tres iconitos de la lista lo cambian, al terminar
     pasa solo al siguiente video distinto, y arranca en silencio al entrar en
     pantalla (se pausa al salir). Quien toca un iconito pidió ese video: se
     reproduce con sonido; el botón de la barra lo silencia. */
  $$('[data-pp-player]').forEach((player) => {
    const video = player.querySelector('video');
    const seccion = player.closest('section') || document;
    const items = $$('[data-pp-video]', seccion);
    if (!video || !items.length) return;
    const marco = player.querySelector('.pp-player-marco');
    const play = player.querySelector('.pp-player-play'), pausa = player.querySelector('[data-accion="pausa"]'), sonido = player.querySelector('[data-accion="sonido"]');
    const prog = player.querySelector('.pp-player-progreso'), barra = prog && prog.firstElementChild, tiempo = player.querySelector('.pp-player-tiempo'), titulo = player.querySelector('.pp-player-titulo');
    let idx = -1, pausadoPorUsuario = false;
    const srcDe = (it) => (it.getAttribute('data-pp-video') || '').split('|');
    const fmt = (s) => { s = Math.max(0, Math.floor(isFinite(s) ? s : 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const pintar = () => {
      if (play) play.hidden = !video.paused;
      if (marco) marco.classList.toggle('pausado', video.paused);
      if (pausa) { pausa.classList.toggle('pausado', video.paused); pausa.setAttribute('aria-label', video.paused ? 'Reproducir' : 'Pausar'); }
      if (sonido) { sonido.classList.toggle('mudo', video.muted); sonido.setAttribute('aria-label', video.muted ? 'Activar sonido' : 'Silenciar'); }
      if (barra) barra.style.width = (video.duration ? (video.currentTime / video.duration) * 100 : 0) + '%';
      if (tiempo) tiempo.textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
    };
    const reproducir = () => { const pr = video.play(); if (pr && pr.catch) pr.catch(() => { video.muted = true; video.play().catch(() => {}); }); };
    const cargar = (i, arrancar) => {
      i = ((i % items.length) + items.length) % items.length;
      const it = items[i], [src, poster] = srcDe(it), cambia = video.getAttribute('src') !== src;
      idx = i;
      items.forEach((el, k) => { const activo = k === i; el.classList.toggle('pp-item-activo', activo); el.setAttribute('aria-pressed', String(activo)); const cue = el.querySelector('.pp-item-cue span'); if (cue) cue.textContent = activo ? 'Viendo' : 'Ver video'; });
      if (titulo) titulo.textContent = it.getAttribute('data-pp-video-titulo') || '';
      video.setAttribute('aria-label', 'Video: ' + (it.getAttribute('data-pp-video-titulo') || ''));
      // Con preload="none" cambiar el src no descarga nada: el archivo se pide
      // al reproducir, no al cargar la página (eran 3,4 MB en cada visita).
      if (cambia) { if (poster) video.setAttribute('poster', poster); video.setAttribute('src', src); if (arrancar) video.load(); }
      else if (arrancar) video.currentTime = 0;
      if (arrancar) reproducir();
      pintar();
    };
    const siguiente = () => { for (let k = 1; k <= items.length; k++) { const j = (idx + k) % items.length; if (srcDe(items[j])[0] !== video.getAttribute('src')) return j; } return (idx + 1) % items.length; };
    items.forEach((it, i) => {
      it.addEventListener('click', () => { pausadoPorUsuario = false; video.muted = false; cargar(i, true); });
      it.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); it.click(); } });
    });
    const alternar = () => { if (video.paused) { pausadoPorUsuario = false; reproducir(); } else { pausadoPorUsuario = true; video.pause(); } };
    if (play) play.addEventListener('click', alternar);
    if (pausa) pausa.addEventListener('click', alternar);
    video.addEventListener('click', alternar);
    if (sonido) sonido.addEventListener('click', () => { video.muted = !video.muted; if (!video.muted) video.volume = 1; pintar(); });
    if (prog) prog.addEventListener('click', (e) => { const r = prog.getBoundingClientRect(); if (video.duration && r.width) video.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * video.duration; });
    ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'volumechange', 'emptied'].forEach((ev) => video.addEventListener(ev, pintar));
    video.addEventListener('ended', () => cargar(siguiente(), true));
    cargar(0, false);
    if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      new IntersectionObserver((es) => {
        if (es[0].isIntersecting) { if (video.paused && !pausadoPorUsuario) reproducir(); }
        else if (!video.paused) video.pause();
      }, { threshold: 0.35 }).observe(player);
    }
  });

  /* 3b. Pestañas (aria-selected + aria-controls), como las de "Calidad" del
     home: al pulsar una, se marca y se muestra solo su panel.
     2026-09-10: esto ANTES peleaba con el marcado. React dejó el estado
     horneado en clases —el botón activo con bg-black, el panel activo con
     "opacity-100 visible relative" y los otros con "opacity-0 invisible
     absolute"— y este bloque intentaba apagarlas una a una. No funcionaba:
     la clase `visible` del panel viejo le ganaba a la `invisible` que se le
     añadía (misma especificidad, decide el orden del CSS, no el del DOM), así
     que el navy se quedaba clavado en "Masa" y el panel no cambiaba nunca.
     Ahora el estado lo pinta marca-navy.css desde aria-selected y [hidden], y
     aquí solo se mueven esos dos atributos. */
  $$('button[aria-selected][aria-controls]').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const grupo = tab.parentElement;
      $$('button[aria-selected][aria-controls]', grupo).forEach((t) => {
        const activa = t === tab;
        t.setAttribute('aria-selected', String(activa));
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !activa;
      });
    });
  });
  // el estado inicial también viene de las clases: se traduce a [hidden]
  $$('[role="tablist"]').forEach((lista) => {
    $$('button[aria-selected][aria-controls]', lista).forEach((t) => {
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = t.getAttribute('aria-selected') !== 'true';
    });
  });

  /* 3c. Globos de ayuda (el botón con el "?"). El marcado del original llega
     con las clases apagadas (opacity-0 invisible pointer-events-none) porque
     era React quien las encendía: sin esto el "?" no muestra nada. Se abre al
     pasar el ratón, al enfocar con el teclado y al tocarlo; Escape lo cierra. */
  $$('button[aria-describedby]').forEach((boton) => {
    const globo = document.getElementById(boton.getAttribute('aria-describedby')) || (boton.parentElement && boton.parentElement.querySelector('[role="tooltip"]'));
    if (!globo) return;
    const APAGADO = ['opacity-0', 'invisible', 'translate-y-1', 'pointer-events-none'];
    const mostrar = (si) => { APAGADO.forEach((c) => globo.classList.toggle(c, !si)); globo.classList.toggle('opacity-100', si); globo.setAttribute('aria-hidden', String(!si)); };
    ['mouseenter', 'focus'].forEach((ev) => boton.addEventListener(ev, () => mostrar(true)));
    ['mouseleave', 'blur'].forEach((ev) => boton.addEventListener(ev, () => mostrar(false)));
    boton.addEventListener('click', (e) => { e.preventDefault(); mostrar(globo.classList.contains('opacity-0')); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') mostrar(false); });
    mostrar(false);
  });
  /* 3d. El mismo globo, otra forma: en el panel del carrito el "?" es un
     <span class="cursor-help"> con el globo de hermano, sin aria-describedby. */
  $$('.cursor-help').forEach((marca) => {
    const globo = marca.nextElementSibling;
    if (!globo || !globo.classList.contains('opacity-0')) return;
    const zona = marca.parentElement || marca;
    const mostrar = (si) => { ['opacity-0', 'invisible'].forEach((c) => globo.classList.toggle(c, !si)); globo.classList.toggle('opacity-100', si); };
    ['mouseenter', 'focus'].forEach((ev) => zona.addEventListener(ev, () => mostrar(true), true));
    ['mouseleave', 'blur'].forEach((ev) => zona.addEventListener(ev, () => mostrar(false), true));
    marca.setAttribute('tabindex', '0'); marca.setAttribute('role', 'button'); marca.setAttribute('aria-label', 'Qué incluye');
    marca.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); mostrar(globo.classList.contains('opacity-0')); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') mostrar(false); });
  });
  /* 4. El carrito lo lleva carrito.js (estado real, persistencia, cierre). */

  /* 5. Enlaces muertos.
     Todo lo que apuntaba a rutas de la tienda real (carrito, cuenta, checkout)
     se neutraliza para que el clon no intente salir a aminoclub.com. */
  $$('a[href^="/"]').forEach((a) => {
    const h = a.getAttribute('href');
    if (h === 'index.html' || h === 'store.html') return;
    a.setAttribute('data-href-original', h);
    a.setAttribute('href', '#');
    a.addEventListener('click', (e) => e.preventDefault());
  });
})();

/* 3d. Los viales flotantes de los héroes (FAQ, certificados…) perdían el giro.
   Traen el giro en el transform inline (rotate(-6deg), rotate(14deg)…) Y la
   clase animate-float, cuyos keyframes animan `transform: translateY(...)`.
   Una animación en marcha sustituye el transform ENTERO, así que el rotate
   desaparecía y los viales salían perfectamente rectos, "parados". Los dos que
   no llevan animación conservaban su giro, lo que delató la causa.
   Aquí se saca el giro a la propiedad `rotate`, que la animación no toca y se
   compone con ella. Y se le da un poco más de ángulo, como en la referencia. */
(() => {
  document.querySelectorAll('[class*="animate-float"][style*="rotate("]').forEach((el) => {
    const m = (el.style.transform || '').match(/rotate\((-?[\d.]+)deg\)/);
    if (!m) return;
    const grados = parseFloat(m[1]);
    /* ×1,3 y no más: con ×1,6 el Agua Bac del héroe de contacto pisaba el
       texto en portátil (la caja de un vial girado crece con el ángulo). */
    el.style.rotate = (grados * 1.3).toFixed(1) + 'deg';   /* −6 → −7.8, 18 → 23.4 */
    el.style.transform = el.style.transform.replace(/\s*rotate\([^)]*\)/, '');
  });
})();
