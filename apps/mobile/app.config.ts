import type { ExpoConfig } from 'expo/config';

type Variant = 'development' | 'staging' | 'production';

// APP_VARIANT picks the app name and Android package. Unset means a local development build.
function readVariant(): Variant {
  const raw = process.env.APP_VARIANT;
  if (raw === 'staging' || raw === 'production') return raw;
  return 'development';
}

const VARIANTS: Record<Variant, { name: string; androidPackage: string }> = {
  development: { name: 'AIAIA Youth (Dev)', androidPackage: 'org.aiaia.youth.dev' },
  staging: { name: 'AIAIA Youth (Staging)', androidPackage: 'org.aiaia.youth.staging' },
  production: { name: 'AIAIA Youth', androidPackage: 'org.aiaia.youth' },
};

const variant = VARIANTS[readVariant()];

const config: ExpoConfig = {
  name: variant.name,
  slug: 'aiaia-youth',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'aiaiayouth',
  userInterfaceStyle: 'automatic',
  android: {
    package: variant.androidPackage,
    // Minimum set. Feature briefs add what they need (camera, notifications) next to their code.
    permissions: ['android.permission.INTERNET'],
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  web: {
    output: 'single',
    bundler: 'metro',
    favicon: './assets/images/favicon.png',
  },
  extra: {
    // Ed25519 public key (base64url) that verifies delegate passes offline. Set by
    // `node scripts/gen-pass-keys.mjs`; empty means scanners refuse every pass (fail closed).
    passPublicKey: '',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    [
      'expo-camera',
      {
        cameraPermission: 'Allow AIAIA to use the camera to scan delegate passes at check-in.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
  ],
};

export default config;
