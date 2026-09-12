/**
 * Product Media URL Helpers
 * 
 * Maps WooCommerce image URLs to local paths after sync-product-media runs.
 */

import productMediaMap from './product-media-map.json';

const mediaMap = productMediaMap as Record<string, string>;

/**
 * Convert src path to public path (same filename)
 * /src/media/products/image.jpg -> /media/products/image.jpg
 */
function toPublicPath(srcPath: string): string {
    return srcPath.replace('/src/media/products/', '/media/products/');
}

/**
 * Get local src image URL for Astro Image component (build-time optimization)
 */
export function getLocalProductImageUrl(originalUrl: string | null): string | null {
    if (!originalUrl) return null;
    
    // Check direct match
    if (mediaMap[originalUrl]) {
        return mediaMap[originalUrl];
    }
    
    // Try matching by filename (handles CDN rewrites)
    const filename = originalUrl.split('/').pop()?.split('?')[0]?.toLowerCase();
    if (filename) {
        const baseFilename = filename.replace(/\.[^.]+$/, '');
        for (const [, localPath] of Object.entries(mediaMap)) {
            const localFilename = localPath.split('/').pop()?.toLowerCase();
            const localBase = localFilename?.replace(/\.[^.]+$/, '');
            if (localFilename === filename || localBase === baseFilename) {
                return localPath;
            }
        }
    }
    
    return originalUrl;
}

/**
 * Get public image URL for runtime use (cart, checkout)
 * Returns path from public folder (same filename as src)
 */
export function getPublicProductImageUrl(originalUrl: string | null): string | null {
    if (!originalUrl) return null;
    
    // First get the src path
    const srcPath = getLocalProductImageUrl(originalUrl);
    
    // If it's a local path, convert to public path
    if (srcPath && srcPath.startsWith('/src/media/')) {
        return toPublicPath(srcPath);
    }
    
    // Return original URL as fallback
    return originalUrl;
}

/**
 * Check if an image has been downloaded locally
 */
export function hasLocalImage(url: string): boolean {
    if (mediaMap[url]) return true;
    
    const filename = url.split('/').pop()?.split('?')[0]?.toLowerCase();
    if (!filename) return false;
    
    const baseFilename = filename.replace(/\.[^.]+$/, '');
    return Object.values(mediaMap).some(localPath => {
        const localFilename = localPath.split('/').pop()?.toLowerCase();
        const localBase = localFilename?.replace(/\.[^.]+$/, '');
        return localFilename === filename || localBase === baseFilename;
    });
}

/**
 * Get all local product images (src paths)
 */
export function getAllLocalImages(): string[] {
    return Object.values(mediaMap);
}
