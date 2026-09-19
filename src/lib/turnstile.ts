const TURNSTILE_SECRET_KEY = import.meta.env.TURNSTILE_SECRET_KEY || '';

/**
 * Whether Turnstile is configured on the server. Routes that should reject
 * traffic outright without bot protection (e.g. review submission) check this
 * before accepting requests.
 */
export function isTurnstileConfigured(): boolean {
    return !!TURNSTILE_SECRET_KEY;
}

/**
 * Verify a Cloudflare Turnstile token.
 * Returns true if verification passes OR if Turnstile is not configured.
 */
export async function verifyTurnstile(token: string | undefined | null, remoteIp?: string): Promise<{ success: boolean; error?: string }> {
    if (!TURNSTILE_SECRET_KEY) {
        return { success: true };
    }

    if (!token) {
        return { success: false, error: 'Security verification required. Please complete the challenge.' };
    }

    try {
        const body: Record<string, string> = {
            secret: TURNSTILE_SECRET_KEY,
            response: token,
        };
        if (remoteIp) {
            body.remoteip = remoteIp;
        }

        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        if (data.success) {
            return { success: true };
        }
        return { success: false, error: 'Security verification failed. Please try again.' };
    } catch {
        return { success: false, error: 'Security verification unavailable. Please try again.' };
    }
}
