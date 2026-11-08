import { defineConfig } from 'vite';

// `base: './'` keeps every asset path relative, so the built site works from
// any sub-path (e.g. GitHub Pages at /world-history/) or straight from disk.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2500 },
});
