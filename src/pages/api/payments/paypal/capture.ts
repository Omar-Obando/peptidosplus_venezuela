/**
 * PayPal Capture Handler
 * 
 * GET /api/payments/paypal/capture
 * Called by PayPal after user approves payment
 * POST /api/payments/paypal/capture
 * Captures inline PayPal Buttons approvals
 */

import type { APIRoute } from 'astro';
import { hasWPConnection, makeWooRequest } from '../../../../lib/phantomwp-request';

const PAYPAL_CLIENT_ID = import.meta.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = import.meta.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = import.meta.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_API_URL = PAYPAL_MODE === 'live' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';
const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'http://localhost:4321';

async function loadOrder(orderId: string, orderKey: string) {
    const response = await makeWooRequest('/orders/' + encodeURIComponent(String(orderId)) + '?order_key=' + encodeURIComponent(orderKey || ''));
    if (!response.ok) return null;
    const order = await response.json();
    return order?.success === false ? null : order;
}

function normalizeCurrency(value: unknown): string {
    return String(value || '').trim().toUpperCase();
}

function currencyMinorUnit(currency: string): number {
    const upper = currency.toUpperCase();
    if (['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'].includes(upper)) return 0;
    if (['BHD', 'JOD', 'KWD', 'OMR', 'TND'].includes(upper)) return 3;
    return 2;
}

function toMinorAmount(value: string | number, currency: string): number {
    return Math.round(Number(value) * Math.pow(10, currencyMinorUnit(currency)));
}

async function getPayPalAccessToken(): Promise<string> {
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    
    const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    
    if (!response.ok) {
        throw new Error('Failed to get PayPal access token');
    }
    
    const data = await response.json();
    return data.access_token;
}

async function capturePayPalOrder(paypalOrderId: string, wcOrderId: string, wcOrderKey: string) {
    if (!hasWPConnection() || !PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        return {
            status: 500,
            body: { success: false, error: 'PayPal is not configured' },
        };
    }

    const order = await loadOrder(wcOrderId, wcOrderKey);
    if (!order) {
        return {
            status: 404,
            body: { success: false, error: 'Order not found' },
        };
    }

    const accessToken = await getPayPalAccessToken();
    
    // Capture the PayPal order
    const captureResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${paypalOrderId}/capture`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    });
    
    if (!captureResponse.ok) {
        console.error('PayPal capture failed:', await captureResponse.text());
        return {
            status: 502,
            body: { success: false, error: 'PayPal capture failed' },
        };
    }
    
    const captureData = await captureResponse.json();
    
    if (captureData.status !== 'COMPLETED') {
        return {
            status: 400,
            body: { success: false, error: 'Payment was not completed' },
        };
    }

    const captureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    const captureAmount = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.amount || {};
    const captureCurrency = normalizeCurrency(captureAmount.currency_code);
    const orderCurrency = normalizeCurrency(order.currency);
    const referenceMatches = captureData.purchase_units?.[0]?.reference_id === String(order.id);
    const currencyMatches = captureCurrency === orderCurrency;
    const amountMatches = toMinorAmount(captureAmount.value, captureCurrency) === toMinorAmount(order.total, orderCurrency);

    if (!referenceMatches || !currencyMatches || !amountMatches) {
        console.error('PayPal capture did not match WooCommerce order:', {
            wcOrderId,
            paypalReferenceId: captureData.purchase_units?.[0]?.reference_id,
            paypalAmount: captureData.purchase_units?.[0]?.payments?.captures?.[0]?.amount,
            wooTotal: order.total,
            wooCurrency: order.currency,
        });
        return {
            status: 400,
            body: { success: false, error: 'PayPal payment did not match the WooCommerce order' },
        };
    }
    
    const updateRes = await makeWooRequest('/orders/' + encodeURIComponent(wcOrderId) + '/payment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            status: 'paid',
            transaction_id: captureId || paypalOrderId,
            provider: 'paypal',
        }),
    });
    const updatedOrder = await updateRes.json().catch(() => null);
    
    if (!updateRes.ok || updatedOrder?.success === false) {
        return {
            status: updateRes.status || 502,
            body: { success: false, error: updatedOrder?.error || 'Could not update WooCommerce order payment status' },
        };
    }

    console.log(`Order ${wcOrderId} marked as paid via PayPal`);
    
    return {
        status: 200,
        body: {
            success: true,
            order_id: wcOrderId,
            order_key: wcOrderKey || updatedOrder?.order_key || order.order_key || '',
            transaction_id: captureId || paypalOrderId,
        },
    };
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const { paypal_order_id, wc_order_id, wc_order_key } = await request.json();
        if (!paypal_order_id || !wc_order_id) {
            return new Response(JSON.stringify({ success: false, error: 'Missing PayPal or Woo order ID' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        const result = await capturePayPalOrder(String(paypal_order_id), String(wc_order_id), String(wc_order_key || ''));
        return new Response(JSON.stringify(result.body), {
            status: result.status,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('PayPal capture error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'PayPal capture failed' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('token'); // PayPal order ID
    const wcOrderId = url.searchParams.get('wc_order_id');
    const wcOrderKey = url.searchParams.get('wc_order_key') || '';
    
    if (!token || !wcOrderId) {
        return Response.redirect(`${SITE_URL}/finalizar-compra?error=missing_params`, 302);
    }
    
    try {
        const result = await capturePayPalOrder(token, wcOrderId, wcOrderKey);
        if (result.body.success) {
            return Response.redirect(`${SITE_URL}/order-complete?order_id=${wcOrderId}&order_key=${encodeURIComponent(result.body.order_key || wcOrderKey)}`, 302);
        }
        return Response.redirect(`${SITE_URL}/finalizar-compra?error=${encodeURIComponent(result.body.error || 'capture_failed')}&order_id=${wcOrderId}`, 302);
    } catch (error) {
        console.error('PayPal capture error:', error);
        return Response.redirect(`${SITE_URL}/finalizar-compra?error=capture_error&order_id=${wcOrderId}`, 302);
    }
};
