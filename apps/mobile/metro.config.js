const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo configures Metro for pnpm/yarn workspaces automatically (watch folders, hoisted modules).
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
