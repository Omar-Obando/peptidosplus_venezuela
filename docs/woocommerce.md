# WooCommerce Store Reference

This is a WooCommerce storefront connected through PhantomWP Connect.
Products load from the WooCommerce Store API at dev/build time, and the settings
panel can sync product images plus JSON snapshots into src/data. Cart is
client-side (nanostores + localStorage). Checkout, orders, and customer auth go
through server API routes that call PhantomWP Connect.

## Product Data (src/lib/local-product-data.ts)

All functions are async:
```typescript
getLocalProducts()                    // All products
getLocalProduct(slug)                 // Single by slug
getLocalCategories()                  // All categories
getLocalVisibleCategories()           // Categories with count > 0
getLocalProductsByCategory(slug)      // By category slug
getLocalFeaturedProducts(limit)       // Featured products
getLocalRelatedProducts(product, limit) // Related by category/tag
```

## WooCommerce Helpers (src/lib/woocommerce.ts)
```typescript
formatPrice(price)             // Format with currency symbol
isInStock(product)             // boolean
getDiscountPercentage(product) // number (e.g. 25)
stripHtml(html)                // Remove HTML tags
```

## Cart (src/lib/cart.ts) - client-side nanostores
```typescript
$cart, $cartCount, $cartTotal          // Reactive state
addToCart(item), removeFromCart(id), updateQuantity(id, qty), clearCart()
getLineItems()                         // For order creation: [{ product_id, quantity }]
openCartDrawer(), closeCartDrawer()    // Cart drawer control
initCart()                             // Initialize from localStorage
```
CartItem: { id, name, price, quantity, image?, variation_id? }

## Auth (src/lib/auth.ts) - PhantomWP Connect JWT
Visitor auth is provided by the PhantomWP Connect plugin when enabled in wp-admin.
```typescript
$isLoggedIn, $user, $token             // Reactive state
login(email, password)                 // { success, error? }
register({ email, password, firstName?, lastName? })
logout(), getToken(), initAuth()
requestPasswordReset(email)            // { success, error? } - sends reset email
```
Password reset: /forgot-password -> PhantomWP Connect reset email -> /reset-password -> plugin updates the customer password.

## Payments (src/lib/payments.ts)
```typescript
redirectToPayment('stripe', orderId, orderKey)
redirectToPayment('paypal', orderId, orderKey)
getEnabledGateways()  // [{ id, name }]
```
For v1 stores, supported payment methods are gated by WooCommerce plus local env:
- BACS/manual payment when enabled in WooCommerce.
- Stripe inline Payment Element when Woo Stripe is enabled, Stripe env vars exist, and `PUBLIC_PAYMENT_STRIPE_ENABLED=true`.
- PayPal buttons when Woo PayPal is enabled, PayPal env vars exist, and `PUBLIC_PAYMENT_PAYPAL_ENABLED=true`.
- Stripe Checkout redirect remains optional fallback, not the primary v1 flow.
Stripe/PayPal provider keys and public enable flags live in the Astro app; WooCommerce order reads and paid-status
updates go through PhantomWP Connect.

## API Routes (src/pages/api/)

All use `export const prerender = false;`

| Route | Method | Purpose |
|-------|--------|---------|
| /api/orders/create | POST | Create WooCommerce order |
| /api/orders/[orderId] | GET | Fetch order by ID (requires order_key) |
| /api/stock/check | POST | Real-time stock precheck through PhantomWP Connect |
| /api/checkout/config | GET | Payment gateways, countries, tax config, customer addresses |
| /api/auth/login | POST | Customer login (JWT) |
| /api/auth/register | POST | Create WooCommerce customer |
| /api/auth/validate | POST | Validate JWT token |
| /api/auth/forgot-password | POST | Send password reset email through PhantomWP Connect |
| /api/auth/reset-password | POST | Reset password through PhantomWP Connect |
| /api/customer/me | GET | Current customer data |
| /api/customer/orders | GET | Customer order history |
| /api/customer/orders/[id] | GET | Single order detail (verified ownership) |
| /api/customer/addresses | GET/PUT | Billing/shipping addresses |
| /api/customer/settings | PUT | Update name and password |
| /api/payments/stripe/create-session | POST | Optional Stripe Checkout redirect fallback |
| /api/payments/stripe/create-intent | POST | Stripe PaymentIntent (inline Payment Element) |
| /api/payments/stripe/webhook | POST | Stripe webhook |
| /api/payments/paypal/create-session | POST | PayPal order |
| /api/payments/paypal/capture | POST | PayPal capture |

## Pages

| Route | File |
|-------|------|
| / | src/pages/index.astro (homepage) |
| /shop | src/pages/shop/index.astro (product grid) |
| /shop/product/[slug] | src/pages/shop/product/[slug].astro |
| /shop/category/[slug] | src/pages/shop/category/[slug].astro |
| /cart | src/pages/cart.astro |
| /checkout | src/pages/checkout.astro |
| /order-complete | src/pages/order-complete.astro |
| /search | src/pages/search.astro (product search) |
| /login | src/pages/login.astro |
| /register | src/pages/register.astro |
| /forgot-password | src/pages/forgot-password.astro |
| /reset-password | src/pages/reset-password.astro |
| /account | src/pages/account/index.astro |
| /account/orders | src/pages/account/orders/index.astro |
| /account/orders/[id] | src/pages/account/orders/[id].astro |
| /account/addresses | src/pages/account/addresses.astro |
| /account/settings | src/pages/account/settings.astro |

## Components

Astro (src/components/shop/): ProductCard.astro, ProductImage.astro, AddToCartButton.astro, CartDrawer.astro
React (src/components/react/): CartDrawer.tsx, AddToCartButton.tsx, ProductCard.tsx, ProductImage.tsx, RecentOrders.tsx
Use `client:load` for React component hydration.

## Environment Variables (.env)

Required for the PhantomWP Connect path: WP_API_URL, WP_ACCESS_SECRET, JWT_SECRET
Legacy URL/secret aliases kept for older deployments: WC_API_URL, WC_ACCESS_SECRET
Optional payments: STRIPE_SECRET_KEY, PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, PAYPAL_CLIENT_ID, PUBLIC_PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE, PUBLIC_SITE_URL
Currency display settings come from WooCommerce and are written to src/config/store.ts, which is safe to commit. Secrets remain in .env or deployment environment variables.

## Generated Files (DO NOT MODIFY)

In addition to the base generated files, these WooCommerce files are auto-generated:
- src/lib/woocommerce.ts, src/lib/cart.ts, src/lib/auth.ts, src/lib/payments.ts, src/lib/phantomwp-request.ts
- src/lib/local-product-data.ts, src/lib/product-media.ts
- src/pages/api/**/*.ts (all API routes)
- src/components/shop/*.astro, src/components/react/*.tsx

Create new files instead of modifying generated ones.
