#!/usr/bin/env node
/**
 * move-beagle-to-footer.mjs — mueve el badge "Certified by Beagle Security" del
 * NAVBAR al FOOTER en todos los public/*.html (el pie SSR ya lo tiene).
 *
 * - Elimina el <a ...beaglesecurity...></a> que aparece dentro del navbar
 *   (<div data-pp-solo="desk"> ... </div>, justo después del botón WhatsApp).
 * - Asegura que el <a> del FOOTER (después de WhatsApp del pie) contenga el img
 *   white-1x.svg con background transparente (sin recuadro blanco).
 * Idempotente.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BEAGLE_ANCHOR = /<a\b[^>]*href=["']https:\/\/beaglesecurity\.com[^>]*>[\s\S]*?<\/a>/gi;

/** Badge footer correcto: img white-1x + background transparente (sin cuadro blanco). */
const FOOTER_BEAGLE =
  '<a rel="nofollow noopener" href="https://beaglesecurity.com/certificate/oqzlwr9sunvrplwnyeub7mrx65cjb8m1" target="_blank" style="display:inline-block;margin-top:10px;background:transparent;" aria-label="Certificación de seguridad Beagle Security">' +
  '<img src="https://cdn.beaglesecurity.com/assets/logo/white-1x.svg" alt="Beagle certificate" width="140" height="40" loading="lazy" style="display:block;max-width:140px;height:auto;background:transparent;">' +
  '</a>';

function collectHtml(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectHtml(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function process(html) {
  // 1) Quitar el badge del NAVBAR (bloque que está ANTES de </nav> o dentro de data-pp-solo="desk").
  const navStart = html.search(/<nav\b/i);
  const navEnd = html.search(/<\/nav>/i);
  if (navStart !== -1 && navEnd !== -1 && navEnd > navStart) {
    const head = html.slice(0, navStart);
    const nav = html.slice(navStart, navEnd);
    const tail = html.slice(navEnd);
    const navCleaned = nav.replace(BEAGLE_ANCHOR, '');
    html = head + navCleaned + tail;
  } else {
    // Fallback: quitar todo <a beagle> que NO esté precedido por class="scpa" (footer).
    html = html.replace(BEAGLE_ANCHOR, (m) => {
      // Si el anchor está junto a WhatsApp scpa del footer (linea 840), conservar.
      return /scpa/.test(m) ? m : '';
    });
  }

  // 2) Asegurar badge FOOTER: después del WhatsApp <a> del pie (class="scpa"), insertarlo si falta.
  const footerWhatsApp = /(<a\b[^>]*class="scpa"[^>]*>[\s\S]*?WhatsApp<\/a>)/i;
  const m = html.match(footerWhatsApp);
  if (m && !/beaglesecurity/.test(html.slice(m.index, m.index + m[0].length + 600))) {
    html = html.replace(footerWhatsApp, `$1${FOOTER_BEAGLE}`);
  }

  return html;
}

let modified = 0;
const targets = [...collectHtml(path.join(ROOT, 'public'))];
for (const f of targets) {
  const html = readFileSync(f, 'utf8');
  const out = process(html);
  if (out !== html && /beaglesecurity/.test(out)) {
    writeFileSync(f, out);
    modified++;
    console.log('fixed:', path.relative(ROOT, f));
  }
}
console.log(`Badge movido del navbar al footer en ${modified} archivos.`);
