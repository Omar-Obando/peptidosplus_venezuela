/* Señalar lo heredado de aminoclub — nada se borra, se marca.
 *
 * Los bloques que son de ellos (promociones, membresía, puntos, envío
 * exprés, purezas, enlaces a secciones que no tenemos…) llevan
 * data-heredado="explicación". Con ?marcar=1 en la URL (o el botón de abajo a
 * la izquierda) se resaltan en rojo y aparece la lista para decidir uno a uno.
 */
(() => {
  'use strict';
  const CLAVE = 'pp_marcar';
  const q = new URLSearchParams(location.search);
  let activo = false;
  try { if (q.has('marcar')) localStorage.setItem(CLAVE, q.get('marcar') === '0' ? '0' : '1'); activo = localStorage.getItem(CLAVE) === '1'; } catch (e) { activo = q.has('marcar'); }

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.id = 'pp-senalar';
  boton.textContent = activo ? 'Ocultar marcas' : 'Señalar lo heredado';
  boton.title = 'Resalta lo que sigue siendo de aminoclub para decidir qué hacer con ello';
  boton.addEventListener('click', () => { try { localStorage.setItem(CLAVE, activo ? '0' : '1'); } catch (e) { /* nada */ } const u = new URL(location.href); u.searchParams.set('marcar', activo ? '0' : '1'); location.href = u.toString(); });
  document.body.appendChild(boton);
  if (!activo) return;

  document.documentElement.setAttribute('data-marcar', '1');
  const marcados = Array.from(document.querySelectorAll('[data-heredado]')).filter((e) => !e.closest('#pp-carrito-montaje') || !document.getElementById('pp-carrito-montaje').hidden);
  const lista = document.createElement('aside');
  lista.id = 'pp-senalar-lista';
  const grupos = {};
  marcados.forEach((e) => { const k = e.getAttribute('data-heredado'); (grupos[k] = grupos[k] || []).push(e); });
  const claves = Object.keys(grupos);
  lista.innerHTML = '<h3>Heredado de aminoclub · ' + marcados.length + ' bloque' + (marcados.length === 1 ? '' : 's') + '</h3>' +
    '<p>Esto no lo tenemos o es dato de ellos. Nada está borrado: tú decides.</p>' +
    '<ol>' + claves.map((k, i) => '<li><button type="button" data-i="' + i + '">' + k + (grupos[k].length > 1 ? ' <b>×' + grupos[k].length + '</b>' : '') + '</button></li>').join('') + '</ol>' +
    '<p class="pp-nota">Los del panel del carrito (puntos, envío exprés, fechas) se ven al abrirlo.</p>';
  lista.addEventListener('click', (ev) => {
    const bt = ev.target.closest('button[data-i]'); if (!bt) return;
    const els = grupos[claves[Number(bt.dataset.i)]];
    const el = els.find((x) => x.getBoundingClientRect().height > 0) || els[0];
    if (el.closest('#pp-carrito-montaje') && window.ppCarrito) window.ppCarrito.abrir();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('pp-flash'); setTimeout(() => el.classList.remove('pp-flash'), 1600);
  });
  document.body.appendChild(lista);
})();
