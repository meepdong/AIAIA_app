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
]);
