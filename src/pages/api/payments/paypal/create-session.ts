/**
 * PayPal Payment API Routes
 * 
 * Handles PayPal order creation and capture
 */

import type { APIRoute } from 'astro';
import { hasWPConnection, makeWooRequest } from '../../../../lib/phantomwp-request';

const PAYPAL_CLIENT_ID = import.meta.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = import.meta.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = import.meta.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_API_URL = PAYPAL_MODE === 'live' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';
const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'http://localhost:4321';

function paymentPreparationError(payload: any): string {
    const code = String(payload?.code || '');
    if (code === 'pwp_secret_not_configured') {
        return 'PhantomWP access secret is not configured in WordPress. Set it in WP Admin > PhantomWP and make sure WP_ACCESS_SECRET matches your local .env.';
    }
    if (code === 'pwp_missing_secret') {
        return 'WP_ACCESS_SECRET is not configured in this site environment.';
    }
    if (code === 'pwp_invalid_secret') {
        return 'WP_ACCESS_SECRET does not match the PhantomWP access secret configured in WordPress.';
    }
    return payload?.error || payload?.message || 'Order not found';
}

/**
 * Get PayPal access token
 */
async function getPayPalAccessToken(): Promise<string> {
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    
    const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    
    if (!response.ok) {
        throw new Error('Failed to get PayPal access token');
    }
    
    const data = await response.json();
    return data.access_token;
}

/**
 * POST /api/payments/paypal/create-session
 * Creates a PayPal order for checkout
 */
export const POST: APIRoute = async ({ request }) => {
    try {
        const { order_id, order_key } = await request.json();
        
        if (!hasWPConnection()) {
            return new Response(
                JSON.stringify({ success: false, error: 'WordPress connection is not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }
        if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
            return new Response(
                JSON.stringify({ success: false, error: 'PayPal is not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }
        if (!order_id) {
            return new Response(
                JSON.stringify({ success: false, error: 'Order ID required' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }
        
        const paymentOrderResponse = await makeWooRequest('/orders/' + encodeURIComponent(String(order_id)) + '/payment-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_key: String(order_key || ''),
                provider: 'paypal',
            }),
        });
        const order = await paymentOrderResponse.json().catch(() => null);
        if (!paymentOrderResponse.ok || !order || order.success === false) {
            return new Response(
                JSON.stringify({ success: false, error: paymentPreparationError(order) }),
                { status: paymentOrderResponse.status || 404, headers: { 'Content-Type': 'application/json' } }
            );
        }
        
        const accessToken = await getPayPalAccessToken();
        
        // Create PayPal order
        const paypalResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: order.id.toString(),
                    description: `Order #${order.number}`,
                    amount: {
                        currency_code: order.currency,
                        value: order.total,
                    },
                }],
                application_context: {
                    brand_name: 'Store',
                    landing_page: 'NO_PREFERENCE',
                    user_action: 'PAY_NOW',
                    return_url: `${SITE_URL}/api/payments/paypal/capture?wc_order_id=${order.id}&wc_order_key=${encodeURIComponent(order.order_key)}`,
                    cancel_url: `${SITE_URL}/finalizar-compra?cancelled=true&order_id=${order.id}`,
                },
            }),
        });
        
        if (!paypalResponse.ok) {
            const error = await paypalResponse.text();
            console.error('PayPal order creation failed:', error);
            return new Response(
                JSON.stringify({ success: false, error: 'Failed to create PayPal order' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }
        
        const paypalOrder = await paypalResponse.json();
        
        // Find the approval URL
        const approvalLink = paypalOrder.links?.find((link: any) => link.rel === 'approve');
        
        return new Response(
            JSON.stringify({
                success: true,
                paypal_order_id: paypalOrder.id,
                redirect_url: approvalLink?.href,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('PayPal session creation error:', error);
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Payment error' 
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
