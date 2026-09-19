/* Certificados en la tienda (2026-09-10).
 *
 * Tres piezas que comparten el registro de assets/datos/coas.js (generado
 * desde coas.ts / etiquetas.ts / codigos.ts del proyecto web):
 *
 *  1. La vista previa. Cualquier enlace a un test de Janoshik (las tarjetas
 *     de "Cada lote con su registro", las de /certificados, los botones del
 *     bloque "Resultados verificados") abre el certificado en una ventana
 *     encima de la página, con la lista de los demás certificados del
 *     producto al lado y el enlace para verificarlo en el laboratorio. Si el
 *     test no tiene captura, el enlace sigue yendo a Janoshik.
 *  2. La pastilla "Certificado" del héroe de la ficha: abre el certificado de
 *     pureza de la presentación elegida (o el de referencia del producto).
 *  3. El buscador del cierre: por CÓD. de la etiqueta, nombre o número de
 *     test; agrupa por producto y presentación. */
(() => {
  'use strict';
  const DATOS = window.PP_COAS || [];
  if (!DATOS.length) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- índice ---------- */
  const porSlug = {};
  const porTest = {};
  const porCodigo = {};
  DATOS.forEach((p) => {
    porSlug[p.slug] = p;
    p.codigos.forEach((c) => { porCodigo[c] = p; });
    p.reportes.forEach((r) => { if (!porTest[r.test]) porTest[r.test] = { r, p }; });
  });
  const mgNum = (s) => parseFloat(String(s).replace(',', '.')) || 0;
  const ordenReportes = (a, b) =>
    mgNum(a.mg) - mgNum(b.mg) || (a.tipo === b.tipo ? 0 : a.tipo === 'Pureza' ? -1 : 1) || Number(b.test) - Number(a.test);
  const etiquetaTipo = (r) => (r.tipo === 'Pureza' ? 'Pureza (HPLC)' : 'Endotoxinas (LAL)');
  const nombreReporte = (p, r) => (r.componente || p.nombre) + ' · ' + r.mg;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- 1. vista previa ---------- */
  let modal = null;
  let ultimoFoco = null;
  const ICONO_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>';
  const ICONO_EXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg>';
  const ICONO_BAJAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/></svg>';

  function crearModal() {
    const m = document.createElement('div');
    m.className = 'pp-coa-modal';
    m.hidden = true;
    m.innerHTML =
      '<div class="pp-coa-modal-fondo" data-pp-coa-cerrar></div>' +
      '<div class="pp-coa-modal-caja" role="dialog" aria-modal="true" aria-labelledby="pp-coa-modal-titulo" aria-describedby="pp-coa-modal-sub">' +
        '<header class="pp-coa-modal-cab">' +
          '<div class="pp-coa-modal-id">' +
            '<span class="pp-coa-modal-icono">' + ICONO_DOC + '</span>' +
            '<div class="pp-coa-modal-textos"><h2 id="pp-coa-modal-titulo">Certificado de análisis</h2><p id="pp-coa-modal-sub" class="pp-coa-modal-sub"></p></div>' +
          '</div>' +
          '<div class="pp-coa-modal-acciones">' +
            '<a class="pp-coa-modal-verificar" target="_blank" rel="noopener noreferrer" href="#">Verificar en Janoshik' + ICONO_EXT + '</a>' +
            '<a class="pp-coa-modal-bajar" download href="#" title="Descargar la captura" aria-label="Descargar la captura del certificado">' + ICONO_BAJAR + '</a>' +
            '<button type="button" class="pp-coa-modal-cerrar" data-pp-coa-cerrar aria-label="Cerrar la vista previa">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
            '</button>' +
          '</div>' +
        '</header>' +
        '<div class="pp-coa-modal-cuerpo">' +
          '<nav class="pp-coa-modal-lista" aria-label="Otros certificados del producto"></nav>' +
          '<div class="pp-coa-modal-visor"><img alt="" width="720" height="1062" decoding="async"><p class="pp-coa-modal-pie">Cada certificado lleva una clave única; con ella se comprueba en el portal del laboratorio que el documento es el que emitió Janoshik.</p></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target.closest('[data-pp-coa-cerrar]')) cerrar(); });
    m.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cerrar(); return; }
      if (e.key !== 'Tab') return;
      const focables = $$('a[href], button:not([disabled])', m).filter((el) => el.offsetParent !== null);
      if (!focables.length) return;
      const primero = focables[0], ultimo = focables[focables.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    });
    return m;
  }

  function pintar(p, r) {
    const m = modal;
    $('.pp-coa-modal-sub', m).innerHTML =
      '<b>' + esc(nombreReporte(p, r)) + '</b> · ' + etiquetaTipo(r) + ' · Janoshik Analytical · test ' + esc(r.test);
    const ver = $('.pp-coa-modal-verificar', m);
    ver.href = r.url;
    const bajar = $('.pp-coa-modal-bajar', m);
    bajar.href = r.img;
    bajar.setAttribute('download', 'certificado-' + p.slug + '-' + r.test + r.img.slice(r.img.lastIndexOf('.')));
    const img = $('.pp-coa-modal-visor img', m);
    img.src = r.img;
    img.alt = 'Certificado de análisis de ' + nombreReporte(p, r) + ', test ' + r.test + ' de Janoshik Analytical';
    $('.pp-coa-modal-visor', m).scrollTop = 0;

    const lista = $('.pp-coa-modal-lista', m);
    const otros = p.reportes.slice().sort(ordenReportes);
    lista.setAttribute('aria-label', 'Certificados de ' + p.nombre);
    lista.innerHTML =
      '<p class="pp-coa-modal-lista-t">' + esc(p.nombre) + '<span>' + otros.length + (otros.length === 1 ? ' certificado' : ' certificados') + '</span></p>' +
      otros.map((o) => {
        const actual = o.test === r.test;
        const texto = '<span class="pp-coa-modal-lista-mg">' + esc(o.componente ? o.componente + ' ' + o.mg : o.mg) + '</span><span class="pp-coa-modal-lista-meta">' + (o.tipo === 'Pureza' ? 'Pureza' : 'Endotoxinas') + ' · ' + esc(o.test) + '</span>';
        return o.img
          ? '<button type="button" class="pp-coa-modal-lista-item' + (actual ? ' on' : '') + '" data-pp-coa-test="' + esc(o.test) + '"' + (actual ? ' aria-current="true"' : '') + '>' + texto + '</button>'
          : '<a class="pp-coa-modal-lista-item externo" href="' + esc(o.url) + '" target="_blank" rel="noopener noreferrer">' + texto + ICONO_EXT + '</a>';
      }).join('');
    m.classList.toggle('una', otros.length < 2);
  }

  function abrir(p, r) {
    if (!r.img) { window.open(r.url, '_blank', 'noopener'); return; }
    if (!modal) modal = crearModal();
    const yaAbierto = !modal.hidden;
    pintar(p, r);
    if (!yaAbierto) {
      ultimoFoco = document.activeElement;
      modal.hidden = false;
      document.documentElement.classList.add('pp-coa-modal-abierto');
      requestAnimationFrame(() => modal.classList.add('visible'));
    }
    $('.pp-coa-modal-cerrar', modal).focus();
  }

  function cerrar() {
    if (!modal || modal.hidden) return;
    modal.classList.remove('visible');
    modal.hidden = true;
    document.documentElement.classList.remove('pp-coa-modal-abierto');
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }

  const abrirTest = (test) => { const e = porTest[test]; if (e) abrir(e.p, e.r); return !!e; };

  // Enlaces a Janoshik y botones con data-pp-coa-test, en toda la página
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const boton = e.target.closest('[data-pp-coa-test]');
    if (boton) { if (abrirTest(boton.getAttribute('data-pp-coa-test'))) e.preventDefault(); return; }
    const enlace = e.target.closest('a[href*="janoshik.com/tests/"]');
    if (!enlace || enlace.closest('.pp-coa-modal')) return;
    const test = (enlace.getAttribute('href').match(/\/tests\/(\d+)/) || [])[1];
    const entrada = test && porTest[test];
    if (entrada && entrada.r.img) { e.preventDefault(); abrir(entrada.p, entrada.r); }
  });

  /* ---------- 2. pastilla del héroe ---------- */
  const reporteDeLaFicha = (p) => {
    const fichaDe = $('[data-pp-coa-ficha]');
    const esLaFicha = fichaDe && fichaDe.getAttribute('data-pp-coa-ficha') === p.slug;
    const elegido = esLaFicha ? $('[data-pp-pres][aria-pressed="true"]') : null;
    const dosis = elegido && (elegido.getAttribute('data-dosis') || '').replace(/\s+/g, '').toLowerCase();
    const conImg = p.reportes.filter((r) => r.img);
    const mismaDosis = conImg.filter((r) => r.mg.replace(/\s+/g, '').toLowerCase() === dosis);
    const pureza = (lista) => lista.filter((r) => r.tipo === 'Pureza').sort((a, b) => Number(b.test) - Number(a.test))[0];
    return pureza(mismaDosis) || mismaDosis[0]
      || (p.pureza && conImg.find((r) => r.test === p.pureza.test))
      || pureza(conImg) || conImg[0] || p.reportes[0];
  };
  $$('[data-pp-coa-abrir]').forEach((b) => {
    const p = porSlug[b.getAttribute('data-pp-coa-abrir')];
    if (!p || !p.reportes.length) { b.hidden = true; return; }
    b.addEventListener('click', (e) => { e.preventDefault(); abrir(p, reporteDeLaFicha(p)); });
  });

  /* ---------- 3. buscador ---------- */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+]+/g, ' ').trim();
  const pajar = (p) => norm(p.nombre + ' ' + p.alias + ' ' + p.reportes.map((r) => r.componente || '').join(' '));

  function buscar(q) {
    const digitos = q.replace(/\D/g, '');
    const texto = norm(q);
    // Solo números: primero el CÓD. de la etiqueta, luego el número de test
    if (digitos.length >= 3 && /^[\d\s.#º°-]*$/i.test(q.replace(/c[oó]d\.?/i, ''))) {
      if (porCodigo[digitos]) return [{ p: porCodigo[digitos], tests: null, porCodigo: digitos }];
      const tests = Object.keys(porTest).filter((t) => t.startsWith(digitos));
      if (tests.length) {
        const grupos = new Map();
        tests.forEach((t) => { const p = porTest[t].p; if (!grupos.has(p)) grupos.set(p, []); grupos.get(p).push(t); });
        return Array.from(grupos, ([p, ts]) => ({ p, tests: ts }));
      }
      return [];
    }
    if (texto.length < 2) return null;
    const tokens = texto.split(' ');
    return DATOS.filter((p) => { const h = pajar(p); return tokens.every((t) => h.includes(t)); }).map((p) => ({ p, tests: null }));
  }

  function pintarGrupo(g) {
    const p = g.p;
    const cab =
      '<div class="pp-coa-res-cab">' +
        '<img class="pp-coa-res-vial" src="' + esc(p.vial) + '" alt="" width="40" height="52" loading="lazy" decoding="async">' +
        '<div class="pp-coa-res-quien"><p class="pp-coa-res-nombre">' + esc(p.nombre) + '<span>CÓD. ' + esc(p.codigos[0]) + '</span></p>' +
        '<p class="pp-coa-res-meta">' + (p.reportes.length ? p.reportes.length + (p.reportes.length === 1 ? ' certificado' : ' certificados') + ' · Janoshik Analytical' : 'Análisis pendiente') + '</p></div>' +
        '<a class="pp-coa-res-ficha" href="' + esc(p.pagina) + '">Ver ficha<span aria-hidden="true"> →</span></a>' +
      '</div>';
    if (!p.reportes.length) {
      return '<article class="pp-coa-res-grupo pendiente">' + cab +
        '<p class="pp-coa-res-pendiente">El certificado de este lote se publica cuando llega del laboratorio. Si ya tienes el vial, <a href="contacto.html">escríbenos</a> con el código de la etiqueta.</p></article>';
    }
    const filtro = g.tests ? new Set(g.tests) : null;
    const porMg = new Map();
    p.reportes.slice().sort(ordenReportes).forEach((r) => {
      if (filtro && !filtro.has(r.test)) return;
      const clave = r.componente ? r.componente + ' · ' + r.mg : r.mg;
      if (!porMg.has(clave)) porMg.set(clave, []);
      porMg.get(clave).push(r);
    });
    const filas = Array.from(porMg, ([mg, rs]) =>
      '<li class="pp-coa-res-fila"><span class="pp-coa-res-mg">' + esc(mg) + '</span><span class="pp-coa-res-chips">' +
      rs.map((r) => r.img
        ? '<button type="button" class="pp-coa-res-chip" data-pp-coa-test="' + esc(r.test) + '"><i></i>' + (r.tipo === 'Pureza' ? 'Pureza' : 'Endotoxinas') + ' · ' + esc(r.test) + '</button>'
        : '<a class="pp-coa-res-chip externo" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer"><i></i>' + (r.tipo === 'Pureza' ? 'Pureza' : 'Endotoxinas') + ' · ' + esc(r.test) + ICONO_EXT + '</a>'
      ).join('') + '</span></li>').join('');
    return '<article class="pp-coa-res-grupo">' + cab + '<ul class="pp-coa-res-filas">' + filas + '</ul></article>';
  }

  $$('[data-pp-coa-busca]').forEach((caja) => {
    const input = $('input', caja);
    const salida = $('[data-pp-coa-resultados]', caja);
    const form = $('form', caja);
    if (!input || !salida) return;
    let ultima = '';
    const correr = () => {
      const q = input.value.trim();
      if (q === ultima) return;
      ultima = q;
      const res = buscar(q);
      if (res === null) { salida.hidden = true; salida.innerHTML = ''; caja.classList.remove('con-resultados'); return; }
      salida.innerHTML = res.length
        ? res.slice(0, 6).map(pintarGrupo).join('') + (res.length > 6 ? '<p class="pp-coa-res-mas">Hay ' + (res.length - 6) + ' productos más; afina la búsqueda.</p>' : '')
        : '<p class="pp-coa-res-nada">No encontramos nada con «' + esc(q) + '». Revisa el código de la etiqueta (CÓD., seis dígitos) o <a href="contacto.html">escríbenos</a> con una foto del vial.</p>';
      salida.hidden = false;
      caja.classList.add('con-resultados');
    };
    input.addEventListener('input', correr);
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); ultima = ''; correr(); });
    if (input.value) correr();
  });

  window.PP_CERTIFICADOS = { abrirTest, cerrar, buscar };
})();
