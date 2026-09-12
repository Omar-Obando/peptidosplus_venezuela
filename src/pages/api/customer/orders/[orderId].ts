import type { APIRoute } from 'astro';
import { hasWPConnection, makeWooRequest, withVisitorAuth } from '../../../../lib/phantomwp-request';


export const prerender = false;
export const GET: APIRoute = async ({ params, request }) => {
    const orderId = params.orderId;
    if (!orderId || !/^\d+$/.test(orderId)) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid order ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!hasWPConnection()) {
        return new Response(JSON.stringify({ success: false, error: 'WordPress connection is not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const response = await makeWooRequest('/customer/orders/' + orderId, withVisitorAuth(request));
        const data = await response.json().catch(() => ({}));
        return new Response(JSON.stringify(data), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('Get single order error:', error);
        return new Response(JSON.stringify({ success: false, error: 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
};
