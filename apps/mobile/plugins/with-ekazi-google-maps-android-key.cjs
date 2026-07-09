const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

const GOOGLE_MAPS_ANDROID_META_DATA = 'com.google.android.geo.API_KEY';

module.exports = function withEkaziGoogleMapsAndroidKey(config, props = {}) {
  const apiKey = props.apiKey;
  if (!apiKey) return config;

  return withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      GOOGLE_MAPS_ANDROID_META_DATA,
      apiKey,
    );
    return config;
  });
};
