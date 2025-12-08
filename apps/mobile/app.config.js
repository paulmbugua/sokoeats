// apps/mobile/app.config.js
import 'dotenv/config';

export default function expoConfig({ config }) {
  const isEAS = process.env.EAS_BUILD === 'true';
  const isDev = process.env.NODE_ENV !== 'production' && !isEAS;
  const isDevClient = process.env.EXPO_DEV_CLIENT === 'true';
  const enableGooglePlugin = isEAS || isDevClient; // include plugin for EAS builds or Dev Client builds

  // ─────────────────────────────────────────────────────────
  // Multi-backend catalog (includes your mobile hotspot IP)
  // Select one with env: BACKEND=hotspot  (or others below)
  // ─────────────────────────────────────────────────────────
  const BACKENDS = {
    androidEmu: 'http://10.0.2.2:4000', // Android emulator
    iosSim: 'http://localhost:4000', // iOS simulator
    hotspot: 'http://10.254.198.47:4000', // ← your mobile hotspot (IPv4)
    lan1:
      process.env.EXPO_PUBLIC_BACKEND_URL || 'http://192.168.137.1:4000', // optional LAN
    prod:
      process.env.EXPO_PUBLIC_PROD_BACKEND_URL ||
      'https://server.daybreaklearner.com',
  };

  // Pick default via env BACKEND=hotspot | androidEmu | iosSim | lan1 | prod
  const DEFAULT_BACKEND = process.env.BACKEND || 'hotspot';

  return {
    ...config,
    name: 'DayBreak',
    slug: 'funzasasa',
    version: '1.0.0',
    scheme: 'daybreak',
    runtimeVersion: { policy: 'sdkVersion' },
    userInterfaceStyle: 'automatic',

    // paths are relative to apps/mobile/
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#000000',
    },

    assetBundlePatterns: ['**/*'],

    android: {
      ...config.android,
      package: 'com.paulmbugua2.mytutorapp',
      versionCode: 1,

      // Permissions (adjust as needed)
      permissions: [
        'INTERNET',
        'CAMERA',
        'RECORD_AUDIO',
        'POST_NOTIFICATIONS',
        'VIBRATE',
      ],

      googleServicesFile: './google-services.json',

      // Default notification visuals & channel
      notification: {
        icon: './assets/notification-icon.png', // 24x24 transparent PNG
        color: '#FF6B00',
        defaultChannel: 'default',
      },

      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon-foreground.png',
        monochromeImage: './assets/adaptive-icon-monochrome.png',
        backgroundColor: '#FFFFFF',
      },

      // Deep link scheme
      intentFilters: [
        {
          action: 'VIEW',
          category: ['BROWSABLE', 'DEFAULT'],
          data: [{ scheme: 'daybreak' }],
        },
      ],
    },

    ios: {
      ...config.ios,
      bundleIdentifier: 'com.paulmbugua2.mytutorapp',
      buildNumber: '1.0.0',

      // Keep only what the plugin doesn't inject
      infoPlist: {
        ...(config?.ios?.infoPlist ?? {}),
        // Background audio for narration
        UIBackgroundModes: [
          ...new Set([
            ...(config?.ios?.infoPlist?.UIBackgroundModes ?? []),
            'audio',
          ]),
        ],
      },
    },

    web: {
      ...config.web,
      bundler: 'metro',
      output: 'static',
      favicon: './assets/favicon.png',
    },

    plugins: [
      // Routing
      'expo-router',

      // System UI & splash
      [
        'expo-system-ui',
        { lightBackgroundColor: '#FFFFFF', darkBackgroundColor: '#000000' },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/splash.png',
          resizeMode: 'contain',
          backgroundColor: '#000000',
        },
      ],

      // Core features
      'expo-notifications',
      'expo-web-browser',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Allow $(PRODUCT_NAME) to use your location.',
        },
      ],

      // 🔊 Media / assets
      'expo-asset',
      'expo-audio',
      'expo-video',

      // Build properties (pin to avoid prebuild drift)
      [
        'expo-build-properties',
        {
          android: {
            // Networking & optimizations
            usesCleartextTraffic: isDev, // allow http in dev
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,

            // Toolchain/SDK pins
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            kotlinVersion: '2.0.21',
            gradlePluginVersion: '8.10.2',
            javaVersion: 17,
            newArchEnabled: false,
          },
          ios: {
            deploymentTarget: '15.1',
          },
        },
      ],

      // Google Sign-In (include when building native code: EAS or Dev Client)
      enableGooglePlugin && [
        '@react-native-google-signin/google-signin',
        {
          scopes: ['email', 'profile'],
          webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
          offlineAccess: true,
          forceCodeForRefreshToken: true,
          iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
          iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_REVERSED_CLIENT_ID,
        },
      ],
    ].filter(Boolean),

    extra: {
      ...config.extra,

      // Legacy single var (kept for compatibility with your codebase/tools)
      EXPO_PUBLIC_BACKEND_URL:
        process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://10.0.2.2:4000',
      EXPO_PUBLIC_PROD_BACKEND_URL:
        process.env.EXPO_PUBLIC_PROD_BACKEND_URL,

      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
        process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID:
        process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_REVERSED_CLIENT_ID:
        process.env.EXPO_PUBLIC_GOOGLE_REVERSED_CLIENT_ID,

      EXPO_PUBLIC_EAS_PROJECT_ID: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,

      eas: { projectId: '015ecf54-6bf2-4727-9283-1525689ccade' },

      // New: multi-backend support
      BACKENDS,
      DEFAULT_BACKEND: DEFAULT_BACKEND,
    },

    updates: {
      url: 'https://u.expo.dev/015ecf54-6bf2-4727-9283-1525689ccade',
      fallbackToCacheTimeout: 0,
      checkAutomatically: 'ON_LOAD',
    },

    experiments: {
      typedRoutes: true,
      tsconfigPaths: true,
    },
  };
}
