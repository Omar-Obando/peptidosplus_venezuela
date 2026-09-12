/**
 * Stripe PaymentIntent Creation
 *
 * POST /api/payments/stripe/create-intent
 * Creates a PaymentIntent for the inline Stripe Payment Element.
 * Returns the client_secret so the browser can confirm the payment
 * without ever sending card data to our server.
 */

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { hasWPConnection, makeWooRequest } from '../../../../lib/phantomwp-request';

const STRIPE_SECRET_KEY = import.meta.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

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

function stripeKeyMode(key: string | undefined): 'test' | 'live' | null {
    if (!key) return null;
    if (key.startsWith('sk_test_') || key.startsWith('pk_test_')) return 'test';
    if (key.startsWith('sk_live_') || key.startsWith('pk_live_')) return 'live';
    return null;
}

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
        if (stripeKeyMode(STRIPE_SECRET_KEY) && stripeKeyMode(STRIPE_PUBLISHABLE_KEY) && stripeKeyMode(STRIPE_SECRET_KEY) !== stripeKeyMode(STRIPE_PUBLISHABLE_KEY)) {
            return new Response(
                JSON.stringify({ success: false, error: 'Stripe secret and publishable keys must both be test keys or both be live keys.' }),
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

        const paymentIntent = await stripe.paymentIntents.create({
            amount: order.amount_minor,
            currency: String(order.currency || '').toLowerCase(),
            metadata: {
                wc_order_id: String(order.id),
                wc_order_key: String(order.order_key),
            },
            receipt_email: order.billing?.email || undefined,
            automatic_payment_methods: { enabled: true },
        });

        return new Response(
            JSON.stringify({
                success: true,
                client_secret: paymentIntent.client_secret,
                amount: order.amount_minor,
                currency,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Stripe PaymentIntent creation error:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Payment error',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
