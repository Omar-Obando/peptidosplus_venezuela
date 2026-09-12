/**
 * Cart Store
 * 
 * Client-side cart management using nanostores
 * Persists to localStorage for cross-page state
 * 
 * Usage in Astro components:
 * <script>
 *   import { $cart, $cartTotal, addToCart, removeFromCart } from '../lib/cart';
 *   
 *   // Subscribe to cart changes
 *   $cart.subscribe(items => console.log('Cart updated:', items));
 *   
 *   // Add item
 *   addToCart({ id: 123, name: 'Product', price: 29.99, quantity: 1 });
 * </script>
 */

import { atom, computed } from 'nanostores';
import { formatStorePrice, storeConfig, type StoreConfig } from '../config/store';

// ============================================================================
// Types
// ============================================================================

export interface CartItem {
    id: number;
    variation_id?: number;
    name: string;
    price: number;
    quantity: number;
    image?: string;
    sku?: string;
    attributes?: Record<string, string>;
}

export interface CartState {
    items: CartItem[];
    lastUpdated: number;
}

// ============================================================================
// Constants
// ============================================================================

const CART_STORAGE_KEY = 'phantomwp_cart';
const COUPONS_STORAGE_KEY = 'phantomwp_coupons';

type RuntimeCurrencyConfig = Partial<StoreConfig> & {
    currency_symbol?: string;
    currency_position?: StoreConfig['currencyPosition'];
    price_decimal_separator?: string;
    price_thousand_separator?: string;
    price_decimals?: number | string;
};

let currencyConfigLoad: Promise<void> | null = null;

// ============================================================================
// Coupon Types
// ============================================================================

export interface AppliedCoupon {
    code: string;
    discount_type: 'percent' | 'fixed_cart' | 'fixed_product';
    discount_amount: number;
    description: string;
    free_shipping: boolean;
}

// ============================================================================
// Cart Store
// ============================================================================

/**
 * Main cart atom - contains all cart items
 */
export const $cart = atom<CartItem[]>([]);

/**
 * Applied coupons atom
 */
export const $appliedCoupons = atom<AppliedCoupon[]>([]);

/**
 * Cart subtotal before discounts (sum of all item prices * quantities)
 */
export const $cartSubtotalValue = computed($cart, (items) =>
    items.reduce((sum, item) => sum + item.price * item.quantity, 0)
);

/**
 * Total discount from applied coupons
 */
export const $cartDiscount = computed([$appliedCoupons, $cartSubtotalValue], (coupons, subtotal) => {
    const total = coupons.reduce((sum, c) => sum + c.discount_amount, 0);
    return Math.min(total, subtotal);
});

/**
 * Cart total after discounts (sum of all item prices * quantities minus discounts)
 */
export const $cartTotal = computed([$cartSubtotalValue, $cartDiscount], (subtotal, discount) =>
    Math.max(subtotal - discount, 0)
);

/**
 * Whether any coupon grants free shipping
 */
export const $hasFreeShippingCoupon = computed($appliedCoupons, (coupons) =>
    coupons.some(c => c.free_shipping)
);

/**
 * Cart item count (sum of all quantities)
 */
export const $cartCount = computed($cart, (items) =>
    items.reduce((sum, item) => sum + item.quantity, 0)
);

/**
 * Whether the cart is empty
 */
export const $cartIsEmpty = computed($cart, (items) => items.length === 0);

/**
 * Cart subtotal formatted as currency
 */
export const $cartSubtotal = computed($cart, (items) => {
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return formatCartPrice(total);
});

// ============================================================================
// Cart Operations
// ============================================================================

/**
 * Initialize cart from localStorage
 * Call this on app/page mount
 */
export function initCart(): void {
    if (typeof window === 'undefined') return;
    
    try {
        const saved = localStorage.getItem(CART_STORAGE_KEY);
        if (saved) {
            const parsed: CartState = JSON.parse(saved);
            if (Array.isArray(parsed.items)) {
                $cart.set(parsed.items);
            }
        }
    } catch (error) {
        console.error('Failed to load cart from localStorage:', error);
        $cart.set([]);
    }

    try {
        const savedCoupons = localStorage.getItem(COUPONS_STORAGE_KEY);
        if (savedCoupons) {
            const parsed = JSON.parse(savedCoupons);
            if (Array.isArray(parsed)) {
                $appliedCoupons.set(parsed);
            }
        }
    } catch (error) {
        console.error('Failed to load coupons from localStorage:', error);
        $appliedCoupons.set([]);
    }

    void refreshCartCurrencyConfig();
}

function normalizeCurrencyPosition(value: unknown): StoreConfig['currencyPosition'] {
    return value === 'right' || value === 'right_space' || value === 'left_space' ? value : 'left';
}

