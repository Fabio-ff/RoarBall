import { defineConfig } from 'vite';

// BASE_PATH is set by the Pages deploy workflow (e.g. "/RoarBall/"); local dev uses "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
    // Three.js with GLTFLoader and SkeletonUtils is ~630 kB minified; the app chunk stays far below this.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Vite 8 bundles with Rolldown: Three.js gets its own long-cacheable chunk.
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
  },
});
