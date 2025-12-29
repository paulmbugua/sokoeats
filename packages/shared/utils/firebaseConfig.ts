/* eslint-disable no-console */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

type AnyEnv = Record<string, any>;

const viteEnv: AnyEnv | undefined =
  typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;

// ✅ Expo ONLY inlines env vars when keys are literal
const expoApiKey =
  (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_FIREBASE_API_KEY) || '';
const expoProjectId =
  (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) ||
  '';
const expoAppId =
  (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_FIREBASE_APP_ID) || '';
const expoSenderId =
  (typeof process !== 'undefined' &&
    process.env &&
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) ||
  '';
const expoAuthDomain =
  (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN) ||
  '';
const expoBucket =
  (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET) ||
  '';

// Web (Vite) vars
const apiKey = viteEnv?.VITE_FIREBASE_API_KEY ?? expoApiKey;
const projectId = viteEnv?.VITE_FIREBASE_PROJECT_ID ?? expoProjectId ?? 'mytutorapp-d3c91';
const appId = viteEnv?.VITE_FIREBASE_APP_ID ?? expoAppId;
const messagingSenderId = viteEnv?.VITE_FIREBASE_MESSAGING_SENDER_ID ?? expoSenderId;
const authDomain =
  (viteEnv?.VITE_FIREBASE_AUTH_DOMAIN ?? expoAuthDomain ?? `${projectId}.firebaseapp.com`).trim();
const storageBucket =
  viteEnv?.VITE_FIREBASE_STORAGE_BUCKET ??
  expoBucket ??
  `${projectId}.appspot.com`;

  // ✅ Add it here
try {
  console.log(
    '[firebase] apiKey prefix',
    apiKey ? `${apiKey.slice(0, 8)}… (len=${apiKey.length})` : 'EMPTY'
  );
  console.log('[firebase] projectId', projectId);
  console.log('[firebase] authDomain', authDomain);
} catch {}

if (!apiKey) {
  // Don’t hard-crash the whole app; log clearly.
  console.error(
    '[firebase] Missing apiKey. Ensure EXPO_PUBLIC_FIREBASE_API_KEY is set for this EAS build profile.'
  );
}

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  appId,
  messagingSenderId,
  storageBucket,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Wrap Auth init so a config issue doesn’t abort the app in release
let auth: ReturnType<typeof getAuth> | null = null;
try {
  auth = getAuth(app);
} catch (e) {
  console.error('[firebase] getAuth failed:', e);
}

export { auth };
export const googleProvider = new GoogleAuthProvider();
export const provider = googleProvider;
