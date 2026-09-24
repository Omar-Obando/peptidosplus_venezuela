/* Buscador de péptidos del cierre del home (2026-09-10).
 * "¿Qué péptido buscas?": escribe el nombre (o para qué lo investigas), o
 * elige una familia, y te llevamos a la ficha. Lee assets/datos/productos.js
 * (generado desde las tarjetas del catálogo). Enter con un solo resultado
 * abre la ficha; con varios, el enlace "Ver en el catálogo" lleva a store.html
 * con la misma búsqueda (?q= / ?cat=), que el catálogo ya entiende. */
(() => {
  'use strict';
  const D = window.PP_PRODUCTOS;
  if (!D || !D.productos || !D.productos.length) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+]+/g, ' ').trim();
  const usd = (n) => '$' + Number(n).toFixed(2);
  const MAX = 8;
  // Cada token tiene que empezar una palabra: "reta" es Retatrutida, no el
  // "sec-reta-gogo" de los GHRH.
  const pajar = D.productos.map((p) => ' ' + norm(p.nombre + ' ' + p.busca + ' ' + p.sub + ' ' + p.familiaEtiqueta));

  function buscar(q, familia) {
    const texto = norm(q);
    if (!texto && !familia) return null;
    const tokens = texto ? texto.split(' ') : [];
    return D.productos.filter((p, i) => (!familia || p.familia === familia) && tokens.every((t) => pajar[i].includes(' ' + t)));
  }

  const fila = (p) =>
    '<a class="pp-busca-pep-fila" href="' + esc(p.pagina) + '">' +
      '<img src="' + esc(p.img) + '" alt="" width="44" height="55" loading="lazy" decoding="async">' +
      '<span class="pp-busca-pep-quien"><b>' + esc(p.nombre) + '</b><span>' + esc(p.sub) + '</span></span>' +
      (p.coa ? '<span class="pp-busca-pep-coa"><i></i>Certificado</span>' : '') +
      '<span class="pp-busca-pep-precio"><small>Desde</small>' + usd(p.desde) + '</span>' +
      '<span class="pp-busca-pep-ir" aria-hidden="true">→</span>' +
    '</a>';

  $$('[data-pp-busca-pep]').forEach((caja) => {
    const input = $('input', caja);
    const form = $('form', caja);
    const salida = $('[data-pp-busca-pep-res]', caja);
    const chips = $$('[data-pp-familia]', caja);
    if (!input || !salida) return;
    let familia = '';
    let actual = [];

    const pintar = () => {
      const q = input.value.trim();
      const res = buscar(q, familia);
      actual = res || [];
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.getAttribute('data-pp-familia') === familia)));
      if (res === null) { salida.hidden = true; salida.innerHTML = ''; caja.classList.remove('con-resultados'); return; }
      const enlaceCatalogo = 'store.html' + (q || familia ? '?' + [q ? 'q=' + encodeURIComponent(q) : '', familia ? 'cat=' + encodeURIComponent(familia) : ''].filter(Boolean).join('&') : '');
      if (!res.length) {
        salida.innerHTML = '<p class="pp-busca-pep-nada">No encontramos «' + esc(q) + '»' + (familia ? ' en esa familia' : '') + '. <a href="/store">Mira el catálogo completo</a> o <a href="/contacto">escríbenos</a>.</p>';
      } else {
        const etiqueta = familia && chips.find((c) => c.getAttribute('data-pp-familia') === familia);
        salida.innerHTML =
          '<p class="pp-busca-pep-cuenta">' + res.length + (res.length === 1 ? ' péptido' : ' péptidos') + (etiqueta ? ' en ' + esc(etiqueta.textContent.trim()) : '') + (q ? ' para «' + esc(q) + '»' : '') + (res.length === 1 ? ' · pulsa Enter para abrir la ficha' : '') + '</p>' +
          '<div class="pp-busca-pep-lista">' + res.slice(0, MAX).map(fila).join('') + '</div>' +
          (res.length > MAX ? '<a class="pp-busca-pep-mas" href="' + esc(enlaceCatalogo) + '">Ver los ' + res.length + ' en el catálogo<span aria-hidden="true"> →</span></a>' : '');
      }
      salida.hidden = false;
      caja.classList.add('con-resultados');
    };

    input.addEventListener('input', pintar);
    chips.forEach((c) => c.addEventListener('click', (e) => {
      e.preventDefault();
      familia = c.getAttribute('data-pp-familia') === familia ? '' : c.getAttribute('data-pp-familia');
      pintar();
      input.focus();
    }));
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      pintar();
      if (actual.length === 1) { location.href = actual[0].pagina; return; }
      if (!actual.length && !input.value.trim() && !familia) { location.href = 'store.html'; }
    });
    if (input.value) pintar();
  });

  window.PP_BUSCADOR_PEPTIDOS = { buscar };
})();
