/**
 * Product Data Loader
 * 
 * Fetches products and categories from the WooCommerce Store API.
 * During dev, data is live so edits in WooCommerce appear on refresh.
 * During build, Astro pre-renders all pages with the fetched data.
 */

import {
    getAllProducts,
    getProduct as wcGetProduct,
    getProductById as wcGetProductById,
    getProducts,
    getProductCategories,
    getProductVariations as wcGetProductVariations,
    decodeEntities,
    type WCProduct,
    type WCCategory,
    type WCProductVariation,
} from './woocommerce';

// Simple in-memory cache so multiple calls in the same render
// don't refetch (e.g. index page calling both getLocalProducts
// and getLocalFeaturedProducts).
let cachedProducts: WCProduct[] | null = null;
let cachedCategories: WCCategory[] | null = null;

function decodeProduct(p: WCProduct): WCProduct {
    return {
        ...p,
        name: decodeEntities(p.name),
        short_description: decodeEntities(p.short_description),
        description: decodeEntities(p.description),
        categories: p.categories?.map(c => ({ ...c, name: decodeEntities(c.name) })),
    };
}

function decodeCategory(c: WCCategory): WCCategory {
    return { ...c, name: decodeEntities(c.name) };
}

/**
 * Get all products
 */
export async function getLocalProducts(): Promise<WCProduct[]> {
    if (!cachedProducts) {
        cachedProducts = await getAllProducts();
    }
    return cachedProducts.map(decodeProduct);
}

/**
 * Get all categories
 */
export async function getLocalCategories(): Promise<WCCategory[]> {
    if (!cachedCategories) {
        cachedCategories = await getProductCategories();
    }
    return cachedCategories.map(decodeCategory);
}

/**
 * Get a single product by slug
 */
export async function getLocalProduct(slug: string): Promise<WCProduct | null> {
    const product = await wcGetProduct(slug);
    return product ? decodeProduct(product) : null;
}

/**
 * Get a single product by ID
 */
export async function getLocalProductById(id: number): Promise<WCProduct | null> {
    const product = await wcGetProductById(id);
    return product ? decodeProduct(product) : null;
}

/**
 * Get category by slug
 */
export async function getLocalCategoryBySlug(slug: string): Promise<WCCategory | null> {
    const categories = await getLocalCategories();
    return categories.find(c => c.slug === slug) || null;
}

/**
 * Get products by category slug
 */
export async function getLocalProductsByCategory(categorySlug: string): Promise<WCProduct[]> {
    const products = await getLocalProducts();
    return products.filter(p =>
        p.categories?.some(cat => cat.slug === categorySlug)
    );
}

/**
 * Get featured products (first N products marked as featured, or just first N)
 */
export async function getLocalFeaturedProducts(limit: number = 8): Promise<WCProduct[]> {
    const products = await getLocalProducts();
    const featured = products.filter(p => p.featured);
    if (featured.length >= limit) {
        return featured.slice(0, limit);
    }
    return products.slice(0, limit);
}

/**
 * Get products on sale
 */
export async function getLocalOnSaleProducts(limit: number = 8): Promise<WCProduct[]> {
    const products = await getLocalProducts();
    return products.filter(p => p.on_sale).slice(0, limit);
}

/**
 * Get related products (same category)
 */
export async function getLocalRelatedProducts(product: WCProduct, limit: number = 4): Promise<WCProduct[]> {
    if (!product.categories || product.categories.length === 0) {
        return [];
    }

    const products = await getLocalProducts();
    const categorySlug = product.categories[0].slug;

    return products
        .filter(p => p.id !== product.id && p.categories?.some(c => c.slug === categorySlug))
        .slice(0, limit);
}

/**
 * Get visible categories (with products)
 */
export async function getLocalVisibleCategories(): Promise<WCCategory[]> {
    const categories = await getLocalCategories();
    return categories.filter(c => c.count > 0);
}

/**
 * Get top-level categories
 */
export async function getLocalTopLevelCategories(): Promise<WCCategory[]> {
    const categories = await getLocalCategories();
    return categories.filter(c => c.parent === 0);
}

/**
 * Get variations for a variable product
 */
export async function getLocalProductVariations(productId: number): Promise<WCProductVariation[]> {
    return wcGetProductVariations(productId);
}
