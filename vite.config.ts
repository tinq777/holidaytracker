import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' keeps the build portable: works at a domain root or a GitHub Pages sub-path.
// `--mode single` builds a one-file preview without the service worker.
const pwaStub = { name: 'pwa-stub', resolveId: (id: string) => (id === 'virtual:pwa-register' ? id : null), load: (id: string) => (id === 'virtual:pwa-register' ? 'export function registerSW(){}' : null) };

export default defineConfig(({ mode }) => ({
  base: './',
  build: mode === 'single' ? { outDir: 'dist-single', assetsInlineLimit: 100000000, cssCodeSplit: false } : {},
  plugins: mode === 'single' ? [react(), pwaStub] : [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
