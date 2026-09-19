import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import compress from '@playform/compress';
import tailwindcss from '@tailwindcss/vite';

// PhantomWP dev tools (Vite plugins for the IDE inspector).
// Imported lazily so users who eject .phantomwp/ide/ can still build.
let devComponentIdPlugin;
try {
    ({ devComponentIdPlugin } = await import('./.phantomwp/ide/dev-tools.mjs'));
} catch {
    devComponentIdPlugin = () => ({ name: 'phantom-dev-tools-noop', apply: 'serve' });
}

// https://astro.build/config
export default defineConfig({
  site: 'https://ve.peptidosplus.com',
  output: 'server',
  adapter: cloudflare({
    imageService: 'compile',
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [
    mdx(),
    sitemap(),
    react(),
    compress({
      CSS: true,
      HTML: true,
      JavaScript: true,
      Image: false,
      SVG: false,
    }),
  ],
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 've-cms.peptidosplus.com',
      },
      {
        protocol: 'http',
        hostname: 've-cms.peptidosplus.com',
      },
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
    ],
  },
  server: {
    host: true,
    allowedHosts: ['.app.github.dev', '.fly.dev'],
  },
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss(), devComponentIdPlugin()],
    server: {
      headers: {
        'Content-Security-Policy': "frame-ancestors *",
      },
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
