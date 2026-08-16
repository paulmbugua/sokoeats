const ANDROID_PACKAGE = 'com.paulmbugua2.sokoeats';
const IOS_BUNDLE_ID = 'com.paulmbugua.sokoeats';

function parseVersion(value = '0.0.0') {
  return String(value)
    .split('.')
    .map((part) => Number.parseInt(part.replace(/\D/g, ''), 10) || 0)
    .slice(0, 3);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) > (b[index] || 0)) return 1;
    if ((a[index] || 0) < (b[index] || 0)) return -1;
  }
  return 0;
}

function boolEnv(name) {
  return ['1', 'true', 'yes', 'required', 'force'].includes(String(process.env[name] || '').toLowerCase());
}

function platformConfig(platform) {
  const isIos = platform === 'ios';
  const prefix = isIos ? 'IOS' : 'ANDROID';
  const latestVersion = process.env[`SOKOEATS_${prefix}_LATEST_VERSION`] || process.env.SOKOEATS_LATEST_VERSION || '1.0.0';
  const minimumVersion = process.env[`SOKOEATS_${prefix}_MIN_VERSION`] || process.env.SOKOEATS_MIN_VERSION || '1.0.0';
  const forced = boolEnv(`SOKOEATS_${prefix}_FORCE_UPDATE`) || boolEnv('SOKOEATS_FORCE_NATIVE_UPDATE');
  const storeUrl =
    process.env[`SOKOEATS_${prefix}_STORE_URL`] ||
    process.env.SOKOEATS_STORE_URL ||
    (isIos
      ? `https://apps.apple.com/app/id${process.env.SOKOEATS_IOS_APP_ID || IOS_BUNDLE_ID}`
      : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`);

  return { latestVersion, minimumVersion, forced, storeUrl };
}

export async function mobileVersion(req, res, next) {
  try {
    const platform = String(req.query.platform || 'android').toLowerCase() === 'ios' ? 'ios' : 'android';
    const currentVersion = String(req.query.version || req.query.currentVersion || '0.0.0');
    const config = platformConfig(platform);
    const newerVersionAvailable = compareVersions(currentVersion, config.latestVersion) < 0;
    const belowMinimum = compareVersions(currentVersion, config.minimumVersion) < 0;
    const required = config.forced || belowMinimum;
    const available = required || newerVersionAvailable;

    res.json({
      update: {
        platform,
        currentVersion,
        latestVersion: config.latestVersion,
        minimumVersion: config.minimumVersion,
        available,
        required,
        storeUrl: config.storeUrl,
        title: required ? 'SokoEats update required' : 'SokoEats update available',
        message: required
          ? 'Install the latest SokoEats version from the store to keep ordering and payments secure.'
          : 'A newer SokoEats app version is available in the store.',
      },
    });
  } catch (err) {
    next(err);
  }
}
