import firebaseAdmin from 'firebase-admin';

function parseServiceAccount() {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    '';
  const b64 =
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
    process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 ||
    '';

  try {
    if (raw.trim()) return JSON.parse(raw);
    if (b64.trim()) return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch (error) {
    console.warn('[firebase-admin] service account parse failed', error?.message || error);
  }

  return null;
}

function initAdmin() {
  if (firebaseAdmin.apps.length) return firebaseAdmin;

  const serviceAccount = parseServiceAccount();
  if (serviceAccount) {
    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount),
    });
    return firebaseAdmin;
  }

  firebaseAdmin.initializeApp();
  return firebaseAdmin;
}

export const admin = initAdmin();
export default admin;
