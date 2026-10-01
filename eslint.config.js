import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const presentationDirs = [
  '**/render/**',
  '**/ui/**',
  '**/input/**',
  '**/audio/**',
  '**/app/**',
  '**/render',
  '**/ui',
  '**/input',
  '**/audio',
  '**/app',
];
const threeModules = ['three', 'three/**'];

export default defineConfig([
  { ignores: ['dist/**', 'node_modules/**', '.superpowers/**', '.claude/worktrees/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js}'],
    ignores: ['src/sim/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Spec §3: the simulation is pure TypeScript and never depends on presentation, input or Three.js.
    files: ['src/sim/**/*.ts'],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: threeModules, message: 'src/sim must not depend on Three.js' },
            {
              group: presentationDirs,
              message: 'src/sim must not import render/ui/input/audio/app',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'location',
          'localStorage',
          'fetch',
          'globalThis',
          'self',
          'performance',
          'Date',
          'setTimeout',
          'setInterval',
          'clearTimeout',
          'clearInterval',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'queueMicrotask',
        ].map((name) => ({
          name,
          message: `${name} is not available to the simulation (spec §3: no DOM, no timers, no wall clock)`,
        })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/sim/rng.ts' },
        { object: 'Date', property: 'now', message: 'The simulation must not read the wall clock' },
      ],
    },
  },
  {
    // Spec §3: content may only import types from sim.
    files: ['src/content/**/*.ts'],
    rules: {
      // Hooks run inside tick(): randomness only through ctx.rng (spec A.7).
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Content draws randomness through ctx.rng (spec A.7)',
        },
        { object: 'Date', property: 'now', message: 'Content must not read the wall clock' },
        {
          object: 'performance',
          property: 'now',
          message: 'Content must not read the wall clock',
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['Date', 'performance'].map((name) => ({
          name,
          message: `${name} is not available to content (hooks run inside tick(): no wall clock)`,
        })),
      ],
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: threeModules, message: 'src/content must not depend on Three.js' },
            { group: presentationDirs, message: 'src/content may only import from src/sim' },
            {
              group: ['**/sim', '**/sim/**'],
              allowTypeImports: true,
              message: 'src/content may only import types from src/sim',
            },
          ],
        },
      ],
    },
  },
]);
