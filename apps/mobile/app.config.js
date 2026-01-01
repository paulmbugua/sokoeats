// apps/mobile/app.config.js
import 'dotenv/config';

export default function expoConfig({ config }) {
  const isEAS = process.env.EAS_BUILD === 'true';
  const isDev = process.env.NODE_ENV !== 'production' && !isEAS;
  const isDevClient = process.env.EXPO_DEV_CLIENT === 'true';
  const enableGooglePlugin = isEAS || isDevClient;

  // ─────────────────────────────────────────────────────────
  // Multi-backend catalog
  // ─────────────────────────────────────────────────────────
  const BACKENDS = {
    androidEmu: 'http://10.0.2.2:4000',
    iosSim: 'http://localhost:4000',
    hotspot: 'http://10.254.198.47:4000',
    lan1: process.env.EXPO_PUBLIC_BACKEND_URL || 'http://192.168.137.1:4000',
    prod: process.env.EXPO_PUBLIC_PROD_BACKEND_URL || 'https://server.daybreaklearner.com',
  };

  // ✅ dev can switch, but EAS/prod should default to prod
  const DEFAULT_BACKEND = isDev ? (process.env.BACKEND || 'hotspot') : 'prod';

  // ✅ single “baseUrl” the app can use
  const RESOLVED_BACKEND_URL = BACKENDS[DEFAULT_BACKEND] || BACKENDS.prod;

  return {
    ...config,
    name: 'DayBreak',
    slug: 'funzasasa',
    version: '1.0.0',
    scheme: 'daybreak',
    runtimeVersion: { policy: 'appVersion' },
    userInterfaceStyle: 'automatic',

    // paths relative to apps/mobile/
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

      permissions: ['INTERNET', 'CAMERA', 'RECORD_AUDIO', 'POST_NOTIFICATIONS', 'VIBRATE'],

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
      buildNumber: '1.0.0',
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
            usesCleartextTraffic: isDev,
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,

            compileSdkVersion: 35,
            targetSdkVersion: 35,
            kotlinVersion: '2.0.21',
           
            javaVersion: 17,
            newArchEnabled: true,
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

      // ✅ in prod, this becomes https://server.daybreaklearner.com
      EXPO_PUBLIC_BACKEND_URL: RESOLVED_BACKEND_URL,
      EXPO_PUBLIC_PROD_BACKEND_URL: BACKENDS.prod,

      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_REVERSED_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_REVERSED_CLIENT_ID,

      EXPO_PUBLIC_EAS_PROJECT_ID: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,

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
