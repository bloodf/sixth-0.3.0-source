import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
export default defineConfig({
  plugins: [preact()],
  base: './',
  worker: { format: 'iife' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4200, sourcemap: false, rollupOptions: { input: { main: 'index.html' } } },
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
});
