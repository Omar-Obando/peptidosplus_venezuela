import type { APIRoute } from 'astro';

/**
 * GET /api/producto-stock/[slug] — stock por variante de un producto.
 *
 * Consulta WooCommerce con credenciales (solo lectura) y devuelve las
 * variaciones con su stock_status/stock_quantity para que el frontend
 * (wc-bridge.js) marque las presentaciones agotadas.
 *
 * slug: "retatrutida" | "producto-retatrutida" | id numérico.
 * Respuesta: { ok, id, name, type, variations: [{id, name, attributes, stock_quantity, stock_status, price}] }
 */

// Base de la API REST de WooCommerce. `WC_API_URL` en .env apunta a `/wp-json`
// (sin sufijo), así que normalizamos aquí: si no termina en `/wc/v3`, lo
// añadimos. Evita el bug de llamar a `/wp-json/products/{id}` (404 rest_no_route).
const WC_API_RAW = (import.meta.env.WC_API_URL as string) || 'https://ve-cms.peptidosplus.com/wp-json/wc/v3';
const WC_API = WC_API_RAW.replace(/\/+$/, '').replace(/(\/wp-json\/?)wc\/v\d+$/i, '$1') + '/wc/v3';
const WC_USER = (import.meta.env.WP_REST_USER as string) || '';
const WC_PASS = (import.meta.env.WP_REST_PASSWORD as string) || '';

function mapSlugToId(slug: string): string | null {
  // Mapa slug -> ID WooCommerce (productos creados via import: web ids)
  const MAP: Record<string, string> = {
    'retatrutida': '58',
    'producto-retatrutida': '58',
    'tirzepatida': '59',
    'producto-tirzepatida': '59',
    'semaglutida': '60',
    'producto-semaglutida': '60',
    'ghk-cu': '61',
    'producto-ghk-cu': '61',
    'tesamorelin': '62',
    'producto-tesamorelin': '62',
    'mots-c': '63',
    'producto-mots-c': '63',
    'nad': '64',
    'producto-nad': '64',
    'cjc-1295-ipamorelin': '65',
    'producto-cjc-1295-ipamorelin': '65',
    'agua-bacteriostatica': '66',
    'producto-agua-bacteriostatica': '66',
    'agua-bacteriostatica-hospira': '67',
    'producto-agua-bacteriostatica-hospira': '67',
    'kpv': '68',
    'producto-kpv': '68',
    'klow': '69',
    'producto-klow': '69',
    'semax': '70',
    'producto-semax': '70',
    'glutation': '71',
    'producto-glutation': '71',
    'melanotan-2': '72',
    'producto-melanotan-2': '72',
    'glow': '73',
    'producto-glow': '73',
    'selank': '74',
    'producto-selank': '74',
    'wolverine-bpc-157-tb-500': '75',
    'producto-wolverine-bpc-157-tb-500': '75',
    'pt-141': '76',
    'producto-pt-141': '76',
    'cagrilintida': '77',
    'producto-cagrilintida': '77',
    'dsip': '78',
    'producto-dsip': '78',
    'epitalon': '79',
    'producto-epitalon': '79',
    'ipamorelin': '80',
    'producto-ipamorelin': '80',
    'thymosin-alpha-1': '81',
    'producto-thymosin-alpha-1': '81',
    'sermorelin': '82',
    'producto-sermorelin': '82',
    'kisspeptin': '83',
    'producto-kisspeptin': '83',
    'kisspeptin-10': '83',
    'producto-kisspeptin-10': '83',
    'ss-31': '84',
    'producto-ss-31': '84',
    'ss-31-elamipretide': '84',
    'producto-ss-31-elamipretide': '84',
    'cjc-1295-sin-dac': '85',
    'producto-cjc-1295-sin-dac': '85',
    'lemon-bottle': '86',
    'producto-lemon-bottle': '86',
  };
  return MAP[slug.toLowerCase()] || MAP[slug.replace(/^producto-/, '')] || null;
}

export const GET: APIRoute = async ({ params, request }) => {
  const raw = (params.slug || '').toLowerCase();
  let id = /^\d+$/.test(raw) ? raw : mapSlugToId(raw);
  const auth = 'Basic ' + Buffer.from(`${WC_USER}:${WC_PASS}`).toString('base64');

  // Fallback robusto: resolver slug→id desde WooCommerce (evita depender de
  // un mapa hardcodeado si los IDs cambian o hay slugs nuevos).
  if (!id) {
    try {
      const res = await fetch(`${WC_API}/products?slug=${encodeURIComponent(raw.replace(/^producto-?/, ''))}&per_page=1`, {
        headers: { Authorization: auth },
      });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length) id = String(list[0].id);
      }
    } catch { /* fallback silencioso */ }
  }
  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: 'unknown-slug', slug: raw }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    // Producto + variaciones
    const [prodRes, varsRes] = await Promise.all([
      fetch(`${WC_API}/products/${id}`, { headers: { Authorization: auth } }),
      fetch(`${WC_API}/products/${id}/variations?per_page=100`, { headers: { Authorization: auth } }),
    ]);
    if (!prodRes.ok && !varsRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'woo-error', status: prodRes.status }), {
        status: prodRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const prod = prodRes.ok ? await prodRes.json() : null;
    const variations = varsRes.ok ? await varsRes.json() : [];
    // Opciones del producto padre (atributo "Presentacion" → ["5 mg","10 mg","30 mg"])
    // WooCommerce NO guarda el atributo por variación (viene vacío), así que el
    // frontend mapea dosis→variación por: atributo → nombre → PRECIO (fallback
    // robusto, los precios sí están asignados por variación).
    const parentOptions: string[] = Array.isArray(prod?.attributes)
      ? prod.attributes.reduce((acc: string[], attr: any) => {
          if (attr?.options && attr.options.length) acc.push(...attr.options);
          return acc;
        }, [])
      : [];
    const out = {
      ok: true,
      id: prod ? prod.id : Number(id),
      name: prod ? prod.name : '',
      type: prod ? prod.type : '',
      attributes: parentOptions,
      // Producto simple: el stock vive en el PADRE (variations llega vacío).
      // Producto variable: el stock vive en las variaciones.
      parent: {
        stock_status: prod?.stock_status ?? '',
        stock_quantity: prod?.stock_quantity ?? null,
        manage_stock: prod?.manage_stock ?? false,
      },
      variations: variations.map((v: any) => ({
        id: v.id,
        name: v.name,
        attributes: v.attributes || [],
        attributesRaw: v.attributes ? v.attributes : [],
        stock_quantity: v.stock_quantity,
        stock_status: v.stock_status,
        price: v.price,
        manage_stock: v.manage_stock,
        image: v.image?.src || v.image?.srcset?.[0]?.src || '',
      })),
      // Imagen principal de WooCommerce (por si el CMS la tiene; el frontend
      // la usará como fallback/preferida y el mapa local sigue disponible).
      image: prod?.images?.[0]?.src || prod?.image?.src || '',
    };
    // cache 60s pública
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: 'fetch-error', message: String(e?.message || e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
