/**
 * Authentication Helper
 * 
 * Client-side authentication backed by the PhantomWP Connect JWT endpoints
 * Uses nanostores for reactive auth state
 * 
 * Requirements:
 * - WordPress site must have the PhantomWP Connect plugin installed and paired
 * - Visitor Authentication must be enabled in wp-admin > PhantomWP
 * - Recommended: protect the WordPress origin with X-PhantomWP-Secret
 * 
 * Usage:
 * <script>
 *   import { $user, $isLoggedIn, login, logout } from '../lib/auth';
 *   
 *   // Subscribe to auth state
 *   $isLoggedIn.subscribe(loggedIn => console.log('Auth:', loggedIn));
 *   
 *   // Login
 *   const result = await login('email@example.com', 'password');
 *   if (result.success) {
 *     console.log('Logged in as:', $user.get());
 *   }
 * </script>
 */

import { atom, computed } from 'nanostores';

// ============================================================================
// Types
// ============================================================================

export interface AuthUser {
    email: string;
    name: string;
    nicename: string;
    customerId?: number;
}

export interface JWTAuthResponse {
    token: string;
    user_email: string;
    user_nicename: string;
    user_display_name: string;
}

export interface AuthResult {
    success: boolean;
    error?: string;
    user?: AuthUser;
}

export interface RegisterData {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    turnstileToken?: string;
}

// ============================================================================
// Constants
// ============================================================================

const TOKEN_STORAGE_KEY = 'wc_auth_token';
const USER_STORAGE_KEY = 'wc_auth_user';

// ============================================================================
// Auth Store
// ============================================================================

/**
 * Current user atom
 */
export const $user = atom<AuthUser | null>(null);

/**
 * Auth token (stored separately for security)
 */
export const $token = atom<string | null>(null);

/**
 * Whether user is logged in
 */
export const $isLoggedIn = computed($token, (token) => !!token);

/**
 * Loading state for auth operations
 */
export const $authLoading = atom<boolean>(false);

/**
 * Auth error message
 */
export const $authError = atom<string | null>(null);

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize auth state from localStorage
 * Call this on app/page mount
 */
export function initAuth(): void {
    if (typeof window === 'undefined') return;
    
    try {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        const userJson = localStorage.getItem(USER_STORAGE_KEY);
        
        if (token && userJson) {
            const user = JSON.parse(userJson);
            $token.set(token);
            $user.set(user);
        }
    } catch (error) {
        console.error('Failed to load auth state:', error);
        clearAuthState();
    }
}

/**
 * Clear all auth state
 */
function clearAuthState(): void {
    $token.set(null);
    $user.set(null);
    $authError.set(null);
    
    if (typeof window !== 'undefined') {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
    }
}

/**
 * Save auth state to localStorage
 */
function persistAuthState(token: string, user: AuthUser): void {
    if (typeof window === 'undefined') return;
    
    try {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch (error) {
        console.error('Failed to save auth state:', error);
    }
}

// ============================================================================
// Auth Operations
// ============================================================================

/**
 * Login with email and password
 * Authenticates against WordPress JWT endpoint
 */
export async function login(email: string, password: string, turnstileToken?: string): Promise<AuthResult> {
    $authLoading.set(true);
    $authError.set(null);
    
    try {
        // Call our API route which proxies to WordPress
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}) }),
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            const error = data.error || 'Login failed';
            $authError.set(error);
            return { success: false, error };
        }
        
        const user: AuthUser = {
            email: data.user_email,
            name: data.user_display_name,
            nicename: data.user_nicename,
            customerId: data.customer_id,
        };
        
        $token.set(data.token);
        $user.set(user);
        persistAuthState(data.token, user);
        
        // Dispatch custom event
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:login', { detail: { user } }));
        }
        
        return { success: true, user };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Network error';
        $authError.set(message);
        return { success: false, error: message };
    } finally {
        $authLoading.set(false);
    }
}

/**
 * Register a new user
 * Creates WordPress user and WooCommerce customer
 */
export async function register(data: RegisterData): Promise<AuthResult> {
    $authLoading.set(true);
    $authError.set(null);
    
    try {
        const { turnstileToken, ...registerFields } = data;
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...registerFields, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}) }),
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            const error = result.error || 'Registration failed';
            $authError.set(error);
            return { success: false, error };
        }
        
        if (result.token) {
            const user: AuthUser = {
                email: result.email || data.email,
                name: result.user_display_name || data.email,
                nicename: result.user_nicename || '',
                customerId: result.customer_id,
            };
            $token.set(result.token);
            $user.set(user);
            persistAuthState(result.token, user);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('auth:login', { detail: { user } }));
            }
            return { success: true, user };
        }
        
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Network error';
        $authError.set(message);
        return { success: false, error: message };
    } finally {
        $authLoading.set(false);
    }
}

/**
 * Logout user
 * Clears token and user state
 */
export function logout(): void {
    clearAuthState();
    
    // Dispatch custom event
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:logout'));
    }
}

/**
 * Validate current token
 * Returns true if token is still valid
 */
export async function validateToken(): Promise<boolean> {
    const token = $token.get();
    if (!token) return false;
    
    try {
        const response = await fetch('/api/auth/validate', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.valid) {
            // Token is invalid, clear auth state
            clearAuthState();
            return false;
        }
        
        return true;
    } catch {
        return false;
    }
}

/**
 * Refresh user data from server
 * Useful after profile updates
 */
export async function refreshUser(): Promise<AuthUser | null> {
    const token = $token.get();
    if (!token) return null;
    
    try {
        const response = await fetch('/api/customer/me', {
            headers: { 
                'Authorization': `Bearer ${token}`,
            },
        });
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        
        const user: AuthUser = {
            email: data.email,
            name: `${data.first_name} ${data.last_name}`.trim() || data.email,
            nicename: data.username,
            customerId: data.id,
        };
        
        $user.set(user);
        persistAuthState(token, user);
        
        return user;
    } catch {
        return null;
    }
}

// ============================================================================
// Token Helpers
// ============================================================================

/**
 * Get current auth token
 */
export function getToken(): string | null {
    return $token.get();
}

/**
 * Get authorization header value
 */
export function getAuthHeader(): string | null {
    const token = $token.get();
    return token ? `Bearer ${token}` : null;
}

/**
 * Make authenticated fetch request
 * Automatically includes auth header if logged in
 */
export async function authFetch(
    url: string, 
    options: RequestInit = {}
): Promise<Response> {
    const token = $token.get();
    
    const headers = new Headers(options.headers);
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    
    return fetch(url, {
        ...options,
        headers,
    });
}

// ============================================================================
// Password Reset
// ============================================================================

/**
 * Request password reset email
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            return { success: false, error: data.error || 'Failed to send reset email' };
        }
        
        return { success: true };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Network error' 
        };
    }
}
