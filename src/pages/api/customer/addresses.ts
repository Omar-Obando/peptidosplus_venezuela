import type { APIRoute } from 'astro';
import { hasWPConnection, makeWooRequest, withVisitorAuth } from '../../../lib/phantomwp-request';


export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
    if (!hasWPConnection()) {
        return new Response(JSON.stringify({ success: false, error: 'WordPress connection is not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    try {
        const response = await makeWooRequest('/customer/addresses', withVisitorAuth(request));
        const data = await response.json().catch(() => ({}));
        return new Response(JSON.stringify(data), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('Get addresses error:', error);
        return new Response(JSON.stringify({ success: false, error: 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
};

export const PUT: APIRoute = async ({ request }) => {
    if (!hasWPConnection()) {
        return new Response(JSON.stringify({ success: false, error: 'WordPress connection is not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    try {
        const body = await request.json();
        const response = await makeWooRequest('/customer/addresses', withVisitorAuth(request, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }));
        const data = await response.json().catch(() => ({}));
        return new Response(JSON.stringify(data), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('Update addresses error:', error);
        return new Response(JSON.stringify({ success: false, error: 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
};