function applyRuntimeCurrencyConfig(config: RuntimeCurrencyConfig): boolean {
    const decimals = Number(config.price_decimals ?? config.currencyMinorUnit);
    const nextConfig: StoreConfig = {
        currency: config.currency || storeConfig.currency,
        currencySymbol: config.currency_symbol || config.currencySymbol || storeConfig.currencySymbol,
        currencyPosition: normalizeCurrencyPosition(config.currency_position || config.currencyPosition || storeConfig.currencyPosition),
        currencyDecimalSeparator: config.price_decimal_separator || config.currencyDecimalSeparator || storeConfig.currencyDecimalSeparator,
        currencyThousandSeparator: config.price_thousand_separator || config.currencyThousandSeparator || storeConfig.currencyThousandSeparator,
        currencyMinorUnit: Number.isFinite(decimals) ? decimals : storeConfig.currencyMinorUnit,
    };

    const changed = Object.entries(nextConfig).some(
        ([key, value]) => storeConfig[key as keyof StoreConfig] !== value
    );

    Object.assign(storeConfig, nextConfig);
    return changed;
}

export function refreshCartCurrencyConfig(): Promise<void> {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') {
        return Promise.resolve();
    }

    if (currencyConfigLoad) return currencyConfigLoad;

    currencyConfigLoad = fetch('/api/checkout/config', { credentials: 'same-origin' })
        .then(async (response) => {
            if (!response.ok) return;
            const data = await response.json();
            if (data?.success && applyRuntimeCurrencyConfig(data)) {
                window.dispatchEvent(new CustomEvent('cart:currency-updated'));
            }
        })
        .catch(() => {
            // Keep the committed store config as the fallback when checkout config is unavailable.
        })
        .finally(() => {
            currencyConfigLoad = null;
        });

    return currencyConfigLoad;
}

/**
 * Save cart to localStorage
 */
function persistCart(): void {
    if (typeof window === 'undefined') return;
    
    const state: CartState = {
        items: $cart.get(),
        lastUpdated: Date.now(),
    };
    
    try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error('Failed to save cart to localStorage:', error);
    }
}

function persistCoupons(): void {
    if (typeof window === 'undefined') return;
    
    try {
        localStorage.setItem(COUPONS_STORAGE_KEY, JSON.stringify($appliedCoupons.get()));
    } catch (error) {
        console.error('Failed to save coupons to localStorage:', error);
    }
}

/**
 * Add item to cart
 * If item already exists (same product_id and variation_id), increases quantity
 */
export function addToCart(item: CartItem): void {
    const cart = $cart.get();
    const existingIndex = cart.findIndex(
        (i) => i.id === item.id && i.variation_id === item.variation_id
    );
    
    if (existingIndex >= 0) {
        // Update quantity of existing item
        const updated = [...cart];
        updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + item.quantity,
        };
        $cart.set(updated);
    } else {
        // Add new item
        $cart.set([...cart, item]);
    }
    
    persistCart();
    
    // Dispatch custom event for UI feedback
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cart:item-added', { 
            detail: { item, cartCount: $cartCount.get() } 
        }));
    }
}

/**
 * Update item quantity
 * Removes item if quantity is 0 or less
 */
export function updateQuantity(
    productId: number, 
    quantity: number, 
    variationId?: number
): void {
    if (quantity <= 0) {
        removeFromCart(productId, variationId);
        return;
    }
    
    const cart = $cart.get();
    const updated = cart.map((item) => {
        if (item.id === productId && item.variation_id === variationId) {
            return { ...item, quantity };
        }
        return item;
    });
    
    $cart.set(updated);
    persistCart();
}

/**
 * Increment item quantity by 1
 */
export function incrementQuantity(productId: number, variationId?: number): void {
    const cart = $cart.get();
    const item = cart.find(
        i => i.id === productId && i.variation_id === variationId
    );
    if (item) {
        updateQuantity(productId, item.quantity + 1, variationId);
    }
}

/**
 * Decrement item quantity by 1 (removes if reaches 0)
 */
export function decrementQuantity(productId: number, variationId?: number): void {
    const cart = $cart.get();
    const item = cart.find(
        i => i.id === productId && i.variation_id === variationId
    );
    if (item) {
        updateQuantity(productId, item.quantity - 1, variationId);
    }
}

/**
 * Remove item from cart
 */
export function removeFromCart(productId: number, variationId?: number): void {
    const cart = $cart.get();
    const filtered = cart.filter(
        (item) => !(item.id === productId && item.variation_id === variationId)
    );
    
    $cart.set(filtered);
    persistCart();
    
    // Dispatch custom event
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cart:item-removed', { 
            detail: { productId, variationId, cartCount: $cartCount.get() } 
        }));
    }
}

/**
 * Clear entire cart
 */
