const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, '.eas', 'generated');

function decodeBase64IfNeeded(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{') || trimmed.startsWith('<') || trimmed.startsWith('bplist')) {
    return trimmed;
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{') || decoded.startsWith('<') || decoded.startsWith('bplist')) {
      return decoded;
    }
  } catch {}

  return trimmed;
}

function normalizeJson(value, envName) {
  const decoded = decodeBase64IfNeeded(value).replace(/\\n/g, '\n');
  try {
    return `${JSON.stringify(JSON.parse(decoded), null, 2)}\n`;
  } catch (error) {
    throw new Error(`${envName} is not valid JSON: ${error.message}`);
  }
}

function normalizePlist(value) {
  return `${decodeBase64IfNeeded(value).replace(/\\n/g, '\n').trim()}\n`;
}

function writeSecretFile({ envName, targetFile, normalize }) {
  const raw = process.env[envName];
  if (!raw) {
    console.log(`[eas-google-services] ${envName} is not set; skipping ${targetFile}.`);
    return false;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const content = normalize(raw, envName);
  fs.writeFileSync(targetFile, content, { encoding: 'utf8', mode: 0o600 });
  console.log(`[eas-google-services] Wrote ${path.relative(projectRoot, targetFile)} from ${envName}.`);
  return true;
}

const wroteAndroid = writeSecretFile({
  envName: 'GOOGLE_SERVICES_JSON',
  targetFile: path.join(outputDir, 'google-services.json'),
  normalize: normalizeJson,
});

const wroteIos = writeSecretFile({
  envName: 'GOOGLE_SERVICE_INFO_PLIST',
  targetFile: path.join(outputDir, 'GoogleService-Info.plist'),
  normalize: normalizePlist,
});

if (process.env.EAS_BUILD === 'true' && !wroteAndroid) {
  throw new Error('GOOGLE_SERVICES_JSON is required for EAS Android builds.');
}

if (process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PLATFORM === 'ios' && !wroteIos) {
  throw new Error('GOOGLE_SERVICE_INFO_PLIST is required for EAS iOS builds.');
}
