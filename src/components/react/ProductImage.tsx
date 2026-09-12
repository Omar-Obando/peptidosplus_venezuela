'use client';

import { useState, useEffect } from 'react';

interface ProductImageProps {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    className?: string;
    loading?: 'lazy' | 'eager';
    sizes?: string;
    aspectRatio?: 'square' | '4:3' | '16:9' | 'auto';
    onLoad?: () => void;
    /** Local path if image has been downloaded (from product-media-map) */
    localSrc?: string;
}

/**
 * React Product Image with loading state and error handling
 * 
 * Uses local images when available (after sync-product-media runs),
 * falls back to remote URLs otherwise.
 */
export default function ProductImage({ 
    src, 
    alt, 
    width = 400,
    height,
    className = '',
    loading = 'lazy',
    sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
    aspectRatio = 'square',
    onLoad,
    localSrc
}: ProductImageProps) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [imageSrc, setImageSrc] = useState<string>('');

    // Calculate height based on aspect ratio if not provided
    const aspectRatios: Record<string, number> = {
        'square': 1,
        '4:3': 0.75,
        '16:9': 0.5625,
        'auto': 1,
    };
    const calculatedHeight = height || Math.round(width * aspectRatios[aspectRatio]);

    // Determine which source to use
    useEffect(() => {
        // Prefer local source if available
        if (localSrc && localSrc.startsWith('/')) {
            // Convert /src/media/products/... to a valid URL
            // In Astro build, these get processed, but in React runtime we need the public path
            // The sync script should also copy to public/media/products for runtime access
            const publicPath = localSrc.replace('/src/media/products/', '/media/products/');
            setImageSrc(publicPath);
        } else if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
            setImageSrc(src);
        }
    }, [src, localSrc]);

    const handleLoad = () => {
        setImageLoaded(true);
        onLoad?.();
    };

    const handleError = () => {
        // If local image fails, try the remote URL as fallback
        if (imageSrc !== src && src && (src.startsWith('http://') || src.startsWith('https://'))) {
            setImageSrc(src);
            setImageError(false);
        } else {
            setImageError(true);
        }
    };

    if (!imageSrc || imageError) {
        return (
            <div 
                className={`flex items-center justify-center bg-surface-alt ${className}`}
                style={{ aspectRatio: `${width}/${calculatedHeight}` }}
            >
                <svg className="w-16 h-16 text-content-lighter" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </div>
        );
    }

    return (
        <div className="relative" style={{ aspectRatio: `${width}/${calculatedHeight}` }}>
            {/* Loading skeleton */}
            {!imageLoaded && (
                <div className="absolute inset-0 bg-surface-alt animate-pulse" />
            )}
            
            <img 
                src={imageSrc}
                alt={alt}
                width={width}
                height={calculatedHeight}
                loading={loading}
                decoding="async"
                sizes={sizes}
                onLoad={handleLoad}
                onError={handleError}
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                    imageLoaded ? 'opacity-100' : 'opacity-0'
                } ${className}`}
            />
        </div>
    );
}
