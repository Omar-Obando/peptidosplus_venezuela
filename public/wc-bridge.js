/* Peptidos Plus — wc-bridge.js
 *
 * Puente entre el carrito del DISEÑO ORIGINAL (carrito.js, localStorage
 * "pp_clon_carrito_v1") y WooCommerce headless. Se inyecta en las páginas
 * .html originales (store.html, producto-*.html, index.html...) y hace que:
 *
 *  - Los botones "Añadir al carrito" (data-pp-anadir / aria-label "Añadir X
 *    al carrito") de las tarjetas y fichas del original añadan el item al
 *    carrito WooCommerce (id, variation/dosis, precio) y abran el drawer
 *    original (carrito.js ya lo pinta desde el mismo localStorage).
 *  - Las PRESENTACIONES (data-pp-pres con data-precio/data-dosis) actualicen
 *    el precio/data-pp-precio y el Añadir use la dosis seleccionada como
 *    variation_id (variación WooCommerce) o attribute dosis.
 *  - Al visitar /carrito o /finalizar-compra, se empuja el contenido de
 *    pp_clon_carrito_v1 hacia el carrito WooCommerce (cart.ts usa el mismo
 *    localStorage "phantomwp_cart" solo si la página lo inicializa; este
 *    bridge es la fuente de verdad para las páginas estáticas).
 *
 * No reemplaza el drawer original: lo deja intacto (diseño 100%).
 */
(function () {
    'use strict';
    var CLAVE = 'pp_clon_carrito_v1';
    var WC_KEY = 'phantomwp_cart';

    function readItems() {
        try {
            var items = JSON.parse(localStorage.getItem(CLAVE) || '[]');
            return Array.isArray(items) ? items : [];
        } catch (e) { return []; }
    }
    function writeItems(items) {
        try { localStorage.setItem(CLAVE, JSON.stringify(items)); } catch (e) { /* noop */ }
        // Reflejar también en phantomwp_cart para las páginas Astro (cart/checkout)
        try {
            localStorage.setItem(WC_KEY, JSON.stringify(items.map(function (it) {
                return {
                    id: Number(it.id) || it.id,
                    variation_id: it.dosis ? Number(it.variation_id) : undefined,
                    name: it.nombre || it.name,
                    price: Number(it.precio || it.price || 0),
                    quantity: Number(it.cant || it.quantity || 1),
                    image: it.img || it.image || '',
                    sku: it.sku || '',
                    attributes: it.dosis ? { dosis: it.dosis } : undefined,
                };
            })));
            window.dispatchEvent(new CustomEvent('pp-cart-sync'));
        } catch (e) { /* noop */ }
    }

    // Normaliza un item del carrito original -> WooCommerce
    function toWcItem(retail) {
        var present = retail.dosis || retail.variation_name || '';
        return {
            id: Number(retail.id) || 0,
            variation_id: retail.variation_id ? Number(retail.variation_id) : (present ? 0 : undefined),
            name: retail.nombre || retail.name || '',
            price: Number(retail.precio || retail.price || 0),
            quantity: Number(retail.cant || retail.quantity || 1),
            image: retail.img || retail.image || '',
            sku: retail.sku || '',
            attributes: present ? { dosis: present } : undefined,
        };
    }

    // Rellena el precio de un botón "añadir" de tarjeta según data-pp-precio-num
    function bindAddButtons() {
        // Botones del catálogo (tarjetas): aria-label "Añadir {nombre} al carrito"
        document.querySelectorAll('[aria-label^="Añadir "][aria-label$=" al carrito"]').forEach(function (btn) {
            if (btn.__wcBridge) return;
            btn.__wcBridge = true;
            btn.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                var card = btn.closest('[data-pp-nombre], article');
                var name = (btn.getAttribute('aria-label') || '').replace(/^Añadir\s+/i, '').replace(/\s+al carrito$/i, '');
                var id = 0, precio = 0, dosis = '';
                if (card) {
                    id = Number(card.getAttribute('data-product-id') || card.getAttribute('data-id') || 0);
                    precio = Number(card.getAttribute('data-pp-precio-num') || btn.getAttribute('data-price') || 0);
                    name = name || card.getAttribute('data-pp-nombre') || '';
                }
                precio = precio || Number(btn.getAttribute('data-price') || 0);
                // Toma el id real del producto desde window.PP_PRODUCTOS si existe
                if (window.PP_PRODUCTOS && window.PP_PRODUCTOS.productos) {
                    var found = window.PP_PRODUCTOS.productos.find(function (p) { return (p.nombre || '').toLowerCase() === String(name).toLowerCase(); });
                    if (found) id = encodeURIComponent(found.pagina || '');
                }
                var items = readItems();
                items.push({ id: id, nombre: name, cantidad: 1, precio: precio, img: '', dosis: dosis });
                writeItems(items);
                // Abrir drawer original (carrito.js escucha este input/key)
                document.querySelector('[data-pp-carrito-abrir]')?.click();
                var navCart = document.querySelector('[data-testid="nav-cart-link"]');
                if (navCart) navCart.click();
            }, true);
        });

        // Ficha de producto: data-pp-anadir (usa última presentación + cantidad + pack)
        var anadir = document.querySelector('[data-pp-anadir]');
        if (anadir && !anadir.__wcBridge) {
            anadir.__wcBridge = true;
            anadir.addEventListener('click', function () {
                var fich = anadir.closest('[data-pp-anadir]') || document;
                var pres = document.querySelector('[data-pp-pres][aria-pressed="true"]');
                var precio = Number(pres ? pres.getAttribute('data-precio') : (anadir.getAttribute('data-pp-unitario') || anadir.dataset.ppUnitario || 0));
                var dosis = pres ? pres.getAttribute('data-dosis') || '' : '';
                var nombre = (document.querySelector('h1') || {}).textContent || '';
                var qty = Number((document.querySelector('[data-pp-qty]') || {}).textContent || 1);
                var pack = document.querySelector('[data-pp-pack][aria-pressed="true"]');
                var packCount = pack ? Number(pack.getAttribute('data-count') || 1) : 1;
                var dto = pack ? Number(pack.getAttribute('data-dto') || 0) : 0;
                var unit = precio * (1 - dto / 100);
                var items = readItems();
                items.push({
                    id: (document.getElementById('product-slate') ? JSON.parse(document.getElementById('product-slate').textContent).id : 0),
                    nombre: nombre, cant: qty * packCount, precio: Math.round(unit * 100) / 100,
                    img: (document.getElementById('pp-vial-img') || {}).src || '', dosis: dosis,
                });
                writeItems(items);
                var navCart = document.querySelector('[data-testid="nav-cart-link"]');
                if (navCart) navCart.click();
            }, true);
        }
    }

    // Re-sincroniza cuando /carrito (Astro) está abierto: ese usa cart.ts
    document.addEventListener('pp-cart-sync', function () {
        try { window.dispatchEvent(new Event('cart-updated')); } catch (e) {}
    });

    function init() {
        bindAddButtons();
        // Robusto con SPA/estados tardíos
        var mo = new MutationObserver(function () { bindAddButtons(); });
        if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
