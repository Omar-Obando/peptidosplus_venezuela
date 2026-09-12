/**
 * Payment Gateway Abstraction
 * 
 * Unified interface for Stripe and PayPal payment processing
 * Store owner enables gateways via environment variables
 * 
 * Environment Variables:
 *   PUBLIC_PAYMENT_STRIPE_ENABLED=true  (PUBLIC_ prefix for client-side access)
 *   PUBLIC_PAYMENT_PAYPAL_ENABLED=true  (PUBLIC_ prefix for client-side access)
 *   STRIPE_SECRET_KEY=sk_xxx
 *   PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_xxx
 *   PAYPAL_CLIENT_ID=xxx
 *   PAYPAL_CLIENT_SECRET=xxx
 *   PAYPAL_MODE=sandbox|live
 */

import { storeConfig } from '../config/store';

let stripeLoadPromise: Promise<void> | null = null;
let paypalLoadPromise: Promise<void> | null = null;

// ============================================================================
// Types
// ============================================================================

export type PaymentGatewayId = 'stripe' | 'paypal' | 'bacs';

export interface PaymentGateway {
    id: PaymentGatewayId;
    name: string;
    icon: string;
    enabled: boolean;
}

export interface CreatePaymentSessionRequest {
    order_id: number;
    order_key: string;
    total: string;
    currency: string;
    billing: {
        email: string;
        first_name: string;
        last_name: string;
    };
    line_items: Array<{
        name: string;
        quantity: number;
        price: number;
    }>;
    success_url: string;
    cancel_url: string;
}

export interface PaymentSessionResponse {
    success: boolean;
    redirect_url?: string;
    session_id?: string;
    error?: string;
}

// ============================================================================
// Gateway Configuration
// ============================================================================

/**
 * Check if Stripe is enabled
 * Note: Uses PUBLIC_ prefix so it's available on client-side
 */
export function isStripeEnabled(): boolean {
    if (typeof import.meta.env === 'undefined') return false;
    return import.meta.env.PUBLIC_PAYMENT_STRIPE_ENABLED === 'true';
}

/**
 * Check if PayPal is enabled
 * Note: Uses PUBLIC_ prefix so it's available on client-side
 */
export function isPayPalEnabled(): boolean {
    if (typeof import.meta.env === 'undefined') return false;
    return import.meta.env.PUBLIC_PAYMENT_PAYPAL_ENABLED === 'true';
}

/**
 * Check if Bank Transfer (BACS) is enabled
 */
export function isBacsEnabled(): boolean {
    if (typeof import.meta.env === 'undefined') return false;
    return import.meta.env.PUBLIC_PAYMENT_BACS_ENABLED === 'true';
}

/**
 * Get all enabled payment gateways
 */
export function getEnabledGateways(): PaymentGateway[] {
    const gateways: PaymentGateway[] = [];
    
    if (isStripeEnabled()) {
        gateways.push({
            id: 'stripe',
            name: 'Credit Card',
            icon: '/icons/stripe.svg',
            enabled: true,
        });
    }
    
    if (isPayPalEnabled()) {
        gateways.push({
            id: 'paypal',
            name: 'PayPal',
            icon: '/icons/paypal.svg',
            enabled: true,
        });
    }
    
    if (isBacsEnabled()) {
        gateways.push({
            id: 'bacs',
            name: 'Direct Bank Transfer',
            icon: '',
            enabled: true,
        });
    }
    
    return gateways;
}

/**
 * Get gateway by ID
 */
export function getGateway(id: PaymentGatewayId): PaymentGateway | null {
    return getEnabledGateways().find(g => g.id === id) || null;
}

/**
 * Check if any payment gateway is enabled
 */
export function hasPaymentGateway(): boolean {
    return getEnabledGateways().length > 0;
}

// ============================================================================
// Client-side Payment Initialization
// ============================================================================

/**
 * Initialize payment gateway on client
 * Call this to load payment SDKs
 */
export async function initPaymentGateway(gatewayId: PaymentGatewayId): Promise<void> {
    switch (gatewayId) {
        case 'stripe':
            await initStripe();
            break;
        case 'paypal':
            await initPayPal();
            break;
    }
}

/**
 * Load Stripe.js
 */
async function initStripe(): Promise<void> {
    if (typeof window === 'undefined') return;
    
    const publishableKey = (import.meta as any).env?.PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
        console.error('Stripe publishable key not configured');
        return;
    }

    if ((window as any).stripeInstance) return;
    if ((window as any).Stripe) {
        (window as any).stripeInstance = (window as any).Stripe(publishableKey);
        return;
    }
    if (stripeLoadPromise) return stripeLoadPromise;
    
    // Load Stripe.js dynamically
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    
    stripeLoadPromise = new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Stripe.js'));
        document.head.appendChild(script);
    }).then(() => {
        (window as any).stripeInstance = (window as any).Stripe(publishableKey);
    }).catch((error) => {
        stripeLoadPromise = null;
        throw error;
    });
    await stripeLoadPromise;
}

/**
 * Load PayPal SDK
 */
async function initPayPal(): Promise<void> {
    if (typeof window === 'undefined') return;
    if ((window as any).paypal) return;
    if (paypalLoadPromise) return paypalLoadPromise;
    
    const clientId = (import.meta as any).env?.PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId) {
        console.error('PayPal client ID not configured');
        return;
    }
    
    const currency = storeConfig.currency;
    if (!currency) {
        console.error('PayPal currency is not configured. Save WooCommerce settings so src/config/store.ts is populated.');
        return;
    }
    
    // Load PayPal SDK dynamically
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}`;
    script.async = true;
    
    paypalLoadPromise = new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load PayPal SDK'));
        document.head.appendChild(script);
    }).catch((error) => {
        paypalLoadPromise = null;
        throw error;
    });
    await paypalLoadPromise;
}

// ============================================================================
// Payment Session Creation (Client-side)
// ============================================================================

/**
 * Create payment session and redirect to payment page
 */
export async function createPaymentSession(
    gatewayId: PaymentGatewayId,
    orderId: number,
    orderKey: string
): Promise<PaymentSessionResponse> {
    try {
        const response = await fetch(`/api/payments/${gatewayId}/create-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, order_key: orderKey }),
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            return { 
                success: false, 
                error: data.error || 'Failed to create payment session' 
            };
        }
        
        return {
            success: true,
            redirect_url: data.redirect_url,
            session_id: data.session_id,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Network error',
        };
    }
}

/**
 * Redirect to payment gateway
 */
export async function redirectToPayment(
    gatewayId: PaymentGatewayId,
    orderId: number,
    orderKey: string
): Promise<void> {
    const result = await createPaymentSession(gatewayId, orderId, orderKey);
    
    if (!result.success || !result.redirect_url) {
        throw new Error(result.error || 'Failed to create payment session');
    }
    
    // For Stripe Checkout, we might need to use their redirect method
    if (gatewayId === 'stripe' && result.session_id) {
        const stripe = (window as any).stripeInstance;
        if (stripe) {
            const { error } = await stripe.redirectToCheckout({ 
                sessionId: result.session_id 
            });
            if (error) {
                throw new Error(error.message);
            }
            return;
        }
    }
    
    // Default: direct redirect
    window.location.href = result.redirect_url;
}

