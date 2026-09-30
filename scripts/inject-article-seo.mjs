#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(new URL(".", import.meta.url)));
const root = resolve(__dirname, "..");
const publicDir = join(root, "public");

const MONTHS = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

// Parse "1 de marzo de 2026" -> "2026-03-01"
function parseSpanishDate(text) {
  const m = String(text).match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})/i);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  const year = m[3];
  return `${year}-${month}-${day}`;
}

// Add width/height to any <img ...> that lacks them, right after the tag name.
function addImgDimensions(html) {
  return html.replace(/<img\b(?![^>]*\bwidth\s*=)([^>]*)>/gi, (full, attrs) => {
    if (/\bwidth\s*=/.test(attrs) && /\bheight\s*=/.test(attrs)) return full;
    return `<img width="600" height="600"${attrs}>`;
  });
}

// Ensure exactly one og:type meta in <head>, with content="article".
// Drops any og:type whose content != article (e.g. "website").
function ensureOgTypeArticle(html) {
  let kept = false;
  let result = html.replace(
    /<meta\s[^>]*?\bproperty\s*=\s*["']og:type["'][^>]*?>/gi,
    (fullMeta) => {
      if (/\bcontent\s*=\s*["']article["']/i.test(fullMeta)) {
        kept = true;
        return fullMeta;
      }
      return ""; // remove website / other
    }
  );
  if (!kept) {
    result = result.replace(
      /<\/head>/i,
      `<meta property="og:type" content="article" />\n</head>`
    );
  }
  return result;
}

const files = readdirSync(publicDir)
  .filter((f) => /^articulo-.*\.html$/.test(f))
  .map((f) => join(publicDir, f));

let updated = 0;
let skipped = 0;

for (const file of files) {
  const original = readFileSync(file, "utf8");
  let html = original;

  // AlWAYS normalize og:type to a single article (dedupes website dupes).
  html = ensureOgTypeArticle(html);

  // Skip remaining injections if already done (idempotent).
  if (!/property="article:published_time"/.test(html)) {
    const cejillaMatch = html.match(
      /<p class="pg-cejilla font-poppins">[\s\S]*?<\/p>/
    );
    const cejilla = cejillaMatch ? cejillaMatch[0] : "";
    const iso = parseSpanishDate(cejilla);
    if (!iso) {
      console.warn(`SKIP (no visible date): ${file}`);
      skipped++;
      continue;
    }

    const dateLiteralMatch = cejilla.match(
      /(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4})/i
    );
    if (dateLiteralMatch) {
      const literal = dateLiteralMatch[0];
      const escapedLiteral = literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const timeRe = new RegExp(
        `(<p class="pg-cejilla font-poppins">[^<]*?)·\\s*${escapedLiteral}`,
        "i"
      );
      html = html.replace(
        timeRe,
        `$1· <time datetime="${iso}">${literal}</time>`
      );
    }

    html = html.replace(
      /<\/head>/i,
      `<meta property="article:published_time" content="${iso}" />\n<meta property="article:modified_time" content="${iso}" />\n</head>`
    );

    html = addImgDimensions(html);
  }

  if (html !== original) {
    writeFileSync(file, html, "utf8");
    updated++;
  } else {
    skipped++;
  }
}

console.log(`Total articulo files: ${files.length}`);
console.log(`Updated: ${updated}`);
console.log(`Skipped: ${skipped}`);
