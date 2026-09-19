import type { APIRoute } from 'astro';
import { verifyTurnstile } from '../../../lib/turnstile';
import { hasWPConnection, makeWPRequest } from '../../../lib/phantomwp-request';


export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
    try {
        const { email, password, firstName, lastName, turnstile_token } = await request.json();
        
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

        const response = await makeWPRequest('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                password,
                first_name: firstName || '',
                last_name: lastName || '',
            }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            let errorMessage = data.error || data.message || 'Registration failed';
            
            if (data.code === 'registration-error-email-exists') {
                errorMessage = 'An account with this email already exists';
            } else if (data.code === 'registration-error-username-exists') {
                errorMessage = 'An account with this username already exists';
            }
            
            return new Response(
                JSON.stringify({ success: false, error: errorMessage }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }
        
        return new Response(
            JSON.stringify({
                success: true,
                token: data.token,
                customer_id: data.customer_id || data.user_id,
                email: data.user_email || email,
                user_display_name: data.user_display_name,
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Registration error:', error);
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Server error' 
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
