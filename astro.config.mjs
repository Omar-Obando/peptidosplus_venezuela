import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  adapter: vercel(),
  integrations: [mdx(), sitemap(), react()],
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
    remotePatterns: [
      
      {
        protocol: 'https',
        hostname: '*.wp.com',
      },
      {
        protocol: 'https',
        hostname: 'i0.wp.com',
      },
      {
        protocol: 'https',
        hostname: 'i1.wp.com',
      },
      {
        protocol: 'https',
        hostname: 'i2.wp.com',
      },
      {
        protocol: 'https',
        hostname: '*.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: '*.imgix.net',
      },
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
    ],
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      headers: {
        'Content-Security-Policy': "frame-ancestors *",
      },
      allowedHosts: ['localhost', '.fly.dev'],
      cors: { origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ },
      hmr: {
        clientPort: 443,
        protocol: 'wss',
      },
      watch: {
        ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.output/**'],
      },
    },
  },
});
