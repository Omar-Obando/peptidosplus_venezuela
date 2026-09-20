/**
 * Central static site configuration for Peptidos Plus (Venezuela).
 *
 * Blog content is fetched from the headless WordPress API (src/lib/wordpress.ts);
 * everything on this page is presentational metadata shared across the site.
 *
 * Pattern: mirrors sesioniniciar.com / registrounicotributario.com reference sites.
 */

export const SITE = {
  name: 'Peptidos Plus',
  legalName: 'Peptidos Plus',
  url: 'https://ve.peptidosplus.com',
  cmsUrl: 'https://ve-cms.peptidosplus.com',
  apiUrl: 'https://ve-cms.peptidosplus.com/wp-json',
  tagline: 'Péptidos research grade para investigación y estudio en Venezuela',
  description:
    'Peptidos Plus: tienda de péptidos research grade para investigación. Catálogo, certificados de análisis (COA), guías de uso y blog científico.',
  locale: 'es-VE',
  language: 'es',
  copyrightStart: 2026,
  socials: {
    instagram: 'https://instagram.com/peptidosplus',
    // TODO: replace with real accounts when available
    whatsapp: 'https://wa.me/',
  },
  contactEmail: 'info@ve.peptidosplus.com',
} as const;

/**
 * Primary navigation. Blog entries are served from the headless CMS.
 */
export const NAV_MAIN = [
  { label: 'Inicio', href: '/' },
  { label: 'Tienda', href: '/tienda' },
  { label: 'Blog', href: '/blog' },
  { label: 'Certificados (COA)', href: '/certificados' },
  { label: 'Contacto', href: '/contacto' },
] as const;

/**
 * Fallback categories surfaced in footer (live list comes from WP when available).
 */
export const FOOTER_TOPICS = [
  { label: 'Metabólico', href: '/categoria/metabolico' },
  { label: 'Hormona de crecimiento', href: '/categoria/gh' },
  { label: 'Piel y tejido', href: '/categoria/piel' },
  { label: 'Neuro', href: '/categoria/neuro' },
  { label: 'Celular', href: '/categoria/celular' },
  { label: 'Insumos', href: '/categoria/insumos' },
] as const;

export const FOOTER_LEGAL = [
  { label: 'Política de privacidad', href: '/privacidad' },
  { label: 'Términos y condiciones', href: '/terminos' },
] as const;

export const FOOTER_ABOUT = [
  { label: 'Preguntas Frecuentes', href: '/preguntas-frecuentes' },
  { label: 'Blog', href: '/blog' },
  { label: 'Certificados (COA)', href: '/certificados' },
  { label: 'Contacto', href: '/contacto' },
] as const;
