import type { APIRoute } from 'astro';
import { hasWPConnection, makeWooRequest } from '../../../lib/phantomwp-request';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
    const orderId = params.orderId;
    if (!orderId || !/^\d+$/.test(orderId)) {
        return new Response(
            JSON.stringify({ success: false, error: 'Invalid order ID' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    if (!hasWPConnection()) {
        return new Response(
            JSON.stringify({ success: false, error: 'WordPress connection is not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const url = new URL(request.url);
    const orderKey = url.searchParams.get('order_key');
    if (!orderKey) {
        return new Response(
            JSON.stringify({ success: false, error: 'Order key is required' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const response = await makeWooRequest('/orders/' + orderId + '?order_key=' + encodeURIComponent(orderKey));
        const order = await response.json().catch(() => ({}));

        if (!response.ok || !order.success) {
            return new Response(
                JSON.stringify({ success: false, error: order.error || 'Order not found' }),
                { status: response.status || 404, headers: { 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify(order),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Get order error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Failed to fetch order' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
