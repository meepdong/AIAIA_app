/** @type {import('jest').Config} */
module.exports = {
  // On a cold transform cache (always the case in CI) the first test that renders a native
  // Modal takes more than Jest's 5 s default just to load. Assertions are unaffected.
  testTimeout: 30000,
  projects: [
    {
      displayName: 'shared',
      preset: 'jest-expo',
      rootDir: 'packages/shared',
    },
    {
      displayName: 'api',
      preset: 'jest-expo',
      rootDir: 'packages/api',
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      rootDir: 'packages/ui',
      // TanStack Table v9 ships ESM only; jest-expo's default pattern does not transform it.
      transformIgnorePatterns: [
        '/node_modules/(?!(.pnpm|@tanstack|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation))',
        '/node_modules/react-native-reanimated/plugin/',
        '/node_modules/@react-native/babel-preset/',
      ],
    },
    {
      displayName: 'mobile',
      preset: 'jest-expo',
      rootDir: 'apps/mobile',
      // The app's "@/" alias (see apps/mobile/tsconfig.json).
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      // @shopify/flash-list (directory list) ships ESM; jest-expo's default pattern skips it.
      transformIgnorePatterns: [
        '/node_modules/(?!(.pnpm|@shopify|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation))',
        '/node_modules/react-native-reanimated/plugin/',
        '/node_modules/@react-native/babel-preset/',
      ],
    },
  ],
};
