// apps/backend/bootstrap/firebaseAdmin.js
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'mytutorapp-d3c91';

function getCredential() {
  // 1) JSON string in env (safe for CI)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    return admin.credential.cert(json);
  }
  // 2) Local file for dev
  try {
    const p =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      path.join(
        process.cwd(),
        'apps',
        'backend',
        'bootstrap',
        'serviceAccount.json',
      );
    const json = JSON.parse(readFileSync(p, 'utf8'));
    return admin.credential.cert(json);
  } catch (e) {
    // 3) Fall back to ADC if you really want, but ADC needs env vars (see Option B)
    return admin.credential.applicationDefault();
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: getCredential(),
    projectId: PROJECT_ID, // 👈 ensures project id is known even if ADC lacks it
  });
  console.log(
    '[firebaseAdmin] initialized with projectId:',
    admin.app().options.projectId,
  );
}

export { admin };
