/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

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
  // Which build this is (settings shows it): the commit on CI, "dev" otherwise, and the day it was built.
  // The version (package.json, kept in step with versionName in android/app/build.gradle) goes in feedback mails from the web.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD__: JSON.stringify(`${(process.env.GITHUB_SHA ?? 'dev').slice(0, 7)} · ${new Date().toISOString().slice(0, 10)}`),
  },
  // The fairness tests fly whole levels for many seeds: slow on a busy machine.
  test: { testTimeout: 30000 },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800, // three.js alone is ~500 kB
    rollupOptions: {
      output: {
        // three.js in its own file: it rarely changes, so it stays cached across game updates.
        manualChunks: (id: string) => (id.includes('node_modules/three/') ? 'three' : undefined),
      },
    },
  },
}));
