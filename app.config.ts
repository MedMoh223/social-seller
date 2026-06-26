import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'social-seller',
  slug: 'social-seller',
  version: '1.0.0',
  scheme: 'socialseller',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    package: 'com.djiguitech.socialseller',
    softwareKeyboardLayoutMode: 'pan',
    // Use EAS secret file in CI, fallback to local file in dev
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-web-browser',
    'expo-notifications',
    'expo-updates',
  ],
  updates: {
    url: 'https://u.expo.dev/022930f8-8d39-4233-8434-be915a87b656',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  extra: {
    router: {},
    eas: {
      projectId: '022930f8-8d39-4233-8434-be915a87b656',
    },
  },
  owner: 'djiguitech',
});
