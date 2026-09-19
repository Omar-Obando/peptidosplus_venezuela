import type { APIRoute } from 'astro';
import { verifyTurnstile, isTurnstileConfigured } from '../../../lib/turnstile';
import { hasWPConnection, makeWooRequest } from '../../../lib/phantomwp-request';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
    if (!hasWPConnection()) {
        return new Response(
            JSON.stringify({ success: false, error: 'WordPress connection is not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Reviews accept anonymous input, so unlike checkout/auth they fail closed
    // without bot protection: no Turnstile, no review submission.
    if (!isTurnstileConfigured()) {
        return new Response(
            JSON.stringify({ success: false, error: 'Review submission is disabled on this store.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const { product_id, rating, review, reviewer, reviewer_email, turnstile_token } = await request.json();

        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || '';
        const turnstileResult = await verifyTurnstile(turnstile_token, ip);
        if (!turnstileResult.success) {
            return new Response(
                JSON.stringify({ success: false, error: turnstileResult.error }),
                { status: 403, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (!product_id || !rating || !review) {
            return new Response(
                JSON.stringify({ success: false, error: 'product_id, rating, and review are required' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (rating < 1 || rating > 5) {
            return new Response(
                JSON.stringify({ success: false, error: 'Rating must be between 1 and 5' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const response = await makeWooRequest('/reviews/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product_id: Number(product_id),
                review,
                reviewer: reviewer || 'Anonymous',
                reviewer_email: reviewer_email || '',
                rating: Number(rating),
            }),
        });

        const data = await response.json().catch(() => ({}));
        return new Response(
            JSON.stringify(data),
            { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Submit review error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
