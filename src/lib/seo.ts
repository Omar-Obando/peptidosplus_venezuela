/**
 * SEO utilities for ve.peptidosplus.com (Astro headless WordPress).
 *
 * The @phantomwp/wordpress client already exposes extractSEOData / getSEOTitle /
 * getSEODescription / getSEOImage and rewriteContentUrls (see
 * src/lib/wordpress.ts). This module adds the small helpers Astro pages need to
 * build clean, search-friendly HTML from WordPress content.
 *
 * Pattern: mirrored from the reference projects (sesioniniciar.com,
 * registrounicotributario.com).
 */

import {
  extractSEOData,
  stripHtml as wpStripHtml,
  rewriteContentUrls as phantomRewriteContentUrls,
} from '@phantomwp/wordpress';

export { extractSEOData };

/**
 * `rewriteContentUrls` upgraded to also point CMS-host URLs at the public site.
 *
 * @phantomwp/wordpress rewrites `<img>` `wp-content/uploads` URLs to local
 * `/media/cms/` paths, but it leaves `href`/`src` URLs on the CMS host
 * (`ve-cms.peptidosplus.com`) untouched. Mirroring the reference sites, we
 * first rewrite `ve-cms.peptidosplus.com` -> `ve.peptidosplus.com` so content
 * links and images never point at the CMS, then apply @phantomwp's rewrite.
 */
export function rewriteContentUrls(content: string): string {
  let result = content || '';
  result = result.replace(/(href|src)="([^"]*ve-cms\.peptidosplus\.com[^"]*)"/gi, (_m, attr, url) => {
    return `${attr}="${url.replace(/ve-cms\.peptidosplus\.com/gi, 've.peptidosplus.com')}"`;
  });
  // Also rewrite bare occurrences (e.g. in text or og: fields).
  result = result.replace(/ve-cms\.peptidosplus\.com/gi, 've.peptidosplus.com');
  return phantomRewriteContentUrls(result);
}

/** Light HTML strip (delegates to the WP client). */
export function stripHtml(html: string): string {
  return wpStripHtml(html);
}

/** Hosts that count as internal (root + www only — other subdomains like the CMS are external). */
const INTERNAL_LINK_HOSTS = new Set(['ve.peptidosplus.com', 'www.ve.peptidosplus.com']);

function isInternalHost(host: string): boolean {
  return INTERNAL_LINK_HOSTS.has(host.toLowerCase());
}

/** Is `href` navigational internal authority (relative / same-site / anchor / mailto: / tel:)? */
function isInternalHref(href: string): boolean {
  const h = (href || '').trim();
  if (!h || h.startsWith('#')) return true; // empty or same-page anchor
  const schemeMatch = h.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!schemeMatch) return true; // relative path (/…, ./…, ../…, bare name)
  const scheme = schemeMatch[1].toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return true; // mailto:, tel:, etc.
  const urlMatch = h.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i);
  if (!urlMatch) return true;
  return isInternalHost(urlMatch[1].replace(/:.*$/, ''));
}

