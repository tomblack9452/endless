import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build also works when loaded from a Capacitor webview.
  base: './',
  server: {
    host: true,
    port: 5190,
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800, // three.js alone is ~500 kB

  },
});
