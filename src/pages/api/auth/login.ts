import type { APIRoute } from 'astro';
import { verifyTurnstile } from '../../../lib/turnstile';
import { hasWPConnection, makeWPRequest } from '../../../lib/phantomwp-request';


// Ensure this route is not prerendered (server-side only)
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
    try {
        const { email, password, turnstile_token } = await request.json();
        
        if (!email || !password) {
            return new Response(
                JSON.stringify({ success: false, error: 'Email and password are required' }),
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
        
        // Call the PhantomWP Connect JWT authentication endpoint
        const response = await makeWPRequest('/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: email, password }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: data.error || data.message || 'Authentication failed'
                }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({
                success: true,
                token: data.token,
                user_email: data.user_email,
                user_nicename: data.user_nicename,
                user_display_name: data.user_display_name,
                customer_id: data.customer_id || data.user_id,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Login error:', error);
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Server error' 
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
