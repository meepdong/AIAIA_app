const { defineConfig, globalIgnores } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.expo/**',
    '**/android/**',
    '**/ios/**',
    '**/coverage/**',
    '.worktrees/**',
    // Deno Edge Functions: jsr:/npm: specifiers; checked by `deno test` (fn:test) and Prettier.
    'supabase/functions/**',
    'packages/shared/src/db.types.ts',
  ]),
  expo,
  prettier,
  {
    // Resolve the app's "@/" alias from its own tsconfig.
    settings: {
      'import/resolver': {
        typescript: { project: ['apps/mobile/tsconfig.json'] },
      },
    },
  },
  {
    // All server access goes through packages/api (via useApi). Screens and features never touch
    // the Supabase client, so a provider switch stays a one-package change. Allowed: src/lib/**,
    // packages/api/** and the one file below.
    files: ['apps/mobile/app/**/*.{ts,tsx}', 'apps/mobile/src/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/lib/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*', '**/lib/supabase'],
              message: 'Use useApi() from @/features/auth/useApi (packages/api) instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/mobile/src/features/auth/useApi.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
