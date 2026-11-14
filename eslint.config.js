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
    // Deno Edge Functions: jsr:/npm: specifiers that Node's import resolver cannot follow.
    // Only that one rule is off; everything else is still linted. Tested by `deno test`.
    files: ['supabase/functions/**'],
    rules: { 'import/no-unresolved': 'off' },
  },
]);
