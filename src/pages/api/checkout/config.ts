import type { APIRoute } from 'astro';
import { hasWPConnection, makeWooRequest, withVisitorAuth } from '../../../lib/phantomwp-request';

export const prerender = false;

const localStripeCredentialsConfigured = !!import.meta.env.STRIPE_SECRET_KEY && !!import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
const localPayPalCredentialsConfigured = !!import.meta.env.PAYPAL_CLIENT_ID && !!import.meta.env.PAYPAL_CLIENT_SECRET && !!import.meta.env.PUBLIC_PAYPAL_CLIENT_ID;
const localStripeConfigured = import.meta.env.PUBLIC_PAYMENT_STRIPE_ENABLED === 'true' && localStripeCredentialsConfigured;
const localPayPalConfigured = import.meta.env.PUBLIC_PAYMENT_PAYPAL_ENABLED === 'true' && localPayPalCredentialsConfigured;

function canUseGateway(gateway: any): boolean {
    const id = String(gateway?.id || '');
    const supportedGatewayIds = ['stripe', 'paypal', 'bacs'];
    if (!supportedGatewayIds.includes(id)) return false;
    if (gateway.enabled === false) return false;
    if (gateway.supported === false) return false;
    if (id === 'bacs') return true;
    if (id === 'stripe') return localStripeConfigured;
    if (id === 'paypal') return localPayPalConfigured;
    return false;
}

export const GET: APIRoute = async ({ request }) => {
    if (!hasWPConnection()) {
        return new Response(
            JSON.stringify({ success: false, error: 'WordPress connection is not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const [configRes, customerRes] = await Promise.all([
            makeWooRequest('/config'),
            request.headers.get('Authorization') ? makeWooRequest('/customer/me', withVisitorAuth(request)) : Promise.resolve(null),
        ]);

        const config = await configRes.json();
        if (!configRes.ok || !config.success) {
            return new Response(
                JSON.stringify({ success: false, error: config.error || 'Failed to load WooCommerce config' }),
                { status: configRes.status || 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        let customer = null;
        if (customerRes?.ok) {
            const customerData = await customerRes.json().catch(() => null);
            customer = customerData?.customer || null;
        }

        return new Response(
            JSON.stringify({
                success: true,
                ...config,
                currency_symbol: config.currency_symbol,
                payment_gateways: (config.payment_gateways || []).filter(canUseGateway),
                shipping_zones: [],
                allowed_countries: config.allowed_countries || {},
                shipping_countries: config.shipping_countries || {},
                tax_enabled: !!config.tax_enabled,
                tax_display: config.tax_display_cart || 'excl',
                customer,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Checkout config error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Failed to load checkout config' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
