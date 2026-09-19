import type { APIRoute } from 'astro';
import { verifyTurnstile } from '../../../lib/turnstile';
import { hasWPConnection, makeWPRequest } from '../../../lib/phantomwp-request';


export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
    try {
        const { email, turnstile_token } = await request.json();

        if (!email) {
            return new Response(
                JSON.stringify({ success: false, error: 'Email is required' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || '';
        const turnstileResult = await verifyTurnstile(turnstile_token, ip);
        if (!turnstileResult.success) {
            return new Response(
                JSON.stringify({ success: false, error: turnstileResult.error }),
                { status: 403, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (!hasWPConnection()) {
            return new Response(
                JSON.stringify({ success: false, error: 'WordPress connection is not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const response = await makeWPRequest('/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });

        const data = await response.json().catch(() => ({ success: response.ok }));
        return new Response(
            JSON.stringify(data),
            { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Forgot password error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'An error occurred' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
