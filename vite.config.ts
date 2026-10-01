import { defineConfig } from 'vite';

// BASE_PATH is set by the Pages deploy workflow (e.g. "/RoarBall/"); local dev uses "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022', sourcemap: 'hidden' },
});
