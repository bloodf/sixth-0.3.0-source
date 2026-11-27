// Builds one self-contained HTML file: npx vite build -c vite.single.ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({
  plugins: [preact(), viteSingleFile()],
  base: './',
  worker: { format: 'iife' },
  build: { target: 'es2022', outDir: 'dist-single', assetsInlineLimit: 1e8, chunkSizeWarningLimit: 14000, reportCompressedSize: false },
});
