import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri drives the dev server, so the port is fixed and must not drift.
const DEV_PORT = 1420;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    watch: {
      // Rust sources are watched by cargo, not Vite.
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    // Matches the WebKit version Tauri ships against on our minimum targets.
    target: 'safari15',
    sourcemap: true,
  },
});
