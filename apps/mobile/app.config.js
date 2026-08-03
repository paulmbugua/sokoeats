export default {
  expo: {
    name: 'Sokoeats',
    slug: 'sokoeats',
    scheme: 'sokoeats',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/logo.png',
      resizeMode: 'contain',
      backgroundColor: '#10231d'
    },
    ios: { bundleIdentifier: 'com.paulmbugua.sokoeats', supportsTablet: true },
    android: {
      package: 'com.paulmbugua.sokoeats',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon-foreground.png',
        backgroundColor: '#10231d'
      }
    },
    extra: {
      EXPO_PUBLIC_BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL || 'http://10.0.2.2:4005'
    }
  }
};
