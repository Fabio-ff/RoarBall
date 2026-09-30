import { defineConfig } from 'vitest/config';

// Default environment is node (the simulation never touches the DOM).
// DOM tests opt in with a `// @vitest-environment jsdom` comment at the top of the file.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
