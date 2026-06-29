const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, '.eas', 'generated');

function looksLikeServiceFile(value) {
  return value.startsWith('{') || value.startsWith('<') || value.startsWith('bplist');
}

function unwrapQuoted(value) {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function decodeBase64IfNeeded(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  const unquoted = unwrapQuoted(trimmed);
  if (looksLikeServiceFile(unquoted)) {
    return unquoted;
  }

  try {
    const decoded = Buffer.from(unquoted, 'base64').toString('utf8').trim();
    const decodedUnquoted = unwrapQuoted(decoded);
    if (looksLikeServiceFile(decodedUnquoted)) {
      return decodedUnquoted;
    }
  } catch {}

  return unquoted;
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

  console.log(`[eas-google-services] ${envName} is set (${String(raw).length} chars).`);
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
  console.warn('[eas-google-services] GOOGLE_SERVICES_JSON was not available; continuing without a generated Android service file.');
}

if (process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PLATFORM === 'ios' && !wroteIos) {
  console.warn('[eas-google-services] GOOGLE_SERVICE_INFO_PLIST was not available; continuing without a generated iOS service file.');
}
