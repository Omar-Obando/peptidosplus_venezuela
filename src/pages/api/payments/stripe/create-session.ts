/**
 * Stripe Payment API Routes
 * 
 * Handles Stripe Checkout Session creation through PhantomWP Connect.
 */

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { hasWPConnection, makeWooRequest } from '../../../../lib/phantomwp-request';

const STRIPE_SECRET_KEY = import.meta.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
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
 * POST /api/payments/stripe/create-session
 * Creates a Stripe Checkout Session for an order
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
        if (!stripe) {
            return new Response(
                JSON.stringify({ success: false, error: 'Stripe is not configured' }),
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
                provider: 'stripe',
            }),
        });
        const order = await paymentOrderResponse.json().catch(() => null);
        if (!paymentOrderResponse.ok || !order || order.success === false) {
            return new Response(
                JSON.stringify({ success: false, error: paymentPreparationError(order) }),
                { status: paymentOrderResponse.status || 404, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const amount = Number(order.amount_minor);
        const currency = String(order.currency || '').toLowerCase();
        if (!amount || !currency) {
            return new Response(
                JSON.stringify({ success: false, error: 'Order total or currency is invalid' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }
        
        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency,
                    product_data: {
                        name: 'Order #' + (order.number || order.id),
                    },
                    unit_amount: order.amount_minor,
                },
                quantity: 1,
            }],
            customer_email: order.billing?.email || undefined,
            metadata: {
                wc_order_id: order.id.toString(),
                wc_order_key: order.order_key,
            },
            success_url: `${SITE_URL}/order-complete?order_id=${order.id}&order_key=${encodeURIComponent(order.order_key)}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${SITE_URL}/finalizar-compra?cancelled=true&order_id=${order.id}`,
        });
        
        return new Response(
            JSON.stringify({
                success: true,
                session_id: session.id,
                redirect_url: session.url,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Stripe session creation error:', error);
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Payment error' 
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
