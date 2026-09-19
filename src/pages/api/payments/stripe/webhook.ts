/**
 * Stripe Webhook Handler
 * 
 * POST /api/payments/stripe/webhook
 * Receives Stripe webhook events and updates WooCommerce orders
 */

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { hasWPConnection, makeWooRequest } from '../../../../lib/phantomwp-request';

const STRIPE_SECRET_KEY = import.meta.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const WEBHOOK_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET;

async function updateOrderPaymentStatus(orderId: string, status: 'paid' | 'failed', transactionId: string | null, provider = 'stripe') {
    const response = await makeWooRequest('/orders/' + encodeURIComponent(orderId) + '/payment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            status,
            transaction_id: transactionId || '',
            provider,
        }),
    });
    if (!response.ok) {
        console.error('Could not update WooCommerce order payment status:', orderId, await response.text());
    }
}

export const POST: APIRoute = async ({ request }) => {
    const signature = request.headers.get('stripe-signature');
    
    if (!signature) {
        return new Response(
            JSON.stringify({ error: 'Missing signature' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
    if (!hasWPConnection()) {
        return new Response(
            JSON.stringify({ error: 'WordPress connection is not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
    if (!stripe || !WEBHOOK_SECRET) {
        return new Response(
            JSON.stringify({ error: 'Stripe webhook is not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
    
    try {
        const body = await request.text();
        
        // Verify webhook signature
        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
        } catch (err) {
            console.error('Webhook signature verification failed:', err);
            return new Response(
                JSON.stringify({ error: 'Invalid signature' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }
        
        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                const orderId = session.metadata?.wc_order_id;
                
                if (orderId && session.payment_status === 'paid') {
                    await updateOrderPaymentStatus(orderId, 'paid', session.payment_intent as string, 'stripe');
                }
                break;
            }
            
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                const orderId = paymentIntent.metadata?.wc_order_id;
                if (orderId) {
                    await updateOrderPaymentStatus(orderId, 'paid', paymentIntent.id, 'stripe');
                }
                break;
            }
            
            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                const orderId = paymentIntent.metadata?.wc_order_id;
                console.error(`Payment failed: ${paymentIntent.id}${orderId ? ` (order ${orderId})` : ''}`);
                
                if (orderId) {
                    await updateOrderPaymentStatus(orderId, 'failed', paymentIntent.id, 'stripe');
                }
                break;
            }
            
            case 'charge.refunded': {
                const charge = event.data.object as Stripe.Charge;
                const paymentIntentId = typeof charge.payment_intent === 'string' 
                    ? charge.payment_intent 
                    : charge.payment_intent?.id;
                console.log(`Charge refunded: ${charge.id} (payment_intent: ${paymentIntentId})`);
                break;
            }
            
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        
        return new Response(
            JSON.stringify({ received: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Webhook error:', error);
        return new Response(
            JSON.stringify({ error: 'Webhook handler failed' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
