'use client';

import { useState } from 'react';
import { addToCart, openCartDrawer } from '../../lib/cart';
import { formatStorePrice } from '../../config/store';

interface Product {
    id: number;
    name: string;
    slug: string;
    price: string;
    regular_price?: string;
    on_sale?: boolean;
    images?: Array<{ src: string; alt?: string }>;
    average_rating?: string;
    rating_count?: number;
    is_in_stock?: boolean;
    stock_status?: string;
    short_description?: string;
    sku?: string;
}

interface ProductCardProps {
    product: Product;
    showRating?: boolean;
    showAddToCart?: boolean;
}

export default function ProductCard({ 
    product, 
    showRating = true,
    showAddToCart = true 
}: ProductCardProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    const inStock = product.is_in_stock !== false && product.stock_status !== 'outofstock';
    const imageUrl = product.images?.[0]?.src || '/placeholder-product.jpg';
    const imageAlt = product.images?.[0]?.alt || product.name;
    
    const rating = parseFloat(product.average_rating || '0');
    const ratingCount = product.rating_count || 0;

    const discountPercent = product.on_sale && product.regular_price && product.price
        ? Math.round(((parseFloat(product.regular_price) - parseFloat(product.price)) / parseFloat(product.regular_price)) * 100)
        : null;

    const handleAddToCart = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!inStock || isAdding) return;

        setIsAdding(true);
        await new Promise(resolve => setTimeout(resolve, 300));

        addToCart({
            id: product.id,
            name: product.name,
            price: parseFloat(product.price) || 0,
            quantity: 1,
            image: imageUrl,
            sku: product.sku || '',
        });

        setIsAdding(false);
        openCartDrawer();
    };

    return (
        <a 
            href={`/tienda/producto/${product.slug}`}
            className="group block bg-surface rounded-2xl border border-outline overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all duration-300"
        >
            {/* Image Container */}
            <div className="relative aspect-square overflow-hidden bg-surface-alt">
                {/* Loading skeleton */}
                {!imageLoaded && (
                    <div className="absolute inset-0 bg-surface-alt animate-pulse" />
                )}
                
                <img 
                    src={imageUrl}
                    alt={imageAlt}
                    loading="lazy"
                    onLoad={() => setImageLoaded(true)}
                    className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${
                        imageLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                />

                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-2">
                    {product.on_sale && discountPercent && (
                        <span className="px-2 py-1 bg-red-500 text-white text-xs font-semibold rounded">
                            -{discountPercent}%
                        </span>
                    )}
                    {!inStock && (
                        <span className="px-2 py-1 bg-gray-800 text-white text-xs font-semibold rounded">
                            Out of Stock
                        </span>
                    )}
                </div>

                {/* Quick Add Button */}
                {showAddToCart && inStock && (
                    <button
                        onClick={handleAddToCart}
                        disabled={isAdding}
                        className="absolute bottom-3 right-3 p-3 bg-primary text-white rounded-full opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 hover:bg-primary-dark cursor-pointer disabled:opacity-50"
                        aria-label="Add to cart"
                    >
                        {isAdding ? (
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        )}
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="p-4">
                {/* Rating */}
                {showRating && rating > 0 && (
                    <div className="flex items-center gap-1 mb-2">
                        <div className="flex">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <svg
                                    key={star}
                                    className={`w-4 h-4 ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                            ))}
                        </div>
                        <span className="text-xs text-content-light">({ratingCount})</span>
                    </div>
                )}

                {/* Name */}
                <h3 className="font-medium text-content group-hover:text-primary transition-colors line-clamp-2 mb-2">
                    {product.name}
                </h3>

                {/* Price */}
                <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-primary">
                        {formatStorePrice(parseFloat(product.price) || 0)}
                    </span>
                    {product.on_sale && product.regular_price && (
                        <span className="text-sm text-content-lighter line-through">
                            {formatStorePrice(parseFloat(product.regular_price) || 0)}
                        </span>
                    )}
                </div>
            </div>
        </a>
    );
}
