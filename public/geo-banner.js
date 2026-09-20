/* Peptidos Plus — Geo banner (páginas estáticas).
 * Detecta el país del visitante vía /api/geo-country (lee CF-IPCountry en el worker)
 * y muestra el banner "¿Ir a Nicaragua o continuar en Venezuela?" si difiere del país
 * del sitio (VE). Recuerda la elección en localStorage (pp_country_choice_*).
 * Se inyecta en las páginas .html estáticas (home, store, artículos) que no pasan
 * por el SSR de Astro pero sí por el Worker/Cloudflare (que añade CF-IPCountry).
 */
(function () {
  'use strict';
  var SITE_COUNTRY = 'VE';
  var OTHER_URL = 'https://ni.peptidosplus.com';
  var OTHER_LABEL = 'Nicaragua';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function hasChoice(country) {
    try { return localStorage.getItem('pp_choice_' + country) === 'decided'; } catch (e) { return false; }
  }
  function persist(country) {
    try { localStorage.setItem('pp_choice_' + country, 'decided'); } catch (e) { /* noop */ }
  }

  function showBanner(country, label) {
    var currentSiteLabel = SITE_COUNTRY === 'VE' ? 'Venezuela' : 'Nicaragua';
    var el = document.createElement('div');
    el.id = 'pp-geo-banner';
    el.className = 'pp-geo-banner';
    el.setAttribute('data-detect-country', country);
    el.setAttribute('data-current-country', SITE_COUNTRY);
    el.innerHTML =
      '<div class="pp-geo-banner-inner">' +
        '<div class="pp-geo-banner-flags"><span class="pp-geo-flag">🌎</span></div>' +
        '<div class="pp-geo-banner-text"><strong>Pareces estar en ' + esc(label) + '</strong>' +
          '<p>¿Quieres ir al sitio de ' + esc(label) + ' (<b>' + esc(OTHER_URL.replace('https://', '')) + '</b>) o continuar en el de ' + esc(currentSiteLabel) + ' (<b>peptidosplus.com</b>)?</p></div>' +
        '<div class="pp-geo-banner-actions">' +
          '<a href="' + OTHER_URL + '" class="pp-geo-btn pp-geo-btn-primario" data-pp-geo-go>Ir a ' + esc(label) + ' <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a>' +
          '<button type="button" class="pp-geo-btn pp-geo-btn-secundario" data-pp-geo-stay>Continuar en ' + esc(currentSiteLabel) + '</button>' +
          '<button type="button" class="pp-geo-close" data-pp-geo-close aria-label="Cerrar aviso">×</button>' +
        '</div>' +
      '</div>';
    // style inline (las hojas de marca no la definen en estaticos; reutiliza .pp-geo-* css si existe, sino inline)
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#0a192f;color:#fff;box-shadow:0 6px 24px rgba(10,25,47,.25);transform:translateY(-110%);transition:transform .45s cubic-bezier(.22,1,.36,1);font-family:Poppins,sans-serif;';
    el.querySelector('.pp-geo-banner-inner').style.cssText = 'max-width:1200px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;';
    el.querySelector('.pp-geo-banner-text p').style.cssText = 'font-size:12.5px;color:rgba(255,255,255,.8);margin:2px 0 0;';
    el.querySelector('.pp-geo-banner-text strong').style.cssText = 'display:block;font-size:14px;';
    el.querySelectorAll('.pp-geo-btn').forEach(function (b) {
      b.style.cssText = 'border:none;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px;border-radius:999px;font-size:13px;font-weight:600;transition:all .2s;';
    });
    var primario = el.querySelector('[data-pp-geo-go]');
    if (primario) primario.style.cssText += 'background:#e9c46a;color:#0a192f;';
    var secundario = el.querySelector('[data-pp-geo-stay]');
    if (secundario) secundario.style.cssText += 'background:#fff;color:#0a192f;';
    var close = el.querySelector('[data-pp-geo-close]');
    if (close) close.style.cssText = 'background:transparent;border:none;color:rgba(255,255,255,.7);font-size:22px;cursor:pointer;padding:4px 8px;';

    document.body.insertBefore(el, document.body.firstChild);

    var dismiss = function () {
      persist(country);
      el.style.transform = 'translateY(-110%)';
      setTimeout(function () { el.remove(); }, 450);
    };
    el.querySelector('[data-pp-geo-stay]')?.addEventListener('click', dismiss);
    el.querySelector('[data-pp-geo-close]')?.addEventListener('click', dismiss);
    el.querySelector('[data-pp-geo-go]')?.addEventListener('click', function () { persist(country); });

    requestAnimationFrame(function () { el.style.transform = 'translateY(0)'; el.classList.add('pp-geo-visible'); });
  }

  fetch('/api/geo-country', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var country = (data && data.country || '').toUpperCase();
      if (!country || country === SITE_COUNTRY) return; // mismo país o desconocido: nada
      if (hasChoice(country)) return; // ya decidió
      var label = country === 'NI' ? 'Nicaragua' : (country === 'VE' ? 'Venezuela' : country);
      showBanner(country, label);
    })
    .catch(function () { /* sin país: no molestar */ });
})();
