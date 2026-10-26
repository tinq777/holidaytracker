import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// Version shown in More: package.json version (bumped each deploy) + build time in Sydney.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const built = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// base './' keeps the build portable: works at a domain root or a GitHub Pages sub-path.
// `--mode single` builds a one-file preview without the service worker.
const pwaStub = { name: 'pwa-stub', resolveId: (id: string) => (id === 'virtual:pwa-register' ? id : null), load: (id: string) => (id === 'virtual:pwa-register' ? 'export function registerSW(){}' : null) };

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version.replace(/\.0$/, '')), __APP_BUILT__: JSON.stringify(built) },
  build: mode === 'single' ? { outDir: 'dist-single', assetsInlineLimit: 100000000, cssCodeSplit: false } : {},
  plugins: mode === 'single' ? [react(), pwaStub] : [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Holiday Tracker',
        short_name: 'Holidays',
        description: 'Personal, offline-first holiday budget and trip companion.',
        theme_color: '#123B5C',
        background_color: '#EEF1F4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        navigateFallback: 'index.html'
      }
    })
  ]
}));