export function clearCart(): void {
    $cart.set([]);
    $appliedCoupons.set([]);
    
    if (typeof window !== 'undefined') {
        localStorage.removeItem(CART_STORAGE_KEY);
        localStorage.removeItem(COUPONS_STORAGE_KEY);
        window.dispatchEvent(new CustomEvent('cart:cleared'));
    }
}

/**
 * Get cart item by product ID
 */
export function getCartItem(productId: number, variationId?: number): CartItem | undefined {
    return $cart.get().find(
        item => item.id === productId && item.variation_id === variationId
    );
}

/**
 * Check if product is in cart
 */
export function isInCart(productId: number, variationId?: number): boolean {
    return !!getCartItem(productId, variationId);
}

/**
 * Get quantity of product in cart
 */
export function getCartQuantity(productId: number, variationId?: number): number {
    const item = getCartItem(productId, variationId);
    return item?.quantity || 0;
}

// ============================================================================
// Line Items (for WooCommerce API)
// ============================================================================

/**
 * Get cart as line_items array for WooCommerce order creation
 */
export function getLineItems(): Array<{ 
    product_id: number; 
    variation_id?: number; 
    quantity: number 
}> {
    return $cart.get().map((item) => ({
        product_id: item.id,
        ...(item.variation_id && { variation_id: item.variation_id }),
        quantity: item.quantity,
    }));
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format price for cart display
 */
export function formatCartPrice(
    price: number, 
    currency: string = storeConfig.currency,
    locale: string = 'en-US'
): string {
    if (!currency) {
        return price.toFixed(2);
    }
    if (currency === storeConfig.currency) {
        return formatStorePrice(price);
    }
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
    }).format(price);
}

/**
 * Calculate item subtotal
 */
export function getItemSubtotal(item: CartItem): number {
    return item.price * item.quantity;
}

/**
 * Get formatted item subtotal
 */
export function getFormattedItemSubtotal(
    item: CartItem,
    currency: string = storeConfig.currency,
    locale: string = 'en-US'
): string {
    return formatCartPrice(getItemSubtotal(item), currency, locale);
}

function decodeHtmlEntities(value: unknown): string {
    return String(value ?? '')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
}

// ============================================================================
// Coupon Operations
// ============================================================================

/**
 * Apply a coupon to the cart
 * Validates against /api/coupons/validate, then stores the result
 */
export async function applyCoupon(code: string): Promise<{ success: boolean; error?: string }> {
    const trimmed = code.trim().toLowerCase();
    if (!trimmed) return { success: false, error: 'Please enter a coupon code' };

    const existing = $appliedCoupons.get();
    if (existing.some(c => c.code === trimmed)) {
        return { success: false, error: 'Coupon already applied' };
    }

    const cartItems = $cart.get().map(item => ({
        product_id: item.id,
        quantity: item.quantity,
        price: item.price,
    }));

    try {
        const res = await fetch('/api/coupons/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: trimmed, line_items: cartItems }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            return { success: false, error: decodeHtmlEntities(data.error || 'Invalid coupon') };
        }

        if (data.individual_use && existing.length > 0) {
            $appliedCoupons.set([]);
        }

        const coupon: AppliedCoupon = {
            code: data.code,
            discount_type: data.discount_type,
            discount_amount: data.discount_amount,
            description: data.description,
            free_shipping: data.free_shipping,
        };

        $appliedCoupons.set([...$appliedCoupons.get(), coupon]);
        persistCoupons();

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cart:coupon-applied', { detail: { coupon } }));
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to validate coupon' };
    }
}

/**
 * Remove an applied coupon by code
 */
export function removeCoupon(code: string): void {
    const filtered = $appliedCoupons.get().filter(c => c.code !== code);
    $appliedCoupons.set(filtered);
    persistCoupons();

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cart:coupon-removed', { detail: { code } }));
    }
}

/**
 * Clear all applied coupons
 */
export function clearCoupons(): void {
    $appliedCoupons.set([]);
    persistCoupons();
}

/**
 * Get coupon codes for order creation
 */
export function getCouponLines(): Array<{ code: string }> {
    return $appliedCoupons.get().map(c => ({ code: c.code }));
}

// ============================================================================
// Cart Drawer State
// ============================================================================

/**
 * Cart drawer open state
 */
export const $cartDrawerOpen = atom<boolean>(false);

/**
 * Open cart drawer
 */
export function openCartDrawer(): void {
    $cartDrawerOpen.set(true);
}

/**
 * Close cart drawer
 */
export function closeCartDrawer(): void {
    $cartDrawerOpen.set(false);
}

/**
 * Toggle cart drawer
 */
export function toggleCartDrawer(): void {
    $cartDrawerOpen.set(!$cartDrawerOpen.get());
}
