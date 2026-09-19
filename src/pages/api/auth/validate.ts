import type { APIRoute } from 'astro';
import { hasWPConnection, makeWPRequest } from '../../../lib/phantomwp-request';


export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
    try {
        const authHeader = request.headers.get('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(
                JSON.stringify({ valid: false, error: 'No token provided' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }
        
        if (!hasWPConnection()) {
            return new Response(
                JSON.stringify({ valid: false, error: 'WordPress connection is not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }
        
        const token = authHeader.substring(7);
        
        // Call the PhantomWP Connect JWT validation endpoint
        const response = await makeWPRequest('/auth/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        });
        
        if (!response.ok) {
            return new Response(
                JSON.stringify({ valid: false, error: 'Invalid token' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }
        
        return new Response(
            JSON.stringify({ valid: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Validation error:', error);
        return new Response(
            JSON.stringify({ valid: false, error: 'Validation failed' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