/** Find the `<a>` tag's whole `rel="…"` attribute (incl. quotes), or null. */
function matchRelAttribute(tag: string): RegExpMatchArray | null {
  return tag.match(/\brel\s*=\s*(?:"[^"]*"|'[^']*')/i);
}

/**
 * Enforce the site's link-authority policy on rendered HTML:
 * every EXTERNAL link is given `rel="nofollow noopener noreferrer"` so it
 * passes no authority, while every INTERNAL link keeps full authority (any
 * nofollow/sponsored/ugc token is stripped from internal hrefs).
 */
export function applyExternalLinkPolicy(html: string): string {
  return (html || '').replace(/<a\b[^>]*>/gi, (tag) => {
    const hrefMatch = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch ? (hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '') : '';
    const relMatch = matchRelAttribute(tag);
    const existing = relMatch
      ? relMatch[0].slice(relMatch[0].indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
          .split(/\s+/).filter(Boolean)
      : [];

    if (isInternalHref(href)) {
      // Internal link: drop nofollow-family tokens so authority passes through.
      const tokens = existing.filter((t) => !/^(nofollow|sponsored|ugc|noindex)$/i.test(t));
      if (!relMatch) return tag;
      if (tokens.length === 0) {
        return tag.replace(new RegExp(`\\s*${escapeRegExp(relMatch[0])}`), '');
      }
      return tag.replace(relMatch[0], `rel="${tokens.join(' ')}"`);
    }

    // External link: merge nofollow+noopener+noreferrer into the rel.
    const merged = Array.from(new Set([...existing, 'nofollow', 'noopener', 'noreferrer']));
    const relAttr = `rel="${merged.join(' ')}"`;
    return relMatch
      ? tag.replace(relMatch[0], relAttr)
      : tag.replace(/>\s*$/, ` ${relAttr}>`);
  });
}

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Estimate reading time in minutes (~200 words/min), min 1. */
export function calculateReadingTime(html: string): number {
  const text = wpStripHtml(html);
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

export interface TocHeading {
  level: number;
  text: string;
  id: string;
}

/** Build a slugified anchor id from a heading text. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

/** Add slugified `id` attributes to <h2>-<h4> that lack one. */
export function addHeadingIds(html: string): string {
  return html.replace(/<h([2-4])([^>]*)>(.*?)<\/h\1>/gi, (match, level, attrs, text) => {
    if (/id=/i.test(attrs)) return match;
    const id = slugify(stripHtml(text));
    if (!id) return match;
    return `<h${level}${attrs} id="${id}">${text}</h${level}>`;
  });
}

/** Extract headings (with ids) for a table of contents. */
export function extractHeadings(html: string): TocHeading[] {
  const headings: TocHeading[] = [];
  const regex = /<h([2-4])([^>]*)>(.*?)<\/h\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const idMatch = match[2].match(/id="([^"]+)"/);
    if (!idMatch) continue;
    headings.push({ level, text: stripHtml(match[3]), id: idMatch[1] });
  }
  return headings;
}

/** Best available title from a WP entity: SEO plugin > title.rendered > fallback. */
export function seoTitle(post: any, fallback = ''): string {
  if (!post) return fallback;
  try {
    const seo = extractSEOData(post);
    return seo.title || post.title?.rendered || fallback;
  } catch {
    return post?.title?.rendered || fallback;
  }
}

/** Best available description: SEO plugin > excerpt > fallback. */
export function seoDescription(post: any, fallback = ''): string {
  if (!post) return fallback;
  try {
    const seo = extractSEOData(post);
    return seo.description || wpStripHtml(post.excerpt?.rendered || '').trim() || fallback;
  } catch {
    return wpStripHtml(post.excerpt?.rendered || '').trim() || fallback;
  }
}

/**
 * Robustly sanitize a WordPress post's `content.rendered`.
 *
 * Posts must be returned 100% untouched so the article keeps its intended
 * formatting (only URL rewrites + heading-id injection). When (and only when)
 * a pasted full HTML document wrapper is detected, extract the real article
 * from inside <main> (falling back to the <body> region).
 */
export function sanitizePostContent(content: string): string {
  if (!content) return content;
  const hasDocumentWrapper = /^\s*(?:<p[^>]*>\s*)?(?:<!doctype[^>]*>\s*)?<html[^>]*>/i.test(content);
  if (!hasDocumentWrapper) return content.trim();
  const inner = extractEmbeddedDocument(content);
  return (inner ?? content).trim();
}

/** Find the first match of `re` in `html` starting at `from`; returns {index,length} or null. */
function regexAt(html: string, re: RegExp, from = 0): { index: number; length: number } | null {
  const m = new RegExp(re.source, re.flags).exec(html.slice(from));
  return m ? { index: from + m.index, length: m[0].length } : null;
}

/** Return the inner HTML of the first `<open>…</close>` block, or null. */
function extractBalanced(html: string, openTag: string, closeTag: string): string | null {
  const open = regexAt(html, new RegExp(`<${openTag}[\\s>]`, 'i'));
  if (!open) return null;
  const gt = html.indexOf('>', open.index);
  if (gt < 0) return null;
  const innerStart = gt + 1;
  const close = regexAt(html, new RegExp(`</${closeTag}\\s*>`, 'i'), innerStart);
  if (!close) return null;
  return html.slice(innerStart, close.index);
}

/** Extract the article inner HTML from an embedded full HTML document. */
function extractEmbeddedDocument(html: string): string | null {
  const main = extractBalanced(html, 'main', 'main');
  if (main) return main;
  const headClose = regexAt(html, /<\/head\s*>/i);
  const bodyOpen = regexAt(html, /<body[^>]*>/i);
  const regionStart = Math.max(
    headClose ? headClose.index + headClose.length : 0,
    bodyOpen ? bodyOpen.index + bodyOpen.length : 0
  );
  const bodyEnd = regexAt(html, /<\/body\s*>/i, regionStart);
  if (bodyEnd) return html.slice(regionStart, bodyEnd.index);
  const htmlEnd = regexAt(html, /<\/html\s*>/i, regionStart);
  if (htmlEnd) return html.slice(regionStart, htmlEnd.index);
  return null;
}
