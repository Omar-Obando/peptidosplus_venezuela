import type { APIRoute } from 'astro';
import { hasWPConnection, makeWooRequest } from '../../../lib/phantomwp-request';

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
        const response = await makeWooRequest('/checkout/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                billing: {
                    country: body.country,
                    state: body.state || '',
                    postcode: body.postcode || '',
                },
                shipping: {
                    country: body.country,
                    state: body.state || '',
                    postcode: body.postcode || '',
                },
                line_items: body.line_items,
                coupon_lines: body.coupon_lines || [],
                shipping_rate_id: body.shipping_rate_id,
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            return new Response(
                JSON.stringify({ success: false, error: data.error || 'Failed to calculate tax' }),
                { status: response.status || 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({
                success: true,
                tax_total: parseFloat(data.totals?.total_tax || '0'),
                shipping_total: parseFloat(data.totals?.shipping_total || '0'),
                total: parseFloat(data.totals?.total || '0'),
                currency: data.currency,
                currency_symbol: data.currency_symbol,
                currency_position: data.currency_position,
                price_decimal_separator: data.price_decimal_separator,
                price_thousand_separator: data.price_thousand_separator,
                price_decimals: data.price_decimals,
                price_format: data.price_format,
                totals: data.totals || {},
                items: data.items || [],
                shipping_packages: data.shipping_packages || [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Tax estimate error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
