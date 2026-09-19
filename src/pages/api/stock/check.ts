/**
 * Check Stock API Route
 * 
 * POST /api/stock/check
 * Validates stock availability for cart items before checkout
 * 
 * This provides real-time stock validation to prevent overselling,
 * even if the static product pages show older stock data.
 */

import type { APIRoute } from 'astro';
import { hasWPConnection, makeWooRequest } from '../../../lib/phantomwp-request';

export const POST: APIRoute = async ({ request }) => {
    if (!hasWPConnection()) {
        return new Response(
            JSON.stringify({ success: false, error: 'WordPress connection is not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const body = await request.json();
        const response = await makeWooRequest('/stock/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json().catch(() => ({}));
        return new Response(
            JSON.stringify(data),
            { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Stock check error:', error);
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Stock check failed' 
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
