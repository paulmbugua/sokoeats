// apps/mobile/app.config.js

export default function expoConfig({ config }) {
  /**
   * IMPORTANT:
   * - Do NOT import 'dotenv/config' here.
   * - For EAS Update + EAS Build consistency, use EAS Environment Variables and run:
   *     eas update --branch production --environment production ...
   */

  // App environment (set this in EAS env vars)
  // development | preview | production
  const appEnv =
    process.env.EXPO_PUBLIC_APP_ENV ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  const isProduction = appEnv === 'production';
  const isDevClient = process.env.EXPO_DEV_CLIENT === 'true';

  // Enable native Google Sign-In plugin deterministically:
  // - ON in production (builds + updates)
  // - ON in dev-client builds
  const enableGooglePlugin = isProduction || isDevClient;

  // ─────────────────────────────────────────────────────────
  // Multi-backend catalog (deterministic via EXPO_PUBLIC vars)
  // ─────────────────────────────────────────────────────────
  const BACKENDS = {
    androidEmu: 'http://10.0.2.2:4000',
    iosSim: 'http://localhost:4000',
    hotspot: 'http://10.254.198.47:4000',
    lan1: process.env.EXPO_PUBLIC_LAN_BACKEND_URL || 'http://192.168.137.1:4000',
    prod: process.env.EXPO_PUBLIC_PROD_BACKEND_URL || 'https://server.daybreaklearner.com',
  };

  // In production ALWAYS default to prod.
  // In dev/preview you can override with EXPO_PUBLIC_DEFAULT_BACKEND (e.g. hotspot, lan1, androidEmu, iosSim, prod)
  const DEFAULT_BACKEND = isProduction
    ? 'prod'
    : process.env.EXPO_PUBLIC_DEFAULT_BACKEND || 'hotspot';

  // Single resolved URL the app can use
  const RESOLVED_BACKEND_URL = BACKENDS[DEFAULT_BACKEND] || BACKENDS.prod;

  // Allow cleartext ONLY when resolved backend is http://
  const allowHttp = String(RESOLVED_BACKEND_URL || '').startsWith('http://');

  return {
    ...config,

    name: 'DayBreak',
    slug: 'funzasasa',
    version: '1.0.6',
    scheme: 'daybreak',

    runtimeVersion: { policy: 'appVersion' },
    userInterfaceStyle: 'automatic',

    // Expo New Architecture flag belongs in app config
    newArchEnabled: true,

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

      // Let EAS manage versionCode when using eas.json:
      // cli.appVersionSource = "remote" + production.autoIncrement = true

      permissions: [
        'INTERNET',
        'CAMERA',
        'RECORD_AUDIO',
        'POST_NOTIFICATIONS',
        'VIBRATE',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'MODIFY_AUDIO_SETTINGS',
      ],

      googleServicesFile: './google-services.json',

      notification: {
        icon: './assets/notification-icon.png',
        color: '#FF6B00',
        defaultChannel: 'default',
      },

      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon-foreground.png',
        monochromeImage: './assets/adaptive-icon-monochrome.png',
        backgroundColor: '#FFFFFF',
      },

      // Deep link: daybreak://paystack/callback
      intentFilters: [
        {
          action: 'VIEW',
          category: ['BROWSABLE', 'DEFAULT'],
          data: [
            {
              scheme: 'daybreak',
              host: 'paystack',
              pathPrefix: '/callback',
            },
          ],
        },
      ],
    },

    ios: {
      ...config.ios,
      bundleIdentifier: 'com.paulmbugua2.mytutorapp',

      // Let EAS manage buildNumber when using eas.json:
      // cli.appVersionSource = "remote" + production.autoIncrement = true

      infoPlist: {
        ...(config?.ios?.infoPlist ?? {}),
        UIBackgroundModes: [
          ...new Set([...(config?.ios?.infoPlist?.UIBackgroundModes ?? []), 'audio']),
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
      'expo-router',

      ['expo-system-ui', { lightBackgroundColor: '#FFFFFF', darkBackgroundColor: '#000000' }],
      [
        'expo-splash-screen',
        {
          image: './assets/splash.png',
          resizeMode: 'contain',
          backgroundColor: '#000000',
        },
      ],

      'expo-notifications',
      'expo-web-browser',

      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'Allow $(PRODUCT_NAME) to use your location.',
        },
      ],

      'expo-asset',
      'expo-audio',
      'expo-video',

      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: allowHttp,
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            javaVersion: 17,
          },
          ios: {
            deploymentTarget: '15.1',
          },
        },
      ],

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

      // Environment + resolved backend for the app runtime
      EXPO_PUBLIC_APP_ENV: appEnv,
      EXPO_PUBLIC_BACKEND_URL: RESOLVED_BACKEND_URL,
      EXPO_PUBLIC_PROD_BACKEND_URL: BACKENDS.prod,

      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_REVERSED_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_REVERSED_CLIENT_ID,

      // Optional if you use it elsewhere
      EXPO_PUBLIC_EAS_PROJECT_ID:
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '015ecf54-6bf2-4727-9283-1525689ccade',

      eas: { projectId: '015ecf54-6bf2-4727-9283-1525689ccade' },

      BACKENDS,
      DEFAULT_BACKEND,
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
