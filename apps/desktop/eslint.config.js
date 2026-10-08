/**
 * ESLint configuration for Team-X desktop app.
 *
 * Uses the new flat config format (ESLint 9+).
 * Configures TypeScript, React, and accessibility rules.
 *
 * Note: Type checking is done separately via `pnpm typecheck`.
 * ESLint focuses on code style, best practices, and common errors.
 *
 * A full uncached run takes under a minute. To see where the time goes, run
 * with ESLint's rule timing on: `TIMING=15 pnpm lint:eslint` (PowerShell:
 * `$env:TIMING=15; pnpm lint:eslint`). import/no-cycle dominated at 94% of
 * two minutes before the import settings below (audit 2026-10-07 P3-1).
 */

import js from '@eslint/js';
import tsESLint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'out/**',
      'node_modules/**',
      'coverage/**',
      '*.tsbuildinfo',
      'src/main/db/migrations/**',
      '**/*.d.ts',
      '.turbo/**',
      'build/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  // Base JavaScript rules
  js.configs.recommended,

  // TypeScript configuration (NO type checking - faster, separate from tsc)
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        Electron: 'readonly',
        NodeJS: 'readonly',
        Console: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsESLint,
    },
    rules: {
      ...tsESLint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'off', // Allow for main process
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-as-const': 'warn',
    },
  },

  // React configuration (renderer process)
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        React: 'readonly',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+
      'react/prop-types': 'off', // Using TypeScript for props validation
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/jsx-no-target-blank': 'warn',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // JSX accessibility
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      'jsx-a11y/anchor-is-valid': 'warn',
    },
  },

  // Import/export rules
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      import: importPlugin,
    },
    // Without a TypeScript parser and resolver, import/* rules could not read
    // a dependency (`./x.js` → x.ts, TS syntax), so import/no-cycle found no
    // cycle while spending ~94% of the lint run walking node_modules
    // (audit 2026-10-07 P3-1). With both, it sees the real graph in seconds.
    settings: {
      'import/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
      'import/extensions': ['.ts', '.tsx', '.js', '.mjs'],
      'import/resolver': {
        typescript: {
          project: [
            './tsconfig.main.json',
            './tsconfig.preload.json',
            './tsconfig.renderer-test.json',
            './tsconfig.e2e.json',
          ],
        },
      },
    },
    rules: {
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          // Keep the order this codebase settled on before imports resolved:
          // workspace packages sort with npm packages, and the renderer's `@/`
          // alias sorts last.
          pathGroups: [
            { pattern: '@team-x/**', group: 'external' },
            { pattern: '@/**', group: 'unknown' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
          distinctGroup: false,
        },
      ],
      'import/no-duplicates': 'warn',
      'import/no-unresolved': 'off', // TypeScript handles this better
      'import/no-cycle': ['warn', { ignoreExternal: true }],
      'import/no-self-import': 'error',
      'import/no-useless-path-segments': 'warn',
    },
  },

  // Main process specific rules
  {
    files: ['src/main/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'error',
    },
  },

  // Test files - more lenient rules
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'e2e/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Config files - more lenient rules
  {
    files: ['*.config.ts', '*.config.js', 'drizzle.config.ts'],
    rules: {
      'import/order': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Preload script specific rules
  {
    files: ['src/preload/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
];
