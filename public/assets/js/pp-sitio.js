/* pp-sitio.js — menú del teléfono, contador y botón del carrito de la cabecera compartida.
   GENERADO a partir de la portada (public/index.html) con cromo-sitio.js: no editar a mano. */
(function () {
  'use strict';
  var CLAVE = 'pp_carrito_v1';
  // Carritos guardados con la clave anterior: se pasan a la nueva una sola vez (carrito.js hace lo mismo)
  try { var v = localStorage.getItem('pp_clon_carrito_v1'); if (v !== null) { if (localStorage.getItem(CLAVE) === null) localStorage.setItem(CLAVE, v); localStorage.removeItem('pp_clon_carrito_v1'); } } catch (e) { /* modo privado */ }
  var m = document.querySelector('[data-pp-menu]'), mb = document.querySelector('[data-pp-menu-btn]');
  function menu(abrir) {
    if (!m || !mb) return;
    m.classList.toggle('abierto', abrir); mb.setAttribute('aria-expanded', String(abrir));
    var pa = mb.querySelector('path'); if (pa) pa.setAttribute('d', abrir ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16');
  }
  if (mb) mb.addEventListener('click', function () { menu(!m.classList.contains('abierto')); });
  if (m) m.addEventListener('click', function (ev) { if (ev.target.closest('a')) menu(false); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && m && m.classList.contains('abierto')) { menu(false); if (mb) mb.focus(); } });

  function unidades() {
    try {
      var it = JSON.parse(localStorage.getItem(CLAVE) || '[]'), s = 0;
      (Array.isArray(it) ? it : []).forEach(function (x) { s += Number(x.cant || x.cantidad || x.qty || x.q || 1) || 1; });
      return s;
    } catch (e) { return 0; }
  }
  function pintar() {
    var n = unidades();
    document.querySelectorAll('[data-pp-carrito-n]').forEach(function (e) { e.textContent = String(n); });
    var b = document.querySelector('[data-pp-carrito]');   // el lector de pantalla también oye la cantidad
    if (b) b.setAttribute('aria-label', n ? 'Carrito, ' + n + (n === 1 ? ' producto' : ' productos') : 'Carrito vacío');
  }
  pintar();
  window.addEventListener('storage', pintar);
  window.addEventListener('cart-updated', pintar);

  // Con carrito lateral (#pp-carrito-montaje) lo abre carrito.js; sin él, a la página del carrito
  var c = document.querySelector('[data-pp-carrito]');
  if (c && !document.getElementById('pp-carrito-montaje')) c.addEventListener('click', function () { location.href = '/carrito'; });

  // enlace de la sección actual
  var ruta = (location.pathname.replace(/\/+$/, '') || '/').replace(/\.html$/, '');
  var ficha = !!document.querySelector('[data-pp-anadir]');
  document.querySelectorAll('header[data-pp-cromo] a[href^="/"]').forEach(function (a) {
    var h = a.getAttribute('href').replace(/\.html$/, '');
    if (h === '/' ? ruta === '/' || ruta === '/index' : (h === ruta || (h === '/tienda' && (ficha || /^\/(store|tienda)/.test(ruta))) || (h === '/blog' && /^\/(blog|articulo)/.test(ruta)))) a.setAttribute('aria-current', 'page');
  });
})();
