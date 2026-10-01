import { defineConfig } from 'vitest/config';

/** `npm run balance`: the on-demand AI-vs-AI report (spec C.7); minutes, not for CI. */
export default defineConfig({
  test: {
    include: ['tests/balance/**/*.balance.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
  },
});
