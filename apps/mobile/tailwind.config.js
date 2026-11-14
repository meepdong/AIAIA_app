const uiTokens = require('../../packages/ui/src/tokens.json');

// Colour roles become `bg-primary`, `text-textMuted` ... (light) and `dark:bg-primary-dark` ... (dark).
// Source of truth is packages/ui/src/tokens.json, shared with the TS `tokens` object.
const colors = {};
for (const [role, value] of Object.entries(uiTokens.colors.light)) {
  colors[role] = value;
  colors[`${role}-dark`] = uiTokens.colors.dark[role];
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // NativeWind 4 on web calls colorScheme.set('system') at startup, which throws under the
  // default 'media' mode. With 'class', 'system' still follows the device/browser setting.
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      spacing: Object.fromEntries(
        Object.entries(uiTokens.spacing).map(([k, v]) => [`ds-${k}`, `${v}px`]),
      ),
      borderRadius: Object.fromEntries(
        Object.entries(uiTokens.radius).map(([k, v]) => [`ds-${k}`, `${v}px`]),
      ),
      fontSize: Object.fromEntries(
        Object.entries(uiTokens.fontSize).map(([k, v]) => [
          k,
          [`${v.size}px`, { lineHeight: `${v.lineHeight}px` }],
        ]),
      ),
    },
  },
  plugins: [],
};
