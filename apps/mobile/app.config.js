export default {
  expo: {
    name: 'Sokoeats',
    slug: 'sokoeats',
    scheme: 'sokoeats',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    plugins: ['expo-web-browser'],
    runtimeVersion: { policy: 'appVersion' },
    updates: { url: 'https://u.expo.dev/53ff8952-ff52-45f2-b580-73e42582bcbe' },
    splash: {
      image: './assets/logo.png',
      resizeMode: 'contain',
      backgroundColor: '#10231d'
    },
    ios: { bundleIdentifier: 'com.paulmbugua2.sokoeats', supportsTablet: true },
    android: {
      package: 'com.paulmbugua2.sokoeats',
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon-foreground.png',
        backgroundColor: '#10231d'
      }
    },
    extra: {
      EXPO_PUBLIC_BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL || 'http://10.0.2.2:4005',
      eas: { projectId: '53ff8952-ff52-45f2-b580-73e42582bcbe' }
    }
  }
};

