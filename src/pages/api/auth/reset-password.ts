import type { APIRoute } from 'astro';
import { hasWPConnection, makeWPRequest } from '../../../lib/phantomwp-request';


export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
    try {
        const { key, login, password } = await request.json();

        if (!key || !login || !password) {
            return new Response(
                JSON.stringify({ success: false, error: 'Reset key, login, and password are required' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (password.length < 10) {
            return new Response(
                JSON.stringify({ success: false, error: 'Password must be at least 10 characters' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (!hasWPConnection()) {
            return new Response(
                JSON.stringify({ success: false, error: 'WordPress connection is not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const response = await makeWPRequest('/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, login, password }),
        });

        const data = await response.json().catch(() => ({ success: response.ok }));
        return new Response(
            JSON.stringify(data),
            { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Reset password error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'An error occurred' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
