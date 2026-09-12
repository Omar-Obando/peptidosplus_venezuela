/**
 * PhantomWP Connect request helper
 *
 * Server-only helper for generated API routes. Do not import this from client
 * components or browser scripts.
 */

const WP_API_URL = import.meta.env.WP_API_URL || import.meta.env.WC_API_URL || '';
const WP_ACCESS_SECRET = import.meta.env.WP_ACCESS_SECRET || import.meta.env.WC_ACCESS_SECRET || '';

export function hasWPConnection(): boolean {
    return !!WP_API_URL && WP_API_URL.startsWith('http');
}

function connectUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    return WP_API_URL.replace(/\/+$/, '') + '/phantomwp/v1' + cleanPath;
}

export function getBearerToken(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.substring(7);
}

export function getAuthorizationHeader(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    return authHeader?.startsWith('Bearer ') ? authHeader : null;
}

export async function makeWPRequest(path: string, init: RequestInit = {}): Promise<Response> {
    if (!hasWPConnection()) {
        throw new Error('WordPress connection is not configured');
    }

    const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(init.headers as Record<string, string> || {}),
    };

    if (WP_ACCESS_SECRET) {
        headers['X-PhantomWP-Secret'] = WP_ACCESS_SECRET;
    }

    return fetch(connectUrl(path), {
        ...init,
        headers,
    });
}

export async function makeWooRequest(path: string, init: RequestInit = {}): Promise<Response> {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    return makeWPRequest('/woocommerce' + cleanPath, init);
}

export function withVisitorAuth(request: Request, init: RequestInit = {}): RequestInit {
    const authHeader = getAuthorizationHeader(request);
    if (!authHeader) return init;

    return {
        ...init,
        headers: {
            ...(init.headers as Record<string, string> || {}),
            Authorization: authHeader,
        },
    };
}
