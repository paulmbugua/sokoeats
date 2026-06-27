// apps/mobile/app.config.js

export default function expoConfig({ config }) {
  const appEnv =
    process.env.EXPO_PUBLIC_APP_ENV ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  const isProduction = appEnv === 'production';
  const isDevClient = process.env.EXPO_DEV_CLIENT === 'true';
  const enableGooglePlugin = isProduction || isDevClient;

  // ─────────────────────────────────────────────────────────
  // ✅ EAS Project (Ekazi)
  // ─────────────────────────────────────────────────────────
  const EAS_PROJECT_ID =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    process.env.EAS_PROJECT_ID ||
    '53179ce6-acfb-43a8-bbe1-f55fee0667f4';

  // ─────────────────────────────────────────────────────────
  // Multi-backend catalog (deterministic via EXPO_PUBLIC vars)
  // ─────────────────────────────────────────────────────────
  const BACKENDS = {
    androidEmu: 'http://10.0.2.2:4000',
    iosSim: 'http://localhost:4000',
    hotspot: 'http://10.254.198.47:4000',
    lan1: process.env.EXPO_PUBLIC_LAN_BACKEND_URL || 'http://192.168.137.1:4000',
    // ✅ Update this when you deploy Ekazi backend
    prod: process.env.EXPO_PUBLIC_PROD_BACKEND_URL || 'https://server.ekazi.app',
  };

  // ✅ Always respect EXPO_PUBLIC_DEFAULT_BACKEND if provided
  const DEFAULT_BACKEND =
    process.env.EXPO_PUBLIC_DEFAULT_BACKEND || (isProduction ? 'prod' : 'hotspot');

  // Single resolved URL the app can use
  const RESOLVED_BACKEND_URL = BACKENDS[DEFAULT_BACKEND] || BACKENDS.prod;

  // Allow cleartext ONLY when resolved backend is http://
  const allowHttp = String(RESOLVED_BACKEND_URL || '').startsWith('http://');
  const usesCleartextTraffic = !isProduction && allowHttp;

  // ─────────────────────────────────────────────────────────
  // Google Sign-In IDs (deterministic defaults)
  // ─────────────────────────────────────────────────────────
  const GOOGLE_WEB_CLIENT_ID =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    '557799973381-ksp83t2vo6fdqufhm0iie06lnb4e8j8v.apps.googleusercontent.com';

  const GOOGLE_IOS_CLIENT_ID =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    '557799973381-g0h98g6vg82oeineeb4t9e67hgosdfrg.apps.googleusercontent.com';

  const GOOGLE_REVERSED_CLIENT_ID =
    process.env.EXPO_PUBLIC_GOOGLE_REVERSED_CLIENT_ID ||
    'com.googleusercontent.apps.557799973381-g0h98g6vg82oeineeb4t9e67hgosdfrg';

  const GOOGLE_ANDROID_CLIENT_ID =
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    '557799973381-97lsoficotiiulhl5st6tf6h723uurpg.apps.googleusercontent.com';

  return {
    ...config,

    owner: 'paulmbugua2',
    name: 'Ekazi',
    slug: 'ekazi',
    version: '1.0.8',
    scheme: 'ekazi',

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
      package: 'com.paulmbugua2.ekazi',

      // ✅ Remove foreground-service media playback permission (injected by some deps)
      blockedPermissions: Array.from(
        new Set([
          ...(config.android?.blockedPermissions ?? []),
          'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
          // If you actually need location later, remove these from blockedPermissions
          'android.permission.ACCESS_COARSE_LOCATION',
          'android.permission.ACCESS_FINE_LOCATION',
        ]),
      ),

      // ✅ Keep only what you need (deps may still add others automatically)
      permissions: ['INTERNET', 'POST_NOTIFICATIONS'],

      // ✅ Prefer env override; fallback file in repo
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',

      notification: {
        icon: './assets/notification-icon.png',
        color: '#16A34A',
        defaultChannel: 'default',
      },

      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon-foreground.png',
        monochromeImage: './assets/adaptive-icon-monochrome.png',
        backgroundColor: '#FFFFFF',
      },

      // Deep link: ekazi://paystack/callback
      intentFilters: [
        {
          action: 'VIEW',
          category: ['BROWSABLE', 'DEFAULT'],
          data: [
            {
              scheme: 'ekazi',
              host: 'paystack',
              pathPrefix: '/callback',
            },
          ],
        },
      ],
    },

    ios: {
      ...config.ios,
      bundleIdentifier: 'com.paulmbugua2.ekazi',

      // ✅ Ensure we do NOT declare background audio playback
      infoPlist: {
        ...(config?.ios?.infoPlist ?? {}),
        UIBackgroundModes: (config?.ios?.infoPlist?.UIBackgroundModes ?? []).filter(
          (m) => m !== 'audio',
        ),
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

      'expo-asset',
      'expo-audio',
      ['expo-video', { supportsBackgroundPlayback: false, supportsPictureInPicture: false }],

      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic,
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
          webClientId: GOOGLE_WEB_CLIENT_ID,
          offlineAccess: true,
          forceCodeForRefreshToken: true,
          iosClientId: GOOGLE_IOS_CLIENT_ID,
          iosUrlScheme: GOOGLE_REVERSED_CLIENT_ID,
        },
      ],
    ].filter(Boolean),

    extra: {
      ...config.extra,

      // Environment + resolved backend for the app runtime
      EXPO_PUBLIC_APP_ENV: appEnv,
      EXPO_PUBLIC_BACKEND_URL: RESOLVED_BACKEND_URL,
      EXPO_PUBLIC_PROD_BACKEND_URL: BACKENDS.prod,

      // ✅ Deterministic Google envs (prevents fingerprint drift)
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: GOOGLE_WEB_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: GOOGLE_IOS_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_REVERSED_CLIENT_ID: GOOGLE_REVERSED_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: GOOGLE_ANDROID_CLIENT_ID,

      // ✅ EAS project (required for builds + OTA updates)
      EXPO_PUBLIC_EAS_PROJECT_ID: EAS_PROJECT_ID,
      eas: { projectId: EAS_PROJECT_ID },

      BACKENDS,
      DEFAULT_BACKEND,
    },

    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      fallbackToCacheTimeout: 0,
      checkAutomatically: 'ON_LOAD',
    },

    experiments: {
      typedRoutes: true,
      tsconfigPaths: true,
    },
  };
}