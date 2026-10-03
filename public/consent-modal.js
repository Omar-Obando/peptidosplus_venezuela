/* consent-modal.js — Modal de consentimiento (uso investigativo, mayoría de edad,
 * términos, privacidad y descargo de responsabilidad).
 *
 * · Se muestra la primera vez (localStorage pp_consent_v1) y bloquea el scroll.
 * · No aparece en las páginas legales, para que el visitante pueda leerlas.
 * · Estilo de la casa: navy #0a192f, dorado #e9c46a, Anek Telugu (texto) y Poppins (botones).
 */
(function () {
  'use strict';

  var KEY = 'pp_consent_v1';
  var LEGAL_PATHS = ['/terminos', '/privacidad', '/descargo-de-responsabilidad'];
  var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

  try {
    if (localStorage.getItem(KEY)) return; // ya aceptó
  } catch (e) { /* almacenamiento no disponible: se muestra siempre */ }

  if (LEGAL_PATHS.indexOf(path) !== -1) return; // en las páginas legales no se estorba

  var NAVY = '#0a192f';
  var GOLD = '#e9c46a';
  var TXT = '#c9d5e6';
  var TXT_DIM = '#8fa2be';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function build() {
    var wrap = document.createElement('div');
    wrap.id = 'pp-consent';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'pp-consent-titulo');
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;' +
      'padding:16px;background:rgba(4,12,24,.74);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);';

    var chk = [
      'Confirmo que soy <b>mayor de 18 años</b>.',
      'Entiendo que los productos son de <b>uso exclusivamente investigativo</b> (laboratorio, entornos controlados) y que <b>no son medicamentos</b> ni están aprobados para consumo humano o veterinario.',
      'Acepto los <a href="/terminos" style="color:' + GOLD + ';text-decoration:underline;">Términos y condiciones</a>, la <a href="/privacidad" style="color:' + GOLD + ';text-decoration:underline;">Política de privacidad</a> y el <a href="/descargo-de-responsabilidad" style="color:' + GOLD + ';text-decoration:underline;">Descargo de responsabilidad</a>.'
    ];

    var items = chk.map(function (t, i) {
      return (
        '<label style="display:flex;gap:10px;align-items:flex-start;margin:0 0 12px;cursor:pointer;line-height:1.5;">' +
        '<input type="checkbox" data-pp-consent-chk style="margin-top:3px;width:18px;height:18px;flex:0 0 auto;accent-color:' + GOLD + ';cursor:pointer;">' +
        '<span style="color:' + TXT + ';font-size:14.5px;">' + t + '</span></label>'
      );
    }).join('');

    wrap.innerHTML =
      '<div style="width:100%;max-width:560px;max-height:88vh;overflow:auto;background:' + NAVY + ';' +
      'border:1px solid rgba(233,196,106,.35);border-radius:18px;padding:clamp(20px,3vw,30px);' +
      'box-shadow:0 24px 60px rgba(0,0,0,.5);font-family:\'Anek Telugu\',system-ui,sans-serif;text-align:left;">' +
        '<p style="margin:0 0 6px;font-family:\'JetBrains Mono\',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:' + GOLD + ';">Peptidos Plus</p>' +
        '<h2 id="pp-consent-titulo" style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#fff;">Antes de continuar</h2>' +
        '<p style="margin:0 0 18px;color:' + TXT + ';font-size:14.5px;line-height:1.6;">Los productos de Peptidos Plus son insumos de investigación con certificado de análisis, destinados <b>exclusivamente a investigación científica en entornos controlados</b>. No son medicamentos ni están aprobados para uso humano o veterinario.</p>' +
        '<div style="border-top:1px solid rgba(255,255,255,.1);padding-top:16px;margin-bottom:6px;">' + items + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:flex-end;margin-top:16px;">' +
          '<a href="https://www.google.com" rel="nofollow noopener" style="margin-right:auto;color:' + TXT_DIM + ';font-size:13.5px;text-decoration:underline;">No acepto, salir del sitio</a>' +
          '<button type="button" data-pp-consent-ok disabled style="height:44px;padding:0 20px;border:0;border-radius:999px;' +
            'font-family:\'Poppins\',\'Anek Telugu\',system-ui,sans-serif;font-weight:600;font-size:14px;' +
            'background:' + GOLD + ';color:' + NAVY + ';cursor:pointer;opacity:.45;">Acepto y continúo</button>' +
        '</div>' +
        '<p style="margin:14px 0 0;color:' + TXT_DIM + ';font-size:12px;line-height:1.55;">Al continuar declaras que la información anterior es cierta y asumes la responsabilidad del manejo, almacenamiento y uso posterior del material.</p>' +
      '</div>';

    return wrap;
  }

  function open() {
    var el = build();
    document.body.appendChild(el);

    var checks = Array.prototype.slice.call(el.querySelectorAll('[data-pp-consent-chk]'));
    var ok = el.querySelector('[data-pp-consent-ok]');

    function sync() {
      var all = checks.every(function (c) { return c.checked; });
      ok.disabled = !all;
      ok.style.opacity = all ? '1' : '.45';
      ok.style.cursor = all ? 'pointer' : 'default';
    }
    checks.forEach(function (c) { c.addEventListener('change', sync); });

    ok.addEventListener('click', function () {
      if (ok.disabled) return;
      try {
        localStorage.setItem(KEY, JSON.stringify({ v: 1, t: new Date().toISOString(), path: path }));
      } catch (e) { /* noop */ }
      document.documentElement.style.overflow = '';
      el.remove();
    });

    // Bloquea el scroll de fondo y deja el foco dentro del diálogo.
    document.documentElement.style.overflow = 'hidden';
    if (checks[0]) checks[0].focus();

    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Tab') {
        var f = el.querySelectorAll('input,button,a[href]');
        if (!f.length) return;
        var first = f[0];
        var last = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
      if (ev.key === 'Escape') ev.preventDefault(); // no se cierra sin aceptar
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', open);
  } else {
    open();
  }
  // esc helper reservado para futuras variantes con texto dinámico
  void esc;
})();
