import type { APIRoute } from 'astro';
import { hasWPConnection, makeWooRequest } from '../../../lib/phantomwp-request';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
    if (!hasWPConnection()) {
        return new Response(
            JSON.stringify({ success: false, error: 'WordPress connection is not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const url = new URL(request.url);
    const productId = url.searchParams.get('product_id');

    if (!productId) {
        return new Response(
            JSON.stringify({ success: false, error: 'product_id is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const response = await makeWooRequest('/reviews?product_id=' + encodeURIComponent(productId) + '&per_page=50');
        const data = await response.json().catch(() => ({}));
        return new Response(
            JSON.stringify(data),
            { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Get reviews error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
