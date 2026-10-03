#!/usr/bin/env node
/**
 * add-consent-and-disclaimer.mjs
 *  1) Crea public/descargo-de-responsabilidad.html (misma plantilla que terminos.html).
 *  2) Añade <script src="/consent-modal.js" defer></script> a todas las páginas y al layout SSR.
 *  3) Añade el enlace «Descargo de responsabilidad» a la columna Legal del pie (páginas + cromo).
 *  4) Registra la ruta en src/pages/[slug].astro (INTERNAL_PAGES) y en el sitemap de páginas.
 * Idempotente.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGAL_URL = 'https://ve.peptidosplus.com/descargo-de-responsabilidad';
const TITLE = 'Descargo de responsabilidad';
const DESC =
  'Descargo de responsabilidad de Peptidos Plus: alcance de la información del sitio, uso exclusivo en investigación y límites de nuestra responsabilidad.';

const ARTICLE = `<article class="pg-art"><header class="pg-art-cab"><p class="pg-cejilla font-poppins">Legal · Peptidos Plus</p><h1 class="pg-h1">Descargo de responsabilidad</h1><p class="pg-sub">Qué cubre y qué no cubre la información de este sitio, y hasta dónde llega nuestra responsabilidad.</p><p class="pg-gris">Última actualización: 3 de octubre de 2026</p></header><nav class="pg-indice" aria-label="Contenido de esta página"><ol><li><a href="#alcance">Alcance de este descargo</a></li><li><a href="#medico">No es consejo médico ni veterinario</a></li><li><a href="#investigacion">Uso exclusivo en investigación</a></li><li><a href="#resultados">Sin garantía de resultados</a></li><li><a href="#certificados">Certificados y verificación</a></li><li><a href="#contenido">Contenido educativo y enlaces de terceros</a></li><li><a href="#manejo">Manejo y conservación</a></li><li><a href="#responsabilidad">Límite de responsabilidad</a></li><li><a href="#contacto">Cambios y contacto</a></li></ol></nav><section id="alcance"><h2>1. Alcance de este descargo</h2><p>Este documento complementa los <a href="/terminos">Términos y condiciones</a> y la <a href="/privacidad">Política de privacidad</a>. Explica qué podemos y qué no podemos garantizar sobre el sitio y sobre los materiales que vendemos.</p><p>Al usar este sitio aceptas este descargo. Si no estás de acuerdo, no uses el sitio ni hagas pedidos.</p></section><section id="medico"><h2>2. No es consejo médico ni veterinario</h2><p>Nada de lo que publicamos —textos, artículos, fichas técnicas, preguntas frecuentes, imágenes o respuestas por WhatsApp— constituye consejo médico, veterinario, nutricional ni farmacéutico.</p><p>La información del sitio es de carácter educativo, con referencias a literatura científica, y no sustituye la evaluación de un profesional de la salud. No indicamos dosis, protocolos ni formas de administración para uso humano o veterinario, y no respondemos consultas con ese fin.</p></section><section id="investigacion"><h2>3. Uso exclusivo en investigación</h2><p>Los productos se destinan <b>exclusivamente a investigación científica en entornos controlados</b>. No son medicamentos, no están aprobados por ninguna autoridad sanitaria para uso humano ni veterinario, y no están destinados a diagnosticar, tratar, curar ni prevenir ninguna enfermedad.</p><p>Quien compra declara ser mayor de edad y asume la responsabilidad de que el material se use únicamente con fines de investigación, conforme a la normativa aplicable en su jurisdicción.</p></section><section id="resultados"><h2>4. Sin garantía de resultados</h2><p>No garantizamos resultados de investigación, ni que el material sea apto para un propósito distinto al de investigación, ni que cumpla requisitos regulatorios de un país determinado. La idoneidad del material para un estudio concreto la determina quien lo realiza.</p></section><section id="certificados"><h2>5. Certificados y verificación</h2><p>Cada lote se analiza por HPLC en Janoshik Analytical y su certificado es público y verificable de forma independiente en el portal del laboratorio. La pureza publicada es la del reporte de ese lote, no una estimación nuestra.</p><p>Los certificados los emite un tercero; no controlamos sus métodos ni sus tiempos. Si detectas una discrepancia entre el certificado y lo publicado, escríbenos y lo revisamos.</p></section><section id="contenido"><h2>6. Contenido educativo y enlaces de terceros</h2><p>Los artículos y fichas técnicas resumen literatura científica y enlazan a fuentes externas (publicaciones, portales de laboratorios, organismos). Esos enlaces se ofrecen como referencia: no controlamos su contenido ni respondemos por él.</p><p>Las marcas y nombres de terceros pertenecen a sus titulares y se mencionan únicamente con fines descriptivos o de referencia.</p></section><section id="manejo"><h2>7. Manejo y conservación</h2><p>Despachamos los viales liofilizados. Desde que el material sale de nuestra custodia, el manejo, la conservación, la reconstitución y la eliminación son responsabilidad de quien lo recibe.</p><p>Las condiciones generales de almacenamiento están en las <a href="/preguntas-frecuentes#producto">preguntas frecuentes</a>; aplicarlas o no queda de tu lado.</p></section><section id="responsabilidad"><h2>8. Límite de responsabilidad</h2><p>Respondemos por que el material enviado corresponda al pedido y venga con el certificado de su lote, y por la reposición en los casos previstos en los <a href="/terminos#incidencias">Términos y condiciones</a>.</p><p>No respondemos por el uso posterior del material, por daños derivados de un uso distinto al de investigación, por la conservación después de la entrega ni por retrasos de la agencia de envío. En la medida en que la ley lo permita, nuestra responsabilidad total se limita al monto del pedido.</p><p>Nada en este documento limita derechos que la ley te reconozca de forma irrenunciable.</p></section><section id="contacto"><h2>9. Cambios y contacto</h2><p>Podemos actualizar este descargo; la fecha de la última actualización está arriba. Las condiciones vigentes son las publicadas al momento de usar el sitio.</p><p>Escríbenos por WhatsApp al <a rel="nofollow noopener" href="https://wa.me/15806436837">+1 (580) 643-6837</a> o por correo a <a href="mailto:contacto@peptidosplus.com">contacto@peptidosplus.com</a>.</p></section><p class="pg-aviso">Este documento está redactado en lenguaje claro y refleja cómo trabajamos hoy. No sustituye la revisión de un abogado.</p><div class="pg-volver"><a href="/">← Volver al inicio</a></div></article>`;

function collectHtml(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectHtml(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

// ---------- 1) Página de descargo ----------
function createDisclaimer() {
  const src = path.join(ROOT, 'public', 'terminos.html');
  const dst = path.join(ROOT, 'public', 'descargo-de-responsabilidad.html');
  if (!existsSync(src)) return 'sin terminos.html (omitido)';
  if (existsSync(dst)) return 'ya existe (omitido)';

  let html = readFileSync(src, 'utf8');
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${TITLE} | Peptidos Plus</title>`)
    .replace(/https:\/\/ve\.peptidosplus\.com\/terminos/g, LEGAL_URL)
    .replace(/pg-legal-terminos-html/g, 'pg-legal-descargo-html')
    .replace(/<article class="pg-art">[\s\S]*<\/article>/, ARTICLE)
    .replace(/Términos y condiciones \| Peptidos Plus/g, `${TITLE} | Peptidos Plus`)
    .replace(/Términos y condiciones/g, TITLE)
    .replace(
      /Las condiciones bajo las que vendemos\. Al hacer un pedido en este sitio aceptas lo que dice esta página\./g,
      DESC
    );

  writeFileSync(dst, html);
  return 'creado';
}

// ---------- 2) Script del modal ----------
const SCRIPT_TAG = '<script src="/consent-modal.js" defer></script>';

function addScript(file) {
  if (!existsSync(file)) return false;
  const txt = readFileSync(file, 'utf8');
  if (txt.includes('/consent-modal.js') || !/<\/body>/.test(txt)) return false;
  writeFileSync(file, txt.replace(/<\/body>/, `${SCRIPT_TAG}</body>`));
  return true;
}

// ---------- 3) Enlace en la columna Legal ----------
const FOOTER_LINK =
  '<a href="/descargo-de-responsabilidad" data-pp-pie="" class="scpb" style="color: rgb(201, 213, 230); font-size: 14px; line-height: 1.4;"><span class="sc-interp">Descargo de responsabilidad</span></a>';
const USO_RE =
  /(<a href="\/uso-investigacion(?:\.html)?"[^>]*><span class="sc-interp">Uso en investigación<\/span><\/a>)/;

function addFooterLink(file) {
  if (!existsSync(file)) return false;
  const txt = readFileSync(file, 'utf8');
  if (txt.includes('Descargo de responsabilidad</span>') || !USO_RE.test(txt)) return false;
  writeFileSync(file, txt.replace(USO_RE, `$1${FOOTER_LINK}`));
  return true;
}

// ---------- 4) Ruta + sitemap ----------
function addRoute() {
  const f = path.join(ROOT, 'src', 'pages', '[slug].astro');
  if (!existsSync(f)) return false;
  const txt = readFileSync(f, 'utf8');
  if (txt.includes("'descargo-de-responsabilidad'")) return false;
  writeFileSync(f, txt.replace(/(INTERNAL_PAGES = new Set\(\[)/, `$1\n  'descargo-de-responsabilidad',`));
  return true;
}

function addSitemap() {
  const f = path.join(ROOT, 'src', 'pages', 'sitemap-pages.xml.ts');
  if (!existsSync(f)) return false;
  const txt = readFileSync(f, 'utf8');
  if (txt.includes('/descargo-de-responsabilidad')) return false;
  writeFileSync(
    f,
    txt.replace(
      /(\{ path: '\/terminos', priority: '0\.2', changefreq: 'yearly' \},)/,
      `$1\n  { path: '/descargo-de-responsabilidad', priority: '0.2', changefreq: 'yearly' },`
    )
  );
  return true;
}

// ---------- Ejecutar ----------
console.log(`descargo: ${createDisclaimer()}`);

let scriptCount = 0;
let linkCount = 0;
for (const f of collectHtml(path.join(ROOT, 'public'))) {
  if (addScript(f)) scriptCount++;
  if (addFooterLink(f)) linkCount++;
}
if (addScript(path.join(ROOT, 'src', 'layouts', 'BrandLayout.astro'))) scriptCount++;
if (addFooterLink(path.join(ROOT, 'src', 'cromo', 'pie.html'))) linkCount++;

console.log(`script del modal añadido: ${scriptCount} archivos`);
console.log(`enlace en el pie añadido: ${linkCount} archivos`);
console.log(`ruta en [slug].astro: ${addRoute() ? 'añadida' : 'sin cambios'}`);
console.log(`sitemap: ${addSitemap() ? 'añadido' : 'sin cambios'}`);
