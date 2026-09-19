#!/usr/bin/env node
/**
 * Sync Media Script
 * 
 * Downloads WordPress images before build with full optimization:
 * - Original images -> src/media/cms/ (for Astro FeaturedImage optimization)
 * - Responsive WebP variants -> public/media/cms/ (for content HTML via set:html)
 * - LQIP blur placeholders -> src/lib/image-placeholders.json
 * - Incremental sync: skips unchanged images using content hashes
 * - Updates media-map.json for URL rewriting
 * 
 * Run manually: node scripts/sync-media.mjs
 * Runs automatically: npm run build (via prebuild)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_MEDIA_DIR = path.join(ROOT, 'src/media/cms');
const PUBLIC_MEDIA_DIR = path.join(ROOT, 'public/media/cms');
const MEDIA_MAP_PATH = path.join(ROOT, 'src/lib/media-map.json');
const PLACEHOLDERS_PATH = path.join(ROOT, 'src/lib/image-placeholders.json');
const SYNC_MANIFEST_PATH = path.join(ROOT, 'src/lib/.sync-manifest.json');

// Responsive breakpoints for content images (widths in px)
const RESPONSIVE_WIDTHS = [320, 640, 960, 1200];

// Read WordPress URL and access secret from the wordpress.ts file
function getWordPressConfig() {
  const wpFilePath = path.join(ROOT, 'src/lib/wordpress.ts');
  
  if (!fs.existsSync(wpFilePath)) {
    console.log('[sync-media] No WordPress client found, skipping...');
    return null;
  }
  
  const content = fs.readFileSync(wpFilePath, 'utf-8');
  const urlMatch = content.match(/(?:WORDPRESS_API_URL|WP_API_URL)\s*=\s*['"]([^'"]+)['"]/);
  
  if (!urlMatch) {
    console.log('[sync-media] Could not parse WordPress URL, skipping...');
    return null;
  }
  
  // Extract the baked-in access secret (fallback value after ||)
  const secretMatch = content.match(/WP_ACCESS_SECRET\s*=.*\|\|\s*'([^']*)'/);
  const accessSecret = secretMatch ? secretMatch[1] : '';
  
  // Extract image source mode
  const imageSourceMatch = content.match(/IMAGE_SOURCE_MODE[^']*'(local|cdn)'/);
  const imageSource = imageSourceMatch ? imageSourceMatch[1] : 'local';
  
  return {
    url: urlMatch[1].replace(/\/wp-json.*$/, ''),
    accessSecret,
    imageSource,
  };
}

// ============================================================================
// Incremental Sync Manifest
// ============================================================================

// Load the sync manifest (tracks content hashes for incremental builds)
function loadSyncManifest() {
  if (fs.existsSync(SYNC_MANIFEST_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(SYNC_MANIFEST_PATH, 'utf-8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveSyncManifest(manifest) {
  fs.writeFileSync(SYNC_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function computeHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

// Save media map
function saveMediaMap(map) {
  fs.writeFileSync(MEDIA_MAP_PATH, JSON.stringify(map, null, 2));
}

// Build request headers with optional secret
function buildHeaders(accessSecret) {
  const headers = { 'Accept': 'application/json' };
  if (accessSecret) {
    headers['X-PhantomWP-Secret'] = accessSecret;
  }
  return headers;
}

// Fetch all posts from WordPress
async function fetchPosts(wpUrl, accessSecret) {
  const posts = [];
  let page = 1;
  const headers = buildHeaders(accessSecret);
  
  while (true) {
    try {
      const res = await fetch(`${wpUrl}/wp-json/wp/v2/posts?_embed&per_page=100&page=${page}&acf_format=standard`, { headers });
      if (!res.ok) break;
      
      const data = await res.json();
      if (data.length === 0) break;
      
      posts.push(...data);
      page++;
      
      // Safety limit
      if (page > 50) break;
    } catch (e) {
      break;
    }
  }
  
  return posts;
}

// Fetch all pages from WordPress
async function fetchPages(wpUrl, accessSecret) {
  const pages = [];
  let page = 1;
  const headers = buildHeaders(accessSecret);
  
  while (true) {
    try {
      const res = await fetch(`${wpUrl}/wp-json/wp/v2/pages?_embed&per_page=100&page=${page}&acf_format=standard`, { headers });
      if (!res.ok) break;
      
      const data = await res.json();
      if (data.length === 0) break;
      
      pages.push(...data);
      page++;
      
      if (page > 50) break;
    } catch (e) {
      break;
    }
  }
  
  return pages;
}

// Fetch registered custom post types from WordPress
async function fetchCustomPostTypes(wpUrl, accessSecret) {
  const headers = buildHeaders(accessSecret);
  try {
    const res = await fetch(`${wpUrl}/wp-json/wp/v2/types`, { headers });
    if (!res.ok) return {};
    return await res.json();
  } catch (e) {
    return {};
  }
}

// Fetch all items of a given post type by rest_base
async function fetchPostTypeItems(wpUrl, restBase, accessSecret) {
  const items = [];
  let page = 1;
  const headers = buildHeaders(accessSecret);
  
  while (true) {
    try {
      const res = await fetch(`${wpUrl}/wp-json/wp/v2/${restBase}?_embed&per_page=100&page=${page}&acf_format=standard`, { headers });
      if (!res.ok) break;
      
      const data = await res.json();
      if (data.length === 0) break;
      
      items.push(...data);
      page++;
      
      if (page > 50) break;
    } catch (e) {
      break;
    }
  }
  
  return items;
}

// Recursively find wp-content/uploads URLs in any value (for ACF fields)
function findUploadUrls(value, urls) {
  if (!value) return;
  if (typeof value === 'string') {
    if (value.includes('wp-content/uploads') && value.match(/\.(jpg|jpeg|png|gif|webp|svg)/i)) {
      urls.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) findUploadUrls(item, urls);
    return;
  }
  if (typeof value === 'object') {
    // ACF image fields with acf_format=standard have a 'url' property
    if (value.url && typeof value.url === 'string' && value.url.includes('wp-content/uploads')) {
      urls.add(value.url);
      return;
    }
    for (const key of Object.keys(value)) {
      findUploadUrls(value[key], urls);
    }
  }
}

// Extract image URLs from content, featured images, and ACF fields
function extractImageUrls(items) {
  const urls = new Set();
  
  for (const item of items) {
    // Featured image
    const featured = item._embedded?.['wp:featuredmedia']?.[0]?.source_url;
    if (featured) urls.add(featured);
    
    // Images in content
    const content = item.content?.rendered || '';
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      if (match[1].includes('wp-content/uploads')) {
        urls.add(match[1]);
      }
    }
    
    // ACF fields (image, gallery, repeater, flexible content, etc.)
    if (item.acf) {
      findUploadUrls(item.acf, urls);
    }
  }
  
  return Array.from(urls);
}

// Normalize filename for local storage
function toLocalFilename(url) {
  const raw = url.split('/').pop().split('?')[0];
  // Strip WordPress size suffix (-1024x577, -300x200, etc.) to match rewriteContentUrls
  const withoutSize = raw.replace(/-[0-9]+x[0-9]+(?=.[a-z]+$)/i, '');
  return withoutSize
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .toLowerCase();
}

// Get the base WebP filename (without size suffix) for a source file
function toWebpBase(filename) {
  const isSvg = filename.endsWith('.svg');
  const isWebp = filename.endsWith('.webp');
  if (isSvg) return filename;
  if (isWebp) return filename;
  return filename.replace(/\.(jpg|jpeg|png|gif)$/i, '.webp');
}

// ============================================================================
// Download with incremental check
// ============================================================================

function isUrlSafe(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|\[::1\]|metadata\.google)/.test(h)) return false;
    if (!h.includes('.')) return false;
    return true;
  } catch { return false; }
}

async function downloadImage(url, manifest, accessSecret, wpOrigin) {
  const filename = toLocalFilename(url);
  const srcPath = path.join(SRC_MEDIA_DIR, filename);
  
  // If file exists AND manifest hash matches remote, skip download entirely
  if (fs.existsSync(srcPath) && manifest[filename]) {
    return { url, filename, status: 'exists', hash: manifest[filename].hash };
  }

  if (!isUrlSafe(url)) {
    return { url, filename, status: 'failed', error: 'Blocked: private or invalid URL' };
  }
  
  try {
    const headers = { 'User-Agent': 'PhantomWP-Sync/1.0' };
    if (accessSecret && wpOrigin) {
      try {
        if (new URL(url).origin === wpOrigin) {
          headers['X-PhantomWP-Secret'] = accessSecret;
        }
      } catch {}
    }
    const res = await fetch(url, { headers });
    
    if (!res.ok) {
      return { url, filename, status: 'failed', error: res.statusText };
    }
    
    const buffer = Buffer.from(await res.arrayBuffer());
    const hash = computeHash(buffer);
    
    // If we have this exact content already (hash match), skip writing
    if (manifest[filename]?.hash === hash && fs.existsSync(srcPath)) {
      return { url, filename, status: 'exists', hash };
    }
    
    // Save original to src/media/cms/ (source of truth)
    fs.writeFileSync(srcPath, buffer);
    
    return { url, filename, status: 'downloaded', size: buffer.length, hash };
  } catch (e) {
    return { url, filename, status: 'failed', error: e.message };
  }
}

// ============================================================================
// Generate responsive WebP variants + LQIP blur placeholders
// ============================================================================

async function generatePublicCache(manifest, placeholders) {
  console.log('[sync-media] Generating optimized images in public/media/cms/...');
  
  const files = fs.readdirSync(SRC_MEDIA_DIR);
  let generated = 0;
  let skipped = 0;
  let blurGenerated = 0;
  
  for (const filename of files) {
    const srcPath = path.join(SRC_MEDIA_DIR, filename);
    const isSvg = filename.endsWith('.svg');
    const isWebp = filename.endsWith('.webp');
    const isRaster = !isSvg;
    
    // Base output filename
    const webpBase = toWebpBase(filename);
    const nameWithoutExt = webpBase.replace(/\.[^.]+$/, '');
    
    // Check if this file has changed since last sync (via manifest hash)
    const currentHash = manifest[filename]?.hash;
    let needsProcessing = !currentHash;
    
    if (!needsProcessing) {
      // Check if the default output exists
      const defaultOut = path.join(PUBLIC_MEDIA_DIR, webpBase);
      if (!fs.existsSync(defaultOut)) {
        needsProcessing = true;
      }
    }
    
    // Also check if source file is newer than output (fallback for manual edits)
    if (!needsProcessing) {
      const defaultOut = path.join(PUBLIC_MEDIA_DIR, webpBase);
      if (fs.existsSync(defaultOut)) {
        const srcStat = fs.statSync(srcPath);
        const pubStat = fs.statSync(defaultOut);
        if (srcStat.mtime > pubStat.mtime) {
          needsProcessing = true;
        }
      }
    }
    
    if (!needsProcessing) {
      skipped++;
      continue;
    }
    
    try {
      const buffer = fs.readFileSync(srcPath);
      
      if (isSvg) {
        // SVGs: copy as-is, no responsive variants needed
        fs.copyFileSync(srcPath, path.join(PUBLIC_MEDIA_DIR, filename));
        generated++;
        continue;
      }
      
      // Get image dimensions
      const metadata = await sharp(buffer).metadata();
      const origWidth = metadata.width || 1200;
      const origHeight = metadata.height || 800;
      
      // Generate default full-size WebP
      if (!isWebp) {
        const webpBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer();
        fs.writeFileSync(path.join(PUBLIC_MEDIA_DIR, webpBase), webpBuffer);
      } else {
        fs.copyFileSync(srcPath, path.join(PUBLIC_MEDIA_DIR, webpBase));
      }
      
      // Generate responsive variants (only for images wider than the smallest breakpoint)
      if (isRaster && origWidth > RESPONSIVE_WIDTHS[0]) {
        for (const targetWidth of RESPONSIVE_WIDTHS) {
          // Skip if original is smaller than this breakpoint
          if (origWidth <= targetWidth) continue;
          
          const resizedFilename = `${nameWithoutExt}-${targetWidth}w.webp`;
          const resizedPath = path.join(PUBLIC_MEDIA_DIR, resizedFilename);
          
          const resizedBuffer = await sharp(buffer)
            .resize(targetWidth, null, { withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          fs.writeFileSync(resizedPath, resizedBuffer);
        }
      }
      
      // Generate LQIP (Low Quality Image Placeholder) - tiny blurred base64
      if (isRaster && !placeholders[webpBase]) {
        const lqipBuffer = await sharp(buffer)
          .resize(20, null, { withoutEnlargement: true })
          .webp({ quality: 20 })
          .toBuffer();
        const base64 = lqipBuffer.toString('base64');
        placeholders[webpBase] = {
          base64: `data:image/webp;base64,${base64}`,
          width: origWidth,
          height: origHeight,
        };
        blurGenerated++;
      }
      
      generated++;
    } catch (e) {
      console.log(`  ✗ Failed to process ${filename}: ${e.message}`);
    }
  }
  
  console.log(`  Generated: ${generated}, Skipped (up to date): ${skipped}, Blur placeholders: ${blurGenerated}`);
}

// Build media map from src/media/cms/ files and WordPress URLs
function buildMediaMap(imageUrls) {
  const mediaMap = {};
  
  for (const url of imageUrls) {
    const filename = toLocalFilename(url);
    const srcPath = path.join(SRC_MEDIA_DIR, filename);
    
    if (fs.existsSync(srcPath)) {
      const webpBase = toWebpBase(filename);
      mediaMap[url] = '/media/cms/' + webpBase;
    }
  }
  
  return mediaMap;
}

// Build responsive srcset data for content images
function buildResponsiveMap() {
  const responsiveMap = {};
  
  if (!fs.existsSync(PUBLIC_MEDIA_DIR)) return responsiveMap;
  
  const files = fs.readdirSync(PUBLIC_MEDIA_DIR);
  
  // Group responsive variants by base name
  for (const file of files) {
    // Match files like "image-640w.webp"
    const match = file.match(/^(.+)-(\d+)w\.webp$/);
    if (match) {
      const baseName = match[1] + '.webp';
      const width = parseInt(match[2], 10);
      if (!responsiveMap[baseName]) {
        responsiveMap[baseName] = [];
      }
      responsiveMap[baseName].push({ width, file });
    }
  }
  
  // Sort variants by width (ascending)
  for (const key of Object.keys(responsiveMap)) {
    responsiveMap[key].sort((a, b) => a.width - b.width);
  }
  
  return responsiveMap;
}

// Main
async function main() {
  console.log('[sync-media] Starting media sync...');
  
  const wpConfig = getWordPressConfig();
  if (!wpConfig || wpConfig.url.includes('your-wordpress-site')) {
    console.log('[sync-media] WordPress not configured, skipping.');
    return;
  }
  
  const { url: wpUrl, accessSecret, imageSource } = wpConfig;
  console.log(`[sync-media] WordPress URL: ${wpUrl}`);
  console.log(`[sync-media] Image mode: ${imageSource}`);
  
  // In CDN mode, skip all image downloading and processing
  if (imageSource === 'cdn') {
    console.log('[sync-media] CDN mode - images served from original URLs. Skipping download.');
    // Ensure empty map files exist so the build doesn't break
    const libDir = path.join(ROOT, 'src/lib');
    if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
    if (!fs.existsSync(MEDIA_MAP_PATH)) fs.writeFileSync(MEDIA_MAP_PATH, '{}');
    if (!fs.existsSync(PLACEHOLDERS_PATH)) fs.writeFileSync(PLACEHOLDERS_PATH, '{}');
    const responsiveMapPath = path.join(ROOT, 'src/lib/responsive-map.json');
    if (!fs.existsSync(responsiveMapPath)) fs.writeFileSync(responsiveMapPath, '{}');
    console.log('[sync-media] Done (CDN mode).');
    return;
  }
  
  // Ensure directories exist
  if (!fs.existsSync(SRC_MEDIA_DIR)) {
    fs.mkdirSync(SRC_MEDIA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PUBLIC_MEDIA_DIR)) {
    fs.mkdirSync(PUBLIC_MEDIA_DIR, { recursive: true });
  }
  
  // Load incremental sync manifest
  const manifest = loadSyncManifest();
  
  // Fetch content
  console.log('[sync-media] Fetching posts...');
  const posts = await fetchPosts(wpUrl, accessSecret);
  console.log(`[sync-media] Found ${posts.length} posts`);
  
  console.log('[sync-media] Fetching pages...');
  const pages = await fetchPages(wpUrl, accessSecret);
  console.log(`[sync-media] Found ${pages.length} pages`);
  
  // Fetch custom post types
  const allItems = [...posts, ...pages];
  const standardTypes = ['post', 'page', 'attachment', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation', 'wp_global_styles', 'wp_font_family', 'wp_font_face'];
  const postTypes = await fetchCustomPostTypes(wpUrl, accessSecret);
  
  for (const [slug, type] of Object.entries(postTypes)) {
    if (standardTypes.includes(slug)) continue;
    const restBase = type?.rest_base;
    if (!restBase) continue;
    
    console.log(`[sync-media] Fetching ${slug} (${restBase})...`);
    const items = await fetchPostTypeItems(wpUrl, restBase, accessSecret);
    console.log(`[sync-media] Found ${items.length} ${slug}`);
    allItems.push(...items);
  }
  
  // Extract image URLs
  const imageUrls = extractImageUrls(allItems);
  console.log(`[sync-media] Found ${imageUrls.length} unique images`);
  
  // Step 1: Download new images to src/media/cms/ (incremental)
  if (imageUrls.length > 0) {
    console.log('[sync-media] Downloading images (incremental)...');
    let downloaded = 0;
    let skippedDl = 0;
    let failed = 0;
    
    const chunks = [];
    for (let i = 0; i < imageUrls.length; i += 5) {
      chunks.push(imageUrls.slice(i, i + 5));
    }
    
    for (const chunk of chunks) {
      const wpOrigin = (() => { try { return new URL(wpUrl).origin; } catch { return ''; } })();
      const results = await Promise.all(chunk.map(url => downloadImage(url, manifest, accessSecret, wpOrigin)));
      
      for (const r of results) {
        if (r.status === 'downloaded') {
          console.log(`  ✓ ${r.filename} (${(r.size / 1024).toFixed(1)}KB)`);
          manifest[r.filename] = { hash: r.hash, url: r.url, syncedAt: new Date().toISOString() };
          downloaded++;
        } else if (r.status === 'exists') {
          skippedDl++;
        } else {
          console.log(`  ✗ ${r.filename}: ${r.error}`);
          failed++;
        }
      }
    }
    
    console.log(`  Downloaded: ${downloaded}, Cached: ${skippedDl}, Failed: ${failed}`);
  }
  
  // Step 2: Generate responsive WebP variants + LQIP placeholders
  const placeholders = {};
  // Load existing placeholders to avoid regenerating
  if (fs.existsSync(PLACEHOLDERS_PATH)) {
    try {
      Object.assign(placeholders, JSON.parse(fs.readFileSync(PLACEHOLDERS_PATH, 'utf-8')));
    } catch (e) { /* ignore */ }
  }
  
  await generatePublicCache(manifest, placeholders);
  
  // Step 3: Build and save media map (WordPress URLs -> public paths)
  const finalMediaMap = buildMediaMap(imageUrls);
  saveMediaMap(finalMediaMap);
  
  // Step 4: Save LQIP placeholders
  fs.writeFileSync(PLACEHOLDERS_PATH, JSON.stringify(placeholders, null, 2));
  
  // Step 5: Save responsive map (srcset data for content images)
  const responsiveMap = buildResponsiveMap();
  const responsiveMapPath = path.join(ROOT, 'src/lib/responsive-map.json');
  fs.writeFileSync(responsiveMapPath, JSON.stringify(responsiveMap, null, 2));
  
  // Step 6: Save sync manifest for incremental builds
  saveSyncManifest(manifest);
  
  console.log('[sync-media] Done!');
  console.log(`  Media map entries: ${Object.keys(finalMediaMap).length}`);
  console.log(`  Blur placeholders: ${Object.keys(placeholders).length}`);
  console.log(`  Images with responsive variants: ${Object.keys(responsiveMap).length}`);
}

main().catch(console.error);
