'use client';

import { useState } from 'react';
import { addToCart, openCartDrawer } from '../../lib/cart';

interface Product {
    id: number;
    name: string;
    price: string;
    sku?: string;
    images?: Array<{ src: string }>;
}

interface AddToCartButtonProps {
    product: Product;
    showQuantity?: boolean;
    size?: 'small' | 'medium' | 'large';
    inStock?: boolean;
    className?: string;
}

export default function AddToCartButton({ 
    product, 
    showQuantity = false, 
    size = 'medium',
    inStock = true,
    className = ''
}: AddToCartButtonProps) {
    const [quantity, setQuantity] = useState(1);
    const [isAdding, setIsAdding] = useState(false);
    const [added, setAdded] = useState(false);

    const sizeClasses = {
        small: 'px-3 py-2 text-sm',
        medium: 'px-4 py-3 text-base',
        large: 'px-6 py-4 text-lg',
    };

    const handleAddToCart = async () => {
        if (!inStock || isAdding) return;

        setIsAdding(true);

        // Simulate a small delay for better UX
        await new Promise(resolve => setTimeout(resolve, 300));

        addToCart({
            id: product.id,
            name: product.name,
            price: parseFloat(product.price) || 0,
            quantity,
            image: product.images?.[0]?.src || '',
            sku: product.sku || '',
        });

        setIsAdding(false);
        setAdded(true);
        openCartDrawer();

        // Reset "added" state after 2 seconds
        setTimeout(() => setAdded(false), 2000);
    };

    const decreaseQuantity = () => {
        if (quantity > 1) setQuantity(q => q - 1);
    };

    const increaseQuantity = () => {
        setQuantity(q => q + 1);
    };

    return (
        <div className={`flex items-center gap-4 ${className}`}>
            {/* Quantity Selector */}
            {showQuantity && inStock && (
                <div className="flex items-center border border-outline rounded-lg overflow-hidden">
                    <button 
                        type="button"
                        onClick={decreaseQuantity}
                        disabled={quantity <= 1}
                        className="w-10 h-10 flex items-center justify-center text-content-light hover:text-content hover:bg-surface-alt transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Decrease quantity"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                    </button>
                    <input 
                        type="number" 
                        min="1" 
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-14 h-10 text-center border-x border-outline text-content bg-surface focus:outline-none"
                    />
                    <button 
                        type="button"
                        onClick={increaseQuantity}
                        className="w-10 h-10 flex items-center justify-center text-content-light hover:text-content hover:bg-surface-alt transition-colors cursor-pointer"
                        aria-label="Increase quantity"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>
            )}
            
            {/* Add to Cart Button */}
            <button 
                type="button"
                onClick={handleAddToCart}
                disabled={!inStock || isAdding}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg font-semibold transition-all cursor-pointer ${sizeClasses[size]} ${
                    !inStock 
                        ? 'bg-surface-alt text-content-lighter cursor-not-allowed' 
                        : added
                            ? 'bg-green-500 text-white'
                            : 'bg-primary text-white hover:bg-primary-dark'
                }`}
            >
                {isAdding ? (
                    <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Adding...
                    </>
                ) : added ? (
                    <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Added!
                    </>
                ) : inStock ? (
                    <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Add to Cart
                    </>
                ) : (
                    'Out of Stock'
                )}
            </button>
        </div>
    );
}
