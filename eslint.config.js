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
  '**/app',
];
const threeModules = ['three', 'three/**'];

export default defineConfig([
  { ignores: ['dist/**', 'node_modules/**', '.superpowers/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Spec §3: the simulation is pure TypeScript and never depends on presentation, input or Three.js.
    files: ['src/sim/**/*.ts'],
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
      'no-restricted-globals': ['error', 'performance'],
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
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: threeModules, message: 'src/content must not depend on Three.js' },
            { group: presentationDirs, message: 'src/content may only import from src/sim' },
          ],
        },
      ],
    },
  },
]);
