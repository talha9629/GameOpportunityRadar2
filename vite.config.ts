import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset URLs keep the same build deployable on GitHub Pages,
  // Render, Cloudflare Pages, or any static host without host-specific code.
  base: './',
  plugins: [react()],
  build: { sourcemap: true },
});
