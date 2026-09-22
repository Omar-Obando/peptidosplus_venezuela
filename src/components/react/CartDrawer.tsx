'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { 
    $cart, 
    $cartTotal, 
    $cartCount,
    $cartDrawerOpen, 
    initCart, 
    closeCartDrawer,
    removeFromCart,
    incrementQuantity,
    decrementQuantity,
    formatCartPrice,
    type CartItem
} from '../../lib/cart';

export default function CartDrawer() {
    const cart = useStore($cart);
    const total = useStore($cartTotal);
    const count = useStore($cartCount);
    const isOpen = useStore($cartDrawerOpen);
    const [mounted, setMounted] = useState(false);
    const [, rerenderForCurrency] = useState(0);

    useEffect(() => {
        initCart();
        setMounted(true);

        const renderItems = () => rerenderForCurrency((version) => version + 1);
        window.addEventListener('cart:currency-updated', renderItems);

        return () => {
            window.removeEventListener('cart:currency-updated', renderItems);
        };
    }, []);

    // Don't render on server
    if (!mounted) return null;

    return (
        <>
            {/* Overlay */}
            <div 
                className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${
                    isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={closeCartDrawer}
            />

            {/* Drawer */}
            <aside 
                className={`fixed top-0 right-0 h-full w-full max-w-md bg-surface border-l border-outline z-50 transform transition-transform duration-300 ease-out ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-outline">
                    <h2 className="text-lg font-semibold text-content">
                        Your Cart ({count})
                    </h2>
                    <button 
                        onClick={closeCartDrawer}
                        className="p-2 hover:bg-surface-alt rounded-lg transition-colors cursor-pointer"
                        aria-label="Close cart"
                    >
                        <svg className="w-5 h-5 text-content-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: 'calc(100vh - 180px)' }}>
                    {cart.length === 0 ? (
                        <div className="text-center py-12">
                            <svg className="w-16 h-16 text-content-lighter mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                            <p className="text-content-light mb-4">Your cart is empty</p>
                            <button 
                                onClick={closeCartDrawer}
                                className="text-primary hover:text-primary-dark font-medium cursor-pointer"
                            >
                                Continue Shopping
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {cart.map((item) => (
                                <CartItemRow 
                                    key={item.id} 
                                    item={item}
                                    onRemove={() => removeFromCart(item.id)}
                                    onIncrement={() => incrementQuantity(item.id)}
                                    onDecrement={() => decrementQuantity(item.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {cart.length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-outline bg-surface">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-content-light">Subtotal</span>
                            <span className="text-xl font-semibold text-content">
                                {formatCartPrice(total)}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <a 
                                href="/carrito" 
                                className="block text-center py-3 border border-outline rounded-lg text-content hover:bg-surface-alt transition-colors cursor-pointer"
                            >
                                View Cart
                            </a>
                            <a 
                                href="/finalizar-compra" 
                                className="block text-center py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors cursor-pointer"
                            >
                                Checkout
                            </a>
                        </div>
                    </div>
                )}
            </aside>
        </>
    );
}

function CartItemRow({ 
    item, 
    onRemove, 
    onIncrement, 
    onDecrement 
}: { 
    item: CartItem; 
    onRemove: () => void;
    onIncrement: () => void;
    onDecrement: () => void;
}) {
    return (
        <div className="flex gap-4 p-3 bg-surface-alt rounded-lg">
            {/* Image */}
            {item.image && (
                <img 
                    src={item.image} 
                    alt={item.name}
                    className="w-20 h-20 object-cover rounded-lg"
                />
            )}
            
            {/* Details */}
            <div className="flex-1 min-w-0">
                <h3 className="font-medium text-content truncate">{item.name}</h3>
                <p className="text-primary font-medium">{formatCartPrice(item.price)}</p>
                
                {/* Quantity Controls */}
                <div className="flex items-center gap-2 mt-2">
                    <button 
                        onClick={onDecrement}
                        className="w-8 h-8 flex items-center justify-center border border-outline rounded hover:bg-surface transition-colors cursor-pointer"
                        aria-label="Decrease quantity"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                    </button>
                    <span className="w-8 text-center text-content">{item.quantity}</span>
                    <button 
                        onClick={onIncrement}
                        className="w-8 h-8 flex items-center justify-center border border-outline rounded hover:bg-surface transition-colors cursor-pointer"
                        aria-label="Increase quantity"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>
            </div>
            
            {/* Remove Button */}
            <button 
                onClick={onRemove}
                className="self-start p-1 text-content-lighter hover:text-red-500 transition-colors cursor-pointer"
                aria-label="Remove item"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        </div>
    );
}
