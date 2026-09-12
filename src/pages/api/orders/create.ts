import type { APIRoute } from 'astro';
import { verifyTurnstile } from '../../../lib/turnstile';
import { hasWPConnection, makeWooRequest, withVisitorAuth } from '../../../lib/phantomwp-request';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
    if (!hasWPConnection()) {
        return new Response(
            JSON.stringify({ success: false, error: 'WordPress connection is not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const body = await request.json();
        const authHeader = request.headers.get('Authorization');

        if (!authHeader?.startsWith('Bearer ')) {
            const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || '';
            const turnstileResult = await verifyTurnstile(body.turnstile_token, ip);
            if (!turnstileResult.success) {
                return new Response(
                    JSON.stringify({ success: false, error: turnstileResult.error }),
                    { status: 403, headers: { 'Content-Type': 'application/json' } }
                );
            }
        }

        const response = await makeWooRequest('/orders', withVisitorAuth(request, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }));

        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            return new Response(
                JSON.stringify({ success: false, error: result.error || 'Failed to create order' }),
                { status: response.status || 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({
                success: true,
                order_id: result.id,
                order_key: result.order_key,
                total: result.total,
                discount_total: result.discount_total || '0',
                total_tax: result.total_tax || '0',
                cart_tax: result.cart_tax || '0',
                shipping_tax: result.shipping_tax || '0',
                currency: result.currency,
                currency_symbol: result.currency_symbol,
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Order creation error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
