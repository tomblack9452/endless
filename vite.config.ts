import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// `npm run dev` serves plain HTTP on 5190. `npm run dev:https` serves HTTPS on
// 5191 with a self-signed certificate, which phones need before they'll give
// a web page motion sensor (tilt) data.
export default defineConfig(({ mode }) => ({
  // Relative base so the build works from any path (GitHub Pages, Capacitor webview).
  base: './',
  plugins: mode === 'https' ? [basicSsl()] : [],
  server: {
    host: true,
    port: mode === 'https' ? 5191 : 5190,
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800, // three.js alone is ~500 kB
  },
}));
