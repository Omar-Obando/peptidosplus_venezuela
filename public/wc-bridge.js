/* Peptidos Plus — wc-bridge.js
 *
 * Puente entre el carrito del DISEÑO ORIGINAL (carrito.js, localStorage
 * "pp_clon_carrito_v1") y WooCommerce headless. Se inyecta en las páginas
 * .html originales (store.html, producto-*.html, index.html...) y hace que:
 *
 *  - Los botones "Añadir al carrito" (data-pp-anadir / aria-label "Añadir X
 *    al carrito") de las tarjetas y fichas del original añadan el item al
 *    carrito WooCommerce (id, variation/dosis, precio) y abran el drawer.
 *  - Las PRESENTACIONES (data-pp-pres con data-precio/data-dosis) actualicen
 *    el precio/data-pp-precio y el Añadir use la dosis seleccionada.
 *  - STOCK POR VARIANTE (Opción A): consulta el stock real de las variaciones
 *    WooCommerce (wp-json/wc/v3/products/{id}/variations) y marca las
 *    presentaciones sin stock (data-pp-agotado + btn deshabilitado). El
 *    diseño original no se toca: solo se deshabilita el botón.
 *
 * No reemplaza el drawer original: lo deja intacto (diseño 100%).
 */
(function () {
    'use strict';
    var CLAVE = 'pp_clon_carrito_v1';
    var WC_KEY = 'phantomwp_cart';
    var API_BASE = '/wp-json/wc/v3';

    function readItems() {
        try {
            var items = JSON.parse(localStorage.getItem(CLAVE) || '[]');
            return Array.isArray(items) ? items : [];
        } catch (e) { return []; }
    }
    function writeItems(items) {
        try { localStorage.setItem(CLAVE, JSON.stringify(items)); } catch (e) { /* noop */ }
        try {
            localStorage.setItem(WC_KEY, JSON.stringify({ items: items.map(function (it) {
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
            }) }));
            window.dispatchEvent(new CustomEvent('pp-cart-sync'));
        } catch (e) { /* noop */ }
    }

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

    /* ---------- STOCK POR VARIANTE (Opción A) ----------
     * Consulta las variaciones reales de un producto variable y marca las
     * presentaciones sin stock como "Agotado" (data-pp-agotado + disabled).
     *
     * WooCommerce NO guarda el atributo por variación (viene vacío), así que
     * el mapeo dosis→variación es por: atributo → nombre → PRECIO (fallback
     * robusto: los precios sí están asignados por variación).
     *
     * La tarjeta del catálogo (store.html) NO tiene data-pp-pres, así que
     * aquí se marca "Sin existencias" SOLO si TODAS las variaciones están
     * agotadas (ninguna con stock). Si al menos una variante tiene stock,
     * el producto sigue comprable.
     */
    function variationKey(v) {
        // Atributos de variación (WooCommerce a veces los devuelve vacíos)
        var attrs = v.attributes || [];
        var byName = {};
        if (Array.isArray(attrs)) {
            attrs.forEach(function (a) {
                if (a && a.name && a.value != null) byName[String(a.name).toLowerCase()] = a.value;
            });
        }
        var dosis = byName['presentacion'] || byName['dosis'] || byName['talla'] || v.name || '';
        return { dosis: String(dosis || '').toLowerCase().replace(/\s+/g, '').replace(/mg$/, ''), price: String(v.price || '') };
    }

    function markOutOfStock(productId, variations) {
        if (!variations || !variations.length) return;
        // Índices: por dosis → variación, por nombre → variación, por precio → variación
        var byDosis = {}, byName = {}, byPrice = {};
        variations.forEach(function (v) {
            var k = variationKey(v);
            var dosis = k.dosis || String(v.name || '').toLowerCase().replace(/\s+/g, '').replace(/mg$/, '');
            if (dosis) byDosis[dosis] = v;
            if (String(v.name || '').trim()) byName[String(v.name).toLowerCase()] = v;
            if (String(v.price || '')) byPrice[String(v.price || '')] = v;
        });

        function isOut(v) {
            if (!v) return false;
            // Un stock NO gestionado o positivo = disponible. Solo agotado si
            // WooCommerce lo dice (outofstock) o hay una cantidad numérica <= 0.
            if (v.stock_status === 'outofstock') return true;
            var qty = v.stock_quantity;
            // null / undefined / '' = ilimitado (sin gestión) → NO agotado.
            if (qty === null || qty === undefined || qty === '') return false;
            return Number(qty) <= 0;
        }

        // Normaliza un precio WooCommerce (WC REST entrega decimal, ej "59.99")
        function num(price) {
            var n = parseFloat(String(price || '').replace(/[^0-9.]/g, ''));
            return isFinite(n) ? n : null;
        }

        // Aplicar a cada data-pp-pres (ficha): mapear por dosis, luego PRECIO (fallback)
        document.querySelectorAll('[data-pp-pres]').forEach(function (btn) {
            var dosis = (btn.getAttribute('data-dosis') || '').toLowerCase().replace(/\s+/g, '').replace(/mg$/, '');
            var precio = btn.getAttribute('data-precio') || '';
            var v = byDosis[dosis] || byDosis[dosis + 'mg'] || byName[dosis] || byPrice[precio];
            if (!v) return;
            var out = isOut(v);
            if (out) {
                btn.setAttribute('data-pp-agotado', '');
                btn.setAttribute('disabled', 'disabled');
                btn.classList.add('pp-agotado');
                var label = btn.getAttribute('aria-label') || '';
                btn.setAttribute('aria-label', label + ' — agotado');
            } else {
                // PRECIO DESDE WOOCOMMERCE: gana sobre el del HTML.
                var wcPrecio = num(v.price);
                if (wcPrecio !== null && wcPrecio > 0) {
                    btn.setAttribute('data-precio', String(wcPrecio));
                    btn.setAttribute('data-precio-wc', String(wcPrecio));
                }
            }
        });

        // Recalcular packs/descuentos desde el precio individual (WooCommerce):
        // la escalera (3/6/10 → 5/8/12%) la calcula behaviors.js con el
        // data-precio del botón preseleccionado; le pasamos el precio WC.
        var anadir = document.querySelector('[data-pp-anadir]');
        if (anadir) {
            var pres = document.querySelector('[data-pp-pres][aria-pressed="true"]');
            var p = pres ? pres.getAttribute('data-precio') : '';
            if (p) anadir.setAttribute('data-pp-unitario', p);
        }
        if (typeof window.ppRecalcularFicha === 'function') {
            try { window.ppRecalcularFicha(); } catch (e) { /* noop */ }
        }
    }

    // ¿El producto no tiene NINGUNA variante con stock? (todas agotadas)
    function isAllOutOfStock(variations) {
        if (!variations || !variations.length) return false;
        function out(v) {
            if (!v) return true;
            if (v.stock_status === 'outofstock') return true;
            var qty = v.stock_quantity;
            if (qty === null || qty === undefined || qty === '') return false;
            return Number(qty) <= 0;
        }
        return variations.every(out);
    }

    function fetchStock(productId, slug) {
        // Endpoint público propio (lee variaciones con credenciales en el serverless);
        // wp-json/wc/v3 es privado (401) desde el estático.
        var url = slug ? ('/api/producto-stock/' + encodeURIComponent(slug)) : (productId ? ('/api/producto-stock/' + productId) : '');
        if (!url) return Promise.resolve();
        return fetch(url, { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('stock:' + r.status); return r.json(); })
            .then(function (data) {
                if (!data) return;
                markOutOfStock(productId, data.variations);
                applyWooImages(data, document);
                // Producto SIMPLE: sin variaciones, el stock vive en el padre.
                if ((!data.variations || !data.variations.length) && data.parent) {
                    var p = data.parent;
                    var padreOut = p.stock_status === 'outofstock' || (p.manage_stock && Number(p.stock_quantity) <= 0);
                    if (padreOut) markCardAsSoldOut(document);
                }
            })
            .catch(function (e) { /* no stock endpoint en estático: silencioso */ });
    }

    // Si WooCommerce tiene imagen para la variación/producto, actualiza la
    // <img> de la ficha (vial) y las presentaciones; si no, se mantiene la local.
    function applyWooImages(data, scope) {
        if (!data) return;
        var mainImg = data.image || '';
        if (mainImg && !mainImg.startsWith('/')) {
            var imgEl = scope.querySelector('#pp-vial-img') || scope.querySelector('img[data-nimg="1"]');
            if (imgEl) { imgEl.src = mainImg; imgEl.removeAttribute('srcset'); }
        }
        var byPrecio = {};
        (data.variations || []).forEach(function (v) {
            if (v.image && String(v.price)) byPrecio[String(v.price)] = v.image;
        });
        scope.querySelectorAll('[data-pp-pres]').forEach(function (btn) {
            var precio = btn.getAttribute('data-precio') || '';
            var img = byPrecio[precio];
            if (!img) return;
            var vial = btn.getAttribute('data-vial');
            if (vial && vial.startsWith('/')) { btn.setAttribute('data-vial-wc', img); }
        });
    }

    // Marca la tarjeta/ficha del producto como "Sin existencias" (gris)
    function markCardAsSoldOut(scope) {
        var card = scope.querySelector('[data-pp-nombre]') || scope;
        card.setAttribute('data-pp-agotado', '');
        card.classList.add('pp-agotado');
        var btn = scope.querySelector('[data-testid="quick-add-button"], [data-pp-anadir]');
        if (btn) { btn.disabled = true; btn.classList.add('pp-agotado'); }
    }

    function bindAddButtons() {
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
                if (window.PP_PRODUCTOS && window.PP_PRODUCTOS.productos) {
                    var found = window.PP_PRODUCTOS.productos.find(function (p) { return (p.nombre || '').toLowerCase() === String(name).toLowerCase(); });
                    if (found) id = encodeURIComponent(found.pagina || '');
                }
                var items = readItems();
                items.push({ id: id, nombre: name, cant: 1, precio: precio, img: '', dosis: dosis });
                writeItems(items);
                document.querySelector('[data-pp-carrito-abrir]')?.click();
                var navCart = document.querySelector('[data-testid="nav-cart-link"]');
                if (navCart) navCart.click();
            }, true);
        });

        var anadir = document.querySelector('[data-pp-anadir]');
        if (anadir && !anadir.__wcBridge) {
            anadir.__wcBridge = true;
            anadir.addEventListener('click', function () {
                var fich = anadir.closest('[data-pp-anadir]') || document;
                var pres = document.querySelector('[data-pp-pres][aria-pressed="true"]');
                // No añadir si la presentación está agotada
                if (pres && pres.getAttribute('data-pp-agotado') !== null && pres.hasAttribute('disabled')) return;
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

    document.addEventListener('pp-cart-sync', function () {
        try { window.dispatchEvent(new Event('cart-updated')); } catch (e) {}
    });

    function init() {
        bindAddButtons();
        // Stock por variante vía endpoint público propio.
        // - Ficha (producto-*.html): ID desde product-slate / data-product-id, slug
        //   desde data-product-slug o derivado del pathname (/producto-retatrutida).
        // - Catálogo (store.html): cada tarjeta tiene [data-pp-nombre] y abre
        //   /producto-{slug}; consultamos por tarjeta para marcar "Sin
        //   existencias" SOLO en la tarjeta cuyo producto no tiene stock.
        var fichId = (document.getElementById('product-slate') && document.getElementById('product-slate').textContent)
            ? (JSON.parse(document.getElementById('product-slate').textContent).id || document.querySelector('[data-product-id]')?.getAttribute('data-product-id')) : null;
        if (!fichId) fichId = document.querySelector('[data-product-id]')?.getAttribute('data-product-id');
        var fichSlug = document.querySelector('[data-product-slug]')?.getAttribute('data-product-slug');
        // Solo en fichas: derivar del pathname; en el catálogo NO (evita
        // consultar con "store.html" como slug)
        if (!fichSlug && (location.pathname || '').indexOf('/producto') === 0) {
            fichSlug = (location.pathname || '').replace(/\/producto-?/i, '').replace(/\.html.*$/i, '').replace(/\//g, '');
        }
        if ((fichSlug || fichId) && (location.pathname || '').indexOf('/producto') === 0) fetchStock(fichId, fichSlug);

        // Catálogo: iterar tarjetas y consultar por el slug de cada una
        // (derivado del enlace interno /producto-{slug}, que coincide con el
        // mapa slug→id; el nombre mostrado (data-pp-nombre) NO coincide con
        // el slug real de WooCommerce por tildes/paréntesis).
        var cards = Array.prototype.slice.call(document.querySelectorAll('[data-pp-nombre]'));
        cards.forEach(function (card) {
            var link = card.querySelector('a[href*="/producto-"]') || card.querySelector('a[href="/producto"]');
            var cardSlug = '';
            if (link) {
                var href = link.getAttribute('href') || '';
                cardSlug = href.replace(/^.*\/producto-?/i, '').replace(/\.html.*$/i, '').replace(/\/.*$/, '');
            }
            if (!cardSlug) return;
            fetchStockForCard(card, cardSlug);
        });

        var mo = new MutationObserver(function () { bindAddButtons(); });
        if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    }

    function fetchStockForCard(card, slug) {
        if (!slug) return;
        var url = '/api/producto-stock/' + encodeURIComponent(slug);
        fetch(url, { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('stock:' + r.status); return r.json(); })
            .then(function (data) {
                if (!data) return;
                var soldOut = false;
                // Producto variable: todas las variaciones agotadas → Sin existencias
                if (data.variations && data.variations.length) {
                    soldOut = isAllOutOfStock(data.variations);
                } else if (data.parent) {
                    // Producto simple: stock en el padre
                    var p = data.parent;
                    soldOut = p.stock_status === 'outofstock' || (p.manage_stock && Number(p.stock_quantity) <= 0);
                }
                if (soldOut) markCardAsSoldOut(card);
                // Imagen de WooCommerce (si el CMS la tiene) → actualiza la <img> de la tarjeta
                if (data.image && !data.image.startsWith('/')) {
                    var img = card.querySelector('img[data-nimg="fill"], img');
                    if (img) { img.src = data.image; img.removeAttribute('srcset'); }
                }
            })
            .catch(function () { /* silencioso */ });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
